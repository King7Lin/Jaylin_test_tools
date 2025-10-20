/**
 * SmartEncoder 使用示例
 * 展示如何使用重构后的智能编码器自动处理多语言文本
 */

import { smartEncode, encodeText, detectLanguage } from '../src/SmartEncoder';

// 示例1: 基本使用 - 自动检测语言并编码
export function basicUsage() {
  console.log('=== 基本使用示例 ===');
  
  // 中文文本
  const chineseText = '你好世界！';
  const chineseResult = smartEncode(chineseText);
  console.log('中文文本:', chineseText);
  console.log('检测到的编码:', chineseResult.encoding); // 'gbk'
  console.log('编码页命令:', chineseResult.codePageCommand);
  console.log('编码后的文本长度:', chineseResult.encodedText.length);
  
  // 英文文本
  const englishText = 'Hello World!';
  const englishResult = smartEncode(englishText);
  console.log('英文文本:', englishText);
  console.log('检测到的编码:', englishResult.encoding); // 'utf-8'
  console.log('编码页命令:', englishResult.codePageCommand);
  
  // 中英混合文本
  const mixedText = '混合测试 Mixed Test';
  const mixedResult = smartEncode(mixedText);
  console.log('混合文本:', mixedText);
  console.log('检测到的编码:', mixedResult.encoding); // 'gbk' (因为包含中文)
  console.log('编码页命令:', mixedResult.codePageCommand);
}

// 示例2: 在打印命令中使用
export function printCommandExample() {
  console.log('=== 打印命令示例 ===');
  
  // 构建打印命令
  let printCommand = '';
  
  // 添加初始化命令
  printCommand += '\x1B\x40'; // ESC @ 初始化
  
  // 打印中文标题
  const titleResult = smartEncode('=== 收据 ===');
  printCommand += titleResult.codePageCommand; // 设置编码页
  printCommand += titleResult.encodedText; // 编码后的文本
  printCommand += '\n\n';
  
  // 打印商品信息（中英混合）
  const itemResult = smartEncode('商品名称: Apple iPhone 15');
  printCommand += itemResult.codePageCommand;
  printCommand += itemResult.encodedText;
  printCommand += '\n';
  
  // 打印价格（数字和符号）
  const priceResult = smartEncode('价格: ¥6,999.00');
  printCommand += priceResult.codePageCommand;
  printCommand += priceResult.encodedText;
  printCommand += '\n\n';
  
  // 打印英文备注
  const noteResult = smartEncode('Thank you for your purchase!');
  printCommand += noteResult.codePageCommand;
  printCommand += noteResult.encodedText;
  printCommand += '\n';
  
  // 添加切纸命令
  printCommand += '\x1D\x56\x00'; // GS V 0 切纸
  
  console.log('完整的打印命令:', printCommand);
  return printCommand;
}

// 示例3: 批量处理文本
export function batchProcessingExample() {
  console.log('=== 批量处理示例 ===');
  
  const texts = [
    '欢迎光临 Welcome',
    '商品名称 Product Name',
    '价格 Price: ¥100.00',
    '谢谢惠顾 Thank You',
    '日本語テスト Japanese Test',
    '한국어 테스트 Korean Test'
  ];
  
  const results = texts.map(text => {
    const result = smartEncode(text);
    return {
      original: text,
      encoding: result.encoding,
      codePageCommand: result.codePageCommand,
      encodedLength: result.encodedText.length
    };
  });
  
  console.log('批量处理结果:');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.original} -> ${result.encoding} (${result.encodedLength} bytes)`);
  });
  
  return results;
}

// 示例4: 语言检测
export function languageDetectionExample() {
  console.log('=== 语言检测示例 ===');
  
  const testTexts = [
    '你好世界',
    'Hello World',
    'こんにちは世界',
    '안녕하세요 세계',
    'Привет мир',
    'مرحبا بالعالم',
    '123456 !@#$%'
  ];
  
  testTexts.forEach(text => {
    const detectedEncoding = detectLanguage(text);
    console.log(`"${text}" -> ${detectedEncoding}`);
  });
}

// 运行所有示例
export function runAllExamples() {
  basicUsage();
  console.log('\n');
  
  printCommandExample();
  console.log('\n');
  
  batchProcessingExample();
  console.log('\n');
  
  languageDetectionExample();
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}
