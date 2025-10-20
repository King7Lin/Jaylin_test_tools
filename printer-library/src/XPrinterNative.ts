import {NativeEventEmitter, NativeModules} from 'react-native';

// ---------------------------------------------------------------------------
// XPrinterNative.ts
// ---------------------------------------------------------------------------
// 作用：提供对原生 `XPrinterModule` 的统一入口，解决以下问题：
// 1. 在模拟器或未正确链接原生模块时，直接调用可能抛错，这里做"兜底返回"。
// 2. 把所有事件监听逻辑集中管理，业务层只需调用 addConnectListener / addNetDeviceListener。
// 3. 补充详细注释，说明每个方法对应原生 SDK 中的能力，方便维护。
// 4. 便于在 JS 层快速 mock：若未来需要离线调试，可在此处替换实现。

// 类型定义
export interface XPrinterDevice {
  name?: string;
  address?: string;
  type?: 'usb' | 'net' | 'bt' | 'serial';
}

export interface XPrinterConnectEvent {
  success: boolean;
  message?: string;
  device?: XPrinterDevice;
}

export interface XPrinterNetDeviceEvent {
  name: string;
  address: string;
  port?: number;
}

// 从 React Native 桥接层中拿到原生模块。若安卓端未正确链接，该值为 undefined。
const {XPrinterModule} = NativeModules || {};

// 统一封装安全调用：当原生方法不存在时返回兜底值，避免 JS 层直接崩溃。
const safeCall = async <T = any>(
  method: string,
  ...args: any[]
): Promise<T> => {
  // 原生模块缺失时直接返回空结果，保证调用方不会因为 `undefined` 抛异常。
  if (!XPrinterModule || typeof XPrinterModule[method] !== 'function') {
    // UDP 扫描没有返回值，直接返回 null；其余接口统一返回空数组。
    return (method === 'scanNetDevices' ? null : []) as T;
  }
  return XPrinterModule[method](...args);
};

// 原生侧通过事件推送扫描/连接状态，这里创建对应的事件发射器。
// 注意：只有在 Android 原生模块正确链接时 emitter 才存在。
const emitter = XPrinterModule ? new NativeEventEmitter(XPrinterModule) : null;

export interface XPrinterNativeInterface {
  // 初始化 POSConnect，原生 SDK 要求先执行一次。
  init(): Promise<void>;
  // 建立连接。type: usb/net/bt/serial；address 与 demo 相同；printerId 用于多设备管理。
  connect(type: string, address: string, printerId?: string): Promise<any>;
  // 主动断开连接。适合在切换设备或手动释放资源时使用。
  disconnect(printerId?: string): Promise<void>;
  // 列出 USB 设备 ("USB:VID,PID,Path")。
  getUsbDevices(): Promise<string[]>;
  // 列出串口列表 (COM/tty)。
  getSerialPorts(): Promise<string[]>;
  // 列出已配对蓝牙。
  listBondedBluetooth(): Promise<XPrinterDevice[]>;
  // 启动 UDP 搜索网口打印机，结果以事件形式返回。
  scanNetDevices(): Promise<void>;
  // 事件发射器
  emitter: NativeEventEmitter | null;
  // 监听连接状态变更事件。
  addConnectListener(callback: (event: XPrinterConnectEvent) => void): {
    remove: () => void;
  };
  // 监听 UDP 扫描到的网口设备。
  addNetDeviceListener(callback: (event: XPrinterNetDeviceEvent) => void): {
    remove: () => void;
  };
  // 探测串口
  probeSerialPorts(baudRate?: number, timeoutMs?: number): Promise<string[]>;
}

export const xprinterNative: XPrinterNativeInterface = {
  // 初始化 POSConnect，原生 SDK 要求先执行一次。
  init: () => safeCall('init'),
  // 建立连接。type: usb/net/bt/serial；address 与 demo 相同。
  connect: (type: string, address: string) =>
    safeCall('connect', type, address),
  // 主动断开连接。适合在切换设备或手动释放资源时使用。
  disconnect: () => safeCall('disconnect'),
  // 列出 USB 设备 ("USB:VID,PID,Path")。
  getUsbDevices: () => safeCall<string[]>('getUsbDevices'),
  // 列出串口列表 (COM/tty)。
  getSerialPorts: () => safeCall<string[]>('getSerialPorts'),
  // 列出已配对蓝牙。
  listBondedBluetooth: () => safeCall<XPrinterDevice[]>('listBondedBluetooth'),
  // 启动 UDP 搜索网口打印机，结果以事件形式返回。
  scanNetDevices: () => safeCall<void>('scanNetDevices'),
  emitter,
  // 监听连接状态变更事件。
  addConnectListener: (callback: (event: XPrinterConnectEvent) => void) =>
    emitter
      ? emitter.addListener('XPrinterConnect', callback)
      : {remove: () => {}},
  // 监听 UDP 扫描到的网口设备。
  addNetDeviceListener: (callback: (event: XPrinterNetDeviceEvent) => void) =>
    emitter
      ? emitter.addListener('XPrinterNetDevice', callback)
      : {remove: () => {}},
  // 探测串口
  probeSerialPorts: (baudRate?: number, timeoutMs?: number) =>
    safeCall<string[]>(
      'probeSerialPorts',
      baudRate ?? 115200,
      timeoutMs ?? 800,
    ),
};

export default xprinterNative;
