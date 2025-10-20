/**
 * ESC/POS打印机TypeScript接口模块
 *
 * 本模块提供了与Android原生打印机模块交互的TypeScript接口，
 * 包括设备管理、连接控制、打印操作、状态查询等功能。
 *
 * 主要功能：
 * 1. 设备发现和连接管理
 * 2. 权限检查和申请
 * 3. 打印操作（文本、图片、原始指令）
 * 4. 状态查询和监控
 * 5. 事件监听和处理
 */

import {
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
  PermissionsAndroid,
  Platform,
} from 'react-native';

// 获取原生模块实例
const {PrinterModule} = NativeModules;

// 创建事件发射器，用于监听原生模块发送的事件
const emitter = new NativeEventEmitter(PrinterModule);

/**
 * 打印机设备信息类型定义
 *
 * @interface PrinterDevice
 * @property {string} id - 设备唯一标识符
 *   - 网络设备：IP:端口格式，如 "192.168.1.100:9100"
 *   - 蓝牙设备：MAC地址，如 "AA:BB:CC:DD:EE:FF"
 *   - USB设备：usb:厂商ID:产品ID格式，如 "usb:1155:22304"
 *   - 串口设备：与USB设备格式相同
 * @property {string} [name] - 设备名称（可选）
 * @property {string} [address] - 设备地址（可选）
 * @property {'TCP'|'UDP'|'USB'|'Bluetooth'|'Serial'} type - 设备连接类型
 */
export type PrinterDevice = {
  id: string;
  name?: string;
  address?: string;
  type: 'TCP' | 'UDP' | 'USB' | 'Bluetooth' | 'Serial';
};

/**
 * 打印机事件类型定义
 *
 * @interface PrinterEvent
 * @property {'device'|'state'|'error'|'scan'} type - 事件类型
 *   - device: 设备发现事件
 *   - state: 连接状态变化事件
 *   - error: 错误事件
 *   - scan: 蓝牙扫描状态事件
 * @property {any} [data] - 事件数据（可选）
 */
export type PrinterEvent = {
  type: 'device' | 'state' | 'error' | 'scan';
  data?: any;
};

/**
 * 打印机状态信息类型定义
 *
 * @interface PrinterStatus
 * @property {boolean} [paperOut] - 是否缺纸
 * @property {boolean} [drawerOpen] - 钱箱是否打开
 * @property {boolean} [coverOpen] - 打印机盖板是否打开
 * @property {boolean} [paperNearEnd] - 纸张是否即将用完
 * @property {boolean} [offline] - 是否离线
 * @property {boolean} [error] - 是否有错误
 * @property {boolean} [paperJam] - 是否卡纸
 * @property {boolean} [cutterError] - 切刀是否有错误
 * @property {boolean} [recoverableError] - 是否有可恢复错误
 * @property {boolean} [unrecoverableError] - 是否有不可恢复错误
 * @property {boolean} [paperPresent] - 是否有纸
 * @property {boolean} [paperEmpty] - 是否无纸
 * @property {boolean} [paperLow] - 纸张是否不足
 * @property {string} [timestamp] - 状态查询时间戳
 */
export type PrinterStatus = {
  paperOut?: boolean; // 缺纸状态
  drawerOpen?: boolean; // 钱箱打开状态
  coverOpen?: boolean; // 盖板打开状态
  paperNearEnd?: boolean; // 纸张即将用完
  offline?: boolean; // 离线状态
  error?: boolean; // 错误状态
  paperJam?: boolean; // 卡纸状态
  cutterError?: boolean; // 切刀错误
  recoverableError?: boolean; // 可恢复错误
  unrecoverableError?: boolean; // 不可恢复错误
  paperPresent?: boolean; // 有纸状态
  paperEmpty?: boolean; // 无纸状态
  paperLow?: boolean; // 纸张不足
  timestamp?: string; // 时间戳
};

/**
 * 多连接打印机信息类型定义
 *
 * @interface ConnectedPrinter
 * @property {string} id - 打印机唯一标识符
 * @property {string} type - 连接类型
 * @property {boolean} isActive - 是否为当前活动打印机
 */
export type ConnectedPrinter = {
  id: string;
  type: string;
  isActive: boolean;
};

/**
 * 打印机API类
 *
 * 提供所有打印机操作的统一接口，包括设备管理、连接控制、打印操作等功能。
 * 所有方法都是异步的，返回Promise对象。
 *
 * 新增功能：支持多打印机同时连接，不会相互干扰。
 */
