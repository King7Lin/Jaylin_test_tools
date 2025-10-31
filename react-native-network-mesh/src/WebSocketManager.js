/**
 * WebSocketManager - WebSocket Server and Client Manager
 * ================================
 * Manages WebSocket connections, message sending and receiving
 *
 * Server: Uses Android native WebSocket Server (Android only)
 * Client: Uses React Native built-in WebSocket
 *
 * Includes retry mechanism and heartbeat detection
 */
import { Platform } from 'react-native';
import { encrypt, decrypt } from './encryption';
import RequestList from './RequestList';
import NativeWebSocketServer from './NativeWebSocketServer';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

/**
 * Format date to YYYYMMDDHHmmssSSS
 */
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

export default class WebSocketManager {
  constructor(config, onMessageReceived) {
    this.config = config;
    this.onMessageReceived = onMessageReceived;

    // WebSocket server (using native module)
    this.server = null;
    this.serverRunning = false;
    this.serverConnections = new Set();

    // WebSocket clients Map<targetIP, ClientConnection>
    this.clients = new Map();

    // Request tracking list
    this.requestList = new RequestList(config.requestList);

    // Local device information
    this.localIP = null;

    // Configuration
    this.serverPort = config.webSocket?.server?.port || 8765;
    this.serverPath = config.webSocket?.server?.path || '/ws';
    this.maxConnections = config.webSocket?.server?.maxConnections || 50;
    this.maxRetry = config.webSocket?.client?.maxRetry || 3;
    this.timeout = config.webSocket?.client?.timeout || 30000;
    this.reconnectDelay = config.webSocket?.client?.reconnectDelay || 2000;
    this.heartbeatInterval = config.webSocket?.client?.heartbeatInterval || 30000;
    this.enableEncryption = config.encryption?.enabled || false;

    console.log('[WebSocketManager] Initialized', {
      platform: Platform.OS,
      serverPort: this.serverPort,
      serverPath: this.serverPath,
      maxRetry: this.maxRetry,
      timeout: this.timeout,
      encryption: this.enableEncryption,
    });
  }

