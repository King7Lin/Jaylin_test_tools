/**
 * MQTT工具文件 - 重构版本
 * 
 * 此文件现在主要用于向后兼容，实际功能已分离到：
 * - utils.js: 通用工具函数
 * - extensions/businessExtension.js: 业务特定功能
 * 
 * @deprecated 建议直接使用 utils.js 和相应的扩展模块
 */

// 导入通用工具函数
export {
  decryptAES,
  encryptAES,
  parseMqttUrl,
  processJsonMessage,
  generateClientId,
  validateMqttConfig,
  formatPayload,
  createMessageFilter,
  createTopicMatcher,
  CONNECTION_STATES,
  QOS_LEVELS,
} from './utils';

// 尝试导入业务扩展功能（可能在某些环境中不可用）
let businessExtension = null;
try {
  businessExtension = require('./extensions/businessExtension');
  } catch (error) {
  console.warn('[MQTT] 业务扩展模块不可用:', error.message);
}

// 导出业务功能（如果可用）
export const handleSaveCFG = businessExtension?.handleSaveCFG || (() => {
  throw new Error('业务扩展功能不可用：handleSaveCFG');
});

export const getDBConfig = businessExtension?.getDBConfig || (() => {
  console.warn('业务扩展功能不可用：getDBConfig，返回空配置');
  return Promise.resolve({});
});

export const upsertFBSettings = businessExtension?.upsertFBSettings || (() => {
  throw new Error('业务扩展功能不可用：upsertFBSettings');
});

export const handleMqttMessage = businessExtension?.handleMqttMessage || (() => {
  console.warn('业务扩展功能不可用：handleMqttMessage');
  return Promise.resolve();
});

// 导出业务工具函数
export const createBusinessMessageFilter = businessExtension?.createBusinessMessageFilter || (() => {
  console.warn('业务扩展功能不可用：createBusinessMessageFilter');
  return () => true;
});

export const createBusinessMessageProcessor = businessExtension?.createBusinessMessageProcessor || (() => {
  console.warn('业务扩展功能不可用：createBusinessMessageProcessor');
  return (message) => message;
});

// 检查业务功能可用性
export const isBusinessFunctionsAvailable = businessExtension?.isBusinessFunctionsAvailable || (() => false);

/**
 * 向后兼容性说明
 * 
 * 此文件保持了原有的API接口，但实际实现已迁移到模块化结构：
 * 
 * 1. 通用工具函数 → utils.js
 * 2. 业务特定功能 → extensions/businessExtension.js
 * 
 * 如果在新项目中使用，建议直接导入具体的模块：
 * 
 * ```javascript
 * // 推荐的新方式
 * import { decryptAES, encryptAES } from './utils';
 * import { getDBConfig, handleMqttMessage } from './extensions/businessExtension';
 * 
 * // 而不是
 * import { decryptAES, getDBConfig } from './mqtt';
 * ```
 * 
 * 这样可以实现更好的代码分离和可维护性。
 */