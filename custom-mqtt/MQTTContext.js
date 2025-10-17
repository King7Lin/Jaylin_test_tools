import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from 'react';
import {useMqttService} from './index';
import PropTypes from 'prop-types';
import {handleMqttMessage, getDBConfig} from './mqtt';
import {decryptAES, createAESConfig} from './utils';
import {DeviceEventEmitter} from 'react-native';

// 业务特定的加密配置
const BUSINESS_AES_CONFIG = createAESConfig(
  process.env.BUSINESS_AES_KEY || 'Ush4NkjoZs/HRbU8rmT18/MAvN62+Gc3',
  process.env.BUSINESS_AES_IV || 'eiostpos'
);

// 创建MQTT上下文
const MQTTContext = createContext(undefined);

// MQTTProvider组件
export const MQTTProvider = ({
  children,
  defaultTopic = 'clien',
  defaultQos = 1,
  autoSubscribe = true,
  autoConnect = true,
}) => {
  // 本地配置状态（优先 DB 配置，其次传入的 config）
  const [dbConfig, setDbConfig] = useState({});
  const effectiveConfig = useMemo(() => {
    console.log('---------------configchange', dbConfig);
    
    return dbConfig;
  }, [dbConfig]);
  const {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    publish,
    isConnected,
    subscribeList,
  } = useMqttService(effectiveConfig);

  // 全局消息状态
  const [globalMessages, setGlobalMessages] = useState([]);

  // 全局消息处理函数
  const handleGlobalMessage = (topic, message) => {
    console.log(`[Global] Received message on topic ${topic}: ${message}`);
    // console.log('-------------------decryptAES',decryptAES(message, BUSINESS_AES_CONFIG));
    
    let decryptMessage;
    try {
      decryptMessage = decryptAES(message, BUSINESS_AES_CONFIG);
    } catch (error) {
      console.warn('[MQTT Context] 消息解密失败，可能是明文消息:', error.message);
      decryptMessage = message; // 如果解密失败，尝试直接使用原消息
    }
    
    const parsedMessage = processJsonMessage(decryptMessage);
    if (parsedMessage) {
      handleMqttMessage(parsedMessage);
      setGlobalMessages(prev => [
        ...prev,
        {topic, message: parsedMessage, timestamp: new Date()},
      ]);
    } else {
      console.log(
        `[Global] Message filtered out (senderId is not jaylin or invalid JSON)`,
      );
    }
  };

  // 提供获取全局消息的方法
  const getGlobalMessages = () => globalMessages;

  const derivedTopic = useMemo(() => {
    // 仅允许使用 clientCode 作为订阅主题；无则不订阅
    return (effectiveConfig && effectiveConfig.clientCode) || null;
  }, [effectiveConfig]);

  // 订阅主题
  const doSubscribe = async (topic = derivedTopic, qos = defaultQos) => {
    try {
      if (!topic) return;
      await subscribe(topic, qos, handleGlobalMessage);
    } catch (error) {
      console.error('Subscribe error:', error);
    }
  };

  // 配置管理：加载DB配置 + 监听配置更新事件
  useEffect(() => {
    const initConfig = async () => {
      console.log('MQTTContext: 初始化配置');
      // 如果已连接，先断开连接
      if (isConnected) {
        await disconnect();
      }
      const dbConfig = await getDBConfig();
      setDbConfig(dbConfig);
    };
    
    initConfig();
    
    // 监听配置更新事件
    const configUpdateListener = DeviceEventEmitter.addListener(
      'MQTT_CFG_UPDATED',
      async payload => {
        console.log('MQTTContext: 收到配置更新事件', {
          timestamp: new Date().toISOString(),
          isConnected,
          payload
        });
        
        // 更新配置（connect函数会自动处理断开重连）
        if (payload) {
          console.log('MQTTContext: 更新配置，将触发重新连接');
          setDbConfig(payload);
        }
        
        console.log('MQTTContext: 配置更新完成', new Date().toISOString());
      },
    );
    
    return () => {
      configUpdateListener?.remove();
    };
  }, []);

  // 当配置变更时自动连接MQTT
  useEffect(() => {
    console.log('MQTTContext: 配置变更，准备连接', effectiveConfig);

    if (autoConnect && effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      // 直接传入最新的配置，避免时序问题
      const doConnect = async () => {
        try {
          await connect((state, error) => {
            console.log('MQTTContext: 连接状态变更', { state, error });
          }, effectiveConfig);
        } catch (error) {
          console.error('MQTTContext: 连接失败', error);
        }
      };
      doConnect();
    }

    return async () => {
      await disconnect();
      setGlobalMessages([]);
    };
  }, [effectiveConfig]);

  // 连接成功后自动订阅主题
  useEffect(() => {
    const canSubscribe = !!(effectiveConfig && effectiveConfig.clientCode);
    console.log('MQTTContext: 检查自动订阅条件', {
      isConnected,
      autoSubscribe,
      canSubscribe,
      derivedTopic
    });
    
    if (isConnected && autoSubscribe && canSubscribe && derivedTopic) {
      console.log('MQTTContext: 开始自动订阅主题', derivedTopic);
      doSubscribe(derivedTopic);
    }
  }, [isConnected, autoSubscribe, derivedTopic]);

  const processJsonMessage = message => {
    if (!message) return null;

    // 如果消息已经是对象，直接返回
    if (typeof message === 'object') {
      return message;
    }
    const cleanedMessage = message.replace(/[\r\n]/g, '');
    console.log('---------typeof message', typeof message, cleanedMessage);

    // 移除可能存在的换行符和回车符

    try {
      // 解析JSON字符串
      const parsedData = JSON.parse(message);
      return parsedData;
    } catch (error) {
      console.error('Failed to parse JSON message:', error);
      return cleanedMessage;
    }
  };

  // 处理发送信息
  // 支持两种调用方式：
  // 1) handlePushMessage(topic, message, senderId, qos, retain)
  // 2) handlePushMessage(message, senderId, qos, retain) -> 此时会使用 derivedTopic 作为 topic
  const handlePushMessage = async (
    topicOrMessage = derivedTopic,
    message,
    senderId = effectiveConfig.clientId,
    qos = defaultQos,
    retain = false,
  ) => {
    // 如果只传入一个参数（即 message），则第二个参数 message 为 undefined
    // 此时将第一个参数视为 message，并使用 derivedTopic 作为 topic
    let topic = topicOrMessage;
    let payload = message;
    if (typeof message === 'undefined') {
      payload = topicOrMessage;
      topic = derivedTopic;
    }

    const newMessage = JSON.stringify(payload);
    return publish(topic, newMessage, qos, retain);
  };

  return React.createElement(
    MQTTContext.Provider,
    {
      value: {
        connect,
        disconnect,
        globalMessages,
        getGlobalMessages,
        doSubscribe,
        unsubscribe,
        handlePushMessage,
        isConnected,
        subscribeList,
        derivedTopic,
        effectiveConfig,
      },
    },
    children,
  );
};

MQTTProvider.propTypes = {
  children: PropTypes.node,
  defaultTopic: PropTypes.string,
  defaultQos: PropTypes.number,
  autoSubscribe: PropTypes.bool,
  autoConnect: PropTypes.bool,
};

// 导出useMQTTContext钩子
export const useMQTTContext = () => {
  const context = useContext(MQTTContext);
  if (context === undefined) {
    throw new Error('useMQTTContext must be used within a MQTTProvider');
  }
  return context;
};
