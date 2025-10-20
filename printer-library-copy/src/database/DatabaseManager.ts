/**
 * DatabaseManager（printer-library 内部）
 * ------------------------------------
 * - 基于 XML Schema 自动建表（见 XmlSchema.ts）。
 * - 以 SQLite 持久化按打印机分队列的打印作业。
 * - 提供：保存/查询打印机、保存/领取/更新作业、完成/失败/重排队等。
 * - 供队列调度器（DbQueueScheduler）与对外 API（enqueueMixedPrint）调用。
 */
import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';
import {Buffer} from 'buffer';
import {DEFAULT_PRINTER_DB_XML, parseXmlSchema, schemaToSql} from './XmlSchema';

export type PrinterStatus = 'IDLE' | 'BUSY' | 'ERROR' | 'OFFLINE';
export type PrintJobStatus =
  | 'PENDING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface PrinterConfig {
  id: string;
  name: string;
  type: string;
  connectionParams: any;
  isEnabled: boolean;
  status: PrinterStatus;
  createdAt: string; // 改为字符串类型 (ISO 8601)
  updatedAt: string; // 改为字符串类型 (ISO 8601)
}

export interface PrintJob {
  id: string;
  printerId: string;
  data: string | Buffer;
  status: PrintJobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata?: any;
}

export interface DbPrinter {
  id: string;
  name: string;
  type: string;
  connection_params: string;
  is_enabled: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DbPrintJob {
  id: string;
  printer_id: string;
  data: string;
  status: string;
  priority: number;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  metadata?: string;
}

SQLite.DEBUG(false);
SQLite.enablePromise(true);

export class DatabaseManager {
  private db: SQLiteDatabase | null = null;
  private static instance: DatabaseManager;
  private schemaXml: string = DEFAULT_PRINTER_DB_XML;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /** 支持外部覆盖 XML Schema */
  public setSchemaXml(xml: string) {
    this.schemaXml = xml;
  }

