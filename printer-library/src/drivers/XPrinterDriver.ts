/**
 * XPrinter (XinYe) 原生 SDK 驱动封装
 * 
 * 职责：
 * 1. 通过原生模块 `XPrinterModule` 建立/保持连接
 * 2. 把上层 Mixed 打印项翻译成原生接口调用
 * 3. 将打印机配置落盘，方便队列或下次启动复用
 * 4. 支持多设备并行（每个 printerId 对应一个独立实例）
 * 5. 实现 IPrinterDriver 统一接口
 */

import {NativeEventEmitter, NativeModules} from 'react-native';
import type { IPrinterDriver } from '../core/IPrinterDriver';
import type { MixedItem, PrintOptions, ConnectionType } from '../core/types';

const {XPrinterModule} = NativeModules as any;

export type XpConnectType = ConnectionType;

export interface XPrinterDriverOptions {
  connectType: XpConnectType; // usb|net|bt|serial
  address: string; // 原生 connect(...) 方法需要的地址字符串
  retryCount?: number;
  retryDelay?: number;
  autoReconnect?: boolean;
}

/**
 * XPrinterDriver - XPrinter 原生打印机驱动
 * 实现 IPrinterDriver 接口
 */
export default class XPrinterDriver implements IPrinterDriver {
  private opts: XPrinterDriverOptions;
  private _isConnected: boolean = false;
  private emitter?: NativeEventEmitter;
  private sub?: any;
  private reconnecting: boolean = false;
  private printerId?: string; // 存储当前打印机 ID

  constructor(opts: XPrinterDriverOptions) {
    // 默认重试 3 次、800ms 间隔，并开启自动重连
    this.opts = {retryCount: 3, retryDelay: 800, autoReconnect: true, ...opts};
    if (!XPrinterModule) {
      throw new Error(
        'XPrinterModule not linked. Please ensure android module is installed.',
      );
    }
    // 监听原生连接事件：后续 connect() 会订阅，用于更新连接状态。
    this.emitter = new NativeEventEmitter(XPrinterModule);
  }

  /**
   * 对齐方式转整数
   */
  private alignToInt(alignment?: 'left' | 'center' | 'right'): number {
    switch (alignment) {
      case 'center':
        return 1;
      case 'right':
        return 2;
      default:
        return 0;
    }
  }

  async connect(printerId?: string): Promise<boolean> {
    // 保存 printerId
    if (printerId) {
      this.printerId = printerId;
    }

    if (this._isConnected) {
      return true;
    }
    try {
      await XPrinterModule.init();
    } catch {}

    // Subscribe once to connection events to maintain status
    if (!this.sub && this.emitter) {
      this.sub = this.emitter.addListener('XPrinterConnect', (evt: any) => {
        // SDK emits code/message; code==0 typically success
        const ok = evt && typeof evt.code === 'number' ? evt.code === 0 : false;
        // 只更新属于当前打印机的事件
        if (!evt.printerId || evt.printerId === this.printerId) {
          this._isConnected = ok;
        }
        // if (!ok) {
        //   // 失败时触发自动重连
        //   this.scheduleReconnect(printerId);
        // }
      });
    }

    const max = 3;
    for (let attempt = 0; attempt <= max; attempt++) {
      try {
        let newContent = '';
        switch (this.opts.connectType) {
          case 'TCP':
            newContent = 'network';
            break;
          case 'USB':
            newContent = 'usb';
            break;
          case 'Bluetooth':
            newContent = 'bt';
            break;
          case 'Serial':
            newContent = 'serial';
            break;
          default:
            newContent = this.opts.connectType;
            break;
        }
        const res = await XPrinterModule.connect(
          newContent,
          this.opts.address,
          this.printerId,
        );
        console.log('------------connect XPrinter res', res,newContent,this.opts.address,this.printerId);

        this._isConnected = true;
        this.reconnecting = false;

        // ✅ 注意：打印机配置现在由外部（主项目）管理
        // 外部应使用 PrinterConfigManager.addPrinter() 保存配置
        console.log(`✅ XPrinter ${printerId || 'unknown'} 连接成功`);

        return true;
      } catch (e) {
        console.log('--------SavePrinter XPrinter error', e);

        if (attempt === max) break;
        await new Promise(r => setTimeout(r, this.opts.retryDelay ?? 800));
      }
    }
    this._isConnected = false;
    this.reconnecting = false;
    return false;
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.close();
  }

