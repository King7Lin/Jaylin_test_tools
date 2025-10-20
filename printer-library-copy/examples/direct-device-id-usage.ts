/**
 * 直接使用设备ID作为打印机ID的使用示例
 * 
 * 这是最直接的使用方式：
 * 1. 搜索设备获得设备ID
 * 2. 存储设备ID
 * 3. 直接用设备ID作为打印机ID进行操作
 */

import { Printer, PrinterDevice, ByteCommands } from 'react-native-escpos-printer';

export class DirectDeviceIdExample {
  
  // 存储发现的设备ID
  private discoveredDeviceIds: string[] = [];
  
  /**
   * 搜索并存储所有可用设备ID
   */
  async discoverAndStoreDeviceIds(): Promise<string[]> {
    try {
      console.log('开始搜索设备...');
      
      // 1. 检查权限
      const hasPermissions = await Printer.checkPermissions();
      if (!hasPermissions) {
        throw new Error('权限不足');
      }

      // 2. 搜索已配对/已连接的设备
      let devices = await Printer.discover();
      console.log('初始发现的设备:', devices);

      // 3. 启动蓝牙扫描发现更多设备
      const scanStarted = await Printer.startBluetoothScan();
      if (scanStarted) {
        console.log('蓝牙扫描中...');
        
        // 监听新发现的设备
        const listener = Printer.addListener((event) => {
          if (event.type === 'device' && event.data?.delta) {
            console.log('发现新设备:', event.data.delta);
          }
        });

        // 扫描5秒
        await new Promise(resolve => setTimeout(resolve, 5000));
        await Printer.stopBluetoothScan();
        listener.remove();
        
        // 重新获取完整设备列表
        devices = await Printer.discover();
      }

      // 4. 提取并存储所有设备ID
      this.discoveredDeviceIds = devices.map(device => device.id);
      
      console.log('所有可用设备ID:', this.discoveredDeviceIds);
      console.log('设备详情:', devices);
      
      return this.discoveredDeviceIds;
    } catch (error) {
      console.error('搜索设备失败:', error);
      throw error;
    }
  }

  /**
   * 直接使用设备ID连接打印机
   */
  async connectWithDeviceId(deviceId: string): Promise<boolean> {
    try {
      // 根据设备ID格式判断设备类型
      let deviceType: string;
      
      if (deviceId.includes(':') && deviceId.split(':').length === 6) {
        // 蓝牙MAC地址格式: AA:BB:CC:DD:EE:FF
        deviceType = 'bluetooth';
      } else if (deviceId.startsWith('usb:')) {
        // USB设备格式: usb:厂商ID:产品ID
        deviceType = 'usb';
        
        // USB设备需要申请权限
        const parts = deviceId.split(':');
        if (parts.length >= 3) {
          const vendorId = parseInt(parts[1]);
          const productId = parseInt(parts[2]);
          await Printer.requestUsbPermission(vendorId, productId);
        }
      } else if (deviceId.includes('.') && deviceId.includes(':')) {
        // 网络地址格式: IP:端口
        deviceType = 'network';
      } else {
        // 假设是串口设备
        deviceType = 'serial';
      }

      // 直接使用设备ID作为打印机ID连接
      const result = await Printer.connectPrinter(deviceId, {
        type: deviceType,
        target: deviceId
      });

      console.log(`设备 ${deviceId} 连接${result ? '成功' : '失败'}`);
      return result;
    } catch (error) {
      console.error(`连接设备 ${deviceId} 失败:`, error);
      return false;
    }
  }

  /**
   * 连接所有发现的设备
   */
  async connectAllDiscoveredDevices(): Promise<{[deviceId: string]: boolean}> {
    const results: {[deviceId: string]: boolean} = {};
    
    for (const deviceId of this.discoveredDeviceIds) {
      results[deviceId] = await this.connectWithDeviceId(deviceId);
    }
    
    return results;
  }

