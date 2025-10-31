# React Native Network Mesh

A comprehensive React Native library for local network device discovery and peer-to-peer communication using UDP broadcast and WebSocket.

## 📋 Features

- **🔍 Device Discovery**: Automatic device discovery through UDP broadcasting
- **🔌 WebSocket Communication**: Bi-directional communication via WebSocket
- **📱 Native Support**: Android native WebSocket server implementation
- **🔄 Auto Retry & Reconnection**: Built-in retry mechanism with configurable limits
- **💓 Heartbeat Detection**: Keep connections alive with automatic heartbeat
- **🔐 Encryption Support**: Optional AES-256-CBC encryption for messages
- **⏱️ Request Tracking**: Timeout handling and request/response matching
- **📊 Connection Management**: Track discovered and connected devices

## 🚀 Installation

```bash
npm install react-native-network-mesh
# or
yarn add react-native-network-mesh
```

### Dependencies

This library requires the following peer dependencies:

```bash
npm install react-native-udp react-native-network-info react-native-get-random-values uuid crypto-js
# or
yarn add react-native-udp react-native-network-info react-native-get-random-values uuid crypto-js
```

### Android Setup

1. Add the package to your `android/app/src/main/java/.../MainApplication.java`:

```java
import com.networkmesh.NetworkMeshPackage;

// In the getPackages() method:
@Override
protected List<ReactPackage> getPackages() {
    return Arrays.asList(
        new MainReactPackage(),
        new NetworkMeshPackage()  // Add this line
    );
}
```

2. Add required permissions to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
```

3. Ensure you have Java-WebSocket dependency in your `android/build.gradle`:

```gradle
allprojects {
    repositories {
        maven { url 'https://jitpack.io' }
    }
}
```

## 📖 Usage

### Basic Setup

```javascript
import NetworkMeshManager from 'react-native-network-mesh';

// Initialize with configuration
const config = {
  clientCode: '555555',        // Your client code
  deviceId: 'pos-001',         // Unique device ID
  udp: {
    server: { port: 3399 },
    client: { broadcastInterval: 5000 },
  },
  webSocket: {
    server: { port: 8765, path: '/ws' },
    client: { 
      maxRetry: 3, 
      timeout: 30000,
      reconnectDelay: 2000,
      heartbeatInterval: 15000,
    },
  },
  encryption: {
    enabled: true,
    key: 'your-32-character-secret-key!!',  // 32 characters for AES-256
    iv: 'your-16-char-iv',                   // 16 characters
  },
};

const meshManager = new NetworkMeshManager(config);

// Start the service
async function startMesh() {
  try {
    await meshManager.start();
    console.log('Network mesh started successfully');
  } catch (error) {
    console.error('Failed to start network mesh:', error);
  }
}

startMesh();
```

### Register Message Handlers

```javascript
// Register a handler for specific action
meshManager.registerHandler('printJob', (message, sourceIP, reply) => {
  console.log('Received print job from:', sourceIP);
  console.log('Payload:', message.payload);
  
  // Process the print job...
  
  // Send response
  reply({
    action: 'printJob',
    msgType: 'response',
    payload: { status: 'printed' },
    result: 0,
    resultMsg: 'SUCCESS',
    requestUUID: message.requestUUID,
    responseDateTime: new Date().toISOString(),
  });
});
```

### Send Request to Device

```javascript
async function sendPrintJob(targetIP, jobData) {
  try {
    const response = await meshManager.sendRequest(
      targetIP,
      'printJob',
      jobData
    );
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Send request failed:', error);
  }
}
```

### Broadcast to All Devices

```javascript
async function broadcastStatus(statusData) {
  try {
    const results = await meshManager.broadcastRequest(
      'statusUpdate',
      statusData
    );
    
    results.forEach(result => {
      if (result.success) {
        console.log(`${result.targetIP}: Success`);
      } else {
        console.log(`${result.targetIP}: Failed - ${result.error}`);
      }
    });
  } catch (error) {
    console.error('Broadcast failed:', error);
  }
}
```

### Get Connected Devices

```javascript
// Get all discovered devices
const discoveredDevices = meshManager.getDiscoveredDevices();
console.log('Discovered devices:', discoveredDevices);

// Get all connected devices
const connectedDevices = meshManager.getConnectedDevices();
console.log('Connected devices:', connectedDevices);