  /**
   * 关闭驱动
   */
  close(): void {
    try {
      XPrinterModule.disconnect(this.printerId);
    } catch {}
    this._isConnected = false;
    this.reconnecting = false;
    if (this.sub) {
      try {
        this.sub.remove();
      } catch {}
      this.sub = undefined;
    }
  }

  /**
   * 文本样式转参数
   */
  private textStyleToArgs(style?: any): {
    alignment: number;
    fontStyle: number;
    size: number;
  } {
    const alignment = this.alignToInt(style?.align);
    const POSConst = {
      FNT_BOLD: 0x08,
      FNT_UNDERLINE: 0x80,
    };
    // const fontStyle = style?.bold ? 0x08 : 0;
    const fontStyle =
      (style?.bold ? POSConst.FNT_BOLD : 0) |
      (style?.underline ? POSConst.FNT_UNDERLINE : 0);

    const escSize = (width = 1, height = 1) => {
      const clamp = (v: number) => Math.max(1, Math.min(8, v));
      const w = clamp(width) - 1;
      const h = clamp(height) - 1;
      return (w << 4) | h;
    };
    const size = escSize(style?.width || 1, style?.height || 1);
    return {alignment, fontStyle, size};
  }

  /**
   * 条形码类型映射
   */
  private mapBarcodeType(t: string): number {
    const POS_BARCODE_TYPE = {
      UPCA: 65,
      UPCE: 66,
      EAN13: 67,
      JAN13: 67,
      EAN8: 68,
      JAN8: 68,
      ITF: 70,
      CODABAR: 71,
      CODE39: 69,
      CODE93: 72,
      CODE128: 73,
    };
    switch (t) {
      case 'UPC_A':
        return POS_BARCODE_TYPE.UPCA;
      case 'EAN13':
        return POS_BARCODE_TYPE.EAN13;
      case 'EAN8':
        return POS_BARCODE_TYPE.EAN8;
      case 'CODE39':
        return POS_BARCODE_TYPE.CODE39;
      case 'CODE128':
        return POS_BARCODE_TYPE.CODE128;
      case 'CODE93':
        return POS_BARCODE_TYPE.CODE93;
      case 'ITF':
        return POS_BARCODE_TYPE.ITF;
      case 'CODABAR':
        return POS_BARCODE_TYPE.CODABAR;
      case 'JAN13':
        return POS_BARCODE_TYPE.JAN13;
      case 'JAN8':
        return POS_BARCODE_TYPE.JAN8;
      case 'UPCE':
        return POS_BARCODE_TYPE.UPCE;
      default:
        return POS_BARCODE_TYPE.CODE128;
    }
  }

