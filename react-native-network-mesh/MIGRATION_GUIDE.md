# Migration Guide

## 从 POS-APP 的 lan-communication 迁移到 react-native-network-mesh

本指南帮助您从原有的 `lan-communication` 模块迁移到独立的 `react-native-network-mesh` 库。

## 📋 主要变更

### 1. 模块名称变更

| 原模块 | 新模块 | 说明 |
|--------|--------|------|
| `LANCommManager` | `NetworkMeshManager` | 主管理器 |
| `UDPManager` | `UDPManager` | 保持不变 |
| `WebSocketManager` | `WebSocketManager` | 保持不变 |
| `RequestList` | `RequestList` | 保持不变 |
| `PrintSyncService` | 移除 | 应用层功能，需要在应用中自行实现 |

### 2. 配置变更

**原配置 (lan-communication):**
```javascript
{
  clientCode: '555555',
  outlet: 'default',
  // ...
}
```

**新配置 (react-native-network-mesh):**
```javascript
{
  clientCode: '555555',
  deviceId: 'default',  // 从 'outlet' 改为 'deviceId'
  // ...
}
```

### 3. 加密模块变更

**原来 (依赖 MQTT):**
```javascript
import { encryptAES, decryptAES } from '../src/utils/mqtt';
```

**现在 (独立模块):**
```javascript
import { encrypt, decrypt, initEncryption } from 'react-native-network-mesh';

// 初始化加密
initEncryption({
  enabled: true,
  key: 'your-32-character-secret-key!!',
  iv: 'your-16-char-iv',
});
```

## 🔄 迁移步骤

### 步骤 1: 安装新库

```bash
# 从本地安装（开发阶段）
cd ../react-native-network-mesh
npm pack
cd ../POS-APP
npm install ../react-native-network-mesh/react-native-network-mesh-1.0.0.tgz

# 或者发布到 npm 后
npm install react-native-network-mesh
```

### 步骤 2: 更新导入语句

**原代码:**
```javascript
import LANCommManager from './lan-communication/lanCommManager';
```

**新代码:**
```javascript
import NetworkMeshManager from 'react-native-network-mesh';
```

### 步骤 3: 更新配置

**原代码:**
```javascript
const config = {
  clientCode: '555555',
  outlet: 'outlet-001',
  // ...
};

const lanComm = new LANCommManager(config);
```

**新代码:**
```javascript
const config = {
  clientCode: '555555',
  deviceId: 'outlet-001',  // 改名
  // ...
};

const meshManager = new NetworkMeshManager(config);
```

### 步骤 4: 更新 Android 原生模块

1. **从 POS-APP 移除旧的原生模块引用:**

```java
// android/app/src/main/java/.../MainApplication.java
// 移除:
// import com.straffinfo.websocket.WebSocketServerPackage;

// 添加:
import com.networkmesh.NetworkMeshPackage;
```

2. **更新 Package 注册:**

```java
@Override
protected List<ReactPackage> getPackages() {
    return Arrays.asList(
        new MainReactPackage(),
        // 移除: new WebSocketServerPackage(),
        new NetworkMeshPackage()  // 添加
    );
}
```

### 步骤 5: 迁移 PrintSyncService

`PrintSyncService` 是应用特定的业务逻辑，需要在您的应用中重新实现：

**创建新文件: `src/services/PrintSyncService.js`**

```javascript
import NetworkMeshManager from 'react-native-network-mesh';

export default class PrintSyncService {
  constructor(meshManager) {
    this.manager = meshManager;
    this.checkInterval = 5000;
    this.maxWaitTime = 60000;
    
    // 注册处理器
    this.manager.registerHandler('queryPrintQueue', this.handleQueryPrintQueue.bind(this));
  }

  async handleQueryPrintQueue(message, sourceIP, reply) {
    // 实现您的打印队列查询逻辑
    const printerIP = message.payload?.printerIP;
    const pendingJobs = await this.getLocalPendingJobs(printerIP);
    
    reply({
      action: 'queryPrintQueue',
      msgType: 'response',
      payload: pendingJobs,
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  }

  async getLocalPendingJobs(printerIP) {
    // 从您的数据库获取待处理的打印任务
    const PrintJobDAO = require('../db/PrintJobDAO').default;
    const PrinterDAO = require('../db/PrinterDAO').default;
    
    // ... 您的实现逻辑
  }

  // ... 其他方法
}
```

### 步骤 6: 更新使用代码

**原代码:**
```javascript
import LANCommManager from './lan-communication';

// 在应用启动时
const lanComm = LANCommManager.getInstance(config);
await lanComm.start();

// 发送消息
await lanComm.sendRequest(targetIP, 'action', payload);
```

**新代码:**
```javascript
import NetworkMeshManager from 'react-native-network-mesh';

// 在应用启动时
const meshManager = NetworkMeshManager.getInstance(config);
await meshManager.start();

// 发送消息
await meshManager.sendRequest(targetIP, 'action', payload);
```

### 步骤 7: 更新日期格式化函数

新库内部已包含日期格式化，但如果您在应用中使用，需要注意：

**原代码:**
```javascript
import { formatDate } from './src/commonUtils/dateUtil';
```

**新代码 (如果需要):**
```javascript
// 新库内部已处理日期格式化
// 如果您的应用需要，保留原有的 formatDate 函数
// 或使用新的格式化方式
const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
};
```