// Check if specific device is connected
const isConnected = meshManager.isConnected('192.168.1.100');
console.log('Device connected:', isConnected);
```

### Stop Service

```javascript
async function stopMesh() {
  try {
    await meshManager.stop();
    console.log('Network mesh stopped');
  } catch (error) {
    console.error('Failed to stop network mesh:', error);
  }
}
```

## 📡 Message Format

### Request Message

```javascript
{
  "action": "printJob",
  "msgType": "request",
  "payload": { /* your data */ },
  "requestUUID": "550e8400-e29b-41d4-a716-446655440000",
  "requestDateTime": "20251031143000000"
}
```

### Response Message

```javascript
{
  "action": "printJob",
  "msgType": "response",
  "payload": { /* response data */ },
  "result": 0,              // 0 = SUCCESS, -1 = FAILED
  "resultMsg": "SUCCESS",
  "error": null,            // Error code if failed
  "errorMsg": null,         // Error message if failed
  "requestUUID": "550e8400-e29b-41d4-a716-446655440000",
  "responseDateTime": "20251031143001000"
}
```

## 🔧 API Reference

### NetworkMeshManager

#### Methods

- `start(localIP?: string): Promise<void>` - Start the network mesh service
- `stop(): Promise<void>` - Stop the network mesh service
- `registerHandler(action: string, handler: Function): void` - Register message handler
- `unregisterHandler(action: string): void` - Unregister message handler
- `sendRequest(targetIP: string, action: string, payload: any): Promise<Object>` - Send request to device
- `broadcastRequest(action: string, payload: any): Promise<Array>` - Broadcast request to all devices
- `sendResponse(targetIP: string, request: Object, payload: any, ...): Promise<void>` - Send response
- `getDiscoveredDevices(): Array` - Get all discovered devices
- `getConnectedDevices(): Array` - Get all connected devices
- `isConnected(targetIP: string): boolean` - Check if device is connected
- `disconnectDevice(targetIP: string): void` - Disconnect from device
- `isRunning(): boolean` - Check if service is running
- `getLocalIP(): string|null` - Get local IP address
- `destroy(): Promise<void>` - Destroy instance

### Configuration Options

```javascript
{
  clientCode: string,           // Client identification code
  deviceId: string,             // Device identifier
  udp: {
    server: {
      port: number,             // UDP server port (default: 3399)
      bindAddress: string,      // Bind address (default: '0.0.0.0')
    },
    client: {
      broadcastAddress: string, // Broadcast address (default: '255.255.255.255')
      port: number,             // Broadcast port (default: 3399)
      broadcastInterval: number,// Broadcast interval in ms (default: 5000)
      enabled: boolean,         // Enable auto broadcast (default: true)
    },
  },
  webSocket: {
    server: {
      port: number,             // WebSocket server port (default: 8765)
      path: string,             // WebSocket path (default: '/ws')
      maxConnections: number,   // Maximum connections (default: 50)
    },
    client: {
      maxRetry: number,         // Maximum retry count (default: 3)
      timeout: number,          // Timeout in ms (default: 30000)
      reconnectDelay: number,   // Reconnect delay in ms (default: 2000)
      heartbeatInterval: number,// Heartbeat interval in ms (default: 15000)
    },
  },
  requestList: {
    timeout: number,            // Request timeout in ms (default: 30000)
    maxRetry: number,           // Maximum retry count (default: 3)
    retryDelay: number,         // Retry delay in ms (default: 1000)
  },
  encryption: {
    enabled: boolean,           // Enable encryption (default: false)
    algorithm: string,          // Encryption algorithm (default: 'aes-256-cbc')
    key: string,                // Encryption key (32 bytes for AES-256)
    iv: string,                 // Initialization vector (16 bytes)
  },
  logging: {
    enabled: boolean,           // Enable logging (default: true)
    level: string,              // Log level: 'debug', 'info', 'warn', 'error'
  },
}
```

## 🛠️ Advanced Usage

### Using with React Context (Recommended for Global Access)

For applications that need global access to the network mesh, we recommend using React Context API. See [CONTEXT_EXAMPLE.md](./CONTEXT_EXAMPLE.md) for complete implementation.

**Quick Example:**

```javascript
// 1. Wrap your app with NetworkMeshProvider
import { NetworkMeshProvider } from './contexts/NetworkMeshContext';

<NetworkMeshProvider config={config}>
  <App />
</NetworkMeshProvider>

// 2. Use in any component
import { useNetworkMesh } from './hooks/useNetworkMesh';

const MyComponent = () => {
  const { isRunning, connectedDevices, sendRequest } = useNetworkMesh();
  // Use network mesh functions...
};
```

See [CONTEXT_EXAMPLE.md](./CONTEXT_EXAMPLE.md) for:
- Complete Context implementation
- Custom Hook creation
- TypeScript version
- Multiple component examples
- Best practices

### Singleton Pattern

```javascript
import NetworkMeshManager from 'react-native-network-mesh';

// Get singleton instance
const meshManager = NetworkMeshManager.getInstance(config);

// Use anywhere in your app
const meshManager2 = NetworkMeshManager.getInstance();
// meshManager === meshManager2 (same instance)
```

### Custom Encryption

```javascript
import { initEncryption, encrypt, decrypt } from 'react-native-network-mesh';

// Initialize encryption separately
initEncryption({
  enabled: true,
  key: 'your-32-character-secret-key!!',
  iv: 'your-16-char-iv',
});

// Use encryption directly
const encrypted = encrypt('Hello World');
const decrypted = decrypt(encrypted);
```

### Using Individual Modules

```javascript
import { 
  UDPManager, 
  WebSocketManager, 
  RequestList 
} from 'react-native-network-mesh';

// Use modules independently if needed
const udpManager = new UDPManager(config, onDeviceDiscovered);
const wsManager = new WebSocketManager(config, onMessageReceived);
const requestList = new RequestList(config.requestList);
```

## 🐛 Troubleshooting

### UDP Broadcast Not Working

- Ensure your network supports broadcasting (some corporate networks block it)
- Check if firewall is blocking UDP port
- Verify all devices are on the same subnet

### WebSocket Connection Failed

- Ensure port is not already in use
- Check if firewall is blocking the port
- Verify Android permissions are granted
- Try restarting the app completely

### Encryption Errors

- Ensure key is exactly 32 characters for AES-256
- Ensure IV is exactly 16 characters
- Both devices must use the same key and IV

## 📝 License

MIT

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📧 Support

For support, please open an issue on GitHub.

