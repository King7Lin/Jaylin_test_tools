import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useMqttService } from './index';
import { config } from './config';
import PropTypes from 'prop-types';

// 创建MQTT上下文
const MQTTContext = createContext(undefined);

/**
 * 通用版MQTTProvider组件
 * 提供基础的MQTT功能，适用于大多数应用场景
 */
export const MQTTProvider = ({ 
  children, 
  config: userConfig = {}, 
  defaultTopic = 'default/topic', 
  defaultQos = 1, 
  autoSubscribe = true, 
  autoConnect = true,
  maxMessages = 1000, // 最大消息缓存数量
  messageFilter = null, // 消息过滤函数
  onConnectionStatusChange = null, // 连接状态变化回调
  enableLogging = true, // 是否启用日志
  messageProcessors = [], // 消息处理器数组
  subscribeOnMount = true, // 挂载时是否自动订阅默认主题
}) => {
  // 合并配置
  const finalConfig = useMemo(() => ({
    ...config,
    ...userConfig,
  }), [userConfig]);

  const { connect, disconnect, subscribe, unsubscribe, publish, isConnected, subscribeList } = useMqttService(finalConfig);

  // 状态管理
  const [globalMessages, setGlobalMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastError, setLastError] = useState(null);
  const [statistics, setStatistics] = useState({
    messagesReceived: 0,
    messagesSent: 0,
    connectTime: null,
    lastMessageTime: null,
  });

  // 引用管理
  const messageProcessorsRef = useRef(messageProcessors);
  const subscriptionCallbacks = useRef(new Map()); // 主题订阅回调映射

  // 更新消息处理器引用
  useEffect(() => {
    messageProcessorsRef.current = messageProcessors;
  }, [messageProcessors]);

  // 连接状态处理
  const handleConnectionStatus = useCallback((status, error) => {
    setConnectionStatus(status);
    setLastError(error || null);
    
    if (status === 'connectSuccess') {
      setStatistics(prev => ({ ...prev, connectTime: new Date() }));
    }
    
    if (enableLogging) {
      console.log(`[MQTT] Connection status: ${status}`, error || '');
    }
    
    // 调用外部回调
    if (onConnectionStatusChange) {
      onConnectionStatusChange(status, error);
    }
  }, [enableLogging, onConnectionStatusChange]);

  // JSON消息处理函数
  const processJsonMessage = useCallback((message) => {
    if (!message) return null;
    
    // 如果已经是对象，直接返回
    if (typeof message === 'object') {
      return message;
    }
    
    // 清理消息字符串
    const cleanedMessage = message.replace(/[\r\n\t]/g, '').trim();
    
    try {
      // 尝试解析JSON
      const parsedData = JSON.parse(cleanedMessage);
      return parsedData;
    } catch (error) {
      if (enableLogging) {
        console.warn('[MQTT] Failed to parse JSON message:', error.message);
      }
      // 返回原始字符串
      return cleanedMessage;
    }
  }, [enableLogging]);

  // 应用消息处理器
  const applyMessageProcessors = useCallback((message) => {
    let processedMessage = message;
    
    for (const processor of messageProcessorsRef.current) {
      if (typeof processor === 'function') {
        try {
          processedMessage = processor(processedMessage);
        } catch (error) {
          if (enableLogging) {
            console.error('[MQTT] Message processor error:', error);
          }
        }
      }
    }
    
    return processedMessage;
  }, [enableLogging]);

  // 全局消息处理函数
  const handleGlobalMessage = useCallback((topic, message) => {
    const timestamp = new Date();
    
    // 更新统计信息
    setStatistics(prev => ({
      ...prev,
      messagesReceived: prev.messagesReceived + 1,
      lastMessageTime: timestamp,
    }));

    if (enableLogging) {
      console.log(`[MQTT] Received message on topic ${topic}`);
    }

    // 处理消息
    let processedMessage = processJsonMessage(message);
    processedMessage = applyMessageProcessors(processedMessage);

    // 应用消息过滤器
    if (messageFilter && typeof messageFilter === 'function') {
      try {
        if (!messageFilter(topic, processedMessage)) {
          if (enableLogging) {
            console.log(`[MQTT] Message filtered out for topic ${topic}`);
          }
          return;
        }
      } catch (error) {
        if (enableLogging) {
          console.error('[MQTT] Message filter error:', error);
        }
      }
    }

    // 添加到全局消息数组
    setGlobalMessages(prev => {
      const newMessages = [...prev, { 
        topic, 
        message: processedMessage, 
        originalMessage: message,
        timestamp 
      }];
      
      // 限制消息数量
      if (newMessages.length > maxMessages) {
        return newMessages.slice(-maxMessages);
      }
      
      return newMessages;
    });

    // 调用特定主题的回调
    const callback = subscriptionCallbacks.current.get(topic);
    if (callback && typeof callback === 'function') {
      try {
        callback(topic, processedMessage, timestamp);
      } catch (error) {
        if (enableLogging) {
          console.error('[MQTT] Topic callback error:', error);
        }
      }
    }
  }, [processJsonMessage, applyMessageProcessors, messageFilter, maxMessages, enableLogging]);

  // 提供获取全局消息的方法
  const getGlobalMessages = useCallback(() => globalMessages, [globalMessages]);

  // 清除消息历史
  const clearMessages = useCallback(() => {
    setGlobalMessages([]);
  }, []);

  // 获取指定主题的消息
  const getMessagesByTopic = useCallback((topic) => {
    return globalMessages.filter(msg => msg.topic === topic);
  }, [globalMessages]);

  // 订阅主题（增强版）
  const doSubscribe = useCallback(async (topic = defaultTopic, qos = defaultQos, callback = null) => {
    try {
      if (enableLogging) {
        console.log(`[MQTT] Subscribing to topic: ${topic} with QoS: ${qos}`);
      }
      
      // 如果提供了回调，保存到映射中
      if (callback && typeof callback === 'function') {
        subscriptionCallbacks.current.set(topic, callback);
      }
      
      await subscribe(topic, qos, handleGlobalMessage);
      
      if (enableLogging) {
        console.log(`[MQTT] Successfully subscribed to topic: ${topic}`);
      }
      
      return true;
    } catch (error) {
      if (enableLogging) {
        console.error(`[MQTT] Subscribe error for topic ${topic}:`, error);
      }
      setLastError(error);
      return false;
    }
  }, [defaultTopic, defaultQos, enableLogging, subscribe, handleGlobalMessage]);

  // 取消订阅（增强版）
  const doUnsubscribe = useCallback(async (topic) => {
    try {
      if (enableLogging) {
        console.log(`[MQTT] Unsubscribing from topic: ${topic}`);
      }
      
      await unsubscribe(topic);
      
      // 清理回调映射
      subscriptionCallbacks.current.delete(topic);
      
      if (enableLogging) {
        console.log(`[MQTT] Successfully unsubscribed from topic: ${topic}`);
      }
      
      return true;
    } catch (error) {
      if (enableLogging) {
        console.error(`[MQTT] Unsubscribe error for topic ${topic}:`, error);
      }
      setLastError(error);
      return false;
    }
  }, [enableLogging, unsubscribe]);

  // 发布消息（增强版）
  const handlePushMessage = useCallback(async (topic, message, senderId = null, qos = defaultQos, retain = false) => {
    try {
      let finalMessage;
      
      if (typeof message === 'object') {
        // 如果是对象，转换为JSON字符串，可选添加senderId
        finalMessage = JSON.stringify(senderId ? { ...message, senderId } : message);
      } else {
        // 如果是字符串，可选包装为对象
        finalMessage = senderId ? JSON.stringify({ message, senderId }) : message;
      }

      const result = await publish(topic, finalMessage, qos, retain);
      
      // 更新统计信息
      setStatistics(prev => ({
        ...prev,
        messagesSent: prev.messagesSent + 1,
      }));

      if (enableLogging) {
        console.log(`[MQTT] Message published to topic ${topic}`);
      }
      
      return result;
    } catch (error) {
      if (enableLogging) {
        console.error(`[MQTT] Publish error for topic ${topic}:`, error);
      }
      setLastError(error);
      throw error;
    }
  }, [defaultQos, enableLogging, publish]);

  // 连接函数（增强版）
  const handleConnect = useCallback(async () => {
    try {
      await connect(handleConnectionStatus);
      return true;
    } catch (error) {
      if (enableLogging) {
        console.error('[MQTT] Connect error:', error);
      }
      setLastError(error);
      return false;
    }
  }, [connect, handleConnectionStatus, enableLogging]);

  // 断开连接函数（增强版）
  const handleDisconnect = useCallback(async () => {
    try {
      // 清理回调映射
      subscriptionCallbacks.current.clear();
      
      await disconnect();
      
      if (enableLogging) {
        console.log('[MQTT] Disconnected successfully');
      }
      
      return true;
    } catch (error) {
      if (enableLogging) {
        console.error('[MQTT] Disconnect error:', error);
      }
      setLastError(error);
      return false;
    }
  }, [disconnect, enableLogging]);

  // 连接MQTT并在组件挂载时设置订阅
  useEffect(() => {
    if (autoConnect) {
      handleConnect();
    }
    
    return () => {
      handleDisconnect();
      setGlobalMessages([]);
    };
  }, [autoConnect]);

  // 连接成功后自动订阅默认主题
  useEffect(() => {
    if (isConnected && autoSubscribe && subscribeOnMount && defaultTopic) {
      doSubscribe(defaultTopic);
    }
  }, [isConnected, autoSubscribe, subscribeOnMount, defaultTopic, doSubscribe]);

  // Context值
  const contextValue = useMemo(() => ({
    // 连接管理
    connect: handleConnect,
    disconnect: handleDisconnect,
    isConnected,
    connectionStatus,
    lastError,
    
    // 订阅管理
    doSubscribe,
    unsubscribe: doUnsubscribe,
    subscribeList,
    
    // 消息管理
    handlePushMessage,
    globalMessages,
    getGlobalMessages,
    clearMessages,
    getMessagesByTopic,
    
    // 统计信息
    statistics,
    
    // 配置信息
    finalConfig,
    defaultTopic,
    defaultQos,
  }), [
    handleConnect,
    handleDisconnect,
    isConnected,
    connectionStatus,
    lastError,
    doSubscribe,
    doUnsubscribe,
    subscribeList,
    handlePushMessage,
    globalMessages,
    getGlobalMessages,
    clearMessages,
    getMessagesByTopic,
    statistics,
    finalConfig,
    defaultTopic,
    defaultQos,
  ]);

  return (
    <MQTTContext.Provider value={contextValue}>
      {children}
    </MQTTContext.Provider>
  );
};

