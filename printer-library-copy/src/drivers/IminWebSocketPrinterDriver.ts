// Lightweight IMIN WebSocket driver wrapper for printer-library
// Depends on project-root level imin-printer-rn.js (WebSocket SDK wrapper)

import type {TextStyle} from '../EscPos';
import {DatabaseManager} from '../database/DatabaseManager';

export type IminPrinterType = 'USB' | 'Bluetooth' | 'SPI';

export interface IminDriverOptions {
  address: string;
  port: number;
  printerType?: IminPrinterType;
  retryCount?: number;
  retryDelay?: number;
}

// 基础样式接口，支持对齐、粗体、宽度、高度
export interface ItemStyle {
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  width?: number;
  height?: number;
}

export interface MixedItemText {
  kind: 'text';
  content: string;
  style: ItemStyle;
}
export interface MixedItemQR {
  kind: 'qr';
  content: string;
  size?: number;
  ec?: number;
  style: {align: 'left' | 'center' | 'right'};
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
  style: {align: 'left' | 'center' | 'right'};
}
export interface MixedItemImage {
  kind: 'image';
  base64: string;
  maxWidth?: number; // 图片最大宽度(像素)，默认384 (58mm纸)，576 (80mm纸)
  options?: {
    maxWidth?: number;
    threshold?: number;
  };
  style: {align: 'left' | 'center' | 'right'};
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
  data: string;
}
export type MixedItem =
  | MixedItemText
  | MixedItemQR
  | MixedItemBarcode
  | MixedItemImage
  | MixedItemHR
  | MixedItemSpace
  | MixedItemRaw;

export class IminWebSocketPrinterDriver {
  private sdk: any;
  private opts: IminDriverOptions;
  private _isConnected: boolean = false; // 添加内部连接状态管理

  constructor(opts: IminDriverOptions) {
    this.opts = {
      retryCount: 3,
      retryDelay: 1000,
      printerType: 'SPI',
      ...opts,
    };
    this.sdk = this.createSdkInstance(opts.address, opts.port);
  }

  private createSdkInstance(address: string, port: number): any {
    let IminPrinterCtor: any;
    try {
      // project root
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./imin-printer-rn.js');

      IminPrinterCtor = mod.IminPrinter || mod.default?.IminPrinter || mod;
    } catch (_e) {
      throw new Error(
        '无法加载 iMin SDK (imin-printer-rn.js)，请确认文件在项目根目录' + _e,
      );
    }
    return new IminPrinterCtor(address, port);
  }

