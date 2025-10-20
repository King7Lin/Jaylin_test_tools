/**
 * Mixed - 混合打印入口
 * 提供统一的打印接口，支持多种打印机类型
 */

import { PrinterDriverManager } from './PrinterDriverManager';
import type { MixedItem, PrintOptions, PrinterConfig } from './types';

/**
 * 打印混合内容
 * 
 * @param printerId 打印机ID
 * @param items 打印项数组
 * @param options 打印选项和打印机配置
 * @returns Promise<void>
 * 
 * @example
 * ```typescript
 * // ESC/POS 打印机
 * await printMixed('printer1', items, {
 *   type: 'escpos',
 *   escpos: {
 *     type: 'TCP',
 *     target: '192.168.1.100:9100'
 *   },
 *   cut: true,
 *   init: true
 * });
 * 
 * // XPrinter 打印机
 * await printMixed('printer2', items, {
 *   type: 'xprinter',
 *   xprinter: {
 *     connectType: 'TCP',
 *     address: '192.168.1.101:9100'
 *   },
 *   cut: true
 * });
 * ```
 */
export async function printMixed(
  printerId: string,
  items: MixedItem[],
  options: PrintOptions & {
    type?: 'escpos' | 'imin' | 'xprinter' | 'epson';
    imin?: {
      address: string;
      port: number;
      printerType?: 'USB' | 'Bluetooth' | 'SPI';
    };
    xprinter?: {
      connectType: 'usb' | 'net' | 'bt' | 'serial' | 'TCP' | 'USB' | 'Bluetooth' | 'Serial';
      address: string;
    };
    epson?: {
      series: number;
      lang: number;
      connectType: 'tcp' | 'bt' | 'usb' | 'TCP' | 'Bluetooth' | 'USB';
      address: string;
      port?: number;
    };
    escpos?: {
      type: 'network' | 'bluetooth' | 'usb' | 'serial' | 'TCP' | 'USB' | 'Bluetooth' | 'Serial';
      target: string;
      name?: string;
      baudRate?: number;
      timeout?: number;
    };
  } = {},
): Promise<void> {
  console.log('【Mixed】printMixed 开始:', printerId, items.length, 'items', options);

  // 构建打印机配置
  const config = buildPrinterConfig(printerId, options);
  console.log('【Mixed】打印机配置:', config);

  try {
    // 获取或创建驱动实例
    const driverManager = PrinterDriverManager.getInstance();
    const driver = await driverManager.getDriver(printerId, config);

    if (!driver) {
      throw new Error(`无法获取打印机驱动: ${printerId}`);
    }

    // 执行打印
    const success = await driver.printMixed(items, {
      init: options.init !== false,
      cut: options.cut === true,
      smartText: options.smartText,
      pulse: options.pulse,
      printerId: printerId,
    });

    if (!success) {
      throw new Error(`打印失败: ${printerId}`);
    }

    console.log('【Mixed】printMixed 完成:', printerId);
  } catch (error) {
    console.error('【Mixed】printMixed 错误:', error);
    throw error;
  }
}

/**
 * 构建打印机配置
 */
function buildPrinterConfig(
  printerId: string,
  options: any,
): PrinterConfig {
  const driverType = options.type || detectDriverType(options);

  switch (driverType) {
    case 'imin':
      if (!options.imin) {
        throw new Error(`缺少 IMIN 打印机配置: ${printerId}`);
      }
      return {
        __driverType: 'imin',
        address: options.imin.address,
        port: options.imin.port,
        printerType: options.imin.printerType || 'SPI',
      };

    case 'xprinter':
      if (!options.xprinter) {
        throw new Error(`缺少 XPrinter 打印机配置: ${printerId}`);
      }
      return {
        __driverType: 'xprinter',
        connectType: normalizeConnectionType(options.xprinter.connectType),
        address: options.xprinter.address,
      };

    case 'epson':
      if (!options.epson) {
        throw new Error(`缺少 Epson 打印机配置: ${printerId}`);
      }
      return {
        __driverType: 'epson',
        series: options.epson.series,
        lang: options.epson.lang,
        connectType: normalizeConnectionType(options.epson.connectType),
        address: options.epson.address,
        port: options.epson.port,
      };

    case 'escpos':
    default:
      const escposOpts = options.escpos || {};
      return {
        __driverType: 'escpos',
        type: normalizeConnectionType(escposOpts.type || 'network'),
        target: escposOpts.target || printerId,
        name: escposOpts.name,
        baudRate: escposOpts.baudRate,
        timeout: escposOpts.timeout,
      };
  }
}

/**
 * 检测驱动类型
 */
function detectDriverType(options: any): string {
  if (options.imin || (options.address && typeof options.port === 'number')) {
    return 'imin';
  }
  if (options.xprinter || options.connectType) {
    return 'xprinter';
  }
  if (options.epson || (options.series !== undefined && options.lang !== undefined)) {
    return 'epson';
  }
  return 'escpos';
}

/**
 * 规范化连接类型
 */
function normalizeConnectionType(type: string): any {
  const normalized = type?.toLowerCase();
  switch (normalized) {
    case 'tcp':
    case 'network':
    case 'net':
      return 'TCP';
    case 'usb':
      return 'USB';
    case 'bluetooth':
    case 'bt':
      return 'Bluetooth';
    case 'serial':
      return 'Serial';
    default:
      return type;
  }
}

/**
 * 导出驱动管理器（用于高级操作）
 */
export { PrinterDriverManager };

/**
 * 默认导出
 */
export default {
  printMixed,
  PrinterDriverManager,
};

