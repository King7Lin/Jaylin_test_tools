/**
 * PrinterQueueManager（打印机队列管理器）
 * --------------------------------
 * - 管理每个打印机的内存任务队列
 * - 支持增量更新，避免重复查询
 * - 维护队列状态与数据库同步
 */

export interface QueueJob {
  id: string;
  printerId: string;
  data: any;
  priority: number;
  createdAt: Date;
  status: 'PENDING' | 'PRINTING' | 'SUCCESS' | 'FAILED';
}

export class PrinterQueueManager {
  // 每个打印机的任务队列
  private queues = new Map<string, QueueJob[]>();
  
  // 记录每个打印机最后一个任务的时间戳（用于增量查询）
  private lastJobTimestamps = new Map<string, Date>();

  /**
   * 获取打印机队列
   */
  public getQueue(printerId: string): QueueJob[] {
    return this.queues.get(printerId) || [];
  }

  /**
   * 检查队列是否为空
   */
  public isEmpty(printerId: string): boolean {
    const queue = this.queues.get(printerId) || [];
    return queue.length === 0;
  }

  /**
   * 获取队列长度
   */
  public getQueueLength(printerId: string): number {
    const queue = this.queues.get(printerId) || [];
    return queue.length;
  }

  /**
   * 追加新任务到队列（增量更新，避免重复）
   */
  public appendJobs(printerId: string, newJobs: QueueJob[]): void {
    if (newJobs.length === 0) return;

    const existingQueue = this.queues.get(printerId) || [];
    const existingJobIds = new Set(existingQueue.map(j => j.id));

    // ✅ 只添加不存在的任务，避免重复
    const uniqueNewJobs = newJobs.filter(job => !existingJobIds.has(job.id));

    if (uniqueNewJobs.length > 0) {
      existingQueue.push(...uniqueNewJobs);
      this.queues.set(printerId, existingQueue);

      // 更新最后任务时间戳
      const lastJob = uniqueNewJobs[uniqueNewJobs.length - 1];
      this.lastJobTimestamps.set(printerId, lastJob.createdAt);

      console.log(
        `📥 打印机 ${printerId} 追加 ${uniqueNewJobs.length} 个新任务，队列长度: ${existingQueue.length}`,
      );
    }
  }

  /**
   * 完全替换队列（用于初始化或完全重载）
   */
  public setQueue(printerId: string, jobs: QueueJob[]): void {
    this.queues.set(printerId, jobs);

    if (jobs.length > 0) {
      const lastJob = jobs[jobs.length - 1];
      this.lastJobTimestamps.set(printerId, lastJob.createdAt);
    }

    console.log(`🔄 打印机 ${printerId} 队列已更新，任务数: ${jobs.length}`);
  }

  /**
   * 从队列取出下一个任务（FIFO）
   */
  public shift(printerId: string): QueueJob | undefined {
    const queue = this.queues.get(printerId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const job = queue.shift();
    
    if (queue.length === 0) {
      // 队列为空，清理资源
      this.queues.delete(printerId);
      this.lastJobTimestamps.delete(printerId);
    }

    return job;
  }

  /**
   * 获取最后一个任务的时间戳（用于增量查询）
   */
  public getLastJobTimestamp(printerId: string): Date | undefined {
    return this.lastJobTimestamps.get(printerId);
  }

  /**
   * 移除指定任务（失败时从队列移除）
   */
  public removeJob(printerId: string, jobId: string): void {
    const queue = this.queues.get(printerId);
    if (!queue) return;

    const index = queue.findIndex(j => j.id === jobId);
    if (index !== -1) {
      queue.splice(index, 1);
      console.log(`🗑️ 从打印机 ${printerId} 队列移除任务 ${jobId}`);
    }
  }

  /**
   * 清空打印机队列
   */
  public clearQueue(printerId: string): void {
    this.queues.delete(printerId);
    this.lastJobTimestamps.delete(printerId);
    console.log(`🧹 清空打印机 ${printerId} 队列`);
  }

  /**
   * 清空所有队列
   */
  public clearAll(): void {
    this.queues.clear();
    this.lastJobTimestamps.clear();
    console.log('🧹 清空所有打印机队列');
  }

  /**
   * 获取所有有任务的打印机ID列表
   */
  public getPrinterIds(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * 获取队列统计信息
   */
  public getStats(): {
    totalPrinters: number;
    totalJobs: number;
    printerStats: Array<{ printerId: string; jobCount: number }>;
  } {
    const printerStats = Array.from(this.queues.entries()).map(
      ([printerId, jobs]) => ({
        printerId,
        jobCount: jobs.length,
      }),
    );

    const totalJobs = printerStats.reduce((sum, p) => sum + p.jobCount, 0);

    return {
      totalPrinters: this.queues.size,
      totalJobs,
      printerStats,
    };
  }
}

