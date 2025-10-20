/**
 * ESC/POS字节数组命令构建器
 *
 * 本模块提供直接返回字节数组的ESC/POS命令构建函数，
 * 避免了字符串转换过程中的编码问题。
 * 推荐使用这些函数替代传统的字符串命令构建器。
 */

export type Align = 'left' | 'center' | 'right';
export type ImageMode = 8 | 24 | 32;

export interface TextStyle {
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  width?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  height?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  invert?: boolean;
  doubleStrike?: boolean;
}

export interface BarcodeOptions {
  type: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC_A' | 'CODE93' | 'ITF' | 'CODABAR' | 'JAN13' | 'JAN8' | 'UPCE';
  height?: number;
  width?: number; // 条形码宽度级别 (1-6)，默认3
  text?: 'top' | 'bottom' | 'none' | 'all';
}

// ESC/POS控制字符
const ESC = 0x1b;
const GS = 0x1d;
const DLE = 0x10;
const LF = 0x0a; // 换行

/**
 * 初始化打印机
 */
export function init(): number[] {
  return [ESC, 0x40, LF, LF]; // ESC @ - 完整的初始化命令
}

/**
 * 设置对齐方式
 */
export function setAlign(align: Align): number[] {
  const alignMap = {left: 0, center: 1, right: 2};
  return [ESC, 0x61, alignMap[align]]; // ESC a n
}

/**
 * 设置加粗
 */
export function bold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0]; // ESC E n
}

/**
 * 设置斜体
 */
export function italic(on: boolean): number[] {
  return [ESC, 0x34, on ? 1 : 0]; // ESC 4 n
}

/**
 * 设置下划线
 */
export function underline(on: boolean): number[] {
  return [ESC, 0x2d, on ? 1 : 0]; // ESC - n
}

/**
 * 设置反色
 */
export function invert(on: boolean): number[] {
  return [ESC, 0x42, on ? 1 : 0]; // ESC B n
}

/**
 * 设置双重打击
 */
export function doubleStrike(on: boolean): number[] {
  return [ESC, 0x47, on ? 1 : 0]; // ESC G n
}

/**
 * 设置字体大小
 */
export function size(
  width: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = 1,
  height: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = 1,
): number[] {
  // ESC/POS 允许 1..8 倍。进行范围夹取。
  const w = Math.min(8, Math.max(1, width | 0));
  const h = Math.min(8, Math.max(1, height | 0));
  const value = ((w - 1) << 4) | (h - 1);
  return [GS, 0x21, value]; // GS ! n
}

/**
 * 设置代码页
 */
export function setCodePage(codePage: number): number[] {
  return [ESC, 0x74, codePage]; // ESC t n
}

/**
 * 换行
 */
export function feed(lines: number = 1): number[] {
  return Array(Math.max(0, lines)).fill(LF);
}

/**
 * 切纸
 */
export function cut(partial: boolean = false): number[] {
  return [GS, 0x56, partial ? 1 : 0]; // 先换行3次，再执行 GS V n
}

/**
 * 打印存储在NV内存中的图片
 * GS ( L pL pH pXL pXH m fn a
 * 固定参数：pL pH pXL pXH = 0x02 0x00 0x00 0x00, m=0, fn=49, a=imageId
 */
export function printStoredNVImage(imageId: number): number[] {
  const id = Math.max(0, Math.min(255, imageId | 0));
  return [0x1d, 0x28, 0x4c, 0x02, 0x00, 0x00, 0x00, 0x00, 0x31, id];
}

/**
 * 打开钱箱
 */
export function pulse(
  pin: 0 | 1 = 0,
  tOnMs: number = 100,
  tOffMs: number = 100,
): number[] {
  const t1 = Math.min(255, Math.max(0, Math.round(tOnMs / 2)));
  const t2 = Math.min(255, Math.max(0, Math.round(tOffMs / 2)));
  return [ESC, 0x70, pin, t1, t2]; // ESC p m t1 t2
}

/**
 * 蜂鸣器
 */
export function beep(times: number = 1): number[] {
  return Array(Math.min(5, Math.max(1, times))).fill(0x07); // BEL
}

/**
 * 打印文本
 */
