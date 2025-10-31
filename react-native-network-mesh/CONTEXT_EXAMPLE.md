# Context API 使用示例

为了在整个应用中全局使用 Network Mesh，推荐使用 React Context API。这样可以避免在多个组件中重复创建实例，并提供统一的状态管理。

## 📁 文件结构

```
src/
├── contexts/
│   └── NetworkMeshContext.js       # Context 定义和 Provider
├── hooks/
│   └── useNetworkMesh.js           # 自定义 Hook
└── App.js                          # 应用入口
```

## 1️⃣ 创建 Context

### `src/contexts/NetworkMeshContext.js`

```javascript
import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import NetworkMeshManager from 'react-native-network-mesh';

// 创建 Context
export const NetworkMeshContext = createContext(null);

/**
 * NetworkMeshProvider - 全局 Network Mesh 提供者
 */
export const NetworkMeshProvider = ({ children, config }) => {
  // 状态管理
  const [isRunning, setIsRunning] = useState(false);
  const [localIP, setLocalIP] = useState(null);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [error, setError] = useState(null);

  // 使用 ref 存储管理器实例，避免重新创建
  const meshManagerRef = useRef(null);

  // 初始化管理器
  useEffect(() => {
    if (!meshManagerRef.current) {
      console.log('[NetworkMeshProvider] Initializing mesh manager');
      meshManagerRef.current = new NetworkMeshManager(config);
    }

    return () => {
      // 组件卸载时清理
      if (meshManagerRef.current) {
        console.log('[NetworkMeshProvider] Cleaning up mesh manager');
        meshManagerRef.current.stop().catch(err => {
          console.error('[NetworkMeshProvider] Stop error:', err);
        });
      }
    };
  }, [config]);

  // 启动服务
  const start = useCallback(async () => {
    try {
      setError(null);
      await meshManagerRef.current.start();
      setIsRunning(true);
      setLocalIP(meshManagerRef.current.getLocalIP());
      console.log('[NetworkMeshProvider] Service started');
    } catch (err) {
      console.error('[NetworkMeshProvider] Start error:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // 停止服务
  const stop = useCallback(async () => {
    try {
      await meshManagerRef.current.stop();
      setIsRunning(false);
      setLocalIP(null);
      setDiscoveredDevices([]);
      setConnectedDevices([]);
      console.log('[NetworkMeshProvider] Service stopped');
    } catch (err) {
      console.error('[NetworkMeshProvider] Stop error:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // 更新设备列表
  const updateDeviceLists = useCallback(() => {
    if (meshManagerRef.current && isRunning) {
      const discovered = meshManagerRef.current.getDiscoveredDevices();
      const connected = meshManagerRef.current.getConnectedDevices();
      setDiscoveredDevices(discovered);
      setConnectedDevices(connected);
    }
  }, [isRunning]);

  // 定期更新设备列表
  useEffect(() => {
    if (isRunning) {
      updateDeviceLists();
      const interval = setInterval(updateDeviceLists, 2000);
      return () => clearInterval(interval);
    }
  }, [isRunning, updateDeviceLists]);

  // 注册消息处理器
  const registerHandler = useCallback((action, handler) => {
    if (meshManagerRef.current) {
      meshManagerRef.current.registerHandler(action, handler);
    }
  }, []);

  // 注销消息处理器
  const unregisterHandler = useCallback((action) => {
    if (meshManagerRef.current) {
      meshManagerRef.current.unregisterHandler(action);
    }
  }, []);

  // 发送请求
  const sendRequest = useCallback(async (targetIP, action, payload) => {
    if (!meshManagerRef.current || !isRunning) {
      throw new Error('Service not running');
    }
    return await meshManagerRef.current.sendRequest(targetIP, action, payload);
  }, [isRunning]);

  // 广播请求
  const broadcastRequest = useCallback(async (action, payload) => {
    if (!meshManagerRef.current || !isRunning) {
      throw new Error('Service not running');
    }
    return await meshManagerRef.current.broadcastRequest(action, payload);
  }, [isRunning]);

  // 发送响应
  const sendResponse = useCallback(async (targetIP, request, payload, result = 0, resultMsg = 'SUCCESS', error = null, errorMsg = null) => {
    if (!meshManagerRef.current || !isRunning) {
      throw new Error('Service not running');
    }
    return await meshManagerRef.current.sendResponse(
      targetIP,
      request,
      payload,
      result,
      resultMsg,
      error,
      errorMsg
    );
  }, [isRunning]);

  // 检查设备是否连接
  const isConnected = useCallback((targetIP) => {
    if (!meshManagerRef.current) return false;
    return meshManagerRef.current.isConnected(targetIP);
  }, []);

  // 断开设备连接
  const disconnectDevice = useCallback((targetIP) => {
    if (meshManagerRef.current) {
      meshManagerRef.current.disconnectDevice(targetIP);
      updateDeviceLists();
    }
  }, [updateDeviceLists]);

  // Context 值
  const value = {
    // 状态
    isRunning,
    localIP,
    discoveredDevices,
    connectedDevices,
    error,

    // 方法
    start,
    stop,
    registerHandler,
    unregisterHandler,
    sendRequest,
    broadcastRequest,
    sendResponse,
    isConnected,
    disconnectDevice,
    updateDeviceLists,

    // 管理器实例（高级用法）
    meshManager: meshManagerRef.current,
  };

  return (
    <NetworkMeshContext.Provider value={value}>
      {children}
    </NetworkMeshContext.Provider>
  );
};
```

