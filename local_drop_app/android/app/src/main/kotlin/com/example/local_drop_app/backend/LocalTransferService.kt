package com.example.local_drop_app.backend

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground Service that keeps the HTTP server alive.
 * This is the main entry point for the backend logic.
 */
class LocalTransferService : Service() {

    private lateinit var server: HttpServer

    companion object {
        const val ACTION_STOP = "STOP"
        private const val CHANNEL_ID = "local_drop_service"
        private const val NOTIFICATION_ID = 1
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        
        // Initialize WebRTC factory
        WebRtcManager.initializeFactory(applicationContext)
        
        // Initialize file transfer handler
        FileTransfer.init(applicationContext)
        FileTransfer.onFileReceived = { fileName, data ->
            try {
                val file = java.io.File(filesDir, fileName)
                file.outputStream().use { it.write(data) }
                android.util.Log.d("LocalTransferService", "Successfully saved file: ${file.absolutePath}")
                // Notify Flutter UI
                FlutterBridge.instance?.sendEvent(mapOf("type" to "file_received", "name" to fileName, "size" to data.size))
            } catch (e: Exception) {
                android.util.Log.e("LocalTransferService", "Failed to save received file: ${e.message}", e)
            }
        }

        server = HttpServer(this)
        server.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        server.stop()
        WebRtcManager.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Local Drop Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the local file transfer server running"
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Local Drop Active")
            .setContentText("File transfer server running on port 8080")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
