# 🚀 Local Drop: Premium P2P File Sharing

**Local Drop** is a high-performance, local-first file transfer system designed for speed, security, and a premium user experience. Transfer files directly between your Android device and any browser on your local network—zero cloud, zero tracking, maximum speed.

![Local Drop UI Sync](https://img.shields.io/badge/UI-Neon_Emerald_%26_Deep_Black-00E676?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Powered_By-Flutter_%7C_Kotlin_%7C_WebRTC-00E676?style=for-the-badge)

## ✨ Premium Features
- **Pure P2P Speed**: Uses **WebRTC DataChannels** for direct device-to-device transfer, bypassing the cloud for maximum LAN performance.
- **Zero Configuration**: No accounts, no signups. Just open the app, enter the secure code, and start dropping.
- **Batch Transfer**: Implementation supports sending multiple files at once with real-time progress tracking.
- **Encrypted Local Signaling**: Secure verification handshake ensures only you can access your files.

---

## 🛠️ Step-by-Step Guide

### 1. Initialize
Launch the **Local Drop** app on your Android device. It will automatically detect your local WiFi IP address and display a prominent connection URL (e.g., `http://192.168.1.5:8080`) along with a **Security Code**.

### 2. Connect
Open any browser on the same WiFi/Network and type the URL shown on your phone into the address bar to open the Receiver interface.

### 3. Verify
Click **Initialize Connection** in the browser. A selection of security codes will appear—match it with the one shown on your phone to establish the secure link.

### 4. Secure Link
Click **Establish Secure Link**. Once the status turns to **"LINK ACTIVE"**, your device-to-device tunnel is ready.

### 5. Drop
Drag and drop your files into the browser's drop zone or tap to select. Watch your files "fly" directly to your phone's internal storage!

---

## 💻 Developer Setup

If you want to build or modify Local Drop, follow these steps:

### Prerequisites
- **Flutter SDK**: Stable channel (replaces `flutter` folder in project root if missing).
- **Android Studio**: Installed with Android SDK 34+.
- **Java 17**: Required for Gradle compilation.

### Build Instructions
1. Clone the repository and navigate to the `local_drop_app` folder.
2. Ensure your Android device is connected via ADB.
3. Run the following commands:
```bash
flutter clean
flutter pub get
flutter run -d <YOUR_DEVICE_ID>
```

### Build Config (Optimized)
This project uses **AGP 8.2.1** and **Kotlin 1.9.22** for maximum compatibility with the provided WebRTC binaries and Flutter environment.

---

## 🛡️ Privacy & Security
- **Local Network Only**: No data ever leaves your WiFi.
- **No Cloud Metadata**: Filenames and sizes are only shared over the local signaling socket.
- **Open Architecture**: Direct WebRTC tunnels ensure your ISP or third parties cannot "sniff" the data during transfer.

---

## 🤝 Contributing
Contributions are welcome! If you have ideas for new visual effects or performance optimizations, feel free to open a PR.

**Local Drop** — *Drop it like it's fast.* 📦✨
