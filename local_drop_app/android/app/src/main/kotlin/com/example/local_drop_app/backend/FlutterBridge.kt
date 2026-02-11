package com.example.local_drop_app.backend

import android.content.Context
import android.content.Intent
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.os.Build
import android.os.Environment
import android.content.ContentValues
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Handles communication between Flutter and the Android Backend.
 */
class FlutterBridge(private val context: Context) {
    
    private val METHOD_CHANNEL = "com.example.localdrop/backend"
    private val EVENT_CHANNEL = "com.example.localdrop/events"
    
    private var eventSink: io.flutter.plugin.common.EventChannel.EventSink? = null

    fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startService" -> {
                    startService()
                    result.success(true)
                }
                "stopService" -> {
                    stopService()
                    result.success(true)
                }
                "getIpAddress" -> {
                    val ip = getLocalIpAddress()
                    result.success(ip ?: "Unknown IP")
                }
                "downloadFile" -> {
                    val fileName = call.argument<String>("name") ?: ""
                    if (fileName.isEmpty()) {
                        result.error("ERROR", "Filename is empty", null)
                        return@setMethodCallHandler
                    }
                    val success = saveToDownloads(fileName)
                    result.success(success)
                }
                "resetSession" -> {
                    // Cleanly close WebRTC session
                    WebRtcManager.dispose()
                    result.success(true)
                }
                else -> {
                    result.notImplemented()
                }
            }
        }

        io.flutter.plugin.common.EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL).setStreamHandler(
            object : io.flutter.plugin.common.EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: io.flutter.plugin.common.EventChannel.EventSink?) {
                    eventSink = events
                }
                override fun onCancel(arguments: Any?) {
                    eventSink = null
                }
            }
        )
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                // Focus on wlan or common active interfaces, skip loopback
                if (iface.isLoopback || !iface.isUp) continue
                
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    // Re-verify it's a valid IPv4 address
                    if (addr is java.net.Inet4Address && !addr.isLoopbackAddress) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("FlutterBridge", "Failed to get IP address", e)
        }
        return null
    }
    
    fun sendEvent(event: Map<String, Any>) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            eventSink?.success(event)
        }
    }
    
    // Singleton pattern helper for Service to access instance
    companion object {
        var instance: FlutterBridge? = null
    }

    init {
        instance = this
    }

    private fun saveToDownloads(fileName: String): Boolean {
        try {
            val sourceFile = File(context.filesDir, fileName)
            if (!sourceFile.exists()) return false

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Scoped Storage: Use MediaStore
                val resolver = context.contentResolver
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "*/*")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }

                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { output ->
                        FileInputStream(sourceFile).use { input ->
                            input.copyTo(output)
                        }
                    }
                    return true
                }
            } else {
                // Legacy storage: Write directly to Downloads folder
                val downloadsFolder = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val destFile = File(downloadsFolder, fileName)
                FileInputStream(sourceFile).use { input ->
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
                return true
            }
        } catch (e: Exception) {
            android.util.Log.e("FlutterBridge", "Failed to save file to downloads", e)
        }
        return false
    }

    private fun startService() {
        val intent = Intent(context, LocalTransferService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    private fun stopService() {
        val intent = Intent(context, LocalTransferService::class.java)
        context.stopService(intent)
    }
}
