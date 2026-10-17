
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required.");
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

function publicState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.routines) ||
    !state.completions ||
    typeof state.completions !== "object" ||
    Array.isArray(state.completions)
  ) {
    throw new Error("State format is invalid.");
  }

  if (state.routines.length > 1000) {
    throw new Error("Too many routines.");
  }

  const routines = state.routines.map(r => ({
    id: String(r.id || crypto.randomUUID()).slice(0, 100),
    name: String(r.name || "Routine").slice(0, 80),
    category: String(r.category || "Personal").slice(0, 40),
    time: /^\d{2}:\d{2}$/.test(String(r.time || ""))
      ? String(r.time) : "",
    days: Array.isArray(r.days)
      ? [...new Set(r.days.map(Number).filter(
          d => Number.isInteger(d) && d >= 0 && d <= 6
        ))]
      : [0, 1, 2, 3, 4, 5, 6],
    createdAt: String(
      r.createdAt || new Date().toISOString()
    ).slice(0, 40)
  }));

  const completions = {};

  for (const [date, records] of
    Object.entries(state.completions).slice(-5000)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !records ||
      typeof records !== "object" ||
      Array.isArray(records)
    ) continue;

    completions[date] = {};

    for (const [id, value] of Object.entries(records)) {
      if (value === true) {
        completions[date][String(id).slice(0, 100)] = true;
      }
    }
  }

  return {
    version: 3,
    routines,
    completions,
    settings: {
      theme: state.settings?.theme === "dark" ? "dark" : "light",
      notifications: Boolean(state.settings?.notifications)
    },
    createdAt: state.createdAt || new Date().toISOString()
  };
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ message: "Please sign in." });
  }

  try {
    req.user = jwt.verify(match[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Your session expired. Please sign in again."
    });
  }
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "14d" }
  );
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "Daymark API" });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be 8–128 characters."
      });
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [id, email, passwordHash]
    );

    res.status(201).json({
      token: issueToken({ id, email }),
      email,
      state: null
    });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({
        message: "An account with this email already exists. Sign in instead."
      });
    }

    console.error("Registration failed:", e.message);
    res.status(500).json({ message: "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const result = await pool.query(
      `SELECT id, email, password_hash, state
       FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        message: "Email or password is incorrect."
      });
    }

    res.json({
      token: issueToken(user),
      email: user.email,
      state: user.state
    });
  } catch (e) {
    console.error("Login failed:", e.message);
    res.status(500).json({ message: "Could not sign in." });
  }
});

app.get("/api/state", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT state, updated_at FROM users WHERE id = $1",
      [req.user.sub]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Account not found." });
    }

    res.json({
      state: result.rows[0].state,
      updatedAt: result.rows[0].updated_at
    });
  } catch (e) {
    console.error("State read failed:", e.message);
    res.status(500).json({ message: "Could not load saved data." });
  }
});

app.put("/api/state", auth, async (req, res) => {
  let state;

  try {
    state = publicState(req.body?.state);
  } catch (e) {
    return res.status(400).json({
      message: e.message || "Invalid state."
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET state = $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING updated_at`,
      [JSON.stringify(state), req.user.sub]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Account not found." });
    }

    res.json({
      ok: true,
      updatedAt: result.rows[0].updated_at
    });
  } catch (e) {
    console.error("State save failed:", e.message);
    res.status(500).json({ message: "Could not save data." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      state JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `);

  app.listen(PORT, "0.0.0.0", () => {
    console.log("Daymark server started on port " + PORT);
  });
}

start().catch(error => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
