/**
 * 打印机驱动工厂
 * 负责创建和管理不同类型的打印机驱动实例
 */

import type { IPrinterDriver } from './IPrinterDriver';
import type { PrinterConfig, DriverType } from './types';

/**
 * 打印机驱动工厂类
 */
export class PrinterDriverFactory {
  /**
   * 创建打印机驱动实例
   * @param config 打印机配置
   * @returns 打印机驱动实例
   */
  static createDriver(config: PrinterConfig): IPrinterDriver {
    const driverType = config.__driverType || this.detectDriverType(config);

    switch (driverType) {
      case 'xprinter':
        return this.createXPrinterDriver(config);
      case 'epson':
        return this.createEpsonDriver(config);
      case 'imin':
        return this.createIminDriver(config);
      case 'escpos':
      default:
        return this.createEscPosDriver(config);
    }
  }

  /**
   * 检测驱动类型
   * @param config 配置对象
   * @returns 驱动类型
   */
  private static detectDriverType(config: any): DriverType {
    if (config.connectType) {
      return 'xprinter';
    }
    if (config.series !== undefined || config.lang !== undefined) {
      return 'epson';
    }
    if (config.address && config.port && typeof config.port === 'number') {
      return 'imin';
    }
    return 'escpos';
  }

  /**
   * 创建 ESC/POS 驱动
   */
  private static createEscPosDriver(config: any): IPrinterDriver {
    try {
      const EscPosDriver = require('../drivers/EscPosDriver').default;
      return new EscPosDriver({
        type: config.type || 'network',
        target: config.target || config.address,
        name: config.name,
        baudRate: config.baudRate,
        timeout: config.timeout,
      });
    } catch (error) {
      console.error('创建 EscPosDriver 失败:', error);
      throw new Error(`无法创建 ESC/POS 驱动: ${error}`);
    }
  }

  /**
   * 创建 XPrinter 驱动
   */
  private static createXPrinterDriver(config: any): IPrinterDriver {
    try {
      const XPrinterDriver = require('../drivers/XPrinterDriver').default;
      return new XPrinterDriver({
        connectType: config.connectType || config.type,
        address: config.address || config.target,
        retryCount: config.retryCount,
        retryDelay: config.retryDelay,
        autoReconnect: config.autoReconnect,
      });
    } catch (error) {
      console.error('创建 XPrinterDriver 失败:', error);
      throw new Error(`无法创建 XPrinter 驱动: ${error}`);
    }
  }

  /**
   * 创建 Epson 驱动
   */
  private static createEpsonDriver(config: any): IPrinterDriver {
    try {
      const EpsonPrinterDriver = require('../drivers/EpsonPrinterDriver').default;
      return new EpsonPrinterDriver({
        series: config.series,
        lang: config.lang,
        EpsonConnectType: config.EpsonConnectType || config.connectType || config.type,
        address: config.address || config.target,
        port: config.port,
        retryCount: config.retryCount,
        retryDelay: config.retryDelay,
      });
    } catch (error) {
      console.error('创建 EpsonPrinterDriver 失败:', error);
      throw new Error(`无法创建 Epson 驱动: ${error}`);
    }
  }

  /**
   * 创建 IMIN 驱动
   */
  private static createIminDriver(config: any): IPrinterDriver {
    try {
      const IminWebSocketPrinterDriver = require('../drivers/IminWebSocketPrinterDriver').default;
      return new IminWebSocketPrinterDriver({
        address: config.address,
        port: config.port,
        printerType: config.printerType || 'SPI',
        retryCount: config.retryCount,
        retryDelay: config.retryDelay,
      });
    } catch (error) {
      console.error('创建 IminWebSocketPrinterDriver 失败:', error);
      throw new Error(`无法创建 IMIN 驱动: ${error}`);
    }
  }
}

