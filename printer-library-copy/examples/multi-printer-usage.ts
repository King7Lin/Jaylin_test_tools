/**
 * 多打印机同时连接使用示例
 * 
 * 本示例展示如何使用新的多连接API同时连接和使用多台打印机
 * 重点演示设备发现和连接的正确流程
 */

import { Printer, ConnectedPrinter, PrinterDevice, ByteCommands } from 'react-native-escpos-printer';

export class MultiPrinterExample {
  
  /**
   * 示例1：发现并连接多台打印机（推荐方式）
   */
  async discoverAndConnectPrinters() {
    try {
      console.log('开始发现可用设备...');
      
      // 1. 检查权限
      const hasPermissions = await Printer.checkPermissions();
      if (!hasPermissions) {
        throw new Error('缺少必要权限，请授权后重试');
      }

      // 2. 发现已配对的蓝牙设备和已连接的USB设备
      const discoveredDevices = await Printer.discover();
      console.log('发现的设备:', discoveredDevices);

      // 3. 启动蓝牙扫描以发现更多设备
      const scanStarted = await Printer.startBluetoothScan();
      if (scanStarted) {
        console.log('蓝牙扫描已启动，等待发现新设备...');
        
        // 监听设备发现事件
        const listener = Printer.addListener((event) => {
          if (event.type === 'device' && event.data?.delta) {
            console.log('发现新设备:', event.data.delta);
            // 这里可以更新设备列表
          }
        });

        // 扫描5秒钟
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 停止扫描
        await Printer.stopBluetoothScan();
        listener.remove();
        console.log('蓝牙扫描已停止');
      }

      // 4. 重新获取所有发现的设备
      const allDevices = await Printer.discover();
      console.log('所有可用设备:', allDevices);

      // 5. 选择设备并连接
      const connectedPrinters: {[key: string]: boolean} = {};

      // 连接网络打印机（直接连接，无需发现）
      try {
        const networkResult = await Printer.connectPrinter('kitchen_printer', {
          type: 'network',
          target: '192.168.1.100:9100',
          timeout: 5000
        });
        connectedPrinters['kitchen_printer'] = networkResult;
        console.log('厨房网络打印机连接:', networkResult);
      } catch (error) {
        console.warn('厨房网络打印机连接失败:', error);
      }

      // 连接第一个发现的蓝牙设备
      const bluetoothDevices = allDevices.filter(d => d.type === 'bluetooth');
      if (bluetoothDevices.length > 0) {
        try {
          const bluetoothResult = await Printer.connectPrinterWithDevice('bluetooth_printer', bluetoothDevices[0]);
          connectedPrinters['bluetooth_printer'] = bluetoothResult;
          console.log(`蓝牙打印机连接 (${bluetoothDevices[0].name}):`, bluetoothResult);
        } catch (error) {
          console.warn('蓝牙打印机连接失败:', error);
        }
      }

      // 连接第一个发现的USB设备
      const usbDevices = allDevices.filter(d => d.type === 'usb');
      if (usbDevices.length > 0) {
        try {
          // 对于USB设备，可能需要先申请权限
          if (usbDevices[0].id.startsWith('usb:')) {
            const parts = usbDevices[0].id.split(':');
            if (parts.length >= 3) {
              const vendorId = parseInt(parts[1]);
              const productId = parseInt(parts[2]);
              await Printer.requestUsbPermission(vendorId, productId);
            }
          }
          
          const usbResult = await Printer.connectPrinterWithDevice('usb_printer', usbDevices[0]);
          connectedPrinters['usb_printer'] = usbResult;
          console.log(`USB打印机连接 (${usbDevices[0].name}):`, usbResult);
        } catch (error) {
          console.warn('USB打印机连接失败:', error);
        }
      }

      // 获取所有已连接的打印机
      const connectedList = await Printer.getConnectedPrinters();
      console.log('最终已连接的打印机:', connectedList);
      
      return { connectedPrinters, allDevices, connectedList };
    } catch (error) {
      console.error('发现和连接打印机失败:', error);
      throw error;
    }
  }

