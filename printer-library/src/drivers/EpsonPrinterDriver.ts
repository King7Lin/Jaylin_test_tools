/**
 * Epson ePOS2 SDK 驱动封装
 * 
 * 职责：
 * 1. 桥接 Android 原生模块 `EpsonPrinterModule`
 * 2. 提供 Mixed.printMixed 兼容的 API
 * 3. 实现 IPrinterDriver 统一接口
 */

import {NativeEventEmitter, NativeModules} from 'react-native';
import {SmartEncoder} from '../SmartEncoder';
import type { IPrinterDriver } from '../core/IPrinterDriver';
import type { MixedItem, PrintOptions, ConnectionType } from '../core/types';

// 直接访问常量（同步）

const {EpsonPrinterModule} = NativeModules as any;
// const seriesList = EpsonPrinterModule.SERIES;
// const langList = EpsonPrinterModule.MODEL;
// console.log('------------epson series', series);
// console.log('------------epson lang', lang);

export type EpsonConnectType = ConnectionType;

export interface EpsonPrinterDriverOptions {
  // 打印机型号系列（如 TM_M30, TM_T88 等）
  series: number;
  // 语言模型（如 MODEL_CHINESE, MODEL_TAIWAN 等）
  lang: number;
  // 连接类型
  EpsonConnectType: EpsonConnectType;
  // 连接地址（如 "192.168.1.100" for TCP, "00:11:22:33:44:55" for BT）
  address: string;
  // 连接端口（仅 TCP 使用，默认 9100）
  port?: number;
  // 重试次数
  retryCount?: number;
  // 重试延迟（毫秒）
  retryDelay?: number;
}

/**
 * EpsonPrinterDriver - Epson ePOS2 打印机驱动
 * 实现 IPrinterDriver 接口
 */
export default class EpsonPrinterDriver implements IPrinterDriver {
  private opts: EpsonPrinterDriverOptions;
  private _isConnected: boolean = false;
  private emitter?: NativeEventEmitter;
  private sub?: any;
  private printerId?: string;

  // 缓存常量
  private constants: any = null;

  constructor(opts: EpsonPrinterDriverOptions) {
    console.log('-----------epson opts', opts);
    
    // ✅ 在这里获取常量映射
    const seriesList = EpsonPrinterModule.SERIES || {};
    const langList = EpsonPrinterModule.MODEL || {};
    console.log('打印机系列:', EpsonPrinterModule.SERIES);
    console.log('字体:', EpsonPrinterModule.FONT);
    console.log('语言:', EpsonPrinterModule.LANG);
    console.log('模型:', EpsonPrinterModule.MODEL);
    console.log('ALIGN:', EpsonPrinterModule.ALIGN);
    console.log('COLOR:', EpsonPrinterModule.COLOR);
    console.log('SYMBOL:', EpsonPrinterModule.SYMBOL);
    console.log('langList:', EpsonPrinterModule.MODEL);
    const seriesValue =
      typeof opts.series === 'string' ? seriesList[opts.series] : opts.series;

    const langValue =
      typeof opts.lang === 'string' ? langList[opts.lang] : opts.lang;
    if (seriesValue === undefined) {
      throw new Error(
        `Invalid series: ${opts.series}. Available: ${Object.keys(
          seriesList,
        ).join(', ')}`,
      );
    }

    if (langValue === undefined) {
      throw new Error(
        `Invalid lang: ${opts.lang}. Available: ${Object.keys(langList).join(
          ', ',
        )}`,
      );
    }
    this.opts = {
      retryCount: 3,
      retryDelay: 800,
      // port: 9100,
      ...opts,
      series: seriesValue, // ✅ 使用转换后的数字值
      lang: langValue,
    };

    if (!EpsonPrinterModule) {
      throw new Error(
        'EpsonPrinterModule not linked. Please ensure android module is installed.',
      );
    }

    this.emitter = new NativeEventEmitter(EpsonPrinterModule);
    // this.printerId = `epson_${Date.now()}_${Math.random()
    //   .toString(36)
    //   .substr(2, 9)}`;
  }

