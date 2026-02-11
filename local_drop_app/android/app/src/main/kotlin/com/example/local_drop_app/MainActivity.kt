package com.example.local_drop_app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.example.local_drop_app.backend.FlutterBridge

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        FlutterBridge(this).configureFlutterEngine(flutterEngine)
    }
}