export function text(content: string, encoding: string = 'utf8'): number[] {
  // 根据编码类型转换文本为字节数组
  let bytes: number[] = [];

  switch (encoding.toLowerCase()) {
    case 'gbk':
    case 'gb2312':
      // 使用智能编码器进行正确的GBK编码
      try {
        // 动态导入智能编码器
        const {smartEncode} = require('./SmartEncoder');
        const result = smartEncode(content);
        // 只返回编码后的文本字节，不包含编码页命令
        const encodedBytes: number[] = [];
        for (let i = 0; i < result.encodedText.length; i++) {
          encodedBytes.push(result.encodedText.charCodeAt(i) & 0xff);
        }
        return encodedBytes;
      } catch (error) {
        console.warn('GBK编码失败，使用UTF-8:', error);
        const encoder = new TextEncoder();
        bytes = Array.from(encoder.encode(content));
      }
      break;
    case 'shift_jis':
    case 'cp932':
      // 日文编码 (Shift-JIS / CP932)
      try {
        // 使用智能编码器进行日文编码
        const {SmartEncoder} = require('./SmartEncoder');
        const encoder = new SmartEncoder();
        const result = encoder.encodeText(content, 'shift_jis');
        // 转换为字节数组
        const encodedBytes: number[] = [];
        for (let i = 0; i < result.length; i++) {
          encodedBytes.push(result.charCodeAt(i) & 0xff);
        }
        return encodedBytes;
      } catch (error) {
        console.warn('Shift-JIS编码失败，使用UTF-8:', error);
        const encoder = new TextEncoder();
        bytes = Array.from(encoder.encode(content));
      }
      break;
    case 'ascii':
      // ASCII编码
      for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        bytes.push(code < 128 ? code : 0x3f); // 非ASCII字符替换为?
      }
      break;
    default:
      // 默认UTF-8编码
      const encoder = new TextEncoder();
      bytes = Array.from(encoder.encode(content));
      break;
  }

  return bytes;
}

/**
 * 打印一行文本并换行
 */
export function textLine(content: string, encoding: string = 'utf8'): number[] {
  return [...text(content, encoding), LF];
}

/**
 * 应用文本样式
 */
export function applyStyle(style: TextStyle): number[] {
  let commands: number[] = [];

  if (style.align !== undefined) {
    commands.push(...setAlign(style.align));
  }
  if (style.bold !== undefined) {
    commands.push(...bold(style.bold));
  }
  if (style.italic !== undefined) {
    commands.push(...italic(style.italic));
  }
  if (style.underline !== undefined) {
    commands.push(...underline(style.underline));
  }
  if (style.invert !== undefined) {
    commands.push(...invert(style.invert));
  }
  if (style.doubleStrike !== undefined) {
    commands.push(...doubleStrike(style.doubleStrike));
  }
  if (style.width !== undefined || style.height !== undefined) {
    commands.push(...size(style.width || 1, style.height || 1));
  }

  return commands;
}

/**
 * 重置文本样式
 */
export function resetStyle(): number[] {
  return [
    ...bold(false),
    ...italic(false),
    ...underline(false),
    ...invert(false),
    ...doubleStrike(false),
    ...size(1, 1),
    ...setAlign('left'),
  ];
}

/**
 * 带样式的文本打印
 */
export function styledText(
  content: string,
  style?: TextStyle,
  encoding: string = 'utf8',
): number[] {
  let commands: number[] = [];

  if (style) {
    commands.push(...applyStyle(style));
  }

  commands.push(...textLine(content, encoding));

  if (style) {
    commands.push(...resetStyle());
  }

  return commands;
}

/**
 * 二维码
 */
export function qrcode(
  data: string,
  size: number = 6,
  errorCorrection: number = 49,
): number[] {
  const commands: number[] = [];

  // 设置二维码模型 (Model 2)
  commands.push(GS, 0x28, 0x6b, 4, 0, 49, 65, 50, 0);

  // 设置二维码大小
  commands.push(GS, 0x28, 0x6b, 3, 0, 49, 67, size);

  // 设置纠错等级
  commands.push(GS, 0x28, 0x6b, 3, 0, 49, 69, errorCorrection);

  // 存储数据
  const encoder = new TextEncoder();
  const utf8Bytes = Array.from(encoder.encode(data));
  const dataLength = utf8Bytes.length + 3;
  const pL = dataLength & 0xff;
  const pH = (dataLength >> 8) & 0xff;

  commands.push(GS, 0x28, 0x6b, pL, pH, 49, 80, 48);
  commands.push(...utf8Bytes);

  // 打印二维码
  commands.push(GS, 0x28, 0x6b, 3, 0, 49, 81, 48);

  return commands;
}

/**
 * 条形码
 */
