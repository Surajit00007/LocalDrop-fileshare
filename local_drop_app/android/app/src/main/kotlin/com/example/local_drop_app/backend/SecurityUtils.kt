package com.example.local_drop_app.backend

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

object SecurityUtils {

    /**
     * Generates a secure random session token.
     * This token should be embedded in the QR code and required for signaling connection.
     */
    fun generateSessionToken(): String {
        val random = SecureRandom()
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    /**
     * Calculates SHA-256 hash of a byte array.
     */
    fun calculateHash(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data)
        return bytesToHex(hash)
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val hexString = StringBuilder()
        for (byte in bytes) {
            val hex = Integer.toHexString(0xff and byte.toInt())
            if (hex.length == 1) hexString.append('0')
            hexString.append(hex)
        }
        return hexString.toString()
    }
}
