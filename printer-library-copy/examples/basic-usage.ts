/**
 * ESC/POS打印机库基本使用示例
 * 
 * 本文件展示了如何使用打印机库的各种功能
 */

import { Printer, EscPos, printMixed, MixedItem } from '../src';

// 1. 基本文本打印
export async function basicTextPrint() {
  try {
    // 检查权限（Android）
    const hasPermission = await Printer.checkPermissions();
    if (!hasPermission) {
      console.error('权限不足');
      return;
    }

    // 连接网络打印机
    await Printer.connect({
      type: 'network',
      target: '192.168.1.100:9100',
      timeout: 5000
    });

    // 构建打印命令
    const cmd = EscPos.init()
      + EscPos.text('欢迎光临', { align: 'center', bold: true, width: 2, height: 2 })
      + EscPos.hr('=', 32)
      + EscPos.text('商品名称    数量    价格')
      + EscPos.text('苹果        2      10.00')
      + EscPos.text('香蕉        3      15.00')
      + EscPos.hr()
      + EscPos.text('总计: 25.00', { bold: true, align: 'right' })
      + EscPos.feed(2)
      + EscPos.cut();

    // 发送打印命令
    await Printer.sendRaw(cmd);
    console.log('打印完成');

  } catch (error) {
    console.error('打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 2. 二维码和条形码打印
export async function qrAndBarcodePrint() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    const cmd = EscPos.init()
      + EscPos.text('二维码示例', { align: 'center', bold: true })
      + EscPos.qrcode('https://www.example.com', 8, 49) // size=8, error correction=M
      + EscPos.feed(1)
      + EscPos.text('条形码示例', { align: 'center', bold: true })
      + EscPos.barcode('123456789012', { type: 'EAN13', height: 80, text: true })
      + EscPos.feed(2)
      + EscPos.cut();

    await Printer.sendRaw(cmd);
    console.log('二维码和条形码打印完成');

  } catch (error) {
    console.error('打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 3. 图片打印
export async function imagePrint(base64Image: string) {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 打印图片
    await Printer.printImage(base64Image);
    console.log('图片打印完成');

  } catch (error) {
    console.error('图片打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 4. 混合打印（推荐方式）
export async function mixedPrint() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    const items: MixedItem[] = [
      { kind: 'text', content: '购物小票', style: { align: 'center', bold: true, width: 2, height: 2 } },
      { kind: 'hr', char: '=', width: 32 },
      { kind: 'text', content: '订单号: 20231201001' },
      { kind: 'text', content: '时间: 2023-12-01 14:30:00' },
      { kind: 'hr' },
      { kind: 'text', content: '商品列表:' },
      { kind: 'text', content: '苹果 x2    ¥10.00' },
      { kind: 'text', content: '香蕉 x3    ¥15.00' },
      { kind: 'hr' },
      { kind: 'text', content: '总计: ¥25.00', style: { bold: true, align: 'right' } },
      { kind: 'qr', content: 'https://www.example.com/order/20231201001', size: 6 },
      { kind: 'barcode', content: '20231201001', opts: { type: 'CODE128', height: 60 } },
      { kind: 'text', content: '谢谢惠顾！', style: { align: 'center' } },
      { kind: 'feed', lines: 2 }
    ];

    await printMixed(items, { cut: true });
    console.log('混合打印完成');

  } catch (error) {
    console.error('混合打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 5. 设备发现和连接
export async function deviceDiscovery() {
  try {
    // 检查权限
    await Printer.checkPermissions();

    // 监听设备事件
    const subscription = Printer.addListener((event) => {
      switch (event.type) {
        case 'device':
          console.log('发现设备:', event.data);
          break;
        case 'state':
          console.log('连接状态:', event.data.state);
          break;
        case 'error':
          console.error('错误:', event.data.message);
          break;
        case 'scan':
          console.log('扫描状态:', event.data.status);
          break;
      }
    });

    // 发现已配对设备
    const devices = await Printer.discover();
    console.log('已发现设备:', devices);

    // 开始蓝牙扫描
    await Printer.startBluetoothScan();
    
    // 5秒后停止扫描
    setTimeout(async () => {
      await Printer.stopBluetoothScan();
      subscription.remove();
    }, 5000);

  } catch (error) {
    console.error('设备发现失败:', error);
  }
}

// 6. USB设备连接
export async function usbDeviceConnect() {
  try {
    // 发现USB设备
    const devices = await Printer.discover();
    const usbDevices = devices.filter(d => d.type === 'usb');
    
    if (usbDevices.length === 0) {
      console.log('未发现USB设备');
      return;
    }

    const device = usbDevices[0];
    console.log('发现USB设备:', device);

    // 解析设备ID获取vendorId和productId
    const match = device.id.match(/usb:(\d+):(\d+)/);
    if (!match) {
      console.error('无效的USB设备ID');
      return;
    }

    const vendorId = parseInt(match[1]);
    const productId = parseInt(match[2]);

    // 申请USB权限
    const permission = await Printer.requestUsbPermission(vendorId, productId);
    console.log('USB权限申请结果:', permission);

    // 连接USB设备
    await Printer.connect({
      type: 'usb',
      target: device.id
    });

    console.log('USB设备连接成功');

    // 打印测试
    const cmd = EscPos.init() + EscPos.text('USB连接测试', { align: 'center', bold: true }) + EscPos.cut();
    await Printer.sendRaw(cmd);

  } catch (error) {
    console.error('USB设备连接失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 7. 串口设备连接
export async function serialDeviceConnect() {
  try {
    const devices = await Printer.discover();
    const serialDevices = devices.filter(d => d.type === 'serial');
    
    if (serialDevices.length === 0) {
      console.log('未发现串口设备');
      return;
    }

    const device = serialDevices[0];
    console.log('发现串口设备:', device);

    // 连接串口设备
    await Printer.connect({
      type: 'serial',
      target: device.id,
      baudRate: 9600 // 波特率
    });

    console.log('串口设备连接成功');

    // 打印测试
    const cmd = EscPos.init() + EscPos.text('串口连接测试', { align: 'center', bold: true }) + EscPos.cut();
    await Printer.sendRaw(cmd);

  } catch (error) {
    console.error('串口设备连接失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 8. 蓝牙设备连接
export async function bluetoothDeviceConnect() {
  try {
    // 检查权限
    await Printer.checkPermissions();

    // 开始蓝牙扫描
    await Printer.startBluetoothScan();

    // 监听设备发现事件
    const subscription = Printer.addListener((event) => {
      if (event.type === 'device' && event.data.kind === 'incremental') {
        const device = event.data.delta[0];
        if (device && device.type === 'bluetooth') {
          console.log('发现蓝牙设备:', device);
          
          // 连接第一个发现的蓝牙设备
          Printer.connect({
            type: 'bluetooth',
            target: device.address
          }).then(() => {
            console.log('蓝牙设备连接成功');
            
            // 打印测试
            const cmd = EscPos.init() + EscPos.text('蓝牙连接测试', { align: 'center', bold: true }) + EscPos.cut();
            return Printer.sendRaw(cmd);
          }).catch(error => {
            console.error('蓝牙设备连接失败:', error);
          }).finally(() => {
            subscription.remove();
            Printer.stopBluetoothScan();
          });
        }
      }
    });

  } catch (error) {
    console.error('蓝牙设备连接失败:', error);
  }
}
