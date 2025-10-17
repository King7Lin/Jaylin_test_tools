/**
 * HouseKeeping 日志清理模块
 * 
 * 功能：
 * 1. 根据HousekeepingDay清理过期的日志文件
 * 2. 通过文件名中的日期判断文件是否过期
 * 3. 异步非阻塞式清理，不影响应用性能
 */

import RNFS from 'react-native-fs';
import LoggerConf from './LoggerConf';

/**
 * 从文件名中提取日期
 * @param {string} filename - 文件名，格式：WebPos_sys_20251017-1.log 或 WebPos_sys_20251017-latest.log
 * @returns {string|null} - 返回日期字符串(YYYYMMDD)，如果解析失败返回null
 */
const extractDateFromFilename = (filename) => {
  try {
    // 匹配文件名中的日期部分：WebPos_sys_YYYYMMDD-xxx.log
    // 支持格式：
    // - WebPos_sys_20251018-latest.log
    // - WebPos_sys_20251018-1.log
    // - WebPos_sys_20251018-8.log
    const match = filename.match(/WebPos_sys_(\d{8})-.*\.log$/);
    if (match && match[1]) {
      return match[1]; // 返回YYYYMMDD格式的日期
    }
    return null;
  } catch (error) {
    console.log(`[HouseKeeping] 解析文件名失败: ${filename}`, error);
    return null;
  }
};

/**
 * 计算两个日期之间的天数差
 * @param {string} dateStr1 - 日期字符串1 (YYYYMMDD)
 * @param {string} dateStr2 - 日期字符串2 (YYYYMMDD)
 * @returns {number} - 天数差
 */
const calculateDaysDifference = (dateStr1, dateStr2) => {
  try {
    // 将YYYYMMDD格式转换为Date对象
    const year1 = parseInt(dateStr1.substring(0, 4), 10);
    const month1 = parseInt(dateStr1.substring(4, 6), 10) - 1; // 月份从0开始
    const day1 = parseInt(dateStr1.substring(6, 8), 10);
    
    const year2 = parseInt(dateStr2.substring(0, 4), 10);
    const month2 = parseInt(dateStr2.substring(4, 6), 10) - 1;
    const day2 = parseInt(dateStr2.substring(6, 8), 10);
    
    const date1 = new Date(year1, month1, day1);
    const date2 = new Date(year2, month2, day2);
    
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (error) {
    console.log('[HouseKeeping] 计算日期差异失败', error);
    return 0;
  }
};

/**
 * 获取当前日期字符串
 * @returns {string} - 格式为YYYYMMDD的日期字符串
 */
const getCurrentDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * 执行日志清理
 * @param {string} logsDirectory - 日志文件所在目录
 * @returns {Promise<{success: boolean, deletedCount: number, error?: string}>}
 */
export const performHouseKeeping = async (logsDirectory) => {
  try {
    // 确保目录存在
    const dirExists = await RNFS.exists(logsDirectory);
    if (!dirExists) {
      console.log('[HouseKeeping] 日志目录不存在，跳过清理');
      return { success: true, deletedCount: 0 };
    }

    // 读取目录中的所有文件
    const files = await RNFS.readDir(logsDirectory);
    
    // 筛选出日志文件
    const logFiles = files.filter(file => 
      file.name.startsWith(LoggerConf.LogPrefix) && 
      file.name.endsWith('.log')
    );

    if (logFiles.length === 0) {
      console.log('[HouseKeeping] 没有找到日志文件，跳过清理');
      return { success: true, deletedCount: 0 };
    }

    const currentDate = getCurrentDateString();
    const housekeepingDays = LoggerConf.HousekeepingDay;
    let deletedCount = 0;

    console.log(`[HouseKeeping] 开始清理，当前日期: ${currentDate}, 保留天数: ${housekeepingDays}`);

    // 遍历所有日志文件，检查是否需要删除
    for (const file of logFiles) {
      try {
        const fileDate = extractDateFromFilename(file.name);
        
        if (!fileDate) {
          console.log(`[HouseKeeping] 跳过无法解析日期的文件: ${file.name}`);
          continue;
        }

        const daysDiff = calculateDaysDifference(fileDate, currentDate);
        
        // 如果文件日期超过保留天数，则删除
        if (daysDiff > housekeepingDays) {
          await RNFS.unlink(file.path);
          deletedCount++;
          console.log(`[HouseKeeping] 已删除过期日志: ${file.name} (${daysDiff}天前)`);
        }
      } catch (error) {
        // 单个文件删除失败不影响其他文件的清理
        console.log(`[HouseKeeping] 删除文件失败: ${file.name}`, error);
      }
    }

    console.log(`[HouseKeeping] 清理完成，共删除 ${deletedCount} 个文件`);
    return { success: true, deletedCount };

  } catch (error) {
    console.log('[HouseKeeping] 执行清理时发生错误', error);
    return { 
      success: false, 
      deletedCount: 0, 
      error: error.message 
    };
  }
};

/**
 * 异步执行HouseKeeping，不阻塞主线程
 * @param {string} logsDirectory - 日志文件所在目录
 */
export const performHouseKeepingAsync = (logsDirectory) => {
  // 使用 setTimeout 确保在下一个事件循环中执行，避免阻塞
  setTimeout(() => {
    performHouseKeeping(logsDirectory)
      .then(result => {
        if (result.success) {
          console.log(`[HouseKeeping] 异步清理完成，删除了 ${result.deletedCount} 个文件`);
        } else {
          console.log('[HouseKeeping] 异步清理失败:', result.error);
        }
      })
      .catch(error => {
        console.log('[HouseKeeping] 异步清理异常:', error);
      });
  }, 0);
};

export default {
  performHouseKeeping,
  performHouseKeepingAsync,
  extractDateFromFilename,
  calculateDaysDifference,
  getCurrentDateString,
};

