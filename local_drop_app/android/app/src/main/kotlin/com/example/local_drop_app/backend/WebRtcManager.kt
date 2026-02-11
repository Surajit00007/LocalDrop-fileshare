package com.example.local_drop_app.backend

import android.content.Context
import android.util.Log
import org.webrtc.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Minimal WebRTC Manager for Phase 1: DataChannel only, ping/pong test.
 * 
 * Responsibilities:
 * - Initialize PeerConnectionFactory (once per app lifecycle)
 * - Create PeerConnection with DataChannel
 * - Handle signaling (SDP offer/answer, ICE candidates)
 * - Send/receive messages over DataChannel
 * 
 * NO file transfer logic yet - this is Phase 1 only.
 */
object WebRtcManager {
    private const val TAG = "WebRtcManager"
    private const val DATA_CHANNEL_LABEL = "data"
    
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var eglBase: EglBase? = null
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val factoryReady = CompletableDeferred<Unit>()
    private var remoteDescriptionSet = false
    private val pendingRemoteCandidates = mutableListOf<IceCandidate>()
    
    // Callbacks for signaling
    var onLocalSdp: ((SessionDescription) -> Unit)? = null
    var onIceCandidate: ((IceCandidate) -> Unit)? = null
    var onDataChannelOpen: (() -> Unit)? = null
    var onMessageReceived: ((String) -> Unit)? = null
    private val json = Json { ignoreUnknownKeys = true }
    
