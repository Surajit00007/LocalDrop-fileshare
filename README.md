# Local Drop

Secure, local-only P2P file transfer tool. No cloud, no internet reliance, no signup/login required.

## Features
- **Local Network Speed**: Utilizes full LAN bandwidth via WebRTC DataChannels.
- **Zero Configuration**: Automatic local server discovery; no setup required.
- **Security**: PIN-based verification handshake; completely offline operation.
- **Cross-Platform**: Android host works with any modern browser (Chrome, Safari, Firefox, Edge).

## Download
Get the latest APK via Telegram: [t.me/LocalDrop_fileshare](https://t.me/LocalDrop_fileshare)

## Usage
1. **Launch App**: Open Local Drop on your Android device.
2. **Connect**: Enter the displayed URL (e.g., `http://192.168.1.5:8080`) in your computer's browser.
3. **Verify**: Match the PIN code on your device to the one shown in the browser to authorize the session.
4. **Transfer**: Drag and drop files into the browser window. Files are saved directly to your device's storage.

## Installation from Source
**Prerequisites**: Flutter SDK, Android SDK 34+, Java 17.

```bash
git clone https://github.com/Surajit00007/LocalDrop-fileshare.git
cd local_drop_app
flutter pub get
flutter build apk --release
```

## Privacy & Security
- **Data Isolation**: All traffic remains strictly within your local network (LAN).
- **Encryption**: WebRTC implementation uses standard DTLS encryption for data in transit.
- **Ephemeral**: No metadata or file data is ever stored on external servers.

## License
MIT License. Open source and free to use.

## Notes
- Ensure your Android device and computer are connected to the same local network for optimal performance.
- The PIN-based verification provides a basic layer of security suitable for local network use.
- Files are transferred directly to your Android device's storage without any intermediate processing.

## Developer
**Developed by**: surajitsahoo  
**Email**: onlyforcode007@gmail.com
