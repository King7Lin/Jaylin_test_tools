/**
 * enqueueMixedPrint
 * -----------------
 * 作用：将混合打印作业（文本/二维码/条码/图片等）写入 SQLite 队列，由调度器按打印机串行执行。
 * 参数：
 * - printerId: 与 Mixed.printMixed 中使用的 id 一致（例如 network_192.168.1.10_9100）。
 * - items: MixedItem[]，与 Mixed.printMixed 相同的数据结构。
 * - options: 传递给 Mixed.printMixed 的选项，例如 { smartText, cut, type, imin }，以及 { persistent, maxRetries }。
 * 返回：jobId（字符串）。
 */
import {DatabaseManager} from '../database/DatabaseManager';
import {DbQueueScheduler} from '../queue/DbQueueScheduler';
import {ConcurrentQueueSchedulerV2} from '../queue/ConcurrentQueueSchedulerV2';

/**
 * 批量入队混合打印作业
 * @param tasks 任务数组，每个任务包含 printerId, items, options
 * @returns Promise<string[]> 返回所有作业ID数组
 */
export async function enqueueMixedPrintBatch(
  tasks: Array<{
    printerId: string;
    items: any[];
    options?: any;
  }>,
): Promise<string[]> {
  if (!tasks || tasks.length === 0) {
    return [];
  }
  console.log('------------enqueueMixedPrintBatch', tasks);

  const db = DatabaseManager.getInstance() as any;
  console.log('------------db', db, db.db);

  if (!db.db) {
    await db.initialize().catch(() => {});
  }

  const jobs: any[] = [];
  const jobIds: string[] = [];

  // 处理每个任务
  for (const task of tasks) {
    const {printerId, items, options = {}} = task;

    // 尝试从数据库获取打印机配置，自动设置 type
    // try {
      
    //   if (printerCfg && !options.type) {
    //     // 如果 options 中没有指定 type，使用数据库中的 type
    //     options.type = printerCfg.type === 'imin' ? 'imin' : 'escpos';
    //   }
    // } catch (error) {
    //   // 如果获取打印机配置失败，继续使用原始 options
    //   console.warn('Failed to get printer config for type:', error);
    // }
    const printerCfg = await db.getPrinter(printerId);
    if (!options.type) {
      if (printerCfg.type === 'imin') options.type = 'imin';
      else if (printerCfg.type === 'xprinter') options.type = 'xprinter';
      else if (printerCfg.type === 'epson') options.type = 'epson';
      else options.type = 'escpos';
    }

    // 自动从数据库填充连接参数（如果用户没有手动传入）
    const cp = printerCfg.connectionParams || {};

    if (printerCfg.type === 'imin' && !options.imin) {
      options.imin = {
        address: cp.address,
        port: cp.port,
        printerType: cp.printerType || 'SPI',
      };
    } else if (printerCfg.type === 'xprinter' && !options.xprinter) {
      options.xprinter = {
        connectType: cp.connectType || 'net',
        address: cp.address || cp.target || cp.ip || cp.mac,
        retryCount: cp.retryCount,
        retryDelay: cp.retryDelay,
      };
    } else if (printerCfg.type === 'epson' && !options.epson) {
      options.epson = {
        series: cp.series,
        lang: cp.lang,
        EpsonConnectType: cp.connectType || cp.EpsonConnectType || 'TCP',  // 修复参数名
        connectType: cp.connectType,
        address: cp.address,
        port: cp.port || 9100,
        retryCount: cp.retryCount,
        retryDelay: cp.retryDelay,
      };
    } else if (printerCfg.type === 'escpos' && !options.escpos) {
      options.escpos = {
        type: cp.type || 'TCP',
        target: cp.target || cp.address,
        baudRate: cp.baudRate,
        timeout: cp.timeout,
        name: cp.name,
      };
    }
  

    // 生成作业ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    jobIds.push(jobId);

    // 创建作业对象
    jobs.push({
      id: jobId,
      printerId,
      data: JSON.stringify({printerId, items, options}),
      status: 'PENDING',
      priority: options.priority ?? 0,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: new Date(),
      metadata: {type: 'mixed', persistent: options.persistent === true},
    });
  }

  // // 清除现有的待处理作业（如果需要）
  // const printerIds = [...new Set(tasks.map(t => t.printerId))];
  // for (const printerId of printerIds) {
  //   const jobList = await db.getAllJobs();
  //   console.log(`------------jobList for ${printerId}`, jobList);

  //   // 清除作业
  //   // await db.clearJobs(printerId);
  // }

  // 批量保存所有作业
  await db.savePrintJobsBatch(jobs);
  console.log('------------enqueueMixedPrintBatch finish', jobs);
  
  // 触发调度器
  try {
    DbQueueScheduler.getInstance().schedule();
    
    // ✅ V2优化：批量通知所有打印机有新任务（事件驱动）
    const v2Scheduler = ConcurrentQueueSchedulerV2.getInstance();
    const uniquePrinterIds = [...new Set(tasks.map(t => t.printerId))];
    for (const printerId of uniquePrinterIds) {
      await v2Scheduler.notifyNewTask(printerId);
    }
  } catch (error) {
    console.log('------------enqueueMixedPrintBatch schedule error', error);
  }
  console.log('------------enqueueMixedPrintBatch schedule finish', jobIds);
  return jobIds;
}
