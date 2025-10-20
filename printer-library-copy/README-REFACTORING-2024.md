# Printer Library 重构说明 (2024)

## 📌 重构概述

将 `printer-library` 的数据库（db）和队列（queue）功能移到主项目，使 printer-library 专注于打印机驱动和命令构建。

## 🔄 架构变化

### 之前的架构

```
printer-library/
├── src/
│   ├── core/            # 核心驱动
│   ├── drivers/         # 打印机驱动
│   ├── database/        # ❌ 数据库管理
│   ├── queue/           # ❌ 队列调度
│   └── api/             # ❌ 入队 API
└── dist/
```

### 重构后的架构

```
主项目/
├── src/
│   ├── db/
│   │   ├── PrinterDAO.js        # ✅ 打印机数据访问
│   │   └── PrintJobDAO.js       # ✅ 打印作业数据访问
│   └── printer-queue/
│       ├── PrinterQueueManager.js        # ✅ 队列管理
│       ├── ConcurrentQueueScheduler.js   # ✅ 并发调度器
│       ├── executePrintJob.js            # ✅ 作业执行器
│       ├── enqueuePrintBatch.js          # ✅ 入队 API
│       └── index.js                      # ✅ 模块导出
│
printer-library/
├── src/
│   ├── core/            # ✅ 核心驱动（保留）
│   ├── drivers/         # ✅ 打印机驱动（保留）
│   ├── database/        # 🗑️ 已移除
│   ├── queue/           # 🗑️ 已移除
│   └── api/             # 🗑️ 已移除
└── dist/
```

## 📊 数据库表结构

在主项目的 `src/db/FB.xml` 中添加了两个表：

### 1. `printers` 表

```xml
<table name="printers">
  <field name="id" type="varchar" length="100" key="1"/>
  <field name="name" type="varchar" length="100"/>
  <field name="type" type="varchar" length="20"/>
  <field name="connection_params" type="text"/>
  <field name="is_enabled" type="int2"/>
  <field name="status" type="varchar" length="20"/>
  <field name="created_at" type="timestamp"/>
  <field name="updated_at" type="timestamp"/>
</table>
```

### 2. `print_jobs` 表

```xml
<table name="print_jobs">
  <field name="id" type="varchar" length="100" key="1"/>
  <field name="printer_id" type="varchar" length="100"/>
  <field name="data" type="text"/>
  <field name="status" type="varchar" length="20"/>
  <field name="priority" type="integer"/>
  <field name="retry_count" type="integer"/>
  <field name="max_retries" type="integer"/>
  <field name="created_at" type="timestamp"/>
  <field name="started_at" type="timestamp"/>
  <field name="completed_at" type="timestamp"/>
  <field name="error_message" type="text"/>
  <field name="metadata" type="text"/>
  <field name="available_at" type="timestamp"/>
  <field name="worker_id" type="varchar" length="100"/>
  <field name="last_heartbeat_at" type="timestamp"/>
</table>
```

## 🔌 API 变化

### 旧的调用方式（不再使用）

```javascript
import { enqueueMixedPrintBatch } from '../printer-library';

// ❌ 旧的方式
await enqueueMixedPrintBatch([
  {
    printerId: 'printer-001',
    items: [...],
    options: {...}
  }
]);
```

### 新的调用方式

```javascript
import { enqueuePrintBatch } from './src/printer-queue';

// ✅ 新的方式
await enqueuePrintBatch([
  {
    printerId: 'printer-001',
    items: [...],
    options: {...}
  }
]);
```

## 💡 核心功能说明

### 1. PrinterDAO & PrintJobDAO

提供打印机和打印作业的数据库操作：

