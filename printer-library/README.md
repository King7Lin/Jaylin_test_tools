# @your-scope/rn-escpos-printer

React Native ESC/POS 打印机原生模块（Android），支持 network / bluetooth / usb / serial，多语言文本、二维码、条形码、图片与混合打印构建。

## 特性
- 多连接方式：Network(TCP 9100)、Bluetooth (SPP)、USB Bulk、USB Serial
- 指令级：原始 ESC/POS、文本样式（加粗/下划线/对齐/倍宽高/反白/双重）、二维码、条形码、分割线、切纸
- 图片打印：Base64 -> 灰度阈值 -> ESC * 位图输出
- 多语言：代码页切换 (cp936/cp950/cp932/...)
- 事件：device(full/incremental)、state、error、scan
- 混合打印构建：一次组装文本+二维码+条码+图片+自定义原始指令

## 安装
```
npm install @your-scope/rn-escpos-printer
# or
yarn add @your-scope/rn-escpos-printer
```
自动 linking (RN >=0.60)。如需手动：
```
npx react-native config
```

Android 需要的权限（AndroidManifest 自动合并）：
```
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-feature android:name="android.hardware.usb.host" />
```

**推荐使用内置权限检查方法**：
```ts
import {Printer} from '@your-scope/rn-escpos-printer';

// 自动检查并申请所有必要权限
const hasPermission = await Printer.checkPermissions();
if (!hasPermission) {
  console.error('权限不足，无法使用蓝牙和定位功能');
}
```

## 快速开始

### 传统字符串方式（兼容模式）
```ts
import {Printer, EscPos, printMixed} from '@your-scope/rn-escpos-printer';

async function demo(){
  // 1. 检查权限（推荐）
  const hasPermission = await Printer.checkPermissions();
  if (!hasPermission) {
    console.error('权限不足');
    return;
  }

  // 2. 连接打印机
  await Printer.connect({type:'network', target:'192.168.1.120:9100'});
  
  // 3. 构建打印命令
  const cmd = EscPos.init() 
    + EscPos.text('Hello',{align:'center', bold:true,width:2,height:2}) 
    + EscPos.cut();
  
  // 4. 发送打印
  await Printer.sendRaw(cmd);
  
  // 5. 断开连接
  await Printer.disconnect();
}
```

### 🆕 新的字节数组方式（推荐）
```ts
import {Printer, ByteCommands} from '@your-scope/rn-escpos-printer';

async function byteArrayDemo(){
  // 1. 连接打印机
  await Printer.connect({
    type: 'network',
    target: '192.168.1.100:9100',
  });

  // 2. 方式一：直接传递字节数组
  const rawCommand = [0x1b, 0x74, 0x00]; // ESC t 0 (设置字符集)
  await Printer.sendRawBytes(rawCommand);

  // 3. 方式二：使用ByteCommands构建器
  const commands = ByteCommands.combine(
    ByteCommands.init(),                    // 初始化
    ByteCommands.setChineseCodePage(),      // 中文编码页
    ByteCommands.styledText('你好世界！', {  // 样式文本
      bold: true,
      align: 'center'
    }),
    ByteCommands.feed(2),                   // 换行
    ByteCommands.setEnglishCodePage(),      // 英文编码页
    ByteCommands.textLine('Hello World!'), // 英文文本
    ByteCommands.qrcode('https://example.com'), // 二维码
    ByteCommands.cut()                      // 切纸
  );

  await Printer.sendRawBytes(commands);
  await Printer.disconnect();
}
```

### 字节数组 vs 字符串的优势
- ✅ **无编码问题**: 直接传递字节，避免字符转义错误
- ✅ **精确控制**: 每个字节都是你指定的值
- ✅ **更好性能**: 无需字符串转换过程
- ✅ **更清晰**: 命令意图明确，便于调试

## 事件
```ts
const sub = Printer.addListener(e => {
  switch(e.type){
    case 'device': console.log(e.data); break; // full: {kind:'full',list:[]}; incremental: {kind:'incremental',delta:[]}
    case 'state': console.log('state', e.data.state); break;
    case 'scan': console.log('scan', e.data.status); break;
    case 'error': console.warn('error', e.data.message); break;
  }
});
```

