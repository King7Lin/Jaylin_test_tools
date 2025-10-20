/**
 * 打印机库核心类型定义
 * 统一所有驱动使用的类型
 */

/**
 * 对齐方式
 */
export type Align = 'left' | 'center' | 'right';

/**
 * 文本样式
 */
export interface TextStyle {
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
  width?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  height?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  invert?: boolean;
  doubleStrike?: boolean;
  color?: 'black' | 'red';
}

/**
 * 条形码类型
 */
export type BarcodeType =
  | 'CODE128'
  | 'CODE39'
  | 'CODE93'
  | 'EAN13'
  | 'EAN8'
  | 'UPC_A'
  | 'UPCE'
  | 'ITF'
  | 'CODABAR'
  | 'JAN13'
  | 'JAN8';

/**
 * 条形码选项
 */
export interface BarcodeOptions {
  type: BarcodeType;
  height?: number;
  width?: number; // 1-6
  text?: 'top' | 'bottom' | 'none' | 'all';
}

/**
 * 图片选项
 */
export interface ImageOptions {
  threshold?: number;
  maxWidth?: number;
}

/**
 * 打印项 - 文本
 */
export interface MixedItemText {
  kind: 'text';
  content: string;
  style?: TextStyle;
}

/**
 * 打印项 - 二维码
 */
export interface MixedItemQR {
  kind: 'qr';
  content: string;
  size?: number;
  ec?: number; // 纠错级别
  style?: { align?: Align };
}

/**
 * 打印项 - 条形码
 */
export interface MixedItemBarcode {
  kind: 'barcode';
  content: string;
  opts: BarcodeOptions;
  style?: { align?: Align };
}

/**
 * 打印项 - 图片
 */
export interface MixedItemImage {
  kind: 'image';
  base64: string;
  style?: { align?: Align };
  options?: ImageOptions;
}

/**
 * 打印项 - 水平线
 */
export interface MixedItemHR {
  kind: 'hr';
  char?: string;
  width?: number;
}

/**
 * 打印项 - 空行
 */
export interface MixedItemSpace {
  kind: 'space';
  lines?: number;
}

/**
 * 打印项 - 原始数据
 */
export interface MixedItemRaw {
  kind: 'raw';
  data?: string;
  bytes?: number[];
}

/**
 * 打印项 - 钱箱
 */
export interface MixedItemCashDrawer {
  kind: 'cashDrawer';
  pin?: number;
}

/**
 * 打印项 - 表格
 */
export interface MixedItemTable {
  kind: 'table';
  headers: string[];
  widths: number[];
  aligns: number[];
  rows: Array<string[] | { cells: string[] }>;
}

/**
 * 混合打印项联合类型
 */
export type MixedItem =
  | MixedItemText
  | MixedItemQR
  | MixedItemBarcode
  | MixedItemImage
  | MixedItemHR
  | MixedItemSpace
  | MixedItemRaw
  | MixedItemCashDrawer
  | MixedItemTable;

/**
 * 打印选项
 */
export interface PrintOptions {
  init?: boolean;
  cut?: boolean;
  smartText?: boolean;
  pulse?: boolean;
  printerId?: string;
}

/**
 * 连接类型
 */
export type ConnectionType = 'TCP' | 'USB' | 'Bluetooth' | 'Serial' | 'network' | 'usb' | 'bluetooth' | 'serial' | 'bt';

/**
 * 打印机状态
 */
export interface PrinterStatus {
  paperOut?: boolean;
  drawerOpen?: boolean;
  coverOpen?: boolean;
  paperNearEnd?: boolean;
  offline?: boolean;
  error?: boolean;
  paperJam?: boolean;
  cutterError?: boolean;
  recoverableError?: boolean;
  unrecoverableError?: boolean;
  paperPresent?: boolean;
  paperEmpty?: boolean;
  paperLow?: boolean;
  timestamp?: string;
}

/**
 * 驱动类型
 */
export type DriverType = 'escpos' | 'xprinter' | 'epson' | 'imin';

/**
 * 打印机配置基础接口
 */
export interface PrinterConfigBase {
  __driverType?: DriverType;
  type?: ConnectionType;
}

/**
 * ESC/POS 驱动配置
 */
export interface EscPosConfig extends PrinterConfigBase {
  __driverType: 'escpos';
  type: ConnectionType;
  target: string;
  name?: string;
  baudRate?: number;
  timeout?: number;
}

/**
 * XPrinter 驱动配置
 */
export interface XPrinterConfig extends PrinterConfigBase {
  __driverType: 'xprinter';
  connectType: ConnectionType;
  address: string;
  retryCount?: number;
  retryDelay?: number;
  autoReconnect?: boolean;
}

/**
 * Epson 驱动配置
 */
export interface EpsonConfig extends PrinterConfigBase {
  __driverType: 'epson';
  series: number;
  lang: number;
  connectType: ConnectionType;
  address: string;
  port?: number;
  retryCount?: number;
  retryDelay?: number;
}

/**
 * IMIN 驱动配置
 */
export interface IminConfig extends PrinterConfigBase {
  __driverType: 'imin';
  address: string;
  port: number;
  printerType?: 'USB' | 'Bluetooth' | 'SPI';
  retryCount?: number;
  retryDelay?: number;
}

/**
 * 打印机配置联合类型
 */
export type PrinterConfig = EscPosConfig | XPrinterConfig | EpsonConfig | IminConfig;

/**
 * 连接结果
 */
export interface ConnectResult {
  success: boolean;
  error?: string;
  message?: string;
}

