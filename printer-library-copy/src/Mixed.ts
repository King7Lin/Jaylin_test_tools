import Printer from './Printer';
import {EscPos, TextStyle} from './EscPos';
import ByteCommands, {smartEncodeToBytes} from './ByteCommands';
import {EmitterSubscription} from 'react-native';
import IminWebSocketPrinterDriver, {
  MixedItem as IminMixedItem,
} from './drivers/IminWebSocketPrinterDriver';
import XPrinterDriver from './drivers/XPrinterDriver';
import {DatabaseManager} from './database/DatabaseManager';

// 将 ESC/POS 字符串按 ISO-8859-1 直映为字节
function escposStringToBytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
  return bytes;
}

export interface ConnectOptions {
  type: 'network' | 'bluetooth' | 'usb' | 'serial';
  target: string;
  baudRate?: number;
  timeout?: number;
}
export interface ConnectResult {
  success: boolean;
  error?: string;
  disconnect?: () => Promise<void>;
}
export interface MixedItemText {
  kind: 'text';
  content: string;
  style?: TextStyle;
}
export interface MixedItemQR {
  kind: 'qr';
  content: string;
  size?: number;
  ec?: number;
  style?: {align?: 'left' | 'center' | 'right'};
}
export interface MixedItemBarcode {
  kind: 'barcode';
  content: string;
  opts: {
    type: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC_A';
    height?: number;
    width?: number; // 条形码宽度级别 (1-6)，默认3
    text?: 'top' | 'bottom' | 'none' | 'all';
  };
  style?: {align?: 'left' | 'center' | 'right'};
}
export interface MixedItemImage {
  kind: 'image';
  base64: string;
  style?: {align?: 'left' | 'center' | 'right'};
  options?: {
    threshold?: number;
    maxWidth?: number;
  };
}
export interface MixedItemHR {
  kind: 'hr';
  char?: string;
  width?: number;
}
export interface MixedItemSpace {
  kind: 'space';
  lines?: number;
}
export interface MixedItemRaw {
  kind: 'raw';
  data?: string;
  bytes?: number[];
}
export type MixedItem =
  | MixedItemText
  | MixedItemQR
  | MixedItemBarcode
  | MixedItemImage
  | MixedItemHR
  | MixedItemSpace
  | MixedItemRaw;
export interface MixedPrintOptions {
  cut?: boolean;
  init?: boolean;
  /** 是否对连续文本使用 SmartEncoder（中英/符号智能编码）。仅 ESC/POS 通道有效 */
  smartText?: boolean;
  pulse?: boolean;
}

// 在 Mixed.ts 中添加imin驱动管理器
export class PrinterDriverManager {
  private static instance: PrinterDriverManager;
  private drivers: Map<string, any> = new Map();

  private getDriverKey(printerId: string, driverType?: string) {
    return driverType ? `${driverType}:${printerId}` : printerId;
  }

  static getInstance(): PrinterDriverManager {
    if (!PrinterDriverManager.instance) {
      PrinterDriverManager.instance = new PrinterDriverManager();
    }
    return PrinterDriverManager.instance;
  }

  async getDriver(printerId: string, config: any = {}): Promise<any> {
    console.log('------------getDriver', printerId, config);

    // 检查是否已有可用的驱动
    // 深拷贝传入配置，避免调用方引用被修改
    const normalizedConfig = {...(config || {})};
    const driverType =
      normalizedConfig.__driverType ||
      normalizedConfig.driverType ||
      normalizedConfig.type ||
      (normalizedConfig.connectType ? 'xprinter' : undefined) ||
      (normalizedConfig.address && normalizedConfig.port ? 'imin' : undefined) ||
      'escpos'; // 默认使用 ESC/POS

    if (driverType && !normalizedConfig.__driverType) {
      // 统一使用 __driverType 作为内部判断依据，方便缓存键生成
      normalizedConfig.__driverType = driverType;
    }
    console.log('------------getDriver key ',normalizedConfig);
    const key = this.getDriverKey(printerId, driverType);
    console.log('------------getDriver key finish');
    if (this.drivers.has(key)) {
      const driver = this.drivers.get(key);
      console.log('------------检查是否已有可用的驱动', driver, printerId);
      if (driver.isConnected()) {
        console.log('------------已有可用的驱动');
        return driver;
      } else {
        // 连接已断开，重新连接
        console.log('------------连接已断开，重新连接');
        try {
          const reconnected = await driver.connect(printerId);
          if (reconnected) return driver;
        } catch (error) {
          console.log('------------重新连接失败', error);
        }

        // 连接失败，移除旧驱动
        this.drivers.delete(key);
      }
    }
    // console.log('------------没有可用的驱动，创建新驱动');
    // 创建新驱动
    try {
      console.log('------------创建新驱动');
      let driver: any;
      if (normalizedConfig.__driverType === 'xprinter') {
        // 动态 require，保证在未接入对应 SDK 时不报错
        const XPrinterDriver = require('./drivers/XPrinterDriver').default;
        console.log('------------创建新驱动 XPrinterDriver111',normalizedConfig);
        driver = new XPrinterDriver(normalizedConfig);
      } else if (normalizedConfig.__driverType === 'epson') {
        const EpsonPrinterDriver =
          require('./drivers/EpsonPrinterDriver').default;
        console.log('------------创建新驱动 EpsonPrinterDriver111',normalizedConfig);
        driver = new EpsonPrinterDriver(normalizedConfig);
        console.log('------------创建新驱动 EpsonPrinterDriver222');
      } else if (normalizedConfig.__driverType === 'imin') {
        const IminWebSocketPrinterDriver =
          require('./drivers/IminWebSocketPrinterDriver').default;
        console.log('------------创建新驱动 IminWebSocketPrinterDriver111',normalizedConfig);
        driver = new IminWebSocketPrinterDriver(normalizedConfig);
      } else {
        // 默认使用 ESC/POS 驱动
        const EscPosDriver = require('./drivers/EscPosDriver').default;
        console.log('------------创建新驱动 EscPosDriver111',normalizedConfig);
        driver = new EscPosDriver(normalizedConfig);
      }
      console.log('------------没有可用的驱动，创建新驱动', driver);
      const connected = await driver.connect(printerId);
      if (connected) {
        console.log('------------连接成功，设置驱动');
        this.drivers.set(key, driver);
        return driver;
      }
    } catch (error) {
      console.log('------------创建新驱动失败', error);
    }

    return null;
  }

