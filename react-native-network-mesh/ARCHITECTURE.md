# Architecture Documentation

## 📐 System Overview

React Native Network Mesh is a comprehensive solution for local network device discovery and peer-to-peer communication. It's designed specifically for scenarios where multiple devices need to communicate on a local network without relying on cloud services.

## 🏗️ Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Your React Native App - Message Handlers, Business Logic) │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                 NetworkMeshManager                           │
│  (Main Coordinator - Handles device discovery & messaging)  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────┬──────────────────────┬───────────────┐
│    UDPManager        │  WebSocketManager    │  RequestList  │
│  (Device Discovery)  │  (Communication)     │  (Tracking)   │
└──────────────────────┴──────────────────────┴───────────────┘
                            ↕
┌──────────────────────┬──────────────────────┬───────────────┐
│   react-native-udp   │  NativeWebSocket     │  Encryption   │
│   (UDP Broadcast)    │  (Android Native)    │  (AES-256)    │
└──────────────────────┴──────────────────────┴───────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                     Network Layer                            │
│                  (TCP/IP, UDP, WiFi)                         │
└─────────────────────────────────────────────────────────────┘
```

## 🧩 Core Components

### 1. NetworkMeshManager

**Responsibilities:**
- Main entry point for the library
- Coordinates UDP and WebSocket managers
- Manages discovered and connected devices
- Routes messages to registered handlers
- Provides high-level API for communication

**Key Methods:**
- `start()` - Initialize and start all services
- `stop()` - Stop all services and cleanup
- `sendRequest()` - Send request to specific device
- `broadcastRequest()` - Send request to all devices
- `registerHandler()` - Register message handler for actions

### 2. UDPManager

**Responsibilities:**
- UDP broadcast for device discovery
- Listen for broadcasts from other devices
- Maintain single UDP socket for both send/receive
- Validate and filter discovered devices

**Discovery Flow:**
```
Device A                    Network                    Device B
   |                           |                           |
   |------ UDP Broadcast ----->|                           |
   |    (NETWORK_SEARCH)       |------ UDP Broadcast ----->|
   |                           |                           |
   |<----- UDP Broadcast ------|<----- UDP Broadcast ------|
   |                           |                           |
   |--- Validate & Store ------|--- Validate & Store ------|
   |                           |                           |
   |--- Trigger WS Connect --->|--- Trigger WS Connect --->|
```

**Message Format:**
```json
{
  "action": "NETWORK_SEARCH",
  "source": "192.168.1.100",
  "key": "555555_pos-001",
  "reqDateTime": "20241031143000000",
  "wsPort": 8765,
  "wsPath": "/ws"
}
```

### 3. WebSocketManager

**Responsibilities:**
- Manage WebSocket server (Android only)
- Manage WebSocket clients (all platforms)
- Handle connections, reconnections, retries
- Send/receive messages
- Heartbeat mechanism

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                   WebSocketManager                           │
├──────────────────────────┬──────────────────────────────────┤
│     Server Side          │          Client Side             │
│  (Android Native)        │   (React Native WebSocket)       │
├──────────────────────────┼──────────────────────────────────┤
│ • Accept connections     │ • Connect to servers             │
│ • Manage client list     │ • Auto reconnect                 │
│ • Broadcast messages     │ • Retry on failure               │
│ • Send to specific client│ • Heartbeat                      │
└──────────────────────────┴──────────────────────────────────┘
```

**Connection Lifecycle:**
```
Disconnected
     |
     v
Connecting (attempt 1)
     |
     |-- Success --> Connected --> Heartbeat
     |                   |
     |-- Timeout ----    |-- Error/Close
     v               |   v
Retry Delay <--------+-- Reconnecting
     |                   |
     v                   |
Connecting (attempt 2-4) |
     |                   |
     |-- Max Retry ------+
     v
Deleted (wait for UDP rediscovery)
```

### 4. RequestList

**Responsibilities:**
- Track all outgoing requests
- Match responses to requests
- Handle timeouts and retries
- Automatic cleanup of old requests

**Request Tracking:**
```
Send Request
     |
     v
Add to RequestList (with UUID)
     |
     v
Start Timeout Timer
     |
     +-- Response Received --> Remove from List
     |
     +-- Timeout --> Retry (if < maxRetry)
     |                |
     |                +-- Max Retry --> Error Callback
     |
     +-- Connection Error --> Error Callback
```

### 5. Encryption Module

**Responsibilities:**
- AES-256-CBC encryption/decryption
- Message security
- Key and IV management

