# XPrinter 状态检测更新说明

## ✅ 已完成的修改

### 1. Android 原生模块 (`XPrinterModule.kt`)

新增了 `printerStatusII` 方法：

```kotlin
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
```

### 2. TypeScript 驱动 (`XPrinterDriver.ts`)

重写了 3 个方法：

#### 2.1 `getPrinterStatus()` - 主要方法

```typescript
async getPrinterStatus(type?: string): Promise<number>
```

**返回值说明**：
- `0`: 正常
- `1`: 缺纸/纸将尽
- `2`: 打印机离线（盖子打开）
- `3`: 打印机错误（切刀错误、过热等）
- `4`: 连接超时或未连接

**主要改进**：
- ✅ 先检查 `this._isConnected` 状态
- ✅ 使用正确的 `printerStatusII` SDK 方法
- ✅ 自动更新连接状态（当返回 -3 时）
- ✅ 详细的状态解析和日志输出

#### 2.2 `printerStatusII()` - 获取原始状态

```typescript
async printerStatusII(): Promise<number>
```

**返回值说明**：
- `正数`: 状态位标志（可以用位运算检查）
- `-3`: 连接已断开
- `-4`: 查询超时

**用途**：需要直接访问原始状态位时使用

#### 2.3 `isPrinterReady()` - 快速检查

```typescript
async isPrinterReady(): Promise<boolean>
```

**返回值说明**：
- `true`: 可以打印
- `false`: 有错误，不能打印

**用途**：打印前快速检查是否可以打印

### 3. 新增辅助方法

```typescript
private parseStatusBits(status: number): {
    printing: boolean;       // 位 0 (1): 打印中
    coverOpen: boolean;      // 位 1 (2): 打印机开盖
    paperOut: boolean;       // 位 2 (4): 打印机缺纸
    paperNearEnd: boolean;   // 位 3 (8): 纸将尽
    drawerOpen: boolean;     // 位 4 (16): 钱箱打开
    otherError: boolean;     // 位 5 (32): 其他错误
    cutterError: boolean;    // 位 6 (64): 切刀错误
    headOverheat: boolean;   // 位 7 (128): 打印头过热
}
```

## 📖 使用示例

### 示例 1: 打印前检查状态（推荐）

```typescript
import XPrinterDriver from 'react-native-escpos-printer';

const driver = new XPrinterDriver({
    connectType: 'USB',
    address: 'xxx',
});

await driver.connect(printerId);

// 方法 1: 使用 isPrinterReady（最简单）
const isReady = await driver.isPrinterReady();
if (!isReady) {
    console.error('打印机未就绪');
    return;
}

// 方法 2: 使用 getPrinterStatus（更详细）
const status = await driver.getPrinterStatus();
switch (status) {
    case 0:
        console.log('✅ 打印机正常，可以打印');
        break;
    case 1:
        console.error('❌ 缺纸或纸将尽');
        return;
    case 2:
        console.error('❌ 打印机盖子打开');
        return;
    case 3:
        console.error('❌ 打印机故障（切刀错误、过热等）');
        return;
    case 4:
        console.error('❌ 打印机连接超时或未连接');
        return;
}

// 状态正常，执行打印
await driver.printMixed(items, options);
```

### 示例 2: 获取详细状态信息

```typescript
// 获取原始状态码
const rawStatus = await driver.printerStatusII();

if (rawStatus < 0) {
    if (rawStatus === -3) {
        console.error('连接已断开，尝试重新连接...');
        await driver.connect(printerId);
    } else if (rawStatus === -4) {
        console.error('查询超时');
    }
    return;
}

// 手动解析状态位
if ((rawStatus & 0x04) !== 0) {
    console.error('缺纸');
}
if ((rawStatus & 0x02) !== 0) {
    console.error('盖子打开');
}
if ((rawStatus & 0x40) !== 0) {
    console.error('切刀错误');
}
if ((rawStatus & 0x80) !== 0) {
    console.error('打印头过热');
}
if ((rawStatus & 0x01) !== 0) {
    console.log('正在打印...');
}
```

### 示例 3: 在打印队列中使用

