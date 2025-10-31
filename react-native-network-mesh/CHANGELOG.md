# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-10-31

### Added
- Initial release of react-native-network-mesh
- UDP broadcasting for automatic device discovery
- WebSocket server and client for bi-directional communication
- Android native WebSocket server implementation
- Automatic retry and reconnection mechanism
- Heartbeat detection for connection health
- AES-256-CBC encryption support for messages
- Request tracking with timeout handling
- Request/response matching with UUID
- Configurable retry limits and timeouts
- Connection management (discover, connect, disconnect)
- Message handler registration system
- Broadcast messaging to all connected devices
- Singleton pattern support
- TypeScript type definitions support
- Comprehensive documentation and examples

### Features
- **UDPManager**: UDP server and client for device discovery
- **WebSocketManager**: WebSocket server (Android native) and client
- **RequestList**: Request tracking, timeout, and retry management
- **NetworkMeshManager**: Main coordinator for all components
- **Encryption**: Standalone encryption module with AES-256-CBC
- **Config**: Flexible configuration system with defaults

### Supported Platforms
- Android (full support including native WebSocket server)
- iOS (client-side support, no server capability)

### Dependencies
- react-native-udp: ^4.1.3
- react-native-network-info: ^5.2.1
- react-native-get-random-values: ^1.9.0
- uuid: ^9.0.0
- crypto-js: ^4.2.0
- Java-WebSocket: 1.5.3 (Android)

### Documentation
- Complete README with usage examples
- API reference documentation
- Configuration guide
- Troubleshooting section
- Advanced usage examples
- TypeScript examples

## [Unreleased]

### Planned
- iOS native WebSocket server support
- Network quality monitoring
- Message compression
- Custom serialization support
- Connection pool management
- Rate limiting
- Message prioritization
- Offline message queue
- Better error recovery
- Performance metrics
- Unit tests
- Integration tests