## 2️⃣ 创建自定义 Hook

### `src/hooks/useNetworkMesh.js`

```javascript
import { useContext } from 'react';
import { NetworkMeshContext } from '../contexts/NetworkMeshContext';

/**
 * useNetworkMesh - 自定义 Hook
 * 提供便捷的访问方式
 */
export const useNetworkMesh = () => {
  const context = useContext(NetworkMeshContext);

  if (!context) {
    throw new Error('useNetworkMesh must be used within NetworkMeshProvider');
  }

  return context;
};

export default useNetworkMesh;
```

## 3️⃣ 在应用中使用

### `App.js` - 应用入口

```javascript
import React, { useEffect } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { NetworkMeshProvider } from './src/contexts/NetworkMeshContext';
import MainScreen from './src/screens/MainScreen';

const App = () => {
  // Network Mesh 配置
  const meshConfig = {
    clientCode: '555555',
    deviceId: 'pos-001',
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
      enabled: false, // 生产环境设置为 true
    },
  };

  return (
    <NetworkMeshProvider config={meshConfig}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <MainScreen />
      </SafeAreaView>
    </NetworkMeshProvider>
  );
};

export default App;
```

## 4️⃣ 在组件中使用

### 示例 1: 主屏幕组件

```javascript
import React, { useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { useNetworkMesh } from '../hooks/useNetworkMesh';

const MainScreen = () => {
  const {
    isRunning,
    localIP,
    connectedDevices,
    start,
    stop,
    registerHandler,
    sendRequest,
  } = useNetworkMesh();

  // 启动服务
  useEffect(() => {
    // 注册消息处理器
    registerHandler('ping', handlePing);
    registerHandler('getData', handleGetData);

    // 自动启动服务
    startService();

    // 不需要清理，Provider 会处理
  }, []);

  const startService = async () => {
    try {
      await start();
      console.log('Service started');
    } catch (error) {
      Alert.alert('Error', 'Failed to start: ' + error.message);
    }
  };

  const handlePing = (message, sourceIP, reply) => {
    console.log('Received ping from:', sourceIP);
    reply({
      action: 'ping',
      msgType: 'response',
      payload: { pong: true },
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  };

  const handleGetData = (message, sourceIP, reply) => {
    console.log('Received getData from:', sourceIP);
    reply({
      action: 'getData',
      msgType: 'response',
      payload: { data: 'some data' },
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  };

  const handleSendPing = async () => {
    if (connectedDevices.length === 0) {
      Alert.alert('Error', 'No connected devices');
      return;
    }

    try {
      const response = await sendRequest(
        connectedDevices[0],
        'ping',
        { timestamp: new Date().toISOString() }
      );
      Alert.alert('Success', 'Ping successful');
    } catch (error) {
      Alert.alert('Error', 'Ping failed: ' + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Network Mesh</Text>
      
      <View style={styles.statusContainer}>
        <Text>Status: {isRunning ? '🟢 Running' : '🔴 Stopped'}</Text>
        <Text>Local IP: {localIP || 'Unknown'}</Text>
        <Text>Connected: {connectedDevices.length} devices</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={isRunning ? 'Stop' : 'Start'}
          onPress={isRunning ? stop : startService}
        />
        <Button
          title="Send Ping"
          onPress={handleSendPing}
          disabled={!isRunning || connectedDevices.length === 0}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});

export default MainScreen;
```