## 📝 API 对照表

### 主管理器方法

| 原方法 (LANCommManager) | 新方法 (NetworkMeshManager) | 说明 |
|------------------------|----------------------------|------|
| `start(localIP)` | `start(localIP)` | 相同 |
| `stop()` | `stop()` | 相同 |
| `sendRequest(...)` | `sendRequest(...)` | 相同 |
| `broadcastRequest(...)` | `broadcastRequest(...)` | 相同 |
| `sendResponse(...)` | `sendResponse(...)` | 相同 |
| `registerHandler(...)` | `registerHandler(...)` | 相同 |
| `unregisterHandler(...)` | `unregisterHandler(...)` | 相同 |
| `getDiscoveredDevices()` | `getDiscoveredDevices()` | 相同 |
| `getConnectedDevices()` | `getConnectedDevices()` | 相同 |
| `isConnected(ip)` | `isConnected(ip)` | 相同 |
| `disconnectDevice(ip)` | `disconnectDevice(ip)` | 相同 |
| `isRunning()` | `isRunning()` | 相同 |
| `getLocalIP()` | `getLocalIP()` | 相同 |

### 配置选项对照

| 原配置项 | 新配置项 | 说明 |
|---------|---------|------|
| `outlet` | `deviceId` | 重命名 |
| 其他配置 | 保持不变 | 所有其他配置项保持相同 |

## ⚠️ 注意事项

### 1. 不兼容的变更

- `outlet` 配置项重命名为 `deviceId`
- `PrintSyncService` 需要在应用中重新实现
- Android 原生模块包名从 `com.straffinfo.websocket` 改为 `com.networkmesh`

### 2. 加密配置

如果您使用了加密功能，确保：
- Key 长度为 32 字符（AES-256）
- IV 长度为 16 字符
- 所有设备使用相同的 key 和 iv

### 3. 依赖项

确保安装所有必需的依赖项：
```json
{
  "dependencies": {
    "react-native-udp": "^4.1.3",
    "react-native-network-info": "^5.2.1",
    "react-native-get-random-values": "^1.9.0",
    "uuid": "^9.0.0",
    "crypto-js": "^4.2.0"
  }
}
```

## 🧪 测试迁移

### 测试清单

- [ ] UDP 广播正常工作
- [ ] 设备能够被发现
- [ ] WebSocket 连接成功
- [ ] 消息发送和接收正常
- [ ] 重连机制工作正常
- [ ] 超时和重试机制正常
- [ ] 加密/解密正常（如果启用）
- [ ] 打印同步功能正常（如果使用）

### 测试步骤

1. **启动服务:**
```javascript
const meshManager = new NetworkMeshManager(config);
await meshManager.start();
console.log('Service started, local IP:', meshManager.getLocalIP());
```

2. **检查设备发现:**
```javascript
setTimeout(() => {
  const devices = meshManager.getDiscoveredDevices();
  console.log('Discovered devices:', devices);
}, 10000); // 等待 10 秒
```

3. **测试消息发送:**
```javascript
meshManager.registerHandler('test', (message, sourceIP, reply) => {
  console.log('Received test message from:', sourceIP);
  reply({
    action: 'test',
    msgType: 'response',
    payload: { received: true },
    result: 0,
    resultMsg: 'SUCCESS',
    requestUUID: message.requestUUID,
    responseDateTime: new Date().toISOString(),
  });
});

// 发送测试消息
const devices = meshManager.getConnectedDevices();
if (devices.length > 0) {
  const response = await meshManager.sendRequest(devices[0], 'test', { data: 'hello' });
  console.log('Test response:', response);
}
```

## 🆘 常见问题

### Q: 迁移后设备无法被发现？

A: 检查：
1. UDP 端口是否正确（默认 3399）
2. 防火墙是否阻止 UDP 广播
3. `clientCode` 和 `deviceId` 是否匹配
4. 设备是否在同一子网

### Q: WebSocket 连接失败？

A: 检查：
1. Android 原生模块是否正确安装
2. 端口是否被占用（默认 8765）
3. 权限是否授予
4. 尝试完全重启应用

### Q: 加密相关错误？

A: 确保：
1. Key 长度正确（32 字符）
2. IV 长度正确（16 字符）
3. 所有设备使用相同的配置
4. crypto-js 依赖已安装

## 📞 获取帮助

如果遇到问题：
1. 查看 [README.md](./README.md) 完整文档
2. 查看 [EXAMPLE.md](./EXAMPLE.md) 使用示例
3. 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 架构文档
4. 在 GitHub 提交 Issue

## ✅ 迁移完成检查表

- [ ] 安装新库和所有依赖
- [ ] 更新所有导入语句
- [ ] 更新配置对象（outlet → deviceId）
- [ ] 更新 Android 原生模块
- [ ] 迁移 PrintSyncService（如果使用）
- [ ] 更新所有 API 调用
- [ ] 测试所有功能
- [ ] 验证加密功能（如果启用）
- [ ] 删除旧的 lan-communication 目录（可选）
- [ ] 更新文档和注释

迁移完成后，您可以选择保留或删除原有的 `lan-communication` 目录。建议先保留作为参考，确认新库完全正常工作后再删除。

