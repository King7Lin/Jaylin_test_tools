package com.networkmesh

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.nio.ByteBuffer

/**
 * React Native WebSocket Server Module
 * 
 * Features:
 * - Start/Stop WebSocket server
 * - Accept client connections
 * - Send/Receive messages
 * - Event notification to JavaScript
 */
class WebSocketServerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "WebSocketServer"
        private const val MODULE_NAME = "WebSocketServerModule"
    }

    private var server: WSServer? = null
    private var isRunning = false

    override fun getName(): String = MODULE_NAME

    /**
     * Start WebSocket server
     * @param port Listen port
     * @param path WebSocket path (optional, path filtering not implemented yet)
     * @param promise Promise callback
     */
    @ReactMethod
    fun startServer(port: Int, path: String?, promise: Promise) {
        try {
            if (isRunning) {
                promise.reject("ALREADY_RUNNING", "WebSocket server is already running")
                return
            }

            Log.d(TAG, "Starting WebSocket server on port: $port")

            // Create server instance, listen on all network interfaces (0.0.0.0)
            server = WSServer(InetSocketAddress("0.0.0.0", port), reactApplicationContext)
            server?.start()
            isRunning = true

            Log.d(TAG, "WebSocket server started successfully, listening on: 0.0.0.0:$port")
            promise.resolve(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start WebSocket server", e)
            promise.reject("START_ERROR", "Start failed: ${e.message}", e)
        }
    }

    /**
     * Stop WebSocket server
     * @param promise Promise callback
     */
    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            if (!isRunning || server == null) {
                promise.reject("NOT_RUNNING", "WebSocket server is not running")
                return
            }

            Log.d(TAG, "Stopping WebSocket server")
            server?.stop()
            server = null
            isRunning = false

            Log.d(TAG, "WebSocket server stopped")
            promise.resolve(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop WebSocket server", e)
            promise.reject("STOP_ERROR", "Stop failed: ${e.message}", e)
        }
    }

    /**
     * Send message to specific client
     * @param clientId Client ID (IP:Port)
     * @param message Message content
     * @param promise Promise callback
     */
    @ReactMethod
    fun sendMessage(clientId: String, message: String, promise: Promise) {
        try {
            if (!isRunning || server == null) {
                promise.reject("NOT_RUNNING", "WebSocket server is not running")
                return
            }

            val sent = server?.sendToClient(clientId, message) ?: false
            if (sent) {
                promise.resolve(true)
            } else {
                promise.reject("SEND_ERROR", "Client not found or not connected: $clientId")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message", e)
            promise.reject("SEND_ERROR", "Send failed: ${e.message}", e)
        }
    }

    /**
     * Broadcast message to all clients
     * @param message Message content
     * @param promise Promise callback
     */
    @ReactMethod
    fun broadcast(message: String, promise: Promise) {
        try {
            if (!isRunning || server == null) {
                promise.reject("NOT_RUNNING", "WebSocket server is not running")
                return
            }

            server?.broadcast(message)
            promise.resolve(true)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to broadcast message", e)
            promise.reject("BROADCAST_ERROR", "Broadcast failed: ${e.message}", e)
        }
    }

    /**
     * Get all connected clients
     * @param promise Promise callback
     */
    @ReactMethod
    fun getConnectedClients(promise: Promise) {
        try {
            if (!isRunning || server == null) {
                promise.resolve(Arguments.createArray())
                return
            }

            val clients = server?.getConnectedClients() ?: emptyList()
            val array = Arguments.createArray()
            clients.forEach { array.pushString(it) }
            
            promise.resolve(array)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to get client list", e)
            promise.reject("GET_CLIENTS_ERROR", "Get failed: ${e.message}", e)
        }
    }

    /**
     * Close specific client connection
     * @param clientId Client ID
     * @param promise Promise callback
     */
    @ReactMethod
    fun closeClient(clientId: String, promise: Promise) {
        try {
            if (!isRunning || server == null) {
                promise.reject("NOT_RUNNING", "WebSocket server is not running")
                return
            }

            val closed = server?.closeClient(clientId) ?: false
            if (closed) {
                promise.resolve(true)
            } else {
                promise.reject("CLOSE_ERROR", "Client not found: $clientId")
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to close client", e)
            promise.reject("CLOSE_ERROR", "Close failed: ${e.message}", e)
        }
    }

    /**
     * Add listener (required by React Native 0.65+)
     * Used for NativeEventEmitter listener management
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Android doesn't need concrete implementation
        // This method is just to satisfy NativeEventEmitter requirements
    }

    /**
     * Remove listeners (required by React Native 0.65+)
     * Used for NativeEventEmitter listener management
     */
    @ReactMethod
    fun removeListeners(count: Int) {
        // Android doesn't need concrete implementation
        // This method is just to satisfy NativeEventEmitter requirements
    }

    /**
     * WebSocket server implementation
     */
    private class WSServer(
        address: InetSocketAddress,
        private val reactContext: ReactApplicationContext
    ) : WebSocketServer(address) {

        // Client connection mapping Map<ClientId, WebSocket>
        private val clients = mutableMapOf<String, WebSocket>()

        override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
            val clientId = getClientId(conn)
            clients[clientId] = conn

            Log.d(TAG, "New client connected: $clientId")

            // Send event to JS
            sendEvent("onOpen", createClientEvent(clientId))
        }

        override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
            val clientId = getClientId(conn)
            clients.remove(clientId)

            Log.d(TAG, "Client disconnected: $clientId, reason: $reason")

            // Send event to JS
            val params = Arguments.createMap().apply {
                putString("clientId", clientId)
                putInt("code", code)
                putString("reason", reason)
                putBoolean("remote", remote)
            }
            sendEvent("onClose", params)
        }

        override fun onMessage(conn: WebSocket, message: String) {
            val clientId = getClientId(conn)

            Log.d(TAG, "Received message from $clientId: ${message.take(100)}")

            // Send event to JS
            val params = Arguments.createMap().apply {
                putString("clientId", clientId)
                putString("message", message)
            }
            sendEvent("onMessage", params)
        }

        override fun onMessage(conn: WebSocket, message: ByteBuffer) {
            // Convert binary message to string
            val clientId = getClientId(conn)
            val text = String(message.array())
            
            Log.d(TAG, "Received binary message from $clientId")

            val params = Arguments.createMap().apply {
                putString("clientId", clientId)
                putString("message", text)
            }
            sendEvent("onMessage", params)
        }

        override fun onError(conn: WebSocket?, ex: Exception) {
            val clientId = conn?.let { getClientId(it) } ?: "unknown"
            
            Log.e(TAG, "WebSocket error: $clientId", ex)

            // Send event to JS
            val params = Arguments.createMap().apply {
                putString("clientId", clientId)
                putString("error", ex.message ?: "Unknown error")
            }
            sendEvent("onError", params)
        }

        override fun onStart() {
            Log.d(TAG, "WebSocket server started")
            sendEvent("onStart", null)
        }

        /**
         * Send message to specific client
         */
        fun sendToClient(clientId: String, message: String): Boolean {
            val client = clients[clientId]
            return if (client != null && client.isOpen) {
                client.send(message)
                true
            } else {
                false
            }
        }

        /**
         * Get all connected client IDs
         */
        fun getConnectedClients(): List<String> {
            return clients.keys.toList()
        }

        /**
         * Close specific client
         */
        fun closeClient(clientId: String): Boolean {
            val client = clients[clientId]
            return if (client != null) {
                client.close()
                true
            } else {
                false
            }
        }

        /**
         * Get client ID (IP:Port)
         */
        private fun getClientId(conn: WebSocket): String {
            val remoteAddress = conn.remoteSocketAddress
            return "${remoteAddress.address.hostAddress}:${remoteAddress.port}"
        }

        /**
         * Create client event parameters
         */
        private fun createClientEvent(clientId: String): WritableMap {
            return Arguments.createMap().apply {
                putString("clientId", clientId)
            }
        }

        /**
         * Send event to JavaScript
         */
        private fun sendEvent(eventName: String, params: WritableMap?) {
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("WebSocketServer:$eventName", params)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send event: $eventName", e)
            }
        }
    }

    /**
     * Cleanup when module is destroyed
     */
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            server?.stop()
            server = null
            isRunning = false
        } catch (e: Exception) {
            Log.e(TAG, "Error during cleanup", e)
        }
    }
}

