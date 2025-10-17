# react-native-mqtt-hooks

React Native的MQTT客户端，使用Hooks API实现。提供简单易用的接口来连接、发布和订阅MQTT消息，支持通用和业务特定两种使用模式。

## 📚 目录

- [🚀 快速开始](#-快速开始)
- [🔐 重要安全提醒](#-重要安全提醒)  
- [💡 使用示例](#-使用示例)
- [📖 API文档](#-api文档)
- [⚙️ 配置说明](#️-配置说明)
- [🚀 快速迁移指南](#-快速迁移指南)
- [🔐 安全配置](#-安全配置)
- [🔧 故障排除](#-故障排除)
- [🏗️ 架构说明](#️-架构说明)
- [📄 变更日志](#-变更日志)

## 🚀 快速开始

### 核心功能

- **useMqttService**: 底层MQTT服务Hook，提供完整的MQTT客户端功能
- **MQTTProvider (通用版)**: 简单的全局MQTT上下文提供者，适用于大多数场景  
- **MQTTProvider (集成版)**: 包含数据库集成、AES加密、业务逻辑的高级版本
- **useMQTTContext**: React Hook，用于在组件中访问MQTT服务和状态

### 特性

- ✅ 使用React Hooks API
- ✅ 支持连接、断开、发布、订阅、取消订阅功能
- ✅ 自动重连机制（支持指数退避算法）
- ✅ 订阅列表管理和配置持续化连接
- ✅ 支持WebSocket和原生MQTT协议
- ✅ 支持QoS级别控制
- ✅ 消息加密/解密支持（AES）
- ✅ 数据库集成（可选）
- ✅ 消息过滤和处理器
- ✅ 性能优化和内存管理

### 安装

1. 将此文件夹复制到你的项目中

2. 修改你的package.json文件，添加本地依赖：
   ```json
   "dependencies": {
     "react-native-mqtt-hooks": "file:./custom-mqtt"
   }
   ```

3. 安装必需依赖
   ```bash
   npm install mqtt prop-types
   # 或
   yarn add mqtt prop-types
   ```

4. 如果使用集成版MQTTProvider或加密功能，还需要安装：
   ```bash
   npm install crypto-js
   # 或
   yarn add crypto-js
   ```

## 🔐 重要安全提醒

**v2.0版本已移除所有硬编码的加密密钥！** 如果您需要使用加密功能，必须提供自己的安全配置：

```javascript
import { createAESConfig, generateSecureKey, generateSecureIV } from 'react-native-mqtt-hooks/utils';

// ❌ 不安全：硬编码密钥
const badConfig = createAESConfig('my-key', 'my-iv');

// ✅ 安全：使用环境变量
const safeConfig = createAESConfig(
  process.env.REACT_APP_AES_KEY,
  process.env.REACT_APP_AES_IV
);
```

详细的安全配置请参考下方的"🔐 安全配置"章节

## 💡 使用示例

### 基础使用 (useMqttService)

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput, StyleSheet } from 'react-native';
import { useMqttService, config } from 'react-native-mqtt-hooks';

const MqttDemoScreen = () => {
  const [topic, setTopic] = useState('test/topic');
  const [message, setMessage] = useState('Hello MQTT!');
  const [receivedMessages, setReceivedMessages] = useState([]);

  // 配置MQTT连接参数
  const mqttConfig = {
    ...config,
    host: 'your-mqtt-host',
    port: 8883,
    username: 'your-username',
    password: 'your-password',
    clientId: `client_${Math.random().toString(36).substring(2, 10)}`,
  };

  // 使用MQTT服务
  const { connect, disconnect, publish, subscribe, unsubscribe, isConnected, subscribeList } = useMqttService(mqttConfig);

  // 连接状态处理函数
  const handleConnectionStatus = (status, error) => {
    console.log('连接状态:', status);
    if (error) console.error('连接错误:', error);
  };

  // 连接MQTT服务器
  useEffect(() => {
    connect(handleConnectionStatus);
    return () => {
      disconnect();
    };
  }, []);

  // 处理接收到的消息
  useEffect(() => {
    const handleMessage = (receivedTopic, receivedMessage) => {
      setReceivedMessages(prev => [...prev, { topic: receivedTopic, message: receivedMessage, timestamp: new Date() }]);
    };

    // 连接成功后订阅主题
    if (isConnected) {
      subscribe(topic, 1, handleMessage);
    }

    return () => {
      if (isConnected) {
        unsubscribe(topic);
      }
    };
  }, [isConnected, topic]);

  // 发布消息
  const handlePublish = async () => {
    try {
      await publish(topic, message, 1);
      alert('消息发布成功');
    } catch (error) {
      alert('消息发布失败: ' + error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MQTT Demo</Text>
      <Text>连接状态: {isConnected ? '已连接' : '未连接'}</Text>
      <Text>已订阅主题: {subscribeList.join(', ')}</Text>

      <TextInput
        style={styles.input}
        placeholder="输入主题"
        value={topic}
        onChangeText={setTopic}
      />

      <TextInput
        style={styles.input}
        placeholder="输入消息"
        value={message}
        onChangeText={setMessage}
      />

      <Button title="发布消息" onPress={handlePublish} />

      <Text style={styles.subtitle}>接收到的消息:</Text>
      {receivedMessages.map((msg, index) => (
        <View key={index} style={styles.message}>
          <Text>主题: {msg.topic}</Text>
          <Text>消息: {msg.message}</Text>
          <Text>时间: {msg.timestamp?.toLocaleTimeString()}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  message: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    marginBottom: 5,
    borderRadius: 5,
  },
});

export default MqttDemoScreen;
```

### 使用MQTTProvider (通用版) 和 useMQTTContext

通用版适合大多数应用场景，提供简单的MQTT功能：

```jsx
// App.jsx - 根组件
import React from 'react';
import { MQTTProvider } from 'react-native-mqtt-hooks/MQTTContext.jsx';
import { config } from 'react-native-mqtt-hooks';
import MqttDemoScreen from './MqttDemoScreen';

const App = () => {
  const mqttConfig = {
    ...config,
    host: 'your-mqtt-host',
    port: 8883,
    username: 'your-username',
    password: 'your-password',
    clientId: 'unique-client-id'
  };

  return (
    <MQTTProvider 
      config={mqttConfig}
      defaultTopic="test/topic"
      defaultQos={1}
      autoConnect={true}
      autoSubscribe={true}
    >
      <MqttDemoScreen />
    </MQTTProvider>
  );
};

export default App;
```

在组件中使用useMQTTContext：

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import { useMQTTContext } from 'react-native-mqtt-hooks/MQTTContext.jsx';

const MqttDemoScreen = () => {
  const [topic, setTopic] = useState('test/topic');
  const [message, setMessage] = useState('Hello MQTT!');
  
  // 使用MQTT上下文
  const { 
    isConnected, 
    handlePushMessage, 
    subscribeList, 
    globalMessages,
    doSubscribe,
    unsubscribe 
  } = useMQTTContext();

  // 订阅额外主题
  const handleSubscribe = async () => {
    await doSubscribe(topic, 1);
  };

  // 发布消息
  const handlePublish = async () => {
    try {
      await handlePushMessage(topic, message, 'myClientId');
      alert('消息发布成功');
    } catch (error) {
      alert('消息发布失败: ' + error.message);
    }
  };

  return (
    <View>
      <Text>连接状态: {isConnected ? '已连接' : '未连接'}</Text>
      <Text>已订阅主题: {subscribeList.join(', ')}</Text>
      
      <TextInput
        placeholder="输入主题"
        value={topic}
        onChangeText={setTopic}
      />
      
      <TextInput
        placeholder="输入消息"
        value={message}
        onChangeText={setMessage}
      />
      
      <Button title="订阅主题" onPress={handleSubscribe} />
      <Button title="发布消息" onPress={handlePublish} />
      
      <Text>全局消息数量: {globalMessages.length}</Text>
    </View>
  );
};

export default MqttDemoScreen;
```

### 使用MQTTProvider (集成版) - 高级功能

集成版包含数据库集成、AES加密等高级功能，适合复杂的业务场景：

```jsx
// App.jsx - 使用集成版
import React from 'react';
import { MQTTProvider } from 'react-native-mqtt-hooks/MQTTContext.js';
import MqttDemoScreen from './MqttDemoScreen';

const App = () => {
  // 集成版自动从数据库读取配置，无需手动传入config
  return (
    <MQTTProvider 
      defaultTopic="client"
      defaultQos={1}
      autoConnect={true}
      autoSubscribe={true}
    >
      <MqttDemoScreen />
    </MQTTProvider>
  );
};

export default App;
```

集成版的组件使用：

```jsx
import React, { useState } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import { useMQTTContext } from 'react-native-mqtt-hooks/MQTTContext.js';

const MqttDemoScreen = () => {
  const [message, setMessage] = useState({ type: 'test', data: 'Hello' });
  
  const { 
    isConnected, 
    handlePushMessage, 
    globalMessages,
    derivedTopic,
    effectiveConfig 
  } = useMQTTContext();

  // 发布消息（自动使用derivedTopic和AES加密）
  const handlePublish = async () => {
    try {
      // 第一个参数是消息内容，自动使用derivedTopic
      await handlePushMessage(message);
      alert('消息发布成功');
    } catch (error) {
      alert('消息发布失败: ' + error.message);
    }
  };

  return (
    <View>
      <Text>连接状态: {isConnected ? '已连接' : '未连接'}</Text>
      <Text>订阅主题: {derivedTopic}</Text>
      <Text>客户端ID: {effectiveConfig?.clientId}</Text>
      
      <TextInput
        placeholder="输入消息内容"
        value={JSON.stringify(message)}
        onChangeText={(text) => {
          try {
            setMessage(JSON.parse(text));
          } catch {
            setMessage({ message: text });
          }
        }}
      />
      
      <Button title="发布消息" onPress={handlePublish} />
      
      <Text>接收到的消息: {globalMessages.length}</Text>
      {globalMessages.slice(-3).map((msg, index) => (
        <Text key={index}>{JSON.stringify(msg.message)}</Text>
      ))}
    </View>
  );
};

export default MqttDemoScreen;
```

## 📖 API文档

### useMqttService(config)

创建MQTT服务实例的React Hook，提供底层MQTT客户端功能。

#### 参数
- `config`: MQTT配置对象
  ```typescript
  {
    host: string;                    // MQTT 代理地址
    port: number;                    // 端口号
    clientId: string;                // 客户端ID
    username: string;                // 用户名
    password: string;                // 密码
    keepalive?: number;              // 心跳间隔，默认60秒
    protocol: 'ws' | 'wss' | 'mqtt' | 'mqtts'; // 协议类型
    protocolVersion: 3 | 4 | 5;      // MQTT协议版本
    transport: 'websocket';          // 传输方式
    wsOptions?: {
      rejectUnauthorized: boolean;   // 是否拒绝未经授权的SSL证书
    };
    clean?: boolean;                 // 断开连接时是否清除会话
    maxReconnectAttempts?: number;   // 最大重连次数，-1表示无限重连
    initialReconnectDelay?: number;  // 初始重连延迟（毫秒）
  }
  ```

#### 返回值
- `connect(onStatusChange?, configOverride?)`: 连接到MQTT服务器
  - `onStatusChange`: 连接状态变化回调函数
  - `configOverride`: 可选的配置覆盖
- `disconnect()`: 断开MQTT连接
- `publish(topic, message, qos?, retain?)`: 发布消息
  - 返回Promise，成功时resolve(true)
- `subscribe(topic, qos?, callback)`: 订阅主题
  - `callback`: (topic, message) => void
  - 返回Promise，成功时resolve(true)
- `unsubscribe(topic)`: 取消订阅主题
- `isConnected`: 布尔值，表示当前连接状态
- `subscribeList`: 数组，表示当前订阅的主题列表

### MQTTProvider (通用版) - MQTTContext.jsx

简单的全局MQTT上下文提供者，适合大多数应用场景。

#### Props
- `children`: React 子组件
- `config`: MQTT 配置对象，与 useMqttService 的配置相同
- `defaultTopic`: 默认订阅主题，默认为 'clien'
- `defaultQos`: 默认订阅 QoS 级别，默认为 1
- `autoSubscribe`: 是否在连接成功后自动订阅，默认为 true
- `autoConnect`: 是否在组件挂载时自动连接，默认为 true

#### 提供的值
- `connect()`: 连接到MQTT服务器的函数
- `disconnect()`: 断开MQTT连接的函数
- `globalMessages`: 全局消息数组
- `getGlobalMessages()`: 获取全局消息的函数
- `doSubscribe(topic, qos)`: 订阅主题的函数
- `unsubscribe(topic)`: 取消订阅主题的函数
- `handlePushMessage(topic, message, senderId, qos, retain)`: 发布消息的函数
- `isConnected`: 布尔值，表示当前连接状态
- `subscribeList`: 数组，表示当前订阅的主题列表

### MQTTProvider (集成版) - MQTTContext.js

高级版本的MQTT上下文提供者，包含数据库集成、AES加密等功能。

#### Props
- `children`: React 子组件
- `defaultTopic`: 默认订阅主题，默认为 'clien'（通常被数据库配置覆盖）
- `defaultQos`: 默认订阅 QoS 级别，默认为 1
- `autoSubscribe`: 是否在连接成功后自动订阅，默认为 true
- `autoConnect`: 是否在组件挂载时自动连接，默认为 true

#### 特殊功能
- 自动从数据库读取MQTT配置
- AES消息加密/解密
- 自动数据库同步
- 配置热更新（通过DeviceEventEmitter）

#### 提供的值
- `connect()`: 连接到MQTT服务器的函数
- `disconnect()`: 断开MQTT连接的函数
- `globalMessages`: 全局消息数组（已解密和处理）
- `getGlobalMessages()`: 获取全局消息的函数
- `doSubscribe(topic, qos)`: 订阅主题的函数
- `unsubscribe(topic)`: 取消订阅主题的函数
- `handlePushMessage(messageOrTopic, message?, senderId?, qos?, retain?)`: 发布消息的函数
  - 支持两种调用方式：`(message)` 或 `(topic, message)`
- `isConnected`: 布尔值，表示当前连接状态
- `subscribeList`: 数组，表示当前订阅的主题列表
- `derivedTopic`: 从配置中派生的主题（通常是clientCode）
- `effectiveConfig`: 有效的MQTT配置对象

### useMQTTContext

获取MQTT上下文的React Hook。必须在相应的MQTTProvider内部使用。

#### 返回值
返回对应MQTTProvider提供的所有值（通用版或集成版）。

## ⚙️ 配置说明

### 预设配置模板

```javascript
import { config, persistentConfig, testConfig } from 'react-native-mqtt-hooks';

// 基础配置（清除会话）
const basicConfig = {
  ...config,
  host: 'your-broker-host',
  username: 'your-username',
  password: 'your-password'
};

// 持久化配置（保持会话）
const persistentConfig = {
  ...persistentConfig,
  host: 'your-broker-host',
  username: 'your-username',
  password: 'your-password'
};

// 测试配置
const testConfig = {
  ...testConfig,
  host: '127.0.0.1',
  port: 8000
};
```

### 连接状态回调

```javascript
const handleConnectionStatus = (status, error) => {
  switch (status) {
    case 'connectSuccess':
      console.log('连接成功');
      break;
    case 'connectTimeout':
      console.log('连接超时');
      break;
    case 'connectError':
      console.error('连接错误:', error);
      break;
    case 'disconnected':
      console.log('连接断开');
      break;
    case 'connectClosed':
      console.log('连接关闭');
      break;
    case 'reconnectError':
      console.error('重连失败:', error);
      break;
  }
};
```

## ⚠️ 重要说明

### 版本选择指南
- **通用版 (MQTTContext.jsx)**: 适合大多数应用，提供基础MQTT功能
- **集成版 (MQTTContext.js)**: 适合需要数据库集成、消息加密的复杂业务场景

### 依赖要求
- **必需**: `mqtt`, `prop-types`
- **集成版额外需要**: `crypto-js`, `react-native` (DeviceEventEmitter)
- **集成版业务依赖**: 自定义数据库DAO层、工具函数

### 注意事项

1. **内存管理**: 确保在组件卸载时调用`disconnect()`方法断开连接，避免内存泄漏
2. **SSL证书**: 生产环境建议将`wsOptions.rejectUnauthorized`设置为`true`
3. **重连策略**: 支持指数退避重连，可配置最大重连次数和延迟
4. **会话管理**: 
   - `clean: true` - 清除会话，适合临时连接
   - `clean: false` - 持久会话，断线重连时恢复订阅
5. **平台兼容**: iOS和Android平台的WebSocket连接可能需要额外配置
6. **消息格式**: 集成版自动处理JSON格式和AES加密，通用版需要手动处理
7. **主题管理**: 集成版基于数据库配置自动管理主题，通用版需要手动指定

## 🚀 快速迁移指南

### 从v1.x升级到v2.0

**1. 基础MQTT功能无变化**
```javascript
// 继续正常使用
import { useMqttService } from 'react-native-mqtt-hooks';
const { connect, publish, subscribe } = useMqttService(config);
```

**2. 加密功能需要更新**
```javascript
// 旧方式（不再支持）
const result = decryptAES(data);

// 新方式（必需）
import { createAESConfig, decryptAES } from 'react-native-mqtt-hooks/utils';
const config = createAESConfig(process.env.REACT_APP_AES_KEY, process.env.REACT_APP_AES_IV);
const result = decryptAES(data, config);
```

**3. 环境变量配置**
```bash
# .env 文件
REACT_APP_AES_KEY=your-base64-key
REACT_APP_AES_IV=your-base64-iv
```

### 新项目推荐用法

```javascript
import { MQTTProvider, useMQTTContext } from 'react-native-mqtt-hooks/MQTTContext.jsx';
import { productionConfig, createAESConfig } from 'react-native-mqtt-hooks';

const App = () => {
  const mqttConfig = {
    ...productionConfig,
    host: process.env.MQTT_HOST,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
  };

  return (
    <MQTTProvider 
      config={mqttConfig}
      enableLogging={__DEV__}
      maxMessages={1000}
    >
      <YourApp />
    </MQTTProvider>
  );
};
```

## 🔐 安全配置

### 生成安全密钥
```javascript
import { generateSecureKey, generateSecureIV } from 'react-native-mqtt-hooks/utils';

// 仅在初始化时运行一次
console.log('Key:', generateSecureKey(32));
console.log('IV:', generateSecureIV(16));
// 将输出保存到环境变量，然后删除此代码
```

### 安全使用示例
```javascript
import { createAESConfig, encryptAES, decryptAES } from 'react-native-mqtt-hooks/utils';

// 安全配置
const encryptConfig = createAESConfig(
  process.env.REACT_APP_AES_KEY,
  process.env.REACT_APP_AES_IV
);

// 加密解密
try {
  const encrypted = encryptAES('sensitive data', encryptConfig);
  const decrypted = decryptAES(encrypted, encryptConfig);
} catch (error) {
  console.error('加密操作失败:', error.message);
}
```

### 配置验证工具
```javascript
function validateConfig() {
  try {
    const config = createAESConfig(
      process.env.REACT_APP_AES_KEY,
      process.env.REACT_APP_AES_IV
    );
    const test = 'test-' + Date.now();
    const encrypted = encryptAES(test, config);
    const decrypted = decryptAES(encrypted, config);
    
    if (test === decrypted) {
      console.log('✅ 加密配置验证成功');
      return true;
    }
  } catch (error) {
    console.error('❌ 配置验证失败:', error.message);
  }
  return false;
}
```

## 🔧 故障排除

### 常见问题

**Q: 升级后出现"必须提供完整的加密配置"错误？**
```
A: 新版本移除了硬编码密钥，需要设置环境变量：
REACT_APP_AES_KEY=your-key
REACT_APP_AES_IV=your-iv
```

**Q: 业务功能不可用？**
```
A: 检查是否安装了业务依赖，或使用通用版MQTTContext.jsx
```

**Q: 性能问题？**
```
A: 调整maxMessages、禁用日志、使用消息过滤器
```

**Q: 连接问题？**
```
A: 检查协议类型(ws/wss)、端口号、证书设置
```

### 调试技巧

```javascript
// 1. 启用详细日志
<MQTTProvider enableLogging={true} />

// 2. 监听连接状态
const handleStatus = (status, error) => {
  console.log('MQTT状态:', status, error);
};
<MQTTProvider onConnectionStatusChange={handleStatus} />

// 3. 验证配置
import { validateMqttConfig } from 'react-native-mqtt-hooks/utils';
const { valid, errors } = validateMqttConfig(config);
if (!valid) console.error('配置错误:', errors);
```

## 🏗️ 架构说明

### 文件结构
```
custom-mqtt/
├── index.js              # useMqttService 主入口
├── config.js             # 配置模板（基础/生产/IoT等）
├── utils.js              # 通用工具（加密/URL解析等）
├── MQTTContext.jsx       # 通用版Context（推荐）
├── MQTTContext.js        # 集成版Context（业务特定）
├── mqtt.js               # 向后兼容导出
└── extensions/
    └── businessExtension.js  # 业务扩展模块
```

### 选择指南
- **新项目**: 使用`MQTTContext.jsx` + `utils.js`
- **现有项目**: 继续使用`MQTTContext.js`或逐步迁移
- **简单场景**: 直接使用`useMqttService`
- **复杂业务**: 使用集成版 + 业务扩展

## 📄 变更日志

### v2.0.0 (当前版本)
- ✅ 移除硬编码加密密钥（重大变更）
- ✅ 新增多种配置模板
- ✅ 增强MQTTContext.jsx功能
- ✅ 模块化架构重构
- ✅ 改进错误处理和日志
- ✅ 添加消息过滤和处理器
- ✅ 性能优化和内存管理

### v1.x
- 基础MQTT功能
- 简单的Context提供者
- 硬编码加密配置（已移除）