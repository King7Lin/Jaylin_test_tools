/**
 * Printer Library - 统一打印机库
 * 
 * 提供统一的打印机操作接口，支持多种打印机类型
 */

// ============== 核心模块 ==============
// 打印机驱动接口和类型
export type { IPrinterDriver, IPrinterDriverConstructor, DriverFactory } from './core/IPrinterDriver';
export type {
  Align as CoreAlign,
  TextStyle as CoreTextStyle,
  BarcodeType,
  BarcodeOptions as CoreBarcodeOptions,
  ImageOptions,
  MixedItem,
  MixedItemText,
  MixedItemQR,
  MixedItemBarcode,
  MixedItemImage,
  MixedItemHR,
  MixedItemSpace,
  MixedItemRaw,
  MixedItemCashDrawer,
  MixedItemTable,
  PrintOptions,
  ConnectionType,
  PrinterStatus as CorePrinterStatus,
  DriverType,
  PrinterConfigBase,
  EscPosConfig,
  XPrinterConfig,
  EpsonConfig,
  IminConfig,
  PrinterConfig as CorePrinterConfig,
  ConnectResult,
} from './core/types';

// 打印机驱动管理和工厂
export { PrinterDriverManager } from './core/PrinterDriverManager';
export { PrinterDriverFactory } from './core/PrinterDriverFactory';
import { PrinterDriverManager as DriverManager } from './core/PrinterDriverManager';
import { PrinterDriverFactory as DriverFactory } from './core/PrinterDriverFactory';

// 混合打印入口（主要API）
export { printMixed } from './core/Mixed';

// ============== 基础打印机接口 ==============
export { default as Printer } from './Printer';
export type { PrinterDevice, ConnectedPrinter } from './Printer';

// ============== 命令构建器 ==============
// EscPos 命令构建器（字符串模式）
export * from './EscPos';
export { default as EscPos } from './EscPos';

// ByteCommands 字节命令构建器（推荐）
export { default as ByteCommands } from './ByteCommands';
export {
  setAlign as ByteSetAlign,
  bold as ByteBold,
  underline as ByteUnderline,
  invert as ByteInvert,
  doubleStrike as ByteDoubleStrike,
  size as ByteSize,
  setCodePage as ByteSetCodePage,
  feed as ByteFeed,
  cut as ByteCut,
  pulse as BytePulse,
  beep as ByteBeep,
  text as ByteText,
  textLine as ByteTextLine,
  applyStyle as ByteApplyStyle,
  resetStyle as ByteResetStyle,
  styledText as ByteStyledText,
  qrcode as ByteQrcode,
  barcode as ByteBarcode,
  setChineseCodePage,
  setJapaneseCodePage,
  setEnglishCodePage,
  smartEncodeToBytes,
  combine as byteCombine,
  init as byteInit,
} from './ByteCommands';

// 智能编码器
export {
  SmartEncoder,
  smartEncode,
  getCodePageCommand,
  detectLanguage,
} from './SmartEncoder';

// ============== 打印机驱动 ==============
export { default as EscPosDriver } from './drivers/EscPosDriver';
export type { EscPosDriverOptions } from './drivers/EscPosDriver';

export { default as XPrinterDriver } from './drivers/XPrinterDriver';
export type { XPrinterDriverOptions } from './drivers/XPrinterDriver';

export { default as EpsonPrinterDriver } from './drivers/EpsonPrinterDriver';
export type { EpsonPrinterDriverOptions } from './drivers/EpsonPrinterDriver';

export { default as IminWebSocketPrinterDriver } from './drivers/IminWebSocketPrinterDriver';
export type { IminDriverOptions } from './drivers/IminWebSocketPrinterDriver';

// ============== 数据库与队列 ==============
// 数据库管理器
export { DatabaseManager } from './database/DatabaseManager';
export { DEFAULT_PRINTER_DB_XML } from './database/XmlSchema';
export type {
  PrinterConfig as DbPrinterConfig,
  PrintJob,
  PrinterStatus as DbPrinterStatus,
  PrintJobStatus,
} from './database/DatabaseManager';

// 队列调度器（V2优化版）
export { DbQueueScheduler } from './queue/DbQueueScheduler';
export { ConcurrentQueueSchedulerV2 } from './queue/ConcurrentQueueSchedulerV2';
export { PrinterQueueManager } from './queue/PrinterQueueManager';
export type { QueueJob } from './queue/PrinterQueueManager';

// 队列打印 API
export { enqueueMixedPrintBatch } from './api/enqueue';

// ============== 向后兼容 ==============
// 保留旧的 Mixed 导出以保持向后兼容
import { printMixed as printMixedFn } from './core/Mixed';
export const Mixed = {
  printMixed: printMixedFn,
};

// 导入默认导出所需的值
import PrinterDefault from './Printer';
import EscPosDefault from './EscPos';
import ByteCommandsDefault from './ByteCommands';
import { SmartEncoder as SmartEncoderClass } from './SmartEncoder';
import EscPosDriverDefault from './drivers/EscPosDriver';
import XPrinterDriverDefault from './drivers/XPrinterDriver';
import EpsonPrinterDriverDefault from './drivers/EpsonPrinterDriver';
import IminWebSocketPrinterDriverDefault from './drivers/IminWebSocketPrinterDriver';
import { DatabaseManager as DbManager } from './database/DatabaseManager';
import { DbQueueScheduler as DbQueueSched } from './queue/DbQueueScheduler';
import { ConcurrentQueueSchedulerV2 as ConcurrentQueueSched } from './queue/ConcurrentQueueSchedulerV2';
import { PrinterQueueManager as PrinterQueueMgr } from './queue/PrinterQueueManager';

// 默认导出
export default {
  // 核心API
  printMixed: printMixedFn,
  PrinterDriverManager: DriverManager,
  PrinterDriverFactory: DriverFactory,
  
  // 基础模块
  Printer: PrinterDefault,
  EscPos: EscPosDefault,
  ByteCommands: ByteCommandsDefault,
  SmartEncoder: SmartEncoderClass,
  
  // 驱动
  EscPosDriver: EscPosDriverDefault,
  XPrinterDriver: XPrinterDriverDefault,
  EpsonPrinterDriver: EpsonPrinterDriverDefault,
  IminWebSocketPrinterDriver: IminWebSocketPrinterDriverDefault,
  
  // 数据库和队列
  DatabaseManager: DbManager,
  DbQueueScheduler: DbQueueSched,
  ConcurrentQueueSchedulerV2: ConcurrentQueueSched,
  PrinterQueueManager: PrinterQueueMgr,
};
