package com.rnescpos

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.*
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.util.SerialInputOutputManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.InputStream
import java.io.OutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.*
import kotlin.concurrent.thread

/**
 * PrinterModule - React Native ESC/POS打印机原生模块
 * 
 * 功能概述：
 * 本模块是React Native与Android原生代码的桥梁，专门用于控制ESC/POS热敏打印机。
 * 支持多种连接方式，包括网络、蓝牙、USB和串口连接，能够发送各种ESC/POS指令。
 * 
 * 主要功能：
 * 1. 设备发现和连接管理
 *    - 网络打印机：通过TCP Socket连接（默认端口9100）
 *    - 蓝牙打印机：通过RFCOMM协议连接
 *    - USB打印机：通过USB Host模式连接，支持Bulk Transfer
 *    - 串口打印机：通过USB转串口芯片连接
 * 
 * 2. 打印功能
 *    - 发送原始ESC/POS指令
 *    - 打印文本、图片、二维码、条形码
 *    - 支持多种文本样式（加粗、下划线、对齐等）
 *    - 支持多语言代码页切换
 * 
 * 3. 设备管理
 *    - 自动发现已配对设备
 *    - 蓝牙设备扫描
 *    - USB权限申请和管理
 *    - 连接状态监控
 * 
 * 4. 状态查询
 *    - 实时查询打印机状态
 *    - 纸张状态检测
 *    - 错误状态监控
 *    - 支持回包解析
 * 
 * 5. 图片处理
 *    - 直接打印图片（ESC * 指令）
 *    - 上传图片到打印机内存（NV位图）
 *    - 通过ID调用存储的图片
 *    - 删除存储的图片释放内存
 * 
 * 技术实现：
 * - 使用Kotlin编写，兼容Android API 23+
 * - 采用异步线程处理连接和打印操作
 * - 使用BroadcastReceiver处理USB权限和蓝牙发现
 * - 通过DeviceEventEmitter向JS层发送事件
 * - 支持多种图片格式和压缩算法
 * 
 * 注意事项：
 * - 需要相应的Android权限（网络、蓝牙、USB、定位）
 * - 不同品牌打印机可能支持不同的指令集
 * - 图片打印前建议检查打印机状态
 * - 长时间打印建议定期检查连接状态
 */
class PrinterModule(private val ctx: ReactApplicationContext): ReactContextBaseJavaModule(ctx) {
    
    /**
     * 获取模块名称
     * @return 模块名称字符串
     */
    override fun getName(): String = "PrinterModule"
    
    // ==================== 多连接管理相关属性 ====================
    
    /** 打印机连接信息数据类 */
    data class PrinterConnection(
        val id: String,
        val type: String,
        var socket: Socket? = null,
        var btSocket: BluetoothSocket? = null,
        var usbConnection: UsbDeviceConnection? = null,
        var serialPort: UsbSerialPort? = null,
        var serialIoManager: SerialInputOutputManager? = null,
        var output: OutputStream? = null,
        var isConnected: Boolean = false
    )
    
    /** 多打印机连接管理Map：printerId -> PrinterConnection */
    private val printerConnections: MutableMap<String, PrinterConnection> = mutableMapOf()
    
    /** 当前活动的打印机ID（用于向后兼容单连接API） */
    private var activePrinterId: String? = null
    
    // ==================== 向后兼容的单连接属性 ====================
    
    /** 网络连接Socket（TCP连接） - 向后兼容 */
    private var socket: Socket? 
        get() = printerConnections[activePrinterId]?.socket
        set(value) { printerConnections[activePrinterId]?.socket = value }
    
    /** 蓝牙RFCOMM连接Socket - 向后兼容 */
    private var btSocket: BluetoothSocket? 
        get() = printerConnections[activePrinterId]?.btSocket
        set(value) { printerConnections[activePrinterId]?.btSocket = value }
    
    /** 统一的输出流 - 向后兼容 */
    private var output: OutputStream? 
        get() = printerConnections[activePrinterId]?.output
        set(value) { printerConnections[activePrinterId]?.output = value }
    
    /** USB设备连接对象 - 向后兼容 */
    private var usbConnection: UsbDeviceConnection? 
        get() = printerConnections[activePrinterId]?.usbConnection
        set(value) { printerConnections[activePrinterId]?.usbConnection = value }
    
    /** USB串口对象 - 向后兼容 */
    private var serialPort: UsbSerialPort? 
        get() = printerConnections[activePrinterId]?.serialPort
        set(value) { printerConnections[activePrinterId]?.serialPort = value }
    
    /** 串口输入输出管理器 - 向后兼容 */
    private var serialIoManager: SerialInputOutputManager? 
        get() = printerConnections[activePrinterId]?.serialIoManager
        set(value) { printerConnections[activePrinterId]?.serialIoManager = value }
    
    /** 当前连接类型 - 向后兼容 */
    private var currentType: String? 
        get() = printerConnections[activePrinterId]?.type
        set(value) { 
            activePrinterId?.let { id ->
                printerConnections[id]?.let { conn ->
                    printerConnections[id] = conn.copy(type = value ?: "")
                }
            }
        }
    
    // ==================== 蓝牙扫描相关属性 ====================
    
    /** 蓝牙扫描状态标志 */
    private var scanning = false
    
    /** 已发现的蓝牙设备地址集合，用于避免重复发送增量事件 */
    private val discoveredBt = mutableSetOf<String>()
    
    // ==================== USB权限相关属性 ====================
    
    /** USB权限申请的Action字符串 */
    private val usbPermissionAction = "com.rnescpos.USB_PERMISSION"
    
    /** USB权限申请的Promise对象，用于在用户授权后回调 */
    private var usbPermissionPromise: Promise? = null

