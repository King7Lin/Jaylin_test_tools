/**
 * MyLogger 配置文件
 * 
 * 所有参数都可以根据项目需求自由修改
 */

const LoggerConf = {
  // ========== 文件管理配置 ==========
  
  // 日志保留天数（默认30天）
  HousekeepingDay: 30,
  
  // 单个日志文件最大容量（MB）
  // 注意：由于异步写入，实际文件可能会略大于此值（通常 10%-50%）
  MaxLogSizeMB: 1,
  
  // 日志文件名前缀
  LogPrefix: 'WebPos_sys',
  
  // 日志目录名称（将在 DocumentDirectory 下创建）
  // Android: /data/data/com.straffinfo/files/AppLogs
  // iOS: ~/Documents/AppLogs
  LogDirectoryName: 'AppLogs',
  
  // ========== 日志格式配置 ==========
  
  // 日志等级：'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  LogLevel: 'DEBUG',
  
  // 时间戳格式（是否包含毫秒）
  // true: YYYY-MM-DD HH:mm:ss.SSS
  // false: YYYY-MM-DD HH:mm:ss
  IncludeMilliseconds: false,
  
  // 日志格式模板
  // 可用变量: {timestamp}, {level}, {message}
  // 示例: '{timestamp} - [{level}] {message}'
  LogFormat: '{timestamp} - [{level}] {message}',
  
  // 日期时间分隔符
  DateTimeSeparator: ' ',  // 日期和时间之间的分隔符
  
  // ========== 功能开关 ==========
  
  // 是否自动捕获 console.log
  CaptureConsole: true,
  
  // 是否启用 HouseKeeping 自动清理
  EnableHouseKeeping: true,
  
  // 是否启用过夜检测
  EnableOvernightDetection: true,
};

export default LoggerConf;