  async connect(printerId?: string): Promise<boolean> {
    const max = this.opts.retryCount ?? 3;
    for (let attempt = 0; attempt <= max; attempt++) {
      try {
        await this.sdk.connect();
        this.sdk.initPrinter(this.opts.printerType || 'SPI');
        this._isConnected = true; // 更新内部状态

        // 连接成功后，保存打印机配置到数据库
        if (printerId) {
          try {
            const db = DatabaseManager.getInstance() as any;
            if (!db.db) {
              await db.initialize().catch(() => {});
            }
            await db.savePrinter({
              id: printerId,
              name: `IMIN_${this.opts.address}:${this.opts.port}`.slice(0, 60),
              type: 'imin',
              connectionParams: {
                address: this.opts.address,
                port: this.opts.port,
                printerType: this.opts.printerType,
                retryCount: this.opts.retryCount,
                retryDelay: this.opts.retryDelay,
              },
              isEnabled: true,
              status: 'IDLE' as any,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as any);
            console.log(`IMIN打印机 ${printerId} 配置已保存到数据库`);
          } catch (dbError) {
            console.warn('保存IMIN打印机配置到数据库失败:', dbError);
            // 不影响连接结果，仅记录警告
          }
        }

        return true;
      } catch (e) {
        this._isConnected = false; // 连接失败时更新状态
        if (attempt === max) return false;
        await new Promise(r => setTimeout(r, this.opts.retryDelay ?? 1000));
      }
    }
    this._isConnected = false; // 最终失败时更新状态
    return false;
  }

  isConnected(): boolean {
    try {
      // 优先使用内部状态，如果内部状态为 false，直接返回
      if (!this._isConnected) {
        return false;
      }
      // 内部状态为 true 时，双重检查 SDK 状态
      const sdkConnected = !!this.sdk?.isPrinterConnected();
      if (!sdkConnected) {
        this._isConnected = false; // 同步内部状态
      }
      return sdkConnected;
    } catch {
      this._isConnected = false;
      return false;
    }
  }

  close(): void {
    try {
      this.sdk?.close();
    } catch {}
    this._isConnected = false; // 确保关闭后状态正确
  }

  private alignToImin(
    style: ItemStyle | {align: 'left' | 'center' | 'right'},
  ): number {
    const a = style.align || 'left';
    console.log('----------------duiqi style', a, style.align);

    switch (style.align) {
      case 'center':
        return 1;
      case 'right':
        return 2;
      default:
        return 0;
    }
  }

  private mapBarcodeType(t: MixedItemBarcode['opts']['type']): number {
    switch (t) {
      case 'UPC_A':
        return 0;
      case 'EAN13':
        return 2;
      case 'EAN8':
        return 3;
      case 'CODE39':
        return 4;
      case 'CODE128':
        return 8;
      default:
        return 4;
    }
  }

  async printMixed(
    items: MixedItem[],
    options?: {init?: boolean; cut?: boolean; printerId?: string; pulse?: boolean},
  ): Promise<boolean> {
    if (!this.isConnected()) {
      const ok = await this.connect(options?.printerId);
      if (!ok) return false;
    }
    if (options?.init !== false) {
      try {
        this.sdk.initPrinter(this.opts.printerType || 'SPI');
      } catch {}
    }
    if(options?.pulse){
      this.sdk.openCashBox();
    }
    for (const it of items) {
      switch (it.kind) {
        case 'text': {
          const t = it as MixedItemText;

          // 设置对齐方式
          const a = this.alignToImin(t.style);
          console.log('--------对其text', a);

          // try {
          //   this.sdk.setAlignment(a);
          // } catch (error){
          //   console.log('--------setAlignment失败', error);

          // }

          // 设置粗体
          if (t.style?.bold) {
            try {
              this.sdk.setTextStyle(1);
            } catch {}
          }

          // 设置文字大小（支持 width 和 height 动态倍数）
          const baseSize = 24; // 基础字体大小
          const widthMultiplier = t.style?.width || 1;
          const heightMultiplier = t.style?.height || 1;
          // 取宽度和高度的最大倍数作为字体大小的倍数
          const sizeMultiplier = Math.max(widthMultiplier, heightMultiplier);
          const fontSize = baseSize * sizeMultiplier;
          
          try {
            this.sdk.setTextSize(fontSize);
          } catch {}

          // 打印文本
          try {
            this.sdk.printText(t.content || '', a);
            // this.sdk.setTextAlignment(t.content || '', 1);
            this.sdk.printAndLineFeed();
          } catch {}

          // 重置样式
          try {
            this.sdk.setTextStyle(0); // 重置粗体
            this.sdk.setAlignment(0); // 重置对齐
            this.sdk.setTextSize(28); // 重置字体大小
          } catch {}
          break;
        }
        case 'qr': {
          const q = it as MixedItemQR;

          // 设置对齐方式 - 支持从 style 读取
          const a = this.alignToImin(q.style);
          console.log('--------对其qr', a);
          try {
            this.sdk.setAlignment(a);
          } catch {}

          // 设置二维码大小
          try {
            this.sdk.setQrCodeSize(q.size ?? 6);
          } catch {}

          // 打印二维码
          try {
            this.sdk.printQrCode(q.content || '', 1);
          } catch {}

          // 重置对齐方式
          try {
            this.sdk.setAlignment(0);
          } catch {}
          break;
        }
        case 'barcode': {
          const b = it as MixedItemBarcode;
          console.log('--------条形码', b);

          // 设置对齐方式 - 支持从 style 读取
          const a = this.alignToImin(b.style);
          console.log('--------对其barcode', a);
          try {
            this.sdk.setAlignment(a);
          } catch {}

          // 设置条形码宽度
          try {
            const width = b.opts?.width ?? 3; // 默认宽度级别为3
            this.sdk.setBarCodeWidth(width);
          } catch {}

          // 设置条形码高度
          try {
            this.sdk.setBarCodeHeight(b.opts?.height ?? 80);
          } catch {}

          // 设置是否显示文本
          try {
            const hir = () => {
              switch (b.opts.text) {
                case 'top':
                  return 1;
                case 'bottom':
                  return 2;
                case 'none':
                  return 0;
                case 'all':
                  return 3;
                default:
                  return 0;
              }
            };
            this.sdk.setBarCodeContentPrintPos(hir());
          } catch {}

          // 打印条形码
          try {
            this.sdk.printBarCode(
              this.mapBarcodeType(b.opts.type),
              b.content || '',
              1,
            );
          } catch (error) {
            console.log('--------条形码错误', error);
          }

          // 重置对齐方式
          try {
            this.sdk.setAlignment(0);
          } catch {}
          break;
        }
        case 'image': {
          const im = it as MixedItemImage;

          // 设置对齐方式 - 支持从 style 读取
          const a = this.alignToImin(im.style);
          console.log('--------对其image', a);
          try {
            this.sdk.setAlignment(a);
          } catch {}

          // 处理图片数据
          let dataUri = im.base64 || '';
          if (dataUri && !/^data:/i.test(dataUri)) {
            dataUri = 'data:image/png;base64,' + dataUri;
          }

          // 可选：根据传入的 maxWidth 或 options.maxWidth 设置打印宽度
          const desiredWidth =
            (typeof im.maxWidth === 'number' ? im.maxWidth : undefined) ??
            (im as any)?.options?.maxWidth;
          if (typeof desiredWidth === 'number') {
            try {
              const w = Math.max(0, Math.min(576, desiredWidth));
              this.sdk.setTextWidth(w);
              console.log('------------setTextWidth', w);
            } catch {}
          }

          // 打印图片
          try {
            const alignMode = this.alignToImin(im.style);
            await this.sdk.printSingleBitmap(dataUri, alignMode);
          } catch {}

          // 重置打印宽度为默认（0 表示由设备恢复默认宽度）
          try {
            this.sdk.setTextWidth(0);
          } catch {}

          // 重置对齐方式
          try {
            this.sdk.setAlignment(0);
          } catch {}
          break;
        }
        case 'hr': {
          const hr = it as MixedItemHR;
          const ch = hr.char ?? '-';
          const len = hr.width ?? 32;
          const line = (ch === '=' || ch === '*' ? ch : '-').repeat(
            Math.min(48, len),
          );
          try {
            this.sdk.printText(line, 0);
          } catch {}
          break;
        }
        case 'space': {
          const sp = it as MixedItemSpace;
          const n = sp.lines ?? 1;
          try {
            for (let i = 0; i < n; i++) this.sdk.printAndLineFeed();
          } catch {}
          break;
        }
        case 'raw': {
          // IMIN不支持ESC/POS原始数据，忽略
          break;
        }
      }
    }
    if (options?.cut) {
      try {
        this.sdk.partialCutPaper();
      } catch {}
    }
    return true;
  }
  /**
   * 获取 IMIN 打印机状态
   * @returns Promise<any> 打印机状态信息
   */
  async getPrinterStatus(): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('打印机未连接，无法获取状态');
    }

    if (!this.sdk || typeof this.sdk.getPrinterStatus !== 'function') {
      throw new Error('IMIN SDK 不支持状态查询');
    }

    try {
      // 调用底层 IMIN SDK 的 getPrinterStatus 方法
      const status = await this.sdk.getPrinterStatus(
        this.opts.printerType || 'SPI',
      );
      console.log('IMIN打印机状态查询结果:', status);
      return status;
    } catch (error: any) {
      console.error('IMIN打印机状态查询失败:', error);
      throw new Error(`IMIN打印机状态查询失败: ${error.message}`);
    }
  }
}

export default IminWebSocketPrinterDriver;