## API
| 方法 | 参数 | 说明 |
| ---- | ---- | ---- |
| checkPermissions() | - | 检查并申请Android权限 |
| discover() | - | 返回设备列表（并触发 device full 事件） |
| startBluetoothScan() / stopBluetoothScan() | - | 蓝牙扫描（增量 device 事件） |
| requestUsbPermission(vendorId, productId) | - | USB 权限申请 |
| connect({type,target,baudRate?,timeout?}) | - | 建立连接 |
| disconnect() | - | 断开连接 |
| sendRaw(data) | string | 发送 ESC/POS 原始指令串（兼容模式） |
| sendRawBytes(data) | number[] | 🆕 直接发送字节数组（推荐） |
| printImage(base64) | base64 | 直接打印图片 |
| uploadImageToMemory(base64, imageId) | base64, number | 上传图片到打印机内存 |
| printStoredImage(imageId) | number | 打印存储在内存中的图片 |
| deleteStoredImage(imageId) | number | 删除存储在内存中的图片 |
| getStatus() | - | 查询打印机状态（支持回包解析） |

## 设备 ID 格式
| 类型 | 示例 |
| ---- | ---- |
| network | 192.168.1.10:9100 |
| bluetooth | AA:BB:CC:DD:EE:FF |
| usb | usb:1155:22304 |
| serial | usb:1155:22304 (需 usb-serial 支持) |

## EscPos 工具
| 方法 | 描述 |
| ---- | ---- |
| init() | 初始化 |
| text(str, style) | 文本 + 样式 + 换行 + reset |
| textBlock(str, opts) | 兼容别名 |
| qrcode(data,size?,ec?) | 二维码 |
| barcode(data,opts) | 条形码 (CODE128/CODE39/EAN13/EAN8/UPC_A) |
| hr(char?,width?) | 分割线 |
| cut(partial?) | 切纸 |
| setAlign/bold/underline/... | 单项指令 (可直接拼) |

