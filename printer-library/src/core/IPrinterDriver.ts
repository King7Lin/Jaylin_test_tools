/**
 * 打印机驱动统一接口
 * 所有打印机驱动都必须实现此接口
 */

import type { MixedItem, PrintOptions, PrinterStatus, PrinterConfig } from './types';

/**
 * 打印机驱动接口
 */
export interface IPrinterDriver {
  /**
   * 连接打印机
   * @param printerId 打印机ID
   * @returns 是否连接成功
   */
  connect(printerId?: string): Promise<boolean>;

  /**
   * 断开连接
   */
  disconnect?(): Promise<void>;

  /**
   * 关闭驱动（清理资源）
   */
  close(): void;

  /**
   * 检查是否已连接
   */
  isConnected(): boolean;

  /**
   * 打印混合内容
   * @param items 打印项数组
   * @param options 打印选项
   * @returns 是否打印成功
   */
  printMixed(items: MixedItem[], options?: PrintOptions): Promise<boolean>;

  /**
   * 获取打印机状态（可选）
   */
  getPrinterStatus?(type?: string): Promise<PrinterStatus | any>;
}

/**
 * 打印机驱动构造函数类型
 */
export interface IPrinterDriverConstructor {
  new (config: any): IPrinterDriver;
}

/**
 * 驱动工厂函数类型
 */
export type DriverFactory = (config: PrinterConfig) => IPrinterDriver;

