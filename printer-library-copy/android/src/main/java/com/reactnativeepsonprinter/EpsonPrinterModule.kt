package com.reactnativeepsonprinter

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.epson.epos2.Epos2Exception
import com.epson.epos2.printer.Printer
import com.epson.epos2.printer.PrinterStatusInfo
import com.epson.epos2.printer.ReceiveListener
import java.nio.charset.StandardCharsets

/**
 * React Native 原生打印模块（Android）- Epson ePOS2 SDK
 *
 * 封装 Epson ePOS2 SDK 的主要能力：
 * - 打印机初始化：支持多种型号和语言
 * - 连接管理：蓝牙/网络/USB
 * - 文本打印：支持多语言（中文繁体/简体、日文、韩文、泰文等）、字体、大小、对齐、旋转
 * - 图片打印：支持 Bitmap、Base64、URI
 * - 条形码/二维码打印
 * - 切纸、走纸、钱箱控制
 * - 状态查询
 *
 * 事件：
 * - EpsonPrinterStatus：打印状态回调（code/message/status）
 */
class EpsonPrinterModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), ReceiveListener {
    
    // 存储多个打印机实例
    private val printers = mutableMapOf<String, Printer>()
    // 当前活跃的打印机 ID
    private var currentPrinterId: String? = null
    // 连接超时时间（毫秒）
    private val DISCONNECT_INTERVAL = 500L

    override fun getName(): String = "EpsonPrinterModule"

    /**
     * 发送事件到 JS 层
     */
    private fun sendEvent(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    /**
     * 将 Epos2Exception 的错误码映射为可读中文说明
     */
    private fun mapEpos2Exception(action: String, ex: Epos2Exception): String {
        val reason = when (ex.errorStatus) {
            Epos2Exception.ERR_PARAM -> "参数错误"
            Epos2Exception.ERR_CONNECT -> "无法连接（地址/端口或设备不可达）"
            Epos2Exception.ERR_TIMEOUT -> "连接超时"
            Epos2Exception.ERR_MEMORY -> "内存不足"
            Epos2Exception.ERR_ILLEGAL -> "非法状态或调用顺序错误"
            Epos2Exception.ERR_PROCESSING -> "设备忙（处理中）"
            Epos2Exception.ERR_NOT_FOUND -> "未找到设备"
            Epos2Exception.ERR_IN_USE -> "设备被占用"
            Epos2Exception.ERR_TYPE_INVALID -> "型号或类型不匹配"
            Epos2Exception.ERR_DISCONNECT -> "已断开连接"
            Epos2Exception.ERR_ALREADY_OPENED -> "资源已打开"
            Epos2Exception.ERR_ALREADY_USED -> "资源已在使用"
            else -> "错误代码: ${ex.errorStatus}"
        }
        return "${action}失败: $reason"
    }

    /**
     * 获取打印机实例
     */
    private fun getPrinter(printerId: String?): Printer? {
        val id = printerId ?: currentPrinterId
        return if (id != null) printers[id] else null
    }

    /**
     * 初始化打印机对象
     * @param series 打印机系列常量（如 Printer.TM_M30, Printer.TM_T88 等）
     * @param lang 语言模型（如 Printer.MODEL_ANK, Printer.MODEL_CHINESE 等）
     * @param printerId 打印机唯一标识
     */
    @ReactMethod
    fun initializePrinter(series: Int, lang: Int, printerId: String?, promise: Promise) {
        try {
            val id = printerId ?: "default"
            
            // 如果已存在，先释放
            printers[id]?.let {
                it.setReceiveEventListener(null)
            }
            
            // 创建新的打印机实例
            val printer = Printer(series, lang, reactApplicationContext)
            printer.setReceiveEventListener(this)
            
            printers[id] = printer
            currentPrinterId = id
            
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("init_error", "初始化打印机失败: ${e.message}", e)
        }
    }

    /**
     * 释放打印机对象
     */
    @ReactMethod
    fun finalizePrinter(printerId: String?, promise: Promise) {
        try {
            val id = printerId ?: currentPrinterId
            if (id != null) {
                printers[id]?.let {
                    it.setReceiveEventListener(null)
                }
                printers.remove(id)
                if (currentPrinterId == id) {
                    currentPrinterId = printers.keys.firstOrNull()
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("finalize_error", e)
        }
    }

    /**
     * 连接打印机
     * @param target 连接地址：
     *   - 蓝牙：MAC 地址 (如 "BT:00:11:22:33:44:55")
     *   - 网络：IP 地址 (如 "TCP:192.168.1.100")
     *   - USB：设备路径 (如 "USB:000000000000000")
     * @param timeout 连接超时（毫秒，默认值由 SDK 决定）
     */
    @ReactMethod
    fun connect(target: String, timeout: Int?, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val actualTimeout = timeout ?: Printer.PARAM_DEFAULT
            printer.connect(target, actualTimeout)
            promise.resolve(null)
        } catch (e: Exception) {
            if (e is Epos2Exception) {
                promise.reject("connect_error", mapEpos2Exception("连接", e), e)
            } else {
                promise.reject("connect_error", "连接失败: ${e.message ?: "未知错误"}", e)
            }
        }
    }

    /**
     * 断开打印机连接
     */
    @ReactMethod
    fun disconnect(printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            // 循环尝试断开，直到成功或遇到非 ERR_PROCESSING 错误
            while (true) {
                try {
                    printer.disconnect()
                    printer.clearCommandBuffer()
                    promise.resolve(null)
                    break
                } catch (e: Exception) {
                    if (e is Epos2Exception && e.errorStatus == Epos2Exception.ERR_PROCESSING) {
                        Thread.sleep(DISCONNECT_INTERVAL)
                    } else {
                        if (e is Epos2Exception) {
                            promise.reject("disconnect_error", mapEpos2Exception("断开连接", e), e)
                        } else {
                            promise.reject("disconnect_error", "断开连接失败: ${e.message ?: "未知错误"}", e)
                        }
                        break
                    }
                }
            }
        } catch (e: Exception) {
            promise.reject("disconnect_error", e)
        }
    }

    /**
     * 清空命令缓冲区
     */
    @ReactMethod
    fun clearCommandBuffer(printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.clearCommandBuffer()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("clear_error", e)
        }
    }