  public async initialize(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: 'PrinterDB.db',
        location: 'default',
      });
      await this.createTablesFromXml();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }
  public async executeSql(sql: string, params?: any[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.executeSql(sql, params);
  }

  public isInitialized(): boolean {
    return this.db !== null;
  }

  private async createTablesFromXml(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const schema = parseXmlSchema(this.schemaXml);
    const sql = schemaToSql(schema);
    // 顺序执行：先建表再建索引
    for (const s of sql.createTables) {
      await this.db.executeSql(s);
    }
    for (const s of sql.createIndexes) {
      await this.db.executeSql(s);
    }
  }

  /**
   * 获取所有打印机配置
   *
   * @returns Promise<PrinterConfig[]> 所有打印机配置列表
   */
  public async getAllPrinters(): Promise<PrinterConfig[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const [res] = await this.db.executeSql(
        'SELECT * FROM printers ORDER BY created_at DESC',
      );
      const printers: PrinterConfig[] = [];

      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        printers.push(this.mapDbPrinterToPrinterConfig(row as any));
      }

      return printers;
    } catch (error) {
      console.error('Failed to get all printers:', error);
      throw error;
    }
  }

  // ============== 打印机 ==============
  public async savePrinter(printer: PrinterConfig): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const connectionParams = JSON.stringify(printer.connectionParams || {});
    const now = new Date().toISOString();
    console.log('-------------------printer savePrinter', printer, '-111', now);

    await this.db.executeSql(
      `INSERT OR REPLACE INTO printers (id, name, type, connection_params, is_enabled, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        printer.id,
        printer.name,
        printer.type,
        connectionParams,
        printer.isEnabled ? 1 : 0,
        printer.status,
        printer.createdAt || now,
        now,
      ],
    );
  }

  public async getPrinter(id: string): Promise<PrinterConfig | null> {
    if (!this.db) throw new Error('Database not initialized');
    const [res] = await this.db.executeSql(
      'SELECT * FROM printers WHERE id = ?',
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.mapDbPrinterToPrinterConfig(res.rows.item(0) as any);
  }

  public async updatePrinterStatus(
    printerId: string,
    status: PrinterStatus,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.executeSql(
      'UPDATE printers SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date().toISOString(), printerId],
    );
  }

  // ============== 作业 ==============
  public async savePrintJob(job: PrintJob): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    let dataStr: string;
    if (typeof job.data === 'string') {
      dataStr = job.data;
      if (job.metadata && !job.metadata.encoding) {
        const hasBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(job.data);
        if (hasBinary) {
          dataStr = Buffer.from(job.data, 'utf8').toString('base64');
          job.metadata.encoding = 'base64';
        }
      }
    } else {
      dataStr = Buffer.from(job.data).toString('base64');
      job.metadata = {...(job.metadata || {}), encoding: 'base64'};
    }
    const metadata = job.metadata ? JSON.stringify(job.metadata) : null;
    await this.db.executeSql(
      `INSERT OR REPLACE INTO print_jobs (id, printer_id, data, status, priority, retry_count, max_retries, created_at, started_at, completed_at, error_message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.printerId,
        dataStr,
        job.status,
        job.priority ?? 0,
        job.retryCount ?? 0,
        job.maxRetries ?? 3,
        job.createdAt ? job.createdAt.toISOString() : new Date().toISOString(),
        job.startedAt ? job.startedAt.toISOString() : null,
        job.completedAt ? job.completedAt.toISOString() : null,
        job.errorMessage || null,
        metadata,
      ],
    );
  }

  /**
   * 批量保存打印作业
   * 使用单个SQL语句批量插入多个作业，提高性能
   * @param jobs 要保存的作业数组
   * @returns Promise<void>
   */
  public async savePrintJobsBatch(jobs: PrintJob[]): Promise<void> {
    try {
      if (!this.db) throw new Error('Database not initialized');
      if (!jobs || jobs.length === 0) return;
      console.log('------------savePrintJobsBatch', jobs);

      // 处理每个作业的数据
      const processedJobs = jobs.map(job => {
        let dataStr: string;
        if (typeof job.data === 'string') {
          dataStr = job.data;
          if (job.metadata && !job.metadata.encoding) {
            const hasBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(job.data);
            if (hasBinary) {
              dataStr = Buffer.from(job.data, 'utf8').toString('base64');
              job.metadata.encoding = 'base64';
            }
          }
        } else {
          dataStr = Buffer.from(job.data).toString('base64');
          job.metadata = {...(job.metadata || {}), encoding: 'base64'};
        }
        const metadata = job.metadata ? JSON.stringify(job.metadata) : null;

        return {
          ...job,
          dataStr,
          metadata,
        };
      });

      // 构建批量插入SQL
      const placeholders = processedJobs
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const sql = `INSERT OR REPLACE INTO print_jobs (id, printer_id, data, status, priority, retry_count, max_retries, created_at, started_at, completed_at, error_message, metadata)
                 VALUES ${placeholders}`;

      // 准备参数数组
      const params: any[] = [];
      processedJobs.forEach(job => {
        params.push(
          job.id,
          job.printerId,
          job.dataStr,
          job.status,
          job.priority ?? 0,
          job.retryCount ?? 0,
          job.maxRetries ?? 3,
          job.createdAt
            ? job.createdAt.toISOString()
            : new Date().toISOString(),
          job.startedAt ? job.startedAt.toISOString() : null,
          job.completedAt ? job.completedAt.toISOString() : null,
          job.errorMessage || null,
          job.metadata,
        );
      });
      console.log('------------ready db.executeSql',sql,params);
      await this.db.executeSql(sql, params);
      console.log('------------savePrintJobsBatch finish',sql,params);
    } catch (error) {
      console.log('------------savePrintJobsBatch error', error);
      
    }
  }

  public async acquireNextPendingJob(
    workerId: string,
  ): Promise<PrintJob | null> {
    console.log('------------acquireNextPendingJob');
    if (!this.db) throw new Error('Database not initialized');
    const nowIso = new Date().toISOString();

    try {
      // 直接使用原子更新操作，避免事务的开销
      console.log('------------acquireNextPendingJob update');

      const [upd] = await this.db.executeSql(
        `UPDATE print_jobs 
         SET status = ?, 
             started_at = COALESCE(started_at, ?), 
             worker_id = ?, 
             last_heartbeat_at = ?
         WHERE id = (
           SELECT id FROM print_jobs 
           WHERE status = ? AND (available_at IS NULL OR available_at <= ?)
           ORDER BY priority DESC, created_at ASC
           LIMIT 1
         ) AND status = ?`,
        ['PRINTING', nowIso, workerId, nowIso, 'PENDING', nowIso, 'PENDING'],
      );
      console.log('------------acquireNextPendingJob update finish');
      const rowsAffected = (upd.rowsAffected ??
        (upd as any).rowsAffected) as number;

      if (rowsAffected !== 1) {
        // 没有找到或更新任何作业
        return null;
      }
      console.log('------------acquireNextPendingJob select');
      // 查找刚刚更新的作业
      const [sel] = await this.db.executeSql(
        `SELECT * FROM print_jobs 
         WHERE worker_id = ? AND status = ?
         ORDER BY last_heartbeat_at DESC
         LIMIT 1`,
        [workerId, 'PRINTING'],
      );
      console.log('------------acquireNextPendingJob update');

      if (sel.rows.length === 0) {
        return null;
      }

      const row = sel.rows.item(0) as any;

      console.log('------------acquireNextPendingJob 成功');

      return this.mapDbPrintJobToPrintJob(row);
    } catch (error) {
      console.log('------------acquireNextPendingJob 错误:', error);
      return null;
    }
  }

  public async updatePrintJobStatus(
    jobId: string,
    status: PrintJobStatus,
    errorMessage?: string,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    let updateFields = 'status = ?';
    const params: any[] = [status];
    if (status === 'PRINTING') {
      updateFields += ', started_at = ?';
      params.push(now);
    }
    if (status === 'COMPLETED' || status === 'FAILED') {
      updateFields += ', completed_at = ?';
      params.push(now);
    }
    if (errorMessage) {
      updateFields += ', error_message = ?';
      params.push(errorMessage);
    }
    params.push(jobId);
    await this.db.executeSql(
      `UPDATE print_jobs SET ${updateFields} WHERE id = ?`,
      params,
    );
  }

  public async completeJob(jobId: string): Promise<void> {
    await this.updatePrintJobStatus(jobId, 'COMPLETED');
  }

  public async failJob(jobId: string, error?: string): Promise<void> {
    await this.updatePrintJobStatus(jobId, 'FAILED', error);
  }

  public async requeueJob(
    jobId: string,
    delayMs: number,
    attempt: number,
    maxRetries: number,
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const availableAt = new Date(Date.now() + delayMs).toISOString();
    await this.db.executeSql(
      `UPDATE print_jobs SET status = ?, retry_count = ?, max_retries = ?, available_at = ?, worker_id = NULL WHERE id = ?`,
      ['PENDING', attempt, maxRetries, availableAt, jobId],
    );
  }

  public async clearNonPersistentPending(printerId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const [res] = await this.db.executeSql(
      `DELETE FROM print_jobs WHERE printer_id = ? AND status = ? AND (metadata IS NULL OR json_extract(metadata, '$.persistent') != 1)`,
      [printerId, 'PENDING'],
    );
    return (res.rowsAffected ?? (res as any).rowsAffected) as number;
  }

  /**
   * 获取所有作业列表
   * @param printerId 可选，指定打印机ID筛选
   * @param status 可选，指定状态筛选
   * @param limit 可选，限制返回数量
   * @param offset 可选，偏移量（用于分页）
   * @returns 作业列表
   */
  public async getAllJobs(
    printerId?: string,
    status?: PrintJobStatus,
    limit?: number,
    offset?: number,
  ): Promise<PrintJob[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM print_jobs WHERE 1=1';
    const params: any[] = [];

    if (printerId) {
      sql += ' AND printer_id = ?';
      params.push(printerId);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);

      if (offset) {
        sql += ' OFFSET ?';
        params.push(offset);
      }
    }

    const [result] = await this.db.executeSql(sql, params);
    const jobs: PrintJob[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      jobs.push(this.mapDbPrintJobToPrintJob(row));
    }

    return jobs;
  }

  /**
   * 获取作业统计信息
   * @param printerId 可选，指定打印机ID
   * @returns 各状态的作业数量统计
   */
  public async getJobStats(printerId?: string): Promise<{
    total: number;
    pending: number;
    printing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PRINTING' THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
      FROM print_jobs WHERE 1=1
    `;
    const params: any[] = [];

    if (printerId) {
      sql += ' AND printer_id = ?';
      params.push(printerId);
    }

    const [result] = await this.db.executeSql(sql, params);
    const row = result.rows.item(0);

    return {
      total: row.total || 0,
      pending: row.pending || 0,
      printing: row.printing || 0,
      completed: row.completed || 0,
      failed: row.failed || 0,
      cancelled: row.cancelled || 0,
    };
  }

  /**
   * 清除作业表
   * @param printerId 可选，指定打印机ID（只清除该打印机的作业）
   * @param status 可选，指定状态（只清除指定状态的作业）
   * @param olderThanDays 可选，只清除指定天数之前的作业
   * @returns 清除的作业数量
   */
  public async clearJobs(
    printerId?: string,
    status?: PrintJobStatus,
    olderThanDays?: number,
  ): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'DELETE FROM print_jobs WHERE 1=1';
    const params: any[] = [];

    if (printerId) {
      sql += ' AND printer_id = ?';
      params.push(printerId);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (olderThanDays) {
      const cutoffDate = new Date(
        Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      sql += ' AND created_at < ?';
      params.push(cutoffDate);
    }

    const [result] = await this.db.executeSql(sql, params);
    return (result.rowsAffected ?? (result as any).rowsAffected) as number;
  }

  /**
   * 清除所有作业表数据
   * @returns 清除的作业数量
   */
  public async clearAllJobs(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql('DELETE FROM print_jobs');
    return (result.rowsAffected ?? (result as any).rowsAffected) as number;
  }

  /**
   * 删除打印机（会先删除相关的打印作业）
   * @param printerId 要删除的打印机ID
   * @param deleteJobs 是否删除相关的打印作业，默认为true
   * @returns Promise<{ deletedJobs: number; printerDeleted: boolean }> 删除结果
   */
  public async deletePrinter(
    printerId: string,
    deleteJobs: boolean = true,
  ): Promise<{deletedJobs: number; printerDeleted: boolean}> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 开启事务确保数据一致性
      await this.db.executeSql('BEGIN TRANSACTION');

      let deletedJobs = 0;

      // 如果需要删除相关作业，先删除打印作业
      if (deleteJobs) {
        const [jobResult] = await this.db.executeSql(
          'DELETE FROM print_jobs WHERE printer_id = ?',
          [printerId],
        );
        deletedJobs = (jobResult.rowsAffected ??
          (jobResult as any).rowsAffected) as number;
      } else {
        // 检查是否还有相关的打印作业
        const [checkResult] = await this.db.executeSql(
          'SELECT COUNT(*) as count FROM print_jobs WHERE printer_id = ?',
          [printerId],
        );
        const jobCount = checkResult.rows.item(0).count;

        if (jobCount > 0) {
          await this.db.executeSql('ROLLBACK');
          throw new Error(
            `无法删除打印机：仍有 ${jobCount} 个相关的打印作业。请先删除作业或设置 deleteJobs 为 true。`,
          );
        }
      }

      // 删除打印机
      const [printerResult] = await this.db.executeSql(
        'DELETE FROM printers WHERE id = ?',
        [printerId],
      );
      const printerDeleted =
        ((printerResult.rowsAffected ??
          (printerResult as any).rowsAffected) as number) > 0;

      if (!printerDeleted) {
        await this.db.executeSql('ROLLBACK');
        throw new Error(`打印机 ID '${printerId}' 不存在`);
      }

      // 提交事务
      await this.db.executeSql('COMMIT');

      return {deletedJobs, printerDeleted};
    } catch (error) {
      // 回滚事务
      try {
        await this.db.executeSql('ROLLBACK');
      } catch (rollbackError) {
        console.error('回滚事务失败:', rollbackError);
      }
      throw error;
    }
  }

  /**
   * 删除多个打印机
   * @param printerIds 要删除的打印机ID数组
   * @param deleteJobs 是否删除相关的打印作业，默认为true
   * @returns Promise<{ totalDeletedJobs: number; deletedPrinters: string[] }> 删除结果
   */
  public async deletePrinters(
    printerIds: string[],
    deleteJobs: boolean = true,
  ): Promise<{totalDeletedJobs: number; deletedPrinters: string[]}> {
    if (!this.db) throw new Error('Database not initialized');
    if (!printerIds || printerIds.length === 0) {
      return {totalDeletedJobs: 0, deletedPrinters: []};
    }

    try {
      // 开启事务确保数据一致性
      await this.db.executeSql('BEGIN TRANSACTION');

      let totalDeletedJobs = 0;
      const deletedPrinters: string[] = [];

      // 如果需要删除相关作业，先批量删除打印作业
      if (deleteJobs) {
        const placeholders = printerIds.map(() => '?').join(',');
        const [jobResult] = await this.db.executeSql(
          `DELETE FROM print_jobs WHERE printer_id IN (${placeholders})`,
          printerIds,
        );
        totalDeletedJobs = (jobResult.rowsAffected ??
          (jobResult as any).rowsAffected) as number;
      } else {
        // 检查是否还有相关的打印作业
        const placeholders = printerIds.map(() => '?').join(',');
        const [checkResult] = await this.db.executeSql(
          `SELECT printer_id, COUNT(*) as count FROM print_jobs WHERE printer_id IN (${placeholders}) GROUP BY printer_id`,
          printerIds,
        );

        if (checkResult.rows.length > 0) {
          const jobCounts: string[] = [];
          for (let i = 0; i < checkResult.rows.length; i++) {
            const row = checkResult.rows.item(i);
            jobCounts.push(`打印机 ${row.printer_id}: ${row.count} 个作业`);
          }
          await this.db.executeSql('ROLLBACK');
          throw new Error(
            `无法删除打印机：仍有相关的打印作业。\n${jobCounts.join(
              '\n',
            )}\n请先删除作业或设置 deleteJobs 为 true。`,
          );
        }
      }

      // 批量删除打印机
      const placeholders = printerIds.map(() => '?').join(',');
      const [printerResult] = await this.db.executeSql(
        `DELETE FROM printers WHERE id IN (${placeholders})`,
        printerIds,
      );
      const deletedCount = (printerResult.rowsAffected ??
        (printerResult as any).rowsAffected) as number;

      if (deletedCount !== printerIds.length) {
        // 查找哪些打印机实际被删除了
        const [remainingResult] = await this.db.executeSql(
          `SELECT id FROM printers WHERE id IN (${placeholders})`,
          printerIds,
        );
        const remainingIds = new Set();
        for (let i = 0; i < remainingResult.rows.length; i++) {
          remainingIds.add(remainingResult.rows.item(i).id);
        }

        printerIds.forEach(id => {
          if (!remainingIds.has(id)) {
            deletedPrinters.push(id);
          }
        });

        console.warn(
          `部分打印机删除失败，成功删除: ${deletedPrinters.join(', ')}`,
        );
      } else {
        deletedPrinters.push(...printerIds);
      }

      // 提交事务
      await this.db.executeSql('COMMIT');

      return {totalDeletedJobs, deletedPrinters};
    } catch (error) {
      // 回滚事务
      try {
        await this.db.executeSql('ROLLBACK');
      } catch (rollbackError) {
        console.error('回滚事务失败:', rollbackError);
      }
      throw error;
    }
  }

  // ============== 映射 ==============
  private mapDbPrinterToPrinterConfig(row: DbPrinter): PrinterConfig {
    // 创建 Date 对象并转换为 ISO 字符串以避免序列化问题
    const createdAtDate = row.created_at
      ? new Date(row.created_at)
      : new Date();
    const updatedAtDate = row.updated_at
      ? new Date(row.updated_at)
      : new Date();

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      connectionParams: JSON.parse(row.connection_params || '{}'),
      isEnabled: row.is_enabled === 1,
      status: (row.status as any) || 'IDLE',
      createdAt: createdAtDate.toISOString(), // 返回 ISO 字符串
      updatedAt: updatedAtDate.toISOString(), // 返回 ISO 字符串
    };
  }

  private mapDbPrintJobToPrintJob(row: any): PrintJob {
    const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
    let data: string | Buffer = row.data;
    const isLikelyBase64 = (value: string) => {
      if (!value || value.length < 8 || value.length % 4 !== 0) return false;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
      return true;
    };
    try {
      if (
        metadata?.encoding === 'base64' ||
        (metadata?.encoding === undefined &&
          typeof row.data === 'string' &&
          isLikelyBase64(row.data))
      ) {
        const buf = Buffer.from(row.data, 'base64');
        if (buf.length > 0) data = buf;
      }
    } catch {}
    return {
      id: row.id,
      printerId: row.printer_id,
      data,
      status: row.status,
      priority: row.priority ?? 0,
      retryCount: row.retry_count ?? 0,
      maxRetries: row.max_retries ?? 3,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      errorMessage: row.error_message || undefined,
      metadata,
    };
  }
}
