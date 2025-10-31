/**
 * Network Mesh Configuration
 * ================================
 * Default configuration for UDP and WebSocket
 */

export const DEFAULT_CONFIG = {
  // Client identification
  clientCode: '000000',      // Default client code
  deviceId: 'default',       // Device identifier
  
  // UDP Configuration
  udp: {
    server: {
      port: 3399,              // UDP server port
      bindAddress: '0.0.0.0',  // Bind address
    },
    client: {
      broadcastAddress: '255.255.255.255', // Broadcast address
      port: 3399,                           // Broadcast port
      broadcastInterval: 5000,              // Broadcast interval (ms)
      enabled: true,                        // Enable auto broadcast
    },
  },

  // WebSocket Configuration
  webSocket: {
    server: {
      port: 8765,              // WebSocket server port
      path: '/ws',             // WebSocket path
      maxConnections: 50,      // Maximum connections
    },
    client: {
      maxRetry: 3,             // Maximum retry count
      timeout: 30000,          // Timeout (ms)
      reconnectDelay: 2000,    // Reconnect delay (ms)
      heartbeatInterval: 15000,// Heartbeat interval (ms)
    },
  },

  // Request List Configuration
  requestList: {
    timeout: 30000,            // Request timeout (ms)
    maxRetry: 3,               // Maximum retry count
    retryDelay: 1000,          // Retry delay (ms)
  },

  // Encryption Configuration
  encryption: {
    enabled: false,            // Enable encryption
    algorithm: 'aes-256-cbc',  // Encryption algorithm
    key: null,                 // Encryption key (32 bytes for AES-256)
    iv: null,                  // Initialization vector (16 bytes)
  },

  // Logging Configuration
  logging: {
    enabled: true,
    level: 'info', // 'debug', 'info', 'warn', 'error'
  },
};

/**
 * Merge user config with default config
 * @param {Object} userConfig - User configuration
 * @returns {Object} Merged configuration
 */
export function mergeConfig(userConfig = {}) {
  return {
    clientCode: userConfig.clientCode || DEFAULT_CONFIG.clientCode,
    deviceId: userConfig.deviceId || DEFAULT_CONFIG.deviceId,
    udp: {
      server: {
        ...DEFAULT_CONFIG.udp.server,
        ...(userConfig.udp?.server || {}),
      },
      client: {
        ...DEFAULT_CONFIG.udp.client,
        ...(userConfig.udp?.client || {}),
      },
    },
    webSocket: {
      server: {
        ...DEFAULT_CONFIG.webSocket.server,
        ...(userConfig.webSocket?.server || {}),
      },
      client: {
        ...DEFAULT_CONFIG.webSocket.client,
        ...(userConfig.webSocket?.client || {}),
      },
    },
    requestList: {
      ...DEFAULT_CONFIG.requestList,
      ...(userConfig.requestList || {}),
    },
    encryption: {
      ...DEFAULT_CONFIG.encryption,
      ...(userConfig.encryption || {}),
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...(userConfig.logging || {}),
    },
  };
}

export default DEFAULT_CONFIG;

