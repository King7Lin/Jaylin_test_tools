/**
 * UDPManager - Unified UDP Manager
 * ================================
 * Uses a single socket for both receiving and sending broadcasts
 * Handles device discovery through UDP broadcasting
 */
import dgram from 'react-native-udp';
import { encrypt, decrypt } from './encryption';

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

export default class UDPManager {
  constructor(config, onDeviceDiscovered) {
    this.config = config;
    this.onDeviceDiscovered = onDeviceDiscovered;

    // Unified UDP socket (both receive and send)
    this.socket = null;
    this.running = false;
    this.broadcastInterval = null;

    // Local device information
    this.localIP = null;
    this.clientCode = config.clientCode || '000000';
    this.deviceId = config.deviceId || 'default';

    // Configuration
    this.port = config.udp?.server?.port || 3399;
    this.broadcastAddress = config.udp?.client?.broadcastAddress || '255.255.255.255';
    this.broadcastIntervalMs = config.udp?.client?.broadcastInterval || 5000;
    this.enableEncryption = config.encryption?.enabled || false;
    
    // Save WebSocket Server port for UDP broadcast
    this.wsPort = config.webSocket?.server?.port || 8765;
    this.wsPath = config.webSocket?.server?.path || '/ws';

    console.log('[UDPManager] Initialized', {
      port: this.port,
      broadcastAddress: this.broadcastAddress,
      broadcastInterval: this.broadcastIntervalMs,
      encryption: this.enableEncryption,
    });
  }

  /**
   * Start UDP (unified initialization)
   * @param {string} localIP - Local IP address
   */
  async startServer(localIP) {
    if (this.running) {
      console.log('[UDPManager] Already running');
      return;
    }

    // Clean up old socket if exists
    if (this.socket) {
      console.log('[UDPManager] Cleaning up old socket');
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }
    
    try {
      this.localIP = localIP;

      // Create unified UDP socket
      this.socket = dgram.createSocket({
        type: 'udp4',
        reuseAddr: true, // Allow multiple programs to bind to same port
      });

      // Listen for messages (receive functionality)
      this.socket.on('message', (data, rinfo) => {
        this.handleReceivedMessage(data, rinfo);
      });

      // Listen for errors
      this.socket.on('error', error => {
        console.error('[UDPManager] UDP error:', error);
      });

      // Bind port
      await new Promise((resolve, reject) => {
        this.socket.bind(this.port, '0.0.0.0', async err => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.socket.setBroadcast(true);
      this.running = true;
      console.log(`[UDPManager] UDP started, port: ${this.port}`);

      // Start periodic broadcasting (send functionality)
      await this.sendBroadcast(); // Send immediately once
      this.broadcastInterval = setInterval(() => {
        this.sendBroadcast();
      }, this.broadcastIntervalMs);
    } catch (error) {
      console.error('[UDPManager] Start failed:', error);
      throw error;
    }
  }

  /**
   * Send broadcast (using same socket)
   */
  async sendBroadcast() {
    if (!this.socket || !this.running || !this.localIP) {
      return;
    }

    try {
      const message = {
        action: 'NETWORK_SEARCH',
        source: this.localIP,
        key: `${this.clientCode}_${this.deviceId}`,
        reqDateTime: formatDateTime(new Date()),
        // Add WebSocket Server info for other devices to know where to connect
        wsPort: this.wsPort,
        wsPath: this.wsPath,
      };

      let messageStr = JSON.stringify(message);
      if (this.enableEncryption) {
        messageStr = encrypt(messageStr);
      }

      // Use same socket to send
      await new Promise((resolve, reject) => {
        this.socket.send(
          messageStr,
          0,
          messageStr.length,
          this.port, // Send to same port
          this.broadcastAddress,
          err => (err ? reject(err) : resolve()),
        );
      });

      console.log('[UDPManager] Broadcast sent:', message);
    } catch (error) {
      console.error('[UDPManager] Send broadcast failed:', error);
    }
  }

  /**
   * Stop
   */
  async stop() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.socket) {
      return new Promise(resolve => {
        this.socket.close(() => {
          this.socket = null;
          this.running = false;
          console.log('[UDPManager] UDP stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Handle received message
   * @param {Buffer} data - Message data
   * @param {Object} rinfo - Remote info
   */
  handleReceivedMessage(data, rinfo) {
    try {
      let messageStr = data.toString();

      // Decrypt (if enabled)
      if (this.enableEncryption) {
        try {
          messageStr = decrypt(messageStr);
        } catch (error) {
          console.error('[UDPManager] Message decryption failed:', error);
          return;
        }
      }

      // Parse JSON
      const message = JSON.parse(messageStr);

      console.log('[UDPManager] Received broadcast message:', {
        from: rinfo.address,
        port: rinfo.port,
        message,
      });

      // Validate message format
      if (!this.validateMessage(message)) {
        console.warn('[UDPManager] Invalid message format:', message);
        return;
      }

      // Ignore own broadcast
      if (message.source === this.localIP) {
        console.log('[UDPManager] Ignoring own broadcast');
        return;
      }

      // Validate key (check if belongs to same peer)
      const expectedKey = `${this.clientCode}_${this.deviceId}`;
      if (message.key !== expectedKey) {
        console.log('[UDPManager] Key mismatch, ignoring:', {
          received: message.key,
          expected: expectedKey,
        });
        return;
      }

      // Notify discovered new device
      if (this.onDeviceDiscovered) {
        this.onDeviceDiscovered({
          ip: message.source,
          key: message.key,
          timestamp: message.reqDateTime,
          // Pass WebSocket Server port and path info
          wsPort: message.wsPort || 8765, // Compatible with old version, default 8765
          wsPath: message.wsPath || '/ws', // Compatible with old version, default /ws
          rawMessage: message,
        });
      }
    } catch (error) {
      console.error('[UDPManager] Handle received message failed:', error);
    }
  }

  /**
   * Validate message format
   * @param {Object} message - Message object
   * @returns {boolean} Valid or not
   */
  validateMessage(message) {
    return (
      message &&
      message.action === 'NETWORK_SEARCH' &&
      message.source &&
      message.key &&
      message.reqDateTime
    );
  }

  /**
   * Get local IP address
   * @returns {Promise<string|null>} Local IP address
   */
  static async getLocalIPAddress() {
    try {
      const NetworkInfo = require('react-native-network-info');
      const ip = await NetworkInfo.NetworkInfo.getIPV4Address();
      console.log('[UDPManager] Local IP:', ip);
      return ip;
    } catch (error) {
      console.error('[UDPManager] Get local IP failed:', error);
      return null;
    }
  }

  /**
   * Destroy instance
   */
  async destroy() {
    await this.stop();
    console.log('[UDPManager] Destroyed');
  }
}

