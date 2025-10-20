import {DatabaseManager, PrintJob} from '../database/DatabaseManager';
import {printMixed} from '../Mixed';
import Printer from '../Printer';
import {PrinterDriverManager} from '../Mixed';

// 错误类型枚举
enum ErrorType {
  PRINTER_BUSY = 'PRINTER_BUSY', // 打印机被占用
  CONNECTION_FAILED = 'CONNECTION_FAILED', // 连接失败
  NETWORK_ERROR = 'NETWORK_ERROR', // 网络错误
  HARDWARE_ERROR = 'HARDWARE_ERROR', // 硬件错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR', // 未知错误
}

// 错误分析结果
interface ErrorAnalysis {
  errorType: ErrorType;
  reason: string;
  shouldFailImmediately: boolean;
  retryRecommended: boolean;
}

/**
 * 分析连接错误类型和原因
 */
function analyzeConnectionError(error: any, printerConfig: any): ErrorAnalysis {
  const errorMessage = (error?.message || String(error)).toLowerCase();

  // 检查是否是打印机被占用
  if (
    errorMessage.includes('device busy') ||
    errorMessage.includes('resource busy') ||
    errorMessage.includes('printer busy') ||
    errorMessage.includes('already connected') ||
    errorMessage.includes('in use') ||
    errorMessage.includes('占用')
  ) {
    return {
      errorType: ErrorType.PRINTER_BUSY,
      reason: '打印机正被其他程序占用',
      shouldFailImmediately: false,
      retryRecommended: true,
    };
  }

  // 检查网络连接错误
  if (
    errorMessage.includes('connection refused') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('host unreachable') ||
    errorMessage.includes('no route to host')
  ) {
    return {
      errorType: ErrorType.NETWORK_ERROR,
      reason: '网络连接失败',
      shouldFailImmediately: false,
      retryRecommended: true,
    };
  }

  // 检查硬件错误
  if (
    errorMessage.includes('no such device') ||
    errorMessage.includes('device not found') ||
    errorMessage.includes('permission denied') ||
    errorMessage.includes('access denied')
  ) {
    return {
      errorType: ErrorType.HARDWARE_ERROR,
      reason: '打印机硬件不可用或权限不足',
      shouldFailImmediately: true,
      retryRecommended: false,
    };
  }

  // 一般连接失败
  if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
    return {
      errorType: ErrorType.CONNECTION_FAILED,
      reason: '打印机连接失败',
      shouldFailImmediately: false,
      retryRecommended: true,
    };
  }

  // 未知错误
  return {
    errorType: ErrorType.UNKNOWN_ERROR,
    reason: `未知错误: ${errorMessage}`,
    shouldFailImmediately: false,
    retryRecommended: true,
  };
}

/**
 * 根据错误类型计算重试延迟时间
 */
function calculateRetryDelay(attempt: number, errorType: ErrorType): number {
  const baseDelay = 1000; // 基础延迟 1 秒

  switch (errorType) {
    case ErrorType.PRINTER_BUSY:
      // 打印机被占用：较长的延迟，给其他程序释放资源的时间
      return Math.min(
        5000,
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 2000,
      );

    case ErrorType.NETWORK_ERROR:
      // 网络错误：中等延迟，指数退避
      return Math.min(5000, baseDelay * Math.pow(1.5, attempt - 1));

    case ErrorType.CONNECTION_FAILED:
      // 连接失败：标准延迟
      return Math.min(5000, baseDelay * attempt);

    case ErrorType.HARDWARE_ERROR:
      // 硬件错误：较短延迟，通常不会自动恢复
      return Math.min(3000, baseDelay * attempt);

    default:
      // 未知错误：标准延迟
      return Math.min(5000, baseDelay * attempt);
  }
}

/**
 * 检查打印机是否可能被其他程序占用
 */
