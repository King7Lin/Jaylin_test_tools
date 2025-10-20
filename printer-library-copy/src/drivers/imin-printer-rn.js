// 增强版 React Native 友好的 iMin 打印机 SDK 封装
// 基于官方 JSPrinterSDK v1.8 文档实现完整功能
// 支持基于 WebSocket 的打印功能，包含调试、错误处理和完整方法覆盖
// 与 React Native 兼容，无 DOM 依赖
//
// 主要功能：
// ✅ 打印机初始化和状态查询
// ✅ 文本打印（支持多语言字符编码）
// ✅ 条码和二维码打印（UPC、EAN、CODE39、CODE128等）
// ✅ 图片打印（base64/URL）
// ✅ 表格打印
// ✅ 格式设置（字体、大小、对齐、样式等）
// ✅ 纸张控制（走纸、切纸、钱箱）
// ✅ 双二维码打印（特定型号支持）
// ✅ 标签打印功能
//
// 使用说明：
// 1. 通过 WebSocket 连接到打印服务
// 2. 服务端自动处理字符编码转换
// 3. 支持 Unicode 文本直接打印
// 4. 所有参数都有默认值和范围检查

/**
 * 打印机连接类型枚举
 * 定义了不同类型的打印机连接方式
 */
const PrinterType = {
  USB: 'USB', // USB 连接
  SPI: 'SPI', // SPI 接口连接（默认）
  Bluetooth: 'Bluetooth', // 蓝牙连接
};

/**
 * TCP 连接协议枚举
 * 定义了 WebSocket 连接使用的协议类型
 */
const TCPConnectProtocol = {
  WEBSOCKET_WS: 'ws://', // WebSocket 协议（不安全）
  WEBSOCKET_WSS: 'wss://', // WebSocket 安全协议
};

/**
 * 打印机 WebSocket 通信基础类
 * 负责建立和维护与打印服务之间的 WebSocket 连接
 * 处理消息的发送和接收，以及连接状态管理
 */
class PrinterWebSocket {
  /**
   * 构造函数 - 初始化 WebSocket 连接参数
   * @param {string} address - 打印服务 IP 地址，默认为 '127.0.0.1'
   * @param {number} port - 打印服务端口号，默认为 8081
   */
  constructor(address = '127.0.0.1', port = 8081) {
    this.address = address; // 服务器地址
    this.port = port; // 服务器端口
    this.protocol = TCPConnectProtocol.WEBSOCKET_WS; // 连接协议
    this.prefix = '/websocket'; // WebSocket 路径前缀
    this.ws = null; // WebSocket 实例
    this.callback = () => {}; // 消息接收回调函数
    this.isConnected = false; // 连接状态标志
    this.debug = true; // 调试模式开关
  }

  /**
   * 调试日志输出方法
   * @param {string} message - 要输出的日志消息
   */
  log(message) {
    // if (this.debug) console.log('[PrinterWebSocket]', message);
  }

  /**
   * 错误日志输出方法
   * @param {string} message - 要输出的错误消息
   */
  error(message) {
    if (this.debug) console.error('[PrinterWebSocket Error]', message);
  }

