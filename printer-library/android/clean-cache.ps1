<#
PowerShell 清理脚本：在 library/android 目录下运行，安全删除常见 Gradle/Android 构建缓存和产物。
#>

Write-Host "Running clean-cache.ps1 in $(Get-Location)"

$paths = @(
    ".gradle",
    "build",
    "captures",
    ".externalNativeBuild",
    "local.properties"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        Write-Host "Removing: $p"
        try {
            Remove-Item -Recurse -Force -ErrorAction Stop $p
        } catch {
            Write-Warning "Failed to remove $p: $_"
        }
    } else {
        Write-Host "Not present: $p"
    }
}

Write-Host "Done. Consider running `./gradlew.bat clean` afterwards to fully clean build outputs."
