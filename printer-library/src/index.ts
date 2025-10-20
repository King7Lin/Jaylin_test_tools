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
// XPrinter 原生模块接口
export { xprinterNative, XPrinterNativeInterface, XPrinterDevice, XPrinterConnectEvent, XPrinterNetDeviceEvent } from './XPrinterNative';
export {default as XPrinterNative} from './XPrinterNative';


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
// ⚠️ 已移除：数据库和队列功能已迁移到主项目
// 请使用主项目的 src/printer-queue 模块
// 
// 迁移说明：
// - DatabaseManager → 使用主项目的 PrinterDAO / PrintJobDAO
// - ConcurrentQueueSchedulerV2 → 使用主项目的 ConcurrentQueueScheduler
// - enqueueMixedPrintBatch → 使用主项目的 enqueuePrintBatch
// 
// 详见：REMOVED-DB-DEPENDENCY.md 和 BREAKING-CHANGES.md

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

// 默认导出（移除了 db 和 queue）
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
};
