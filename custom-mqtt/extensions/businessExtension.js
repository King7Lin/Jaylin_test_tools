/**
 * 业务扩展模块
 * 包含特定于业务的数据库操作、配置管理等功能
 * 
 * 注意：此模块依赖于特定的数据库结构和业务逻辑
 * 使用前请确保相关依赖已正确配置
 */

import { decryptAES, encryptAES, formatPayload, createAESConfig } from '../utils';

/**
 * 业务特定的加密配置
 * ⚠️ 重要：这些密钥仅用于向后兼容，在生产环境中请使用环境变量
 */
const BUSINESS_AES_CONFIG = createAESConfig(
  process.env.BUSINESS_AES_KEY || 'Ush4NkjoZs/HRbU8rmT18/MAvN62+Gc3',
  process.env.BUSINESS_AES_IV || 'eiostpos'
);

// 条件导入，避免在不需要时引入业务依赖
let SqliteDAOFactory, querySql, DeviceEventEmitter, storeData, getDAOForTable, getOrderedValues;

try {
  // 这些导入可能在某些环境中不可用
  SqliteDAOFactory = require('../db/SqliteDAOFactory').default;
  querySql = require('../db/SqliteConnectionHandler').querySql;
  DeviceEventEmitter = require('react-native').DeviceEventEmitter;
  storeData = require('./asyncStorageManage').storeData;
  getDAOForTable = require('../db/sync/SyncOps').getDAOForTable;
  getOrderedValues = require('../db/sync/SyncOps').getOrderedValues;
} catch (error) {
  console.warn('[Business Extension] 某些业务依赖不可用，相关功能将被禁用:', error.message);
}

/**
 * 检查业务功能是否可用
 * @returns {boolean} 业务功能可用性
 */
export const isBusinessFunctionsAvailable = () => {
  return !!(SqliteDAOFactory && querySql && DeviceEventEmitter);
};

/**
 * 处理启动码（业务特定）
 * @param {string} encryptedValue - 加密的配置值
 * @returns {Promise<void>}
 */
export const handleSaveCFG = async (encryptedValue) => {
  if (!isBusinessFunctionsAvailable()) {
    throw new Error('业务功能不可用：缺少必要的依赖');
  }

  try {
    console.log('[Business Extension] 处理配置保存...');

    const decryptedValue = decryptAES(encryptedValue, BUSINESS_AES_CONFIG);
    const configData = JSON.parse(decryptedValue);
    
    // 保存到数据库
    await upsertFBSettings(configData);
    
    // 缓存outletCode
    if (configData.outletCode && storeData) {
      await storeData('outletCode', configData.outletCode);
    }
    
    // 广播配置更新事件
    if (DeviceEventEmitter) {
      const newConfig = await getDBConfig();
      DeviceEventEmitter.emit('MQTT_CFG_UPDATED', newConfig);
    }
    
    console.log('[Business Extension] 配置保存完成');
  } catch (error) {
    console.error('[Business Extension] 配置保存失败:', error);
    throw new Error('handleSaveCFG 错误: ' + error.message);
  }
};

/**
 * 从数据库获取MQTT配置（业务特定）
 * @returns {Promise<Object>} MQTT配置对象
 */
