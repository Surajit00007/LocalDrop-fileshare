package com.example.local_drop_app.backend

import android.content.Context
import io.ktor.server.engine.*
import io.ktor.server.cio.*
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.http.content.*
import io.ktor.server.websocket.*
import io.ktor.server.response.*
import io.ktor.http.*
import io.ktor.server.plugins.*
import io.ktor.websocket.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import java.time.Duration

class HttpServer(
    private val context: Context,
    private val port: Int = 8080
) {

    private val scope = CoroutineScope(Dispatchers.IO)
    private var server: ApplicationEngine? = null
    private val signalingSessions = java.util.concurrent.ConcurrentHashMap<String, io.ktor.websocket.DefaultWebSocketSession>()

    private lateinit var verificationManager: VerificationManager

    fun start() {
        android.util.Log.d("HttpServer", "Starting HttpServer on port $port")
        scope.launch {
            try {
                android.util.Log.d("HttpServer", "Initializing VerificationManager")
                // Initialize VerificationManager with callbacks to update Android UI and handle failures
                verificationManager = VerificationManager(
                onCodeGenerated = { sessionId, code ->
                    // Send to Flutter UI if available
                    FlutterBridge.instance?.sendEvent(mapOf("type" to "verification_code", "code" to code))
                },
                onVerificationSuccess = { sessionId ->
                    FlutterBridge.instance?.sendEvent(mapOf("type" to "verification_success", "sessionId" to sessionId))
                },
                onVerificationFailed = { sessionId ->
                    // Close session if present
                    signalingSessions[sessionId]?.let { sess ->
                        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                            sess.close(io.ktor.websocket.CloseReason(io.ktor.websocket.CloseReason.Codes.VIOLATED_POLICY, "Verification Failed"))
                        }
                    }
                }
            )
            server = embeddedServer(CIO, port = port) {
                install(WebSockets) {
                    pingPeriod = Duration.ofSeconds(15)
                    timeout = Duration.ofSeconds(30)
                    maxFrameSize = Long.MAX_VALUE
                    masking = false
                }

                routing {
                    // Serve static files from Android assets
                    get("/{path...}") {
                        val path = call.parameters.getAll("path")?.joinToString("/") ?: "index.html"
                        val assetPath = if (path.isEmpty()) "www/index.html" else "www/$path"
                        
                        try {
                            val content = this@HttpServer.context.assets.open(assetPath).readBytes()
                            val contentType = when {
                                assetPath.endsWith(".html") -> io.ktor.http.ContentType.Text.Html
                                assetPath.endsWith(".js") -> io.ktor.http.ContentType.Application.JavaScript
                                assetPath.endsWith(".css") -> io.ktor.http.ContentType.Text.CSS
                                else -> io.ktor.http.ContentType.Application.OctetStream
                            }
                            call.respondBytes(content, contentType)
                        } catch (e: Exception) {
                            if (path == "ws") return@get // Let WebSocket handle this
                            // Fallback to index.html for SPA behavior or return 404
                            try {
                                val indexContent = this@HttpServer.context.assets.open("www/index.html").readBytes()
                                call.respondBytes(indexContent, io.ktor.http.ContentType.Text.Html)
                            } catch (e2: Exception) {
                                call.respond(io.ktor.http.HttpStatusCode.NotFound)
                            }
                        }
                    }

                    // WebSocket with WebRTC signaling support
                    webSocket("/ws") {
                        val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                        
                        send(Frame.Text("{\"type\":\"connected\"}"))
                        val thisSession = this
                        val remoteHost = call.request.origin.remoteHost
                        val sessionId = thisSession.hashCode().toString()
                        signalingSessions[sessionId] = thisSession
                        println("New WebSocket connection: sessionId=$sessionId from $remoteHost")

                        // Start verification immediately and send challenge to client
                        println("Starting verification session for $sessionId")
                        val challenge = verificationManager.startVerificationSession(sessionId)
                        println("Challenge generated: ${challenge.options}")
                        
                        val challengeJson = json.encodeToString(SignalingMessage(
                            type = "verification_challenge",
                            options = challenge.options
                        ))
                        println("Sending challenge JSON: $challengeJson")
                        send(Frame.Text(challengeJson))
                        println("Challenge sent successfully")
                        
                        // Setup WebRTC callbacks to send messages to browser
                        WebRtcManager.onLocalSdp = { sdp ->
                            val type = if (sdp.type == org.webrtc.SessionDescription.Type.OFFER) "offer" else "answer"
                            val msg = json.encodeToString(SignalingMessage(type = type, sdp = sdp.description))
                            scope.launch {
                                send(Frame.Text(msg))
                            }
                        }
                        
                        WebRtcManager.onIceCandidate = { candidate ->
                            val msg = json.encodeToString(SignalingMessage(
                                type = "ice_candidate",
                                candidate = candidate.sdp,
                                sdpMid = candidate.sdpMid,
                                sdpMLineIndex = candidate.sdpMLineIndex
                            ))
                            scope.launch {
                                send(Frame.Text(msg))
                            }
                        }
                        
                        WebRtcManager.onDataChannelOpen = {
                            println("DataChannel OPEN - ready for communication")
                        }
                        
                        WebRtcManager.onMessageReceived = { message ->
                            println("DataChannel message: $message")
                        }
                        
                        try {
                            for (frame in incoming) {
                                if (frame is Frame.Text) {
                                    val text = frame.readText()
                                    try {
                                        val msg = json.decodeFromString<SignalingMessage>(text)

                                        when (msg.type) {
                                            "verification_response" -> {
                                                val code = msg.code ?: -1
                                                if (verificationManager.verifyCode(sessionId, code)) {
                                                    send(Frame.Text(json.encodeToString(SignalingMessage(type = "verification_result", success = true))))
                                                    // Notify Flutter UI
                                                    FlutterBridge.instance?.sendEvent(mapOf("type" to "verification_result", "success" to true))
                                                } else {
                                                    send(Frame.Text(json.encodeToString(SignalingMessage(type = "verification_result", success = false))))
                                                    this.close(io.ktor.websocket.CloseReason(io.ktor.websocket.CloseReason.Codes.VIOLATED_POLICY, "Wrong Code"))
                                                }
                                            }
                                            else -> {
                                                // Require verification for all other signaling
                                                if (!verificationManager.isVerified(sessionId)) {
                                                    println("Blocked unverified message from $sessionId")
                                                    continue
                                                }

                                                when (msg.type) {
                                                    "offer" -> msg.sdp?.let { WebRtcManager.handleOffer(it) }
                                                    "answer" -> msg.sdp?.let { WebRtcManager.handleAnswer(it) }
                                                    "ice_candidate" -> {
                                                        if (msg.candidate != null && msg.sdpMid != null && msg.sdpMLineIndex != null) {
                                                            var candidateStr = msg.candidate
                                                            // Patch mDNS .local addresses with actual remote IP
                                                            if (candidateStr.contains(".local")) {
                                                                candidateStr = candidateStr.replace(Regex("[a-f0-9-]+\\.local"), remoteHost)
                                                                println("Patched mDNS candidate: ${msg.candidate} -> $candidateStr")
                                                            }
                                                            WebRtcManager.addIceCandidate(candidateStr, msg.sdpMid, msg.sdpMLineIndex)
                                                        }
                                                    }
                                                    "start_webrtc" -> {
                                                        WebRtcManager.createSession()
                                                    }
                                                    "file_meta", "file_chunk", "file_complete" -> {
                                                        FileTransfer.handleIncoming(text)
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e: Exception) {
                                        println("Error parsing signaling message: ${e.message}")
                                    }
                                }
                            }
                        } catch (e: Exception) {
                             println("Session error: ${e.message}")
                        } finally {
                            verificationManager.cleanup(sessionId)
                            signalingSessions.remove(sessionId)
                            WebRtcManager.dispose()
                        }
                    }
                }
                android.util.Log.d("HttpServer", "Building Ktor engine completed, starting server...")
            }.start(wait = false)
            android.util.Log.d("HttpServer", "HttpServer started successfully on port $port")
            } catch (e: Exception) {
                android.util.Log.e("HttpServer", "Failed to start HttpServer: ${e.message}", e)
                e.printStackTrace()
            }
        }
    }

    fun stop() {
        server?.stop(1000, 2000)
        server = null
    }
}