  /**
   * 打印混合内容
   */
  async printMixed(
    items: MixedItem[],
    options?: PrintOptions,
  ): Promise<boolean> {
    console.log('------------XPrinterDriver printMixed ', items, options);

    try {
      await this.ensureConnected(options?.printerId);
      await XPrinterModule.escInitializePrinter?.(this.printerId);
      // await XPrinterModule.escSetPrintArea(576, 800, null, null, this.printerId)
      if (options?.pulse) {
        await XPrinterModule.escOpenCashDrawer(1, this.printerId);
      }
      // 遍历 Mixed 队列，将高层语义转成原生 ESC/POS 调用。
      // 注意：此处完全串行执行，保持与原 SDK 行为一致，避免打印指令乱序。
      for (const it of items) {
        console.log('------------printMixed it', it);

        switch (it.kind) {
          case 'text': {
            const t = it as Extract<MixedItem, { kind: 'text' }>;
            const args = this.textStyleToArgs(t.style);
            await XPrinterModule.escPrintText(
              t.content + '\n' || '',
              args.alignment,
              args.fontStyle,
              args.size,
              this.printerId,
            );
            break;
          }
          case 'qr': {
            const q = it as Extract<MixedItem, { kind: 'qr' }>;
            const options = {
              size: q.size ?? 8,
              align: this.alignToInt(q.style?.align),
              ec: q.ec ?? 49,
            };
            await XPrinterModule.escPrintQRCode(
              q.content || '',
              options,
              this.printerId,
            );
            break;
          }
          case 'barcode': {
            await XPrinterModule.escInitializePrinter?.(this.printerId);
            const b = it as Extract<MixedItem, { kind: 'barcode' }>;
            const type = this.mapBarcodeType(b.opts.type);
            let newContent = b.content || '';
            if (type === 73) {
              newContent = '{B' + b.content;
            }
            const align = this.alignToInt(b.style?.align);
            const hri = b.opts.text ? 2 : 0;
            await XPrinterModule.escPrintBarcode(
              newContent || '',
              type,
              {
                ...b.opts,
                align,
                hri,
              },
              this.printerId,
            );
            break;
          }
          case 'image': {
            const im = it as Extract<MixedItem, { kind: 'image' }>;
            const align = this.alignToInt(im.style?.align);
            const maxWidth = im.options?.maxWidth ?? 576;
            // Use base64 printing helper exposed by native module
            await XPrinterModule.escPrintBitmapBase64(
              im.base64 || '',
              align,
              maxWidth,
              this.printerId,
            );
            break;
          }
          case 'hr': {
            const hr = it as Extract<MixedItem, { kind: 'hr' }>;
            const ch = hr.char ?? '-';
            const len = hr.width ?? 32;
            const line = (ch === '=' || ch === '*' ? ch : '-').repeat(
              Math.min(48, Math.max(0, len)),
            );
            await XPrinterModule.escPrintString(line, this.printerId);
            break;
          }
          case 'space': {
            const sp = it as Extract<MixedItem, { kind: 'space' }>;
            const n = sp.lines ?? 1;
            for (let i = 0; i < n; i++) {
              await XPrinterModule.escPrintString('\n', this.printerId);
            }
            break;
          }
          case 'cashDrawer': {
            const drawer = it as Extract<MixedItem, { kind: 'cashDrawer' }>;
            await XPrinterModule.escOpenCashDrawer(
              drawer.pin ?? 0,
              this.printerId,
            );
            break;
          }

          case 'raw': {
            // No direct raw support via this driver; ignore
            break;
          }
        }
      }

      if (options?.cut) {
        console.log('------------printMixed cut');
        await XPrinterModule.escFeedAndCut(8, this.printerId);
      }
      return true;
    } catch (error) {
      console.log('------------printMixed error', error);
      return false;
    }
  }

  private async ensureConnected(printerId?: string): Promise<void> {
    if (!this.isConnected()) {
      const ok = await this.connect(printerId);
      if (!ok) {
        throw new Error(
          `无法连接到 XPrinter 打印机: ${printerId ?? this.opts.address}`,
        );
      }
    }
  }

