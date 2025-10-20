/**
 * 智能编码转换模块
 * 支持多语言自动编码转换，基于文本内容自动检测语言并选择最佳编码
 */

import * as iconv from 'iconv-lite';

// 语言编码映射 - 直接使用iconv-lite支持的编码
export const LANGUAGE_ENCODINGS = {
  chinese: 'gbk',         // 中文
  japanese: 'shift_jis',  // 日文
  korean: 'euc-kr',       // 韩文
  english: 'ascii',       // 英文（使用ASCII编码，兼容性更好）
  russian: 'cp866',       // 俄文
  french: 'iso-8859-1',    // 法文（西欧语言）
  thai: 'cp874'           // 泰文
};

// 编码页到ESC/POS命令的映射（用于设置打印机编码页）
export const codePageMap: Record<string, number> = {
  'cp437': 0,   // 英语
  'cp850': 2,    // 西欧
  'cp858': 19,   // 西欧扩展
  'cp860': 3,    // 葡萄牙语
  'cp863': 4,    // 加拿大法语
  'cp865': 5,    // 北欧
  'cp866': 17,   // 俄语
  'cp852': 18,   // 中欧
  'cp936': 25,   // 简体中文(GBK)
  'cp949': 30,   // 韩语
  'cp950': 31,   // 繁体中文(Big5)
  'cp932': 1,    // 日语
  'cp1252': 16,  // 西欧(Windows)
  'cp874': 20,   // 泰语
  'cp1256': 21   // 阿拉伯语
};

// iconv编码名到ESC/POS编码页的映射
export const iconvToCodePage: Record<string, string> = {
  'gbk': 'cp936',        // 中文GBK -> cp936
  'shift_jis': 'cp932',  // 日文 -> cp932
  'euc-kr': 'cp949',     // 韩文 -> cp949
  'ascii': 'cp437',      // 英文ASCII -> cp437
  'cp866': 'cp866',      // 俄文
  'iso-8859-1': 'cp850',  // 西欧语言
  'cp874': 'cp874'       // 泰文
};

/**
 * 智能编码转换类
 */
export class SmartEncoder {
  /**
   * 检测文本的主要语言并返回对应的编码
   * 优先级策略：CJK语言 > 其他特殊语言 > 英语
   */
  detectTextLanguage(text: string): string {
    // 统计各种语言字符的数量
    const chineseRegex = /[\u4e00-\u9fff]/g;
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
    const koreanRegex = /[\uac00-\ud7af]/g;
    const cyrillicRegex = /[\u0400-\u04ff]/g;
    const arabicRegex = /[\u0600-\u06ff]/g;
    const thaiRegex = /[\u0e00-\u0e7f]/g;

    const chineseCount = (text.match(chineseRegex) || []).length;
    const japaneseCount = (text.match(japaneseRegex) || []).length;
    const koreanCount = (text.match(koreanRegex) || []).length;
    const cyrillicCount = (text.match(cyrillicRegex) || []).length;
    const arabicCount = (text.match(arabicRegex) || []).length;
    const thaiCount = (text.match(thaiRegex) || []).length;

    // console.log('------------detectTextLanguage', chineseCount, japaneseCount, koreanCount, cyrillicCount, arabicCount, thaiCount);
    // 如果包含中文字符，优先使用GBK（因为我们知道它可以正常工作，且对英文兼容）
    if (chineseCount > 0) {
      return LANGUAGE_ENCODINGS.chinese; // 'gbk'
    }
    
    // 如果包含日文字符
    if (japaneseCount > 0) {
      return LANGUAGE_ENCODINGS.japanese; // 'shift_jis'
    }
    
    // 如果包含韩文字符
    if (koreanCount > 0) {
      return LANGUAGE_ENCODINGS.korean; // 'euc-kr'
    }
    
    // 如果包含俄文字符
    if (cyrillicCount > 0) {
      return LANGUAGE_ENCODINGS.russian; // 'cp866'
    }
    
    // 如果包含阿拉伯文字符
    if (arabicCount > 0) {
      return LANGUAGE_ENCODINGS.french; // 使用西欧编码
    }
    // 如果包含泰文字符
    if (thaiCount > 0) {
      return LANGUAGE_ENCODINGS.thai; // 'cp874'
    }
    
    // 纯英文或其他ASCII字符，但由于我们知道GBK对英文完全兼容，
    // 而且testEnglishPrint使用GBK成功了，所以对于纯英文也使用GBK
    return LANGUAGE_ENCODINGS.chinese; // 使用GBK确保兼容性
  }

  /**
   * 智能转换文本，自动检测语言并选择最佳编码
   * 返回编码后的文本和对应的ESC/POS编码页命令
   */
  smartEncode(text: string): { encodedText: string; codePageCommand: string; encoding: string } {
    const encoding = this.detectTextLanguage(text);
    const encodedText = this.encodeText(text, encoding);
    const codePageCommand = this.getSetCodePageCommand(encoding);
    
    return {
      encodedText,
      codePageCommand,
      encoding
    };
  }

