/**
 * DbQueueScheduler（队列调度器）
 * --------------------------------
 * V2优化版调度器入口
 * - 事件驱动 + 内存队列
 * - 支持多台打印机并发执行
 * - 智能并发控制
 */
import { ConcurrentQueueSchedulerV2 } from './ConcurrentQueueSchedulerV2';

export class DbQueueScheduler {
  private static instance: DbQueueScheduler;

  private constructor() {}

  public static getInstance(): DbQueueScheduler {
    if (!DbQueueScheduler.instance) {
      DbQueueScheduler.instance = new DbQueueScheduler();
    }
    return DbQueueScheduler.instance;
  }

  /**
   * 启动V2调度器
   */
  public schedule() {
    console.log('🚀 启动打印队列调度器 - V2优化版（事件驱动 + 内存队列）');
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    v2Scheduler.schedule();
  }

  /**
   * 停止V2调度器
   */
  public async stop() {
    console.log('🛑 停止打印队列调度器');
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    await v2Scheduler.stop();
  }

  /**
   * 设置最大并发工作线程数
   */
  public setMaxConcurrentWorkers(max: number) {
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    v2Scheduler.setMaxConcurrentWorkers(max);
  }

  /**
   * 设置任务超时时间（毫秒）
   */
  public setTaskTimeout(timeout: number) {
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    v2Scheduler.setTaskTimeout(timeout);
  }

  /**
   * 获取工作线程状态
   */
  public getWorkerStatus() {
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    return v2Scheduler.getWorkerStatus();
  }

  /**
   * 获取队列统计
   */
  public getQueueStats() {
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    return v2Scheduler.getQueueStats();
  }
}