  scheduleReconnect(printerId?: string) {
    if (this.reconnecting || this.opts.autoReconnect === false) {
      return;
    }
    this.reconnecting = true;
    // 通过简单的延迟重试机制，提升不稳定连接的容忍度。
    setTimeout(async () => {
      try {
        await this.connect(printerId);
      } catch (error) {
        console.log('------------scheduleReconnect error', error);
      }
    }, this.opts.retryDelay ?? 800);
  }
  /**
   * 获取打印机状态（使用 printerStatusII）
   * 
   * 返回状态码说明：
   * - 0: 正常
   * - 1: 缺纸/纸将尽
   * - 2: 打印机离线（盖子打开）
   * - 3: 打印机错误（切刀错误、过热等）
   * - 4: 连接超时或未连接
   * 
   * @returns Promise<number> 状态码
   */
  async getPrinterStatus(type?: string): Promise<number> {
    try {
      // 先检查连接状态
      if (!this._isConnected) {
        console.log('XP打印机未连接');
        return 4;
      }

      // 调用 printerStatusII 获取状态
      const status = await XPrinterModule.printerStatusII(this.printerId);
      
      console.log('XP打印机状态码:', status);

      // 处理特殊返回值
      if (status === -3) {
        console.log('XP打印机连接已断开');
        this._isConnected = false;
        return 4;
      }

      if (status === -4) {
        console.log('XP打印机状态查询超时');
        return 4;
      }

      // 解析状态位
      const statusInfo = this.parseStatusBits(status);
      console.log('XP打印机状态详情:', statusInfo);

      // 按优先级检查错误状态
      // 1. 检查缺纸
      if (statusInfo.paperOut || statusInfo.paperNearEnd) {
        console.log('XP缺纸或纸将尽');
        return 1;
      }

      // 2. 检查盖子打开
      if (statusInfo.coverOpen) {
        console.log('XP打印机盖子打开');
        return 2;
      }

      // 3. 检查其他错误
      if (statusInfo.cutterError) {
        console.log('XP切刀错误');
        return 3;
      }

      if (statusInfo.headOverheat) {
        console.log('XP打印头过热');
        return 3;
      }

      if (statusInfo.otherError) {
        console.log('XP其他错误');
        return 3;
      }

      // 打印中也视为正常（不阻塞后续打印任务）
      if (statusInfo.printing) {
        console.log('XP打印机正在打印');
      }

      // 都没命中，视为正常
      console.log('XP打印机状态正常');
      return 0;
    } catch (error) {
      console.log('XP获取打印机状态失败:', error);
      return 4;
    }
  }

  /**
   * 解析状态位标志
   * @private
   */
  private parseStatusBits(status: number): {
    printing: boolean;
    coverOpen: boolean;
    paperOut: boolean;
    paperNearEnd: boolean;
    drawerOpen: boolean;
    otherError: boolean;
    cutterError: boolean;
    headOverheat: boolean;
  } {
    return {
      printing: (status & 0x01) !== 0,        // 位 0
      coverOpen: (status & 0x02) !== 0,       // 位 1
      paperOut: (status & 0x04) !== 0,        // 位 2
      paperNearEnd: (status & 0x08) !== 0,    // 位 3
      drawerOpen: (status & 0x10) !== 0,      // 位 4
      otherError: (status & 0x20) !== 0,      // 位 5
      cutterError: (status & 0x40) !== 0,     // 位 6
      headOverheat: (status & 0x80) !== 0,    // 位 7
    };
  }

  /**
   * 获取原始状态码（不经过解析）
   * 
   * 返回值说明：
   * - 正数: 状态位标志（可以用位运算检查）
   * - -3: 连接已断开
   * - -4: 查询超时
   * 
   * @returns Promise<number> 原始状态码
   */
  async printerStatusII(): Promise<number> {
    try {
      if (!this._isConnected) {
        console.log('XP打印机未连接');
        return -3;
      }

      const status = await XPrinterModule.printerStatusII(this.printerId);
      console.log('XP原始状态码:', status);

      // 如果返回 -3，更新连接状态
      if (status === -3) {
        this._isConnected = false;
      }

      return status;
    } catch (error) {
      console.log('XP printerStatusII 错误:', error);
      return -4;
    }
  }

  /**
   * 检查打印机是否处于正常状态（可以打印）
   * 
   * @returns Promise<boolean> true=可以打印, false=有错误
   */
  async isPrinterReady(): Promise<boolean> {
    const status = await this.printerStatusII();
    
    // 负数表示连接或超时错误
    if (status < 0) {
      return false;
    }

    // 检查是否有阻塞性错误状态
    const hasBlockingError = 
      (status & 0x02) !== 0 ||  // 开盖
      (status & 0x04) !== 0 ||  // 缺纸
      (status & 0x20) !== 0 ||  // 其他错误
      (status & 0x40) !== 0 ||  // 切刀错误
      (status & 0x80) !== 0;    // 打印头过热

    return !hasBlockingError;
  }
}