export function barcode(data: string, options: BarcodeOptions): number[] {
  const commands: number[] = [];
  const height = options.height ?? 80;
  const width = options.width ?? 3; // 默认宽度级别为3

  // 设置条形码宽度 (ESC/POS: GS w n, n=2-6)
  commands.push(GS, 0x77, Math.min(6, Math.max(2, width)));

  // 设置条形码高度
  commands.push(GS, 0x68, Math.min(255, Math.max(1, height)));

  const hir = () => {
    switch (options.text) {
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
  // 设置是否显示文本
  commands.push(GS, 0x48, hir());

  // 设置条形码类型并打印
  switch (options.type) {
    case 'CODE128':
      const content = '{B' + data; // Force subset B
      commands.push(GS, 0x6b, 73, content.length);
      commands.push(...Array.from(content).map(c => c.charCodeAt(0)));
      break;
    case 'CODE39':
      commands.push(GS, 0x6b, 69, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'CODE93':
      commands.push(GS, 0x6b, 72, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'EAN13':
      commands.push(GS, 0x6b, 67, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'EAN8':
      commands.push(GS, 0x6b, 68, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'UPC_A':
      commands.push(GS, 0x6b, 65, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'UPCE':
      commands.push(GS, 0x6b, 66, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'JAN13':
      commands.push(GS, 0x6b, 67, data.length); // 与 EAN13 相同
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'JAN8':
      commands.push(GS, 0x6b, 68, data.length); // 与 EAN8 相同
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'ITF':
      commands.push(GS, 0x6b, 70, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
    case 'CODABAR':
      commands.push(GS, 0x6b, 71, data.length);
      commands.push(...Array.from(data).map(c => c.charCodeAt(0)));
      break;
  }

  return commands;
}

/**
 * 常用的中文编码页设置
 */
export function setChineseCodePage(): number[] {
  return setCodePage(25); // CP936 (GBK)
}

/**
 * 日文编码页设置
 */
export function setJapaneseCodePage(): number[] {
  return setCodePage(1); // CP932 (Shift-JIS)
}

/**
 * 英文编码页设置
 */
export function setEnglishCodePage(): number[] {
  return setCodePage(0); // CP437
}

/**
 * 智能编码多行文本为字节数组（类似PrinterTestScreen的smartEncodeMultiLine）
 * 自动检测语言并选择最佳编码，返回完整的打印命令字节数组
 */
export function smartEncodeToBytes(lines: string[]): number[] {
  try {
    // 动态导入SmartEncoder
    const {SmartEncoder} = require('./SmartEncoder');
    const encoder = new SmartEncoder();

    // 使用SmartEncoder的smartEncodeMultiLine方法
    const result = encoder.smartEncodeMultiLine(lines);

    // console.log('SmartEncoder检测到的编码:', result.encoding);
    // console.log('编码页命令:', result.codePageCommand);

    // 解析编码页命令字符串为字节数组
    const codePageBytes = parseEscPosStringToBytes(result.codePageCommand);

    // 解析编码后的文本为字节数组
    const textBytes = parseEncodedTextToBytes(result.encodedText);
    // 组合完整的打印命令（不包含初始化和切纸，只负责编码文本）
    const resultBytes = combine(
      codePageBytes, // 编码页设置
      textBytes, // 文本内容
      feed(1), // 换行
    );
    // console.log('smartEncodeToBytes 成功处理，字节长度:', resultBytes.length);
    return resultBytes;
  } catch (error) {
    console.error('SmartEncoder字节编码失败:', error);
    console.log('使用回退方案处理行:', lines);
    // 回退到简单的GBK编码（不包含初始化和切纸）
    const fallbackBytes = combine(
      setChineseCodePage(),
      ...lines.map(line => textLine(line, 'gbk')),
      feed(1),
    );
    console.log('回退方案字节长度:', fallbackBytes.length);
    return fallbackBytes;
  }
}

/**
 * 解析ESC/POS命令字符串为字节数组
 */
function parseEscPosStringToBytes(escposString: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < escposString.length; i++) {
    bytes.push(escposString.charCodeAt(i) & 0xff);
  }
  return bytes;
}

/**
 * 解析编码后的文本为字节数组
 */
function parseEncodedTextToBytes(encodedText: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < encodedText.length; i++) {
    bytes.push(encodedText.charCodeAt(i) & 0xff);
  }
  return bytes;
}

/**
 * 选择字体类型
 */
export function selectFont(font: 'A' | 'B' = 'A'): number[] {
  return [ESC, 0x4D, font === 'A' ? 0 : 1]; // ESC M n
}

/**
 * 组合多个命令
 */
export function combine(...commands: number[][]): number[] {
  return commands.flat();
}

/**
 * 便捷的命令构建器
 */
export const ByteCommands = {
  init,
  setAlign,
  bold,
  italic,
  underline,
  invert,
  doubleStrike,
  size,
  setCodePage,
  feed,
  cut,
  pulse,
  beep,
  text,
  textLine,
  applyStyle,
  resetStyle,
  styledText,
  qrcode,
  barcode,
  setChineseCodePage,
  setJapaneseCodePage,
  setEnglishCodePage,
  smartEncodeToBytes,
  combine,
  selectFont
};

export default ByteCommands;