async function checkPrinterAvailability(
  printerId: string,
  printerConfig: any,
): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    // 尝试快速连接测试

    console.log(
      '----------checkPrinterAvailability start 尝试快速连接测试',
      printerConfig,
    );
    if (printerConfig.type === 'imin') {
      // if (printerConfig.type) {
      const driverManager = PrinterDriverManager.getInstance();
      const driver = await driverManager.getDriver(printerId, {
        address: printerConfig.connectionParams.address,
        port: printerConfig.connectionParams.port,
        printerType: printerConfig.connectionParams.printerType || 'SPI',
      });
      console.log('----------checkPrinterAvailability driver', driver);

      const iminStatus = await driver.getPrinterStatus();
      console.log('----------checkPrinterAvailability isConnected', iminStatus);
      if (iminStatus.type === 0) {
        return {available: true};
      } else {
        return {
          available: false,
          reason: '打印机连接测试失败，可能被其他程序占用',
        };
      }
    }
    if (printerConfig.type === 'xprinter') {
      const driverManager = PrinterDriverManager.getInstance();
      const driver = await driverManager.getDriver(printerId, {
        __driverType: 'xprinter',
        connectType: printerConfig.connectionParams.connectType,
        address: printerConfig.connectionParams.address,
      });
      const xprinterStatus = await driver.getPrinterStatus();
      console.log(
        '----------checkPrinterAvailability xprinterStatus',
        xprinterStatus,
      );
      
      // 状态码: 0=正常, 1=缺纸, 2=盖子打开, 3=打印机错误, 4=未连接/超时
      if (xprinterStatus === 0) {
        return {available: true};
      } else {
        const reasonMap: Record<number, string> = {
          1: '打印机缺纸或纸将尽',
          2: '打印机离线（盖子打开）',
          3: '打印机错误（切刀错误、过热等）',
          4: '打印机未连接或连接超时',
        };
        return {
          available: false,
          reason: reasonMap[xprinterStatus] || '打印机状态异常',
        };
      }
    }
    if (printerConfig.type === 'epson') {
      const driverManager = PrinterDriverManager.getInstance();
      const driver = await driverManager.getDriver(printerId, {
        __driverType: 'epson',
        series: printerConfig.connectionParams.series,
        lang: printerConfig.connectionParams.lang,
        connectType: printerConfig.connectionParams.connectType,
        address: printerConfig.connectionParams.address,
      });
      console.log('----------checkPrinterAvailability epsonDriver', driver);
      if (driver && driver.isConnected()) {
        return {available: true};
      } else {
        return {
          available: false,
          reason: '打印机连接测试失败，可能被其他程序占用',
        };
      }
    }
    
    // ✅ 使用 PrinterDriverManager 处理 escpos 类型
    if (printerConfig.type === 'escpos' || printerConfig.type === 'network' || !printerConfig.type) {
      const driverManager = PrinterDriverManager.getInstance();
      const cp: any = printerConfig.connectionParams || {};
      const target =
        cp.target ||
        (cp.ip && cp.port ? `${cp.ip}:${cp.port}` : undefined) ||
        cp.address ||
        printerId;
      
      const driver = await driverManager.getDriver(printerId, {
        __driverType: 'escpos',
        type: (cp.type || printerConfig.type || 'network').toLowerCase(),
        target,
        name: printerConfig.name,
        baudRate: cp.baudRate,
        timeout: cp.timeout || 5000,
      });
      
      console.log('----------checkPrinterAvailability escposDriver', driver);
      
      if (driver && driver.isConnected && driver.isConnected()) {
        return {available: true};
      } else {
        return {
          available: false,
          reason: '打印机连接测试失败，可能被其他程序占用',
        };
      }
    }

    return {available: true};
  } catch (error: any) {
    console.log('----------checkPrinterAvailability error', error);

    const analysis = analyzeConnectionError(error, printerConfig);
    return {
      available: false,
      reason: analysis.reason,
    };
  }
}

/**
 * 执行从 DB 领取到的作业
 * ----------------------
 * 约定：
 * - job.metadata?.type === 'mixed' 时，job.data 为 JSON 字符串，结构：
 *   { printerId: string, items: MixedItem[], options?: MixedPrintOptions & { type?: 'escpos'|'imin', imin?: {...} } }
 * - 该函数解析后直接调用 Mixed.printMixed(printerId, items, options)。
 * - 非 mixed 类型暂留扩展位（比如 raw/escpos 直接发送）。
 */