  /**
   * 建立 WebSocket 连接
   * @returns {Promise<boolean>} 连接成功返回 true，失败抛出异常
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // 构建完整的 WebSocket URL
        const url = `${this.protocol}${this.address}:${this.port}${this.prefix}`;
        this.log(`正在连接到 ${url}`);

        // 创建 WebSocket 实例
        const ws = new WebSocket(url);

        // 连接成功事件处理
        ws.onopen = () => {
          this.isConnected = true;
          this.log('连接成功建立');
          resolve(true);
        };

        // 接收消息事件处理
        ws.onmessage = e => {
          try {
            const data = JSON.parse(e.data);
            // this.log('收到消息:', data);
            this.callback(data); // 调用用户定义的回调函数
          } catch (err) {
            this.error('消息解析失败:', err);
          }
        };

        // 连接关闭事件处理
        ws.onclose = e => {
          this.isConnected = false;
          this.log('连接已关闭:', e.code, e.reason);
        };

        // 连接错误事件处理
        ws.onerror = err => {
          this.isConnected = false;
          this.error('WebSocket 错误:', err);
          reject(err);
        };

        this.ws = ws; // 保存 WebSocket 实例
      } catch (err) {
        this.error('连接失败:', err);
        reject(err);
      }
    });
  }

  /**
   * 构造发送给打印服务的参数消息
   * @param {string} text - 主要文本内容
   * @param {number} type - 消息类型（指令类型）
   * @param {number} value - 数值参数
   * @param {object} labelData - 标签数据
   * @param {object} object - 额外参数对象
   * @returns {string} JSON 格式的消息字符串
   */
  sendParameter(text = '', type = 0, value = -1, labelData = {}, object = {}) {
    const message = {
      data: Object.assign(
        {},
        {
          text: text !== undefined ? text : '', // 文本内容
          value: value !== undefined ? value : -1, // 数值参数
          labelData: labelData !== undefined ? labelData : {}, // 标签数据
        },
        object ? object : {}, // 合并额外参数
      ),
      type: type !== undefined ? type : 0, // 消息类型
    };
    this.log('sendParameter发送消息:', message);
    return JSON.stringify(message); // 返回 JSON 字符串
  }

  /**
   * 发送消息到打印服务
   * @param {string} message - 要发送的 JSON 消息字符串
   */
  send(message) {
    if (this.ws && this.ws.readyState === 1) {
      // 检查连接状态
      this.ws.send(message);
      this.log('消息已发送send', message);
    } else {
      this.error('WebSocket 未连接或未就绪');
    }
  }

  /**
   * 关闭 WebSocket 连接
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.log('连接已关闭');
    }
  }
}

/**
 * iMin 打印机主要类
 * 继承自 PrinterWebSocket，提供完整的打印功能接口
 * 封装了所有打印指令和参数设置方法
 */
class IminPrinter extends PrinterWebSocket {
  /**
   * 构造函数 - 初始化打印机实例
   * @param {string} address - 打印服务地址
   * @param {number} port - 打印服务端口
   */
  constructor(address, port) {
    super(address, port);
    this.connect_type = PrinterType.SPI; // 默认连接类型
  }

  // ============ 初始化和状态相关方法 ============

  /**
   * 初始化打印机
   * 重置打印机的逻辑程序（例如：布局设置、粗体等样式设置），但不清空缓冲区数据
   * 未完成的打印作业将在重置后继续
   * @param {string} connectType - 连接类型 (USB/SPI/Bluetooth)
   */
  initPrinter(connectType = PrinterType.SPI) {
    this.connect_type = connectType;
    this.send(this.sendParameter(connectType, 1));
    this.log('打印机已初始化，连接类型:', connectType);
  }

  /**
   * 获取打印机状态
   * @param {string} connectType - 连接类型
   * @returns {Promise<object>} 返回包含状态信息的对象
   * 返回值说明：
   * -1 -> 打印机未连接或未开机
   * 1 -> 打印机未连接或未开机
   * 3 -> 打印头开启
   * 7 -> 缺纸
   * 8 -> 纸张即将用完
   * 99 -> 其他错误
   */
  async getPrinterStatus(connectType = PrinterType.SPI) {
    this.connect_type = connectType;
    return new Promise((resolve, reject) => {
      this.send(this.sendParameter(connectType, 2));

      // 设置消息回调处理状态响应
      this.callback = data => {
        if (data.type === 2) {
          // 状态查询响应类型
          const status = {...data.data, text: String(data.data.value)};
          this.log('打印机状态:', status);
          resolve(status);
        }
      };

      // 设置超时处理
      setTimeout(() => reject(new Error('状态查询超时')), 5000);
    });
  }

