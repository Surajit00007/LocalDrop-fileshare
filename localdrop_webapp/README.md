# WebDrop — Secure Web File Transfer

> Cloud-based rewrite of the LocalDrop Android app, deployable to Netlify in one click.

## Features

- **Chunked Upload** — Files are split into 4MB chunks and uploaded sequentially, supporting videos, zips and large images without hitting Netlify's 6MB function payload limit
- **QR Code Sharing** — Instantly generates a QR code the receiver can scan with any device
- **PIN Verification** — Mirrors the Android app's Human-in-the-loop security: the sender sees a code (e.g. `42`), the receiver picks from 4 shuffled options — only the correct one unlocks the download
- **Streaming Download** — The download function reads chunks from Netlify Blobs and streams them back as a single file response
- **Automatic Expiry** — Drops expire after 1 hour

## Architecture

```
Browser (React + Vite)
  ├── POST /api/upload-chunk      → [Netlify Function] → Netlify Blobs (drops-data)
  ├── POST /api/finalize-drop     → [Netlify Function] → Netlify Blobs (drops-metadata)
  ├── GET  /api/get-drop          → [Netlify Function] → Returns file info + 4 PIN options
  └── POST /api/download          → [Netlify Function] → PIN verify → stream chunks
```

## Deploy to Netlify

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "feat: initial web-drop"
git remote add origin <your-repo>
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → Import from Git
2. Select your repository
3. Build settings are auto-detected from `netlify.toml`:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`

### 3. Enable Netlify Blobs
Netlify Blobs are enabled automatically on all Netlify sites — no configuration needed.

### 4. Done!
Your site will be live at `https://your-site.netlify.app`

## Local Development

```bash
npm install
npx netlify dev   # Starts Vite + Functions + Blobs emulation together
```
