/**
 * 通用MQTT工具函数集合
 * 提供加密、解密、消息处理等通用功能
 */

import CryptoJS from 'crypto-js';

/**
 * ⚠️ 安全提醒 ⚠️
 * 
 * 本工具库不提供默认的加密密钥，您必须提供自己的密钥配置。
 * 请遵循以下安全最佳实践：
 * 
 * 1. 使用环境变量存储密钥，不要硬编码在代码中
 * 2. 定期轮换加密密钥
 * 3. 使用足够强度的密钥（至少32字节）
 * 4. 确保IV是随机生成的，不要重复使用
 * 5. 在生产环境中使用HTTPS/WSS传输
 */

/**
 * 创建安全的AES配置
 * @param {string} key - 32字节的密钥（Base64或UTF-8）
 * @param {string} iv - 16字节的初始化向量（Base64或UTF-8）
 * @returns {Object} AES配置对象
 */
export const createAESConfig = (key, iv) => {
  if (!key || !iv) {
    throw new Error('密钥和IV不能为空。请提供安全的加密配置。');
  }
  
  return {
    key,
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  };
};

/**
 * 生成随机密钥
 * @param {number} length - 密钥长度（字节），推荐32
 * @returns {string} Base64编码的随机密钥
 */
export const generateSecureKey = (length = 32) => {
  return CryptoJS.lib.WordArray.random(length).toString(CryptoJS.enc.Base64);
};

/**
 * 生成随机IV
 * @param {number} length - IV长度（字节），AES要求16
 * @returns {string} Base64编码的随机IV
 */
export const generateSecureIV = (length = 16) => {
  return CryptoJS.lib.WordArray.random(length).toString(CryptoJS.enc.Base64);
};

/**
 * AES解密函数（安全版）
 * @param {string} cipherBase64 - Base64编码的密文
 * @param {Object} config - 加密配置（必需）
 * @returns {string} 解密后的明文
 */
export const decryptAES = (cipherBase64, config) => {
  if (!config || !config.key || !config.iv) {
    throw new Error('必须提供完整的加密配置（key和iv）。请使用createAESConfig()创建配置。');
  }

  try {
    const key = CryptoJS.enc.Utf8.parse(config.key);
    const iv = CryptoJS.enc.Utf8.parse(config.iv.padEnd(16, '\x00')); // 补足16字节

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(cipherBase64) },
      key,
      {
        iv,
        mode: config.mode || CryptoJS.mode.CBC,
        padding: config.padding || CryptoJS.pad.Pkcs7,
      }
    );

    const result = CryptoJS.enc.Utf8.stringify(decrypted);
    if (!result) {
      throw new Error('解密失败：可能是密钥错误或数据损坏');
    }
    return result;
  } catch (error) {
    console.warn('[MQTT Utils] AES解密失败:', error.message);
    throw error; // 抛出错误而不是返回空字符串，让调用者处理
  }
};

/**
 * AES加密函数（安全版）
 * @param {string} plaintext - 待加密的明文字符串
 * @param {Object} config - 加密配置（必需）
 * @returns {string} Base64编码的密文
 */
export const encryptAES = (plaintext, config) => {
  if (!config || !config.key || !config.iv) {
    throw new Error('必须提供完整的加密配置（key和iv）。请使用createAESConfig()创建配置。');
  }

  try {
    const key = CryptoJS.enc.Utf8.parse(config.key);
    const iv = CryptoJS.enc.Utf8.parse(config.iv.padEnd(16, '\x00')); // 补足16字节

    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
      iv,
      mode: config.mode || CryptoJS.mode.CBC,
      padding: config.padding || CryptoJS.pad.Pkcs7,
    });

    return encrypted.toString();
  } catch (error) {
    console.warn('[MQTT Utils] AES加密失败:', error.message);
    throw error; // 抛出错误而不是返回空字符串，让调用者处理
  }
};

/**
 * 解析MQTT URL为配置对象
 * @param {string} url - MQTT连接URL
 * @returns {Object} 解析后的配置对象
 */
export const parseMqttUrl = (url) => {
  try {
    if (!url || typeof url !== 'string') {
      return {};
    }

    // 确保URL有协议前缀
    const hasScheme = /:\/\//.test(url);
    const fullUrl = hasScheme ? url : `mqtt://${url}`;
    
    // 解析URL
    const match = fullUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^\/?#]+)/);
    if (!match) {
      return {};
    }

    const protocol = match[1];
    let authority = match[2];

    // 移除用户信息部分（如果存在）
    const atIndex = authority.lastIndexOf('@');
    if (atIndex !== -1) {
      authority = authority.slice(atIndex + 1);
    }

    let host = '';
    let port = undefined;

    // 解析IPv6地址
    if (authority.startsWith('[')) {
      const endBracket = authority.indexOf(']');
      if (endBracket !== -1) {
        host = authority.slice(0, endBracket + 1);
        const rest = authority.slice(endBracket + 1);
        if (rest.startsWith(':')) {
          port = Number(rest.slice(1));
        }
      }
    } else {
      // 解析IPv4地址或域名
      const lastColon = authority.lastIndexOf(':');
      if (lastColon > -1 && authority.indexOf(':') === lastColon) {
        host = authority.slice(0, lastColon);
        port = Number(authority.slice(lastColon + 1));
      } else {
        host = authority;
      }
    }

    // 设置默认端口
    if (!port || Number.isNaN(port)) {
      switch (protocol) {
        case 'wss':
          port = 443;
          break;
        case 'ws':
          port = 80;
          break;
        case 'mqtts':
          port = 8883;
          break;
        default:
          port = 1883;
      }
    }

    // 确定transport类型
    const transport = (protocol === 'ws' || protocol === 'wss') ? 'websocket' : undefined;

    return {
      protocol,
      host,
      port,
      transport,
    };
  } catch (error) {
    console.warn('[MQTT Utils] URL解析失败:', error.message);
    return {};
  }
};

