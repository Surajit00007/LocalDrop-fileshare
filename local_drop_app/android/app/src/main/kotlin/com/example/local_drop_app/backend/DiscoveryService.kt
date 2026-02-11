package com.example.local_drop_app.backend

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

/**
 * Advertise the service on the local network using mDNS (Bonjour/Zeroconf).
 * Service Type: "_http._tcp."
 */
class DiscoveryService(context: Context) {

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var registrationListener: NsdManager.RegistrationListener? = null
    private val serviceType = "_http._tcp."
    private val serviceName = "LocalDrop-${android.os.Build.MODEL}" // e.g. LocalDrop-Pixel_6

    fun registerService(port: Int) {
        val serviceInfo = NsdServiceInfo().apply {
            this.serviceName = this@DiscoveryService.serviceName
            this.serviceType = this@DiscoveryService.serviceType
            this.port = port
        }

        registrationListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(NsdServiceInfo: NsdServiceInfo) {
                // Save the service name. Android may have changed it in order to
                // resolve a conflict, so update the name you initially requested
                // with the name Android actually used.
                Log.d(TAG, "Service registered: ${NsdServiceInfo.serviceName}")
            }

            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                // Registration failed! Put debugging code here to determine why.
                Log.e(TAG, "Registration failed: $errorCode")
            }

            override fun onServiceUnregistered(arg0: NsdServiceInfo) {
                // Service has been unregistered. This only happens when you call
                // NsdManager.unregisterService() and pass in this listener.
                Log.d(TAG, "Service unregistered")
            }

            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                // Unregistration failed. Put debugging code here to determine why.
                Log.e(TAG, "Unregistration failed: $errorCode")
            }
        }

        nsdManager.registerService(
            serviceInfo,
            NsdManager.PROTOCOL_DNS_SD,
            registrationListener
        )
    }

    fun unregisterService() {
        registrationListener?.let {
            try {
                nsdManager.unregisterService(it)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering service", e)
            } finally {
                registrationListener = null
            }
        }
    }

    companion object {
        private const val TAG = "DiscoveryService"
    }
}
