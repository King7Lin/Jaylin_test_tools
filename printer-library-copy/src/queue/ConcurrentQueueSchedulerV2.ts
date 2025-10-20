/**
 * ConcurrentQueueSchedulerV2（优化版并发队列调度器）
 * --------------------------------
 * 优化点：
 * 1. ✅ 解决重复查询问题：使用增量查询，只获取新任务
 * 2. ✅ 解决状态同步问题：取出任务立即更新数据库状态
 * 3. ✅ 内存队列管理：每个打印机维护独立队列
 * 4. ✅ 事件驱动：新任务入队立即通知，无需轮询
 * 5. ✅ 并发控制：限制同时运行的工作线程数量
 * 6. ✅ 超时保护：防止任务执行卡死
 */
import {DatabaseManager} from '../database/DatabaseManager';
import {PrinterQueueManager, QueueJob} from './PrinterQueueManager';

interface WorkerInfo {
  running: boolean;
  workerId: string;
  printerId: string;
  startedAt: Date;
}

export class ConcurrentQueueSchedulerV2 {
  private static instance: ConcurrentQueueSchedulerV2;
  private running = false;
  private stopRequested = false;
  private db = DatabaseManager.getInstance() as any;

  // 队列管理器
  private queueManager = new PrinterQueueManager();

  // 工作线程映射
  private printerWorkers = new Map<string, WorkerInfo>();

  // 等待队列（并发满时）
  private waitingPrinters: string[] = [];

  // 配置
  private maxConcurrentWorkers = 10; // 最多同时10个工作线程
  private taskTimeout = 120000; // 任务超时时间：2分钟
  private checkInterval = 1000; // 主循环检查间隔

  private constructor() {}

  public static getInstance(): ConcurrentQueueSchedulerV2 {
    if (!ConcurrentQueueSchedulerV2.instance) {
      ConcurrentQueueSchedulerV2.instance = new ConcurrentQueueSchedulerV2();
    }
    return ConcurrentQueueSchedulerV2.instance;
  }

  /**
   * 启动调度器
   */
  public schedule() {
    if (!this.running) {
      this.running = true;
      this.stopRequested = false;
      console.log('🚀 ConcurrentQueueSchedulerV2: 调度器启动');
      this.mainLoop();
    }
  }

  /**
   * 停止调度器
   */
  public async stop() {
    console.log('🛑 ConcurrentQueueSchedulerV2: 停止调度器...');
    this.stopRequested = true;

    // 等待所有工作线程停止
    const promises = Array.from(this.printerWorkers.values()).map(worker =>
      this.waitForWorkerStop(worker.workerId),
    );
    await Promise.all(promises);

    this.running = false;
    this.printerWorkers.clear();
    this.queueManager.clearAll();
    console.log('✅ ConcurrentQueueSchedulerV2: 已完全停止');
  }

  /**
   * 设置最大并发工作线程数
   */
  public setMaxConcurrentWorkers(max: number) {
    this.maxConcurrentWorkers = Math.max(1, Math.min(max, 50));
    console.log(`⚙️ 最大并发工作线程数: ${this.maxConcurrentWorkers}`);
  }

  /**
   * 设置任务超时时间（毫秒）
   */
  public setTaskTimeout(timeout: number) {
    this.taskTimeout = Math.max(30000, timeout); // 最少30秒
    console.log(`⏱️ 任务超时时间: ${this.taskTimeout}ms`);
  }

  /**
   * 🔔 外部调用：通知有新任务
   * 这是事件驱动的入口点
   */
  public async notifyNewTask(printerId: string) {
    console.log(`🔔 收到通知：打印机 ${printerId} 有新任务`);

    try {
      // 1️⃣ 增量查询：只获取新任务
      const newJobs = await this.loadNewJobs(printerId);

      if (newJobs.length === 0) {
        console.log(`打印机 ${printerId} 没有新任务`);
        return;
      }

      // 2️⃣ 追加到内存队列（自动去重）
      this.queueManager.appendJobs(printerId, newJobs);

      // 3️⃣ 检查是否需要启动工作线程
      if (!this.printerWorkers.has(printerId)) {
        this.tryStartWorker(printerId);
      } else {
        console.log(
          `✓ 打印机 ${printerId} 工作线程已在运行，新任务已加入队列`,
        );
      }

      // 4️⃣ 唤醒主循环（如果休眠了）
      if (!this.running) {
        this.schedule();
      }
    } catch (error) {
      console.error(`处理打印机 ${printerId} 新任务通知失败:`, error);
    }
  }

