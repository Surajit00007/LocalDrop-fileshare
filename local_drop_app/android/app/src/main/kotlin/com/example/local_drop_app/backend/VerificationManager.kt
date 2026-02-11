package com.example.local_drop_app.backend

import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Manages the "Human-in-the-loop" verification process.
 * 
 * Flow:
 * 1. Client connects -> startVerificationSession()
 * 2. Server generates:
 *    - Correct Code (00-99) -> Shown on Android UI
 *    - Challenge (Correct + 3 Decoys) -> Sent to Client
 * 3. User selects code on Client
 * 4. Client sends code -> verifyCode()
 * 5. If match -> Session VERIFIED, WebRTC allowed. Update Android UI.
 * 6. If mismatch -> Session FAILED, Connection closed.
 */
class VerificationManager(
    private val onCodeGenerated: (sessionId: String, code: Int) -> Unit,
    private val onVerificationSuccess: (sessionId: String) -> Unit,
    private val onVerificationFailed: (sessionId: String) -> Unit
) {

    enum class State {
        CONNECTED,
        AWAITING_VERIFICATION,
        VERIFIED,
        FAILED
    }

    data class Session(
        val id: String,
        var state: State = State.CONNECTED,
        val correctCode: Int,
        val expiryJob: Job? = null
    )

    private val sessions = ConcurrentHashMap<String, Session>()
    private val random = SecureRandom()
    private val scope = CoroutineScope(Dispatchers.Default)

    fun startVerificationSession(sessionId: String): Challenge {
        // 1. Generate Correct Code (0-99)
        val correctCode = random.nextInt(100)
        
        // 2. Start Expiry Timer (60s)
        val job = scope.launch {
            delay(60_000)
            handleTimeout(sessionId)
        }

        val session = Session(
            id = sessionId,
            state = State.AWAITING_VERIFICATION,
            correctCode = correctCode,
            expiryJob = job
        )
        sessions[sessionId] = session

        // 3. Notify UI to display code
        onCodeGenerated(sessionId, correctCode)

        // 4. Generate Decoys for Client
        val options = mutableSetOf<Int>()
        options.add(correctCode)
        while (options.size < 4) {
            options.add(random.nextInt(100))
        }

        return Challenge(options.shuffled())
    }

    fun verifyCode(sessionId: String, code: Int): Boolean {
        val session = sessions[sessionId] ?: return false
        
        if (session.state != State.AWAITING_VERIFICATION) {
            return false // Too late or replay
        }

        session.expiryJob?.cancel()

        return if (code == session.correctCode) {
            session.state = State.VERIFIED
            onVerificationSuccess(sessionId)
            true
        } else {
            session.state = State.FAILED
            onVerificationFailed(sessionId)
            sessions.remove(sessionId)
            false
        }
    }

    fun isVerified(sessionId: String): Boolean {
        return sessions[sessionId]?.state == State.VERIFIED
    }

    fun cleanup(sessionId: String) {
        sessions[sessionId]?.expiryJob?.cancel()
        sessions.remove(sessionId)
    }

    private fun handleTimeout(sessionId: String) {
        val session = sessions[sessionId] ?: return
        if (session.state == State.AWAITING_VERIFICATION) {
            session.state = State.FAILED
            onVerificationFailed(sessionId)
            sessions.remove(sessionId)
            println("Verification timeout for session $sessionId")
        }
    }

    data class Challenge(val options: List<Int>)
}