  /**
   * 初始化并加载常量
   * getConstants() 现在是同步的，直接从 NativeModule 获取
   */
  private ensureConstants(): void {
    if (!this.constants) {
      // React Native 的 getConstants() 是同步的，直接访问
      this.constants = EpsonPrinterModule.getConstants
        ? EpsonPrinterModule.getConstants()
        : EpsonPrinterModule;
      console.log(
        '[EpsonPrinterDriver] Constants loaded:',
        Object.keys(this.constants || {}),
      );
    }
  }

  /**
   * 对齐方式转换
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

  /**
   * 条形码类型映射
   */
  private mapBarcodeType(t: string): number {
    const mapping: Record<string, number> = {
      UPC_A: 0,
      UPC_E: 1,
      EAN13: 2,
      EAN8: 3,
      CODE39: 4,
      ITF: 5,
      CODABAR: 6,
      CODE93: 7,
      CODE128: 8,
    };
    return mapping[t] ?? 4; // 默认 CODE39
  }

  /**
   * 纠错级别映射
   */
  private mapErrorCorrectionLevel(ec?: number): number {
    // 0=L, 1=M, 2=Q, 3=H
    return ec ?? 1; // 默认 M
  }

  /**
   * 格式化连接地址
   */
  private formatConnectionTarget(): string {
    switch (this.opts.EpsonConnectType) {
      case 'TCP':
        return `TCP:${this.opts.address}`;
      case 'Bluetooth':
        return `BT:${this.opts.address}`;
      case 'USB':
        return `USB:${this.opts.address}`;
      default:
        return this.opts.address;
    }
  }

  /**
   * 连接打印机
   */
  async connect(printerId?: string): Promise<boolean> {
    console.log('------------epson connect 000');
    this.ensureConstants();
    console.log('------------epson connect 111',this.formatConnectionTarget());
    if (printerId) {
      this.printerId = printerId;
    }
    // 订阅连接事件
    if (!this.sub && this.emitter) {
      this.sub = this.emitter.addListener('EpsonPrinterStatus', (evt: any) => {
        // code=0 表示成功
        if (evt && evt.printerId === this.printerId) {
          if (evt.code === 0) {
            this._isConnected = true;
          }
        }
      });
    }

    const max = this.opts.retryCount ?? 3;
    const targetPrinterId = printerId || this.printerId;

    for (let attempt = 0; attempt <= max; attempt++) {
      try {
        // 初始化打印机
        await EpsonPrinterModule.initializePrinter(
          this.opts.series,
          this.opts.lang,
          targetPrinterId,
        );
        // 连接
        const target = this.formatConnectionTarget();
        const res = await EpsonPrinterModule.connect(
          target,
          null,
          targetPrinterId,
        );
        console.log('------------epson connect 222 res', res,target);

        this._isConnected = true;

        // ✅ 注意：打印机配置现在由外部（主项目）管理
        // 外部应使用 PrinterConfigManager.addPrinter() 保存配置
        console.log(`✅ Epson打印机 ${printerId || 'unknown'} 连接成功`);

        return true;
      } catch (e) {
        console.log('------------epson connect error', e);

        if (attempt === max) break;
        await new Promise(r => setTimeout(r, this.opts.retryDelay ?? 800));
      }
    }

    this._isConnected = false;
    return false;
  }