    /**
     * Initialize PeerConnectionFactory - call once on app start.
     */
    fun initializeFactory(context: Context) {
        if (factory != null) {
            Log.d(TAG, "Factory already initialized")
            return
        }
        
        scope.launch {
            try {
                // Initialize EGL context for WebRTC
                eglBase = EglBase.create()
                
                // Initialize PeerConnectionFactory
                val initOptions = PeerConnectionFactory.InitializationOptions.builder(context)
                    .setEnableInternalTracer(false)
                    .createInitializationOptions()
                PeerConnectionFactory.initialize(initOptions)
                
                // Create factory
                val options = PeerConnectionFactory.Options()
                factory = PeerConnectionFactory.builder()
                    .setOptions(options)
                    .createPeerConnectionFactory()
                
                Log.d(TAG, "PeerConnectionFactory initialized successfully")
                // Signal readiness
                if (!factoryReady.isCompleted) factoryReady.complete(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize PeerConnectionFactory", e)
            }
        }
    }
    
    /**
     * Create a new WebRTC session - call after verification succeeds.
     */
    fun createSession() {
        if (peerConnection != null) {
            Log.w(TAG, "Session already exists, disposing old one")
            dispose()
        }

        scope.launch {
            // Wait for factory to be ready (short timeout)
            if (factory == null) {
                try {
                    withTimeout(3000L) {
                        factoryReady.await()
                    }
                } catch (e: TimeoutCancellationException) {
                    Log.e(TAG, "Timed out waiting for PeerConnectionFactory initialization")
                    return@launch
                } catch (e: Exception) {
                    Log.e(TAG, "Error waiting for factory readiness", e)
                    return@launch
                }
            }
            try {
                // ICE servers configuration (STUN + TURN fallback support)
                val iceServers = mutableListOf<PeerConnection.IceServer>()
                
                // 1. Google STUN
                iceServers.add(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
                
                // 2. TURN (Configurable placeholder)
                // iceServers.add(PeerConnection.IceServer.builder("turn:your-turn-server.com")
                //     .setUsername("user")
                //     .setPassword("pass")
                //     .createIceServer())
                
                // RTCConfiguration
                val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
                    sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
                    continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
                    tcpCandidatePolicy = PeerConnection.TcpCandidatePolicy.ENABLED
                    
                    // Initial policy: Attempt all (direct/stun/relay)
                    iceTransportsType = PeerConnection.IceTransportsType.ALL
                }
                
                // PeerConnection observer
                val observer = object : PeerConnection.Observer {
                    override fun onIceCandidate(candidate: IceCandidate) {
                        // Log candidate type for debugging
                        // Candidate string format: "candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> ..."
                        val typePart = candidate.sdp.split(" typ ").getOrNull(1)?.split(" ")?.getOrNull(0) ?: "unknown"
                        Log.d(TAG, "Local ICE candidate generated ($typePart): ${candidate.sdp}")
                        
                        onIceCandidate?.invoke(candidate)
                    }
                    
                    override fun onDataChannel(dc: DataChannel) {
                        Log.d(TAG, "DataChannel received: ${dc.label()}")
                        setupDataChannel(dc)
                    }
                    
                    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                        Log.d(TAG, "ICE connection state: $state")
                    }
                    
                    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                        Log.d(TAG, "ICE gathering state: $state")
                    }
                    
                    override fun onSignalingChange(state: PeerConnection.SignalingState) {
                        Log.d(TAG, "Signaling state: $state")
                    }
                    
                    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
                    override fun onAddStream(stream: MediaStream) {}
                    override fun onRemoveStream(stream: MediaStream) {}
                    override fun onRenegotiationNeeded() {}
                    override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
                    override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                        Log.d(TAG, "Connection state: $newState")
                        when (newState) {
                            PeerConnection.PeerConnectionState.CONNECTED -> {
                                Log.d(TAG, "WebRTC Tunnel Established Successfully")
                                FlutterBridge.instance?.sendEvent(mapOf("type" to "webrtc_state", "state" to "CONNECTED"))
                            }
                            PeerConnection.PeerConnectionState.FAILED -> {
                                Log.e(TAG, "WebRTC Tunnel FAILED - Check potential NAT/firewall issues")
                                FlutterBridge.instance?.sendEvent(mapOf("type" to "webrtc_state", "state" to "FAILED"))
                            }
                            PeerConnection.PeerConnectionState.DISCONNECTED -> {
                                Log.w(TAG, "WebRTC Tunnel DISCONNECTED")
                                FlutterBridge.instance?.sendEvent(mapOf("type" to "webrtc_state", "state" to "DISCONNECTED"))
                            }
                            else -> {}
                        }
                    }
                    override fun onSelectedCandidatePairChanged(event: CandidatePairChangeEvent) {}
                    override fun onTrack(transceiver: RtpTransceiver) {}
                    override fun onRemoveTrack(receiver: RtpReceiver) {}
                    override fun onStandardizedIceConnectionChange(newState: PeerConnection.IceConnectionState) {}
                    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                }
                
                // Create PeerConnection
                val pc = factory?.createPeerConnection(rtcConfig, observer)
                peerConnection = pc
                
                Log.d(TAG, "PeerConnection created successfully")
                
                // Automatically set up DataChannel and Offer for the initiator side
                // Note: In a real app, we might wait for a specific signal, but for this flow
                // 'createSession' implies starting the connection.
                if (pc != null) {
                    try {
                        createDataChannelInternal(pc)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to create DataChannel", e)
                    }

                    try {
                        createOfferInternal(pc)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to create offer", e)
                    }
                } else {
                    Log.e(TAG, "PeerConnection creation returned null")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create PeerConnection", e)
            }
        }
    }
    
    /**
     * Internal: Create DataChannel on specific PC
     */
    private fun createDataChannelInternal(pc: PeerConnection) {
         try {
            val init = DataChannel.Init().apply {
                ordered = true
                maxRetransmits = -1 // reliable
            }
            
            val dc = pc.createDataChannel(DATA_CHANNEL_LABEL, init)
            setupDataChannel(dc)
            
            dataChannel = dc
            Log.d(TAG, "DataChannel created: $DATA_CHANNEL_LABEL")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create DataChannel", e)
        }
    }
    
    // Legacy public method - tries to use current PC
    fun createDataChannel() {
        peerConnection?.let { createDataChannelInternal(it) }
    }
    
    /**
     * Setup DataChannel observer.
     */
    private fun setupDataChannel(dc: DataChannel) {
        dc.registerObserver(object : DataChannel.Observer {
            override fun onStateChange() {
                Log.d(TAG, "DataChannel state: ${dc.state()}")
                if (dc.state() == DataChannel.State.OPEN) {
                    onDataChannelOpen?.invoke()
                    // Send ping
                    sendMessage("ping")
                }
            }
            
            override fun onMessage(buffer: DataChannel.Buffer) {
                val data = buffer.data
                val bytes = ByteArray(data.remaining())
                data.get(bytes)
                val message = String(bytes, StandardCharsets.UTF_8)
                
                Log.d(TAG, "DataChannel message received: $message")
                // If it's a file-transfer message, let FileTransfer handle it
                try {
                    val el = json.parseToJsonElement(message)
                    val type = el.jsonObject["type"]?.jsonPrimitive?.contentOrNull
                    if (type?.startsWith("file_") == true) {
                        FileTransfer.handleIncoming(message)
                        return
                    }
                } catch (e: Exception) {
                    // not JSON or not file transfer
                }

                onMessageReceived?.invoke(message)
                
                // Auto-respond to ping with pong
                if (message == "ping") {
                    sendMessage("pong")
                }
            }
            
            override fun onBufferedAmountChange(amount: Long) {}
        })
        
        dataChannel = dc
    }

    /**
     * Internal: Create Offer on specific PC
     */
    private fun createOfferInternal(pc: PeerConnection) {
        try {
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
            }
            
            pc.createOffer(object : SdpObserver {
                override fun onCreateSuccess(sdp: SessionDescription) {
                    Log.d(TAG, "Offer created successfully")
                    pc.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            Log.d(TAG, "Local description set")
                            onLocalSdp?.invoke(sdp)
                        }
                        override fun onSetFailure(error: String) {
                            Log.e(TAG, "Failed to set local description: $error")
                        }
                        override fun onCreateSuccess(p0: SessionDescription?) {}
                        override fun onCreateFailure(p0: String?) {}
                    }, sdp)
                }
                
                override fun onCreateFailure(error: String) {
                    Log.e(TAG, "Failed to create offer: $error")
                }
                
                override fun onSetSuccess() {}
                override fun onSetFailure(error: String?) {}
            }, constraints)
        } catch (e: Exception) {
            Log.e(TAG, "Exception creating offer", e)
        }
    }

    // Legacy public method
    fun createOffer() {
        peerConnection?.let { createOfferInternal(it) }
    }
    
    /**
     * Handle remote SDP answer from browser.
     */
    fun handleAnswer(sdp: String) {
        val pc = peerConnection ?: run {
            Log.e(TAG, "Cannot handle answer: PeerConnection is null")
            return
        }
        
        scope.launch {
            try {
                val answer = SessionDescription(SessionDescription.Type.ANSWER, sdp)
                pc.setRemoteDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        Log.d(TAG, "Remote description set successfully")
                        // Mark remote desc and flush pending remote ICE candidates
                        remoteDescriptionSet = true
                        synchronized(pendingRemoteCandidates) {
                            for (c in pendingRemoteCandidates) {
                                try {
                                    pc.addIceCandidate(c)
                                    Log.d(TAG, "Flushed queued ICE candidate: ${c.sdp}")
                                } catch (e: Exception) {
                                    Log.e(TAG, "Failed to add queued ICE candidate", e)
                                }
                            }
                            pendingRemoteCandidates.clear()
                        }
                    }
                    
                    override fun onSetFailure(error: String) {
                        Log.e(TAG, "Failed to set remote description: $error")
                    }
                    
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                }, answer)
            } catch (e: Exception) {
                Log.e(TAG, "Exception handling answer", e)
            }
        }
    }
    
    /**
     * Handle remote offer from browser (if browser initiates).
     */
    fun handleOffer(sdp: String) {
        val pc = peerConnection ?: run {
            Log.e(TAG, "Cannot handle offer: PeerConnection is null")
            return
        }
        
        scope.launch {
            try {
                val offer = SessionDescription(SessionDescription.Type.OFFER, sdp)
                pc.setRemoteDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        Log.d(TAG, "Remote offer set, creating answer")
                        // Mark remote desc and flush pending remote ICE candidates
                        remoteDescriptionSet = true
                        synchronized(pendingRemoteCandidates) {
                            for (c in pendingRemoteCandidates) {
                                try {
                                    pc.addIceCandidate(c)
                                    Log.d(TAG, "Flushed queued ICE candidate: ${c.sdp}")
                                } catch (e: Exception) {
                                    Log.e(TAG, "Failed to add queued ICE candidate", e)
                                }
                            }
                            pendingRemoteCandidates.clear()
                        }
                        createAnswer()
                    }
                    
                    override fun onSetFailure(error: String) {
                        Log.e(TAG, "Failed to set remote offer: $error")
                    }
                    
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                }, offer)
            } catch (e: Exception) {
                Log.e(TAG, "Exception handling offer", e)
            }
        }
    }
    
    /**
     * Create SDP answer - respond to browser's offer.
     */
    private fun createAnswer() {
        val pc = peerConnection ?: return
        
        val constraints = MediaConstraints()
        pc.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                Log.d(TAG, "Answer created successfully")
                pc.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        Log.d(TAG, "Local answer set")
                        onLocalSdp?.invoke(sdp)
                    }
                    override fun onSetFailure(error: String) {
                        Log.e(TAG, "Failed to set local answer: $error")
                    }
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                }, sdp)
            }
            
            override fun onCreateFailure(error: String) {
                Log.e(TAG, "Failed to create answer: $error")
            }
            
            override fun onSetSuccess() {}
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }
    
    /**
     * Add ICE candidate from remote peer.
     */
    fun addIceCandidate(candidate: String, sdpMid: String, sdpMLineIndex: Int) {
        val pc = peerConnection ?: run {
            Log.e(TAG, "Cannot add ICE candidate: PeerConnection is null")
            return
        }
        
        scope.launch {
            try {
                val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidate)
                if (!remoteDescriptionSet) {
                    synchronized(pendingRemoteCandidates) {
                        pendingRemoteCandidates.add(iceCandidate)
                        Log.d(TAG, "Queued remote ICE candidate (waiting for remote description): $candidate")
                    }
                } else {
                    pc.addIceCandidate(iceCandidate)
                    Log.d(TAG, "ICE candidate added: $candidate")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to add ICE candidate", e)
            }
        }
    }
    
    /**
     * Send a text message over DataChannel.
     */
    fun sendMessage(message: String) {
        val channel = dataChannel ?: run {
            Log.e(TAG, "Cannot send message: DataChannel is null")
            return
        }
        
        if (channel.state() != DataChannel.State.OPEN) {
            Log.w(TAG, "Cannot send message: DataChannel not open (state: ${channel.state()})")
            return
        }
        
        scope.launch {
            try {
                val bytes = message.toByteArray(StandardCharsets.UTF_8)
                val buffer = ByteBuffer.wrap(bytes)
                val dataBuffer = DataChannel.Buffer(buffer, false)
                
                val success = channel.send(dataBuffer)
                if (success) {
                    Log.d(TAG, "Message sent: $message")
                } else {
                    Log.e(TAG, "Failed to send message: $message")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Exception sending message", e)
            }
        }
    }
    
    /**
     * Clean up resources.
     */
    fun dispose() {
        // Capture references locally and clear globals immediately to avoid race conditions
        val oldDc = dataChannel
        val oldPc = peerConnection
        
        dataChannel = null
        peerConnection = null
        
        if (oldDc == null && oldPc == null) return

        scope.launch {
            try {
                oldDc?.unregisterObserver()
                oldDc?.close()
                oldDc?.dispose()
                
                oldPc?.close()
                oldPc?.dispose()
                
                Log.d(TAG, "WebRTC session disposed")
            } catch (e: Exception) {
                Log.e(TAG, "Error disposing session", e)
            }
        }
    }
    
    /**
     * Shutdown factory - call on app shutdown.
     */
    fun shutdown() {
        dispose()
        factory?.dispose()
        factory = null
        eglBase?.release()
        eglBase = null
        Log.d(TAG, "WebRTC factory shutdown")
    }
}