  // ============ 基本打印控制方法 ============

  /**
   * 打印并换行
   */
  printAndLineFeed() {
    this.send(this.sendParameter('', 3));
    this.log('已打印并换行');
  }

  /**
   * 打印并前进指定高度的纸张
   * 最大前进距离为1016mm（40英寸），超过此距离将使用最大距离
   * @param {number} height - 前进高度 (0-255)
   */
  printAndFeedPaper(height) {
    this.send(
      this.sendParameter('', 4, height <= 0 ? 0 : height >= 255 ? 255 : height),
    );
    this.log('前进纸张高度:', height);
  }

  /**
   * 部分切纸
   */
  partialCutPaper() {
    this.send(this.sendParameter('', 5));
    this.log('执行部分切纸');
  }

  // ============ 文本格式设置方法 ============

  /**
   * 设置对齐方式
   * @param {number} alignment - 对齐方式 (0=左对齐, 1=居中, 2=右对齐)
   */
  setAlignment(alignment) {
    this.send(this.sendParameter('', 6, alignment));
    this.log('设置对齐方式:', alignment);
  }
  /**
   * 设置文本对齐方式
   * @param {number} alignment - 对齐方式 (0=左对齐, 1=居中, 2=右对齐)
   */
  setTextAlignment(text, alignment) {
    this.send(this.sendParameter(text, 6, alignment));
    this.log('设置对齐方式:', alignment);
  }

  /**
   * 设置文本大小
   * @param {number} size - 字体大小 (默认28)
   */
  setTextSize(size) {
    this.send(this.sendParameter('', 7, size));
    this.log('设置文本大小:', size);
  }

  /**
   * 设置字体类型
   * @param {number} typeface - 字体类型
   * DEFAULT = 0, MONOSPACE = 1, DEFAULT_BOLD = 2, SANS_SERIF = 3, SERIF = 4
   */
  setTextTypeface(typeface) {
    this.send(this.sendParameter('', 8, typeface));
    this.log('设置字体类型:', typeface);
  }

  /**
   * 设置字体样式
   * @param {number} style - 样式 (NORMAL=0, BOLD=1, ITALIC=2, BOLD_ITALIC=3)
   */
  setTextStyle(style) {
    this.send(
      this.sendParameter('', 9, style <= 0 ? 0 : style >= 3 ? 3 : style),
    );
    this.log('设置字体样式:', style);
  }

  /**
   * 设置行间距
   * @param {number} space - 行间距 (默认1.0f)
   */
  setTextLineSpacing(space) {
    this.send(this.sendParameter('', 10, space));
    this.log('设置行间距:', space);
  }

  /**
   * 设置打印宽度
   * @param {number} width - 打印宽度 (80mm打印纸默认有效打印宽度576)
   */
  setTextWidth(width) {
    this.send(
      this.sendParameter('', 11, width <= 0 ? 0 : width >= 576 ? 576 : width),
    );
    this.log('设置打印宽度:', width);
  }

  // ============ 文本打印方法 ============

  /**
   * 打印文本（带类型控制）
   * @param {string} text - 打印内容
   * @param {number} type textalign
   * 注意：要改变打印文本的样式（如对齐、字体大小、粗体等），需要在调用printText方法前设置
   */
  printText(text, type) {
    const message =
      type !== undefined
        ? this.sendParameter(text, 13, type <= 0 ? 0 : type >= 2 ? 2 : type)
        : this.sendParameter(text + '\n', 12);
    this.send(message);
    this.log('打印文本:', text, '类型:', type);
  }

  // ============ 条码和二维码相关方法 ============

  /**
   * 设置条码宽度
   * @param {number} width - 条码宽度级别 (2-6)，如果不设置默认条码宽度级别为3
   */
  setBarCodeWidth(width) {
    this.send(
      this.sendParameter('', 15, width <= 1 ? 1 : width >= 6 ? 6 : width),
    );
    this.log('设置条码宽度:', width);
  }