    /**
     * USB权限广播接收器
     * 监听系统USB权限申请结果，当用户授权或拒绝时回调相应的Promise
     */
    private val usbPermissionReceiver = object: BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // 检查是否是我们的USB权限申请广播
            if (intent?.action == usbPermissionAction) {
                // 获取USB设备和权限授权结果
                val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                
                // 处理权限申请结果
                usbPermissionPromise?.let { promise ->
                    if (granted) {
                        // 权限授权成功，返回设备ID格式：usb:vendorId:productId
                        val deviceId = device?.let { "usb:${it.vendorId}:${it.productId}" }
                        promise.resolve(deviceId)
                    } else {
                        // 权限被拒绝
                        promise.reject("DENY", "用户拒绝了USB权限申请")
                    }
                }
                
                // 清空Promise引用，避免内存泄漏
                usbPermissionPromise = null
                
                // 注销广播接收器，忽略可能的异常（可能已经注销）
                try { 
                    ctx.unregisterReceiver(this) 
                } catch (_: Exception) {
                    // 忽略注销异常
                }
            }
        }
    }

    /**
     * 蓝牙设备发现广播接收器
     * 监听蓝牙设备发现事件，当发现新设备时通过事件发送给JS层
     */
    private val btReceiver = object: BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // 检查是否是蓝牙设备发现广播
            if (intent?.action == BluetoothDevice.ACTION_FOUND) {
                // 获取发现的蓝牙设备
                val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                device?.let { bluetoothDevice ->
                    // 避免重复发送相同设备的事件
                    if (discoveredBt.add(bluetoothDevice.address)) {
                        // 创建设备信息数组
                        val delta = Arguments.createArray().apply {
                            val deviceMap = Arguments.createMap()
                            deviceMap.putString("id", bluetoothDevice.address)        // 设备ID（MAC地址）
                            deviceMap.putString("name", bluetoothDevice.name)        // 设备名称
                            deviceMap.putString("type", "bluetooth")                // 设备类型
                            deviceMap.putString("address", bluetoothDevice.address) // 设备地址
                            pushMap(deviceMap)
                        }
                        
                        // 创建增量事件数据
                        val eventData = Arguments.createMap()
                        eventData.putArray("delta", delta)           // 新增的设备列表
                        eventData.putString("kind", "incremental")  // 事件类型：增量更新
                        
                        // 通过DeviceEventEmitter发送增量设备事件给JS层
                        sendEvent("device", eventData)
                    }
                }
            }
        }
    }

    /**
     * 向JS层发送事件的统一方法
     * 
     * @param type 事件类型：device | state | error | scan
     * @param data 事件数据，支持多种数据类型
     */
    private fun sendEvent(type: String, data: Any?) {
        // 创建统一的事件结构: { type: string, data: {...} }
        val eventMap = Arguments.createMap().apply { 
            putString("type", type) 
        }
        
        // 根据数据类型进行不同的处理
        when (data) {
            is WritableMap -> {
                // 直接使用WritableMap作为数据
                eventMap.putMap("data", data)
            }
            is WritableArray -> {
                // 将WritableArray包装在Map中
                val dataMap = Arguments.createMap()
                dataMap.putArray("list", data)
                eventMap.putMap("data", dataMap)
            }
            is String -> {
                // 将字符串包装在Map中
                val dataMap = Arguments.createMap()
                dataMap.putString("message", data)
                eventMap.putMap("data", dataMap)
            }
            null -> {
                // 空数据，不添加data字段
            }
            else -> {
                // 其他类型转换为字符串
                val dataMap = Arguments.createMap()
                dataMap.putString("json", data.toString())
                eventMap.putMap("data", dataMap)
            }
        }
        
        // 通过DeviceEventEmitter发送到JS层，监听通道为"PrinterEvent"
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("PrinterEvent", eventMap)
    }

    /**
     * 发现可用设备
     * 
     * 功能说明：
     * 扫描并返回所有可用的打印机设备，包括：
     * 1. 已配对的蓝牙设备
     * 2. 已连接的USB设备（所有设备，不使用filter）
     * 
     * @param promise Promise对象，用于返回设备列表
     * @return 设备列表数组，每个设备包含id、name、type、address等字段
     */
    @ReactMethod 
    fun discover(promise: Promise) {
        val deviceList = Arguments.createArray()
        
        try {
            // 1. 扫描已配对的蓝牙设备
            try {
                BluetoothAdapter.getDefaultAdapter()?.bondedDevices?.forEach { bluetoothDevice ->
                    val deviceMap = Arguments.createMap()
                    deviceMap.putString("id", bluetoothDevice.address)        // 设备ID（MAC地址）
                    deviceMap.putString("name", bluetoothDevice.name)        // 设备名称
                    deviceMap.putString("type", "bluetooth")                // 设备类型
                    deviceMap.putString("address", bluetoothDevice.address) // 设备地址
                    deviceList.pushMap(deviceMap)
                }
            } catch (e: Exception) {
                android.util.Log.e("PrinterModule", "蓝牙设备扫描失败: ${e.message}")
            }
            
            // 2. 扫描所有USB设备（不使用filter）
            try {
                val usbManager = ctx.getSystemService(Context.USB_SERVICE) as? UsbManager
                if (usbManager != null) {
                    val devices = usbManager.deviceList
                    android.util.Log.d("PrinterModule", "发现 ${devices.size} 个USB设备")
                    
                    devices.values.forEach { usbDevice ->
                        try {
                            val deviceMap = Arguments.createMap()
                            deviceMap.putString("id", "usb:${usbDevice.vendorId}:${usbDevice.productId}")
                            // 尝试获取设备名称
                            val deviceName = try {
                                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                                    usbDevice.productName ?: "USB Device"
                                } else {
                                    "USB Device"
                                }
                            } catch (e: Exception) {
                                "USB Device"
                            }
                            deviceMap.putString("name", "$deviceName (${String.format("0x%04X:0x%04X", usbDevice.vendorId, usbDevice.productId)})")
                            deviceMap.putString("type", "usb")
                            deviceMap.putInt("vendorId", usbDevice.vendorId)
                            deviceMap.putInt("productId", usbDevice.productId)
                            deviceMap.putString("deviceClass", usbDevice.deviceClass.toString())
                            deviceMap.putBoolean("hasPermission", usbManager.hasPermission(usbDevice))
                            
                            android.util.Log.d("PrinterModule", "USB设备: VID=${usbDevice.vendorId}, PID=${usbDevice.productId}, Name=$deviceName, HasPermission=${usbManager.hasPermission(usbDevice)}")
                            
                            deviceList.pushMap(deviceMap)
                        } catch (e: Exception) {
                            android.util.Log.e("PrinterModule", "处理USB设备失败: ${e.message}")
                        }
                    }
                } else {
                    android.util.Log.e("PrinterModule", "无法获取UsbManager")
                }
            } catch (e: Exception) {
                android.util.Log.e("PrinterModule", "USB设备扫描失败: ${e.message}", e)
            }
            
            // 3. 返回完整设备列表
            promise.resolve(deviceList)
            
            // 4. 发送设备发现完成事件给JS层
            val eventData = Arguments.createMap()
            eventData.putArray("list", deviceList)        // 设备列表
            eventData.putString("kind", "full")          // 事件类型：完整列表
            sendEvent("device", eventData)
        } catch (e: Exception) {
            android.util.Log.e("PrinterModule", "discover失败: ${e.message}", e)
            promise.reject("DISCOVER_ERROR", e)
        }
    }

    @ReactMethod fun startBluetoothScan(promise: Promise) {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: run { promise.reject("NO_ADAPTER","Bluetooth not supported"); return }
        if (scanning) { promise.resolve(true); return }
        discoveredBt.clear()
        val filter = IntentFilter(BluetoothDevice.ACTION_FOUND)
    // 注册蓝牙发现广播，收到 ACTION_FOUND 时会把设备通过 sendEvent 发送给 JS
    ctx.registerReceiver(btReceiver, filter)
        val ok = adapter.startDiscovery()
        scanning = ok
    sendEvent("scan", Arguments.createMap().apply { putString("status", if (ok) "started" else "failed") })
        promise.resolve(ok)
    }

    @ReactMethod fun stopBluetoothScan(promise: Promise) {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (scanning) {
            adapter?.cancelDiscovery(); try { ctx.unregisterReceiver(btReceiver) } catch (_:Exception){}
            scanning=false
        }
    // 停止扫描并通知 JS
    sendEvent("scan", Arguments.createMap().apply { putString("status","stopped") })
    promise.resolve(null)
    }

    /**
     * 请求USB设备权限
     * 
     * @param vendorId 厂商ID
     * @param productId 产品ID  
     * @param promise Promise对象
     */
    @ReactMethod 
    fun requestUsbPermission(vendorId: Int, productId: Int, promise: Promise) {
        try {
            val usbManager = ctx.getSystemService(Context.USB_SERVICE) as? UsbManager
            if (usbManager == null) {
                promise.reject("NO_USB_MANAGER", "无法获取UsbManager")
                return
            }
            
            val device = usbManager.deviceList.values.firstOrNull { 
                it.vendorId == vendorId && it.productId == productId 
            }
            
            if (device == null) { 
                android.util.Log.e("PrinterModule", "USB设备未找到: VID=$vendorId, PID=$productId")
                promise.reject("NOT_FOUND", "Device not found")
                return 
            }
            
            if (usbManager.hasPermission(device)) { 
                android.util.Log.d("PrinterModule", "USB设备已有权限: VID=$vendorId, PID=$productId")
                promise.resolve("usb:${device.vendorId}:${device.productId}")
                return 
            }
            
            if (usbPermissionPromise != null) { 
                promise.reject("BUSY", "Another permission request in progress")
                return 
            }
            
            usbPermissionPromise = promise
            
            android.util.Log.d("PrinterModule", "请求USB设备权限: VID=$vendorId, PID=$productId")
            
            // 注册临时广播以接收用户是否允许 USB 权限
            val filter = IntentFilter(usbPermissionAction)
            ctx.registerReceiver(usbPermissionReceiver, filter)
            
            val pi = PendingIntent.getBroadcast(ctx, 0, Intent(usbPermissionAction), PendingIntent.FLAG_IMMUTABLE)
            usbManager.requestPermission(device, pi)
        } catch (e: Exception) {
            android.util.Log.e("PrinterModule", "请求USB权限失败: ${e.message}", e)
            promise.reject("REQUEST_PERMISSION_ERROR", e)
        }
    }
    
    /**
     * 获取所有USB设备（包括没有权限的）
     * 
     * @param promise Promise对象
     */
    @ReactMethod
    fun getAllUsbDevices(promise: Promise) {
        try {
            val usbManager = ctx.getSystemService(Context.USB_SERVICE) as? UsbManager
            if (usbManager == null) {
                promise.reject("NO_USB_MANAGER", "无法获取UsbManager")
                return
            }
            
            val deviceList = Arguments.createArray()
            val devices = usbManager.deviceList
            
            android.util.Log.d("PrinterModule", "getAllUsbDevices: 发现 ${devices.size} 个USB设备")
            
            devices.values.forEach { usbDevice ->
                try {
                    val deviceMap = Arguments.createMap()
                    deviceMap.putInt("vendorId", usbDevice.vendorId)
                    deviceMap.putInt("productId", usbDevice.productId)
                    deviceMap.putInt("deviceClass", usbDevice.deviceClass)
                    deviceMap.putInt("deviceSubclass", usbDevice.deviceSubclass)
                    deviceMap.putInt("deviceProtocol", usbDevice.deviceProtocol)
                    deviceMap.putInt("interfaceCount", usbDevice.interfaceCount)
                    
                    // 获取设备名称（Android 5.0+）
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                        deviceMap.putString("productName", usbDevice.productName ?: "Unknown")
                        deviceMap.putString("manufacturerName", usbDevice.manufacturerName ?: "Unknown")
                    }
                    
                    // 获取设备ID
                    deviceMap.putString("id", "usb:${usbDevice.vendorId}:${usbDevice.productId}")
                    deviceMap.putString("deviceId", usbDevice.deviceId.toString())
                    deviceMap.putBoolean("hasPermission", usbManager.hasPermission(usbDevice))
                    
                    android.util.Log.d("PrinterModule", "USB设备详情: VID=0x${String.format("%04X", usbDevice.vendorId)}, PID=0x${String.format("%04X", usbDevice.productId)}, Class=${usbDevice.deviceClass}, InterfaceCount=${usbDevice.interfaceCount}, HasPermission=${usbManager.hasPermission(usbDevice)}")
                    
                    deviceList.pushMap(deviceMap)
                } catch (e: Exception) {
                    android.util.Log.e("PrinterModule", "处理USB设备失败: ${e.message}")
                }
            }
            
            promise.resolve(deviceList)
        } catch (e: Exception) {
            android.util.Log.e("PrinterModule", "getAllUsbDevices失败: ${e.message}", e)
            promise.reject("GET_USB_DEVICES_ERROR", e)
        }
    }
    
    /**
     * 请求所有USB设备的权限
     * 
     * @param promise Promise对象
     */
    @ReactMethod
    fun requestAllUsbPermissions(promise: Promise) {
        try {
            val usbManager = ctx.getSystemService(Context.USB_SERVICE) as? UsbManager
            if (usbManager == null) {
                promise.reject("NO_USB_MANAGER", "无法获取UsbManager")
                return
            }
            
            val devices = usbManager.deviceList.values
            var requestedCount = 0
            var alreadyGrantedCount = 0
            
            devices.forEach { device ->
                if (!usbManager.hasPermission(device)) {
                    val pi = PendingIntent.getBroadcast(
                        ctx, 
                        device.deviceId, 
                        Intent(usbPermissionAction), 
                        PendingIntent.FLAG_IMMUTABLE
                    )
                    usbManager.requestPermission(device, pi)
                    requestedCount++
                    android.util.Log.d("PrinterModule", "请求权限: VID=${device.vendorId}, PID=${device.productId}")
                } else {
                    alreadyGrantedCount++
                }
            }
            
            val resultMap = Arguments.createMap()
            resultMap.putInt("totalDevices", devices.size)
            resultMap.putInt("requestedCount", requestedCount)
            resultMap.putInt("alreadyGrantedCount", alreadyGrantedCount)
            
            android.util.Log.d("PrinterModule", "USB权限请求完成: 总共${devices.size}个设备, 请求${requestedCount}个, 已授权${alreadyGrantedCount}个")
            
            promise.resolve(resultMap)
        } catch (e: Exception) {
            android.util.Log.e("PrinterModule", "requestAllUsbPermissions失败: ${e.message}", e)
            promise.reject("REQUEST_ALL_PERMISSIONS_ERROR", e)
        }
    }

    // ==================== 新的多连接API ====================

    /**
     * 连接到指定打印机（多连接版本）
     * 
     * @param printerId 打印机唯一标识符
     * @param options 连接选项
     * @param promise Promise对象，用于返回连接结果
     */
    @ReactMethod 
    fun connectPrinter(printerId: String, options: ReadableMap, promise: Promise) {
        val type = options.getString("type")
        val target = options.getString("target")
        
        // 检查是否已经连接
        printerConnections[printerId]?.let { existingConn ->
            if (existingConn.isConnected) {
                promise.resolve(true)
                return
            }
        }
        
        thread {
            try {
                val connection = PrinterConnection(printerId, type ?: "")
                
                when(type) {
                    // Network TCP 连接（常用于 热敏/票据打印机 9100 端口）
                    "network" -> {
                        val parts = target!!.split(":"); val host = parts[0]; val port = if (parts.size>1) parts[1].toInt() else 9100
                        val timeout = if (options.hasKey("timeout")) options.getInt("timeout") else 3000
                        val s = Socket(); s.connect(InetSocketAddress(host, port), timeout)
                        connection.socket = s; connection.output = s.getOutputStream(); connection.isConnected = true
                    }
                    // Bluetooth classic (RFCOMM SPP). target 为 MAC 地址
                    "bluetooth" -> {
                        val adapter = BluetoothAdapter.getDefaultAdapter();
                        val device: BluetoothDevice = adapter.getRemoteDevice(target)
                        val uuid = device.uuids?.firstOrNull()?.uuid ?: UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
                        val s = device.createRfcommSocketToServiceRecord(uuid)
                        adapter.cancelDiscovery(); 
                        
                        try {
                            s.connect(); 
                            
                            // 添加连接验证：发送测试指令
                            val testOutput = s.outputStream
                            testOutput.write(byteArrayOf(0x10, 0x04, 0x01)) // DLE EOT 1 (查询打印机状态)
                            testOutput.flush()
                            
                            // 等待回应或设置超时
                            val inputStream = s.inputStream
                            val buffer = ByteArray(1)
                            val bytesRead = readBytesWithTimeout(inputStream, buffer, 3000)
                            if (bytesRead <= 0) {
                                // 没有回应，可能是虚假连接
                                s.close()
                                promise.reject("CONNECT_FAIL", "设备无响应，可能未开机或不在范围内")
                                return@thread
                            }
                            
                            connection.btSocket = s; 
                            connection.output = s.outputStream; 
                            connection.isConnected = true
                            
                        } catch (e: SocketTimeoutException) {
                            s.close()
                            promise.reject("CONNECT_FAIL", "连接超时，设备可能未开机")
                            return@thread
                        } catch (e: IOException) {
                            s.close()
                            promise.reject("CONNECT_FAIL", "连接失败: ${e.message}")
                            return@thread
                        }
                    }
                    // USB 原生传输（通过 USB Host bulk OUT endpoint 写入）
                    "usb" -> {
                        val parts = target!!.removePrefix("usb:").split(":"); if (parts.size < 2) { promise.reject("ARG","target format vendorId:productId"); return@thread }
                        val vid = parts[0].toInt(); val pid = parts[1].toInt(); val usbManager = ctx.getSystemService(ReactApplicationContext.USB_SERVICE) as UsbManager
                        val device = usbManager.deviceList.values.firstOrNull { it.vendorId==vid && it.productId==pid } ?: run { promise.reject("NOT_FOUND","USB device not found"); return@thread }
                        if (!usbManager.hasPermission(device)) { promise.reject("NO_PERMISSION","No USB permission (requestUsbPermission)"); return@thread }
                        val conn = usbManager.openDevice(device) ?: run { promise.reject("OPEN_FAIL","Cannot open USB device"); return@thread }
                        connection.usbConnection = conn
                        var outEndpoint: UsbEndpoint? = null
                        // 扫描接口与端点，寻找第一个 bulk OUT 端点并 claimInterface
                        for (i in 0 until device.interfaceCount) {
                            val intf = device.getInterface(i)
                            for (e in 0 until intf.endpointCount) {
                                val ep = intf.getEndpoint(e)
                                if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) {
                                    if (conn.claimInterface(intf, true)) { outEndpoint = ep; break }
                                }
                            }
                            if (outEndpoint!=null) break
                        }
                        if (outEndpoint == null) { promise.reject("NO_EP","No bulk OUT endpoint"); return@thread }
                        // 将 bulkTransfer 包装为 OutputStream 以便统一写入接口
                        connection.output = object: OutputStream() {
                            override fun write(b: Int) { write(byteArrayOf(b.toByte())) }
                            override fun write(b: ByteArray) { connection.usbConnection?.bulkTransfer(outEndpoint, b, b.size, 1000) }
                        }
                        connection.isConnected = true
                    }
                    // 串口（通过 usb-serial-for-android 驱动的虚拟串口）
                    "serial" -> {
                        val parts = target!!.removePrefix("usb:").split(":"); if (parts.size < 2) { promise.reject("ARG","target format vendorId:productId"); return@thread }
                        val vid = parts[0].toInt(); val pid = parts[1].toInt(); val usbManager = ctx.getSystemService(ReactApplicationContext.USB_SERVICE) as UsbManager
                        val driver = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager).firstOrNull { it.device.vendorId==vid && it.device.productId==pid } ?: run { promise.reject("NOT_FOUND","Serial device not found"); return@thread }
                        if (!usbManager.hasPermission(driver.device)) { promise.reject("NO_PERMISSION","No USB permission"); return@thread }
                        val conn = usbManager.openDevice(driver.device) ?: run { promise.reject("OPEN_FAIL","Cannot open serial device"); return@thread }
                        connection.usbConnection = conn
                        val port = driver.ports.first(); port.open(conn)
                        val baud = if (options.hasKey("baudRate")) options.getInt("baudRate") else 9600
                        port.setParameters(baud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
                        connection.serialPort = port
                        // 将串口写入封装为 OutputStream
                        connection.output = object: OutputStream() { override fun write(b: Int) { write(byteArrayOf(b.toByte())) }; override fun write(b: ByteArray) { port.write(b, 1000) } }
                        connection.isConnected = true
                    }
                    else -> { promise.reject("ARG", "Unknown type") ; return@thread }
                }
                
                // 保存连接
                printerConnections[printerId] = connection
                
                // 设置为当前活动打印机（向后兼容）
                if (activePrinterId == null) {
                    activePrinterId = printerId
                }
                
                // 连接成功后发送 state: connected 事件并 resolve
                val eventData = Arguments.createMap().apply { 
                    putString("state","connected")
                    putString("printerId", printerId)
                }
                sendEvent("state", eventData)
                promise.resolve(true)
            } catch (e: Exception) {
                // 连接失败：发 error 事件并 reject promise
                val eventData = Arguments.createMap().apply { 
                    putString("message", e.message)
                    putString("printerId", printerId)
                }
                sendEvent("error", eventData)
                promise.reject("CONNECT_FAIL", e)
            }
        }
    }

    /**
     * 断开指定打印机连接（多连接版本）
     * 
     * @param printerId 打印机ID
     * @param promise Promise对象
     */
    @ReactMethod 
    fun disconnectPrinter(printerId: String, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            if (connection != null) {
                // 尝试 flush 并关闭所有资源
                connection.output?.flush()
                connection.output = null
                connection.socket?.close()
                connection.socket = null
                connection.btSocket?.close()
                connection.btSocket = null
                connection.serialIoManager?.stop()
                connection.serialIoManager = null
                connection.serialPort?.close()
                connection.serialPort = null
                connection.usbConnection?.close()
                connection.usbConnection = null
                
                // 移除连接
                printerConnections.remove(printerId)
                
                // 如果断开的是当前活动打印机，选择下一个或清空
                if (activePrinterId == printerId) {
                    activePrinterId = printerConnections.keys.firstOrNull()
                }
                
                val eventData = Arguments.createMap().apply { 
                    putString("state","disconnected")
                    putString("printerId", printerId)
                }
                sendEvent("state", eventData)
            }
            promise.resolve(null)
        } catch (e: Exception) { 
            promise.reject("DISCONNECT_FAIL", e) 
        }
    }

    /**
     * 向指定打印机发送原始字节数组（多连接版本）
     * 
     * @param printerId 打印机ID
     * @param data 字节数组数据
     * @param promise Promise对象
     */
    @ReactMethod 
    fun sendRawBytesToPrinter(printerId: String, data: ReadableArray, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            if (connection?.output == null) { 
                promise.reject("NO_CONN", "Printer $printerId not connected")
                return 
            }
            
            val bytes = ByteArray(data.size())
            for (i in 0 until data.size()) {
                bytes[i] = data.getInt(i).toByte()
            }
            
            connection.output!!.write(bytes)
            connection.output!!.flush()
            promise.resolve(null)
        } catch (e: Exception) { 
            promise.reject("WRITE_FAIL", e) 
        }
    }

    /**
     * 设置活动打印机（用于向后兼容单连接API）
     * 
     * @param printerId 打印机ID
     * @param promise Promise对象
     */
    @ReactMethod 
    fun setActivePrinter(printerId: String, promise: Promise) {
        if (printerConnections.containsKey(printerId)) {
            activePrinterId = printerId
            promise.resolve(true)
        } else {
            promise.reject("NOT_FOUND", "Printer $printerId not found or not connected")
        }
    }

    /**
     * 获取所有已连接的打印机列表
     * 
     * @param promise Promise对象
     */
    @ReactMethod 
    fun getConnectedPrinters(promise: Promise) {
        val connectedPrinters = Arguments.createArray()
        
        for ((printerId, connection) in printerConnections) {
            if (connection.isConnected) {
                val printerInfo = Arguments.createMap()
                printerInfo.putString("id", printerId)
                printerInfo.putString("type", connection.type)
                printerInfo.putBoolean("isActive", printerId == activePrinterId)
                connectedPrinters.pushMap(printerInfo)
            }
        }
        
        promise.resolve(connectedPrinters)
    }

    /**
     * 检查指定打印机是否已连接
     * 
     * @param printerId 打印机ID
     * @param promise Promise对象
     */
    @ReactMethod 
    fun isPrinterConnected(printerId: String, promise: Promise) {
        val isConnected = printerConnections[printerId]?.isConnected == true
        promise.resolve(isConnected)
    }



    /**
     * 查询指定打印机状态（多连接版本）
     * 
     * @param printerId 打印机ID
     * @param promise Promise对象
     */
    @ReactMethod 
    fun getPrinterStatus(printerId: String, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            if (connection?.output == null) { 
                promise.reject("NO_CONN", "Printer $printerId not connected")
                return 
            }
            
            // 发送状态查询命令并读取回包
            val statusMap = Arguments.createMap()
            
            // 查询打印机状态 (DLE EOT 1)
            val status1 = queryPrinterStatusById(printerId, 0x10, 0x04, 0x01)
            if (status1 != null) {
                statusMap.putBoolean("paperOut", (status1 and 0x04) != 0)
                statusMap.putBoolean("drawerOpen", (status1 and 0x04) != 0)
                statusMap.putBoolean("coverOpen", (status1 and 0x08) != 0)
                statusMap.putBoolean("paperNearEnd", (status1 and 0x20) != 0)
            }
            
            // 查询离线状态 (DLE EOT 2)
            val status2 = queryPrinterStatusById(printerId, 0x10, 0x04, 0x02)
            if (status2 != null) {
                statusMap.putBoolean("offline", (status2 and 0x08) != 0)
                statusMap.putBoolean("error", (status2 and 0x20) != 0)
                statusMap.putBoolean("paperJam", (status2 and 0x40) != 0)
            }
            
            // 查询错误状态 (DLE EOT 3)
            val status3 = queryPrinterStatusById(printerId, 0x10, 0x04, 0x03)
            if (status3 != null) {
                statusMap.putBoolean("cutterError", (status3 and 0x04) != 0)
                statusMap.putBoolean("recoverableError", (status3 and 0x08) != 0)
                statusMap.putBoolean("unrecoverableError", (status3 and 0x20) != 0)
            }
            
            // 查询纸张状态 (DLE EOT 4)
            val status4 = queryPrinterStatusById(printerId, 0x10, 0x04, 0x04)
            if (status4 != null) {
                statusMap.putBoolean("paperPresent", (status4 and 0x60) == 0x60)
                statusMap.putBoolean("paperEmpty", (status4 and 0x60) == 0x00)
                statusMap.putBoolean("paperLow", (status4 and 0x60) == 0x20)
            }
            
            statusMap.putString("timestamp", System.currentTimeMillis().toString())
            promise.resolve(statusMap)
        } catch (e: Exception) { 
            promise.reject("STATUS_FAIL", e) 
        }
    }

    /**
     * 向指定打印机打印图片（多连接版本）
     * 
     * @param printerId 打印机ID
     * @param base64 Base64编码的图片数据
     * @param promise Promise对象
     */
    @ReactMethod 
    fun printImageToPrinter(printerId: String, base64: String, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            if (connection?.output == null) { 
                promise.reject("NO_CONN", "Printer $printerId not connected")
                return 
            }
            
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            var bmp = BitmapFactory.decodeByteArray(bytes,0,bytes.size) ?: run { promise.reject("DECODE_FAIL","Bitmap decode failed"); return }
            bmp = bmp.copy(Bitmap.Config.ARGB_8888, false)
            // 将图片宽度强制缩放到常见打印点宽并按8对齐（默认80mm机型多为576；58mm可改为384，后续可做成可选配置）
            val maxWidth = 576
            val alignedMaxWidth = (maxWidth / 8) * 8
            val targetWidth = if (alignedMaxWidth <= 0) 8 else alignedMaxWidth
            val targetHeight = (bmp.height.toFloat() * targetWidth / bmp.width).toInt().coerceAtLeast(1)
            if (bmp.width != targetWidth) {
                bmp = Bitmap.createScaledBitmap(bmp, targetWidth, targetHeight, true)
            }
            val w = bmp.width; val h = bmp.height
            val bytesPerRow = (w + 7) / 8
            val imageData = ByteArray(bytesPerRow * h)
            // 将位图转为单色位数组（阈值法，lum < 180 视为黑）
            for (y in 0 until h) {
                var bitIndex = 0
                for (x in 0 until w) {
                    val color = bmp.getPixel(x,y)
                    val r = (color shr 16) and 0xFF; val g = (color shr 8) and 0xFF; val b = color and 0xFF
                    val lum = (r*0.3 + g*0.59 + b*0.11).toInt()
                    val bytePos = y*bytesPerRow + bitIndex/8
                    if (lum < 180) { imageData[bytePos] = (imageData[bytePos].toInt() or (0x80 shr (bitIndex % 8))).toByte() }
                    bitIndex++
                }
            }
            val out = connection.output!!
            // 设定行间距为 0，避免 24 点条带间出现空隙
            out.write(byteArrayOf(0x1B, 0x33, 0x00)) // ESC 3 0
            // 动态选择 24-dot 或 8-dot 帧写入：整块用 24 点（33），尾块不足 24 点用 8 点（1）
            var row = 0
            while (row < h) {
                val remain = h - row
                val sliceHeight = if (remain >= 24) 24 else remain
                val mode = if (sliceHeight == 24) 33 else 1
                val nL = (w and 0xFF).toByte(); val nH = ((w shr 8) and 0xFF).toByte()
                out.write(byteArrayOf(0x1B, '*'.code.toByte(), mode.toByte(), nL, nH))
                for (x in 0 until w) {
                    if (mode == 33) {
                        // 24-dot：每列输出 3 个字节
                        for (k in 0 until 3) {
                            var bVal = 0
                            for (b in 0 until 8) {
                                val yy = row + k*8 + b
                                if (yy < h) {
                                    val bit = (imageData[yy*bytesPerRow + x/8].toInt() shr (7-(x%8))) and 1
                                    bVal = bVal or (bit shl (7-b))
                                }
                            }
                            out.write(bVal)
                        }
                    } else {
                        // 8-dot：每列输出 1 个字节
                        var bVal = 0
                        for (b in 0 until 8) {
                            val yy = row + b
                            if (yy < h) {
                                val bit = (imageData[yy*bytesPerRow + x/8].toInt() shr (7-(x%8))) and 1
                                bVal = bVal or (bit shl (7-b))
                            }
                        }
                        out.write(bVal)
                    }
                }
                // 换行以推进打印头
                out.write(byteArrayOf('\n'.code.toByte()))
                row += sliceHeight
            }
            // 恢复默认行距
            out.write(byteArrayOf(0x1B, 0x32)) // ESC 2
            out.flush(); promise.resolve(true)
        } catch (e: Exception) { promise.reject("IMG_FAIL", e) }
    }

    /**
     * 向指定打印机打印图片（带可选项，如 maxWidth/threshold）
     */
    @ReactMethod
    fun printImageToPrinterWithOptions(printerId: String, base64: String, options: ReadableMap, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            if (connection?.output == null) {
                promise.reject("NO_CONN", "Printer $printerId not connected")
                return
            }

            val bytes = Base64.decode(base64, Base64.DEFAULT)
            var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: run { promise.reject("DECODE_FAIL", "Bitmap decode failed"); return }
            bmp = bmp.copy(Bitmap.Config.ARGB_8888, false)

            // 读取可配置参数
            val reqMaxWidth = if (options.hasKey("maxWidth")) options.getInt("maxWidth") else 576
            val threshold = if (options.hasKey("threshold")) options.getInt("threshold") else 180

            // 强制缩放到期望点宽（按8对齐），避免原图过窄导致成品偏小
            val alignedReqWidth = (reqMaxWidth / 8) * 8
            val targetWidth = if (alignedReqWidth <= 0) 8 else alignedReqWidth
            val targetHeight = (bmp.height.toFloat() * targetWidth / bmp.width).toInt().coerceAtLeast(1)
            if (bmp.width != targetWidth) {
                bmp = Bitmap.createScaledBitmap(bmp, targetWidth, targetHeight, true)
            }

            val w = bmp.width; val h = bmp.height
            val bytesPerRow = (w + 7) / 8
            val imageData = ByteArray(bytesPerRow * h)
            for (y in 0 until h) {
                var bitIndex = 0
                for (x in 0 until w) {
                    val color = bmp.getPixel(x, y)
                    val r = (color shr 16) and 0xFF; val g = (color shr 8) and 0xFF; val b = color and 0xFF
                    val lum = (r * 0.3 + g * 0.59 + b * 0.11).toInt()
                    val bytePos = y * bytesPerRow + bitIndex / 8
                    if (lum < threshold) { imageData[bytePos] = (imageData[bytePos].toInt() or (0x80 shr (bitIndex % 8))).toByte() }
                    bitIndex++
                }
            }

            val out = connection.output!!
            // 设定行间距为 0，避免 24 点条带间出现空隙
            out.write(byteArrayOf(0x1B, 0x33, 0x00)) // ESC 3 0
            // 动态选择 24-dot 或 8-dot：整块用 24 点（33），尾块不足 24 点用 8 点（1）
            var row = 0
            while (row < h) {
                val remain = h - row
                val sliceHeight = if (remain >= 24) 24 else remain
                val mode = if (sliceHeight == 24) 33 else 1
                val nL = (w and 0xFF).toByte(); val nH = ((w shr 8) and 0xFF).toByte()
                out.write(byteArrayOf(0x1B, '*'.code.toByte(), mode.toByte(), nL, nH))
                for (x in 0 until w) {
                    if (mode == 33) {
                        for (k in 0 until 3) {
                            var bVal = 0
                            for (b in 0 until 8) {
                                val yy = row + k * 8 + b
                                if (yy < h) {
                                    val bit = (imageData[yy * bytesPerRow + x / 8].toInt() shr (7 - (x % 8))) and 1
                                    bVal = bVal or (bit shl (7 - b))
                                }
                            }
                            out.write(bVal)
                        }
                    } else {
                        var bVal = 0
                        for (b in 0 until 8) {
                            val yy = row + b
                            if (yy < h) {
                                val bit = (imageData[yy * bytesPerRow + x / 8].toInt() shr (7 - (x % 8))) and 1
                                bVal = bVal or (bit shl (7 - b))
                            }
                        }
                        out.write(bVal)
                    }
                }
                out.write(byteArrayOf('\n'.code.toByte()))
                row += sliceHeight
            }
            // 恢复默认行距
            out.write(byteArrayOf(0x1B, 0x32)) // ESC 2
            out.flush(); promise.resolve(true)
        } catch (e: Exception) { promise.reject("IMG_FAIL", e) }
    }

    /**
     * 使用当前活动打印机打印图片（带可选项）
     */
    @ReactMethod
    fun printImageWithOptions(base64: String, options: ReadableMap, promise: Promise) {
        if (activePrinterId != null) {
            printImageToPrinterWithOptions(activePrinterId!!, base64, options, promise)
        } else {
            promise.reject("NO_CONN", "No active printer connected")
        }
    }

    @ReactMethod fun printImage(base64: String, promise: Promise) {
        // 向后兼容：使用当前活动打印机
        if (activePrinterId != null) {
            printImageToPrinter(activePrinterId!!, base64, promise)
        } else {
            promise.reject("NO_CONN", "No active printer connected")
        }
    }
    
    @ReactMethod fun uploadImageToMemory(base64: String, imageId: Int, promise: Promise) {
        try {
            if (output == null) { promise.reject("NO_CONN","Not connected"); return }
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            var bmp = BitmapFactory.decodeByteArray(bytes,0,bytes.size) ?: run { promise.reject("DECODE_FAIL","Bitmap decode failed"); return }
            bmp = bmp.copy(Bitmap.Config.ARGB_8888, false)
            val w = bmp.width; val h = bmp.height
            val bytesPerRow = (w + 7) / 8
            val imageData = ByteArray(bytesPerRow * h)
            
            // 将位图转为单色位数组
            for (y in 0 until h) {
                var bitIndex = 0
                for (x in 0 until w) {
                    val color = bmp.getPixel(x,y)
                    val r = (color shr 16) and 0xFF; val g = (color shr 8) and 0xFF; val b = color and 0xFF
                    val lum = (r*0.3 + g*0.59 + b*0.11).toInt()
                    val bytePos = y*bytesPerRow + bitIndex/8
                    if (lum < 180) { imageData[bytePos] = (imageData[bytePos].toInt() or (0x80 shr (bitIndex % 8))).toByte() }
                    bitIndex++
                }
            }
            
            val out = output!!
            // 上传图片到打印机内存 (GS ( L)
            val totalBytes = imageData.size
            val pL = totalBytes and 0xFF
            val pH = (totalBytes shr 8) and 0xFF
            val pXL = (totalBytes shr 16) and 0xFF
            val pXH = (totalBytes shr 24) and 0xFF
            
            // GS ( L pL pH pXL pXH m fn a bx by c xL xH yL yH d1...dk
            val uploadCmd = byteArrayOf(
                0x1D, 0x28, 0x4C, // GS ( L
                pL.toByte(), pH.toByte(), pXL.toByte(), pXH.toByte(), // 数据长度
                0x00, // m = 0 (压缩模式)
                0x30, // fn = 48 (定义NV位图)
                imageId.toByte(), // a = 图片ID
                0x01, 0x00, // bx = 1 (水平方向)
                0x01, 0x00, // by = 1 (垂直方向)
                (w and 0xFF).toByte(), ((w shr 8) and 0xFF).toByte(), // xL xH (宽度)
                (h and 0xFF).toByte(), ((h shr 8) and 0xFF).toByte()  // yL yH (高度)
            )
            
            out.write(uploadCmd)
            out.write(imageData)
            out.flush()
            
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("UPLOAD_FAIL", e) }
    }
    
    @ReactMethod fun printStoredImage(imageId: Int, promise: Promise) {
        try {
            if (output == null) { promise.reject("NO_CONN","Not connected"); return }
            val out = output!!
            
            // 打印存储在内存中的图片 (GS ( L pL pH m fn a)
            val printCmd = byteArrayOf(
                0x1D, 0x28, 0x4C, // GS ( L
                0x02, 0x00, 0x00, 0x00, // pL pH pXL pXH = 2
                0x00, // m = 0
                0x31, // fn = 49 (打印NV位图)
                imageId.toByte() // a = 图片ID
            )
            
            out.write(printCmd)
            out.flush()
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("PRINT_STORED_FAIL", e) }
    }
    
    @ReactMethod fun deleteStoredImage(imageId: Int, promise: Promise) {
        try {
            if (output == null) { promise.reject("NO_CONN","Not connected"); return }
            val out = output!!
            
            // 删除存储在内存中的图片 (GS ( L pL pH m fn a)
            val deleteCmd = byteArrayOf(
                0x1D, 0x28, 0x4C, // GS ( L
                0x02, 0x00, 0x00, 0x00, // pL pH pXL pXH = 2
                0x00, // m = 0
                0x32, // fn = 50 (删除NV位图)
                imageId.toByte() // a = 图片ID
            )
            
            out.write(deleteCmd)
            out.flush()
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("DELETE_STORED_FAIL", e) }
    }

    /**
    * 检测指定打印机是否空闲
    * 
    * @param printerId 打印机ID
    * @param promise Promise对象
    */
    @ReactMethod 
    fun isPrinterIdle(printerId: String, promise: Promise) {
        try {
            val connection = printerConnections[printerId]
            
            // 检查基本连接状态
            if (connection == null || !connection.isConnected) {
                val resultMap = Arguments.createMap()
                resultMap.putBoolean("isIdle", false)
                resultMap.putString("reason", "打印机未连接")
                resultMap.putString("status", "disconnected")
                promise.resolve(resultMap)
                return
            }
            
            // 对于不同类型的打印机采用不同的检测策略
            when (connection.type) {
                "bluetooth" -> {
                    // 蓝牙打印机：检查连接状态和查询打印机状态
                    checkBluetoothPrinterIdle(printerId, promise)
                }
                "network" -> {
                    // 网络打印机：检查连接状态和网络可达性
                    checkNetworkPrinterIdle(printerId, promise)
                }
                "usb", "serial" -> {
                    // USB/串口打印机：检查连接状态
                    checkUsbSerialPrinterIdle(printerId, promise)
                }
                else -> {
                    val resultMap = Arguments.createMap()
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "不支持的打印机类型")
                    resultMap.putString("status", "unknown")
                    promise.resolve(resultMap)
                }
            }
            
        } catch (e: Exception) {
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("isIdle", false)
            resultMap.putString("reason", "检测失败: ${e.message}")
            resultMap.putString("status", "error")
            promise.resolve(resultMap)
        }
    }

    /**
    * 检查蓝牙打印机是否空闲
    */
    private fun checkBluetoothPrinterIdle(printerId: String, promise: Promise) {
        thread {
            try {
                val connection = printerConnections[printerId]!!
                val resultMap = Arguments.createMap()
                
                // 检查蓝牙连接是否有效
                val btSocket = connection.btSocket
                if (btSocket == null || !btSocket.isConnected) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "蓝牙连接已断开")
                    resultMap.putString("status", "disconnected")
                    promise.resolve(resultMap)
                    return@thread
                }
                
                // 发送状态查询指令
                try {
                    val statusQuery = byteArrayOf(0x10, 0x04, 0x01) // DLE EOT 1
                    connection.output?.write(statusQuery)
                    connection.output?.flush()
                    
                    // 设置短超时读取回应
                    val inputStream = btSocket.inputStream
                    val buffer = ByteArray(1)
                    val bytesRead = readBytesWithTimeout(inputStream, buffer, 2000)
                    
                    if (bytesRead > 0) {
                        val status = buffer[0].toInt() and 0xFF
                        val isIdle = checkPrinterStatusIdle(status)
                        
                        resultMap.putBoolean("isIdle", isIdle)
                        resultMap.putString("reason", if (isIdle) "打印机空闲" else "打印机忙碌或有错误")
                        resultMap.putString("status", "connected")
                        resultMap.putInt("statusCode", status)
                    } else {
                        resultMap.putBoolean("isIdle", false)
                        resultMap.putString("reason", "打印机无响应")
                        resultMap.putString("status", "no_response")
                    }
                    
                } catch (e: SocketTimeoutException) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "状态查询超时，可能被其他程序占用")
                    resultMap.putString("status", "timeout")
                } catch (e: IOException) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "通信错误: ${e.message}")
                    resultMap.putString("status", "communication_error")
                }
                
                promise.resolve(resultMap)
                
            } catch (e: Exception) {
                val resultMap = Arguments.createMap()
                resultMap.putBoolean("isIdle", false)
                resultMap.putString("reason", "检测异常: ${e.message}")
                resultMap.putString("status", "error")
                promise.resolve(resultMap)
            }
        }
    }

    /**
    * 检查网络打印机是否空闲
    */
    private fun checkNetworkPrinterIdle(printerId: String, promise: Promise) {
        thread {
            try {
                val connection = printerConnections[printerId]!!
                val resultMap = Arguments.createMap()
                
                // 检查网络连接是否有效
                val socket = connection.socket
                if (socket == null || socket.isClosed || !socket.isConnected) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "网络连接已断开")
                    resultMap.putString("status", "disconnected")
                    promise.resolve(resultMap)
                    return@thread
                }
                
                // 尝试发送状态查询
                try {
                    val statusQuery = byteArrayOf(0x10, 0x04, 0x01) // DLE EOT 1
                    connection.output?.write(statusQuery)
                    connection.output?.flush()
                    
                    // 设置短超时
                    socket.soTimeout = 3000 // 3秒超时
                    
                    val inputStream = socket.getInputStream()
                    val buffer = ByteArray(1)
                    val bytesRead = inputStream.read(buffer)
                    
                    if (bytesRead > 0) {
                        val status = buffer[0].toInt() and 0xFF
                        val isIdle = checkPrinterStatusIdle(status)
                        
                        resultMap.putBoolean("isIdle", isIdle)
                        resultMap.putString("reason", if (isIdle) "打印机空闲" else "打印机忙碌或有错误")
                        resultMap.putString("status", "connected")
                        resultMap.putInt("statusCode", status)
                    } else {
                        resultMap.putBoolean("isIdle", false)
                        resultMap.putString("reason", "打印机无响应")
                        resultMap.putString("status", "no_response")
                    }
                    
                } catch (e: SocketTimeoutException) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "网络超时，可能被其他程序占用")
                    resultMap.putString("status", "timeout")
                } catch (e: IOException) {
                    resultMap.putBoolean("isIdle", false)
                    resultMap.putString("reason", "网络通信错误: ${e.message}")
                    resultMap.putString("status", "communication_error")
                }
                
                promise.resolve(resultMap)
                
            } catch (e: Exception) {
                val resultMap = Arguments.createMap()
                resultMap.putBoolean("isIdle", false)
                resultMap.putString("reason", "网络检测异常: ${e.message}")
                resultMap.putString("status", "error")
                promise.resolve(resultMap)
            }
        }
    }

    /**
    * 检查USB/串口打印机是否空闲
    */
    private fun checkUsbSerialPrinterIdle(printerId: String, promise: Promise) {
        try {
            val connection = printerConnections[printerId]!!
            val resultMap = Arguments.createMap()
            
            // USB/串口打印机如果连接正常，通常认为可用
            val isConnected = when (connection.type) {
                "usb" -> connection.usbConnection != null
                "serial" -> connection.serialPort != null && connection.serialPort!!.isOpen
                else -> false
            }
            
            if (isConnected) {
                resultMap.putBoolean("isIdle", true)
                resultMap.putString("reason", "USB/串口连接正常")
                resultMap.putString("status", "connected")
            } else {
                resultMap.putBoolean("isIdle", false)
                resultMap.putString("reason", "USB/串口连接异常")
                resultMap.putString("status", "disconnected")
            }
            
            promise.resolve(resultMap)
            
        } catch (e: Exception) {
            val resultMap = Arguments.createMap()
            resultMap.putBoolean("isIdle", false)
            resultMap.putString("reason", "USB/串口检测异常: ${e.message}")
            resultMap.putString("status", "error")
            promise.resolve(resultMap)
        }
    }

    /**
    * 根据打印机状态码判断是否空闲
    */
    private fun checkPrinterStatusIdle(statusCode: Int): Boolean {
        // 检查常见的错误状态位
        // Bit 2 (0x04): 纸张用尽
        // Bit 3 (0x08): 盖子打开
        // Bit 5 (0x20): 纸张即将用尽
        // Bit 6 (0x40): 错误状态
        
        val hasError = (statusCode and 0x04) != 0 || // 纸张用尽
                    (statusCode and 0x08) != 0 || // 盖子打开
                    (statusCode and 0x40) != 0    // 错误状态
        
        return !hasError // 没有错误状态时认为空闲
    }

    /**
     * 带超时的读取工具：在不支持 soTimeout 的流（如 BluetoothSocket）上轮询 available()
     * 返回读取的字节数（最多读取 buffer.size 字节中的 1 字节），超时抛出 SocketTimeoutException
     */
    private fun readBytesWithTimeout(input: InputStream, buffer: ByteArray, timeoutMs: Int): Int {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val available = try { input.available() } catch (_: Exception) { 0 }
            if (available > 0) {
                return input.read(buffer, 0, 1)
            }
            try { Thread.sleep(10) } catch (_: InterruptedException) { }
        }
        throw SocketTimeoutException("Read timeout")
    }

    /**
     * 发送查询命令 (如 DLE EOT n) 到指定打印机并读取 1 字节状态
     * 仅对 bluetooth / network 类型尝试读取，其他类型返回 null
     */
    private fun queryPrinterStatusById(printerId: String, b1: Int, b2: Int, b3: Int): Int? {
        val connection = printerConnections[printerId] ?: return null
        val cmd = byteArrayOf(b1.toByte(), b2.toByte(), b3.toByte())
        try {
            connection.output?.write(cmd)
            connection.output?.flush()
        } catch (_: Exception) {
            return null
        }

        return when (connection.type) {
            "bluetooth" -> {
                val bt = connection.btSocket ?: return null
                val buf = ByteArray(1)
                return try {
                    val read = readBytesWithTimeout(bt.inputStream, buf, 2000)
                    if (read > 0) buf[0].toInt() and 0xFF else null
                } catch (_: SocketTimeoutException) {
                    null
                } catch (_: IOException) {
                    null
                }
            }
            "network" -> {
                val s = connection.socket ?: return null
                val buf = ByteArray(1)
                return try {
                    s.soTimeout = 3000
                    val read = s.getInputStream().read(buf)
                    if (read > 0) buf[0].toInt() and 0xFF else null
                } catch (_: SocketTimeoutException) {
                    null
                } catch (_: IOException) {
                    null
                }
            }
            else -> null
        }
    }
}
