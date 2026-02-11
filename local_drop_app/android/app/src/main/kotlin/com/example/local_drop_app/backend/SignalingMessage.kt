package com.example.local_drop_app.backend

import kotlinx.serialization.Serializable

@Serializable
data class SignalingMessage(
    val type: String,
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
    val code: Int? = null,
    val options: List<Int>? = null,
        val success: Boolean? = null,
)