class PrinterAPI {
  /**
   * 添加事件监听器
   *
   * @param cb 事件回调函数
   * @returns 事件订阅对象，可用于取消监听
   */
  addListener(cb: (e: PrinterEvent) => void): EmitterSubscription {
    return emitter.addListener('PrinterEvent', cb);
  }

  /**
   * 检查并申请必要的Android权限
   *
   * 功能说明：
   * 自动检查并申请使用打印机功能所需的Android权限，包括：
   * - 蓝牙扫描权限 (BLUETOOTH_SCAN)
   * - 蓝牙连接权限 (BLUETOOTH_CONNECT)
   * - 精确位置权限 (ACCESS_FINE_LOCATION)
   * - 粗略位置权限 (ACCESS_COARSE_LOCATION)
   *
   * 注意：Android 12+ 需要这些权限才能使用蓝牙功能
   *
   * @returns Promise<boolean> 权限申请结果，true表示所有权限都已授权
   */
  async checkPermissions(): Promise<boolean> {
    // 非Android平台直接返回true
    if (Platform.OS !== 'android') return true;

    try {
      // 定义需要申请的权限列表
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, // 蓝牙扫描权限
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, // 蓝牙连接权限
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // 精确位置权限
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION, // 粗略位置权限
      ];

      // 批量申请权限
      const results = await PermissionsAndroid.requestMultiple(permissions);

      // 检查所有权限是否都已授权
      return Object.values(results).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch (error) {
      console.warn('权限检查失败:', error);
      return false;
    }
  }

  /**
   * 发现可用设备
   *
   * 功能说明：
   * 扫描并返回所有可用的打印机设备，包括已配对的蓝牙设备和已连接的USB设备
   *
   * @returns Promise<PrinterDevice[]> 设备列表
   */
  discover(): Promise<PrinterDevice[]> {
    return PrinterModule.discover();
  }

  requestAllUsbPermissions(): Promise<boolean> {
    return PrinterModule.requestAllUsbPermissions();
  }

  /**
   * 开始蓝牙设备扫描
   *
   * 功能说明：
   * 启动蓝牙设备扫描，发现新的蓝牙打印机设备
   * 扫描过程中会通过事件发送发现的设备信息
   *
   * @returns Promise<boolean> 扫描启动结果
   */
  startBluetoothScan(): Promise<boolean> {
    return PrinterModule.startBluetoothScan();
  }

  /**
   * 停止蓝牙设备扫描
   *
   * @returns Promise<void>
   */
  stopBluetoothScan(): Promise<void> {
    return PrinterModule.stopBluetoothScan();
  }

  /**
   * 申请USB设备权限
   *
   * 功能说明：
   * 向用户申请指定USB设备的访问权限
   *
   * @param vendorId USB设备厂商ID
   * @param productId USB设备产品ID
   * @returns Promise<string> 权限申请结果，成功返回设备ID
   */
  requestUsbPermission(vendorId: number, productId: number): Promise<string> {
    return PrinterModule.requestUsbPermission(vendorId, productId);
  }

  /**
   * 连接打印机
   *
   * 功能说明：
   * 根据指定的连接参数连接到打印机设备
   *
   * @param params 连接参数
   * @param params.type 连接类型：'network' | 'bluetooth' | 'usb' | 'serial'
   * @param params.target 目标设备标识符
   * @param params.baudRate 波特率（仅串口连接需要）
   * @param params.timeout 连接超时时间（毫秒）
   * @returns Promise<boolean> 连接结果
   */
  connect(params: {
    type: string;
    target: string;
    baudRate?: number;
    timeout?: number;
  }): Promise<boolean> {
    return PrinterModule.connect(params);
  }

  /**
   * 断开打印机连接
   *
   * @returns Promise<void>
   */
  disconnect(): Promise<void> {
    return PrinterModule.disconnect();
  }

  /**
   * 发送原始ESC/POS指令
   *
   * 功能说明：
   * 向已连接的打印机发送原始ESC/POS指令数据
   *
   * @param data 指令数据，可以是字符串或字节数组
   * @returns Promise<void>
   */
  sendRaw(data: string | number[]): Promise<void> {
    return PrinterModule.sendRaw(
      typeof data === 'string' ? data : String.fromCharCode(...data),
    );
  }

  /**
   * 发送原始字节数组指令
   *
   * 功能说明：
   * 直接向打印机发送字节数组，不进行任何字符编码转换
   * 推荐使用此方法以避免字符编码问题
   *
   * @param data 字节数组，每个元素应为0-255之间的整数
   * @returns Promise<void>
   */
  sendRawBytes(data: number[]): Promise<void> {
    return PrinterModule.sendRawBytes(data);
  }

