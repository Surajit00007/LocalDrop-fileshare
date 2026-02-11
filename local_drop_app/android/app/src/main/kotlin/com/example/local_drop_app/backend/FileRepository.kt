package com.example.local_drop_app.backend

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

class FileRepository(private val context: Context) {

    private val contentResolver: ContentResolver = context.contentResolver

    /**
     * Creates an output stream to write a received file.
     * Starts in the app's external files directory.
     */
    fun createOutputStream(fileName: String): OutputStream {
        // Sanitize filename to prevent directory traversal
        val safeName = fileName.replace("/", "_").replace("\\", "_")
        val file = File(context.getExternalFilesDir(null), safeName)
        return FileOutputStream(file)
    }

    /**
     * Opens an input stream for a file Uri (selected by the user to share).
     */
    fun openInputStream(uri: Uri): InputStream? {
        return contentResolver.openInputStream(uri)
    }

    /**
     * Gets file metadata (name, size) from a Uri.
     */
    fun getFileInfo(uri: Uri): Pair<String, Long>? {
        return contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            
            if (cursor.moveToFirst()) {
                val name = cursor.getString(nameIndex)
                val size = cursor.getLong(sizeIndex)
                Pair(name, size)
            } else {
                null
            }
        }
    }
}
