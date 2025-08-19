## Git Commit 代码检测

### 安装

1. **安装 Python3**：访问 [Python 官网](https://www.python.org/getit/) 下载并安装 Python3。在安装过程中，请确保勾选 "Add python.exe to PATH" 选项。

2. **安装 Semgrep**：
   ```bash
   pip install semgrep
   ```
   安装完成后，执行以下命令安装 python-semgrep 依赖：
   ```bash
   pip install semgrep
   ```

3. **安装 Pre-commit**：
   ```bash
   pip install pre-commit
   ```

4. **配置 Pre-commit**：
   在项目根目录下运行以下命令：
   ```bash
   pre-commit install
   ```

### 使用

- **运行 Semgrep 扫描**：
  在项目根目录下执行以下命令进行代码扫描：
  ```bash
  semgrep --config=.semgrep.yml
  ```

- **运行 Pre-commit 检查所有文件**：
  ```bash
  pre-commit run --all-files
  ```

### 配置说明

`.pre-commit-config.yaml` 文件中的配置项：

- 检测 Error 级别问题：
  ```bash
  entry: semgrep --config .semgrep.yml --severity ERROR --error
  ```

- 检测 Warning 和 Error 级别问题：
  ```bash
  entry: semgrep --config .semgrep.yml --error
  ```
