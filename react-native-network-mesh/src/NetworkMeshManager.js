/**
 * NetworkMeshManager - Main Network Mesh Manager
 * ================================
 * Coordinates UDP and WebSocket modules
 * Implements complete local network device discovery and communication
 */

import WebSocketManager from './WebSocketManager';
import { mergeConfig } from './config';
import { initEncryption } from './encryption';
import UDPManager from './UDPManager';

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

export default class NetworkMeshManager {
  // Singleton instance
  static instance = null;

  constructor(userConfig = {}) {
    // Merge configuration
    this.config = mergeConfig(userConfig);

    // Initialize encryption
    initEncryption(this.config.encryption);

    // Local device information
    this.localIP = null;

    // Discovered devices list Map<ip, DeviceInfo>
    this.discoveredDevices = new Map();

    // UDP manager
    this.udpManager = null;

    // WebSocket manager
    this.wsManager = null;

    // Running status
    this.running = false;

    // Message handlers
    this.messageHandlers = new Map();

    console.log('[NetworkMeshManager] Initialized', this.config);
  }

  /**
   * Get singleton instance
   * @param {Object} userConfig - Configuration object (only used on first creation)
   * @returns {NetworkMeshManager} Singleton instance
   */
  static getInstance(userConfig = {}) {
    if (!NetworkMeshManager.instance) {
      NetworkMeshManager.instance = new NetworkMeshManager(userConfig);
    }
    return NetworkMeshManager.instance;
  }