    // ==================== 文本打印相关方法 ====================

    /**
     * 添加文本
     * @param text 要打印的文本内容
     * @param encoding 编码方式（如 "UTF-8"），不传则使用默认编码
     */
    @ReactMethod
    fun addText(text: String, encoding: String?, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val textToAdd = if (encoding != null) {
                String(text.toByteArray(charset(encoding)))
            } else {
                text
            }
            
            printer.addText(textToAdd)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_error", e)
        }
    }

    /**
     * 设置文本语言
     * @param lang 语言常量：
     *   - Printer.LANG_EN (0): 英文
     *   - Printer.LANG_JA (1): 日文
     *   - Printer.LANG_ZH_CN (2): 简体中文
     *   - Printer.LANG_ZH_TW (3): 繁体中文
     *   - Printer.LANG_KO (4): 韩文
     *   - Printer.LANG_TH (5): 泰文
     *   - Printer.LANG_VI (6): 越南文
     *   - Printer.LANG_MULTI (7): 多语言
     */
    @ReactMethod
    fun addTextLang(lang: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextLang(lang)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_lang_error", e)
        }
    }

    /**
     * 设置文本对齐方式
     * @param align 对齐方式：Printer.ALIGN_LEFT(0)/CENTER(1)/RIGHT(2)
     */
    @ReactMethod
    fun addTextAlign(align: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextAlign(align)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_align_error", e)
        }
    }

    /**
     * 设置文本大小
     * @param width 宽度倍数（1-8）
     * @param height 高度倍数（1-8）
     */
    @ReactMethod
    fun addTextSize(width: Int, height: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextSize(width, height)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_size_error", e)
        }
    }

    /**
     * 设置文本样式
     * @param bold 是否粗体：Printer.TRUE(1)/FALSE(0)
     * @param underline 是否下划线：Printer.TRUE(1)/FALSE(0)
     * @param reverse 是否反白：Printer.TRUE(1)/FALSE(0)
     * @param color 颜色：Printer.COLOR_1(1-黑色)/COLOR_2(2-红色)
     */
    @ReactMethod
    fun addTextStyle(bold: Int, underline: Int, reverse: Int, color: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextStyle(bold, underline, reverse, color)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_style_error", e)
        }
    }

    /**
     * 设置文本字体
     * @param font 字体：Printer.FONT_A/B/C/D/E
     */
    @ReactMethod
    fun addTextFont(font: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextFont(font)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_font_error", e)
        }
    }

    /**
     * 设置文本平滑处理
     * @param smooth Printer.TRUE(1)/FALSE(0)
     */
    @ReactMethod
    fun addTextSmooth(smooth: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextSmooth(smooth)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_smooth_error", e)
        }
    }

    /**
     * 设置文本旋转
     * @param rotate Printer.TRUE(1)/FALSE(0)
     */
    @ReactMethod
    fun addTextRotate(rotate: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addTextRotate(rotate)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_text_rotate_error", e)
        }
    }

    // ==================== 图片打印相关方法 ====================

    /**
     * 添加图片（Base64）
     * @param base64 Base64 编码的图片数据
     * @param x X 坐标
     * @param y Y 坐标
     * @param width 宽度（设为 -1 使用原始宽度）
     * @param height 高度（设为 -1 使用原始高度）
     * @param color 颜色模式：Printer.COLOR_1/COLOR_2
     * @param mode 模式：Printer.MODE_MONO/MODE_GRAY16
     * @param halftone 半色调：Printer.HALFTONE_DITHER/HALFTONE_ERROR_DIFFUSION/HALFTONE_THRESHOLD
     * @param brightness 亮度（0.1-10.0，1.0为默认）
     * @param compress 压缩：Printer.COMPRESS_AUTO/COMPRESS_DEFLATE/COMPRESS_NONE
     */
    @ReactMethod
    fun addImageBase64(
        base64: String,
        x: Int?,
        y: Int?,
        width: Int?,
        height: Int?,
        color: Int?,
        mode: Int?,
        halftone: Int?,
        brightness: Double?,
        compress: Int?,
        printerId: String?,
        promise: Promise
    ) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            // 解码 Base64
            val data = if (base64.startsWith("data:")) base64.substringAfter(",") else base64
            val bytes = Base64.decode(data, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

            // 使用默认值
            val actualX = x ?: 0
            val actualY = y ?: 0
            val actualWidth = width ?: bitmap.width
            val actualHeight = height ?: bitmap.height
            val actualColor = color ?: Printer.COLOR_1
            val actualMode = mode ?: Printer.MODE_MONO
            val actualHalftone = halftone ?: Printer.HALFTONE_DITHER
            val actualBrightness = brightness ?: 1.0
            val actualCompress = compress ?: Printer.COMPRESS_AUTO

            printer.addImage(
                bitmap,
                actualX,
                actualY,
                actualWidth,
                actualHeight,
                actualColor,
                actualMode,
                actualHalftone,
                actualBrightness,
                actualCompress
            )
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_image_error", e)
        }
    }

    /**
     * 添加图片（URI）
     */
    @ReactMethod
    fun addImageUri(
        uri: String,
        x: Int?,
        y: Int?,
        width: Int?,
        height: Int?,
        color: Int?,
        mode: Int?,
        halftone: Int?,
        brightness: Double?,
        compress: Int?,
        printerId: String?,
        promise: Promise
    ) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val bitmap = loadBitmapFromUri(uri)

            // 使用默认值
            val actualX = x ?: 0
            val actualY = y ?: 0
            val actualWidth = width ?: bitmap.width
            val actualHeight = height ?: bitmap.height
            val actualColor = color ?: Printer.COLOR_1
            val actualMode = mode ?: Printer.MODE_MONO
            val actualHalftone = halftone ?: Printer.HALFTONE_DITHER
            val actualBrightness = brightness ?: 1.0
            val actualCompress = compress ?: Printer.COMPRESS_AUTO

            printer.addImage(
                bitmap,
                actualX,
                actualY,
                actualWidth,
                actualHeight,
                actualColor,
                actualMode,
                actualHalftone,
                actualBrightness,
                actualCompress
            )
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_image_uri_error", e)
        }
    }

    // ==================== 条形码/二维码相关方法 ====================

    /**
     * 添加条形码
     * @param data 条码数据
     * @param type 条码类型：Printer.BARCODE_UPC_A/CODE39/CODE128 等
     * @param hri 人类可读文本位置：Printer.HRI_NONE/ABOVE/BELOW/BOTH
     * @param font 字体：Printer.FONT_A/B/C/D/E
     * @param width 模块宽度（2-6）
     * @param height 高度（1-255）
     */
    @ReactMethod
    fun addBarcode(
        data: String,
        type: Int,
        hri: Int?,
        font: Int?,
        width: Int?,
        height: Int?,
        printerId: String?,
        promise: Promise
    ) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val actualHri = hri ?: Printer.HRI_BELOW
            val actualFont = font ?: Printer.FONT_A
            val actualWidth = width ?: 3
            val actualHeight = height ?: 162

            printer.addBarcode(data, type, actualHri, actualFont, actualWidth, actualHeight)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_barcode_error", e)
        }
    }

    /**
     * 添加二维码
     * @param data 二维码数据
     * @param type 类型：Printer.SYMBOL_QRCODE_MODEL_1/MODEL_2
     * @param level 纠错级别：Printer.LEVEL_L/M/Q/H
     * @param width 模块宽度（3-16）
     * @param height 模块高度（3-16，通常与宽度相同）
     * @param size 整体大小（3-16，优先级高于 width/height）
     */
    @ReactMethod
    fun addSymbol(
        data: String,
        type: Int?,
        level: Int?,
        width: Int?,
        height: Int?,
        size: Int?,
        printerId: String?,
        promise: Promise
    ) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val actualType = type ?: Printer.SYMBOL_QRCODE_MODEL_2
            val actualLevel = level ?: Printer.LEVEL_M
            val actualWidth = width ?: 8
            val actualHeight = height ?: 0
            val actualSize = size ?: 0

            printer.addSymbol(data, actualType, actualLevel, actualWidth, actualHeight, actualSize)
            promise.resolve(null)
        } catch (e: Exception) {
            if (e is Epos2Exception) {
                promise.reject("add_symbol_error", mapEpos2Exception("添加二维码", e), e)
            } else {
                promise.reject("add_symbol_error", "添加二维码失败: ${e.message ?: "未知错误"}", e)
            }
        }
    }

    // ==================== 走纸/切纸相关方法 ====================

    /**
     * 走纸
     * @param lines 走纸行数
     */
    @ReactMethod
    fun addFeedLine(lines: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addFeedLine(lines)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_feed_error", e)
        }
    }

    /**
     * 切纸
     * @param type 切纸类型：Printer.CUT_NO_FEED/CUT_FEED/CUT_RESERVE
     */
    @ReactMethod
    fun addCut(type: Int, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }
            printer.addCut(type)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_cut_error", e)
        }
    }

    // ==================== 钱箱控制 ====================

    /**
    * 打开钱箱
    * @param drawer 钱箱引脚：Printer.PARAM_DEFAULT（使用默认引脚）
    * @param pulse 脉冲时长：Printer.PARAM_DEFAULT（使用默认时长）
    * 
    * 注意：Epson ePOS2 SDK 的 addPulse 方法使用 PARAM_DEFAULT 作为参数
    * 不同于某些其他 SDK 的 DRAWER_1/DRAWER_2, PULSE_100 等常量
    */
    @ReactMethod
    fun addPulse(drawer: Int?, pulse: Int?, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            // Epson SDK 使用 PARAM_DEFAULT，不是 DRAWER_1/DRAWER_2
            val actualDrawer = drawer ?: Printer.PARAM_DEFAULT
            val actualPulse = pulse ?: Printer.PARAM_DEFAULT

            printer.addPulse(actualDrawer, actualPulse)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("add_pulse_error", e)
        }
    }

    // ==================== 发送数据/执行打印 ====================

    /**
     * 发送打印数据
     * @param timeout 超时时间（毫秒），默认值由 SDK 决定
     */
    @ReactMethod
    fun sendData(timeout: Int?, printerId: String?, promise: Promise) {
        try {
            val printer = getPrinter(printerId)
            if (printer == null) {
                promise.reject("no_printer", "打印机未初始化: $printerId")
                return
            }

            val actualTimeout = timeout ?: Printer.PARAM_DEFAULT
            printer.sendData(actualTimeout)
            promise.resolve(null)
        } catch (e: Exception) {
            if (e is Epos2Exception) {
                promise.reject("send_data_error", mapEpos2Exception("发送数据", e), e)
            } else {
                promise.reject("send_data_error", "发送数据失败: ${e.message ?: "未知错误"}", e)
            }
        }
    }

    // ==================== 辅助工具方法 ====================

    /**
     * 从 URI 加载位图
     */
    private fun loadBitmapFromUri(uriString: String): Bitmap {
        val uri = Uri.parse(uriString)
        val stream = reactApplicationContext.contentResolver.openInputStream(uri)
        return BitmapFactory.decodeStream(stream)
    }

    /**
     * 获取打印机系列常量映射（供 JS 使用）- 完整版本，与Demo对应
     */
    @ReactMethod
    fun getPrinterSeries(promise: Promise) {
        try {
            val map = Arguments.createMap()
            
            // TM-M 系列（移动打印机）
            map.putInt("TM_M10", Printer.TM_M10)
            map.putInt("TM_M30", Printer.TM_M30)
            map.putInt("TM_M30II", Printer.TM_M30II)
            map.putInt("TM_M30III", Printer.TM_M30III)
            map.putInt("TM_M50", Printer.TM_M50)
            map.putInt("TM_M50II", Printer.TM_M50II)
            map.putInt("TM_M55", Printer.TM_M55)
            
            // TM-P 系列（便携打印机）
            map.putInt("TM_P20", Printer.TM_P20)
            map.putInt("TM_P20II", Printer.TM_P20II)
            map.putInt("TM_P60", Printer.TM_P60)
            map.putInt("TM_P60II", Printer.TM_P60II)
            map.putInt("TM_P80", Printer.TM_P80)
            map.putInt("TM_P80II", Printer.TM_P80II)
            
            // TM-T 系列（热敏打印机）
            map.putInt("TM_T20", Printer.TM_T20)
            map.putInt("TM_T60", Printer.TM_T60)
            map.putInt("TM_T70", Printer.TM_T70)
            map.putInt("TM_T81", Printer.TM_T81)
            map.putInt("TM_T82", Printer.TM_T82)
            map.putInt("TM_T83", Printer.TM_T83)
            map.putInt("TM_T83III", Printer.TM_T83III)
            map.putInt("TM_T88", Printer.TM_T88)
            map.putInt("TM_T88VII", Printer.TM_T88VII)
            map.putInt("TM_T90", Printer.TM_T90)
            map.putInt("TM_T90KP", Printer.TM_T90KP)
            map.putInt("TM_T100", Printer.TM_T100)
            
            // TM-U 系列（针式打印机）
            map.putInt("TM_U220", Printer.TM_U220)      // ⭐ 你的 TM-U220B 用这个
            map.putInt("TM_U220II", Printer.TM_U220II)
            map.putInt("TM_U330", Printer.TM_U330)
            
            // TM-L 系列（标签打印机）
            map.putInt("TM_L90", Printer.TM_L90)
            map.putInt("TM_L90LFC", Printer.TM_L90LFC)
            map.putInt("TM_L100", Printer.TM_L100)
            
            // 其他系列
            map.putInt("TM_H6000", Printer.TM_H6000)
            map.putInt("TS_100", Printer.TS_100)
            map.putInt("EU_M30", Printer.EU_M30)
            map.putInt("SB_H50", Printer.SB_H50)
            
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("get_series_error", e)
        }
    }

    /**
     * 获取语言模型常量映射（供 JS 使用）
     */
    @ReactMethod
    fun getLanguageModels(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putInt("MODEL_ANK", Printer.MODEL_ANK)
            map.putInt("MODEL_JAPANESE", Printer.MODEL_JAPANESE)
            map.putInt("MODEL_CHINESE", Printer.MODEL_CHINESE)
            map.putInt("MODEL_TAIWAN", Printer.MODEL_TAIWAN)
            map.putInt("MODEL_KOREAN", Printer.MODEL_KOREAN)
            map.putInt("MODEL_THAI", Printer.MODEL_THAI)
            map.putInt("MODEL_SOUTHASIA", Printer.MODEL_SOUTHASIA)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("get_lang_error", e)
        }
    }

    /**
     * 获取常量映射（供 JS 使用）
     * 这是 React Native 的标准方式，会在模块初始化时自动调用
     */
    override fun getConstants(): MutableMap<String, Any> {
        val constants = mutableMapOf<String, Any>()
        
        // 打印机系列（同步暴露，避免JS侧硬编码数值）- 与Demo完全对应
        val series = mutableMapOf<String, Int>()
        
        // TM-M 系列（移动打印机）
        series["TM_M10"] = Printer.TM_M10
        series["TM_M30"] = Printer.TM_M30
        series["TM_M30II"] = Printer.TM_M30II
        series["TM_M30III"] = Printer.TM_M30III
        series["TM_M50"] = Printer.TM_M50
        series["TM_M50II"] = Printer.TM_M50II
        series["TM_M55"] = Printer.TM_M55
        
        // TM-P 系列（便携打印机）
        series["TM_P20"] = Printer.TM_P20
        series["TM_P20II"] = Printer.TM_P20II
        series["TM_P60"] = Printer.TM_P60
        series["TM_P60II"] = Printer.TM_P60II
        series["TM_P80"] = Printer.TM_P80
        series["TM_P80II"] = Printer.TM_P80II
        
        // TM-T 系列（热敏打印机）
        series["TM_T20"] = Printer.TM_T20
        series["TM_T60"] = Printer.TM_T60
        series["TM_T70"] = Printer.TM_T70
        series["TM_T81"] = Printer.TM_T81
        series["TM_T82"] = Printer.TM_T82
        series["TM_T83"] = Printer.TM_T83
        series["TM_T83III"] = Printer.TM_T83III
        series["TM_T88"] = Printer.TM_T88
        series["TM_T88VII"] = Printer.TM_T88VII
        series["TM_T90"] = Printer.TM_T90
        series["TM_T90KP"] = Printer.TM_T90KP
        series["TM_T100"] = Printer.TM_T100
        
        // TM-U 系列（针式打印机）
        series["TM_U220"] = Printer.TM_U220      // ⭐ 你的 TM-U220B 用这个
        series["TM_U220II"] = Printer.TM_U220II
        series["TM_U330"] = Printer.TM_U330
        
        // TM-L 系列（标签打印机）
        series["TM_L90"] = Printer.TM_L90
        series["TM_L90LFC"] = Printer.TM_L90LFC
        series["TM_L100"] = Printer.TM_L100
        
        // 其他系列
        series["TM_H6000"] = Printer.TM_H6000
        series["TS_100"] = Printer.TS_100
        series["EU_M30"] = Printer.EU_M30
        series["SB_H50"] = Printer.SB_H50
        
        constants["SERIES"] = series

        // 对齐方式
        val align = mutableMapOf<String, Int>()
        align["LEFT"] = Printer.ALIGN_LEFT
        align["CENTER"] = Printer.ALIGN_CENTER
        align["RIGHT"] = Printer.ALIGN_RIGHT
        constants["ALIGN"] = align
        
        // 字体
        val font = mutableMapOf<String, Int>()
        font["A"] = Printer.FONT_A
        font["B"] = Printer.FONT_B
        font["C"] = Printer.FONT_C
        font["D"] = Printer.FONT_D
        font["E"] = Printer.FONT_E
        constants["FONT"] = font
        
        // 布尔值
        constants["TRUE"] = Printer.TRUE
        constants["FALSE"] = Printer.FALSE
        
        // 颜色
        val color = mutableMapOf<String, Int>()
        color["COLOR_1"] = Printer.COLOR_1
        color["COLOR_2"] = Printer.COLOR_2
        constants["COLOR"] = color
        
        // 切纸类型
        val cut = mutableMapOf<String, Int>()
        cut["NO_FEED"] = Printer.CUT_NO_FEED
        cut["FEED"] = Printer.CUT_FEED
        cut["RESERVE"] = Printer.CUT_RESERVE
        constants["CUT"] = cut
        
        // 语言
        val lang = mutableMapOf<String, Int>()
        lang["EN"] = Printer.LANG_EN
        lang["JA"] = Printer.LANG_JA
        lang["ZH_CN"] = Printer.LANG_ZH_CN
        lang["ZH_TW"] = Printer.LANG_ZH_TW
        lang["KO"] = Printer.LANG_KO
        lang["TH"] = Printer.LANG_TH
        lang["VI"] = Printer.LANG_VI
        lang["MULTI"] = Printer.LANG_MULTI
        constants["LANG"] = lang

        // 语言模型（initializePrinter 第二个参数）
        val model = mutableMapOf<String, Int>()
        model["MODEL_ANK"] = Printer.MODEL_ANK
        model["MODEL_JAPANESE"] = Printer.MODEL_JAPANESE
        model["MODEL_CHINESE"] = Printer.MODEL_CHINESE
        model["MODEL_TAIWAN"] = Printer.MODEL_TAIWAN
        model["MODEL_KOREAN"] = Printer.MODEL_KOREAN
        model["MODEL_THAI"] = Printer.MODEL_THAI
        model["MODEL_SOUTHASIA"] = Printer.MODEL_SOUTHASIA
        constants["MODEL"] = model
        
        // 条形码类型
        val barcode = mutableMapOf<String, Int>()
        barcode["UPC_A"] = Printer.BARCODE_UPC_A
        barcode["UPC_E"] = Printer.BARCODE_UPC_E
        barcode["EAN13"] = Printer.BARCODE_EAN13
        barcode["EAN8"] = Printer.BARCODE_EAN8
        barcode["CODE39"] = Printer.BARCODE_CODE39
        barcode["ITF"] = Printer.BARCODE_ITF
        barcode["CODABAR"] = Printer.BARCODE_CODABAR
        barcode["CODE93"] = Printer.BARCODE_CODE93
        barcode["CODE128"] = Printer.BARCODE_CODE128
        constants["BARCODE"] = barcode
        
        // HRI（人类可读文本）位置
        val hri = mutableMapOf<String, Int>()
        hri["NONE"] = Printer.HRI_NONE
        hri["ABOVE"] = Printer.HRI_ABOVE
        hri["BELOW"] = Printer.HRI_BELOW
        hri["BOTH"] = Printer.HRI_BOTH
        constants["HRI"] = hri
        
        // 二维码
        val symbol = mutableMapOf<String, Int>()
        symbol["QRCODE_MODEL_1"] = Printer.SYMBOL_QRCODE_MODEL_1
        symbol["QRCODE_MODEL_2"] = Printer.SYMBOL_QRCODE_MODEL_2
        constants["SYMBOL"] = symbol
        
        // 纠错级别
        val level = mutableMapOf<String, Int>()
        level["L"] = Printer.LEVEL_L
        level["M"] = Printer.LEVEL_M
        level["Q"] = Printer.LEVEL_Q
        level["H"] = Printer.LEVEL_H
        constants["LEVEL"] = level
        
        // 图片模式
        val mode = mutableMapOf<String, Int>()
        mode["MONO"] = Printer.MODE_MONO
        mode["GRAY16"] = Printer.MODE_GRAY16
        constants["MODE"] = mode
        
        // 半色调
        val halftone = mutableMapOf<String, Int>()
        halftone["DITHER"] = Printer.HALFTONE_DITHER
        halftone["ERROR_DIFFUSION"] = Printer.HALFTONE_ERROR_DIFFUSION
        halftone["THRESHOLD"] = Printer.HALFTONE_THRESHOLD
        constants["HALFTONE"] = halftone
        
        // 压缩
        val compress = mutableMapOf<String, Int>()
        compress["AUTO"] = Printer.COMPRESS_AUTO
        compress["DEFLATE"] = Printer.COMPRESS_DEFLATE
        compress["NONE"] = Printer.COMPRESS_NONE
        constants["COMPRESS"] = compress
        
        // Epson SDK 统一使用 PARAM_DEFAULT
        constants["PARAM_DEFAULT"] = Printer.PARAM_DEFAULT
        
        return constants
    }

    // ==================== 打印状态回调 ====================

    /**
     * ReceiveListener 接口实现：打印完成回调
     */
    override fun onPtrReceive(
        printerObj: Printer,
        code: Int,
        status: PrinterStatusInfo?,
        printJobId: String?
    ) {
        val map = Arguments.createMap()
        map.putInt("code", code)
        map.putString("printJobId", printJobId)
        
        // 状态信息
        if (status != null) {
            val statusMap = Arguments.createMap()
            statusMap.putInt("online", status.online)
            statusMap.putInt("connection", status.connection)
            statusMap.putInt("coverOpen", status.coverOpen)
            statusMap.putInt("paper", status.paper)
            statusMap.putInt("paperFeed", status.paperFeed)
            statusMap.putInt("panelSwitch", status.panelSwitch)
            statusMap.putInt("drawer", status.drawer)
            statusMap.putInt("errorStatus", status.errorStatus)
            statusMap.putInt("autoRecoverError", status.autoRecoverError)
            statusMap.putInt("batteryLevel", status.batteryLevel)
            statusMap.putInt("removalWaiting", status.removalWaiting)
            statusMap.putInt("paperTakenSensor", status.paperTakenSensor)
            map.putMap("status", statusMap)
            
            // 生成错误消息
            val errorMsg = makeErrorMessage(status)
            map.putString("message", errorMsg)
        } else {
            map.putString("message", if (code == 0) "打印成功" else "打印失败")
        }
        
        // 找到对应的打印机 ID
        var foundPrinterId: String? = null
        for ((id, printer) in printers) {
            if (printer == printerObj) {
                foundPrinterId = id
                break
            }
        }
        map.putString("printerId", foundPrinterId)
        
        sendEvent("EpsonPrinterStatus", map)
    }

    /**
     * 生成错误消息
     */
    private fun makeErrorMessage(status: PrinterStatusInfo): String {
        val msg = StringBuilder()
        
        if (status.online == Printer.FALSE) {
            msg.append("打印机离线; ")
        }
        if (status.connection == Printer.FALSE) {
            msg.append("无响应; ")
        }
        if (status.coverOpen == Printer.TRUE) {
            msg.append("打印机盖打开; ")
        }
        if (status.paper == Printer.PAPER_EMPTY) {
            msg.append("缺纸; ")
        }
        if (status.paper == Printer.PAPER_NEAR_END) {
            msg.append("纸张即将用尽; ")
        }
        if (status.paperFeed == Printer.TRUE || status.panelSwitch == Printer.SWITCH_ON) {
            msg.append("进纸错误; ")
        }
        if (status.errorStatus == Printer.MECHANICAL_ERR || status.errorStatus == Printer.AUTOCUTTER_ERR) {
            msg.append("切刀错误，需要恢复; ")
        }
        if (status.errorStatus == Printer.UNRECOVER_ERR) {
            msg.append("不可恢复错误; ")
        }
        if (status.errorStatus == Printer.AUTORECOVER_ERR) {
            when (status.autoRecoverError) {
                Printer.HEAD_OVERHEAT -> msg.append("打印头过热; ")
                Printer.MOTOR_OVERHEAT -> msg.append("马达过热; ")
                Printer.BATTERY_OVERHEAT -> msg.append("电池过热; ")
                Printer.WRONG_PAPER -> msg.append("纸张类型错误; ")
            }
        }
        if (status.batteryLevel == Printer.BATTERY_LEVEL_0) {
            msg.append("电池电量耗尽; ")
        }
        if (status.removalWaiting == Printer.REMOVAL_WAIT_PAPER) {
            msg.append("等待取纸; ")
        }
        
        return if (msg.isEmpty()) "正常" else msg.toString()
    }
}