```javascript
import PrinterDAO from './src/db/PrinterDAO';
import PrintJobDAO from './src/db/PrintJobDAO';

// 保存打印机
await PrinterDAO.savePrinter({
  id: 'printer-001',
  name: 'Kitchen Printer',
  type: 'escpos',
  connectionParams: {...},
  isEnabled: true,
  status: 'IDLE'
});

// 获取打印机
const result = await PrinterDAO.getPrinter('printer-001');

// 保存打印作业
await PrintJobDAO.savePrintJob({
  id: 'job-001',
  printerId: 'printer-001',
  data: JSON.stringify({...}),
  status: 'PENDING',
  ...
});
```

### 2. PrinterQueueManager

管理每个打印机的内存任务队列：

```javascript
import PrinterQueueManager from './src/printer-queue/PrinterQueueManager';

const manager = new PrinterQueueManager();

// 追加任务
manager.appendJobs('printer-001', jobs);

// 取出任务
const job = manager.shift('printer-001');

// 检查队列
const isEmpty = manager.isEmpty('printer-001');
```

### 3. ConcurrentQueueScheduler

并发队列调度器，支持多打印机并发打印：

```javascript
import ConcurrentQueueScheduler from './src/printer-queue/ConcurrentQueueScheduler';

const scheduler = ConcurrentQueueScheduler.getInstance();

// 启动调度器
scheduler.schedule();

// 通知新任务
await scheduler.notifyNewTask('printer-001');

// 停止调度器
await scheduler.stop();
```

### 4. enqueuePrintBatch

主入口函数，替代原来的 `enqueueMixedPrintBatch`：

```javascript
import enqueuePrintBatch from './src/printer-queue/enqueuePrintBatch';

// 批量入队打印作业
const jobIds = await enqueuePrintBatch([
  {
    printerId: 'printer-001',
    items: [
      { type: 'text', value: 'Hello World' },
      { type: 'qr', value: 'https://example.com' },
    ],
    options: {
      priority: 0,
      maxRetries: 3,
    }
  },
  {
    printerId: 'printer-002',
    items: [...],
    options: {...}
  }
]);

console.log('作业 IDs:', jobIds);
```

## 🎯 PrinterDriverManager

**重要：** `PrinterDriverManager` 保留在 `printer-library` 中，因为它只管理内存中的驱动实例缓存，不涉及数据库操作。

```javascript
import { PrinterDriverManager, printMixed } from '../printer-library';

// PrinterDriverManager 仍然可用
const driverManager = PrinterDriverManager.getInstance();
const driver = await driverManager.getDriver('printer-001', config);

// 直接打印（不经过队列）
await printMixed('printer-001', items, options);
```

## 🔄 迁移步骤

1. **更新数据库表结构**
   - 运行应用，自动创建 `printers` 和 `print_jobs` 表

2. **更新代码引用**
   - 将 `enqueueMixedPrintBatch` 改为 `enqueuePrintBatch`
   - 从 `./src/printer-queue` 导入而不是 `printer-library`

3. **测试打印功能**
   - 确保打印机配置正确
   - 测试批量打印
   - 验证队列调度

## 📝 注意事项

1. **数据库初始化**
   - 首次运行时会自动创建表
   - 确保主项目的数据库连接正常

2. **打印机配置**
   - 打印机配置现在存储在主项目数据库
   - 使用 `PrinterDAO.savePrinter()` 保存配置

3. **队列调度**
   - 调度器会自动启动
   - 支持多打印机并发打印
   - 默认最大并发数：10

4. **错误处理**
   - 自动重试机制
   - 错误类型分析
   - 智能延迟策略

## 🚀 性能优化

- ✅ 增量查询，避免重复加载任务
- ✅ 内存队列，减少数据库查询
- ✅ 并发控制，支持多打印机同时工作
- ✅ 超时保护，防止任务卡死
- ✅ 事件驱动，新任务立即处理

## 📚 相关文档

- [Printer Library 原始文档](./README.md)
- [队列系统说明](./README-QUEUE.md)
- [重构指南](./REFACTORING-GUIDE.md)

---

**重构日期：** 2024-10-20  
**版本：** 2.0.0