  /**
   * 设置条码高度
   * @param {number} height - 条码高度 (1-255)，每8个点为1mm
   */
  setBarCodeHeight(height) {
    this.send(
      this.sendParameter(
        '',
        16,
        height <= 1 ? 1 : height >= 255 ? 255 : height,
      ),
    );
    this.log('设置条码高度:', height);
  }

  /**
   * 设置条码内容打印位置（HRI字符）
   * @param {number} position - HRI字符打印位置
   * 0 -> 不打印
   * 1 -> 条码上方
   * 2 -> 条码下方
   * 3 -> 条码上下都打印
   */
  setBarCodeContentPrintPos(position) {
    this.send(
      this.sendParameter(
        '',
        17,
        position <= 0 ? 0 : position >= 3 ? 3 : position,
      ),
    );
    this.log('设置条码内容位置:', position);
  }

  /**
   * 打印条码
   * @param {number} barCodeType - 条码类型 (0-6, 73)
   * @param {string} barCodeContent - 条码内容，CODE128需要前缀{A,{B或{C
   * @param {number} alignmentMode - 对齐模式 (0=左对齐, 1=居中, 2=右对齐)
   *
   * 条码类型说明：
   * 0=UPC-A, 1=UPC-E, 2=JAN13/EAN13, 3=JAN8/EAN8, 4=CODE39, 5=ITF, 6=CODABAR, 8=CODE128
   */
  printBarCode(barCodeType, barCodeContent, alignmentMode) {
    // 验证条形码类型，CODE128(73)需要特殊处理
    const validType =
      barCodeType <= 0
        ? 0
        : barCodeType === 73
        ? 73 // CODE128特殊类型
        : barCodeType >= 6
        ? 6
        : barCodeType;

    const message =
      alignmentMode !== undefined
        ? this.sendParameter(barCodeContent, 19, barCodeType, undefined, {
            alignmentMode:
              alignmentMode <= 0 ? 0 : alignmentMode >= 2 ? 2 : alignmentMode,
          })
        : this.sendParameter(barCodeContent, 18, barCodeType);
    this.send(message);
    this.log(
      '打印条码:',
      barCodeContent,
      '类型:',
      barCodeType,
      '验证后类型:',
      validType,
    );
  }

  /**
   * 设置二维码大小
   * @param {number} level - 二维码块大小，单位：点 (1-16)
   */
  setQrCodeSize(level) {
    this.send(
      this.sendParameter('', 20, level <= 1 ? 1 : level >= 9 ? 9 : level),
    );
    this.log('设置二维码大小:', level);
  }

  /**
   * 设置二维码纠错级别
   * @param {number} level - 纠错级别 (48-51)
   */
  setQrCodeErrorCorrectionLev(level) {
    this.send(
      this.sendParameter('', 21, level <= 48 ? 48 : level >= 51 ? 51 : level),
    );
    this.log('设置二维码纠错级别:', level);
  }

  /**
   * 设置条码和二维码的左边距
   * @param {number} marginValue - 左边距值 (0-576)
   */
  setLeftMargin(marginValue) {
    this.send(this.sendParameter('', 22, marginValue));
    this.log('设置左边距:', marginValue);
  }

  /**
   * 打印二维码
   * @param {string} content - 二维码内容
   * @param {number} alignment - 对齐方式 (0=左对齐, 1=居中, 2=右对齐)
   */
  printQrCode(content, alignment) {
    const message =
      alignment !== undefined
        ? this.sendParameter(
            content,
            23,
            alignment <= 0 ? 0 : alignment >= 2 ? 2 : alignment,
          )
        : this.sendParameter(content, 22);
    this.send(message);
    this.log('打印二维码:', content);
  }

  // ============ 图片打印方法 ============

