/**
 * MyLogger - React Native 日志组件
 * 
 * 功能特性：
 * 1. 提供类似 console.log 的简单 API：MyLogger.log(msg)
 * 2. 自动按日期切换日志文件
 * 3. 支持日志文件自动分割（超过MaxLogSizeMB）
 * 4. 非阻塞式日志写入
 * 5. 自动执行 HouseKeeping 清理过期日志
 * 6. 异常时降级到 console.log
 * 
 * 使用方法：
 * import MyLogger from './utils/MyLogger/MyLogger';
 * 
 * // 初始化（在App启动时调用）
 * await MyLogger.initialize();
 * 
 * // 写入日志
 * MyLogger.log('这是一条日志消息');
 */

import { FileLogger, LogLevel } from 'react-native-file-logger';
import { AppState } from 'react-native';
import RNFS from 'react-native-fs';
import LoggerConf from './LoggerConf';
import { performHouseKeepingAsync } from './HouseKeeping';

class MyLoggerClass {
  constructor() {
    this.isInitialized = false;
    this.currentDate = null;
    this.logsDirectory = null;
    this.appStateSubscription = null;
    this.lastActiveDate = null; // 记录上次活跃的日期
  }

  /**
   * 获取当前日期字符串（YYYYMMDD格式）
   */
  getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 获取当前时间戳字符串（根据配置格式化）
   */
  getCurrentTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    let timestamp = `${year}-${month}-${day}${LoggerConf.DateTimeSeparator}${hours}:${minutes}:${seconds}`;
    
    // 根据配置决定是否包含毫秒
    if (LoggerConf.IncludeMilliseconds) {
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      timestamp += `.${milliseconds}`;
    }
    