**Encryption Flow:**
```
Plaintext Message
     |
     v
JSON.stringify()
     |
     v
AES-256-CBC Encrypt
     |
     v
Base64 Encode
     |
     v
Send over Network
     |
     v
Base64 Decode
     |
     v
AES-256-CBC Decrypt
     |
     v
JSON.parse()
     |
     v
Plaintext Message
```

## 🔄 Message Flow

### Request-Response Flow

```
Device A                NetworkMeshManager              Device B
   |                           |                           |
   | sendRequest()             |                           |
   |-------------------------->|                           |
   |                           |                           |
   |                   Add to RequestList                  |
   |                           |                           |
   |                   WebSocket.send()                    |
   |                           |-------------------------->|
   |                           |                           |
   |                           |                  Find Handler
   |                           |                           |
   |                           |                  Process Request
   |                           |                           |
   |                           |<--------------------------|
   |                           |       (Response)          |
   |                           |                           |
   |                  Match UUID & Remove                  |
   |                           |                           |
   |<--------------------------|                           |
   |   Response Callback       |                           |
```

### Broadcast Flow

```
Device A            NetworkMeshManager       Device B    Device C
   |                       |                     |           |
   | broadcastRequest()    |                     |           |
   |---------------------->|                     |           |
   |                       |                     |           |
   |                   For each device           |           |
   |                       |                     |           |
   |                       |-------------------->|           |
   |                       |        Request      |           |
   |                       |                     |           |
   |                       |----------------------------->   |
   |                       |           Request              |
   |                       |                     |           |
   |                       |<--------------------|           |
   |                       |       Response      |           |
   |                       |                     |           |
   |                       |<----------------------------|   |
   |                       |          Response              |
   |                       |                     |           |
   |<----------------------|                     |           |
   |   All Responses       |                     |           |
```

## 🔐 Security

### Encryption

- **Algorithm**: AES-256-CBC
- **Key Size**: 32 bytes (256 bits)
- **IV Size**: 16 bytes (128 bits)
- **Optional**: Can be disabled for development

### Network Security

- **Validation**: All messages validated before processing
- **Key Matching**: Only devices with matching keys communicate
- **Client Filtering**: Devices filter by clientCode and deviceId

## 🎯 Design Principles

### 1. Modularity
Each component (UDP, WebSocket, RequestList) is independent and can be used separately if needed.

### 2. Resilience
- Automatic retry on failure
- Reconnection mechanism
- Timeout handling
- Graceful degradation

### 3. Performance
- Efficient message routing
- Minimal overhead
- Cleanup of expired requests
- Connection pooling

### 4. Simplicity
- Clear API design
- Sensible defaults
- Easy configuration
- Comprehensive logging

## 📊 Performance Considerations

### Scalability
- **Recommended**: 5-10 devices per network
- **Maximum**: 50 concurrent connections (configurable)
- **Broadcast Latency**: ~100-500ms per device

### Resource Usage
- **Memory**: ~5-10 MB per connection
- **CPU**: Minimal (< 1% idle, < 5% active)
- **Network**: ~1-5 KB/s per device (heartbeat + discovery)

### Optimization Tips
1. Adjust broadcast interval based on needs
2. Use request batching where possible
3. Implement message compression for large payloads
4. Monitor and cleanup stale connections
5. Use encryption only when necessary

## 🔧 Configuration Best Practices

### Development
```javascript
{
  encryption: { enabled: false },
  logging: { enabled: true, level: 'debug' },
  udp: { client: { broadcastInterval: 3000 } },
  webSocket: { client: { timeout: 10000 } },
}
```

### Production
```javascript
{
  encryption: { enabled: true, key: '...', iv: '...' },
  logging: { enabled: true, level: 'error' },
  udp: { client: { broadcastInterval: 5000 } },
  webSocket: { client: { timeout: 30000 } },
}
```

### High Reliability
```javascript
{
  webSocket: { 
    client: { 
      maxRetry: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 10000,
    },
  },
  requestList: {
    maxRetry: 5,
    timeout: 60000,
  },
}
```

## 🚀 Future Enhancements

1. **iOS Native Server**: Implement native WebSocket server for iOS
2. **Message Compression**: Add gzip compression for large messages
3. **Network Quality Monitoring**: Track latency and packet loss
4. **Advanced Routing**: Multi-hop routing for mesh networks
5. **Offline Queue**: Store messages when devices are offline
6. **Authentication**: Token-based authentication between devices
7. **Rate Limiting**: Prevent message flooding
8. **Analytics**: Built-in metrics and monitoring

