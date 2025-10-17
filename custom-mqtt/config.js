/**
 * MQTT配置模板集合
 * 提供多种预设配置，适用于不同的使用场景
 */

// 生成随机客户端ID的工具函数
const generateClientId = (prefix = 'client') => 
  `${prefix}_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;

/**
 * 基础配置模板 - 适用于简单的MQTT连接
 * 特点: 清除会话、基本重连、开发环境SSL设置
 */
export const config = {
  host: '', // MQTT代理地址，必须设置
  port: 8883, // 默认WSS端口
  clientId: generateClientId(),
  username: '', // 用户名，根据实际情况设置
  password: '', // 密码，根据实际情况设置
  keepalive: 60, // 心跳间隔（秒）
  protocol: 'wss', // 使用安全WebSocket
  protocolVersion: 4, // MQTT 3.1.1
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: false, // 开发环境下设为false，生产环境建议true
  },
  clean: true, // 清除会话
  maxReconnectAttempts: 5, // 最大重连次数
  initialReconnectDelay: 3000, // 初始重连延迟（毫秒）
};

/**
 * 持久化配置模板 - 适用于需要保持会话的长连接应用
 * 特点: 持久会话、无限重连、会话恢复
 */
export const persistentConfig = {
  host: '', // MQTT代理地址，必须设置
  port: 8883,
  clientId: generateClientId('persistent'),
  username: '',
  password: '',
  keepalive: 60,
  protocol: 'wss',
  protocolVersion: 4,
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: false,
  },
  clean: false, // 保持会话
  maxReconnectAttempts: -1, // 无限重连
  initialReconnectDelay: 5000, // 重连延迟
  // 会话属性（MQTT 5.0）
  properties: {
    sessionExpiryInterval: 3600, // 会话过期时间（秒）
  },
};

/**
 * 测试配置模板 - 适用于本地开发和测试
 * 特点: 本地连接、明确的测试参数、详细的主题配置
 */
export const testConfig = {
  host: '127.0.0.1', // 本地MQTT代理
  port: 8000, // 非标准端口用于测试
  clientId: 'test_client',
  username: 'admin',
  password: 'admin',
  keepalive: 60,
  protocol: 'ws', // 非加密WebSocket用于测试
  protocolVersion: 5, // 使用最新的MQTT 5.0
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: false,
  },
  clean: false,
  topics: {
    dataUpdate: 'data/update/#', // 数据更新主题
    dataDelete: 'data/delete/#', // 数据删除主题
    command: 'command/#', // 命令主题
    status: 'status/+', // 状态主题
    heartbeat: 'heartbeat', // 心跳主题
  },
  qos: 1, // 默认服务质量级别
  maxReconnectAttempts: -1,
  initialReconnectDelay: 2000, // 测试环境更快的重连
  clientCode: 'test_client_code', // 业务客户端代码
};

/**
 * 生产环境配置模板 - 适用于生产部署
 * 特点: 安全设置、优化的重连策略、生产级参数
 */
export const productionConfig = {
  host: '', // 生产环境MQTT代理地址
  port: 8883,
  clientId: generateClientId('prod'),
  username: '',
  password: '',
  keepalive: 30, // 更频繁的心跳
  protocol: 'wss',
  protocolVersion: 4,
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: true, // 生产环境验证SSL证书
  },
  clean: false,
  maxReconnectAttempts: 10, // 有限次数重连
  initialReconnectDelay: 1000,
  connectTimeout: 30000, // 连接超时30秒
  properties: {
    sessionExpiryInterval: 7200, // 2小时会话过期
  },
};

/**
 * 高频消息配置模板 - 适用于高频率消息传输场景
 * 特点: 优化的QoS设置、较短的心跳间隔、快速重连
 */
export const highFrequencyConfig = {
  host: '',
  port: 8883,
  clientId: generateClientId('hf'),
  username: '',
  password: '',
  keepalive: 15, // 短心跳间隔
  protocol: 'wss',
  protocolVersion: 5,
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: false,
  },
  clean: true, // 不保持会话，减少服务器负担
  maxReconnectAttempts: 3, // 快速失败
  initialReconnectDelay: 500, // 快速重连
  qos: 0, // 默认QoS 0，提高性能
  connectTimeout: 10000, // 10秒连接超时
};

/**
 * 物联网设备配置模板 - 适用于IoT设备连接
 * 特点: 长心跳、低功耗设置、设备ID生成
 */
export const iotDeviceConfig = {
  host: '',
  port: 8883,
  clientId: generateClientId('iot'),
  username: '',
  password: '',
  keepalive: 300, // 5分钟心跳，适合低功耗设备
  protocol: 'wss',
  protocolVersion: 4,
  transport: 'websocket',
  wsOptions: {
    rejectUnauthorized: true,
  },
  clean: false, // 保持会话，断线重连恢复状态
  maxReconnectAttempts: -1, // 设备应该持续尝试连接
  initialReconnectDelay: 10000, // 10秒重连延迟
  qos: 1, // QoS 1确保消息可靠传输
  topics: {
    telemetry: 'telemetry/+', // 遥测数据
    command: 'command/+', // 命令下发
    status: 'status/+', // 设备状态
  },
};

/**
 * 默认导出基础配置
 */
export default config;