    return timestamp;
  }

  /**
   * 格式化日志消息
   */
  formatLogMessage(msg) {
    const timestamp = this.getCurrentTimestamp();
    return `${timestamp} [LOG] ${msg}`;
  }

  /**
   * 检查日期是否变化，如果变化则重新配置FileLogger
   */
  async checkAndUpdateDate() {
    try {
      const currentDate = this.getCurrentDateString();
      
      // 如果日期发生变化，需要重新配置
      if (this.currentDate !== currentDate) {
        console.log(`[MyLogger] 检测到日期变化: ${this.currentDate} -> ${currentDate}`);
        this.currentDate = currentDate;
        
        // 重新配置 FileLogger，使用新的日期前缀
        await this.configureFileLogger();
        
        // 异步执行 HouseKeeping
        if (LoggerConf.EnableHouseKeeping && this.logsDirectory) {
          performHouseKeepingAsync(this.logsDirectory);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('[MyLogger] 检查日期变化时发生错误:', error);
      return false;
    }
  }

  /**
   * 配置 FileLogger
   */
  async configureFileLogger() {
    try {
      // 设置日志目录（使用 files 目录下的 AppLogs 文件夹）
      // Android: /data/data/com.straffinfo/files/AppLogs
      // iOS: ~/Documents/AppLogs
      this.logsDirectory = `${RNFS.DocumentDirectoryPath}/AppLogs`;
      
      // 确保日志目录存在
      const dirExists = await RNFS.exists(this.logsDirectory);
      if (!dirExists) {
        await RNFS.mkdir(this.logsDirectory);
        console.log(`[MyLogger] 创建日志目录: ${this.logsDirectory}`);
      }

      // 构建日志文件前缀：WebPos_sys_20251017
      const logPrefix = `${LoggerConf.LogPrefix}_${this.currentDate}`;
      
      // 根据配置获取日志等级
      const logLevelMap = {
        'DEBUG': LogLevel.Debug,
        'INFO': LogLevel.Info,
        'WARN': LogLevel.Warning,
        'ERROR': LogLevel.Error,
      };
      const configuredLogLevel = logLevelMap[LoggerConf.LogLevel] || LogLevel.Debug;
      
      // 配置 FileLogger
      await FileLogger.configure({
        logLevel: configuredLogLevel,
        captureConsole: LoggerConf.CaptureConsole,
        dailyRolling: false, // 禁用自动按天滚动，我们手动控制
        maximumFileSize: LoggerConf.MaxLogSizeMB * 1024 * 1024, // 转换为字节
        maximumNumberOfFiles: 999, // 设置足够大的数字，允许文件持续分割，由 HouseKeeping 清理
        logsDirectory: this.logsDirectory,
        logPrefix: logPrefix,
        formatter: (level, msg) => {
          // 将 LogLevel 枚举值转换为文字
          const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
          const levelName = levelNames[level] || 'INFO';
          
          // 获取时间戳
          const timestamp = this.getCurrentTimestamp();
          
          // 使用配置的格式模板
          return LoggerConf.LogFormat
            .replace('{timestamp}', timestamp)
            .replace('{level}', levelName)
            .replace('{message}', msg);
        }
      });

      console.log(`[MyLogger] FileLogger已配置，日志前缀: ${logPrefix}`);
    } catch (error) {
      console.log('[MyLogger] 配置FileLogger失败:', error);
      throw error;
    }
  }

  /**
   * 监听应用状态变化，检测"过夜"场景
   */
  setupAppStateListener() {
    try {
      this.appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
        if (nextAppState === 'active') {
          // 应用进入前台
          const currentDate = this.getCurrentDateString();
          
          // 检查是否"过夜"（日期变化）
          if (this.lastActiveDate && this.lastActiveDate !== currentDate) {
            console.log(`[MyLogger] 检测到过夜场景: ${this.lastActiveDate} -> ${currentDate}`);
            await this.checkAndUpdateDate();
          }
          
          this.lastActiveDate = currentDate;
        }
      });
      
      console.log('[MyLogger] 应用状态监听器已启动');
    } catch (error) {
      console.log('[MyLogger] 设置应用状态监听器失败:', error);
    }
  }

  /**
   * 初始化 MyLogger
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.log('[MyLogger] 已经初始化过了，跳过');
        return true;
      }

      console.log('[MyLogger] 开始初始化...');

      // 获取当前日期
      this.currentDate = this.getCurrentDateString();
      this.lastActiveDate = this.currentDate;

      // 配置 FileLogger
      await this.configureFileLogger();

      // 设置应用状态监听器（检测过夜场景）
      if (LoggerConf.EnableOvernightDetection) {
        this.setupAppStateListener();
      }

      // 执行首次 HouseKeeping
      if (LoggerConf.EnableHouseKeeping && this.logsDirectory) {
        performHouseKeepingAsync(this.logsDirectory);
      }

      this.isInitialized = true;
      console.log('[MyLogger] 初始化完成 ✅');
      
      // 写入一条初始化成功的日志
      this.log('MyLogger初始化成功');

      return true;
    } catch (error) {
      console.log('[MyLogger] 初始化失败:', error);
      return false;
    }
  }

  /**
   * 写入日志
   * @param {string} msg - 日志消息
   */
  log(msg) {
    try {
      // 如果未初始化，降级到 console.log
      if (!this.isInitialized) {
        console.log('[MyLogger未初始化]', msg);
        return;
      }

      // 检查日期是否变化（非阻塞）
      // 使用 Promise 但不等待，避免阻塞日志写入
      this.checkAndUpdateDate().catch(err => {
        console.log('[MyLogger] 检查日期失败:', err);
      });

      // 写入日志到文件 - 使用 info 级别
      FileLogger.info(msg);
    } catch (error) {
      // 发生异常时降级到 console.log
      console.log('[MyLogger异常]', msg, error);
    }
  }

  /**
   * 获取所有日志文件路径
   * @returns {Promise<string[]>}
   */
  async getLogFilePaths() {
    try {
      if (!this.isInitialized) {
        console.log('[MyLogger] 未初始化，无法获取日志文件路径');
        return [];
      }
      
      return await FileLogger.getLogFilePaths();
    } catch (error) {
      console.log('[MyLogger] 获取日志文件路径失败:', error);
      return [];
    }
  }

  /**
   * 删除所有日志文件
   * @returns {Promise<boolean>}
   */
  async deleteAllLogs() {
    try {
      if (!this.isInitialized) {
        console.log('[MyLogger] 未初始化，无法删除日志');
        return false;
      }
      
      await FileLogger.deleteLogFiles();
      console.log('[MyLogger] 所有日志文件已删除');
      return true;
    } catch (error) {
      console.log('[MyLogger] 删除日志文件失败:', error);
      return false;
    }
  }

  /**
   * 手动触发 HouseKeeping
   */
  async triggerHouseKeeping() {
    try {
      if (!this.logsDirectory) {
        console.log('[MyLogger] 日志目录未设置，无法执行清理');
        return;
      }
      
      performHouseKeepingAsync(this.logsDirectory);
      console.log('[MyLogger] 已触发HouseKeeping');
    } catch (error) {
      console.log('[MyLogger] 触发HouseKeeping失败:', error);
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    try {
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }
      
      this.isInitialized = false;
      this.currentDate = null;
      this.logsDirectory = null;
      this.lastActiveDate = null;
      
      console.log('[MyLogger] 已清理资源');
    } catch (error) {
      console.log('[MyLogger] 清理资源失败:', error);
    }
  }
}

// 导出单例
const MyLogger = new MyLoggerClass();

export default MyLogger;