  /**
   * 检查是否已连接
   */
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
      EpsonPrinterModule.disconnect(this.printerId);
      EpsonPrinterModule.finalizePrinter(this.printerId);
    } catch {}

    this._isConnected = false;

    if (this.sub) {
      try {
        this.sub.remove();
      } catch {}
      this.sub = undefined;
    }
  }

  /**
   * 打印混合内容
   */
  async printMixed(
    items: MixedItem[],
    options?: PrintOptions,
  ): Promise<boolean> {
    const targetPrinterId = options?.printerId || this.printerId;
    console.log('------------epson printMixed 000', targetPrinterId, items);
    // 确保已连接
    if (!this.isConnected()) {
      const ok = await this.connect(targetPrinterId);
      if (!ok) return false;
    }
    this.ensureConstants();
    try {
      // 初始化（设置默认语言）
      if (options?.init !== false) {
        await EpsonPrinterModule.addTextLang(
          this.constants.LANG.ZH_CN,
          targetPrinterId,
        );
      }
      if (options?.pulse) {
        await EpsonPrinterModule.addPulse(null, null, this.printerId);
      }

      // 处理每个打印项
      for (const it of items) {
        switch (it.kind) {
          case 'text': {
            const t = it as Extract<MixedItem, { kind: 'text' }>;
            // 设置字体
            await EpsonPrinterModule.addTextFont(
              this.constants.FONT.B,
              targetPrinterId,
            );
            // 设置样式
            const bold = t.style?.bold
              ? this.constants.TRUE
              : this.constants.FALSE;
            const underline = t.style?.underline
              ? this.constants.TRUE
              : this.constants.FALSE;
            const reverse = t.style?.reverse
              ? this.constants.TRUE
              : this.constants.FALSE;

            const color =
              t.style?.color === 'red'
                ? this.constants.COLOR.COLOR_2
                : this.constants.COLOR.COLOR_1;

            if (
              t.style?.bold ||
              t.style?.underline ||
              t.style?.reverse ||
              t.style?.color
            ) {
              await EpsonPrinterModule.addTextStyle(
                bold,
                underline,
                reverse,
                color,
                targetPrinterId,
              );
            }
            // 设置大小
            const width = t.style?.width ?? 1;
            const height = t.style?.height ?? 1;
            await EpsonPrinterModule.addTextSize(
              width,
              height,
              targetPrinterId,
            );

            // 设置对齐
            if (t.style?.align) {
              await EpsonPrinterModule.addTextAlign(
                this.alignToInt(t.style.align),
                targetPrinterId,
              );
            }
            // 设置语言
            await EpsonPrinterModule.addTextLang(
              this.constants.LANG.ZH_CN,
              targetPrinterId,
            );

            // 添加文本
            await EpsonPrinterModule.addText(
              t.content + '\n' || '',
              'UTF-8',
              targetPrinterId,
            );

            // 重置样式
            // if (width > 1 || height > 1) {
            //   await EpsonPrinterModule.addTextSize(1, 1, targetPrinterId);
            // }
            if (t.style?.bold || t.style?.underline || t.style?.reverse) {
              await EpsonPrinterModule.addTextStyle(
                this.constants.FALSE,
                this.constants.FALSE,
                this.constants.FALSE,
                this.constants.COLOR.COLOR_1,
                targetPrinterId,
              );
            }
            if (t.style?.align) {
              await EpsonPrinterModule.addTextAlign(0, targetPrinterId);
            }
            break;
          }

          // case 'qr': {
          //   const q = it as MixedItemQR;

          //   // 设置对齐
          //   if (q.style?.align) {
          //     await EpsonPrinterModule.addTextAlign(
          //       this.alignToInt(q.style.align),
          //       targetPrinterId,
          //     );
          //   }

          //   // 添加二维码
          //   const size = q.size ?? 8;
          //   const level = this.mapErrorCorrectionLevel(q.ec);

          //   await EpsonPrinterModule.addSymbol(
          //     q.content || '', // data
          //     this.constants.SYMBOL.QRCODE_MODEL_2, // type
          //     level, // level
          //     null, // width (使用 size 时可以为 null)
          //     null, // height (使用 size 时可以为 null)
          //     size, // size ✅ 正确位置
          //     targetPrinterId, // printerId
          //   );

          //   // 重置对齐
          //   if (q.style?.align) {
          //     await EpsonPrinterModule.addTextAlign(0, targetPrinterId);
          //   }
          //   break;
          // }

          case 'barcode': {
            const b = it as Extract<MixedItem, { kind: 'barcode' }>;

            // 设置对齐
            if (b.style?.align) {
              await EpsonPrinterModule.addTextAlign(
                this.alignToInt(b.style.align),
                targetPrinterId,
              );
            }

            // 添加条形码
            const type = this.mapBarcodeType(b.opts.type);
            const height = b.opts.height ?? 162;
            const width = b.opts.width ?? 3;
            const hri =
              b.opts.text && b.opts.text !== 'none'
                ? this.constants.HRI.BELOW
                : this.constants.HRI.NONE;

            await EpsonPrinterModule.addBarcode(
              b.content || '',
              type,
              hri,
              this.constants.FONT.A,
              width,
              height,
              targetPrinterId,
            );

            // 重置对齐
            if (b.style?.align) {
              await EpsonPrinterModule.addTextAlign(0, targetPrinterId);
            }
            break;
          }

          case 'image': {
            const im = it as Extract<MixedItem, { kind: 'image' }>;

            // 设置对齐
            if (im.style?.align) {
              await EpsonPrinterModule.addTextAlign(
                this.alignToInt(im.style.align),
                targetPrinterId,
              );
            }

            // 添加图片
            await EpsonPrinterModule.addImageBase64(
              im.base64 || '',
              null, // x
              null, // y
              null, // width (auto)
              null, // height (auto)
              this.constants.COLOR.COLOR_1,
              this.constants.MODE.MONO,
              this.constants.HALFTONE.DITHER,
              1.0, // brightness
              this.constants.COMPRESS.AUTO,
              targetPrinterId,
            );

            // 重置对齐
            if (im.style?.align) {
              await EpsonPrinterModule.addTextAlign(0, targetPrinterId);
            }
            break;
          }

          case 'hr': {
            const hr = it as Extract<MixedItem, { kind: 'hr' }>;
            const ch = hr.char ?? '-';
            const len = hr.width ?? 32;
            const line = (ch === '=' || ch === '*' ? ch : '-').repeat(
              Math.min(48, Math.max(0, len)),
            );
            await EpsonPrinterModule.addText(
              `${line}\n`,
              'UTF-8',
              targetPrinterId,
            );
            break;
          }

          case 'space': {
            const sp = it as Extract<MixedItem, { kind: 'space' }>;
            const n = sp.lines ?? 1;
            await EpsonPrinterModule.addFeedLine(n, targetPrinterId);
            break;
          }

          case 'raw': {
            // Epson SDK 不直接支持原始字节，跳过
            break;
          }
        }
      }
      console.log('------------epson printMixed111 1000');
      // 切纸
      if (options?.cut) {
        await EpsonPrinterModule.addCut(
          this.constants.CUT.FEED,
          targetPrinterId,
        );
      }
      console.log('------------epson printMixed111 10002');
      // 发送数据
      await EpsonPrinterModule.sendData(null, targetPrinterId);
      console.log('------------epson printMixed111 10003');
      // 等待打印完成
      // return await new Promise(resolve => {
      //   const timeout = setTimeout(() => {
      //     listener?.remove();
      //     resolve(true); // 超时也认为成功
      //   }, 30000); // 30秒超时

      //   const listener = this.emitter?.addListener(
      //     'EpsonPrinterStatus',
      //     (evt: any) => {
      //       if (evt && evt.printerId === targetPrinterId) {
      //         clearTimeout(timeout);
      //         listener?.remove();
      //         resolve(evt.code === 0);
      //       }
      //     },
      //   );
      // });
      return true
    } catch (e: any) {
      console.error('EpsonPrinterDriver.printMixed error:', {
        name: e?.constructor?.name,
        message: e?.message,
        code: e?.code,
        userInfo: e?.userInfo,
        printerId: targetPrinterId,
        itemsCount: items?.length,
      });
      return false;
    }
  }

  /**
   * 清空命令缓冲区
   */
  async clearBuffer(): Promise<void> {
    try {
      await EpsonPrinterModule.clearCommandBuffer(this.printerId);
    } catch {}
  }
}
