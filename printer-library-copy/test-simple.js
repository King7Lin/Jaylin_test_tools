/**
 * 简单字节数组测试（无React Native依赖）
 */

const { 
    init, setAlign, bold, underline, feed, cut, 
    setChineseCodePage, setEnglishCodePage, 
    text, textLine, styledText, qrcode, combine 
} = require('./dist/ByteCommands.js');

console.log('🧪 测试字节数组命令生成...\n');

// 测试基础命令
console.log('1️⃣ 基础命令测试:');
console.log('初始化命令:', init());
console.log('设置对齐居中:', setAlign('center'));
console.log('设置加粗:', bold(true));
console.log('取消加粗:', bold(false));
console.log('设置中文编码页:', setChineseCodePage());
console.log('设置英文编码页:', setEnglishCodePage());
console.log('换行3次:', feed(3));
console.log('切纸:', cut());
console.log('');

// 测试文本命令
console.log('2️⃣ 文本命令测试:');
const textBytes = text('Hello World', 'ascii');
console.log('文本"Hello World":', textBytes);
const lineBytes = textLine('Test text');
console.log('文本行"Test text":', lineBytes);
console.log('');

// 测试样式文本
console.log('3️⃣ 样式文本测试:');
const styledBytes = styledText('Bold Center Text', {
    bold: true,
    align: 'center',
    width: 2
});
console.log('样式文本长度:', styledBytes.length, '字节');
console.log('前20字节:', styledBytes.slice(0, 20));
console.log('');

// 测试二维码
console.log('4️⃣ 二维码测试:');
const qrBytes = qrcode('https://example.com', 6);
console.log('二维码命令长度:', qrBytes.length, '字节');
console.log('前20字节:', qrBytes.slice(0, 20));
console.log('');

// 测试组合命令
console.log('5️⃣ 组合命令测试:');
const combinedBytes = combine(
    init(),
    setChineseCodePage(),
    styledText('Title', { bold: true, align: 'center' }),
    feed(2),
    setEnglishCodePage(),
    textLine('Content line'),
    cut()
);
console.log('组合命令长度:', combinedBytes.length, '字节');
console.log('前30字节:', combinedBytes.slice(0, 30));
console.log('');

// 自定义字节数组示例
console.log('6️⃣ 自定义字节数组示例:');
const customCommand = [0x1b, 0x74, 0x00]; // ESC t 0 - 设置字符集为CP437
console.log('自定义命令 [0x1b, 0x74, 0x00]:', customCommand);
console.log('十六进制表示:', customCommand.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
console.log('');

// 你想要的命令示例
console.log('7️⃣ 你想要的命令示例:');
const yourCommand = [0x1b, 0x74, 0x00]; // 你提到的命令
console.log('命令 [0x1b, 0x74, 0x00]:');
console.log('- 字节数组:', yourCommand);
console.log('- 含义: ESC t 0 (设置字符集为CP437)');
console.log('- 使用: await Printer.sendRawBytes([0x1b, 0x74, 0x00])');
console.log('');

console.log('✅ 测试完成！');
console.log('');
console.log('📝 新的使用方式:');
console.log('');
console.log('// 方式1: 直接传递字节数组');
console.log('await Printer.sendRawBytes([0x1b, 0x74, 0x00]);');
console.log('');
console.log('// 方式2: 使用ByteCommands构建器');
console.log('import { ByteCommands } from "your-printer-library";');
console.log('const cmd = ByteCommands.combine(');
console.log('  ByteCommands.init(),');
console.log('  ByteCommands.setChineseCodePage(),');
console.log('  ByteCommands.textLine("你好世界"),');
console.log('  ByteCommands.cut()');
console.log(');');
console.log('await Printer.sendRawBytes(cmd);');
console.log('');
console.log('🎉 不再需要处理这种转义字符串:');
console.log('\'"\\n\\n\\n\\u001b\\u001bt\\u0019ÄãºÃ\\nÊÀ½ç\\n²âÊÔ\\nHello World!\\n\\n\\n\\n\\u001dV0"\'');
console.log('直接使用清晰的字节数组即可！');
