/**
 * 打印机驱动管理器
 * 负责管理和复用打印机驱动实例
 */

import type { IPrinterDriver } from './IPrinterDriver';
import type { PrinterConfig } from './types';
import { PrinterDriverFactory } from './PrinterDriverFactory';

/**
 * 驱动缓存键
 */
interface DriverCacheKey {
  printerId: string;
  driverType: string;
}

/**
 * 打印机驱动管理器类
 */
export class PrinterDriverManager {
  private static instance: PrinterDriverManager;
  private drivers: Map<string, IPrinterDriver> = new Map();

  /**
   * 获取单例实例
   */
  static getInstance(): PrinterDriverManager {
    if (!PrinterDriverManager.instance) {
      PrinterDriverManager.instance = new PrinterDriverManager();
    }
    return PrinterDriverManager.instance;
  }

  /**
   * 生成驱动缓存键
   */
  private getDriverKey(printerId: string, driverType?: string): string {
    return driverType ? `${driverType}:${printerId}` : printerId;
  }

  /**
   * 获取或创建驱动
   * @param printerId 打印机ID
   * @param config 打印机配置
   * @returns 打印机驱动实例
   */
  async getDriver(printerId: string, config: PrinterConfig): Promise<IPrinterDriver | null> {
    try {
      console.log('【驱动管理器】获取驱动:', printerId, config);

      // 规范化配置
      const normalizedConfig = this.normalizeConfig(config);
      const driverType = normalizedConfig.__driverType;
      const key = this.getDriverKey(printerId, driverType);

      // 检查缓存中是否有可用驱动
      if (this.drivers.has(key)) {
        const driver = this.drivers.get(key)!;
        console.log('【驱动管理器】找到缓存驱动:', printerId);

        if (driver.isConnected()) {
          console.log('【驱动管理器】缓存驱动已连接');
          return driver;
        } else {
          console.log('【驱动管理器】缓存驱动未连接，尝试重连');
          try {
            const reconnected = await driver.connect(printerId);
            if (reconnected) {
              return driver;
            }
          } catch (error) {
            console.warn('【驱动管理器】重连失败:', error);
          }
          // 连接失败，移除旧驱动
          this.removeDriver(printerId, driverType);
        }
      }

      // 创建新驱动
      console.log('【驱动管理器】创建新驱动:', driverType);
      const driver = PrinterDriverFactory.createDriver(normalizedConfig);

      // 连接驱动
      const connected = await driver.connect(printerId);
      if (connected) {
        console.log('【驱动管理器】驱动连接成功');
        this.drivers.set(key, driver);
        return driver;
      } else {
        console.warn('【驱动管理器】驱动连接失败');
        return null;
      }
    } catch (error) {
      console.error('【驱动管理器】获取驱动失败:', error);
      return null;
    }
  }

  /**
   * 规范化配置
   */
  private normalizeConfig(config: any): PrinterConfig {
    // 深拷贝配置
    const normalizedConfig = { ...config };

    // 确定驱动类型
    if (!normalizedConfig.__driverType) {
      if (config.driverType) {
        normalizedConfig.__driverType = config.driverType;
      } else if (config.type) {
        normalizedConfig.__driverType = config.type;
      } else if (config.connectType) {
        normalizedConfig.__driverType = 'xprinter';
      } else if (config.address && config.port && typeof config.port === 'number') {
        normalizedConfig.__driverType = 'imin';
      } else {
        normalizedConfig.__driverType = 'escpos';
      }
    }

    return normalizedConfig;
  }

  /**
   * 移除驱动
   */
  removeDriver(printerId: string, driverType?: string): void {
    const key = this.getDriverKey(printerId, driverType);
    const driver = this.drivers.get(key);

    if (driver) {
      try {
        driver.close();
        console.log('【驱动管理器】驱动已关闭:', key);
      } catch (error) {
        console.warn('【驱动管理器】关闭驱动失败:', error);
      }
      this.drivers.delete(key);
    }
  }

  /**
   * 清理所有驱动
   */
  cleanup(printerId?: string, driverType?: string): void {
    if (printerId) {
      this.removeDriver(printerId, driverType);
      return;
    }

    // 清理所有驱动
    for (const [key, driver] of Array.from(this.drivers.entries())) {
      try {
        driver.close();
        console.log('【驱动管理器】驱动已关闭:', key);
      } catch (error) {
        console.warn('【驱动管理器】关闭驱动失败:', error);
      }
    }
    this.drivers.clear();
  }

  /**
   * 获取所有已缓存的驱动
   */
  getAllDrivers(): Map<string, IPrinterDriver> {
    return new Map(this.drivers);
  }

  /**
   * 检查驱动是否存在
   */
  hasDriver(printerId: string, driverType?: string): boolean {
    const key = this.getDriverKey(printerId, driverType);
    return this.drivers.has(key);
  }
}

/**
 * 导出单例实例（便于直接使用）
 */
export const printerDriverManager = PrinterDriverManager.getInstance();