  /**
   * 示例1b：直接连接已知设备（适用于网络打印机或已知设备信息）
   */
  async connectKnownPrinters() {
    try {
      // 连接已知的网络打印机
      const kitchen = await Printer.connectPrinter('kitchen_printer', {
        type: 'network',
        target: '192.168.1.100:9100',
        timeout: 5000
      });
      console.log('厨房打印机连接:', kitchen);

      // 连接已知的蓝牙设备（需要先配对）
      const bluetooth = await Printer.connectPrinter('bluetooth_printer', {
        type: 'bluetooth',
        target: 'AA:BB:CC:DD:EE:FF' // 已知的蓝牙MAC地址
      });
      console.log('蓝牙打印机连接:', bluetooth);

      // 连接已知的USB设备
      const usb = await Printer.connectPrinter('usb_printer', {
        type: 'usb',
        target: 'usb:1155:22304' // 已知的USB厂商ID和产品ID
      });
      console.log('USB打印机连接:', usb);

      return { kitchen, bluetooth, usb };
    } catch (error) {
      console.error('连接已知打印机失败:', error);
      throw error;
    }
  }

  /**
   * 示例2：向不同打印机发送不同内容
   */
  async printToMultiplePrinters() {
    try {
      // 厨房打印机 - 打印菜单
      const kitchenOrder = ByteCommands.combine([
        ByteCommands.init(),
        ByteCommands.setAlign('center'),
        ByteCommands.bold(true),
        ByteCommands.textLine('=== 厨房订单 ==='),
        ByteCommands.bold(false),
        ByteCommands.setAlign('left'),
        ByteCommands.textLine('桌号: 8号桌'),
        ByteCommands.textLine('时间: ' + new Date().toLocaleString()),
        ByteCommands.textLine(''),
        ByteCommands.textLine('菜品:'),
        ByteCommands.textLine('- 宫保鸡丁 x1'),
        ByteCommands.textLine('- 麻婆豆腐 x1'),
        ByteCommands.textLine('- 米饭 x2'),
        ByteCommands.textLine(''),
        ByteCommands.textLine('备注: 不要辣'),
        ByteCommands.feed(3),
        ByteCommands.cut()
      ]);

      await Printer.sendRawBytesToPrinter('kitchen_printer', kitchenOrder);
      console.log('厨房订单已发送');

      // 收银台打印机 - 打印收据
      const receipt = ByteCommands.combine([
        ByteCommands.init(),
        ByteCommands.setAlign('center'),
        ByteCommands.bold(true),
        ByteCommands.size(2, 2),
        ByteCommands.textLine('美食餐厅'),
        ByteCommands.size(1, 1),
        ByteCommands.bold(false),
        ByteCommands.textLine('收银收据'),
        ByteCommands.textLine('================================'),
        ByteCommands.setAlign('left'),
        ByteCommands.textLine('订单号: 20240916001'),
        ByteCommands.textLine('桌号: 8号桌'),
        ByteCommands.textLine('时间: ' + new Date().toLocaleString()),
        ByteCommands.textLine(''),
        ByteCommands.textLine('商品明细:'),
        ByteCommands.textLine('宫保鸡丁           ￥28.00'),
        ByteCommands.textLine('麻婆豆腐           ￥18.00'),
        ByteCommands.textLine('米饭 x2            ￥6.00'),
        ByteCommands.textLine('--------------------------------'),
        ByteCommands.textLine('小计:              ￥52.00'),
        ByteCommands.textLine('服务费(10%):       ￥5.20'),
        ByteCommands.bold(true),
        ByteCommands.textLine('合计:              ￥57.20'),
        ByteCommands.bold(false),
        ByteCommands.textLine(''),
        ByteCommands.textLine('支付方式: 微信支付'),
        ByteCommands.setAlign('center'),
        ByteCommands.textLine('谢谢惠顾！'),
        ByteCommands.feed(3),
        ByteCommands.cut()
      ]);

      await Printer.sendRawBytesToPrinter('cashier_printer', receipt);
      console.log('收银收据已打印');

      // USB打印机 - 打印标签
      const label = ByteCommands.combine([
        ByteCommands.init(),
        ByteCommands.setAlign('center'),
        ByteCommands.bold(true),
        ByteCommands.textLine('配送标签'),
        ByteCommands.bold(false),
        ByteCommands.textLine(''),
        ByteCommands.textLine('订单: 20240916001'),
        ByteCommands.textLine('桌号: 8号桌'),
        ByteCommands.textLine('时间: ' + new Date().toLocaleTimeString()),
        ByteCommands.feed(2),
        ByteCommands.cut()
      ]);

      await Printer.sendRawBytesToPrinter('usb_printer', label);
      console.log('配送标签已打印');

    } catch (error) {
      console.error('打印失败:', error);
      throw error;
    }
  }

