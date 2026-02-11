package com.example.local_drop_app.backend

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Simple chunking protocol (Phase 2)
 * - Send `file_meta` JSON: { type: "file_meta", fileId, name, size, chunkSize, totalChunks }
 * - Send `file_chunk` JSON for each chunk (base64 encoded):
 *   { type: "file_chunk", fileId, seq, data }
 * - Send `file_complete` when finished: { type: "file_complete", fileId }
 *
 * This is intentionally simple (base64 in JSON) to avoid binary framing complexities.
 */
object FileTransfer {
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(Dispatchers.Default)

    private const val DEFAULT_CHUNK_SIZE = 16 * 1024 // 16KB

    private val incomingBuffers = ConcurrentHashMap<String, java.util.TreeMap<Int, ByteArray>>()
    private val incomingMeta = ConcurrentHashMap<String, FileMeta>()

    // Callback: invoked when a full file is received
    var onFileReceived: ((fileName: String, data: ByteArray) -> Unit)? = null

    fun init(context: Context) {
        android.util.Log.d("FileTransfer", "FileTransfer initialized")
    }

    suspend fun sendFile(fileName: String, bytes: ByteArray) {
        scope.launch {
            try {
                val fileId = UUID.randomUUID().toString()
                val chunkSize = DEFAULT_CHUNK_SIZE
                val totalChunks = (bytes.size + chunkSize - 1) / chunkSize

                android.util.Log.d("FileTransfer", "Starting send: $fileName ($fileId), size=${bytes.size}, chunks=$totalChunks")

                val meta = FileMeta(type = "file_meta", fileId = fileId, name = fileName, size = bytes.size, chunkSize = chunkSize, totalChunks = totalChunks)
                WebRtcManager.sendMessage(json.encodeToString(FileMeta.serializer(), meta))

                for (i in 0 until totalChunks) {
                    val start = i * chunkSize
                    val end = kotlin.math.min(bytes.size, start + chunkSize)
                    val chunk = bytes.copyOfRange(start, end)
                    val b64 = Base64.encodeToString(chunk, Base64.NO_WRAP)
                    val chunkMsg = FileChunk(type = "file_chunk", fileId = fileId, seq = i, data = b64)
                    WebRtcManager.sendMessage(json.encodeToString(FileChunk.serializer(), chunkMsg))
                    if (i % 10 == 0) android.util.Log.d("FileTransfer", "Sent chunk $i/$totalChunks")
                }

                val complete = FileComplete(type = "file_complete", fileId = fileId)
                WebRtcManager.sendMessage(json.encodeToString(FileComplete.serializer(), complete))
                android.util.Log.d("FileTransfer", "Send complete signal sent for $fileId")

            } catch (e: Exception) {
                android.util.Log.e("FileTransfer", "Failed to send file", e)
            }
        }
    }

    fun handleIncoming(text: String) {
        try {
            val el = json.parseToJsonElement(text)
            val type = el.jsonObject["type"]?.jsonPrimitive?.contentOrNull ?: return

            when (type) {
                "file_meta" -> {
                    val meta = json.decodeFromString(FileMeta.serializer(), text)
                    incomingMeta[meta.fileId] = meta
                    incomingBuffers[meta.fileId] = java.util.TreeMap<Int, ByteArray>()
                    android.util.Log.d("FileTransfer", "Incoming file meta: ${meta.name}, size=${meta.size}, chunks=${meta.totalChunks}")
                }
                "file_chunk" -> {
                    val chunk = json.decodeFromString(FileChunk.serializer(), text)
                    val data = Base64.decode(chunk.data, Base64.NO_WRAP)
                    incomingBuffers[chunk.fileId]?.put(chunk.seq, data)
                    
                    val meta = incomingMeta[chunk.fileId]
                    if (chunk.seq % 10 == 0 || chunk.seq == (meta?.totalChunks ?: 0) - 1) {
                        android.util.Log.d("FileTransfer", "Received chunk ${chunk.seq} for ${chunk.fileId}")
                    }
                }
                "file_complete" -> {
                    val comp = json.decodeFromString(FileComplete.serializer(), text)
                    val partsMap = incomingBuffers.remove(comp.fileId) ?: return
                    val meta = incomingMeta.remove(comp.fileId)
                    
                    android.util.Log.d("FileTransfer", "Completing file transfer for ${meta?.name}")
                    
                    val totalSize = partsMap.values.sumOf { it.size }
                    val out = ByteArray(totalSize)
                    var pos = 0
                    // TreeMap values are sorted by key (seq)
                    for (p in partsMap.values) {
                        System.arraycopy(p, 0, out, pos, p.size)
                        pos += p.size
                    }
                    val name = meta?.name ?: "received_${System.currentTimeMillis()}"
                    android.util.Log.d("FileTransfer", "File fully assembled: $name, size=$totalSize. Savng...")
                    onFileReceived?.invoke(name, out)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("FileTransfer", "Failed to handle incoming transfer message: ${e.message}", e)
        }
    }
}

@Serializable
data class FileMeta(
    val type: String,
    val fileId: String,
    val name: String,
    val size: Int,
    val chunkSize: Int,
    val totalChunks: Int
)

@Serializable
data class FileChunk(
    val type: String,
    val fileId: String,
    val seq: Int,
    val data: String
)

@Serializable
data class FileComplete(
    val type: String,
    val fileId: String
)