  // 清理断开的连接
  cleanup(printerId?: string, driverType?: string) {
    if (printerId) {
      this.removeDriver(printerId, driverType);
      return;
    }

    for (const [key, driver] of Array.from(this.drivers.entries())) {
      try {
        if (typeof driver?.close === 'function') {
          driver.close();
        }
      } catch (error) {
        console.log('------------cleanup close driver error', error);
      }
      this.drivers.delete(key);
    }
  }

  removeDriver(printerId: string, driverType?: string) {
    const key = this.getDriverKey(printerId, driverType);
    const driver = this.drivers.get(key);
    if (!driver) {
      return;
    }
    try {
      if (typeof driver?.close === 'function') {
        driver.close();
      }
    } catch (error) {
      console.log('------------removeDriver close error', error);
    }
    this.drivers.delete(key);
  }
}

export async function printMixed(
  id: string,
  items: MixedItem[],
  options: MixedPrintOptions & {
    type?: 'escpos' | 'imin' | 'xprinter' | 'epson';
    imin?: {
      address: string;
      port: number;
      printerType?: 'USB' | 'Bluetooth' | 'SPI';
    };
    xprinter?: {
      connectType: 'usb' | 'net' | 'bt' | 'serial';
      address: string;
    };
    epson?: {
      series: number;
      lang: number;
      connectType: 'tcp' | 'bt' | 'usb';
      address: string;
      port?: number;
    };
    escpos?: {
      type: 'network' | 'bluetooth' | 'usb' | 'serial';
      target: string;
      name?: string;
      baudRate?: number;
      timeout?: number;
    };
  } = {},
): Promise<void> {
  console.log('------------printMixed', id, items, options);
  // return
  // IMIN打印机处理 - 使用驱动管理器复用连接
  if (options.type === 'imin' && options.imin) {
    const driverManager = PrinterDriverManager.getInstance();
    const driver = await driverManager.getDriver(id, {
      address: options.imin.address,
      port: options.imin.port,
      printerType: options.imin.printerType || 'SPI',
    });
    if (driver) {
      await driver.printMixed(items as unknown as IminMixedItem[], {
        init: options.init !== false,
        cut: options.cut === true,
        printerId: id,
      });
      return;
    } else {
      throw new Error(`无法连接到IMIN打印机: ${id}`);
    }
  }

  if (options.type === 'xprinter' && options.xprinter) {
    if (!options.xprinter.address) {
      throw new Error(`缺少 XPrinter 连接地址: ${id}`);
    }
    try {
      const driverManager = PrinterDriverManager.getInstance();
      // 按需获取 XPrinter 驱动实例，自动保存并复用连接
      const driver = await driverManager.getDriver(id, {
        __driverType: 'xprinter',
        ...options.xprinter,
      });
      if (driver) {
        await driver.printMixed(items, {
          init: options.init !== false,
          cut: options.cut === true,
          printerId: id,
        });
        return;
      } else {
        throw new Error(`无法连接到 XPrinter 打印机: ${id}`);
      }
    } catch (error) {
      console.log('------------printMixed error', error);
    }
  }
  // Epson 打印机处理 - 使用驱动管理器复用连接
  if (options.type === 'epson' && options.epson) {
    if (!options.epson.address) {
      throw new Error(`缺少 Epson 连接地址: ${id}`);
    }
    try {
      const driverManager = PrinterDriverManager.getInstance();
      // 按需获取 Epson 驱动实例，自动保存并复用连接
      const driver = await driverManager.getDriver(id, {
        __driverType: 'epson',
        ...options.epson,
      });
      if (driver) {
        await driver.printMixed(items, {
          init: options.init !== false,
          cut: options.cut === true,
          printerId: id,
        });
        return;
      } else {
        throw new Error(`无法连接到 Epson 打印机: ${id}`);
      }
    } catch (error) {
      console.log('------------printMixed Epson error', error);
      throw error;
    }
  }

  // ESC/POS 打印机处理 - 统一使用驱动管理器
  // 注意：如果没有明确指定 type，默认使用 ESC/POS
  console.log('------------使用 ESC/POS 驱动打印', id, options);
  try {
    const driverManager = PrinterDriverManager.getInstance();
    // 获取或创建 ESC/POS 驱动实例
    const driver = await driverManager.getDriver(id, {
      __driverType: 'escpos',
      type: options.escpos?.type || 'network',
      target: options.escpos?.target || id,
      name: options.escpos?.name,
      baudRate: options.escpos?.baudRate,
      timeout: options.escpos?.timeout,
    });
    
    if (driver) {
      await driver.printMixed(items, {
        init: options.init !== false,
        cut: options.cut === true,
        smartText: options.smartText,
        pulse: options.pulse,
        printerId: id,
      });
      return;
    } else {
      throw new Error(`无法连接到 ESC/POS 打印机: ${id}`);
    }
  } catch (error) {
    console.log('------------printMixed ESC/POS error', error);
    throw error;
  }
}