### 扩展常见指令
| 方法 | 说明 |
| ---- | ---- |
| feed(lines) | 走行 lines 行 (等价多次 `\n`) |
| feedDots(dots) | 按点走纸 ESC J n，可多次分包 |
| reverseFeed(dots) | 反向走纸 ESC K n (部分机型支持) |
| lineSpacing(n?) | 设置行间距 ESC 3 n；不传恢复默认 ESC 2 |
| charSpacing(n) | 字符间距 ESC SP n |
| selectFont('A'|'B') | 选择字体 A/B (宽高差异) |
| pulse(pin?,tOn?,tOff?) | 开钱箱 ESC p m t1 t2，tOn/Off 毫秒 (2ms 单位转换) |
| beep(times?,lengthMs?) | 蜂鸣 (使用 BEL 0x07 简化实现) |
| leftMargin(dots) | 左边距 GS L nL nH |
| printArea(widthDots) | 打印区域宽度 GS W nL nH |
| rotate(on) | 90° 旋转 (部分机型支持) |
| upsideDown(on) | 倒置 ESC { n |
| emphasize(on) | 等同 bold(on) |
| size(w,h) | 倍宽高 (1 或 2) |

示例：
```ts
const cmd = EscPos.init()
  + EscPos.pulse() // 开钱箱
  + EscPos.text('门店小票', {align:'center', bold:true, width:2,height:2})
  + EscPos.hr()
  + EscPos.text('数量  金额')
  + EscPos.text('1     25.00')
  + EscPos.feed(2)
  + EscPos.emphasize(true) + '合计: 25.00\n' + EscPos.emphasize(false)
  + EscPos.cut();
await Printer.sendRaw(cmd);
```

TextStyle: align, bold, underline, width, height, invert, doubleStrike, codePage。

扩展样式控制：可直接组合 `EscPos.selectFont('B') + EscPos.charSpacing(2) + EscPos.lineSpacing(48)` 以达到不同密度排版。

## 混合打印
```ts
import {printMixed, buildMixed} from '@your-scope/rn-escpos-printer';
import {MixedItem} from '@your-scope/rn-escpos-printer/dist/Mixed';

const items: MixedItem[] = [
  {kind:'text', content:'TITLE', style:{align:'center', bold:true, width:2,height:2}},
  {kind:'hr'},
  {kind:'barcode', content:'123456789012', opts:{type:'EAN13', text:true}},
  {kind:'qr', content:'https://example.com'},
  {kind:'text', content:'中文',{codePage:'cp936'}},
  {kind:'image', base64: '...'},
];
await printMixed(items, {cut:true});
```
按需先构建：
```ts
const {cmd, images} = buildMixed(items, {cut:true});
await Printer.sendRaw(cmd);
for (const img of images) await Printer.printImage(img.base64);
```

## 图片打印说明
- Base64 可包含或不包含 `data:image/png;base64,` 头部（调用前去除头部更稳妥）
- 建议宽度不超过纸张点宽（58mm 常见 384px，80mm 常见 576px）

## 多语言与代码页
示例：
```ts
EscPos.text('简体中文',{codePage:'cp936'});
EscPos.text('繁體中文',{codePage:'cp950'});
EscPos.text('日本語',{codePage:'cp932'});
```
打印机需支持对应代码页。

## 状态查询
`await Printer.getStatus()` 现在支持完整的回包解析，返回详细的状态信息：

```ts
const status = await Printer.getStatus();
console.log('打印机状态:', status);
// 输出: {
//   paperOut: false,      // 缺纸
//   drawerOpen: false,    // 钱箱打开
//   coverOpen: false,     // 盖板打开
//   paperNearEnd: false,   // 纸张即将用完
//   offline: false,       // 离线状态
//   error: false,         // 错误状态
//   paperJam: false,      // 卡纸
//   cutterError: false,   // 切刀错误
//   paperPresent: true,   // 有纸
//   paperEmpty: false,    // 无纸
//   paperLow: false,      // 纸张不足
//   timestamp: "1701234567890"
// }
```

## 图片上传到打印机内存
支持将图片上传到打印机内存，然后通过ID调用打印：

```ts
// 上传图片到打印机内存（ID: 1）
await Printer.uploadImageToMemory(base64Image, 1);

// 打印存储的图片
await Printer.printStoredImage(1);

// 删除存储的图片（可选）
await Printer.deleteStoredImage(1);
```

## 多打印机驱动支持

本库支持多种打印机类型，通过统一的 API 接口访问：

```ts
import { printMixed } from '@your-scope/rn-escpos-printer';

// ESC/POS 打印机
await printMixed('printer-001', items, {
  type: 'escpos',
  escpos: {
    type: 'network',
    target: '192.168.1.100:9100'
  }
});

// Imin 打印机
await printMixed('printer-002', items, {
  type: 'imin',
  imin: {
    address: '192.168.1.100',
    port: 9100,
    printerType: 'SPI'
  }
});

// XPrinter
await printMixed('printer-003', items, {
  type: 'xprinter',
  xprinter: {
    connectType: 'net',
    address: '192.168.1.100'
  }
});

// Epson 打印机
await printMixed('printer-004', items, {
  type: 'epson',
  epson: {
    series: 0,
    lang: 0,
    connectType: 'tcp',
    address: '192.168.1.100',
    port: 9100
  }
});
```

驱动管理器会自动复用连接，无需手动管理驱动实例。

## 📝 重要说明

**v3.0.0 重构更新**：
- ✅ 本库现在专注于**打印机驱动层**，提供纯粹的打印功能
- ❌ 数据库和队列功能已移除，由主项目管理
- 🔄 如需队列和配置管理，请参考主项目的 `src/printer-queue` 模块

## 错误码 (Promise reject code)
| code | 场景 |
| ---- | ---- |
| NO_CONN | 未连接发送指令 |
| CONNECT_FAIL | 连接失败 |
| NO_PERMISSION | USB/Serial 权限缺失 |
| NOT_FOUND | 设备未找到 |
| OPEN_FAIL | 打开设备失败 |
| NO_EP | 未找到 USB Bulk OUT 端点 |
| WRITE_FAIL | 写入失败 |
| IMG_FAIL | 图片打印失败 |
| DECODE_FAIL | 图片解码失败 |
| STATUS_FAIL | 状态查询失败 |
| ARG | 参数错误 |
| BUSY | 正在处理另一个 USB 权限请求 |
| DENY | 用户拒绝 USB 权限 |

## 发布准备
- 更新版本号 `package.json`
- 构建: `npm run build`
- 登录 npm: `npm login`
- 发布: `npm publish --access public`

## License
MIT
