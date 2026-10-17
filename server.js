const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required.");
}
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "users.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { users: {} }; }
}
function writeDb(db) {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DB_FILE);
}
function publicState(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.routines) || !state.completions || typeof state.completions !== "object") {
    throw new Error("State format is invalid.");
  }
  if (state.routines.length > 1000) throw new Error("Too many routines.");
  const routines = state.routines.map(r => ({
    id: String(r.id || crypto.randomUUID()).slice(0, 100),
    name: String(r.name || "Routine").slice(0, 80),
    category: String(r.category || "Personal").slice(0, 40),
    time: /^\d{2}:\d{2}$/.test(String(r.time || "")) ? String(r.time) : "",
    days: Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [0,1,2,3,4,5,6],
    createdAt: String(r.createdAt || new Date().toISOString()).slice(0, 40)
  }));
  const completions = {};
  for (const [date, records] of Object.entries(state.completions).slice(-5000)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !records || typeof records !== "object") continue;
    completions[date] = {};
    for (const [id, value] of Object.entries(records)) if (value === true) completions[date][String(id).slice(0,100)] = true;
  }
  const settings = {
    theme: state.settings?.theme === "dark" ? "dark" : "light",
    notifications: Boolean(state.settings?.notifications)
  };
  return { version: 3, routines, completions, settings, createdAt: state.createdAt || new Date().toISOString() };
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ message: "Please sign in." });
  try { req.user = jwt.verify(match[1], JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: "Your session expired. Please sign in again." }); }
}
function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "14d" });
}
function safeUser(user) { return { id: user.id, email: user.email }; }

app.get("/api/health", (req,res)=>res.json({ok:true,service:"Daymark API"}));
app.post("/api/auth/register", async (req,res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({message:"Enter a valid email address."});
    if (password.length < 8 || password.length > 128) return res.status(400).json({message:"Password must be 8–128 characters."});
    const db = readDb();
    if (Object.values(db.users).some(u => u.email === email)) return res.status(409).json({message:"An account with this email already exists. Sign in instead."});
    const user = { id: crypto.randomUUID(), email, passwordHash: await bcrypt.hash(password, 12), state: null, createdAt: new Date().toISOString() };
    db.users[user.id] = user; writeDb(db);
    res.status(201).json({token:issueToken(user),email:user.email,state:null});
  } catch (e) { console.error(e); res.status(500).json({message:"Could not create account."}); }
});
app.post("/api/auth/login", async (req,res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const db = readDb(); const user = Object.values(db.users).find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({message:"Email or password is incorrect."});
    res.json({token:issueToken(user),email:user.email,state:user.state});
  } catch (e) { console.error(e); res.status(500).json({message:"Could not sign in."}); }
});
app.get("/api/state", auth, (req,res) => {
  const user = readDb().users[req.user.sub];
  if (!user) return res.status(401).json({message:"Account not found."});
  res.json({state:user.state || null, updatedAt:user.updatedAt || null});
});
app.put("/api/state", auth, (req,res) => {
  try {
    const state = publicState(req.body?.state);
    const db = readDb(); const user = db.users[req.user.sub];
    if (!user) return res.status(401).json({message:"Account not found."});
    user.state = state; user.updatedAt = new Date().toISOString(); db.users[user.id] = user; writeDb(db);
    res.json({ok:true,updatedAt:user.updatedAt});
  } catch (e) { res.status(400).json({message:e.message || "Invalid state."}); }
});

// Serve the frontend from the same server, avoiding cross-origin setup.
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => {
  console.log(`Daymark is running at http://localhost:${PORT}`);
  if (JWT_SECRET === "CHANGE_THIS_DEVELOPMENT_SECRET_BEFORE_DEPLOYING") {
    console.warn("WARNING: Set JWT_SECRET to a long random secret before deploying publicly.");
  }
});
