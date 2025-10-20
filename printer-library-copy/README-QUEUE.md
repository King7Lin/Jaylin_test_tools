### Printer Library 队列与 XML 建表说明

本说明文档介绍本库在 React Native 环境中如何通过 SQLite 实现“每台打印机独立队列、顺序执行”的打印任务系统，并通过 XML 定义数据库表结构。

#### 功能概览
- 每台打印机都有自己的队列（按 `printerId` 隔离）。
- 当打印机正在打印时，新作业入库排队等待，硬件空闲后再执行。
- 作业从 SQLite 拉出后，直接调用 `Mixed.printMixed(printerId, items, options)` 执行。
- 表结构以 XML 描述，运行时解析生成 CREATE TABLE/INDEX 并执行（无第三方 XML 依赖）。

#### 目录与主要文件
- `src/database/XmlSchema.ts`
  - 轻量 XML 解析与 SQL 生成。
  - 导出 `DEFAULT_PRINTER_DB_XML`（默认 schema）、`parseXmlSchema`、`schemaToSql`。
- `src/database/DatabaseManager.ts`
  - 基于 XML 自动建表；封装 SQLite 访问：保存打印机/作业、原子领取、重试、完成、失败、清理等。
- `src/queue/DbQueueScheduler.ts`
  - 单例调度器，从 DB 抢占 PENDING 作业，空闲指数退避，执行后继续。
- `src/queue/executePrintJob.ts`
  - 解析 DB 作业并调用 `Mixed.printMixed` 实际打印。
- `src/api/enqueue.ts`
  - 对外入队 API：`enqueueMixedPrint(printerId, items, options)`。
- `src/index.ts`
  - 导出入口：`DatabaseManager`、`DEFAULT_PRINTER_DB_XML`、`DbQueueScheduler`、`enqueueMixedPrint` 等。

#### 快速开始
```ts
import { enqueueMixedPrint } from 'react-native-escpos-printer';

const jobId = await enqueueMixedPrint(
  'network_192.168.1.100_9100',
  [
    { kind: 'text', content: 'Hello' },
    { kind: 'hr', width: 32 },
    { kind: 'qr', content: 'https://example.com', size: 6 },
  ],
  {
    smartText: true,
    cut: true,
    // 也可走 IMIN 通道：{ type: 'imin', imin: { address, port, printerType } }
    persistent: false,
    maxRetries: 3,
  },
);
```

入队后，`DbQueueScheduler` 会自动启动循环：
1. `DatabaseManager.acquireNextPendingJob(workerId)` 原子领取一条 `PENDING` 作业并标记为 `PRINTING`。
2. `executePrintJob(job)` 解析作业并调用 `Mixed.printMixed(printerId, items, options)`。
3. 成功 -> `COMPLETED`；失败 -> 达到重试上限 `FAILED`，否则 `requeue` 延迟重试。

#### XML 建表
默认 XML schema（可覆盖）：
```xml
<database>
  <table name="printers">
    <column name="id" type="TEXT" primaryKey="true" />
    <column name="name" type="TEXT" notNull="true" />
    <column name="type" type="TEXT" notNull="true" />
    <column name="connection_params" type="TEXT" notNull="true" />
    <column name="is_enabled" type="INTEGER" />
    <column name="status" type="TEXT" />
    <column name="created_at" type="TEXT" />
    <column name="updated_at" type="TEXT" />
  </table>
  <table name="print_jobs">
    <column name="id" type="TEXT" primaryKey="true" />
    <column name="printer_id" type="TEXT" notNull="true" />
    <column name="data" type="TEXT" notNull="true" />
    <column name="status" type="TEXT" />
    <column name="priority" type="INTEGER" />
    <column name="retry_count" type="INTEGER" />
    <column name="max_retries" type="INTEGER" />
    <column name="created_at" type="TEXT" />
    <column name="started_at" type="TEXT" />
    <column name="completed_at" type="TEXT" />
    <column name="error_message" type="TEXT" />
    <column name="metadata" type="TEXT" />
    <column name="available_at" type="TEXT" />
    <column name="worker_id" type="TEXT" />
    <column name="last_heartbeat_at" type="TEXT" />
    <foreignKey column="printer_id" refTable="printers" refColumn="id" />
  </table>
  <index name="idx_print_jobs_printer_id" table="print_jobs" columns="printer_id" />
  <index name="idx_print_jobs_status" table="print_jobs" columns="status" />
  <index name="idx_print_jobs_priority" table="print_jobs" columns="priority, created_at" />
  <index name="idx_printers_name" table="printers" columns="name" />
```
```

覆盖默认 schema：
```ts
import { DatabaseManager } from 'react-native-escpos-printer';

DatabaseManager.getInstance().setSchemaXml(MY_XML);
```

注意：`default` 值需提供合法 SQL 片段（如 `'0'`、`CURRENT_TIMESTAMP`）。

#### 作业数据格式
- `metadata.type === 'mixed'`：`data` 保存为 JSON 字符串：
```json
{
  "printerId": "network_192.168.1.100_9100",
  "items": [ { "kind": "text", "content": "Hello" } ],
  "options": { "smartText": true, "cut": true }
}
```
- 也可扩展其他类型（如 raw/escpos），在 `executePrintJob.ts` 处理。

#### 每台打印机串行保证
- 同一 `printerId` 的作业按 `priority DESC, created_at ASC` 取出。
- 单 worker 模式下天然串行；如需多 worker，请扩展“按 printer_id 粒度的互斥/分片领取”。

#### 重试与回退
- 失败后指数延迟：`min(5000, 1000 * attempt)`。
- 超过 `max_retries` 设为 `FAILED`。

#### 常见问题
- 未安装 SQLite 依赖：请确保主工程安装并配置 `react-native-sqlite-storage`。
- `printerId` 与驱动期望不一致：`enqueueMixedPrint` 里的 `printerId` 必须与 `Mixed.printMixed`/驱动使用的设备 ID 一致。

#### 许可证
MIT


