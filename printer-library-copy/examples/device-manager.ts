/**
 * 打印机设备管理器
 * 
 * 提供设备发现、连接管理、状态监控等功能的高级封装
 */

import { Printer, PrinterDevice, ConnectedPrinter, PrinterEvent } from 'react-native-escpos-printer';

export interface DeviceManagerOptions {
  /** 蓝牙扫描持续时间（毫秒） */
  bluetoothScanDuration?: number;
  /** 自动重连间隔（毫秒） */
  autoReconnectInterval?: number;
  /** 是否启用自动重连 */
  enableAutoReconnect?: boolean;
}

export interface PrinterInfo {
  /** 自定义打印机ID */
  id: string;
  /** 发现的设备信息 */
  device: PrinterDevice;
  /** 连接状态 */
  connected: boolean;
  /** 最后连接时间 */
  lastConnected?: Date;
  /** 连接失败次数 */
  failureCount: number;
}

export class PrinterDeviceManager {
  private discoveredDevices: PrinterDevice[] = [];
  private printerRegistry: Map<string, PrinterInfo> = new Map();
  private eventListener?: any;
  private autoReconnectTimer?: NodeJS.Timeout;
  private options: DeviceManagerOptions;

  constructor(options: DeviceManagerOptions = {}) {
    this.options = {
      bluetoothScanDuration: 5000,
      autoReconnectInterval: 30000,
      enableAutoReconnect: true,
      ...options
    };
  }

  /**
   * 初始化设备管理器
   */
  async initialize(): Promise<void> {
    // 检查权限
    const hasPermissions = await Printer.checkPermissions();
    if (!hasPermissions) {
      throw new Error('缺少必要权限，请先授权蓝牙和位置权限');
    }

    // 设置事件监听
    this.setupEventListeners();

    // 启动自动重连
    if (this.options.enableAutoReconnect) {
      this.startAutoReconnect();
    }

    console.log('打印机设备管理器已初始化');
  }

  /**
   * 发现所有可用设备
   */
  async discoverDevices(): Promise<PrinterDevice[]> {
    try {
      console.log('开始发现设备...');

      // 获取已配对/已连接的设备
      const initialDevices = await Printer.discover();
      this.discoveredDevices = [...initialDevices];
      console.log(`发现 ${initialDevices.length} 个已配对/已连接设备`);

      // 启动蓝牙扫描
      const scanStarted = await Printer.startBluetoothScan();
      if (scanStarted) {
        console.log(`蓝牙扫描已启动，持续 ${this.options.bluetoothScanDuration}ms...`);

        // 等待扫描完成
        await new Promise(resolve => setTimeout(resolve, this.options.bluetoothScanDuration!));

        // 停止扫描
        await Printer.stopBluetoothScan();
        console.log('蓝牙扫描已停止');

        // 重新获取设备列表
        this.discoveredDevices = await Printer.discover();
      }

      console.log(`设备发现完成，共找到 ${this.discoveredDevices.length} 个设备`);
      return this.discoveredDevices;
    } catch (error) {
      console.error('设备发现失败:', error);
      throw error;
    }
  }

  /**
   * 获取已发现的设备列表
   */
  getDiscoveredDevices(): PrinterDevice[] {
    return [...this.discoveredDevices];
  }

  /**
   * 按类型筛选设备
   */
  getDevicesByType(type: 'network' | 'bluetooth' | 'usb' | 'serial'): PrinterDevice[] {
    return this.discoveredDevices.filter(device => device.type === type);
  }

  /**
   * 注册打印机（给发现的设备分配自定义ID）
   */
  registerPrinter(printerId: string, device: PrinterDevice): void {
    this.printerRegistry.set(printerId, {
      id: printerId,
      device,
      connected: false,
      failureCount: 0
    });
    console.log(`打印机 ${printerId} 已注册 (${device.type}: ${device.name || device.id})`);
  }