  /**
   * 打印单张位图图片
   * @param {string} imgResources - 图片资源 (base64 或 URL)
   * 支持格式：base64 编码字符串或图片 URL
   * 示例：
   * printSingleBitmap("data:image/ico;base64,AAABAAEAICAAAAEAIACoEAAAFgAAACgAAAAgAAAAQAAAAAEAIAAAAAAAABAAAAAAAAAAAAAAAAAAA...");
   * printSingleBitmap('https://example.com/image.png')
   */
  async printSingleBitmap(imgResources, alignmentMode) {
    // 兼容 React Native：优先使用 RN 风格的 FormData 上传（{ uri, name, type }），并提供若干回退方案
    if (!imgResources) {
      await this.send(
        this.sendParameter(
          '',
          alignmentMode !== void 0 ? 27 : 26,
          alignmentMode !== void 0 ? alignmentMode : void 0,
        ),
      );
      // this.error('未提供图片资源');
      // throw new Error('No image resource provided');
    }

    const isDataURI = /^data:/i.test(imgResources);
    let fileBlob = null;
    let mime = 'image/jpeg';

    try {
      // 尝试在浏览器环境获取 blob（部分 RN 版本也支持）
      if (!isDataURI && typeof fetch === 'function') {
        try {
          this.log('尝试从 URL 获取图片（fetch->blob）: ' + imgResources);
          const resp = await fetch(imgResources);
          if (resp && resp.ok && typeof resp.blob === 'function') {
            fileBlob = await resp.blob();
            mime = fileBlob.type || mime;
          }
        } catch (e) {
          this.log(
            'fetch->blob 失败，后续尝试 RN 风格上传或回退',
            e && e.message ? e.message : e,
          );
        }
      }

      // data URI -> blob
      if (!fileBlob && isDataURI) {
        const parts = imgResources.split(',');
        const meta = parts[0] || '';
        const base64 = parts[1] || '';
        const mimeMatch = meta.match(/data:([^;]+);/);
        mime = mimeMatch ? mimeMatch[1] : mime;
        try {
          if (typeof atob === 'function') {
            const byteString = atob(base64);
            const ia = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++)
              ia[i] = byteString.charCodeAt(i);
            fileBlob = new Blob([ia], {type: mime});
          }
        } catch (e) {
          this.log(
            'dataURI -> blob 失败，后续将使用 RN 样式 URI 或 base64 JSON 回退',
            e && e.message ? e.message : e,
          );
        }
      }

      // 组装 FormData
      const formData = new FormData();

      // 检测是否为 React Native（尽量用 require 判断）
      let isReactNative = false;
      try {
        // eslint-disable-next-line global-require
        const rn = require('react-native');
        isReactNative = !!rn;
      } catch (e) {
        isReactNative = false;
      }

      if (fileBlob && !isReactNative) {
        formData.append('file', fileBlob, 'image.jpg');
      } else if (isReactNative) {
        // RN 环境：直接使用 uri 对象，支持 data URI 或 http/https 本地/远程 URL
        const fileObj = {uri: imgResources, name: 'image.jpg', type: mime};
        formData.append('file', fileObj);
      } else if (fileBlob) {
        formData.append('file', fileBlob, 'image.jpg');
      } else if (isDataURI) {
        // base64 回退（服务器需支持 /upload-base64）
        this.log('使用 base64 JSON 回退上传');
        const uploadProtocol =
          this.protocol === TCPConnectProtocol.WEBSOCKET_WSS ? 'https' : 'http';
        const uploadUrl = `${uploadProtocol}://${this.address}:${this.port}/upload`;
        const payload = JSON.stringify({
          filename: 'image.jpg',
          mime,
          data: imgResources.split(',')[1],
        });
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: payload,
        });
        if (!resp.ok) throw new Error('Upload base64 failed: ' + resp.status);
        const text = await resp.text();
        if (!text) throw new Error('No response data from upload');

