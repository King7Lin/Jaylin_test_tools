/**
 * EscPosDriver - ESC/POS 标准打印机驱动封装
 * 封装 Printer 模块，提供统一的驱动接口
 */
import Printer from '../Printer';
import ByteCommands from '../ByteCommands';
import {smartEncodeToBytes} from '../ByteCommands';
import type { IPrinterDriver } from '../core/IPrinterDriver';
import type { MixedItem, PrintOptions, ConnectionType } from '../core/types';

export interface EscPosDriverOptions {
  type: ConnectionType;
  target: string; // IP:端口 或 MAC地址
  baudRate?: number;
  timeout?: number;
  name?: string;
}

/**
 * 辅助函数：ESC/POS 字符串转字节数组
 */
function escposStringToBytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
  return bytes;
}

/**
 * EscPosDriver - ESC/POS 标准打印机驱动
 * 实现 IPrinterDriver 接口
 */
export default class EscPosDriver implements IPrinterDriver {
  private opts: EscPosDriverOptions;
  private _isConnected: boolean = false;
  private printerId?: string;

  constructor(opts: EscPosDriverOptions) {
    this.opts = opts;
  }

  /**
   * 连接打印机
   */
  async connect(printerId: string): Promise<boolean> {
    try {
      this.printerId = printerId;

      // 检查是否已连接
      const connected = await Printer.isPrinterConnected(printerId);
      
      if (connected) {
        console.log(`ESC/POS 打印机 ${printerId} 已连接`);
        this._isConnected = true;
        return true;
      }

      // 尝试连接
      console.log(`ESC/POS 正在连接打印机 ${printerId}...`);
      const result = await Printer.connectPrinter(printerId, {
        type: this.opts.type,
        target: this.opts.target,
        name: this.opts.name,
        baudRate: this.opts.baudRate,
        timeout: this.opts.timeout || 5000,
      });

      this._isConnected = result;
      console.log(`ESC/POS 连接结果: ${result}`);
      return result;
    } catch (error) {
      console.error(`ESC/POS 连接失败:`, error);
      this._isConnected = false;
      return false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.printerId) {
      try {
        await Printer.disconnectPrinter(this.printerId);
        this._isConnected = false;
        console.log(`ESC/POS 打印机 ${this.printerId} 已断开`);
      } catch (error) {
        console.error(`ESC/POS 断开连接失败:`, error);
      }
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * 获取打印机状态
   */
  async getPrinterStatus(): Promise<any> {
    if (!this.printerId) {
      throw new Error('打印机未初始化');
    }

    try {
      return await Printer.getPrinterStatus(this.printerId);
    } catch (error) {
      console.error('获取打印机状态失败:', error);
      throw error;
    }
  }

  /**
   * 混合内容打印
   */
  async printMixed(
    items: MixedItem[],
    options: PrintOptions = {},
  ): Promise<boolean> {
    const printerId = options.printerId || this.printerId;
    if (!printerId) {
      throw new Error('打印机 ID 未指定');
    }

    // 确保连接
    if (!this._isConnected) {
      const connected = await this.connect(printerId);
      if (!connected) {
        throw new Error('打印机未连接');
      }
    }

    try {
      // 初始化
      if (options.init !== false) {
        await Printer.sendRawBytesToPrinter(printerId, ByteCommands.init());
      }

      // 脉冲（开钱箱）
      if (options.pulse) {
        await Printer.sendRawBytesToPrinter(printerId, ByteCommands.pulse());
      }

      // 使用智能文本编码
      if (options.smartText) {
        await this.printMixedWithSmartText(printerId, items);
      } else {
        await this.printMixedStandard(printerId, items);
      }

      // 切纸
      if (options.cut) {
        await Printer.sendRawBytesToPrinter(
          printerId,
          [0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a], // 进纸
        );
        await Printer.sendRawBytesToPrinter(printerId, ByteCommands.cut(true));
      }

      console.log(`✅ ESC/POS 打印完成: ${printerId}`);
      return true;
    } catch (error) {
      console.error(`❌ ESC/POS 打印失败:`, error);
      return false;
    }
  }

  /**
   * 智能文本编码打印
   */
  private async printMixedWithSmartText(
    printerId: string,
    items: readonly MixedItem[],
  ): Promise<void> {
    const pendingLines: string[] = [];

    const flushText = async () => {
      if (pendingLines.length === 0) return;
      try {
        const bytes = smartEncodeToBytes(pendingLines);
        await Printer.sendRawBytesToPrinter(printerId, bytes);
      } finally {
        pendingLines.length = 0;
      }
    };

    for (const it of items) {
      switch (it.kind) {
        case 'text': {
          const textItem = it as Extract<MixedItem, { kind: 'text' }>;
          const textContent = textItem.content ?? '';

          if (textItem.style) {
            await flushText();
            const styleBytes = ByteCommands.applyStyle(textItem.style);
            await Printer.sendRawBytesToPrinter(printerId, styleBytes);
            pendingLines.push(textContent);
          } else {
            pendingLines.push(textContent);
          }
          break;
        }

        case 'hr':
          await flushText();
          {
            const hr = it as Extract<MixedItem, { kind: 'hr' }>;
            const ch = hr.char ?? '-';
            const len = hr.width ?? 32;
            const line = (ch === '=' || ch === '*' ? ch : '-').repeat(
              Math.max(0, len),
            );
            await Printer.sendRawBytesToPrinter(
              printerId,
              ByteCommands.textLine(line, 'ascii'),
            );
          }
          break;

        case 'space':
          await flushText();
          await Printer.sendRawBytesToPrinter(
            printerId,
            ByteCommands.feed((it as Extract<MixedItem, { kind: 'space' }>).lines ?? 1),
          );
          break;

        case 'qr': {
          await flushText();
          const q = it as Extract<MixedItem, { kind: 'qr' }>;
          const align = q.style?.align;
          if (align)
            await Printer.sendRawBytesToPrinter(
              printerId,
              ByteCommands.setAlign(align),
            );
          await Printer.sendRawBytesToPrinter(
            printerId,
            ByteCommands.qrcode(q.content, q.size, q.ec),
          );
          break;
        }

        case 'barcode': {
          await flushText();
          const b = it as Extract<MixedItem, { kind: 'barcode' }>;
          const align = b.style?.align;
          if (align)
            await Printer.sendRawBytesToPrinter(
              printerId,
              ByteCommands.setAlign(align),
            );
          await Printer.sendRawBytesToPrinter(
            printerId,
            ByteCommands.barcode(b.content, b.opts),
          );
          break;
        }

        case 'raw':
          await flushText();
          {
            const r = it as any;
            if (r.bytes && r.bytes.length) {
              await Printer.sendRawBytesToPrinter(printerId, r.bytes);
            } else if (r.data) {
              const bytes = escposStringToBytes(r.data);
              await Printer.sendRawBytesToPrinter(printerId, bytes);
            }
          }
          break;

        case 'image':
          await flushText();
          {
            const im = it as Extract<MixedItem, { kind: 'image' }>;
            const align = im.style?.align;
            if (align)
              await Printer.sendRawBytesToPrinter(
                printerId,
                ByteCommands.setAlign(align),
              );
            await Printer.printImageToPrinterWithOptions(
              printerId,
              im.base64,
              im.options,
            );
          }
          break;
      }
    }

    await flushText();
  }

  /**
   * 标准打印（不使用智能编码）
   */
  private async printMixedStandard(
    printerId: string,
    items: readonly MixedItem[],
  ): Promise<void> {
    // 实现标准打印逻辑（如果需要）
    // 目前主要使用智能文本编码
    await this.printMixedWithSmartText(printerId, items);
  }

  /**
   * 关闭驱动
   */
  async close(): Promise<void> {
    await this.disconnect();
  }
}