```typescript
// 在 src/services/queue/PrinterScheduler.js 中

async function checkPrinterAvailability(
    printerId: string,
    driverManager: any
): Promise<{ available: boolean; error?: string }> {
    try {
        const driver = await driverManager.getDriver(printerId, config);
        
        // 使用新的 isPrinterReady 方法
        const isReady = await driver.isPrinterReady();
        
        if (!isReady) {
            // 获取详细状态
            const status = await driver.getPrinterStatus();
            
            let error = '打印机未就绪';
            switch (status) {
                case 1:
                    error = '打印机缺纸';
                    break;
                case 2:
                    error = '打印机盖子打开';
                    break;
                case 3:
                    error = '打印机故障';
                    break;
                case 4:
                    error = '打印机未连接';
                    break;
            }
            
            return { available: false, error };
        }
        
        return { available: true };
    } catch (error) {
        return { available: false, error: error.message };
    }
}
```

## 🔄 与旧版本的对比

### ❌ 旧版本（错误）

```typescript
// 使用错误的参数
const res = await XPrinterModule.escPrinterCheck(7, 100, this.printerId);
//                                                ↑   ↑
//                                         错误的type  超时太短

// 需要手动解析 3 个字节
const [offline, error, paper] = bytes;
// 复杂且容易出错
```

### ✅ 新版本（正确）

```typescript
// 使用正确的 SDK 方法
const status = await XPrinterModule.printerStatusII(this.printerId);
//                                  ↑
//                            SDK 推荐方法，自动解析

// 直接获得整数状态码，简单明了
if (status === -3) {
    // 连接已断开
}
```

## 📊 状态码速查表

### `getPrinterStatus()` 返回值

| 状态码 | 含义 | 建议操作 |
|--------|------|----------|
| 0 | 正常 | 继续打印 |
| 1 | 缺纸/纸将尽 | 提示用户加纸 |
| 2 | 盖子打开 | 提示用户关闭盖子 |
| 3 | 打印机故障 | 检查切刀、温度等 |
| 4 | 未连接/超时 | 重新连接 |

### `printerStatusII()` 位标志

| 位 | 十六进制 | 十进制 | 含义 | 检查方法 |
|----|---------|--------|------|---------|
| 0 | 0x01 | 1 | 打印中 | `(status & 0x01) !== 0` |
| 1 | 0x02 | 2 | 盖子打开 | `(status & 0x02) !== 0` |
| 2 | 0x04 | 4 | 缺纸 | `(status & 0x04) !== 0` |
| 3 | 0x08 | 8 | 纸将尽 | `(status & 0x08) !== 0` |
| 4 | 0x10 | 16 | 钱箱打开 | `(status & 0x10) !== 0` |
| 5 | 0x20 | 32 | 其他错误 | `(status & 0x20) !== 0` |
| 6 | 0x40 | 64 | 切刀错误 | `(status & 0x40) !== 0` |
| 7 | 0x80 | 128 | 打印头过热 | `(status & 0x80) !== 0` |

### 特殊返回值

| 值 | 含义 | 原因 |
|----|------|------|
| -3 | 连接已断开 | 打印机未连接 |
| -4 | 查询超时 | 网络问题或打印机无响应 |

## ⚠️ 注意事项

1. **连接状态管理**
   - 方法会自动更新 `this._isConnected` 状态
   - 当返回 `-3` 时，连接状态会被设置为 `false`

2. **超时时间**
   - `printerStatusII` 固定使用 3000ms 超时（SDK 内部设定）
   - 比旧方法的 100ms 更可靠

3. **向后兼容**
   - 旧的 `escPrinterCheck` 方法仍然保留
   - 但推荐使用新的 `printerStatusII`

4. **错误处理**
   - 所有异常都会被捕获并返回状态码
   - 不会抛出未处理的异常

## 🚀 下一步

1. **测试新方法**
   ```bash
   cd D:\POS-APP
   npm run android
   ```

2. **更新主项目中的调用**
   - 检查 `src/services/queue/PrinterScheduler.js`
   - 确认使用新的状态检测方法

3. **清理旧代码**（可选）
   - 如果不再需要 `escPrinterCheck`，可以删除

## 📝 总结

✅ **已修复的问题**：
- 错误的 `type: 7` 参数
- 过短的 100ms 超时
- 复杂的字节解析逻辑

✅ **新增的功能**：
- 正确的 `printerStatusII` 方法
- 自动连接状态管理
- 详细的状态解析
- 友好的错误提示

✅ **改进的体验**：
- 更可靠的状态检测
- 更清晰的代码逻辑
- 更好的调试信息