  /**
   * 智能转换多行文本，自动检测主要语言并统一编码
   * 适用于包含多行、多语言混合的文本
   */
  smartEncodeMultiLine(lines: string[]): { encodedText: string; codePageCommand: string; encoding: string } {
    // 检测所有行的主要语言
    const allText = lines.join('\n');
    const encoding = this.detectTextLanguage(allText);
    
    // 统一使用检测到的主要语言进行编码
    const encodedLines = lines.map(line => this.encodeText(line, encoding));
    const encodedText = encodedLines.join('\n');
    const codePageCommand = this.getSetCodePageCommand(encoding);
    
    return {
      encodedText,
      codePageCommand,
      encoding
    };
  }

  /**
   * 使用iconv-lite直接转换文本为指定编码的字节
   */
  encodeText(text: string, encoding: string): string {
    try {
      // 对于ASCII编码，直接返回原文本（ASCII字符本身就是单字节）
      if (encoding === 'ascii') {
        return this.handleSpecialCharsForASCII(text);
      }
      
      // 对于GBK编码，特殊处理特殊符号
      if (encoding === 'gbk') {
        return this.handleSpecialCharsForGBK(text);
      }
      
      // 其他编码使用iconv-lite进行编码转换
      const buffer = iconv.encode(text, encoding);
      
      // 将Buffer转换为字符串，每个字节作为一个字符
      let result = '';
      for (let i = 0; i < buffer.length; i++) {
        result += String.fromCharCode(buffer[i]);
      }
      
      return result;
    } catch (error) {
      console.warn(`编码转换失败 (${encoding}):`, error);
      
      // 如果转换失败，回退到GBK编码（我们知道它可以工作）
      try {
        return this.handleSpecialCharsForGBK(text);
      } catch (gbkError) {
        console.error('GBK编码也失败:', gbkError);
        // 最后回退到原始文本
        return text;
      }
    }
  }

  /**
   * 处理ASCII编码的特殊字符
   */
  private handleSpecialCharsForASCII(text: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      if (charCode <= 127) {
        result += text[i];
      } else {
        // 非ASCII字符用?替代
        result += '?';
      }
    }
    return result;
  }

  /**
   * 处理GBK编码的特殊字符，使用直接字节码
   */
  private handleSpecialCharsForGBK(text: string): string {
    // 特殊符号的直接字节码映射（GBK编码）
    const specialCharsGBK: Record<string, number[]> = {
      '¥': [0xA3, 0xA4],  // 人民币符号
      '$': [0x24],         // 美元符号
      '€': [0xA1, 0xE0],   // 欧元符号
      '©': [0xA1, 0xA9],   // 版权符号
      '®': [0xA1, 0xAE],   // 注册商标
      '°': [0xA1, 0xE3],   // 度符号
      '±': [0xA1, 0xC0],   // 正负号
      '×': [0xA1, 0xC1],   // 乘号
      '÷': [0xA1, 0xC2],   // 除号
      '§': [0xA1, 0xA7],   // 节符号
      '¶': [0xA1, 0xB6],   // 段落符号
    };

    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (specialCharsGBK[char]) {
        // 使用直接字节码
        for (const byte of specialCharsGBK[char]) {
          result += String.fromCharCode(byte);
        }
      } else {
        // 普通字符使用iconv-lite编码
        try {
          const buffer = iconv.encode(char, 'gbk');
          for (let j = 0; j < buffer.length; j++) {
            result += String.fromCharCode(buffer[j]);
          }
        } catch (error) {
          // 如果编码失败，跳过该字符或用替代字符
          console.warn(`字符 "${char}" 编码失败，跳过`);
          result += '?';
        }
      }
    }
    return result;
  }

  /**
   * 获取ESC/POS设置编码页的命令
   */
  getSetCodePageCommand(encoding: string): string {
    const codePage = iconvToCodePage[encoding] || 'cp437';
    const codePageNumber = codePageMap[codePage];
    
    // 确保编码页号码存在
    if (codePageNumber === undefined) {
      console.warn(`未找到编码页 ${codePage} 的编码号，使用默认编码页`);
      return '\x1Bt\x00'; // CP437
    }
    
    // 生成ESC/POS编码页命令
    const command = '\x1Bt' + String.fromCharCode(codePageNumber);
    // console.log(`编码页命令: ${encoding} -> ${codePage} -> ${codePageNumber} -> ${command.split('').map(c => c.charCodeAt(0).toString(16)).join(' ')}`);
    return command;
  }
}

// 创建全局实例
export const smartEncoder = new SmartEncoder();

// 导出便捷函数
export function encodeText(text: string, encoding?: string): string {
  const encoder = new SmartEncoder();
  return encoder.encodeText(text, encoding || encoder.detectTextLanguage(text));
}

export function smartEncode(text: string): { encodedText: string; codePageCommand: string; encoding: string } {
  const encoder = new SmartEncoder();
  return encoder.smartEncode(text);
}

export function smartEncodeMultiLine(lines: string[]): { encodedText: string; codePageCommand: string; encoding: string } {
  const encoder = new SmartEncoder();
  return encoder.smartEncodeMultiLine(lines);
}

export function getCodePageCommand(encoding: string): string {
  const encoder = new SmartEncoder();
  return encoder.getSetCodePageCommand(encoding);
}

export function detectLanguage(text: string): string {
  const encoder = new SmartEncoder();
  return encoder.detectTextLanguage(text);
}