### 示例 2: 设备列表组件

```javascript
import React from 'react';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';
import { useNetworkMesh } from '../hooks/useNetworkMesh';

const DeviceListScreen = () => {
  const {
    discoveredDevices,
    connectedDevices,
    isConnected,
    disconnectDevice,
    sendRequest,
  } = useNetworkMesh();

  const handlePingDevice = async (ip) => {
    try {
      await sendRequest(ip, 'ping', null);
      console.log(`Pinged ${ip} successfully`);
    } catch (error) {
      console.error(`Ping ${ip} failed:`, error);
    }
  };

  const renderDevice = ({ item }) => {
    const connected = isConnected(item.ip);

    return (
      <View style={styles.deviceItem}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceIP}>{item.ip}</Text>
          <Text style={styles.deviceStatus}>
            {connected ? '🟢 Connected' : '⚪ Discovered'}
          </Text>
        </View>
        <View style={styles.deviceActions}>
          {connected && (
            <>
              <Button title="Ping" onPress={() => handlePingDevice(item.ip)} />
              <Button
                title="Disconnect"
                onPress={() => disconnectDevice(item.ip)}
                color="red"
              />
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discovered Devices</Text>
      <FlatList
        data={discoveredDevices}
        keyExtractor={(item) => item.ip}
        renderItem={renderDevice}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No devices found</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  deviceItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceIP: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  deviceStatus: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  deviceActions: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
});

export default DeviceListScreen;
```

### 示例 3: 打印同步服务

```javascript
import { useEffect, useCallback } from 'react';
import { useNetworkMesh } from '../hooks/useNetworkMesh';

/**
 * usePrintSync - 打印同步服务 Hook
 */
export const usePrintSync = () => {
  const { registerHandler, sendRequest, connectedDevices } = useNetworkMesh();

  useEffect(() => {
    // 注册打印队列查询处理器
    registerHandler('queryPrintQueue', handleQueryPrintQueue);
  }, []);

  const handleQueryPrintQueue = useCallback((message, sourceIP, reply) => {
    const printerIP = message.payload?.printerIP;
    
    // 获取本地打印队列（从数据库或状态管理）
    const pendingJobs = getLocalPendingJobs(printerIP);

    reply({
      action: 'queryPrintQueue',
      msgType: 'response',
      payload: pendingJobs,
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  }, []);

  const checkBeforePrint = useCallback(async (printerIP, currentJobTime) => {
    if (connectedDevices.length === 0) {
      return { canPrint: true, reason: 'no_other_devices' };
    }

    // 查询所有设备的打印队列
    const results = await Promise.allSettled(
      connectedDevices.map(deviceIP =>
        sendRequest(deviceIP, 'queryPrintQueue', { printerIP })
      )
    );

    // 检查是否有更早的任务
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const pendingJobs = result.value.response?.payload || [];
        if (pendingJobs.length > 0) {
          const lastJob = pendingJobs[pendingJobs.length - 1];
          if (lastJob.createdAt <= currentJobTime) {
            return { canPrint: false, reason: 'earlier_job_exists' };
          }
        }
      }
    }

    return { canPrint: true, reason: 'check_passed' };
  }, [connectedDevices, sendRequest]);

  const getLocalPendingJobs = (printerIP) => {
    // TODO: 从数据库获取待处理任务
    return [];
  };

  return {
    checkBeforePrint,
  };
};
```