/**
 * 处理JSON消息
 * @param {string|Object} message - 消息内容
 * @returns {Object|string|null} 处理后的消息
 */
export const processJsonMessage = (message) => {
  if (!message) return null;

  // 如果已经是对象，直接返回
  if (typeof message === 'object') {
    return message;
  }

  // 清理消息字符串
  const cleanedMessage = message.replace(/[\r\n\t]/g, '').trim();

  try {
    // 尝试解析JSON
    return JSON.parse(cleanedMessage);
  } catch (error) {
    // 如果不是JSON格式，返回清理后的字符串
    return cleanedMessage;
  }
};

/**
 * 生成唯一的客户端ID
 * @param {string} prefix - 前缀
 * @returns {string} 唯一的客户端ID
 */
export const generateClientId = (prefix = 'client') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${random}_${timestamp}`;
};

/**
 * 验证MQTT配置的完整性
 * @param {Object} config - MQTT配置对象
 * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
 */
export const validateMqttConfig = (config) => {
  const errors = [];
  
  if (!config) {
    errors.push('配置对象不能为空');
    return { valid: false, errors };
  }

  // 必需字段检查
  const requiredFields = ['host', 'port', 'clientId', 'username', 'password'];
  for (const field of requiredFields) {
    if (!config[field]) {
      errors.push(`缺少必需字段: ${field}`);
    }
  }

  // 端口号验证
  if (config.port && (typeof config.port !== 'number' || config.port < 1 || config.port > 65535)) {
    errors.push('端口号必须是1-65535之间的数字');
  }

  // 协议验证
  if (config.protocol && !['ws', 'wss', 'mqtt', 'mqtts'].includes(config.protocol)) {
    errors.push('协议必须是 ws, wss, mqtt 或 mqtts 之一');
  }

  // QoS验证
  if (config.qos !== undefined && ![0, 1, 2].includes(config.qos)) {
    errors.push('QoS必须是 0, 1 或 2');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * 格式化对象属性名（驼峰转下划线）
 * @param {Object} object - 要转换的对象
 * @returns {Object} 转换后的对象
 */
export const formatPayload = (object) => {
  if (!object || typeof object !== 'object') {
    return object;
  }

  const result = {};

  for (const [key, value] of Object.entries(object)) {
    let normalizedKey = key;

    // 检查是否已经是下划线格式
    if (key.includes('_')) {
      // 如果包含下划线，直接使用，但确保是小写
      normalizedKey = key.toLowerCase();
    } else {
      // 如果是驼峰格式，转换为下划线
      normalizedKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    }

    // 如果值是对象或数组，递归处理
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[normalizedKey] = formatPayload(value);
    } else if (Array.isArray(value)) {
      result[normalizedKey] = value.map(item =>
        typeof item === 'object' ? formatPayload(item) : item
      );
    } else {
      result[normalizedKey] = value;
    }
  }

  return result;
};

/**
 * 创建消息过滤器
 * @param {Array|Function} filters - 过滤条件数组或单个过滤函数
 * @returns {Function} 组合的过滤函数
 */
export const createMessageFilter = (filters) => {
  if (typeof filters === 'function') {
    return filters;
  }

  if (!Array.isArray(filters)) {
    return () => true; // 默认通过所有消息
  }

  return (topic, message) => {
    return filters.every(filter => {
      if (typeof filter === 'function') {
        return filter(topic, message);
      }
      return true;
    });
  };
};

/**
 * 创建主题匹配器
 * @param {string} pattern - 主题模式（支持 + 和 # 通配符）
 * @returns {Function} 主题匹配函数
 */
export const createTopicMatcher = (pattern) => {
  // 将MQTT主题模式转换为正则表达式
  const regexPattern = pattern
    .replace(/\+/g, '[^/]+')  // + 匹配单级
    .replace(/#/g, '.*');     // # 匹配多级

  const regex = new RegExp(`^${regexPattern}$`);

  return (topic) => regex.test(topic);
};

/**
 * 连接状态常量
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CONNECT_SUCCESS: 'connectSuccess',
  CONNECT_TIMEOUT: 'connectTimeout',
  CONNECT_ERROR: 'connectError',
  CONNECT_CLOSED: 'connectClosed',
  RECONNECT_ERROR: 'reconnectError',
};

/**
 * QoS级别常量
 */
export const QOS_LEVELS = {
  AT_MOST_ONCE: 0,    // 最多一次
  AT_LEAST_ONCE: 1,   // 至少一次
  EXACTLY_ONCE: 2,    // 恰好一次
};

/**
 * 默认导出所有工具函数
 */
export default {
  // 加密相关
  decryptAES,
  encryptAES,
  createAESConfig,
  generateSecureKey,
  generateSecureIV,
  
  // 工具函数
  parseMqttUrl,
  processJsonMessage,
  generateClientId,
  validateMqttConfig,
  formatPayload,
  createMessageFilter,
  createTopicMatcher,
  
  // 常量
  CONNECTION_STATES,
  QOS_LEVELS,
};
