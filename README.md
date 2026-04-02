# Local Drop — Secure & Fast File Sharing ⚡

A high-fidelity, premium file sharing platform designed for both ultra-fast local network transfers and cloud-native secure sharing. Experience seamless, PIN-verified file transfers with zero setup.

[![Netlify Status](https://api.netlify.com/api/v1/badges/your-site-id/deploy-status)](https://app.netlify.com/)

---

## 🏗️ Project Architecture

Local Drop has evolved into two powerful ecosystems:

### 1. 🚀 Cloud-Native Web App (New)
**Location**: `/localdrop_webapp`  
Built for the modern web, this version is designed for deployment on **Netlify**.
- **Technology**: React 19 + Vite + TypeScript.
- **Backend**: Netlify Functions (Serverless).
- **Storage**: Netlify Blobs for global reach.
- **Key Features**:
    - **Chunked Transfers**: Reconstructs large files in the browser via 4MB chunks, bypassing serverless limits.
    - **High-Fidelity UI**: Premium Glassmorphism design with a split-panel layout.
    - **Human-in-the-Loop Security**: Sender generates a random 2-digit PIN; Receiver must unlock via a 4-option decoy grid.
    - **QR Sharing**: Instant QR code generation for mobile-to-desktop or mobile-to-mobile drops.

### 2. 👋 Local P2P Android Tool (Original)
**Location**: `/localdrop_andriod`  
The classic, ultra-secure local-only P2P transfer utility.
- **Technology**: Flutter / WebRTC.
- **Security**: Direct P2P tunnel; data never leaves your local LAN.
- **Speed**: Limited only by your router's hardware.

---

## ⚡ Quick Start (Web App)

### Prerequisites
- Node.js 20+
- Netlify CLI (`npm install -g netlify-cli`)

### Local Development
1. Navigate to the webapp directory:
   ```bash
   cd localdrop_webapp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run with Netlify Dev (simulates Blobs & Functions):
   ```bash
   npx netlify dev
   ```

### Deployment
Experience one-click deployment to Netlify:
```bash
npx netlify deploy --build --prod
```

---

## 🔒 Security Model

Local Drop prioritizes **verification over trust**:
1. **Verification Phase**: Upon upload, a random secret code (0-99) is generated and shown **only** to the sender.
2. **Access Control**: The receiver is presented with four numbered options. Only picking the correct one matches the cryptographic hash on the server to unlock the download.
3. **Ephemeral Storage**: All cloud drops are automatically expired and purged from the system after 1 hour.

---

## 🛠️ Developer Info

- **Created by**: [Surajit Sahoo](https://github.com/Surajit00007)
- **Repository**: [LocalDrop-fileshare](https://github.com/Surajit00007/LocalDrop-fileshare)
- **Contact**: onlyforcode007@gmail.com

---

## 📜 License
MIT License. Open source and free to scale.