  /**
   * Start service
   * @param {string} localIP - Local IP address (optional, will auto-detect if not provided)
   */
  async start(localIP = null) {
    // Clean up old instances (handle reload scenario)
    if (this.running || this.wsManager || this.udpManager) {
      console.log('[NetworkMeshManager] Cleaning up old service...');
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    try {
      // Get local IP
      if (!localIP) {
        this.localIP = await UDPManager.getLocalIPAddress();
      } else {
        this.localIP = localIP;
      }

      if (!this.localIP) {
        throw new Error('Unable to get local IP address');
      }

      console.log('[NetworkMeshManager] Local IP:', this.localIP);

      // Create UDP manager
      this.udpManager = new UDPManager(
        this.config,
        this.handleDeviceDiscovered.bind(this),
      );

      // Create WebSocket manager
      this.wsManager = new WebSocketManager(
        this.config,
        this.handleMessageReceived.bind(this),
      );

      // Start UDP server and broadcasting
      await this.udpManager.startServer(this.localIP);
      console.log('[NetworkMeshManager] UDP server started successfully');
      
      // Start WebSocket server
      await this.wsManager.startServer(this.localIP);
      console.log('[NetworkMeshManager] WebSocket server started successfully');
      
      this.running = true;
      console.log('[NetworkMeshManager] Service started');
    } catch (error) {
      console.error('[NetworkMeshManager] Start service failed:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop service
   */
  async stop() {
    console.log('[NetworkMeshManager] Stopping service...');

    try {
      // Stop UDP
      if (this.udpManager) {
        try {
          await this.udpManager.stop();
        } catch (error) {
          console.error('[NetworkMeshManager] Stop UDP failed:', error);
        }
        this.udpManager = null;
      }

      // Stop WebSocket
      if (this.wsManager) {
        try {
          await this.wsManager.destroy();
        } catch (error) {
          console.error('[NetworkMeshManager] Stop WebSocket failed:', error);
        }
        this.wsManager = null;
      }

      this.running = false;
      console.log('[NetworkMeshManager] Service stopped');
    } catch (error) {
      console.error('[NetworkMeshManager] Stop service failed:', error);
      // Reset status even if failed
      this.running = false;
      this.udpManager = null;
      this.wsManager = null;
    }
  }

  /**
   * Handle discovered device
   */
  async handleDeviceDiscovered(deviceInfo) {
    console.log('[NetworkMeshManager] Discovered device:', deviceInfo);

    const { ip, key, wsPort, wsPath } = deviceInfo;

    const isSameGroup = key === `${this.config.clientCode}_${this.config.deviceId}`;
    if (!isSameGroup) {
      console.log('[NetworkMeshManager] Device not in same group, ignoring');
      return;
    }
    
    // Update device list
    this.discoveredDevices.set(ip, {
      ...deviceInfo,
      lastSeen: Date.now(),
    });

    // Check if already connected to this device's WebSocket
    if (!this.wsManager.isConnected(ip)) {
      console.log(`[NetworkMeshManager] Attempting to connect to device WebSocket: ${ip}:${wsPort}${wsPath}`);

      try {
        const connected = await this.wsManager.connectToServer(ip, wsPort, wsPath);

        if (connected) {
          console.log(`[NetworkMeshManager] Successfully connected to device: ${ip}`);
        } else {
          console.warn(`[NetworkMeshManager] Failed to connect to device: ${ip}`);
        }
      } catch (error) {
        console.error(`[NetworkMeshManager] Exception connecting to device: ${ip}`, error);
      }
    } else {
      console.log(`[NetworkMeshManager] Already connected to device: ${ip}`);
    }
  }

  /**
   * Handle received message
   */
  handleMessageReceived(message, sourceIP, reply) {
    // Automatically handle heartbeat messages without logging
    if (message.action === 'heartbeat') {
      if (message.msgType === 'request') {
        // Auto-reply heartbeat response
        reply({
          action: 'heartbeat',
          msgType: 'response',
          payload: { status: 'alive' },
          result: 0,
          resultMsg: 'SUCCESS',
          requestUUID: message.requestUUID,
          responseDateTime: formatDateTime(new Date()),
        });
      }
      // Heartbeat message handling complete, don't continue
      return;
    }

    console.log('[NetworkMeshManager] Received message:', {
      from: sourceIP,
      action: message.action,
      msgType: message.msgType,
    });

    // Find corresponding message handler
    const handler = this.messageHandlers.get(message.action);

    if (handler) {
      try {
        handler(message, sourceIP, reply);
      } catch (error) {
        console.error(`[NetworkMeshManager] Handle message failed (${message.action}):`, error);

        // If it's a request, send error response
        if (message.msgType === 'request') {
          reply({
            action: message.action,
            msgType: 'response',
            payload: null,
            result: -1,
            resultMsg: 'FAILED',
            error: 500,
            errorMsg: error.message || 'Internal error',
            requestUUID: message.requestUUID,
            responseDateTime: formatDateTime(new Date()),
          });
        }
      }
    } else {
      console.warn(`[NetworkMeshManager] Message handler not found: ${message.action}`);

      // If it's a request, send unknown action response
      if (message.msgType === 'request') {
        reply({
          action: message.action,
          msgType: 'response',
          payload: null,
          result: -1,
          resultMsg: 'FAILED',
          error: 404,
          errorMsg: 'Unknown action',
          requestUUID: message.requestUUID,
          responseDateTime: formatDateTime(new Date()),
        });
      }
    }
  }

  /**
   * Register message handler
   * @param {string} action - Action name
   * @param {Function} handler - Handler function (message, sourceIP, reply) => void
   */
  registerHandler(action, handler) {
    this.messageHandlers.set(action, handler);
    console.log(`[NetworkMeshManager] Registered message handler: ${action}`);
  }

  /**
   * Unregister message handler
   * @param {string} action - Action name
   */
  unregisterHandler(action) {
    this.messageHandlers.delete(action);
    console.log(`[NetworkMeshManager] Unregistered message handler: ${action}`);
  }

  /**
   * Send request to specified device
   * @param {string} targetIP - Target IP
   * @param {string} action - Action name
   * @param {any} payload - Message content
   * @returns {Promise<Object>} Response result
   */
  async sendRequest(targetIP, action, payload = null) {
    if (!this.running) {
      throw new Error('Service not running');
    }

    // Generate request
    const request = {
      action,
      msgType: 'request',
      payload,
      requestUUID: WebSocketManager.generateRequestUUID(),
      requestDateTime: formatDateTime(new Date()),
    };

    console.log('[NetworkMeshManager] Sending request:', {
      to: targetIP,
      action,
      requestUUID: request.requestUUID,
    });

    try {
      // Ensure connected
      if (!this.wsManager.isConnected(targetIP)) {
        console.log(`[NetworkMeshManager] Not connected to ${targetIP}, attempting connection...`);
        
        // Get port info from discovered devices
        const deviceInfo = this.discoveredDevices.get(targetIP);
        const wsPort = deviceInfo?.wsPort;
        const wsPath = deviceInfo?.wsPath;
        
        const connected = await this.wsManager.connectToServer(targetIP, wsPort, wsPath);

        if (!connected) {
          throw new Error(`Unable to connect to device: ${targetIP}`);
        }
      }

      // Send request
      const result = await this.wsManager.send([targetIP], request);

      return result;
    } catch (error) {
      console.error('[NetworkMeshManager] Send request failed:', error);
      throw error;
    }
  }

  /**
   * Broadcast request to all devices
   * @param {string} action - Action name
   * @param {any} payload - Message content
   * @returns {Promise<Array>} Response results array
   */
  async broadcastRequest(action, payload = null) {
    if (!this.running) {
      throw new Error('Service not running');
    }

    const connectedIPs = this.wsManager.getConnectedIPs();

    if (connectedIPs.length === 0) {
      console.warn('[NetworkMeshManager] No connected devices');
      return [];
    }

    console.log(`[NetworkMeshManager] Broadcasting request to ${connectedIPs.length} devices:`, action);

    const results = [];

    // Send one by one (because each request needs to wait for response)
    for (const targetIP of connectedIPs) {
      try {
        const result = await this.sendRequest(targetIP, action, payload);
        results.push({
          targetIP,
          success: true,
          data: result,
        });
      } catch (error) {
        console.error(`[NetworkMeshManager] Broadcast to ${targetIP} failed:`, error);
        results.push({
          targetIP,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Send response
   * @param {string} targetIP - Target IP
   * @param {Object} request - Original request
   * @param {any} payload - Response content
   * @param {number} result - Result code (0=SUCCESS, -1=FAILED)
   * @param {string} resultMsg - Result message
   * @param {number} error - Error code
   * @param {string} errorMsg - Error message
   */
  async sendResponse(
    targetIP,
    request,
    payload = null,
    result = 0,
    resultMsg = 'SUCCESS',
    error = null,
    errorMsg = null,
  ) {
    if (!this.running) {
      throw new Error('Service not running');
    }

    const response = {
      action: request.action,
      msgType: 'response',
      payload,
      result,
      resultMsg,
      error,
      errorMsg,
      requestUUID: request.requestUUID,
      responseDateTime: formatDateTime(new Date()),
    };

    console.log('[NetworkMeshManager] Sending response:', {
      to: targetIP,
      action: request.action,
      requestUUID: request.requestUUID,
      result,
    });

    try {
      await this.wsManager.send([targetIP], response);
    } catch (err) {
      console.error('[NetworkMeshManager] Send response failed:', err);
      throw err;
    }
  }

  /**
   * Get discovered devices list
   * @returns {Array} Device list
   */
  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Get connected devices list
   * @returns {Array} IP address list
   */
  getConnectedDevices() {
    return this.wsManager ? this.wsManager.getConnectedIPs() : [];
  }

  /**
   * Check if connected to specified device
   * @param {string} targetIP - Target IP
   * @returns {boolean} Connected or not
   */
  isConnected(targetIP) {
    return this.wsManager && this.wsManager.isConnected(targetIP);
  }

  /**
   * Disconnect from specified device
   * @param {string} targetIP - Target IP
   */
  disconnectDevice(targetIP) {
    if (this.wsManager) {
      this.wsManager.disconnectFromServer(targetIP);
    }

    this.discoveredDevices.delete(targetIP);
  }

  /**
   * Get running status
   * @returns {boolean} Running or not
   */
  isRunning() {
    return this.running;
  }

  /**
   * Get local IP
   * @returns {string|null} Local IP address
   */
  getLocalIP() {
    return this.localIP;
  }

  /**
   * Destroy instance
   */
  async destroy() {
    await this.stop();

    this.messageHandlers.clear();
    this.discoveredDevices.clear();

    console.log('[NetworkMeshManager] Destroyed');
  }
}

