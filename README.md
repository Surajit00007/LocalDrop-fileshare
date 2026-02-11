# 🚀 Local Drop: Premium P2P File Sharing

**Local Drop** is a high-performance, local-first file transfer system designed for speed, security, and a premium user experience. Transfer files directly between your Android device and any browser on your local network—zero cloud, zero tracking, maximum speed.

![Tech Stack](https://img.shields.io/badge/Powered_By-Flutter_%7C_Kotlin_%7C_WebRTC-00E676?style=for-the-badge)

## ✨ Premium Features
- **Pure P2P Speed**: Uses **WebRTC DataChannels** for direct device-to-device transfer, bypassing the cloud for maximum LAN performance.
- **Zero Configuration**: No accounts, no signups. Just open the app, enter the secure code, and start dropping.
- **Batch Transfer**: Implementation supports sending multiple files at once with real-time progress tracking.
- **Encrypted Local Signaling**: Secure verification handshake ensures only you can access your files.

---

## 🎯 How to Use Local Drop (End User Guide)

Follow these simple steps to transfer files between your Android device and any computer/browser on your local network:

### **Prerequisites**
- Android device (API 24+) with the Local Drop app installed
- Computer/laptop on the same WiFi network
- Any modern web browser (Chrome, Firefox, Safari, Edge, etc.)

### **Step 1: Launch the App**
1. Open the **Local Drop** app on your Android device
2. The app will start a local server and display:
   - **Connection URL** (e.g., `http://192.168.1.5:8080`)
   - **Security Code** (e.g., `42`)

### **Step 2: Open Browser on Computer**
1. On your computer, open any web browser
2. Enter the connection URL shown on your phone into the address bar
3. Press Enter — you'll see the **Local Drop receiver interface**

### **Step 3: Verify Connection**
1. In the browser, click **"Connect WebSocket"**
2. After connection, you'll see a list of verification codes
3. **Match the code** with the one shown on your Android device and click it
4. Once verified, the status will show **"Auth: verified"**

### **Step 4: Start WebRTC**
1. Click **"Start WebRTC"** button in the browser
2. Wait for the connection status to change to **"RTC: connected"**
3. The "Send File" button will now be enabled

### **Step 5: Transfer Files**
1. Click the file input field or **drag & drop** files into the interface
2. Click **"Send"** to transfer the file
3. Watch the progress bar — the file is being sent directly to your phone over WebRTC
4. Files are saved to your phone's internal storage automatically

### **Complete!**
Your file is now on your Android device. Repeat steps 5 for more files. No cloud, no delays, pure P2P speed! 🚀

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

## � Repository Structure

```
local-file-drop-main/
├── dist/                                          # Web frontend distribution
│   └── index.html                                 # Main UI (Edit for frontend)
│
├── local_drop_app/                                # Flutter mobile app root
│   ├── lib/                                       # Dart/Flutter app logic
│   ├── pubspec.yaml                               # Flutter dependencies
│   │
│   └── android/                                   # Android-specific code
│       └── app/
│           ├── build.gradle.kts                   # Android build config
│           ├── libs/
│           │   └── libwebrtc.aar                  # Google WebRTC binary
│           └── src/main/
│               ├── kotlin/com/example/local_drop_app/backend/
│               │   ├── HttpServer.kt              # Ktor HTTP/WebSocket server
│               │   ├── WebRtcManager.kt           # WebRTC P2P signaling & DataChannel
│               │   ├── FileTransfer.kt            # Chunked file protocol handler
│               │   ├── VerificationManager.kt     # Numeric code verification
│               │   ├── LocalTransferService.kt    # Foreground service
│               │   └── SignalingMessage.kt        # JSON signaling types
│               │
│               └── assets/www/                    # Static HTML served by server
│                   └── index.html                 # Frontend served to browser
│
└── README.md                                      # This file
```

### Where to Edit

#### 🎨 **Frontend UI** → `dist/index.html`
- Modify the visual interface, colors, layouts, buttons
- Change verification flow or WebRTC controls UI
- Add new file upload features or progress indicators
- **Note**: After editing, sync to `local_drop_app/android/app/src/main/assets/www/index.html` before building APK

#### 🔧 **Backend Logic** → `local_drop_app/android/app/src/main/kotlin/com/example/local_drop_app/backend/`
- **HttpServer.kt**: Ktor server setup, WebSocket signaling routes, asset serving
- **WebRtcManager.kt**: PeerConnection lifecycle, DataChannel creation, ICE candidate handling
- **FileTransfer.kt**: Chunked file protocol, base64 encoding/decoding, assembly logic
- **VerificationManager.kt**: Numeric code generation, challenge options, session tracking
- **SignalingMessage.kt**: JSON message types for WebRTC handshake and file transfer

#### 📱 **Flutter App** → `local_drop_app/lib/main.dart`
- Modify Flutter UI, native event handling
- Change app theme or create platform-specific UI

#### 🔨 **Build Configuration**
- `local_drop_app/android/app/build.gradle.kts`: Kotlin version, dependencies, SDK versions
- `local_drop_app/pubspec.yaml`: Flutter and Dart dependencies

---

## �🛡️ Privacy & Security
- **Local Network Only**: No data ever leaves your WiFi.
- **No Cloud Metadata**: Filenames and sizes are only shared over the local signaling socket.
- **Open Architecture**: Direct WebRTC tunnels ensure your ISP or third parties cannot "sniff" the data during transfer.

---

## 🤝 Contributing
Contributions are welcome! If you have ideas for new visual effects or performance optimizations, feel free to open a PR.

**Local Drop** — *Drop it like it's fast.* 📦✨
