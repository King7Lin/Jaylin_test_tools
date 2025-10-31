/**
 * React Native Network Mesh
 * ================================
 * A library for local network device discovery and communication
 * 
 * Main features:
 * 1. UDP broadcast for device discovery
 * 2. WebSocket server and client for device communication
 * 3. Request tracking and timeout handling
 * 4. Message encryption and decryption
 * 5. Automatic retry and reconnection
 */

// Export main classes
export { default as NetworkMeshManager } from './NetworkMeshManager';
export { default as UDPManager } from './UDPManager';
export { default as WebSocketManager } from './WebSocketManager';
export { default as RequestList } from './RequestList';
export { default as NativeWebSocketServer } from './NativeWebSocketServer';

// Export configuration
export { DEFAULT_CONFIG, mergeConfig } from './config';

// Export encryption utilities
export { 
  initEncryption,
  encrypt, 
  decrypt, 
  encryptJSON, 
  decryptJSON,
  getEncryptionConfig,
  isEncryptionEnabled,
} from './encryption';

// Default export
import NetworkMeshManager from './NetworkMeshManager';
export default NetworkMeshManager;