export const getDBConfig = async () => {
  if (!isBusinessFunctionsAvailable()) {
    console.warn('[Business Extension] 业务功能不可用，返回空配置');
    return {};
  }

  try {
    console.log('[Business Extension] 开始获取数据库配置...');

    // 批量获取配置项
    const configKeys = [
      'MQ_USERNAME',
      'MQ_PASSWORD', 
      'MQ_URL',
      'CLIENT_CODE',
      'CLIENT_KEY',
    ];
    
    const configMap = await getBatchConfig(configKeys);

    const username = configMap['MQ_USERNAME'];
    const password = configMap['MQ_PASSWORD'];
    const url = configMap['MQ_URL'];
    const clientCode = configMap['CLIENT_CODE'];
    const clientId = configMap['CLIENT_KEY'];

    // 解析MQTT URL（使用通用工具）
    const { parseMqttUrl } = await import('../utils');
    const { protocol, host, port, transport } = parseMqttUrl(url);

    const config = {
      host,
      port,
      clientId,
      username,
      password,
      keepalive: 60,
      protocol,
      protocolVersion: 5,
      transport: 'websocket',
      wsOptions: {
        rejectUnauthorized: false,
      },
      clean: false,
      qos: 1,
      maxReconnectAttempts: -1,
      initialReconnectDelay: 5000,
      clientCode, // 业务特定字段
    };

    console.log('[Business Extension] 数据库配置获取完成');
    return config;
  } catch (error) {
    console.error('[Business Extension] 获取数据库配置失败:', error);
    return {};
  }
};

/**
 * 批量获取配置项（优化的数据库查询）
 * @param {Array<string>} configs - 配置项数组
 * @returns {Promise<Object>} 配置映射对象
 */
const getBatchConfig = async (configs) => {
  if (!querySql) {
    throw new Error('数据库查询功能不可用');
  }

  try {
    console.log('[Business Extension] 开始批量配置查询...');

    // 构建SQL查询
    const placeholders = configs.map(() => '?').join(',');
    const selectSql = `SELECT * FROM cfg_module_setting WHERE module = ? AND outlet = ? AND station = ? AND setting IN (${placeholders})`;
    const params = ['FB', 'mqtt', 'mqtt', ...configs];

    // 执行查询
    const res = await querySql(selectSql, params);

    // 转换为键值对映射
    const configMap = {};
    if (res && res.data && res.data.length > 0) {
      res.data.forEach(item => {
        configMap[item.setting] = item.value;
      });
    }

    // 确保所有请求的配置都有值
    configs.forEach(config => {
      if (!(config in configMap)) {
        configMap[config] = null;
      }
    });

    console.log('[Business Extension] 批量配置查询完成');
    return configMap;
  } catch (error) {
    console.error('[Business Extension] 批量配置查询失败:', error);
    
    // 回退到单个查询
    console.log('[Business Extension] 使用回退查询模式...');
    const results = {};
    
    for (const config of configs) {
      try {
        results[config] = await getConfig(config);
      } catch (err) {
        console.error(`[Business Extension] 获取配置 ${config} 失败:`, err);
        results[config] = null;
      }
    }
    
    return results;
  }
};

/**
 * 获取单个配置项
 * @param {string} config - 配置项名称
 * @returns {Promise<any>} 配置值
 */
const getConfig = async (config) => {
  if (!SqliteDAOFactory) {
    throw new Error('数据库DAO不可用');
  }

  try {
    const cfgModuleSettingDAO = SqliteDAOFactory.getCfgModuleSettingDAO();
    const res = await cfgModuleSettingDAO.getByKey(['FB', 'mqtt', 'mqtt', config]);
    
    if (res && res.data.length > 0) {
      return res.data[0].value;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`[Business Extension] 获取配置项 ${config} 失败:`, error);
    return null;
  }
};

/**
 * 保存FB设置到数据库
 * @param {Object} configData - 配置数据
 * @returns {Promise<boolean>} 保存结果
 */
export const upsertFBSettings = async (configData) => {
  if (!SqliteDAOFactory) {
    throw new Error('数据库DAO不可用');
  }

  try {
    const cfgModuleSettingDAO = SqliteDAOFactory.getCfgModuleSettingDAO();
    console.log('[Business Extension] 开始保存FB设置...');

    const settings = Object.keys(configData);
    const rows = settings.map(setting => ({
      module: 'FB',
      outlet: 'mqtt',
      station: 'mqtt',
      setting,
      value: configData[setting],
    }));

    // 批量保存
    for (const item of rows) {
      await cfgModuleSettingDAO.saveRecord(item);
    }

    console.log('[Business Extension] FB设置保存完成');
    return true;
  } catch (error) {
    console.error('[Business Extension] FB设置保存失败:', error);
    return false;
  }
};