export async function executePrintJob(job: PrintJob): Promise<void> {
  const db = DatabaseManager.getInstance();
  let printerCfg: any = null;

  try {
    console.log('------------executePrintJob start');

    // 确保数据库已初始化
    if (!db.isInitialized()) {
      await db.initialize();
    }

    // 获取打印机配置（只查询一次）
    printerCfg = await db.getPrinter(job.printerId);
    console.log('-------getprinter stop', printerCfg,job);


    // 1) 若是 ESC/POS 通道，确保连接（IMIN 由 Mixed 侧基于 options 直连，不走 RN 原生）
    const isImin = !!(
      job.metadata &&
      job.metadata.type === 'mixed' &&
      (() => {
        try {
          const p =
            typeof job.data === 'string'
              ? JSON.parse(job.data)
              : JSON.parse((job.data as Buffer).toString('utf8'));
          return p?.options?.type === 'imin';
        } catch {
          return false;
        }
      })()
    );
    const isXPrinter = !!(
      job.metadata &&
      job.metadata.type === 'mixed' &&
      (() => {
        try {
          const p =
            typeof job.data === 'string'
              ? JSON.parse(job.data)
              : JSON.parse((job.data as Buffer).toString('utf8'));
              console.log('------------isXPrinter', p);
              
          return p?.options?.type === 'xprinter';
        } catch {
          return false;
        }
      })()
    );
    const isEpson = !!(
      job.metadata &&
      job.metadata.type === 'mixed' &&
      (() => {
        try {
          const p =
            typeof job.data === 'string'
              ? JSON.parse(job.data)
              : JSON.parse((job.data as Buffer).toString('utf8'));
          return p?.options?.type === 'epson';
        } catch {
          return false;
        }
      })()
    );
    console.log('------------executePrintJob stop');
    console.log('-------连接状态检查 start',isImin,isXPrinter,isEpson);
    
    // ✅ 使用 PrinterDriverManager 统一处理所有驱动类型
    if (!isImin && !isXPrinter && !isEpson) {
      // escpos 类型使用 PrinterDriverManager
      try {
        if (printerCfg && printerCfg.connectionParams) {
          console.log('------------使用 PrinterDriverManager 处理 escpos 连接', printerCfg);
          const driverManager = PrinterDriverManager.getInstance();
          const cp: any = printerCfg.connectionParams;
          const target =
            cp.target ||
            (cp.ip && cp.port ? `${cp.ip}:${cp.port}` : undefined) ||
            cp.address ||
            job.printerId;
          
          // 获取或创建 escpos 驱动
          const driver = await driverManager.getDriver(job.printerId, {
            __driverType: 'escpos',
            type: (cp.type || printerCfg.type || 'network').toLowerCase(),
            target,
            name: printerCfg.name,
            baudRate: cp.baudRate,
            timeout: cp.timeout || 5000,
          });
          
          console.log('------------escpos driver 已准备', driver ? '成功' : '失败');
        }
      } catch (error) {
        console.log('------------escpos driver 连接错误', error);
        throw error;
      }
    }

    if (job.metadata?.type === 'mixed') {
      const payload =
        typeof job.data === 'string'
          ? job.data
          : (job.data as Buffer).toString('utf8');
      const parsed = JSON.parse(payload);
      const printerId: string = parsed.printerId || job.printerId;
      const items = parsed.items || parsed.contentItems || [];
      const options = parsed.options || {};

      // 使用已获取的打印机配置，确保传递正确的 type
      if (printerCfg) {
        // 如果 options 中没有指定 type，使用数据库中的 type
        if (!options.type) {
          if (printerCfg.type === 'imin') {
            options.type = 'imin';
          } else if (printerCfg.type === 'xprinter') {
            options.type = 'xprinter';
          } else if (printerCfg.type === 'epson') {
            options.type = 'epson';
          } else {
            options.type = 'escpos';
          }
        }
      }
      console.log(
        '------------printerCfg',
        printerCfg,
        options,
        // printlist,
        job.printerId,
      );
      await printMixed(printerId, items, options);
    } else {
      // 其他类型（原始字节/字符串）可扩展：这里先标记完成
      // 若需要直接发送原始字节，可在 Printer.ts 增加 sendRaw 接口并在此调用
    }
    await db.completeJob(job.id);
  } catch (e: any) {
    console.log('------------executePrintJob error', e);
    
    const availability = await checkPrinterAvailability(
      job.printerId,
      printerCfg,
    );
    if (!availability.available) {
      console.log(`打印机 ${job.printerId} 不可用: ${availability.reason}`);
      // 抛出特定错误以便进行适当的重试处理

      throw new Error(`PRINTER_BUSY: ${availability.reason}`);
    }
    console.log('------------executePrintJob失败', e);

    const attempt = (job.retryCount || 0) + 1;
    const max = job.maxRetries || 1;

    // 分析错误类型，决定重试策略
    const errorAnalysis = analyzeConnectionError(e, printerCfg);

    if (attempt >= max || errorAnalysis.shouldFailImmediately) {
      await db.failJob(job.id, e?.message || String(e));
      console.log(`任务 ${job.id} 最终失败: ${errorAnalysis.reason}`);
    } else {
      // 根据错误类型调整重试延迟
      const delayMs = calculateRetryDelay(attempt, errorAnalysis.errorType);
      await db.requeueJob(job.id, delayMs, attempt, max);
      console.log(
        `任务 ${job.id} 将在 ${delayMs}ms 后重试 (${attempt}/${max}): ${errorAnalysis.reason}`,
      );
    }
  }
}