  /**
   * 直接向指定设备ID打印
   */
  async printToDevice(deviceId: string, content: string): Promise<boolean> {
    try {
      // 检查设备是否已连接
      const isConnected = await Printer.isPrinterConnected(deviceId);
      if (!isConnected) {
        console.log(`设备 ${deviceId} 未连接，尝试连接...`);
        const connected = await this.connectWithDeviceId(deviceId);
        if (!connected) {
          throw new Error('连接失败');
        }
      }

      // 准备打印数据
      const printData = ByteCommands.combine([
        ByteCommands.init(),
        ByteCommands.textLine(content),
        ByteCommands.textLine(`设备ID: ${deviceId}`),
        ByteCommands.textLine(`时间: ${new Date().toLocaleString()}`),
        ByteCommands.feed(2),
        ByteCommands.cut()
      ]);

      // 直接使用设备ID打印
      await Printer.sendRawBytesToPrinter(deviceId, printData);
      console.log(`已向设备 ${deviceId} 发送打印任务`);
      
      return true;
    } catch (error) {
      console.error(`向设备 ${deviceId} 打印失败:`, error);
      return false;
    }
  }

  /**
   * 获取已连接的设备ID列表
   */
  async getConnectedDeviceIds(): Promise<string[]> {
    const connectedPrinters = await Printer.getConnectedPrinters();
    return connectedPrinters.map(printer => printer.id);
  }

  /**
   * 断开指定设备
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await Printer.disconnectPrinter(deviceId);
      console.log(`设备 ${deviceId} 已断开`);
    } catch (error) {
      console.error(`断开设备 ${deviceId} 失败:`, error);
    }
  }

  /**
   * 断开所有设备
   */
  async disconnectAllDevices(): Promise<void> {
    const connectedIds = await this.getConnectedDeviceIds();
    
    for (const deviceId of connectedIds) {
      await this.disconnectDevice(deviceId);
    }
    
    console.log('所有设备已断开');
  }

  /**
   * 获取存储的设备ID列表
   */
  getStoredDeviceIds(): string[] {
    return [...this.discoveredDeviceIds];
  }
}

// 使用示例
export async function directDeviceIdDemo() {
  const example = new DirectDeviceIdExample();

  try {
    console.log('=== 直接使用设备ID示例 ===');

    // 1. 搜索并存储设备ID
    const deviceIds = await example.discoverAndStoreDeviceIds();
    console.log('发现的设备ID:', deviceIds);

    // 2. 选择要连接的设备（这里连接所有设备）
    const connectResults = await example.connectAllDiscoveredDevices();
    console.log('连接结果:', connectResults);

    // 3. 获取已连接的设备
    const connectedIds = await example.getConnectedDeviceIds();
    console.log('已连接的设备ID:', connectedIds);

    // 4. 向每个连接的设备打印测试内容
    for (const deviceId of connectedIds) {
      await example.printToDevice(deviceId, `测试打印 - ${deviceId}`);
    }

    // 5. 网络打印机示例（直接用IP作为ID）
    try {
      const networkId = '192.168.1.100:9100';
      const networkConnected = await example.connectWithDeviceId(networkId);
      if (networkConnected) {
        await example.printToDevice(networkId, '网络打印机测试');
      }
    } catch (error) {
      console.log('网络打印机测试跳过:', error.message);
    }

    console.log('=== 示例完成 ===');

  } catch (error) {
    console.error('示例执行失败:', error);
  } finally {
    // 清理：断开所有设备
    await example.disconnectAllDevices();
  }
}

// 简化版本 - 最直接的使用方式
export async function simpleDirectUsage() {
  try {
    // 1. 搜索设备
    const devices = await Printer.discover();
    
    // 2. 选择第一个蓝牙设备
    const bluetoothDevice = devices.find(d => d.type === 'bluetooth');
    if (bluetoothDevice) {
      const deviceId = bluetoothDevice.id; // 例如: "AA:BB:CC:DD:EE:FF"
      
      // 3. 直接用设备ID作为打印机ID连接
      await Printer.connectPrinter(deviceId, {
        type: 'bluetooth',
        target: deviceId
      });
      
      // 4. 直接用设备ID打印
      const data = ByteCommands.combine([
        ByteCommands.textLine('Hello World!'),
        ByteCommands.cut()
      ]);
      await Printer.sendRawBytesToPrinter(deviceId, data);
      
      console.log(`已向设备 ${deviceId} 发送打印任务`);
    }
    
    // 网络打印机更简单 - 直接用IP作为ID
    const networkId = '192.168.1.100:9100';
    await Printer.connectPrinter(networkId, {
      type: 'network',
      target: networkId
    });
    
    const networkData = ByteCommands.combine([
      ByteCommands.textLine('网络打印测试'),
      ByteCommands.cut()
    ]);
    await Printer.sendRawBytesToPrinter(networkId, networkData);
    
  } catch (error) {
    console.error('简单示例失败:', error);
  }
}
