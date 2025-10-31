/**
 * Native WebSocket Server Wrapper
 * ================================
 * JavaScript wrapper for Android native WebSocket Server module
 * Provides event listening and message sending functionality
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WebSocketServerModule } = NativeModules;

// Create event emitter
const eventEmitter = WebSocketServerModule
  ? new NativeEventEmitter(WebSocketServerModule)
  : null;

/**
 * Native WebSocket Server Class
 */
class NativeWebSocketServer {
  constructor() {
    this.listeners = new Map();
    this.isRunning = false;
  }

  /**
   * Start WebSocket server
   * @param {number} port - Listen port
   * @param {string} path - WebSocket path (optional)
   * @returns {Promise<boolean>}
   */
  async start(port, path = '/ws') {
    if (Platform.OS !== 'android') {
      throw new Error('Native WebSocket Server only supports Android platform');
    }

    if (!WebSocketServerModule) {
      throw new Error('WebSocketServerModule not found, please check if native module is installed correctly');
    }

    try {
      await WebSocketServerModule.startServer(port, path);
      this.isRunning = true;
      console.log(`[NativeWebSocketServer] Server started, port: ${port}`);
      return true;
    } catch (error) {
      console.error('[NativeWebSocketServer] Start failed:', error);
      throw error;
    }
  }

  /**
   * Stop WebSocket server
   * @returns {Promise<boolean>}
   */
  async stop() {
    if (!WebSocketServerModule) {
      throw new Error('WebSocketServerModule not found');
    }

    try {
      await WebSocketServerModule.stopServer();
      this.isRunning = false;
      
      // Remove all listeners
      this.removeAllListeners();
      
      console.log('[NativeWebSocketServer] Server stopped');
      return true;
    } catch (error) {
      console.error('[NativeWebSocketServer] Stop failed:', error);
      throw error;
    }
  }

  /**
   * Send message to specific client
   * @param {string} clientId - Client ID (IP:Port)
   * @param {string} message - Message content
   * @returns {Promise<boolean>}
   */
  async sendMessage(clientId, message) {
    if (!WebSocketServerModule) {
      throw new Error('WebSocketServerModule not found');
    }

    try {
      await WebSocketServerModule.sendMessage(clientId, message);
      return true;
    } catch (error) {
      console.error('[NativeWebSocketServer] Send message failed:', error);
      throw error;
    }
  }

  /**
   * Broadcast message to all clients
   * @param {string} message - Message content
   * @returns {Promise<boolean>}
   */
  async broadcast(message) {
    if (!WebSocketServerModule) {
      throw new Error('WebSocketServerModule not found');
    }

    try {
      await WebSocketServerModule.broadcast(message);
      return true;
    } catch (error) {
      console.error('[NativeWebSocketServer] Broadcast failed:', error);
      throw error;
    }
  }

  /**
   * Get all connected clients
   * @returns {Promise<Array<string>>}
   */
  async getConnectedClients() {
    if (!WebSocketServerModule) {
      return [];
    }

    try {
      const clients = await WebSocketServerModule.getConnectedClients();
      return clients || [];
    } catch (error) {
      console.error('[NativeWebSocketServer] Get client list failed:', error);
      return [];
    }
  }

  /**
   * Close specific client connection
   * @param {string} clientId - Client ID
   * @returns {Promise<boolean>}
   */
  async closeClient(clientId) {
    if (!WebSocketServerModule) {
      throw new Error('WebSocketServerModule not found');
    }

    try {
      await WebSocketServerModule.closeClient(clientId);
      return true;
    } catch (error) {
      console.error('[NativeWebSocketServer] Close client failed:', error);
      throw error;
    }
  }

  /**
   * Listen to events
   * @param {string} eventName - Event name: 'onOpen', 'onClose', 'onMessage', 'onError', 'onStart'
   * @param {Function} callback - Callback function
   */
  on(eventName, callback) {
    if (!eventEmitter) {
      console.warn('[NativeWebSocketServer] Event emitter not available');
      return;
    }

    // Remove all old listeners for this event first to prevent duplicate registration
    this.off(eventName);

    const fullEventName = `WebSocketServer:${eventName}`;
    const subscription = eventEmitter.addListener(fullEventName, callback);
    
    // Save subscription for later removal
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(subscription);

    return subscription;
  }

  /**
   * Remove event listener
   * @param {string} eventName - Event name
   * @param {Object} subscription - Subscription object (optional)
   */
  off(eventName, subscription) {
    if (subscription) {
      subscription.remove();
      return;
    }

    // Remove all listeners for this event
    const subscriptions = this.listeners.get(eventName);
    if (subscriptions) {
      subscriptions.forEach(sub => sub.remove());
      this.listeners.delete(eventName);
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    this.listeners.forEach((subscriptions) => {
      subscriptions.forEach(sub => sub.remove());
    });
    this.listeners.clear();
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isServerRunning() {
    return this.isRunning;
  }
}

// Export singleton
export default new NativeWebSocketServer();

// Also export class for creating multiple instances
export { NativeWebSocketServer };