  /**
   * 增量加载新任务（解决问题1：避免重复查询）
   */
  private async loadNewJobs(printerId: string): Promise<QueueJob[]> {
    if (!this.db.isInitialized()) {
      await this.db.initialize();
    }

    const nowIso = new Date().toISOString();
    const lastTimestamp = this.queueManager.getLastJobTimestamp(printerId);

    // ✅ 增量查询：只查询比最后任务更新的任务
    let sql: string;
    let params: any[];

    if (lastTimestamp) {
      sql = `SELECT * FROM print_jobs 
             WHERE printer_id = ? 
             AND status = 'PENDING'
             AND created_at > ?
             AND (available_at IS NULL OR available_at <= ?)
             ORDER BY priority DESC, created_at ASC`;
      params = [printerId, lastTimestamp.toISOString(), nowIso];
    } else {
      // 首次查询：获取所有待处理任务
      sql = `SELECT * FROM print_jobs 
             WHERE printer_id = ? 
             AND status = 'PENDING'
             AND (available_at IS NULL OR available_at <= ?)
             ORDER BY priority DESC, created_at ASC`;
      params = [printerId, nowIso];
    }

    const [result] = await this.db.executeSql(sql, params);

    return Array.from({length: result.rows.length}, (_, i) =>
      this.db.mapDbPrintJobToPrintJob(result.rows.item(i)),
    );
  }

  /**
   * 尝试启动工作线程
   */
  private tryStartWorker(printerId: string) {
    if (this.printerWorkers.size >= this.maxConcurrentWorkers) {
      // ⏸️ 并发已满，加入等待队列
      if (!this.waitingPrinters.includes(printerId)) {
        this.waitingPrinters.push(printerId);
        console.log(
          `⏸️ 并发已满 (${this.printerWorkers.size}/${this.maxConcurrentWorkers})，打印机 ${printerId} 加入等待队列`,
        );
      }
      return;
    }

    // 🚀 启动工作线程
    this.startPrinterWorker(printerId);
  }