  /**
   * 连接已注册的打印机
   */
  async connectPrinter(printerId: string): Promise<boolean> {
    const printerInfo = this.printerRegistry.get(printerId);
    if (!printerInfo) {
      throw new Error(`打印机 ${printerId} 未注册`);
    }

    try {
      console.log(`正在连接打印机 ${printerId}...`);

      // 对于USB设备，先申请权限
      if (printerInfo.device.type === 'usb' && printerInfo.device.id.startsWith('usb:')) {
        const [, vendorId, productId] = printerInfo.device.id.split(':');
        await Printer.requestUsbPermission(parseInt(vendorId), parseInt(productId));
      }

      // 连接打印机
      const result = await Printer.connectPrinterWithDevice(printerId, printerInfo.device);
      
      if (result) {
        printerInfo.connected = true;
        printerInfo.lastConnected = new Date();
        printerInfo.failureCount = 0;
        console.log(`打印机 ${printerId} 连接成功`);
      } else {
        printerInfo.failureCount++;
        console.warn(`打印机 ${printerId} 连接失败`);
      }

      return result;
    } catch (error) {
      printerInfo.failureCount++;
      console.error(`连接打印机 ${printerId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 断开打印机连接
   */
  async disconnectPrinter(printerId: string): Promise<void> {
    const printerInfo = this.printerRegistry.get(printerId);
    if (!printerInfo) {
      throw new Error(`打印机 ${printerId} 未注册`);
    }

    try {
      await Printer.disconnectPrinter(printerId);
      printerInfo.connected = false;
      console.log(`打印机 ${printerId} 已断开连接`);
    } catch (error) {
      console.error(`断开打印机 ${printerId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 连接所有已注册的打印机
   */
  async connectAllPrinters(): Promise<{[printerId: string]: boolean}> {
    const results: {[printerId: string]: boolean} = {};

    for (const [printerId, printerInfo] of this.printerRegistry) {
      if (!printerInfo.connected) {
        try {
          results[printerId] = await this.connectPrinter(printerId);
        } catch (error) {
          results[printerId] = false;
        }
      } else {
        results[printerId] = true;
      }
    }

    return results;
  }

  /**
   * 获取已注册打印机列表
   */
  getRegisteredPrinters(): PrinterInfo[] {
    return Array.from(this.printerRegistry.values());
  }

  /**
   * 获取已连接打印机列表
   */
  async getConnectedPrinters(): Promise<ConnectedPrinter[]> {
    return await Printer.getConnectedPrinters();
  }

  /**
   * 检查打印机连接状态
   */
  async checkPrinterStatus(printerId: string): Promise<boolean> {
    try {
      return await Printer.isPrinterConnected(printerId);
    } catch (error) {
      console.error(`检查打印机 ${printerId} 状态失败:`, error);
      return false;
    }
  }

  /**
   * 更新所有已注册打印机的连接状态
   */
  async updateAllPrinterStatus(): Promise<void> {
    for (const [printerId, printerInfo] of this.printerRegistry) {
      const isConnected = await this.checkPrinterStatus(printerId);
      printerInfo.connected = isConnected;
    }
  }

  /**
   * 获取打印机详细状态
   */
  async getPrinterDetailedStatus(printerId: string): Promise<any> {
    try {
      return await Printer.getPrinterStatus(printerId);
    } catch (error) {
      console.error(`获取打印机 ${printerId} 详细状态失败:`, error);
      return null;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.eventListener = Printer.addListener((event: PrinterEvent) => {
      switch (event.type) {
        case 'device':
          if (event.data?.delta) {
            // 新发现的设备
            console.log('发现新设备:', event.data.delta);
          }
          break;

        case 'state':
          const printerId = event.data?.printerId;
          if (printerId) {
            const printerInfo = this.printerRegistry.get(printerId);
            if (printerInfo) {
              printerInfo.connected = event.data?.state === 'connected';
              console.log(`打印机 ${printerId} 状态变更: ${event.data?.state}`);
            }
          }
          break;

        case 'error':
          const errorPrinterId = event.data?.printerId;
          if (errorPrinterId) {
            const printerInfo = this.printerRegistry.get(errorPrinterId);
            if (printerInfo) {
              printerInfo.connected = false;
              printerInfo.failureCount++;
              console.error(`打印机 ${errorPrinterId} 发生错误:`, event.data?.message);
            }
          }
          break;
      }
    });
  }

  /**
   * 启动自动重连
   */
  private startAutoReconnect(): void {
    this.autoReconnectTimer = setInterval(async () => {
      try {
        await this.updateAllPrinterStatus();
        
        // 重连断开的打印机
        for (const [printerId, printerInfo] of this.printerRegistry) {
          if (!printerInfo.connected && printerInfo.failureCount < 5) {
            console.log(`尝试重连打印机 ${printerId}...`);
            try {
              await this.connectPrinter(printerId);
            } catch (error) {
              // 忽略重连错误，避免日志噪音
            }
          }
        }
      } catch (error) {
        console.error('自动重连检查失败:', error);
      }
    }, this.options.autoReconnectInterval);
  }

  /**
   * 销毁设备管理器
   */
  destroy(): void {
    // 移除事件监听器
    if (this.eventListener) {
      this.eventListener.remove();
      this.eventListener = null;
    }

    // 停止自动重连
    if (this.autoReconnectTimer) {
      clearInterval(this.autoReconnectTimer);
      this.autoReconnectTimer = undefined;
    }

    console.log('打印机设备管理器已销毁');
  }
}

// 使用示例
export async function deviceManagerExample() {
  const deviceManager = new PrinterDeviceManager({
    bluetoothScanDuration: 8000,
    autoReconnectInterval: 60000,
    enableAutoReconnect: true
  });

  try {
    // 初始化
    await deviceManager.initialize();

    // 发现设备
    const devices = await deviceManager.discoverDevices();
    console.log('发现的设备:', devices);

    // 注册打印机
    const bluetoothDevices = deviceManager.getDevicesByType('bluetooth');
    if (bluetoothDevices.length > 0) {
      deviceManager.registerPrinter('bluetooth_receipt', bluetoothDevices[0]);
    }

    const usbDevices = deviceManager.getDevicesByType('usb');
    if (usbDevices.length > 0) {
      deviceManager.registerPrinter('usb_label', usbDevices[0]);
    }

    // 连接所有注册的打印机
    const connectResults = await deviceManager.connectAllPrinters();
    console.log('连接结果:', connectResults);

    // 获取连接状态
    const connectedPrinters = await deviceManager.getConnectedPrinters();
    console.log('已连接的打印机:', connectedPrinters);

    // 使用完毕后销毁
    // deviceManager.destroy();

  } catch (error) {
    console.error('设备管理器示例失败:', error);
  }
}
