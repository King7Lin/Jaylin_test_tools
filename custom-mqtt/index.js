process.env.MQTT_LOG = 'debug';
import mqtt from 'mqtt';
import {useState, useEffect, useCallback, useRef} from 'react';
// 配置管理由MQTTContext负责，移除相关导入

/**
 * 记录初始连接次数
 */
let initialReconnectAttempts = 0;
/**
 * MQTT服务钩子
 * 提供连接、断开、发布、订阅等功能
 */
export const useMqttService = config => {
  // console.log('------------use mqtt config', config);
  const [finalConfig, setFinalConfig] = useState(config);
  // 最大重连尝试次数
  const maxReconnectAttempts = config.maxReconnectAttempts || -1;
  // 重连延迟(毫秒)
  const initialReconnectDelay = config.initialReconnectDelay || 5000;
  // MQTT客户端实例
  const [client, setClient] = useState(null);

  // 连接状态标志
  const [isConnected, setIsConnected] = useState(false);

  // 消息回调函数映射
  const [messageCallbacks, setMessageCallbacks] = useState({});

  // 订阅列表
  const [subscribeList, setSubscribeList] = useState([]);

  // 订阅主题和QoS映射
  const [subscriptions, setSubscriptions] = useState({});

  // 是否需要重新连接
  const [needReconnect, setNeedReconnect] = useState(false);

  // 使用ref保存最新的回调引用
  const callbacksRef = useRef(messageCallbacks);
  // 使用ref保存最新的连接状态
  const isConnectedRef = useRef(isConnected);
  // 重连定时器引用，确保仅一个定时器在运行
  const reconnectTimerRef = useRef(null);
  useEffect(() => {
    callbacksRef.current = messageCallbacks;
    // 更新订阅列表
    setSubscribeList(Object.keys(messageCallbacks));
  }, [messageCallbacks]);

  // 更新连接状态ref
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // 重连尝试次数
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // 当配置变更时更新最终配置
  useEffect(() => {
    if (config && Object.keys(config).length !== 0) {
      console.log('Config updated in useMqttService:', config);
      setFinalConfig(config);
    }
  }, [config]);


  // 移除防抖逻辑，配置管理由MQTTContext负责

  // 连接MQTT服务器
  const connect = async (onStatusChange, configOverride = null) => {
    //onStatusChange:(status,error)=>{}\
    // 使用传入的配置覆盖，或者使用最新的finalConfig
    const connectConfig = configOverride || finalConfig;
    
    console.log('useMqttService: connect调用', {
      configOverride: !!configOverride,
      connectConfig,
      finalConfig,
      isConnected: isConnectedRef.current,
      clientExists: !!client
    });
    
    // 如果还在连接状态或客户端还存在，先强制断开
    if (isConnectedRef.current || client) {
      console.log('useMqttService: 检测到现有连接，先断开');
      await disconnect();
      // 短暂延迟确保断开完成
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 验证必需的配置参数
    if (
      !connectConfig.host ||
      !connectConfig.port ||
      !connectConfig.protocol ||
      !connectConfig.clientId ||
      !connectConfig.username ||
      !connectConfig.password
    ) {
      console.warn('useMqttService: 缺少必需的配置参数', connectConfig);
      onStatusChange('configMissing', new Error('Missing required config fields'));
      return;
    }
    console.log('useMqttService: 开始创建MQTT客户端');
    try {
      // 构建连接URL
      const connectionUrl = `${connectConfig.protocol}://${connectConfig.host}:${connectConfig.port}`;
      console.log('useMqttService: MQTT连接信息', {
        connectionUrl,
        clientId: connectConfig.clientId,
        username: connectConfig.username,
        connectConfig
      });

      // 创建MQTT客户端
      const newClient = mqtt.connect(connectionUrl, {
        clientId: connectConfig.clientId,
        username: connectConfig.username,
        password: connectConfig.password,
        keepalive: connectConfig.keepalive,
        reconnectPeriod: 0,
        connectTimeout: 60000,
        protocolVersion: connectConfig.protocolVersion,
        clean: false,
        transport: connectConfig.transport,
        properties: {
          sessionExpiryInterval: 1800, // 會話在斷開連接後保留 1 小時（3600 秒）
        },
        ...connectConfig.wsOptions,
      });
      // const newClient = mqtt.connect('ws://54.46.31.132:8000', {
      //   clientId: 'test',
      //   username: 'admin',
      //   password: 'admin',
      //   connectTimeout: 60000,
      // });
      setClient(newClient);

      // 监听连接事件
      newClient.on('connect', connectItem => {
        console.log('MQTT Connected successfully', connectItem);
        setIsConnected(true);
        // 自动恢复订阅
        subscribeList.forEach(t => {
          const qos = subscriptions[t] || 1; // 默认QoS为1
          newClient.subscribe(t, {qos}, err => {
            if (err) console.error(`[MQTT] 恢复订阅失败: ${t}`, err);
            else console.log(`[MQTT] 恢复订阅成功: ${t} with QoS ${qos}`);
          });
        });
        onStatusChange('connectSuccess');
        // 重置重连计数
        setReconnectAttempts(0);
        if (newClient) initialReconnectAttempts = 0;
        // 成功连接后清理重连定时器
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      });

      // 监听连接超时事件
      newClient.on('connectTimeout', error => {
        console.error('MQTT Connection timeout:', error);
        setIsConnected(false);
        handleReconnect(onStatusChange);
        onStatusChange('connectTimeout', error);
      });

      // 监听错误事件
      newClient.on('error', error => {
        console.error('MQTT Error:', error);
        setIsConnected(false);
        handleReconnect(onStatusChange);
        onStatusChange('error', error);
      });

      // 监听断开连接事件
      newClient.on('disconnect', packet => {
        console.log('MQTT Disconnected:', packet);
        setIsConnected(false);
        // handleReconnect(onStatusChange);
        onStatusChange('disconnected', packet);
      });

      // 监听连接关闭事件
      newClient.on('close', () => {
        console.log('MQTT Connection closed');
        setIsConnected(false);
        handleReconnect(onStatusChange);
        onStatusChange('connectClosed', new Error('Connection closed'));
      });

      // 监听消息事件
      newClient.on('message', (topic, message, packet) => {
        const messageStr = message.toString();
        if (callbacksRef.current[topic]) {
          console.log(`[MQTT] Calling callback for topic ${topic}`);
          callbacksRef.current[topic](topic, messageStr);
        } else {
          console.log(`[MQTT] No callback registered for topic ${topic}`);
        }
      });
    } catch (error) {
      onStatusChange('connectError', error);
      console.error('Failed to create MQTT client:', error);
    }
  };

  // 处理重连逻辑
  const handleReconnect = onStatusChange => {
    if (
      (reconnectAttempts >= maxReconnectAttempts ||
        initialReconnectAttempts >= maxReconnectAttempts) &&
      maxReconnectAttempts !== -1
    ) {
      console.log('maxReconnectAttempts', maxReconnectAttempts);

      onStatusChange(
        'reconnectError',
        new Error('Maximum reconnection attempts reached'),
      );
      return;
    }

    const delay = initialReconnectDelay * Math.pow(2, reconnectAttempts);
    // const delay = initialReconnectDelay;

    // 若已有定时器，先清理，确保只存在一个
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    reconnectTimerRef.current = setTimeout(async () => {
      setReconnectAttempts(prev => prev + 1);
      console.log('useMqttService: 开始重连...');
      if (!isConnected) {
        if (client) {
          client.reconnect();
          console.log('useMqttService: 使用现有客户端重连');
        } else {
          console.log('useMqttService: 创建新客户端重连');
          await connect(onStatusChange);
          initialReconnectAttempts++;
        }
      }
    }, delay);
  };

  // 断开MQTT连接
  const disconnect = async () => {
    if (client) {
      console.log('useMqttService: 开始断开连接');
      
      // 立即更新ref，避免时序问题
      isConnectedRef.current = false;
      
      // 先移除所有事件监听器，防止close事件触发重连
      client.removeAllListeners();
      
      // 清理重连定时器
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      
      if (isConnected) {
        client.end();
        console.log('useMqttService: MQTT客户端已断开');
      }

      setIsConnected(false);
      setClient(null);
      if (finalConfig && finalConfig.clean) {
        setMessageCallbacks({});
      }
    } else {
      // 即使没有客户端，也要确保状态正确
      isConnectedRef.current = false;
      setIsConnected(false);
    }
  };

  // 发布消息
  const publish = useCallback(
    async (topic, message, qos = 0, retain = false) => {
      return new Promise((resolve, reject) => {
        if (!isConnected || !client) {
          reject(new Error('Not connected to MQTT broker'));
          return;
        }

        try {
          client.publish(
            topic,
            message,
            {
              qos: qos,
              retain: retain,
            },
            error => {
              if (error) {
                console.error('Publish error:', error);
                reject(error);
              } else {
                console.log(`Published message to topic ${topic}: ${message}`);
                resolve(true);
              }
            },
          );
        } catch (error) {
          console.error('Publish error:', error);
          reject(error);
        }
      });
    },
    [isConnected, client],
  );

  // 订阅主题
  const subscribe = useCallback(
    async (topic, qos = 0, callback) => {
      return new Promise((resolve, reject) => {
        if (!isConnected || !client) {
          console.error('[MQTT] Cannot subscribe - not connected to broker');
          reject(new Error('Not connected to MQTT broker'));
          return;
        }

        try {
          client.subscribe(
            topic,
            {
              qos: qos,
            },
            (error, granted) => {
              if (error) {
                console.error(
                  `[MQTT] Failed to subscribe to topic ${topic}:`,
                  error,
                );
                reject(error);
              } else {
                console.log(
                  `[MQTT] Subscribed to topic ${topic} with QoS ${granted[0].qos}`,
                );
                // 更新订阅信息
                setSubscriptions(prev => ({
                  ...prev,
                  [topic]: granted[0].qos,
                }));
                setMessageCallbacks(prev => {
                  const updatedCallbacks = {...prev};
                  updatedCallbacks[topic] = callback;
                  console.log(
                    `[MQTT] Current subscribed topics: ${Object.keys(
                      updatedCallbacks,
                    ).join(', ')}`,
                  );
                  return updatedCallbacks;
                });
                resolve(true);
              }
            },
          );
        } catch (error) {
          console.error(`[MQTT] Failed to subscribe to topic ${topic}:`, error);
          reject(error);
        }
      });
    },
    [isConnected, client],
  );

  // 取消订阅
  const unsubscribe = useCallback(
    async topic => {
      return new Promise((resolve, reject) => {
        if (!isConnected || !client) {
          reject(new Error('Not connected to MQTT broker'));
          return;
        }

        try {
          client.unsubscribe(topic, {}, error => {
            if (error) {
              console.error('Unsubscribe error:', error);
              reject(error);
            } else {
              setMessageCallbacks(prev => {
                const newCallbacks = {...prev};
                delete newCallbacks[topic];
                return newCallbacks;
              });
              setSubscribeList(prev => prev.filter(t => t !== topic));
              // 从订阅信息中移除
              setSubscriptions(prev => {
                const newSubscriptions = {...prev};
                delete newSubscriptions[topic];
                return newSubscriptions;
              });
              console.log(`Unsubscribed from topic ${topic}`);
              resolve(true);
            }
          });
        } catch (error) {
          console.error('Unsubscribe error:', error);
          reject(error);
        }
      });
    },
    [isConnected, client],
  );

  // 组件卸载时断开连接
  useEffect(() => {
    return () => {
      if (client && isConnected) {
        client.end();
      }
    };
  }, [client, isConnected]);

  return {
    connect,
    disconnect,
    publish,
    subscribe,
    unsubscribe,
    isConnected,
    subscribeList,
  };
};
