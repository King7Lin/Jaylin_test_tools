package com.reactnativexprinter

import android.app.Application
import android.graphics.Bitmap
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import net.posprinter.*
import net.posprinter.esc.PosUdpNet
import net.posprinter.model.PTable
import java.nio.charset.Charset

/**
 * React Native 原生打印模块（Android）。
 *
 * 封装芯烨 SDK（AAR：printer-lib-3.4.5.aar）的主要能力：
 * - 连接管理：USB/网口/蓝牙/串口
 * - 设备枚举：USB 列表、串口列表、已配对蓝牙列表、局域网 UDP 扫描
 * - ESC/POS 打印：文本、条码、二维码、图片（含压缩）、表格、走纸与切纸、打开钱箱、状态查询
 * - TSPL/CPCL/ZPL：提供示例 API（可按需扩展更多命令）
 *
 * 事件：
 * - XPrinterConnect：连接状态变化（code/message）
 * - XPrinterNetDevice：局域网发现打印机（mac/ip）
 */
class XPrinterModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    // 支持多设备连接：使用 Map 存储多个连接
    private val connections = mutableMapOf<String, IDeviceConnection>()
    // 当前活跃的打印机 ID（用于兼容旧的不传 printerId 的调用）
    private var currentPrinterId: String? = null
    private val posUdpNet by lazy { PosUdpNet() }

    override fun getName(): String = "XPrinterModule"

    /**
     * 发送事件到 JS 层。
     * @param event 事件名
     * @param params 事件参数
     */
    private fun sendEvent(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    /**
     * 获取连接对象。
     * @param printerId 打印机 ID，如果为空则使用当前活跃的打印机
     */
    private fun getConnection(printerId: String?): IDeviceConnection? {
        val id = printerId ?: currentPrinterId
        return if (id != null) connections[id] else null
    }

    /** 初始化 SDK（必须先调用一次）。 */
    @ReactMethod
    fun init(promise: Promise) {
        try {
            // 获取Application实例，兼容React Native新架构（Bridgeless模式）
            val application = reactApplicationContext.applicationContext as? Application
                ?: reactApplicationContext.currentActivity?.application
                ?: throw IllegalStateException("无法获取Application实例")
            
            POSConnect.init(application)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("init_error", e)
        }
    }

    /**
     * 建立连接。
     * @param type 连接类型：usb|net|bt|serial
     * @param address 地址：
     *  - usb：形如 "USB:VendorId,ProductId,DevicePath"（由 SDK 列出）
     *  - net：IP 地址字符串
     *  - bt：蓝牙 MAC 地址
     *  - serial：形如 "COMx,BaudRate" 或 "ttyS*,BaudRate"
     * @param printerId 打印机唯一标识，用于多设备管理
     */
    @ReactMethod
    fun connect(type: String, address: String, printerId: String?, promise: Promise) {
        try {
            // 生成打印机 ID：优先使用传入的 printerId，否则使用 type_address
            val id = printerId ?: "${type}_${address}"
            
            // 如果已存在连接，先关闭
            connections[id]?.close()
            
            val deviceType = when (type) {
                "usb" -> POSConnect.DEVICE_TYPE_USB
                "net" -> POSConnect.DEVICE_TYPE_ETHERNET
                "bt" -> POSConnect.DEVICE_TYPE_BLUETOOTH
                "serial" -> POSConnect.DEVICE_TYPE_SERIAL
                else -> POSConnect.DEVICE_TYPE_BLUETOOTH
            }
            
            val listener = IConnectListener { code, _, msg ->
                val map = Arguments.createMap()
                map.putInt("code", code)
                map.putString("message", msg)
                map.putString("printerId", id)
                sendEvent("XPrinterConnect", map)
            }
            
            val newConnection = POSConnect.createDevice(deviceType)
            newConnection.connect(address, listener)
            
            // 保存连接到 Map
            connections[id] = newConnection
            currentPrinterId = id
            
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("connect_error", e)
        }
    }

    /** 主动断开连接。 */
    @ReactMethod
    fun disconnect(printerId: String?, promise: Promise) {
        try {
            if (printerId != null) {
                // 断开指定打印机
                connections[printerId]?.close()
                connections.remove(printerId)
                if (currentPrinterId == printerId) {
                    currentPrinterId = connections.keys.firstOrNull()
                }
            } else {
                // 断开所有连接
                connections.values.forEach { it.close() }
                connections.clear()
                currentPrinterId = null
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("disconnect_error", e)
        }
    }

    // ESC/POS
    /** 打印富文本（对齐/样式/尺寸）。 */
    @ReactMethod
    fun escPrintText(text: String, alignment: Int, fontStyle: Int, size: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val printer = POSPrinter(conn)
            printer.printText(text, alignment, fontStyle, size)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_text_error", e)
        }
    }
    /** 初始化打印机（ESC @）。 */
    @ReactMethod
    fun escInitializePrinter(printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            POSPrinter(conn).initializePrinter()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_init_error", e)
        }
    }
    /** 打印纯字符串（原样输出）。 */
    @ReactMethod
    fun escPrintString(text: String, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            POSPrinter(conn).printString(text)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_string_error", e)
        }
    }

    /** 打印一维条码。 */
    @ReactMethod
    fun escPrintBarcode(content: String, type: Int, options: ReadableMap?, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val width = options.getIntOrDefault("width", 3).coerceIn(1, 6)
            val height = options.getIntOrDefault("height", 162).coerceIn(1, 255)
            val alignment = options.getIntOrDefault("align", POSConst.ALIGNMENT_CENTER)
            val hri = options.getIntOrDefault("hri", POSConst.HRI_TEXT_BELOW)

            POSPrinter(conn).printBarCode(content, type, width, height, alignment, hri)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_barcode_error", e)
        }
    }

    private fun ReadableMap?.getIntOrDefault(key: String, defaultValue: Int): Int {
        if (this == null || !this.hasKey(key) || this.isNull(key)) return defaultValue
        return when (this.getType(key)) {
            ReadableType.Number -> this.getInt(key)
            ReadableType.String -> this.getString(key)?.toIntOrNull() ?: defaultValue
            else -> defaultValue
        }
    }

    private fun ReadableMap?.getQRCodeLevelOrDefault(key: String, defaultValue: Int): Int {
        if (this == null || !this.hasKey(key) || this.isNull(key)) return defaultValue
        return when (this.getType(key)) {
            ReadableType.Number -> this.getInt(key)
            ReadableType.String -> this.getString(key)?.toIntOrNull() ?: defaultValue
            else -> defaultValue
        }
    }

    /** 打印二维码。 */
    /** POSConst.QRCODE_EC_LEVEL_L = 48 → 7% 纠错（L）
    * POSConst.QRCODE_EC_LEVEL_M = 49 → 15% 纠错（M，默认）
    * POSConst.QRCODE_EC_LEVEL_Q = 50 → 25% 纠错（Q）
    * POSConst.QRCODE_EC_LEVEL_H = 51 → 30% 纠错（H）
    */
    @ReactMethod
    fun escPrintQRCode(content: String, options: ReadableMap?, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val printer = POSPrinter(conn).initializePrinter()
            val size = options.getIntOrDefault("size", 8).coerceIn(1, 16)
            val ecLevel = options.getQRCodeLevelOrDefault("ec", POSConst.QRCODE_EC_LEVEL_M)
            val margin = options.getIntOrDefault("margin", 0).coerceIn(0, 7)
            val alignment = options.getIntOrDefault("align", POSConst.ALIGNMENT_LEFT)

            printer.printQRCode(content, size, ecLevel, alignment).feedLine()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_qrcode_error", e)
        }
    }

    /** 打印位图（自动按宽度缩放）。 */
    @ReactMethod
    fun escPrintBitmap(uri: String, alignment: Int, maxWidth: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val bitmap = loadBitmapFromUri(uri)
            POSPrinter(conn).printBitmap(bitmap, alignment, maxWidth).feedLine()
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("esc_bitmap_error", e) }
    }

  /** 直接打印 Base64 图片（便于 JS 侧 Mixed.image 使用）。 */
  @ReactMethod
  fun escPrintBitmapBase64(base64: String, alignment: Int, maxWidth: Int, printerId: String?, promise: Promise) {
      try {
          val conn = getConnection(printerId)
          if (conn == null) {
              promise.reject("no_connection", "打印机未连接: $printerId")
              return
          }
          val data = if (base64.startsWith("data:")) base64.substringAfter(",") else base64
          val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
          val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
          POSPrinter(conn).printBitmap(bmp, alignment, maxWidth).feedLine()
          promise.resolve(null)
      } catch (e: Exception) { promise.reject("esc_bitmap_b64_error", e) }
  }

    /** 打印位图（压缩算法，速度更快）。 */
    @ReactMethod
    fun escPrintBitmapCompress(uri: String, alignment: Int, maxWidth: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val bitmap = loadBitmapFromUri(uri)
            POSPrinter(conn).printBitmapCompress(bitmap, alignment, maxWidth).feedLine(2)
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("esc_bitmap_compress_error", e) }
    }

    /** 走纸并半切。 */
    @ReactMethod
    fun escFeedAndCut(feedLines: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            POSPrinter(conn).feedLine(feedLines).cutHalfAndFeed(1)
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("esc_cut_error", e) }
    }

    /** 打开钱箱（PIN2/PIN5）。 */
    @ReactMethod
    fun escOpenCashDrawer(pin: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val actualPin = when (pin) {
                POSConst.PIN_TWO, POSConst.PIN_FIVE -> pin
                else -> POSConst.PIN_TWO
            }
            POSPrinter(conn).openCashBox(actualPin)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_cashbox_error", e)
        }
    }

    @ReactMethod
    fun setPrintArea(){
        
    }

    /** 按列打印表格。 */
    @ReactMethod
    fun escPrintTable(headers: ReadableArray, widths: ReadableArray, aligns: ReadableArray, rows: ReadableArray, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            val heads = Array(headers.size()) { i -> headers.getString(i) }
            val w = Array(widths.size()) { i -> widths.getInt(i) }
            val a = Array(aligns.size()) { i -> aligns.getInt(i) }
            var table = PTable(heads, w, a)
            for (i in 0 until rows.size()) {
                val r = rows.getArray(i)!!
                table = table.addRow(r.getString(0), arrayOf(r.getString(1), r.getString(2), r.getString(3)))
            }
            POSPrinter(conn).initializePrinter().printTable(table)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("esc_table_error", e)
        }
    }

    /** 打印机状态查询（旧方法，保留兼容）。 */
    @ReactMethod
    fun escPrinterCheck(type: Int, timeoutMs: Int, printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                promise.reject("no_connection", "打印机未连接: $printerId")
                return
            }
            POSPrinter(conn).printerCheck(type, timeoutMs) { bytes ->
                val map = Arguments.createMap()
                if (bytes == null) {
                    map.putNull("data")
                } else {
                    map.putString("data", bytes.joinToString(","))
                }
                promise.resolve(map)
            }
        } catch (e: Exception) {
            promise.reject("esc_check_error", e)
        }
    }

    /**
     * 打印机状态查询 II（推荐）。
     * 返回整数状态码，包含位标志：
     * - 位 0 (1): 打印中
     * - 位 1 (2): 打印机开盖
     * - 位 2 (4): 打印机缺纸
     * - 位 3 (8): 纸将尽
     * - 位 4 (16): 钱箱打开
     * - 位 5 (32): 其他错误
     * - 位 6 (64): 切刀错误
     * - 位 7 (128): 打印头过热
     * 
     * 特殊值：
     * - -3: 连接已断开
     * - -4: 等待超时或其他错误
     */
    @ReactMethod
    fun printerStatusII(printerId: String?, promise: Promise) {
        try {
            val conn = getConnection(printerId)
            if (conn == null) {
                // 连接已断开
                promise.resolve(-3)
                return
            }
            
            POSPrinter(conn).printerStatusII { status ->
                // status 是整数，包含状态位标志
                promise.resolve(status)
            }
        } catch (e: Exception) {
            // 超时或其他错误
            promise.resolve(-4)
        }
    }


    // Utility: enumerate devices
    /** 获取 USB 打印机设备列表（用于 USB 连接选择）。 */
    @ReactMethod
    fun getUsbDevices(promise: Promise) {
        try {
            android.util.Log.d("XPrinterModule", "开始获取USB设备列表...")
            
            // 使用applicationContext而不是直接使用reactApplicationContext
            val list = POSConnect.getUsbDevices(reactApplicationContext.applicationContext)
            val arr = Arguments.createArray()
            list.forEach { 
                arr.pushString(it)
                android.util.Log.d("XPrinterModule", "SDK返回USB设备: $it")
            }
            
            android.util.Log.d("XPrinterModule", "SDK返回 ${list.size} 个USB设备")
            promise.resolve(arr)
        } catch (e: Exception) { 
            android.util.Log.e("XPrinterModule", "getUsbDevices失败: ${e.message}", e)
            promise.reject("usb_list_error", e) 
        }
    }
    
    /** 直接从 Android UsbManager 获取所有 USB 设备（不依赖SDK） */
    @ReactMethod
    fun getAllUsbDevicesRaw(promise: Promise) {
        try {
            android.util.Log.d("XPrinterModule", "开始直接获取所有USB设备...")
            
            val usbManager = reactApplicationContext.getSystemService(android.content.Context.USB_SERVICE) as? android.hardware.usb.UsbManager
            if (usbManager == null) {
                android.util.Log.e("XPrinterModule", "无法获取UsbManager")
                promise.reject("no_usb_manager", "无法获取UsbManager")
                return
            }
            
            val devices = usbManager.deviceList
            val arr = Arguments.createArray()
            
            android.util.Log.d("XPrinterModule", "发现 ${devices.size} 个USB设备")
            
            devices.values.forEach { device ->
                try {
                    val deviceMap = Arguments.createMap()
                    deviceMap.putInt("vendorId", device.vendorId)
                    deviceMap.putInt("productId", device.productId)
                    deviceMap.putInt("deviceClass", device.deviceClass)
                    deviceMap.putInt("deviceSubclass", device.deviceSubclass)
                    deviceMap.putInt("interfaceCount", device.interfaceCount)
                    
                    // 获取设备名称（Android 5.0+）
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                        deviceMap.putString("productName", device.productName ?: "Unknown")
                        deviceMap.putString("manufacturerName", device.manufacturerName ?: "Unknown")
                    } else {
                        deviceMap.putString("productName", "USB Device")
                        deviceMap.putString("manufacturerName", "Unknown")
                    }
                    
                    deviceMap.putString("id", "usb:${device.vendorId}:${device.productId}")
                    deviceMap.putString("address", "USB:${device.vendorId},${device.productId},${device.deviceName}")
                    deviceMap.putBoolean("hasPermission", usbManager.hasPermission(device))
                    
                    android.util.Log.d("XPrinterModule", "USB设备: VID=0x${String.format("%04X", device.vendorId)}, PID=0x${String.format("%04X", device.productId)}, Class=${device.deviceClass}, HasPermission=${usbManager.hasPermission(device)}")
                    
                    arr.pushMap(deviceMap)
                } catch (e: Exception) {
                    android.util.Log.e("XPrinterModule", "处理USB设备失败: ${e.message}")
                }
            }
            
            promise.resolve(arr)
        } catch (e: Exception) { 
            android.util.Log.e("XPrinterModule", "getAllUsbDevicesRaw失败: ${e.message}", e)
            promise.reject("usb_raw_list_error", e) 
        }
    }
    
    /** 请求所有USB设备的权限 */
    @ReactMethod
    fun requestAllUsbPermissions(promise: Promise) {
        try {
            val usbManager = reactApplicationContext.getSystemService(android.content.Context.USB_SERVICE) as? android.hardware.usb.UsbManager
            if (usbManager == null) {
                promise.reject("no_usb_manager", "无法获取UsbManager")
                return
            }
            
            val devices = usbManager.deviceList.values
            var requestedCount = 0
            var alreadyGrantedCount = 0
            
            devices.forEach { device ->
                if (!usbManager.hasPermission(device)) {
                    // 为每个设备请求权限
                    val permissionIntent = android.content.Intent("com.reactnativexprinter.USB_PERMISSION")
                    val pendingIntent = android.app.PendingIntent.getBroadcast(
                        reactApplicationContext,
                        device.deviceId,
                        permissionIntent,
                        android.app.PendingIntent.FLAG_IMMUTABLE
                    )
                    usbManager.requestPermission(device, pendingIntent)
                    requestedCount++
                    android.util.Log.d("XPrinterModule", "请求USB权限: VID=${device.vendorId}, PID=${device.productId}")
                } else {
                    alreadyGrantedCount++
                    android.util.Log.d("XPrinterModule", "USB已有权限: VID=${device.vendorId}, PID=${device.productId}")
                }
            }
            
            val resultMap = Arguments.createMap()
            resultMap.putInt("totalDevices", devices.size)
            resultMap.putInt("requestedCount", requestedCount)
            resultMap.putInt("alreadyGrantedCount", alreadyGrantedCount)
            
            android.util.Log.d("XPrinterModule", "USB权限请求完成: 总共${devices.size}个, 请求${requestedCount}个, 已授权${alreadyGrantedCount}个")
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            android.util.Log.e("XPrinterModule", "requestAllUsbPermissions失败: ${e.message}", e)
            promise.reject("usb_permission_error", e)
        }
    }

    /** 获取串口列表（用于串口连接）。 */
    @ReactMethod
    fun getSerialPorts(promise: Promise) {
        try {
            val list = POSConnect.getSerialPort()
            val arr = Arguments.createArray()
            list.forEach { arr.pushString(it) }
            promise.resolve(arr)
        } catch (e: Exception) { promise.reject("serial_list_error", e) }
    }
    @ReactMethod
    fun probeSerialPorts(baudRate: Int, timeoutMs: Int, promise: Promise) {
    try {
        val ports = POSConnect.getSerialPort()
        val result = Arguments.createArray()
        for (port in ports) {
        var device: IDeviceConnection? = null
        try {
            device = POSConnect.createDevice(POSConnect.DEVICE_TYPE_SERIAL)
            var ok = false
            val latch = java.util.concurrent.CountDownLatch(1)
            val listener = IConnectListener { code, _, _ ->
            ok = (code == 0)
            latch.countDown()
            }
            device.connect("$port,$baudRate", listener)
            latch.await(timeoutMs.toLong(), java.util.concurrent.TimeUnit.MILLISECONDS)
            if (ok) result.pushString(port)
        } catch (_: Exception) {
        } finally {
            try { device?.close() } catch (_: Exception) {}
        }
        }
        promise.resolve(result)
    } catch (e: Exception) {
        promise.reject("serial_probe_error", e)
    }
    }

    /** 获取已配对的蓝牙设备列表。 */
    @ReactMethod
    fun listBondedBluetooth(promise: Promise) {
        try {
            val adapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            val arr = Arguments.createArray()
            adapter?.bondedDevices?.forEach { d ->
                val m = Arguments.createMap()
                m.putString("name", d.name ?: "")
                m.putString("mac", d.address)
                arr.pushMap(m)
            }
            promise.resolve(arr)
        } catch (e: Exception) { promise.reject("bt_list_error", e) }
    }

    /** 局域网 UDP 扫描，结果通过事件 XPrinterNetDevice 回传。 */
    @ReactMethod
    fun scanNetDevices(promise: Promise) {
        try {
            posUdpNet.searchNetDevice { dev ->
                val map = Arguments.createMap()
                map.putString("mac", dev.macStr)
                map.putString("ip", dev.ipStr)
                sendEvent("XPrinterNetDevice", map)
            }
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("net_scan_error", e) }
    }

    /** 从 URI 加载位图。支持 content://、file:// 等。 */
    private fun loadBitmapFromUri(uriString: String): Bitmap {
        val uri = Uri.parse(uriString)
        val stream = reactApplicationContext.contentResolver.openInputStream(uri)
        return android.graphics.BitmapFactory.decodeStream(stream)
    }
}