/**
 * 处理MQTT消息（业务特定的数据库同步逻辑）
 * @param {Object} message - MQTT消息对象
 * @returns {Promise<void>}
 */
export const handleMqttMessage = async (message) => {
  if (!isBusinessFunctionsAvailable() || !getDAOForTable || !getOrderedValues) {
    console.warn('[Business Extension] 业务消息处理功能不可用');
    return;
  }

  try {
    console.log('[Business Extension] 处理MQTT消息:', message);

    const payload = message.payload;
    
    // 获取对应的表DAO
    const baseDAO = getDAOForTable(message.table);
    if (!baseDAO) {
      console.log(`[Business Extension] 未找到对应的表: ${message.table}`);
      return;
    }

    // 处理payload
    const tablePayload = typeof payload === 'object' ? payload : JSON.parse(payload);
    const formatData = formatPayload(tablePayload);

    // 获取主键数据
    const keyData = getOrderedValues(message.table, message.key);
    const keyObject = message.key.map(item => {
      const obj = {};
      obj[item.field] = item.value;
      return obj;
    });

    // 根据操作类型处理数据
    switch (message.action) {
      case 'add':
        await baseDAO.saveRecord(formatData);
        console.log('[Business Extension] 记录添加成功');
        break;
        
      case 'edit':
        // 过滤掉主键字段
        const newData = { ...formatData };
        keyObject.forEach(k => {
          const field = Object.keys(k)[0];
          if (field) {
            delete newData[field];
          }
        });
        
        await baseDAO.updateRecordByFields(keyData, newData);
        console.log('[Business Extension] 记录更新成功');
        break;
        
      case 'delete':
        // 合并主键对象
        const primaryKeyObject = message.key.reduce((acc, cur) => {
          acc[cur.field] = cur.value;
          return acc;
        }, {});
        
        await baseDAO.deleteRecord(primaryKeyObject);
        console.log('[Business Extension] 记录删除成功');
        break;
        
      default:
        console.log('[Business Extension] 未知操作类型:', message.action);
        break;
    }

    // 广播刷新事件
    if (DeviceEventEmitter) {
      DeviceEventEmitter.emit('REFRESH_ITEMS');
    }
    
  } catch (error) {
    console.error('[Business Extension] MQTT消息处理失败:', error);
    throw error;
  }
};

/**
 * 创建业务消息过滤器
 * @param {string} expectedSenderId - 期望的发送者ID
 * @returns {Function} 消息过滤函数
 */
export const createBusinessMessageFilter = (expectedSenderId = 'jaylin') => {
  return (topic, message) => {
    try {
      // 检查消息是否包含期望的senderId
      if (typeof message === 'object' && message.senderId) {
        return message.senderId === expectedSenderId;
      }
      
      // 如果消息是字符串，尝试解析
      if (typeof message === 'string') {
        try {
          const parsed = JSON.parse(message);
          return parsed.senderId === expectedSenderId;
        } catch {
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[Business Extension] 消息过滤失败:', error);
      return false;
    }
  };
};

/**
 * 创建业务消息处理器
 * @returns {Function} 消息处理函数
 */
export const createBusinessMessageProcessor = () => {
  return (message) => {
    try {
      // 如果消息包含特定的业务字段，进行处理
      if (typeof message === 'object' && message.table && message.action) {
        // 这是一个数据库同步消息，触发处理
        handleMqttMessage(message).catch(error => {
          console.error('[Business Extension] 异步消息处理失败:', error);
        });
      }
      
      return message;
    } catch (error) {
      console.error('[Business Extension] 消息处理器错误:', error);
      return message;
    }
  };
};

/**
 * 导出业务扩展功能
 */
export default {
  isBusinessFunctionsAvailable,
  handleSaveCFG,
  getDBConfig,
  upsertFBSettings,
  handleMqttMessage,
  createBusinessMessageFilter,
  createBusinessMessageProcessor,
};
