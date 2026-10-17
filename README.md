# Daymark — Daily Routine Checker v3

A responsive routine tracker built with HTML, CSS and vanilla JavaScript, with an optional Node.js account/cloud-sync server.

## Features

- Daily routine checklist, completion progress and editable routines
- Weekly calendar and per-routine repeat days
- Current and best streaks
- Achievements/badges
- Weekly completion analytics and history by date
- Light/dark theme
- JSON export/import backup
- Browser notifications for timed routines while the app is open
- Optional email/password account and cloud sync
- Responsive desktop and mobile layout
- Local-first: the tracker remains usable without an account/server

## Requirements

Install Node.js LTS (includes npm): https://nodejs.org/

## Run the complete app

1. Extract this project folder.
2. Open the `daily-routine-checker-v3` folder in VS Code.
3. Open the VS Code terminal in this folder.
4. Install packages:

   ```bash
   npm install
   ```

5. Start the app:

   ```bash
   npm start
   ```

6. Open **http://localhost:3000** in your browser.

Keep the terminal/server running while using the app. For account creation and cloud sync, use the app served from `localhost:3000`; do not open `index.html` directly or use Live Server, because the account API is provided by Node.js.

## Backup and restore

- Select **Export backup** to download a JSON file containing routines, completion history and preferences.
- Select **Import backup** to restore a Daymark JSON backup. Import replaces the current local data, so export first if you want to keep it.
- Keep a backup somewhere outside this project folder.

## Accounts and cloud sync

- Select **Account / Sync**, then create an account or sign in.
- On registration, the account starts without a cloud copy. The app uploads the current local data after sign-in.
- After login, the app automatically attempts to sync local changes and offers a manual **Sync this device** button.
- The current implementation intentionally treats this device's local data as the source of truth when syncing. On a login response with an existing cloud backup, choose whether to download it or keep local data and upload it.
- Account data is stored in `data/users.json` on the server. Protect this file and back it up. It contains password hashes and private routine data.
- For another device to access the same cloud copy, deploy the Node server to a hosting provider and use HTTPS. `localhost` only refers to the current device.

## Important security notes before public deployment

This is a learning project, not a hardened production service.

1. Set a strong random `JWT_SECRET` environment variable. Never deploy with the development fallback.
2. Use HTTPS and a hosting provider with persistent private storage.
3. Add rate limiting, email verification, password reset, account deletion, automated backups, and stronger operational monitoring before real public use.
4. The sample server uses a JSON file for storage. It is suitable for a small learning project, but not concurrent/high-volume production use.
5. Do not commit `data/users.json` or your secret to a public repository.

Windows PowerShell example for a development secret:

```powershell
$env:JWT_SECRET = "replace-this-with-a-long-random-secret"
npm start
```

## Troubleshooting

- **`npm` is not recognized:** install Node.js LTS, then close and reopen VS Code.
- **Port 3000 is busy:** stop the other app using it or set another `PORT`; if you change the port, update `API_BASE` in `public/app.js` to match.
- **Cloud sync fails:** make sure the terminal server is running and the page URL starts with `http://localhost:3000`.
- **Notifications do not appear:** allow notifications in the browser and keep the app tab open. Browser notifications are not guaranteed when the app/browser is closed.
- **Data seems missing:** check the browser/profile used previously. V3 imports backup files and attempts a limited v1/v2 local-storage migration, but different ports/hosts have separate browser storage. Keep the old folder and export a backup before switching.

## Project structure

```text
daily-routine-checker-v3/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/               # created automatically when server starts
├── server.js
├── package.json
├── .gitignore
└── README.md
```
