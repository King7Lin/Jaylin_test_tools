# Printer Library 重构指南

## 重构概述

本次重构主要目标是优化打印机库的架构，提供更清晰的接口和更好的代码组织。

## 主要改进

### 1. 统一的驱动接口 (`IPrinterDriver`)

所有打印机驱动现在都实现统一的接口：

```typescript
interface IPrinterDriver {
  connect(printerId?: string): Promise<boolean>;
  disconnect?(): Promise<void>;
  close(): void;
  isConnected(): boolean;
  printMixed(items: MixedItem[], options?: PrintOptions): Promise<boolean>;
  getPrinterStatus?(type?: string): Promise<PrinterStatus | any>;
}
```

### 2. 统一的类型定义 (`core/types.ts`)

所有打印相关的类型都集中在一个文件中：
- `MixedItem` - 打印项类型
- `PrintOptions` - 打印选项
- `PrinterConfig` - 打印机配置
- `ConnectionType` - 连接类型
- 等等...

### 3. 驱动工厂 (`PrinterDriverFactory`)

自动创建和管理不同类型的打印机驱动：

```typescript
const driver = PrinterDriverFactory.createDriver(config);
```

### 4. 驱动管理器 (`PrinterDriverManager`)

管理和复用打印机驱动实例：

```typescript
const manager = PrinterDriverManager.getInstance();
const driver = await manager.getDriver(printerId, config);
```

### 5. 简化的打印入口 (`printMixed`)

提供更简洁的打印API：

```typescript
import { printMixed } from 'printer-library';

// ESC/POS 打印机
await printMixed('printer1', items, {
  type: 'escpos',
  escpos: {
    type: 'TCP',
    target: '192.168.1.100:9100'
  },
  cut: true,
  init: true
});

// XPrinter 打印机
await printMixed('printer2', items, {
  type: 'xprinter',
  xprinter: {
    connectType: 'TCP',
    address: '192.168.1.101:9100'
  },
  cut: true
});
```

## 文件结构

```
printer-library/
├── src/
│   ├── core/                         # 核心模块（新增）
│   │   ├── types.ts                  # 统一类型定义
│   │   ├── IPrinterDriver.ts         # 驱动接口
│   │   ├── PrinterDriverFactory.ts   # 驱动工厂
│   │   ├── PrinterDriverManager.ts   # 驱动管理器
│   │   └── Mixed.ts                  # 打印入口
│   │
│   ├── drivers/                      # 打印机驱动（重构）
│   │   ├── EscPosDriver.ts          # ESC/POS 驱动
│   │   ├── XPrinterDriver.ts        # XPrinter 驱动
│   │   ├── EpsonPrinterDriver.ts    # Epson 驱动
│   │   └── IminWebSocketPrinterDriver.ts  # Imin 驱动
│   │
│   ├── database/                     # 数据库（保留）
│   ├── queue/                        # 队列（保留）
│   ├── api/                          # API（保留）
│   │
│   ├── Printer.ts                    # 基础打印机模块
│   ├── EscPos.ts                     # ESC/POS 命令构建器
│   ├── ByteCommands.ts               # 字节命令构建器
│   ├── SmartEncoder.ts               # 智能编码器
│   └── index.ts                      # 主入口（重构）
```

## 驱动实现

所有驱动都实现了 `IPrinterDriver` 接口：

### EscPosDriver
- 封装 Printer 模块
- 支持 TCP/USB/Bluetooth/Serial 连接
- 使用智能文本编码

### XPrinterDriver
- 封装 XPrinter 原生 SDK
- 支持 USB/网络/蓝牙/串口
- 自动重连机制

### EpsonPrinterDriver
- 封装 Epson ePOS2 SDK
- 支持多种 Epson 打印机型号
- 丰富的打印功能

### IminWebSocketPrinterDriver
- WebSocket 连接
- 支持 Imin 专用打印机
- 不需要改动（按要求保留）

## 向后兼容

保留了所有原有的导出，确保现有代码可以无缝迁移：

```typescript
// 旧的方式仍然可用
import { Mixed } from 'printer-library';
await Mixed.printMixed(id, items, options);

// 新的方式（推荐）
import { printMixed } from 'printer-library';
await printMixed(id, items, options);
```

## 使用示例

### 1. 基本使用

```typescript
import { printMixed } from 'printer-library';

const items = [
  { kind: 'text', content: 'Hello World', style: { align: 'center', bold: true } },
  { kind: 'qr', content: 'https://example.com', size: 8 },
  { kind: 'hr', char: '-', width: 32 },
];

await printMixed('printer1', items, {
  type: 'escpos',
  escpos: {
    type: 'TCP',
    target: '192.168.1.100:9100'
  },
  cut: true
});
```

### 2. 高级使用 - 直接使用驱动

```typescript
import { EscPosDriver } from 'printer-library';

const driver = new EscPosDriver({
  type: 'TCP',
  target: '192.168.1.100:9100'
});

await driver.connect('printer1');
await driver.printMixed(items, { cut: true });
driver.close();
```

### 3. 使用驱动管理器

```typescript
import { PrinterDriverManager } from 'printer-library';

const manager = PrinterDriverManager.getInstance();

// 获取或创建驱动
const driver = await manager.getDriver('printer1', {
  __driverType: 'escpos',
  type: 'TCP',
  target: '192.168.1.100:9100'
});

// 驱动会被自动缓存和复用
await driver?.printMixed(items, { cut: true });

// 清理驱动
manager.removeDriver('printer1');
```

## 数据库和队列

数据库和队列模块按照要求保留，暂时不做改动：

- `database/DatabaseManager.ts`
- `database/XmlSchema.ts`
- `queue/DbQueueScheduler.ts`
- `queue/ConcurrentQueueSchedulerV2.ts`
- `queue/PrinterQueueManager.ts`
- `api/enqueue.ts`

这些模块将来可以移到主项目中使用。

## 测试建议

1. **单元测试**：测试每个驱动的基本功能
2. **集成测试**：测试驱动管理器和工厂
3. **端到端测试**：测试完整的打印流程
4. **兼容性测试**：确保旧代码仍然可以正常运行

## 注意事项

1. **Imin 驱动**：按照要求没有改动，保持原样
2. **队列和数据库**：暂时保留在库中，将来可以移到主项目
3. **向后兼容**：所有旧的导出都保留，确保平滑迁移
4. **日志**：添加了统一的日志前缀（如 `【驱动管理器】`），便于调试

## 下一步

1. 在主项目中测试新的打印功能
2. 逐步迁移旧代码到新的 API
3. 将队列和数据库操作移到主项目
4. 移除库中的队列和数据库代码（可选）

## 问题反馈

如果遇到任何问题，请检查：

1. 打印机配置是否正确
2. 驱动类型是否匹配
3. 连接参数是否有效
4. 查看控制台日志输出

