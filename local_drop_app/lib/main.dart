import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:async';
import 'dart:ui' as import_ui;
import 'dart:io';
import 'package:file_picker/file_picker.dart' as file_picker;

void main() {
  // Use a dark system navigation bar to match the brand
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0B0F0E),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const LocalDropApp());
}

class LocalDropApp extends StatelessWidget {
  const LocalDropApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Local Drop',
      theme:
          ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: const Color(0xFF0B0F0E),
            primaryColor: const Color(0xFF00E676),
            useMaterial3: true,
            fontFamily: 'Inter', // Default system font fallback
          ).copyWith(
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF00E676),
              brightness: Brightness.dark,
              surface: const Color(0xFF161B19),
            ),
          ),
      home: const ServerHomePage(),
    );
  }
}

class ServerHomePage extends StatefulWidget {
  const ServerHomePage({super.key});

  @override
  State<ServerHomePage> createState() => _ServerHomePageState();
}

class _ServerHomePageState extends State<ServerHomePage>
    with SingleTickerProviderStateMixin {
  static const MethodChannel _backendChannel = MethodChannel(
    'com.example.localdrop/backend',
  );
  static const EventChannel _eventChannel = EventChannel(
    'com.example.localdrop/events',
  );

  String _statusMessage = 'Initializing...';
  String _ipAddress = 'Detecting IP...';
  int? _verificationCode;
  bool _showSuccess = false;
  String _lastReceivedFile = '';
  final List<Map<String, dynamic>> _receivedFiles = [];

  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    // Subtle pulse for the idle state
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);

    _startBackendService();
    _listenToBackendEvents();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _startBackendService() async {
    try {
      await _backendChannel.invokeMethod('startService');
      await _fetchIpAddress();
      setState(() => _statusMessage = 'Ready to share files');
    } catch (e) {
      setState(() => _statusMessage = 'Service Offline');
    }
  }

  Future<void> _fetchIpAddress() async {
    try {
      final String? ip = await _backendChannel.invokeMethod('getIpAddress');
      if (mounted) {
        setState(() {
          _ipAddress = ip ?? 'Unknown IP';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _ipAddress = 'Error detecting IP';
        });
      }
    }
  }

  void _listenToBackendEvents() {
    _eventChannel.receiveBroadcastStream().listen((event) {
      if (event is Map) {
        final type = event['type'];
        if (type == 'verification_code') {
          setState(() {
            _verificationCode = event['code'];
            _statusMessage = 'Incoming Connection';
          });
        } else if (type == 'verification_result' && event['success'] == true) {
          setState(() {
            _verificationCode = null;
            _statusMessage = 'Secure Tunnel Active';
          });
        } else if (type == 'file_received') {
          _handleFileReceived(event['name'], event['size']);
        }
      }
    });
  }

  void _handleFileReceived(String name, int size) {
    if (!mounted) return;
    setState(() {
      _receivedFiles.insert(0, {
        'name': name,
        'size': size,
        'time': DateTime.now(),
      });
      _lastReceivedFile = name;
      _showSuccess = true;
    });

    // Auto-dismiss success overlay after 2 seconds per branding guidelines
    Timer(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() {
          _showSuccess = false;
          _statusMessage = 'Secure Tunnel Active';
        });
      }
    });
  }

  Future<void> _downloadFile(String fileName) async {
    try {
      final bool? success = await _backendChannel.invokeMethod('downloadFile', {
        'name': fileName,
      });
      if (success == true) {
        _showFlashMessage('Saved to Downloads', const Color(0xFF2979FF));
      }
    } catch (e) {
      _showFlashMessage('Error saving file', Colors.redAccent);
    }
  }

  void _showFlashMessage(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          msg,
          style: const TextStyle(
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        backgroundColor: color.withOpacity(0.9),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 1. Background Layer (Deep Black)
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(color: Color(0xFF0B0F0E)),
            ),
          ),

          // 2. Main UI Content
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 400),
                    switchInCurve: Curves.easeOutCubic,
                    child: _buildBody(),
                  ),
                ),
              ],
            ),
          ),

          // 3. Success State Overlay (Green Checkmark)
          if (_showSuccess) _buildSuccessOverlay(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Local Drop',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.0,
                  color: Colors.white,
                  shadows: [Shadow(color: Color(0xFF00E676), blurRadius: 20)],
                ),
              ),
              if (_statusMessage.contains('Active') ||
                  _receivedFiles.isNotEmpty)
                IconButton(
                  onPressed: _resetSession,
                  icon: const Icon(Icons.power_settings_new_rounded),
                  color: Colors.redAccent,
                  tooltip: 'Disconnect',
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildPulseDot(),
              const SizedBox(width: 10),
              Text(
                _statusMessage.toUpperCase(),
                style: const TextStyle(
                  color: Color(0xFF00E676),
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _resetSession() async {
    try {
      await _backendChannel.invokeMethod('resetSession');
      setState(() {
        _receivedFiles.clear();
        _lastReceivedFile = '';
        _verificationCode = null;
        _statusMessage = 'Ready to share files';
        _showSuccess = false;
      });
    } catch (e) {
      debugPrint('Error resetting session: $e');
    }
  }

  Widget _buildPulseDot() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: const Color(0xFF00E676),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: const Color(
                  0xFF00E676,
                ).withOpacity(_pulseController.value * 0.8),
                blurRadius: 15,
                spreadRadius: _pulseController.value * 8,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildBody() {
    if (_verificationCode != null) {
      return _buildVerificationView();
    }

    if (_receivedFiles.isEmpty) {
      return _buildIdleView();
    }

    return _buildHistoryView();
  }

  Widget _buildIdleView() {
    return Center(
      key: const ValueKey('idle'),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          ScaleTransition(
            scale: Tween(begin: 1.0, end: 1.05).animate(_pulseController),
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0xFF00E676).withOpacity(0.2),
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF00E676).withOpacity(0.08),
                    blurRadius: 80,
                    spreadRadius: 10,
                  ),
                ],
              ),
              child: const Icon(
                Icons.bolt_rounded,
                size: 72,
                color: Color(0xFF00E676),
              ),
            ),
          ),
          const SizedBox(height: 32),
          _buildConnectionGuide(),
          const SizedBox(height: 32),
          _buildActionButtons(),
          const SizedBox(height: 24),
          _buildFeatureList(),
        ],
      ),
    );
  }

  Widget _buildConnectionGuide() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF00E676).withOpacity(0.05),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: const Color(0xFF00E676).withOpacity(0.1)),
      ),
      child: Column(
        children: [
          const Text(
            'CONNECT VIA BROWSER',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 2.5,
            ),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(
              color: Colors.black26,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.language_rounded,
                  color: Colors.white38,
                  size: 18,
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      'http://$_ipAddress:8080',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF00E676),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Type this URL into your browser address bar\nto start dropping files securely.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white54,
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          Expanded(
            child: _buildActionButton(
              label: 'SHARE',
              icon: Icons.upload_rounded,
              color: const Color(0xFF2979FF),
              onTap: _pickAndSendFile,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: _buildActionButton(
              label: 'RECEIVE',
              icon: Icons.download_rounded,
              color: const Color(0xFF00E676),
              onTap: () {
                _showFlashMessage(
                  'Receiver mode active',
                  const Color(0xFF00E676),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required String label,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.3), width: 2),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAndSendFile() async {
    try {
      // Use file_picker to select multiple files
      final result = await file_picker.FilePicker.platform.pickFiles(
        type: file_picker.FileType.any,
        allowMultiple: true,
      );

      if (result != null && result.files.isNotEmpty) {
        for (final file in result.files) {
          final fileName = file.name;
          final filePath = file.path;

          if (filePath != null) {
            // Read file bytes and send via backend
            final fileBytes = await File(filePath).readAsBytes();
            final success = await _backendChannel.invokeMethod(
              'sendFileToLaptop',
              {'name': fileName, 'bytes': fileBytes},
            );

            if (success == true) {
              _showFlashMessage('Sent: $fileName', const Color(0xFF2979FF));
            } else {
              _showFlashMessage('Failed: $fileName', Colors.redAccent);
            }
          }
        }
      } else {
        _showFlashMessage('No files selected', Colors.orange);
      }
    } catch (e) {
      _showFlashMessage('Error: ${e.toString()}', Colors.redAccent);
    }
  }

  Widget _buildFeatureList() {
    return const Column(
      children: [
        _FeatureItem(
          Icons.security_rounded,
          'Encrypted P2P',
          'Device-to-device secure',
        ),
        _FeatureItem(
          Icons.speed_rounded,
          'Zero Cloud',
          'Fast local network speed',
        ),
        _FeatureItem(
          Icons.auto_awesome_motion_rounded,
          'Batch Sharing',
          'Send multiple files at once',
        ),
      ],
    );
  }

  Widget _buildVerificationView() {
    return Center(
      key: const ValueKey('verify'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'VERIFICATION CODE',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            _verificationCode.toString(),
            style: const TextStyle(
              fontSize: 96,
              fontWeight: FontWeight.w900,
              color: Color(0xFF00E676),
              letterSpacing: 8,
              shadows: [Shadow(color: Color(0xFF00E676), blurRadius: 40)],
            ),
          ),
          const SizedBox(height: 32),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 60),
            child: Text(
              'Select this code in your browser to start the encrypted transfer.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white54,
                fontSize: 14,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          child: Text(
            'RECEIVED FILES',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.5,
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            key: const ValueKey('history'),
            padding: const EdgeInsets.symmetric(horizontal: 24),
            itemCount: _receivedFiles.length,
            itemBuilder: (context, index) {
              final file = _receivedFiles[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.03),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withOpacity(0.06)),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: BackdropFilter(
                    filter: java_ui.ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                      leading: const Icon(
                        Icons.insert_drive_file_outlined,
                        color: Colors.white60,
                        size: 28,
                      ),
                      title: Text(
                        file['name'] ?? 'Unknown File',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '${((file['size'] ?? 0) / 1024 / 1024).toStringAsFixed(2)} MB',
                          style: const TextStyle(
                            color: Colors.white24,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      trailing: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF2979FF).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: IconButton(
                          icon: const Icon(
                            Icons.arrow_downward_rounded,
                            color: Color(0xFF2979FF),
                            size: 22,
                          ),
                          onPressed: () => _downloadFile(file['name']),
                          tooltip: 'Save to Downloads',
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessOverlay() {
    return GestureDetector(
      onTap: () => setState(() => _showSuccess = false),
      child: Container(
        color: const Color(0xFF0B0F0E).withOpacity(0.95),
        child: Center(
          child: TweenAnimationBuilder<double>(
            duration: const Duration(milliseconds: 500),
            curve: Curves.elasticOut,
            tween: Tween(begin: 0.0, end: 1.0),
            builder: (context, value, child) {
              return Transform.scale(
                scale: value,
                child: Opacity(
                  opacity: value.clamp(0.0, 1.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          color: const Color(0xFF00E676),
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF00E676).withOpacity(0.3),
                              blurRadius: 40,
                              spreadRadius: 10,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 80,
                          color: Color(0xFF0B0F0E),
                        ),
                      ),
                      const SizedBox(height: 48),
                      const Text(
                        'TRANSFER COMPLETE',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF00E676),
                          letterSpacing: 2,
                          shadows: [
                            Shadow(color: Color(0xFF00E676), blurRadius: 20),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 48),
                        child: Text(
                          _lastReceivedFile,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _FeatureItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String desc;

  const _FeatureItem(this.icon, this.title, this.desc);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 54),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF00E676), size: 24),
          const SizedBox(width: 20),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
              Text(
                desc,
                style: const TextStyle(
                  color: Colors.white38,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class java_ui {
  static final ImageFilter = _ImageFilterProxy();
}

class _ImageFilterProxy {
  dynamic blur({double sigmaX = 0, double sigmaY = 0}) =>
      import_ui.ImageFilter.blur(sigmaX: sigmaX, sigmaY: sigmaY);
}
