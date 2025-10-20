/**
 * 增强功能使用示例
 * 展示状态查询、图片上传、打印机特定指令和模板系统的使用方法
 */

import { 
  Printer, 
  EscPos, 
  PrinterCommands, 
  TemplateSystem,
  PrinterStatus,
  PrinterBrand,
  PrintTemplate,
  TemplateData
} from '../src';

// 1. 状态查询示例
export async function statusQueryExample() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 查询打印机状态
    const status: PrinterStatus = await Printer.getStatus();
    
    console.log('打印机状态:', status);
    
    // 检查各种状态
    if (status.paperOut) {
      console.warn('缺纸！');
    }
    
    if (status.coverOpen) {
      console.warn('打印机盖板打开！');
    }
    
    if (status.error) {
      console.error('打印机错误！');
    }
    
    if (status.paperLow) {
      console.warn('纸张不足！');
    }

    // 根据状态决定是否继续打印
    if (!status.paperOut && !status.error && !status.coverOpen) {
      console.log('打印机状态正常，可以继续打印');
      
      // 执行打印任务
      const cmd = EscPos.init() 
        + EscPos.text('状态检查通过', { align: 'center', bold: true })
        + EscPos.cut();
      
      await Printer.sendRaw(cmd);
    } else {
      console.log('打印机状态异常，暂停打印');
    }

  } catch (error) {
    console.error('状态查询失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 2. 图片上传到打印机内存示例
export async function imageUploadExample(base64Image: string) {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    const imageId = 1; // 图片ID，范围通常是1-255

    // 上传图片到打印机内存
    console.log('上传图片到打印机内存...');
    await Printer.uploadImageToMemory(base64Image, imageId);
    console.log('图片上传成功');

    // 打印存储的图片
    console.log('打印存储的图片...');
    await Printer.printStoredImage(imageId);
    console.log('图片打印完成');

    // 可选：删除存储的图片以释放内存
    // await Printer.deleteStoredImage(imageId);

  } catch (error) {
    console.error('图片上传/打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 3. 打印机特定指令示例
export async function printerSpecificCommandsExample() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 检测打印机品牌（这里假设是EPSON）
    const brand: PrinterBrand = 'EPSON';
    const model = 'TM-T88VI';
    
    // 获取打印机配置文件
    const profile = PrinterCommands.getPrinterProfile(brand, model);
    console.log('打印机配置:', profile);

    // 检查图片尺寸兼容性
    const imageWidth = 384;
    const imageHeight = 200;
    const isCompatible = PrinterCommands.PrinterCompatibility.checkImageSize(profile, imageWidth, imageHeight);
    
    if (!isCompatible) {
      console.warn('图片尺寸不兼容，调整尺寸...');
      const recommended = PrinterCommands.PrinterCompatibility.getRecommendedImageSize(profile);
      console.log('推荐尺寸:', recommended);
    }

    // 使用品牌特定指令
    const commands = PrinterCommands.PrinterCommandFactory.getCommands(brand);
    
    let cmd = '';
    
    // 品牌特定初始化
    cmd += commands.init();
    
    // 品牌特定状态查询
    cmd += commands.getStatus();
    
    // 打印内容
    cmd += EscPos.text('品牌特定指令测试', { align: 'center', bold: true });
    
    // 品牌特定切纸
    cmd += commands.cut();
    
    await Printer.sendRaw(cmd);
    console.log('品牌特定指令执行完成');

  } catch (error) {
    console.error('品牌特定指令执行失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 4. 模板系统示例
export async function templateSystemExample() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 创建自定义模板
    const customTemplate: PrintTemplate = {
      id: 'custom_receipt',
      name: '自定义收据',
      description: '带条件打印的自定义收据模板',
      version: '1.0.0',
      fields: [
        { 
          name: 'storeName', 
          type: 'text', 
          required: true, 
          style: { align: 'center', bold: true, width: 2, height: 2 } 
        },
        { name: 'orderNo', type: 'text', required: true },
        { name: 'date', type: 'date', required: true },
        { name: 'items', type: 'text', required: true },
        { name: 'total', type: 'currency', required: true, style: { bold: true, align: 'right' } },
        { name: 'discount', type: 'currency', required: false },
        { name: 'hasDiscount', type: 'boolean', required: false },
        { name: 'qrData', type: 'text', required: false }
      ],
      items: [
        { type: 'field', field: 'storeName' },
        { type: 'hr', options: { char: '=', width: 32 } },
        { type: 'text', content: '订单号: ' },
        { type: 'field', field: 'orderNo' },
        { type: 'text', content: '日期: ' },
        { type: 'field', field: 'date' },
        { type: 'hr' },
        { type: 'field', field: 'items' },
        { type: 'hr' },
        
        // 条件打印：如果有折扣则显示折扣信息
        {
          type: 'condition',
          condition: {
            field: 'hasDiscount',
            operator: 'eq',
            value: true,
            then: [
              { type: 'text', content: '折扣: -' },
              { type: 'field', field: 'discount' },
              { type: 'hr' }
            ]
          }
        },
        
        { type: 'text', content: '总计: ' },
        { type: 'field', field: 'total' },
        
        // 条件打印：如果有二维码数据则打印二维码
        {
          type: 'condition',
          condition: {
            field: 'qrData',
            operator: 'exists',
            then: [
              { type: 'feed', options: { lines: 1 } },
              { type: 'qr', field: 'qrData', options: { qrSize: 6 } }
            ]
          }
        },
        
        { type: 'feed', options: { lines: 2 } }
      ]
    };

    // 注册自定义模板
    TemplateSystem.templateManager.registerTemplate(customTemplate);

    // 准备模板数据
    const templateData: TemplateData = {
      storeName: '我的商店',
      orderNo: '20231201001',
      date: new Date(),
      items: '苹果 x2    ¥10.00\n香蕉 x3    ¥15.00',
      total: 25.00,
      discount: 5.00,
      hasDiscount: true,
      qrData: 'https://www.example.com/order/20231201001'
    };

    // 验证模板数据
    const validation = TemplateSystem.templateManager.validateTemplateData('custom_receipt', templateData);
    if (!validation.valid) {
      console.error('模板数据验证失败:', validation.errors);
      return;
    }

    // 渲染模板
    const { cmd, images } = TemplateSystem.templateManager.renderTemplate(
      'custom_receipt', 
      templateData, 
      { cut: true, init: true }
    );

    // 发送打印命令
    await Printer.sendRaw(cmd);
    
    // 打印图片（如果有）
    for (const image of images) {
      if (image.kind === 'image') {
        await Printer.printImage(image.base64);
      }
    }

    console.log('模板打印完成');

  } catch (error) {
    console.error('模板打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 5. 使用预定义模板示例
export async function predefinedTemplateExample() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 使用预定义的基础收据模板
    const receiptData: TemplateData = {
      storeName: '示例商店',
      orderNo: 'ORD-2023-001',
      date: new Date(),
      items: '商品A x1    ¥20.00\n商品B x2    ¥30.00',
      total: 50.00
    };

    const { cmd } = TemplateSystem.templateManager.renderTemplate(
      'receipt_basic',
      receiptData,
      { cut: true }
    );

    await Printer.sendRaw(cmd);
    console.log('预定义模板打印完成');

  } catch (error) {
    console.error('预定义模板打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 6. 循环打印示例（商品列表）
export async function loopPrintExample() {
  try {
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 创建支持循环的模板
    const loopTemplate: PrintTemplate = {
      id: 'product_list',
      name: '商品列表',
      version: '1.0.0',
      fields: [
        { name: 'title', type: 'text', required: true, style: { align: 'center', bold: true, width: 2 } },
        { name: 'products', type: 'text', required: true }
      ],
      items: [
        { type: 'field', field: 'title' },
        { type: 'hr' },
        {
          type: 'loop',
          loop: {
            field: 'products',
            items: [
              { type: 'text', content: '商品: ' },
              { type: 'field', field: 'name' },
              { type: 'text', content: ' 数量: ' },
              { type: 'field', field: 'quantity' },
              { type: 'text', content: ' 价格: ' },
              { type: 'field', field: 'price' },
              { type: 'hr', options: { char: '-', width: 20 } }
            ]
          }
        },
        { type: 'feed', options: { lines: 2 } }
      ]
    };

    TemplateSystem.templateManager.registerTemplate(loopTemplate);

    const loopData: TemplateData = {
      title: '商品清单',
      products: [
        { name: '苹果', quantity: 5, price: '¥25.00' },
        { name: '香蕉', quantity: 3, price: '¥15.00' },
        { name: '橙子', quantity: 2, price: '¥20.00' }
      ]
    };

    const { cmd } = TemplateSystem.templateManager.renderTemplate(
      'product_list',
      loopData,
      { cut: true }
    );

    await Printer.sendRaw(cmd);
    console.log('循环打印完成');

  } catch (error) {
    console.error('循环打印失败:', error);
  } finally {
    await Printer.disconnect();
  }
}

// 7. 综合示例：完整的打印流程
export async function comprehensiveExample() {
  try {
    // 1. 检查权限
    const hasPermission = await Printer.checkPermissions();
    if (!hasPermission) {
      console.error('权限不足');
      return;
    }

    // 2. 连接打印机
    await Printer.connect({ type: 'network', target: '192.168.1.100:9100' });

    // 3. 检查打印机状态
    const status = await Printer.getStatus();
    if (status.paperOut || status.error || status.coverOpen) {
      console.error('打印机状态异常，无法打印');
      return;
    }

    // 4. 上传图片到打印机内存
    const logoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    await Printer.uploadImageToMemory(logoBase64, 1);

    // 5. 使用模板打印
    const templateData: TemplateData = {
      storeName: '综合示例商店',
      orderNo: 'COMP-2023-001',
      date: new Date(),
      items: '商品1 x1    ¥10.00\n商品2 x2    ¥20.00',
      total: 30.00,
      qrData: 'https://example.com/order/COMP-2023-001'
    };

    const { cmd, images } = TemplateSystem.templateManager.renderTemplate(
      'receipt_with_qr',
      templateData,
      { cut: true }
    );

    // 6. 执行打印
    await Printer.sendRaw(cmd);
    
    // 打印存储的图片
    await Printer.printStoredImage(1);

    // 7. 打印其他图片
    for (const image of images) {
      if (image.kind === 'image') {
        await Printer.printImage(image.base64);
      }
    }

    console.log('综合示例打印完成');

  } catch (error) {
    console.error('综合示例执行失败:', error);
  } finally {
    await Printer.disconnect();
  }
}