        await this.send(
          this.sendParameter(
            '',
            alignmentMode !== void 0 ? 27 : 26,
            alignmentMode !== void 0 ? alignmentMode : void 0,
          ),
        );
        this.log('图片打印命令已发送 (base64 回退)');
        return 1;
      } else {
        throw new Error('无法获取可上传的文件数据');
      }

      // 构造上传 URL：基于 websocket 协议选择 http/https
      const uploadProtocol =
        this.protocol === TCPConnectProtocol.WEBSOCKET_WSS ? 'https' : 'http';
      // Android 模拟器注意：127.0.0.1 指向模拟器自身，若后端运行在主机上请使用 10.0.2.2
      let addressToUse = this.address;
      if (isReactNative) {
        try {
          // eslint-disable-next-line global-require
          const rn = require('react-native');
          const {Platform} = rn;
          if (
            Platform &&
            Platform.OS === 'android' &&
            (this.address === '127.0.0.1' || this.address === 'localhost')
          ) {
            addressToUse = '10.0.2.2';
            this.log(
              'Android emulator detected, using 10.0.2.2 to reach host machine',
            );
          }
        } catch (e) {
          // ignore
        }
      }

      try {
        const uploadUrl = `${uploadProtocol}://${this.address}:${this.port}/upload`;
        this.log('上传图片到打印服务: ' + uploadUrl);

        const uploadResp = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });
        if (!uploadResp.ok)
          throw new Error('Upload failed: ' + uploadResp.status);
        const resultValue = await uploadResp.text();
        if (!resultValue) throw new Error('No response data from upload');
        console.log('图片上传结果:', uploadResp, resultValue);

        // 上传成功，发送打印命令（与浏览器版一致）
        await this.send(
          this.sendParameter(
            '',
            alignmentMode !== void 0 ? 27 : 26,
            alignmentMode !== void 0 ? alignmentMode : void 0,
          ),
        );
      } catch (error) {
        console.log('图片上传失败:', error, formData);
      }
      // 切纸
      // if (typeof this.partialCutPaper === 'function') {
      //   this.partialCutPaper();
      // } else if (typeof this.partialCut === 'function') {
      //   this.partialCut();
      // }

      this.log('图片打印命令已发送');
      return 1;
    } catch (err) {
      this.error(
        'printSingleBitmap 失败: ' + (err && err.message ? err.message : err),
      );
      if (/Network request failed/i.test(String(err))) {
        this.error(
          '网络请求失败提示：\n - 请检查打印服务地址与端口是否可从设备/模拟器访问\n - Android 模拟器请使用 10.0.2.2 访问主机上的服务而非 127.0.0.1\n - 若使用 http，请确认 Android 网络安全配置或使用 https\n - 确认服务器 /upload 接口支持 multipart/form-data 或 /upload-base64 支持 JSON base64 回退',
        );
      }
      throw err;
    }
  }

  // ============ 其他高级功能方法 ============

  /**
   * 打印表格文本（不支持阿拉伯文）
   * @param {Array} colTextArr - 列文本字符串数组
   * @param {Array} colWidthArr - 每列宽度数组，以英文字符计算，每个中文字符占两个英文字符，每列宽度大于0
   * @param {Array} colAlign - 对齐方式：0=左对齐, 1=居中, 2=右对齐
   * @param {Array} size - 每列字符串数组的字体大小
   * @param {number} width - 一行打印的总宽度 (80mm打印纸=576)
   */
  printColumnsText(colTextArr, colWidthArr, colAlignArr, size, width) {
    this.send(
      this.sendParameter(
        '',
        14,
        width < 0 ? 0 : width > 576 ? 576 : width,
        undefined,
        {
          colTextArr,
          colWidthArr,
          colAlign: colAlignArr.map(item =>
            item <= 0 ? 0 : item >= 2 ? 2 : item,
          ),
          size,
        },
      ),
    );
    this.log('打印表格文本');
  }

  /**
   * 设置双二维码大小
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} size - 大小 (1-8)
   */
  setDoubleQRSize(size) {
    this.send(this.sendParameter('', 27, size <= 1 ? 1 : size >= 8 ? 8 : size));
    this.log('设置双二维码大小:', size);
  }

  /**
   * 设置双二维码1级别
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} level - 级别 (0-3)
   */
  setDoubleQR1Level(level) {
    this.send(
      this.sendParameter('', 28, level <= 0 ? 0 : level >= 3 ? 3 : level),
    );
    this.log('设置双二维码1级别:', level);
  }

  /**
   * 设置双二维码2级别
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} level - 级别 (0-3)
   */
  setDoubleQR2Level(level) {
    this.send(
      this.sendParameter('', 29, level <= 0 ? 0 : level >= 3 ? 3 : level),
    );
    this.log('设置双二维码2级别:', level);
  }

  /**
   * 设置双二维码1左边距
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} marginValue - 左边距值 (0-576)
   */
  setDoubleQR1MarginLeft(marginValue) {
    this.send(this.sendParameter('', 30, marginValue));
    this.log('设置双二维码1左边距:', marginValue);
  }

  /**
   * 设置双二维码2左边距
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} marginValue - 左边距值 (0-576)
   */
  setDoubleQR2MarginLeft(marginValue) {
    this.send(this.sendParameter('', 31, marginValue));
    this.log('设置双二维码2左边距:', marginValue);
  }

  /**
   * 设置双二维码1版本
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} version - 版本 (0-40)
   */
  setDoubleQR1Version(version) {
    this.send(
      this.sendParameter(
        '',
        32,
        version <= 0 ? 0 : version >= 40 ? 40 : version,
      ),
    );
    this.log('设置双二维码1版本:', version);
  }

  /**
   * 设置双二维码2版本
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {number} version - 版本 (0-40)
   */
  setDoubleQR2Version(version) {
    this.send(
      this.sendParameter(
        '',
        33,
        version <= 0 ? 0 : version >= 40 ? 40 : version,
      ),
    );
    this.log('设置双二维码2版本:', version);
  }

  /**
   * 打印双二维码
   * 仅支持 M2-203、M2 Pro、M2 Max 和 D1 型号
   * @param {Array} colTextArr - 列文本字符串数组
   */
  printDoubleQR(colTextArr) {
    this.send(this.sendParameter('', 34, undefined, undefined, {colTextArr}));
    this.log('打印双二维码:', colTextArr);
  }

  // ============ 标签打印相关方法（适用于标签打印机） ============

  /**
   * 初始化标签画布
   * @param {object} options - 画布选项
   */
  labelInitCanvas(options) {
    this.send(this.sendParameter('', 38, undefined, undefined, options));
    this.log('初始化标签画布');
  }

  /**
   * 向标签添加文本
   * @param {object} options - 文本选项
   */
  labelAddText(options) {
    this.send(this.sendParameter('', 39, undefined, undefined, options));
    this.log('向标签添加文本');
  }

  /**
   * 向标签添加二维码
   * @param {object} options - 二维码选项
   */
  labelAddQrCode(options) {
    this.send(this.sendParameter('', 40, undefined, undefined, options));
    this.log('向标签添加二维码');
  }

  /**
   * 打印标签画布
   * @param {object} options - 打印选项
   */
  labelPrintCanvas(options) {
    this.send(this.sendParameter('', 43, undefined, undefined, options));
    this.log('打印标签画布');
  }

  // ============ 工具方法 ============

  /**
   * 检查打印机是否已连接
   * @returns {boolean} 连接状态
   */
  isPrinterConnected() {
    return this.isConnected;
  }
  // 打开钱箱
  openCashBox(){
    this.send(this.sendParameter('', 100));
  }
}

// 导出模块
module.exports = {IminPrinter, PrinterType};
