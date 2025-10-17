# MyLogger 日志组件

React Native 日志组件，基于 react-native-file-logger 实现。

## 📦 功能特性

- ✅ 简单易用：`MyLogger.log(msg)` 类似 console.log
- ✅ 自动日期管理：每天自动创建新日志文件
- ✅ 文件自动分割：超过100MB自动分割
- ✅ 自动清理：保留30天，超期自动删除
- ✅ Console 捕获：所有 console.log 自动写入文件
- ✅ 非阻塞式：不影响应用性能
- ✅ 异常保护：任何异常都降级到 console.log

## 🚀 使用方法

### 初始化（已在 App.js 中完成）

```javascript
import MyLogger from './utils/MyLogger';

await MyLogger.initialize();
```

### 写入日志

```javascript
import MyLogger from './utils/MyLogger';

// 方法1：使用 MyLogger.log()
MyLogger.log('用户登录成功');
MyLogger.log(`订单创建: ${orderId}`);

// 方法2：使用 console.log()（自动捕获）
console.log('这条日志会自动写入文件');
console.error('错误信息也会写入');
```

### 日志格式

```
2025-10-17 10:37:50 - [INFO] 用户登录成功
2025-10-17 10:37:51 - [DEBUG] 订单创建: ID=12345
2025-10-17 10:37:52 - [WARN] 打印机连接缓慢
2025-10-17 10:37:53 - [ERROR] 打印失败
```

## 📁 日志文件

### 位置
```
Android: /data/data/com.straffinfo/files/AppLogs/
iOS: ~/Documents/AppLogs/
```

### 命名规则
```
WebPos_sys_20251017-latest.log  # 当前活跃日志
WebPos_sys_20251017-1.log       # 超过100MB后分割（第1个归档文件）
WebPos_sys_20251017-2.log       # 再次分割（第2个归档文件）
WebPos_sys_20251018-latest.log  # 第二天自动创建新文件
```

**注意：** 分隔符使用连字符 `-` 而非下划线 `_`

### 查看日志（Android）
```bash
# 查看文件列表
adb shell run-as com.straffinfo ls -lh /data/data/com.straffinfo/files/AppLogs/

# 查看日志内容
adb shell run-as com.straffinfo cat /data/data/com.straffinfo/files/AppLogs/WebPos_sys_20251017-latest.log

# 查看最后20行
adb shell run-as com.straffinfo tail -20 /data/data/com.straffinfo/files/AppLogs/WebPos_sys_20251017-latest.log
```

## ⚙️ 配置

在 `LoggerConf.js` 中修改配置，所有参数都可以根据项目需求自由调整：

### 文件管理配置

```javascript
const LoggerConf = {
  // 日志保留天数
  HousekeepingDay: 30,
  
  // 单个文件最大容量（MB）
  // ⚠️ 注意：由于异步写入缓冲，实际文件可能略大于此值（通常 10%-50%）
  //         这是正常现象，不影响日志功能
  MaxLogSizeMB: 100,
  
  // 文件名前缀
  LogPrefix: 'WebPos_sys',
  
  // 日志目录名称
  LogDirectoryName: 'AppLogs',
```

### 日志格式配置

```javascript
  // 日志等级：'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  LogLevel: 'DEBUG',
  
  // 是否包含毫秒
  // true:  2025-10-17 10:30:25.123
  // false: 2025-10-17 10:30:25
  IncludeMilliseconds: false,
  
  // 日志格式模板
  // 可用变量: {timestamp}, {level}, {message}
  LogFormat: '{timestamp} - [{level}] {message}',
  
  // 日期时间分隔符
  DateTimeSeparator: ' ',
```

### 功能开关

```javascript
  // 是否自动捕获 console.log
  CaptureConsole: true,
  
  // 是否启用 HouseKeeping 自动清理
  EnableHouseKeeping: true,
  
  // 是否启用过夜检测
  EnableOvernightDetection: true,
};
```

### 配置示例

#### 示例1：不包含毫秒的简洁格式
```javascript
LogFormat: '{timestamp} [{level}] {message}',
IncludeMilliseconds: false,
```
输出：`2025-10-17 10:30:25 [INFO] 用户登录成功`

#### 示例2：包含毫秒的详细格式
```javascript
LogFormat: '{timestamp} - [{level}] {message}',
IncludeMilliseconds: true,
```
输出：`2025-10-17 10:30:25.123 - [INFO] 用户登录成功`

#### 示例3：自定义格式
```javascript
LogFormat: '[{level}] {timestamp} | {message}',
DateTimeSeparator: 'T',
```
输出：`[INFO] 2025-10-17T10:30:25 | 用户登录成功`

## 📋 API

### MyLogger.initialize()
初始化日志组件（在 App 启动时调用）

### MyLogger.log(msg)
写入日志消息

### MyLogger.getLogFilePaths()
获取所有日志文件路径
```javascript
const paths = await MyLogger.getLogFilePaths();
console.log('日志文件:', paths);
```

### MyLogger.deleteAllLogs()
删除所有日志文件

### MyLogger.triggerHouseKeeping()
手动触发清理

## 🏠 HouseKeeping（自动清理）

### 触发时机
- App 启动时
- 日期变化时（过夜）
- 应用从后台恢复且日期已变化时

### 清理规则
- 保留最近 30 天的日志
- 删除超过 30 天的文件
- 基于文件名中的日期判断

## 📂 文件结构

```
src/utils/MyLogger/
├── index.js           # 模块入口
├── MyLogger.js        # 核心日志类
├── LoggerConf.js      # 配置文件
├── HouseKeeping.js    # 清理模块
└── README.md          # 本文档
```

## ⚠️ 注意事项

1. **必须初始化**：使用前必须调用 `MyLogger.initialize()`
2. **异常处理**：所有异常都会自动降级到 console.log
3. **文件位置**：日志存储在应用目录，卸载应用会自动清除
4. **文件名**：`-latest` 后缀是正常的，达到大小限制后会重命名

## 🐛 故障排查

### 文件为空？
1. 检查是否调用了 `MyLogger.initialize()`
2. 查看控制台是否有初始化错误
3. 重启应用让配置生效

### console.log 没有写入？
1. 确认 MyLogger 已初始化
2. 检查配置中的 `captureConsole` 是否为 true
3. 重启应用