MQTTProvider.propTypes = {
  children: PropTypes.node.isRequired,
  config: PropTypes.object,
  defaultTopic: PropTypes.string,
  defaultQos: PropTypes.number,
  autoSubscribe: PropTypes.bool,
  autoConnect: PropTypes.bool,
  maxMessages: PropTypes.number,
  messageFilter: PropTypes.func,
  onConnectionStatusChange: PropTypes.func,
  enableLogging: PropTypes.bool,
  messageProcessors: PropTypes.arrayOf(PropTypes.func),
  subscribeOnMount: PropTypes.bool,
};

MQTTProvider.defaultProps = {
  config: {},
  defaultTopic: 'default/topic',
  defaultQos: 1,
  autoSubscribe: true,
  autoConnect: true,
  maxMessages: 1000,
  messageFilter: null,
  onConnectionStatusChange: null,
  enableLogging: true,
  messageProcessors: [],
  subscribeOnMount: true,
};

/**
 * 获取MQTT上下文的React Hook
 * 必须在MQTTProvider内部使用
 * 
 * @returns {Object} MQTT上下文对象，包含所有MQTT相关的状态和方法
 * @throws {Error} 如果在MQTTProvider外部使用则抛出错误
 */
export const useMQTTContext = () => {
  const context = useContext(MQTTContext);
  if (context === undefined) {
    throw new Error('useMQTTContext must be used within a MQTTProvider');
  }
  return context;
};

/**
 * 导出上下文对象（用于高级用法）
 */
export { MQTTContext };