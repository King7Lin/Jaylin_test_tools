net:
await driverManager.getDriver('net_printer_001', {
  __driverType: 'xprinter',
  connectType: 'net',
  address: '192.168.1.100:9100'  // IP:端口
});
usb:
await driverManager.getDriver('usb_printer_001', {
  __driverType: 'xprinter',
  connectType: 'usb',
  address: 'USB:1234,5678,/dev/usb/lp0'  // USB设备路径
});
BT:
await driverManager.getDriver('bt_printer_001', {
  __driverType: 'xprinter',
  connectType: 'bt',
  address: '00:11:22:33:44:55'  // 蓝牙MAC地址
});
serial:
await driverManager.getDriver('serial_printer_001', {
  __driverType: 'xprinter',
  connectType: 'serial',
  address: 'COM1:9600'  // 端口:波特率
});
await driverManager.getDriver('my_printer', {
  __driverType: 'xprinter',
  connectType: 'net',
  address: '192.168.1.100:9100',
  retryCount: 3,     // 重试次数，默认3
  retryDelay: 800,   // 重试延迟毫秒，默认800
  autoReconnect: true // 自动重连，默认true
});