  /**
   * Start WebSocket server
   * @param {string} localIP - Local IP address
   */
  async startServer(localIP) {
    if (this.serverRunning) {
      console.log('[WebSocketManager] WebSocket server already running');
      return;
    }

    this.localIP = localIP;

    // Only start native WebSocket Server on Android
    if (Platform.OS !== 'android') {
      console.warn('[WebSocketManager] WebSocket Server only supports Android platform');
      return;
    }

    try {
      this.server = NativeWebSocketServer;

      // Clean up old server instance first
      try {
        console.log('[WebSocketManager] Cleaning up old instance...');
        this.server.removeAllListeners();
        await this.server.stop();
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (cleanupError) {
        console.log('[WebSocketManager] Cleanup old instance:', cleanupError.message);
      }

      // Register event listeners
      this.server.on('onOpen', this.handleServerOpen.bind(this));
      this.server.on('onClose', this.handleServerClose.bind(this));
      this.server.on('onMessage', this.handleServerMessage.bind(this));
      this.server.on('onError', this.handleServerError.bind(this));
      this.server.on('onStart', this.handleServerStart.bind(this));

      // Start server
      await this.server.start(this.serverPort, this.serverPath);

      this.serverRunning = true;
      console.log(`[WebSocketManager] WebSocket server started, port: ${this.serverPort}`);
    } catch (error) {
      console.error('[WebSocketManager] Start WebSocket server failed:', error);

      if (error.message && error.message.includes('Address already in use')) {
        console.error('[WebSocketManager] Port still in use, please try restarting the app');
      }

      throw error;
    }
  }

  /**
   * Stop WebSocket server
   */
  async stopServer() {
    if (!this.server || !this.serverRunning) {
      return;
    }

    try {
      this.server.removeAllListeners?.();
      await this.server.stop();
      this.server = null;
      this.serverRunning = false;
      this.serverConnections.clear();

      console.log('[WebSocketManager] Server stopped');
    } catch (error) {
      console.error('[WebSocketManager] Stop server failed:', error);
    }
  }

  /**
   * Handle server start event
   */
  handleServerStart() {
    console.log('[WebSocketManager] Server startup complete');
  }

  /**
   * Handle new client connection (server side)
   */
  handleServerOpen(data) {
    const { clientId } = data;
    this.serverConnections.add(clientId);

    console.log(`[WebSocketManager] New client connected: ${clientId}, current connections: ${this.serverConnections.size}`);

    if (this.serverConnections.size > this.maxConnections) {
      console.warn('[WebSocketManager] Exceeded max connections, closing earliest connection');
    }
  }

  /**
   * Handle client disconnect (server side)
   */
  handleServerClose(data) {
    const { clientId, reason } = data;
    this.serverConnections.delete(clientId);

    console.log(`[WebSocketManager] Client disconnected: ${clientId}, reason: ${reason}`);
  }

  /**
   * Handle server received message
   */
  handleServerMessage(data) {
    const { clientId, message } = data;

    try {
      let messageStr = message;

      // Decrypt (if enabled)
      if (this.enableEncryption) {
        try {
          messageStr = decrypt(messageStr);
        } catch (error) {
          console.error('[WebSocketManager] Server message decryption failed:', error);
          return;
        }
      }

      // Parse JSON
      const messageObj = JSON.parse(messageStr);

      console.log('[WebSocketManager] Server received message:', {
        from: clientId,
        action: messageObj.action,
        msgType: messageObj.msgType,
      });

      // If it's a response, hand it to RequestList
      if (messageObj.msgType === 'response' && messageObj.requestUUID) {
        this.requestList.handleResponse(messageObj.requestUUID, messageObj);
      } else {
        // Request message, hand to external handler
        if (this.onMessageReceived) {
          this.onMessageReceived(messageObj, clientId, response => {
            this.sendToServer(clientId, response);
          });
        }
      }
    } catch (error) {
      console.error('[WebSocketManager] Handle server message failed:', error);
    }
  }

  /**
   * Handle server error
   */
  handleServerError(data) {
    const { clientId, error } = data;
    console.error(`[WebSocketManager] Server error [${clientId}]:`, error, data);
  }

  /**
   * Server send message to client
   */
  async sendToServer(clientId, message) {
    if (!this.server || !this.serverRunning) {
      throw new Error('WebSocket server not running');
    }

    try {
      let messageStr = JSON.stringify(message);

      // Encrypt (if enabled)
      if (this.enableEncryption) {
        messageStr = encrypt(messageStr);
      }

      await this.server.sendMessage(clientId, messageStr);
    } catch (error) {
      console.error('[WebSocketManager] Server send message failed:', error);
      throw error;
    }
  }

  /**
   * Server broadcast message to all clients
   */
  async broadcastFromServer(message) {
    if (!this.server || !this.serverRunning) {
      throw new Error('WebSocket server not running');
    }

    try {
      let messageStr = JSON.stringify(message);

      // Encrypt (if enabled)
      if (this.enableEncryption) {
        messageStr = encrypt(messageStr);
      }

      await this.server.broadcast(messageStr);
    } catch (error) {
      console.error('[WebSocketManager] Server broadcast failed:', error);
      throw error;
    }
  }

  // ============================================
  // WebSocket Client (using React Native built-in WebSocket)
  // ============================================

  /**
   * Connect to specified WebSocket server
   * @param {string} targetIP - Target IP address
   * @param {number} wsPort - WebSocket Server port (optional)
   * @param {string} wsPath - WebSocket Server path (optional)
   * @returns {Promise<boolean>} Connection success or not
   */
  async connectToServer(targetIP, wsPort, wsPath) {
    // If already connected, return success
    if (this.clients.has(targetIP)) {
      const client = this.clients.get(targetIP);
      if (client.connected) {
        console.log(`[WebSocketManager] Already connected to ${targetIP}`);
        return true;
      }
      // If connecting, wait for connection to complete
      if (client.connecting) {
        console.log(`[WebSocketManager] Connecting to ${targetIP}, waiting...`);
        return this.waitForConnection(targetIP, this.timeout);
      }
    }

    // Create client connection object
    const client = {
      ws: null,
      connected: false,
      connecting: false,
      retryCount: 0,
      heartbeatTimer: null,
      reconnectTimer: null,
      connectionPromise: null,
      initialResolve: null,
      targetPort: wsPort || this.serverPort,
      targetPath: wsPath || this.serverPath,
    };

    this.clients.set(targetIP, client);

    // Attempt connection and wait for result
    const success = await this.attemptConnect(targetIP, true);
    return success;
  }

  /**
   * Wait for connection to complete
   */
  async waitForConnection(targetIP, timeout) {
    const startTime = Date.now();

    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        const client = this.clients.get(targetIP);

        if (!client) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        if (client.connected) {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        if (!client.connecting || Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(client.connected);
          return;
        }
      }, 100);
    });
  }

  /**
   * Disconnect from specified server
   */
  disconnectFromServer(targetIP, handlePendingRequests = true) {
    const client = this.clients.get(targetIP);

    if (!client) {
      console.log(`[WebSocketManager] Client doesn't exist, no need to disconnect: ${targetIP}`);
      return;
    }

    console.log(`[WebSocketManager] Disconnecting from ${targetIP}...`);

    // Clear timers
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
      client.heartbeatTimer = null;
    }

    if (client.reconnectTimer) {
      clearTimeout(client.reconnectTimer);
      client.reconnectTimer = null;
    }

    // Close WebSocket
    if (client.ws) {
      try {
        client.ws.onopen = null;
        client.ws.onmessage = null;
        client.ws.onerror = null;
        client.ws.onclose = null;
        client.ws.close();
      } catch (e) {
        console.warn(`[WebSocketManager] Error closing WebSocket:`, e);
      } finally {
        client.ws = null;
      }
    }

    client.connected = false;
    client.connecting = false;
    
    if (client.initialResolve) {
      client.initialResolve = null;
    }

    // Batch handle pending request errors for this IP
    if (handlePendingRequests) {
      const error = new Error(`Connection disconnected: ${targetIP}`);
      this.requestList.handleErrorByTargetIP(targetIP, error);
    }

    // Delete client
    this.clients.delete(targetIP);

    console.log(`[WebSocketManager] Disconnected from ${targetIP}`);
  }

  /**
   * Attempt to connect to target server
   */
  async attemptConnect(targetIP, isInitial = false) {
    const client = this.clients.get(targetIP);

    if (!client || client.connecting) {
      return false;
    }
    
    // Thoroughly clean up old WebSocket connection
    if (client.ws) {
      try {
        client.ws.onopen = null;
        client.ws.onmessage = null;
        client.ws.onerror = null;
        client.ws.onclose = null;
        client.ws.close();
      } catch (e) {
        console.warn(`[WebSocketManager] Cleanup old connection failed:`, e);
      } finally {
        client.ws = null;
      }
    }

    client.connecting = true;
    client.connected = false;

    return new Promise(resolve => {
      let resolved = false;
      
      const safeResolve = (value) => {
        if (!resolved) {
          resolved = true;
          
          if (!isInitial && client && client.initialResolve) {
            client.initialResolve(value);
          } else {
            resolve(value);
          }
        }
      };
      
      if (isInitial) {
        client.initialResolve = safeResolve;
      }

      try {
        const url = `ws://${targetIP}:${client.targetPort}${client.targetPath}`;
        console.log(`[WebSocketManager] Connecting to: ${url}, attempt: ${client.retryCount + 1}/${this.maxRetry + 1}`);

        const ws = new WebSocket(url);

        // Set timeout
        const connectTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN && !resolved) {
            console.warn(`[WebSocketManager] Connection timeout: ${targetIP}`);
            
            const currentClient = this.clients.get(targetIP);
            if (!currentClient) {
              console.warn(`[WebSocketManager] Client already deleted: ${targetIP}`);
              safeResolve(false);
              return;
            }
            
            currentClient.connecting = false;
            currentClient.connected = false;
            
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            
            try {
              ws.close();
            } catch (e) {
              console.error('[WebSocketManager] Close WebSocket failed:', e);
            }
            
            currentClient.ws = null;
            
            this.handleReconnect(targetIP, false);
          }
        }, this.timeout);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          console.log(`[WebSocketManager] Connection successful: ${targetIP}`);

          const currentClient = this.clients.get(targetIP);
          if (!currentClient) {
            console.warn(`[WebSocketManager] Client already deleted: ${targetIP}`);
            ws.close();
            return;
          }

          currentClient.ws = ws;
          currentClient.connected = true;
          currentClient.connecting = false;
          currentClient.retryCount = 0;

          // Start heartbeat
          this.startHeartbeat(targetIP);

          safeResolve(true);
          
          if (currentClient.initialResolve) {
            currentClient.initialResolve = null;
          }
        };

        ws.onmessage = event => {
          try {
            this.handleClientMessage(event.data, targetIP);
          } catch (error) {
            console.error(`[WebSocketManager] Handle message exception ${targetIP}:`, error);
          }
        };

        ws.onerror = error => {
          try {
            clearTimeout(connectTimeout);
            const currentClient = this.clients.get(targetIP);
            if (!currentClient) {
              console.warn(`[WebSocketManager] Client already deleted: ${targetIP}`);
              return;
            }
            
            const errorMsg = error?.message || error?.type || 'Unknown error';
            console.error(`[WebSocketManager] Client error ${targetIP}:`, errorMsg);
            currentClient.connecting = false;
          } catch (e) {
            console.error(`[WebSocketManager] onerror handler exception:`, e);
            safeResolve(false);
          }
        };

        ws.onclose = event => {
          try {
            clearTimeout(connectTimeout);
            const currentClient = this.clients.get(targetIP);
            if (!currentClient) {
              console.warn(`[WebSocketManager] Client already deleted: ${targetIP}`);
              safeResolve(false);
              return;
            }

            const closeCode = event?.code || 'unknown';
            const closeReason = event?.reason || 'unknown';
            console.log(`[WebSocketManager] Client connection closed: ${targetIP}, code: ${closeCode}, reason: ${closeReason}`);

            const wasConnected = currentClient.connected;
            currentClient.connected = false;
            currentClient.connecting = false;
            currentClient.ws = null;

            // Stop heartbeat
            this.stopHeartbeat(targetIP);

            this.handleReconnect(targetIP, wasConnected);
          } catch (e) {
            console.error(`[WebSocketManager] onclose handler exception:`, e);
            safeResolve(false);
          }
        };
      } catch (error) {
        console.error(`[WebSocketManager] Connection failed ${targetIP}:`, error);
        client.connecting = false;
        safeResolve(false);
      }
    });
  }

  /**
   * Handle reconnect
   */
  handleReconnect(targetIP, wasConnected = false) {
    const client = this.clients.get(targetIP);

    if (!client) {
      console.log(`[WebSocketManager] Client doesn't exist, cancel reconnect: ${targetIP}`);
      return;
    }

    // Clear old reconnect timer
    if (client.reconnectTimer) {
      clearTimeout(client.reconnectTimer);
      client.reconnectTimer = null;
    }

    // Increment retry count
    client.retryCount++;

    // Check if exceeded max retry count
    if (client.retryCount > this.maxRetry) {
      console.warn(`[WebSocketManager] Reached max retry count (${this.maxRetry}), deleting client: ${targetIP}`);
      
      const error = new Error(`Connection failed: ${targetIP} reached max retry count (${this.maxRetry})`);
      this.requestList.handleErrorByTargetIP(targetIP, error);
      
      if (!wasConnected && client.initialResolve) {
        client.initialResolve(false);
        client.initialResolve = null;
      }
      
      this.disconnectFromServer(targetIP, false);
      return;
    }

    // Calculate delay time
    const delay = this.reconnectDelay * client.retryCount;
    console.log(`[WebSocketManager] Will reconnect in ${delay}ms: ${targetIP} (attempt ${client.retryCount + 1}, total ${this.maxRetry + 1})`);

    client.reconnectTimer = setTimeout(() => {
      const currentClient = this.clients.get(targetIP);
      if (currentClient && !currentClient.connected && !currentClient.connecting) {
        this.attemptConnect(targetIP, false);
      } else if (!currentClient && client.initialResolve) {
        client.initialResolve(false);
        client.initialResolve = null;
      }
    }, delay);
  }

  /**
   * Handle client received message
   */
  handleClientMessage(data, targetIP) {
    try {
      let messageStr = data;

      // Decrypt (if enabled)
      if (this.enableEncryption) {
        try {
          messageStr = decrypt(messageStr);
        } catch (error) {
          console.error('[WebSocketManager] Message decryption failed:', error);
          return;
        }
      }

      // Parse JSON
      const message = JSON.parse(messageStr);

      console.log('[WebSocketManager] Client received message:', {
        from: targetIP,
        action: message.action,
        msgType: message.msgType,
      });

      // If it's a response, hand to RequestList
      if (message.msgType === 'response' && message.requestUUID) {
        this.requestList.handleResponse(message.requestUUID, message);
      } else {
        // Request message, hand to external handler
        if (this.onMessageReceived) {
          this.onMessageReceived(message, targetIP, response => {
            this.send([targetIP], response);
          });
        }
      }
    } catch (error) {
      console.error('[WebSocketManager] Handle client message failed:', error);
    }
  }

  /**
   * Start heartbeat
   */
  startHeartbeat(targetIP) {
    const client = this.clients.get(targetIP);

    if (!client) {
      return;
    }

    // Clear old heartbeat timer
    this.stopHeartbeat(targetIP);

    // Start new heartbeat timer
    client.heartbeatTimer = setInterval(() => {
      if (client.connected && client.ws && client.ws.readyState === WebSocket.OPEN) {
        const heartbeat = {
          action: 'heartbeat',
          msgType: 'request',
          payload: null,
          requestUUID: `heartbeat_${Date.now()}`,
          requestDateTime: formatDateTime(new Date()),
        };

        this.sendMessage(client.ws, heartbeat);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(targetIP) {
    const client = this.clients.get(targetIP);

    if (client && client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
      client.heartbeatTimer = null;
    }
  }

  /**
   * Send message to specified WebSocket
   */
  sendMessage(ws, message) {
    try {
      let messageStr = JSON.stringify(message);

      // Encrypt (if enabled)
      if (this.enableEncryption) {
        messageStr = encrypt(messageStr);
      }

      ws.send(messageStr);
    } catch (error) {
      console.error('[WebSocketManager] Send message failed:', error);
      throw error;
    }
  }

  /**
   * Send message to specified IP list
   */
  async send(targetIPs, message) {
    const results = {
      success: [],
      failed: [],
    };

    for (const targetIP of targetIPs) {
      try {
        const client = this.clients.get(targetIP);

        if (!client || !client.connected || !client.ws) {
          console.warn(`[WebSocketManager] Client not connected: ${targetIP}`);
          results.failed.push(targetIP);
          continue;
        }

        // If it's a request, add to RequestList
        if (message.msgType === 'request' && message.requestUUID) {
          return new Promise((resolve, reject) => {
            this.requestList.addRequest(
              message.requestUUID,
              message,
              response => {
                results.success.push(targetIP);
                resolve({ targetIP, response });
              },
              (request, retryCount) => {
                console.log(`[WebSocketManager] Resending request to ${targetIP}, retry: ${retryCount}`);
                const currentClient = this.clients.get(targetIP);
                if (currentClient?.connected && currentClient?.ws) {
                  this.sendMessage(currentClient.ws, request);
                } else {
                  console.warn(`[WebSocketManager] Client disconnected during retry: ${targetIP}`);
                }
              },
              error => {
                results.failed.push(targetIP);
                reject(error);
              },
              targetIP,
            );

            // Send message
            try {
              this.sendMessage(client.ws, message);
            } catch (error) {
              this.requestList.handleError(
                message.requestUUID,
                new Error(`Send message failed: ${error.message}`),
              );
              throw error;
            }
          });
        } else {
          // Regular message or response, send directly
          this.sendMessage(client.ws, message);
          results.success.push(targetIP);
        }
      } catch (error) {
        console.error(`[WebSocketManager] Send to ${targetIP} failed:`, error);
        results.failed.push(targetIP);
      }
    }

    return results;
  }

  /**
   * Broadcast message to all connected clients
   */
  async broadcast(message) {
    const targetIPs = Array.from(this.clients.keys());
    return this.send(targetIPs, message);
  }

  /**
   * Get all connected device IPs
   */
  getConnectedIPs() {
    const connected = [];

    for (const [ip, client] of this.clients.entries()) {
      if (client.connected) {
        connected.push(ip);
      }
    }

    return connected;
  }

  /**
   * Check if connected to specified IP
   */
  isConnected(targetIP) {
    const client = this.clients.get(targetIP);
    return client ? client.connected : false;
  }

  /**
   * Generate request UUID
   */
  static generateRequestUUID() {
    return uuidv4();
  }

  /**
   * Destroy manager
   */
  async destroy() {
    // Stop server
    await this.stopServer();

    // Disconnect all clients
    for (const targetIP of this.clients.keys()) {
      this.disconnectFromServer(targetIP);
    }

    this.clients.clear();
    this.requestList.destroy();
    this.requestList = null;

    console.log('[WebSocketManager] Destroyed');
  }
}