  /**
   * 示例3：检查所有打印机状态
   */
  async checkAllPrinterStatus() {
    try {
      const connectedPrinters = await Printer.getConnectedPrinters();
      const statusResults: Array<{id: string, status: any}> = [];

      for (const printer of connectedPrinters) {
        try {
          const status = await Printer.getPrinterStatus(printer.id);
          statusResults.push({
            id: printer.id,
            status: status
          });
          console.log(`${printer.id} 状态:`, status);
        } catch (error) {
          console.error(`获取 ${printer.id} 状态失败:`, error);
          statusResults.push({
            id: printer.id,
            status: { error: true, message: error.message }
          });
        }
      }

      return statusResults;
    } catch (error) {
      console.error('检查打印机状态失败:', error);
      throw error;
    }
  }

  /**
   * 示例4：向指定打印机打印图片
   */
  async printImageToSpecificPrinter(printerId: string, base64Image: string) {
    try {
      // 检查打印机是否连接
      const isConnected = await Printer.isPrinterConnected(printerId);
      if (!isConnected) {
        throw new Error(`打印机 ${printerId} 未连接`);
      }

      // 打印图片
      const result = await Printer.printImageToPrinter(printerId, base64Image);
      console.log(`图片已发送到 ${printerId}:`, result);
      
      return result;
    } catch (error) {
      console.error(`向 ${printerId} 打印图片失败:`, error);
      throw error;
    }
  }

  /**
   * 示例5：断开所有打印机连接
   */
  async disconnectAllPrinters() {
    try {
      const connectedPrinters = await Printer.getConnectedPrinters();
      
      for (const printer of connectedPrinters) {
        try {
          await Printer.disconnectPrinter(printer.id);
          console.log(`${printer.id} 已断开连接`);
        } catch (error) {
          console.error(`断开 ${printer.id} 失败:`, error);
        }
      }

      console.log('所有打印机已断开连接');
    } catch (error) {
      console.error('断开打印机连接失败:', error);
      throw error;
    }
  }

  /**
   * 示例6：使用向后兼容的单连接API
   */
  async useBackwardCompatibleAPI() {
    try {
      // 首先连接一台打印机
      await Printer.connectPrinter('main_printer', {
        type: 'network',
        target: '192.168.1.100:9100'
      });

      // 设置为活动打印机
      await Printer.setActivePrinter('main_printer');

      // 现在可以使用旧的单连接API，它们会自动使用活动打印机
      const testData = ByteCommands.combine([
        ByteCommands.init(),
        ByteCommands.textLine('测试向后兼容API'),
        ByteCommands.textLine('这条消息使用旧的API发送'),
        ByteCommands.feed(2),
        ByteCommands.cut()
      ]);

      await Printer.sendRawBytes(testData);
      console.log('向后兼容API测试成功');

    } catch (error) {
      console.error('向后兼容API测试失败:', error);
      throw error;
    }
  }
}

// 使用示例
export async function runMultiPrinterDemo() {
  const example = new MultiPrinterExample();
  
  try {
    console.log('=== 多打印机连接演示开始 ===');
    
    // 1. 连接多台打印机
    await example.connectMultiplePrinters();
    
    // 2. 向不同打印机发送不同内容
    await example.printToMultiplePrinters();
    
    // 3. 检查所有打印机状态
    await example.checkAllPrinterStatus();
    
    // 4. 测试向后兼容API
    await example.useBackwardCompatibleAPI();
    
    console.log('=== 演示完成 ===');
    
  } catch (error) {
    console.error('演示过程中发生错误:', error);
  } finally {
    // 清理：断开所有连接
    await example.disconnectAllPrinters();
  }
}
