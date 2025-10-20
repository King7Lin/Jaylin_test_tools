/**
 * 字节数组打印示例
 * 
 * 本示例展示如何使用新的字节数组API来避免字符编码问题
 */

import { Printer, ByteCommands } from '../src';

export async function basicByteArrayExample() {
    try {
        // 连接打印机
        await Printer.connect({
            type: 'network',
            target: '192.168.1.100:9100',
            timeout: 3000
        });

        // 方法1: 直接传递字节数组
        const rawCommand = [0x1b, 0x74, 0x00]; // ESC t 0 (设置字符集为CP437)
        await Printer.sendRawBytes(rawCommand);

        // 方法2: 使用ByteCommands构建器
        const initCmd = ByteCommands.init();
        await Printer.sendRawBytes(initCmd);

        // 设置中文编码页
        const chineseCmd = ByteCommands.setChineseCodePage();
        await Printer.sendRawBytes(chineseCmd);

        // 打印中文文本
        const textCmd = ByteCommands.textLine('你好世界！', 'utf8');
        await Printer.sendRawBytes(textCmd);

        // 打印英文文本
        const englishCmd = ByteCommands.combine(
            ByteCommands.setEnglishCodePage(),
            ByteCommands.textLine('Hello World!', 'ascii')
        );
        await Printer.sendRawBytes(englishCmd);

        // 切纸
        const cutCmd = ByteCommands.cut();
        await Printer.sendRawBytes(cutCmd);

        console.log('字节数组打印完成');
    } catch (error) {
        console.error('打印失败:', error);
    } finally {
        await Printer.disconnect();
    }
}

export async function styledByteArrayExample() {
    try {
        await Printer.connect({
            type: 'network',
            target: '192.168.1.100:9100'
        });

        // 组合多个命令
        const commands = ByteCommands.combine(
            ByteCommands.init(),
            ByteCommands.setChineseCodePage(),
            
            // 标题 - 加粗居中
            ByteCommands.styledText('打印测试', {
                bold: true,
                align: 'center',
                width: 2,
                height: 2
            }),
            
            ByteCommands.feed(2),
            
            // 普通文本
            ByteCommands.styledText('这是一行普通文本'),
            
            // 下划线文本
            ByteCommands.styledText('这是下划线文本', {
                underline: true
            }),
            
            // 反色文本
            ByteCommands.styledText('这是反色文本', {
                invert: true
            }),
            
            ByteCommands.feed(2),
            
            // 切换到英文
            ByteCommands.setEnglishCodePage(),
            ByteCommands.styledText('English Text Example', {
                bold: true
            }),
            
            ByteCommands.feed(3),
            ByteCommands.cut()
        );

        await Printer.sendRawBytes(commands);
        console.log('样式打印完成');
    } catch (error) {
        console.error('打印失败:', error);
    } finally {
        await Printer.disconnect();
    }
}

export async function qrCodeByteArrayExample() {
    try {
        await Printer.connect({
            type: 'network',
            target: '192.168.1.100:9100'
        });

        const commands = ByteCommands.combine(
            ByteCommands.init(),
            ByteCommands.setAlign('center'),
            
            // 打印二维码
            ByteCommands.qrcode('https://example.com', 6, 49),
            
            ByteCommands.feed(2),
            
            // 二维码说明
            ByteCommands.setChineseCodePage(),
            ByteCommands.textLine('扫描二维码访问网站'),
            
            ByteCommands.feed(3),
            ByteCommands.cut()
        );

        await Printer.sendRawBytes(commands);
        console.log('二维码打印完成');
    } catch (error) {
        console.error('打印失败:', error);
    } finally {
        await Printer.disconnect();
    }
}

export async function mixedCommandExample() {
    try {
        await Printer.connect({
            type: 'network',
            target: '192.168.1.100:9100'
        });

        // 你可以直接传递你想要的命令字节数组
        const customCommands = [
            0x1b, 0x40,        // ESC @ (初始化)
            0x1b, 0x74, 0x19,  // ESC t 25 (设置中文编码页CP936)
            ...Array.from(new TextEncoder().encode('你好')), // 中文文本
            0x0a,              // 换行
            0x1b, 0x74, 0x00,  // ESC t 0 (设置英文编码页CP437)
            ...Array.from('Hello'.split('').map(c => c.charCodeAt(0))), // 英文文本
            0x0a,              // 换行
            0x0a, 0x0a, 0x0a,  // 3个换行
            0x1d, 0x56, 0x00   // GS V 0 (全切)
        ];

        await Printer.sendRawBytes(customCommands);
        console.log('自定义命令打印完成');
    } catch (error) {
        console.error('打印失败:', error);
    } finally {
        await Printer.disconnect();
    }
}

// 便捷的打印函数
export async function printWithBytes(commands: number[], printerAddress: string = '192.168.1.100:9100') {
    try {
        await Printer.connect({
            type: 'network',
            target: printerAddress
        });
        
        await Printer.sendRawBytes(commands);
        console.log('字节命令发送成功');
    } catch (error) {
        console.error('打印失败:', error);
        throw error;
    } finally {
        await Printer.disconnect();
    }
}

// 导出所有示例函数
export const ByteArrayExamples = {
    basicByteArrayExample,
    styledByteArrayExample,
    qrCodeByteArrayExample,
    mixedCommandExample,
    printWithBytes
};

export default ByteArrayExamples;