## 5️⃣ TypeScript 版本

### `NetworkMeshContext.tsx`

```typescript
import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import NetworkMeshManager from 'react-native-network-mesh';

interface DeviceInfo {
  ip: string;
  key: string;
  timestamp: string;
  wsPort: number;
  wsPath: string;
  lastSeen: number;
}

interface NetworkMeshContextValue {
  isRunning: boolean;
  localIP: string | null;
  discoveredDevices: DeviceInfo[];
  connectedDevices: string[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  registerHandler: (action: string, handler: Function) => void;
  unregisterHandler: (action: string) => void;
  sendRequest: (targetIP: string, action: string, payload: any) => Promise<any>;
  broadcastRequest: (action: string, payload: any) => Promise<any>;
  sendResponse: (
    targetIP: string,
    request: any,
    payload: any,
    result?: number,
    resultMsg?: string,
    error?: number | null,
    errorMsg?: string | null
  ) => Promise<void>;
  isConnected: (targetIP: string) => boolean;
  disconnectDevice: (targetIP: string) => void;
  updateDeviceLists: () => void;
  meshManager: NetworkMeshManager | null;
}

export const NetworkMeshContext = createContext<NetworkMeshContextValue | null>(null);

interface NetworkMeshProviderProps {
  children: ReactNode;
  config: any;
}

export const NetworkMeshProvider: React.FC<NetworkMeshProviderProps> = ({ children, config }) => {
  // ... 实现与 JavaScript 版本相同
};
```

### `useNetworkMesh.ts`

```typescript
import { useContext } from 'react';
import { NetworkMeshContext } from '../contexts/NetworkMeshContext';

export const useNetworkMesh = () => {
  const context = useContext(NetworkMeshContext);

  if (!context) {
    throw new Error('useNetworkMesh must be used within NetworkMeshProvider');
  }

  return context;
};

export default useNetworkMesh;
```

## 6️⃣ 高级用法

### 监听连接状态变化

```javascript
import { useEffect } from 'react';
import { useNetworkMesh } from '../hooks/useNetworkMesh';

const ConnectionMonitor = () => {
  const { connectedDevices, isRunning } = useNetworkMesh();

  useEffect(() => {
    if (isRunning) {
      console.log(`Connected devices changed: ${connectedDevices.length}`);
      // 执行相关逻辑，如更新 UI、通知用户等
    }
  }, [connectedDevices.length, isRunning]);

  return null;
};
```

### 条件渲染

```javascript
const MyComponent = () => {
  const { isRunning, connectedDevices } = useNetworkMesh();

  if (!isRunning) {
    return <Text>Service is not running</Text>;
  }

  if (connectedDevices.length === 0) {
    return <Text>No devices connected</Text>;
  }

  return <Text>Connected to {connectedDevices.length} devices</Text>;
};
```

## 🎯 优势

1. **全局访问** - 在任何组件中都可以使用
2. **状态共享** - 自动同步状态到所有使用的组件
3. **性能优化** - 避免重复创建实例
4. **代码简洁** - 使用 Hook 访问更加方便
5. **类型安全** - TypeScript 支持完整
6. **易于测试** - 可以 mock Context 进行测试

## 📝 最佳实践

1. **只在顶层创建 Provider** - 在 App.js 中包裹整个应用
2. **使用 Hook 访问** - 通过 `useNetworkMesh()` 而不是直接使用 Context
3. **错误处理** - 始终处理可能的错误
4. **及时清理** - Provider 会自动清理，无需手动处理
5. **状态监听** - 使用 useEffect 监听状态变化

这样就可以在整个应用中方便地使用 Network Mesh 功能了！🎉