  /**
   * 查询打印机状态
   *
   * 功能说明：
   * 发送状态查询指令并解析回包，返回详细的打印机状态信息
   *
   * @returns Promise<PrinterStatus> 打印机状态信息
   */
  getStatus(): Promise<PrinterStatus> {
    return PrinterModule.getStatus();
  }

  /**
   * 直接打印图片
   *
   * 功能说明：
   * 将Base64编码的图片直接发送给打印机打印
   *
   * @param base64 Base64编码的图片数据
   * @returns Promise<boolean> 打印结果
   */
  printImage(base64: string): Promise<boolean> {
    return PrinterModule.printImage(base64);
  }

  /**
   * 直接打印图片（可配置）
   * @param base64 Base64编码的图片数据（可带/不带 data: 前缀，建议不带）
   * @param options 可选项：maxWidth（目标最大宽度，按8对齐），threshold（二值化阈值）
   *  - 常用 maxWidth：384（58mm），576（80mm常见），640/672/712/720（部分80mm机型）
   */
  printImageWithOptions(
    base64: string,
    options?: {maxWidth?: number; threshold?: number},
  ): Promise<boolean> {
    return PrinterModule.printImageWithOptions(base64, options || {});
  }

  /**
   * 栅格模式打印图片（GS v 0）
   *
   * 功能说明：
   * 使用更通用的栅格位图指令打印图片，兼容性更高
   *
   * @param base64 Base64编码的图片数据（不含 data: 前缀）
   * @returns Promise<boolean> 打印结果
   */
  printImageRaster(base64: string): Promise<boolean> {
    return PrinterModule.printImageRaster(base64);
  }

  /**
   * 上传图片到打印机内存
   *
   * 功能说明：
   * 将图片上传到打印机的NV内存中，通过ID进行后续调用
   * 适用于需要重复打印相同图片的场景
   *
   * @param base64 Base64编码的图片数据
   * @param imageId 图片ID（1-255）
   * @returns Promise<boolean> 上传结果
   */
  uploadImageToMemory(base64: string, imageId: number): Promise<boolean> {
    return PrinterModule.uploadImageToMemory(base64, imageId);
  }

  /**
   * 打印存储在内存中的图片
   *
   * 功能说明：
   * 通过图片ID打印已存储在打印机内存中的图片
   *
   * @param imageId 图片ID
   * @returns Promise<boolean> 打印结果
   */
  printStoredImage(imageId: number): Promise<boolean> {
    return PrinterModule.printStoredImage(imageId);
  }

  /**
   * 删除存储在内存中的图片
   *
   * 功能说明：
   * 从打印机内存中删除指定ID的图片，释放内存空间
   *
   * @param imageId 图片ID
   * @returns Promise<boolean> 删除结果
   */
  deleteStoredImage(imageId: number): Promise<boolean> {
    return PrinterModule.deleteStoredImage(imageId);
  }

  // ==================== 多连接API ====================

  /**
   * 连接到指定打印机（多连接版本）
   *
   * 功能说明：
   * 连接到指定ID的打印机，支持同时连接多台打印机而不会相互干扰
   *
   * 使用方式：
   * 1. 对于网络打印机：直接指定IP和端口
   * 2. 对于蓝牙/USB/串口：先使用discover()或startBluetoothScan()发现设备，然后使用设备信息连接
   *
   * @param printerId 打印机唯一标识符（自定义，用于后续操作识别）
   * @param params 连接参数
   * @param params.type 连接类型：'network' | 'bluetooth' | 'usb' | 'serial'
   * @param params.target 目标设备标识符
   *   - network: "IP:端口" 如 "192.168.1.100:9100"
   *   - bluetooth: MAC地址，如 "AA:BB:CC:DD:EE:FF"
   *   - usb: "usb:厂商ID:产品ID" 如 "usb:1155:22304"
   *   - serial: 同USB格式
   * @param params.baudRate 波特率（仅串口连接需要）
   * @param params.timeout 连接超时时间（毫秒）
   * @returns Promise<boolean> 连接结果
   */
  connectPrinter(
    printerId: string,
    params: {
      type: string;
      target: string;
      name?: string;
      baudRate?: number;
      timeout?: number;
    },
  ): Promise<boolean> {
    return (async () => {
      let newContent = '';
      switch (params.type) {
        case 'TCP':
          newContent = 'network';
          break;
        case 'USB':
          newContent = 'usb';
          break;
        case 'Bluetooth':
          newContent = 'bt';
          break;
        case 'Serial':
          newContent = 'serial';
          break;
        default:
          newContent = params.type;
          break;
      }
      const newParams = {
        ...params,
        type: newContent,
      };
      const ok = await PrinterModule.connectPrinter(printerId, newParams);
      
      if (ok) {
        console.log('✅ Printer 连接成功:', printerId, params.type);
        // ✅ 注意：打印机配置现在由外部（主项目）管理
        // 外部应使用 PrinterConfigManager.addPrinter() 保存配置
      } else {
        console.log('❌ Printer 连接失败:', printerId);
      }

      return ok;
    })();
  }