  /**
   * 启动打印机工作线程
   */
  private startPrinterWorker(printerId: string) {
    const workerId = `worker_${printerId}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const worker: WorkerInfo = {
      running: true,
      workerId,
      printerId,
      startedAt: new Date(),
    };

    this.printerWorkers.set(printerId, worker);

    console.log(
      `🚀 启动打印机 ${printerId} 工作线程 (${this.printerWorkers.size}/${this.maxConcurrentWorkers})`,
    );

    // 启动异步工作循环
    this.printerWorkerLoop(printerId, workerId)
      .catch(error => {
        console.error(`打印机 ${printerId} 工作线程错误:`, error);
      })
      .finally(() => {
        // 清理工作线程
        this.printerWorkers.delete(printerId);
        console.log(
          `🛑 打印机 ${printerId} 工作线程停止 (剩余: ${this.printerWorkers.size})`,
        );

        // 尝试启动等待队列中的工作线程
        this.processWaitingQueue();
      });
  }

  /**
   * 打印机工作线程（从内存队列处理任务）
   */
  private async printerWorkerLoop(printerId: string, workerId: string) {
    console.log(`🔧 打印机 ${printerId} 工作线程开始处理任务`);

    while (!this.stopRequested) {
      // ✅ 从内存队列取任务（不查数据库！）
      const job = this.queueManager.shift(printerId);

      if (!job) {
        console.log(`📭 打印机 ${printerId} 队列为空，工作线程结束`);
        break;
      }

      try {
        // ✅ 解决问题2：立即更新数据库状态为 PRINTING
        await this.updateJobStatus(job.id, 'PRINTING', workerId);

        console.log(`🖨️ 打印机 ${printerId} 开始任务 ${job.id}`);

        // ✅ 执行打印（带超时保护）
        await this.executePrintJobWithTimeout(job, workerId);

        console.log(`✅ 打印机 ${printerId} 完成任务 ${job.id}`);

        // ✅ 更新数据库状态为 SUCCESS
        await this.updateJobStatus(job.id, 'SUCCESS');
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        console.error(
          `❌ 打印机 ${printerId} 任务 ${job.id} 失败:`,
          errorMessage,
        );

        // ✅ 更新数据库状态为 FAILED
        await this.updateJobStatus(job.id, 'FAILED', workerId, errorMessage);

        // 如果是超时错误，重置任务状态让其他线程重试
        if (errorMessage.includes('TASK_TIMEOUT')) {
          await this.resetJobToPending(job.id);
        }
      }

      // 继续处理下一个任务
    }
  }

  /**
   * 执行打印任务（带超时保护）
   */
  private async executePrintJobWithTimeout(
    job: QueueJob,
    workerId: string,
  ): Promise<void> {
    const mod = require('./executePrintJob');
    const executePrintJob = (mod.executePrintJob || mod.default) as (
      j: any,
    ) => Promise<void>;

    // ✅ 超时保护
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('TASK_TIMEOUT')),
        this.taskTimeout,
      ),
    );

    await Promise.race([executePrintJob(job), timeoutPromise]);
  }

  /**
   * 更新任务状态
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    workerId?: string,
    errorMessage?: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const updates: string[] = ['status = ?'];
    const params: any[] = [status];

    if (status === 'PRINTING' && workerId) {
      updates.push('started_at = COALESCE(started_at, ?)');
      updates.push('worker_id = ?');
      updates.push('last_heartbeat_at = ?');
      params.push(nowIso, workerId, nowIso);
    } else if (status === 'SUCCESS') {
      updates.push('completed_at = ?');
      params.push(nowIso);
    } else if (status === 'FAILED' && errorMessage) {
      updates.push('error = ?');
      params.push(errorMessage);
    }

    params.push(jobId);

    await this.db.executeSql(
      `UPDATE print_jobs SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );
  }

  /**
   * 重置任务为 PENDING（超时后重试）
   */
  private async resetJobToPending(jobId: string): Promise<void> {
    await this.db.executeSql(
      `UPDATE print_jobs 
       SET status = 'PENDING', worker_id = NULL 
       WHERE id = ?`,
      [jobId],
    );
  }

  /**
   * 处理等待队列
   */
  private processWaitingQueue() {
    while (
      this.waitingPrinters.length > 0 &&
      this.printerWorkers.size < this.maxConcurrentWorkers
    ) {
      const printerId = this.waitingPrinters.shift();
      if (printerId && !this.queueManager.isEmpty(printerId)) {
        console.log(`⏩ 从等待队列启动打印机 ${printerId}`);
        this.startPrinterWorker(printerId);
      }
    }
  }

  /**
   * 主循环（监控和管理）
   */
  private async mainLoop() {
    console.log('🔄 ConcurrentQueueSchedulerV2: 主循环启动');

    if (!this.db.db) {
      await this.db.initialize().catch(() => {});
    }

    while (!this.stopRequested) {
      try {
        // 定期检查等待队列
        if (this.waitingPrinters.length > 0) {
          this.processWaitingQueue();
        }

        // 打印统计信息
        if (this.printerWorkers.size > 0 || this.waitingPrinters.length > 0) {
          const stats = this.queueManager.getStats();
          console.log(
            `📊 统计 - 活跃线程: ${this.printerWorkers.size}/${this.maxConcurrentWorkers}, ` +
              `等待: ${this.waitingPrinters.length}, ` +
              `队列: ${stats.totalPrinters}打印机/${stats.totalJobs}任务`,
          );
        }

        // 如果所有工作都完成了，考虑休眠
        if (
          this.printerWorkers.size === 0 &&
          this.waitingPrinters.length === 0 &&
          this.queueManager.getStats().totalJobs === 0
        ) {
          console.log('😴 所有任务已完成，主循环进入休眠');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      } catch (error) {
        console.error('主循环错误:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.running = false;
    console.log('🛑 ConcurrentQueueSchedulerV2: 主循环停止');
  }

  /**
   * 等待工作线程停止
   */
  private async waitForWorkerStop(workerId: string): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        const worker = Array.from(this.printerWorkers.values()).find(
          w => w.workerId === workerId,
        );
        if (!worker || !worker.running) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * 获取工作线程状态
   */
  public getWorkerStatus(): Array<{
    printerId: string;
    workerId: string;
    running: boolean;
    startedAt: Date;
    queueLength: number;
  }> {
    return Array.from(this.printerWorkers.entries()).map(
      ([printerId, worker]) => ({
        printerId,
        workerId: worker.workerId,
        running: worker.running,
        startedAt: worker.startedAt,
        queueLength: this.queueManager.getQueueLength(printerId),
      }),
    );
  }

  /**
   * 获取队列统计
   */
  public getQueueStats() {
    return {
      ...this.queueManager.getStats(),
      activeWorkers: this.printerWorkers.size,
      waitingPrinters: this.waitingPrinters.length,
    };
  }
}