  /**
   * 使用发现的设备信息连接打印机（推荐方式）
   *
   * 功能说明：
   * 使用discover()或蓝牙扫描发现的设备信息直接连接打印机
   *
   * @param printerId 打印机唯一标识符（自定义）
   * @param device 通过discover()或事件获得的设备信息
   * @param options 额外连接选项
   * @returns Promise<boolean> 连接结果
   */
  async connectPrinterWithDevice(
    printerId: string,
    device: PrinterDevice,
    options?: {baudRate?: number; timeout?: number},
  ): Promise<boolean> {
    const params = {
      type: device.type,
      target: device.id, // 使用设备的ID作为target
      ...options,
    };

    return this.connectPrinter(printerId, params);
  }

  /**
   * 断开指定打印机连接（多连接版本）
   *
   * @param printerId 打印机ID
   * @returns Promise<void>
   */
  disconnectPrinter(printerId: string): Promise<void> {
    return PrinterModule.disconnectPrinter(printerId);
  }

  /**
   * 向指定打印机发送原始字节数组（多连接版本）
   *
   * 功能说明：
   * 直接向指定打印机发送字节数组，不进行任何字符编码转换
   * 推荐使用此方法以避免字符编码问题
   *
   * @param printerId 打印机ID
   * @param data 字节数组，每个元素应为0-255之间的整数
   * @returns Promise<void>
   */
  sendRawBytesToPrinter(printerId: string, data: number[]): Promise<void> {
    return PrinterModule.sendRawBytesToPrinter(printerId, data);
  }

  /**
   * 设置活动打印机（用于向后兼容单连接API）
   *
   * 功能说明：
   * 设置当前活动的打印机，旧的单连接API会使用这台打印机
   *
   * @param printerId 打印机ID
   * @returns Promise<boolean> 设置结果
   */
  setActivePrinter(printerId: string): Promise<boolean> {
    return PrinterModule.setActivePrinter(printerId);
  }

  /**
   * 获取所有已连接的打印机列表
   *
   * @returns Promise<ConnectedPrinter[]> 已连接打印机列表
   */
  getConnectedPrinters(): Promise<ConnectedPrinter[]> {
    return PrinterModule.getConnectedPrinters();
  }

  /**
   * 检查指定打印机是否已连接
   *
   * @param printerId 打印机ID
   * @returns Promise<boolean> 连接状态
   */
  isPrinterConnected(printerId: string): Promise<boolean> {
    return PrinterModule.isPrinterConnected(printerId);
  }

  /**
   * 查询指定打印机状态（多连接版本）
   *
   * 功能说明：
   * 发送状态查询指令并解析回包，返回详细的打印机状态信息
   *
   * @param printerId 打印机ID
   * @returns Promise<PrinterStatus> 打印机状态信息
   */
  getPrinterStatus(printerId: string): Promise<PrinterStatus> {
    return PrinterModule.getPrinterStatus(printerId);
  }

  /**
   * 向指定打印机打印图片（多连接版本）
   *
   * 功能说明：
   * 将Base64编码的图片直接发送给指定打印机打印
   *
   * @param printerId 打印机ID
   * @param base64 Base64编码的图片数据
   * @returns Promise<boolean> 打印结果
   */
  printImageToPrinter(printerId: string, base64: string): Promise<boolean> {
    return PrinterModule.printImageToPrinter(printerId, base64);
  }

  /**
   * 向指定打印机打印图片（可配置）
   * @param printerId 打印机ID
   * @param base64 Base64编码的图片数据
   * @param options 可选项，同 printImageWithOptions
   */
  printImageToPrinterWithOptions(
    printerId: string,
    base64: string,
    options?: {maxWidth?: number; threshold?: number},
  ): Promise<boolean> {
    return PrinterModule.printImageToPrinterWithOptions(
      printerId,
      base64,
      options || {},
    );
  }
}

/**
 * 打印机API实例
 * 导出单例对象，供外部使用
 */
export const Printer = new PrinterAPI();

/**
 * 默认导出打印机API实例
 */
export default Printer;
