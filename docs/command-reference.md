# 🚀 WebAssembly基准测试项目 - 命令参考指南

## 📋 概述

本文档为接手WebAssembly基准测试项目的开发者提供全面指南。它涵盖了所有可用命令、用途、执行顺序以及开发和研究工作流程的常见故障排除场景。

### 🛠️ 关键技术

- WebAssembly (WASM) 编译目标
- Rust 和 TinyGo 实现，具有统一的 C-ABI 接口
- Node.js 测试工具链，使用 Puppeteer 浏览器自动化 (v24.22.0)
- Python 统计分析管道，使用 NumPy 2.3+、SciPy 1.10+、Matplotlib 3.6+
- 基于 Make 的自动化系统，具有面向服务的架构（5个核心服务）
- Poetry 用于 Python 依赖管理
- Vitest 用于 JavaScript 测试框架（ConfigurationService、BrowserService、ResultsService）

### 📁 项目结构

- `tasks/` - 基准测试实现（Rust/TinyGo）
- `scripts/` - 构建和自动化脚本
- `tests/` - 测试套件（单元测试、集成测试、端到端测试）
- `analysis/` - 统计分析工具
- `results/` - 基准测试输出数据
- `docs/` - 项目文档

---

## 🏷️ 命令类别

### ⚙️ 环境设置

用于初始化开发环境和依赖项的命令。

### 🔨 构建系统

用于编译WebAssembly模块和管理构建的命令。

### 🧪 测试套件

用于运行不同级别测试和验证的命令。

### 📊 基准测试执行

用于使用各种配置运行性能基准测试的命令。

### 📈 分析管道

用于处理结果和生成报告的命令。

### 🧹 维护

用于清理、代码质量检查和项目维护的命令。

---

## 💻 开发工作流程

### 🆕 新开发者设置

#### 设置目的

从头开始设置开发环境

#### 设置流程

```bash
make check deps → make init → make build → make status → make test
```

#### 设置时间线

10-20分钟（取决于编译时间和系统性能）

#### 设置预期结果

完全配置的开发环境，具有验证的功能

### 🔄 日常开发周期

#### 开发目的

标准开发和测试工作流程

#### 开发流程

```bash
git pull → make build → make test → [代码更改] → make test → git commit
```

#### 开发时间线

每次周期2-5分钟

#### 开发预期结果

通过测试验证的代码更改

### ✅ 发布前验证

#### 验证目的

部署前的全面验证

#### 验证流程

```bash
make clean all → make build → make test → make all quick
```

#### 验证时间线

20-40分钟

#### 验证预期结果

完全验证，具有验证的构建和测试覆盖率（无性能分析）

---

## 🔬 研究工作流程

### ⚡ 快速性能分析

#### 快速分析目的

开发时的快速性能比较

#### 快速分析流程

```bash
make build → make run quick
```

#### 快速分析时间线

2-3分钟

#### 快速分析预期结果

验证构建完整性和模块正确性（不生成性能数据）

### 🧪 全面研究实验

#### 研究目的

完整的科研级性能分析

#### 研究流程

```bash
make clean all → make all
```

#### 研究时间线

30-60分钟

#### 研究预期结果

具有统计显著性的完整研究数据集

### 🎯 专注任务分析

#### 专注目的

分析特定基准测试任务性能

#### 专注流程

```bash
make build → make run → make analyze
```

#### 专注时间线

10-20分钟

#### 专注预期结果

单个基准测试任务的详细分析

---

## 📖 命令参考

### 🔧 Makefile 命令

#### make check deps

**目的**：验证所有必需的工具和依赖项都可用
**何时使用**：在任何其他操作之前，尤其是在新环境中
**先决条件**：无
**常见问题**：缺少 Rust/TinyGo 工具链，Node.js 版本不兼容

#### make init

**目的**：初始化开发环境，安装 Node.js 和 Python 依赖项，生成环境指纹
**何时使用**：首次设置或在 clean-all 之后
**先决条件**：check-deps 通过

**安装的依赖项**：

- 通过 npm ci 安装 Node.js 包（chalk、puppeteer、yaml、eslint、express、vitest）
- 通过 Poetry 安装 Python 包（numpy、matplotlib、scipy、pyyaml、black、ruff）
- 环境指纹（versions.lock、meta.json）

**常见问题**：网络连接、Poetry 未安装、权限问题

#### make build

**目的**：构建 WebAssembly 模块或配置（使用：make build [rust/tinygo/all/config/parallel/no-checksums]）
**何时使用**：代码更改后，在测试或基准测试之前
**先决条件**：init 完成

**选项**：

- `make build` - 构建 Rust 和 TinyGo 模块
- `make build rust` - 仅构建 Rust 模块
- `make build tinygo` - 仅构建 TinyGo 模块
- `make build all` - 构建所有内容，包括完整管道和优化分析
- `make build config` - 从 YAML 构建配置文件
- `make build parallel` - 并行构建任务
- `make build no-checksums` - 跳过校验和验证

**常见问题**：编译错误、缺少源文件、Rust/TinyGo 工具链问题

#### make run

**目的**：运行浏览器基准测试套件（使用 quick headed 获取选项）
**何时使用**：性能测试和数据收集
**先决条件**：build 完成

**选项**：

- `make run` - 使用默认配置运行
- `make run quick` - 运行快速基准测试用于开发
- `make run headed` - 运行可见浏览器用于调试
- `make run quick headed` - 快速基准测试与可见浏览器

**常见问题**：浏览器自动化失败、超时问题、缺少配置

#### make qc

**目的**：对基准测试数据运行质量控制（使用 quick 获取快速模式）
**何时使用**：基准测试执行后验证数据质量
**先决条件**：基准测试结果可用

**选项**：

- `make qc` - 完整质量控制分析
- `make qc quick` - 开发快速质量控制

**常见问题**：缺少 Python 依赖项、无结果数据、Poetry 环境问题

#### make validate

**目的**：运行基准测试验证分析（使用 quick 获取快速模式）
**何时使用**：基准测试执行后验证数据完整性
**先决条件**：基准测试结果可用

**选项**：

- `make validate` - 完整验证分析
- `make validate quick` - 开发快速验证

**常见问题**：缺少 Python 依赖项、无结果数据

#### make stats

**目的**：运行统计分析（使用 quick 获取快速模式）
**何时使用**：基准测试执行后计算统计指标
**先决条件**：基准测试结果可用

**选项**：

- `make stats` - 完整统计分析
- `make stats quick` - 开发快速统计分析

**常见问题**：缺少 Python 依赖项、Poetry 未初始化

#### make plots

**目的**：生成分析图表（使用 quick 获取快速模式）
**何时使用**：基准测试执行后创建可视化
**先决条件**：基准测试结果可用

**选项**：

- `make plots` - 生成完整图表套件
- `make plots quick` - 生成快速开发图表

**常见问题**：缺少 Python 依赖项、matplotlib 显示问题

#### make analyze

**目的**：运行验证、质量控制、统计分析和绘图（使用 quick 获取快速模式）
**何时使用**：基准测试执行后进行完整分析
**先决条件**：基准测试结果可用
**管道**：validate → qc → stats → plots

**选项**：

- `make analyze` - 完整分析管道
- `make analyze quick` - 开发快速分析

**常见问题**：缺少 Python 依赖项、Poetry 未初始化、matplotlib 显示问题

#### make all

**目的**：执行完整实验管道（build → run → analyze）
**何时使用**：完整研究实验
**先决条件**：init 完成
**常见问题**：执行时间长，任何步骤失败都会停止管道

#### make all quick

**目的**：使用快速设置的完整管道用于开发/测试
**何时使用**：开发验证、快速实验
**先决条件**：init 完成
**常见问题**：不生成基准测试数据，应省略分析步骤

#### make clean

**目的**：清理构建产物和临时文件（使用：make clean all 获取完整清理）
**何时使用**：构建问题、磁盘空间清理

**选项**：

- `make clean` - 清理生成产物（builds、configs、reports、results）
- `make clean all` - 完整清理包括依赖项、缓存、日志（带确认）

**清理的项目**：

- 构建产物（*.wasm、checksums.txt、sizes.csv）
- 配置文件（bench.json、bench-quick.json）
- 报告和结果目录
- 缓存文件（.cache.*）
- 临时文件（*.tmp、**pycache**、*.pyc）

**常见问题**：受保护文件的权限问题、意外数据丢失

#### make lint

**目的**：运行代码质量检查（使用：make lint [python/rust/go/js]）
**何时使用**：代码质量保证、提交前检查
**先决条件**：依赖项已安装

**选项**：

- `make lint` - 运行所有语言的 linter
- `make lint python` - 使用 ruff 进行 Python linting
- `make lint rust` - 使用 cargo clippy 进行 Rust linting
- `make lint go` - 使用 go vet 和 gofmt 进行 Go linting
- `make lint js` - 使用 ESLint 进行 JavaScript linting

**常见问题**：缺少 linter、代码格式问题、linting 规则违规

#### make format

**目的**：格式化代码（使用：make format [python/rust/go]）
**何时使用**：代码格式化、一致样式
**先决条件**：依赖项已安装

**选项**：

- `make format` - 格式化所有支持的语言
- `make format python` - 使用 black 进行 Python 格式化
- `make format rust` - 使用 cargo fmt 进行 Rust 格式化
- `make format go` - 使用 gofmt 进行 Go 格式化

**常见问题**：缺少格式化工具、冲突的格式化规则

#### make test

**目的**：运行测试（使用：make test [validate] 或运行所有测试）
**何时使用**：测试执行、验证
**先决条件**：依赖项已安装

**选项**：

- `make test` - 运行所有可用测试（JavaScript + Python）
- `make test validate` - 运行 WASM 任务验证套件

**常见问题**：缺少测试运行器、环境设置问题

#### make status

**目的**：显示包含环境、构建和实验信息的综合项目状态
**何时使用**：调试、状态验证、环境验证

**显示内容**：

- 🔧 环境依赖项：Python、Node.js、Rust、TinyGo 版本和可用性状态
- 📦 构建状态：WASM 模块计数（Rust/TinyGo 共3个）、校验和可用性、构建指标
- 🧪 基准测试任务：可用任务（mandelbrot、json_parse、matrix_mul）、规模（small/medium/large）、质量设置（50 次运行 × 4 次重复）
- 📈 实验结果：总实验运行计数、最新实验文件名、快速 vs 完整基准测试状态
- 🚀 快速命令：开发常用快捷方式，带时间估算

**常见问题**：无（仅信息性）

#### make info

**目的**：显示详细的系统和基准测试环境信息
**何时使用**：调试环境问题、系统兼容性检查

**显示内容**：

- 🖥️ 系统硬件：OS 版本、架构、CPU 核心数、内存大小
- 🛠️ 编译工具链：Make、Rust、Cargo、TinyGo、Go 版本和可用性
- 🌍 运行时环境：Node.js、npm、Python 版本、Puppeteer 配置状态
- 🔧 WASM 工具：wasm-strip (wabt)、wasm-opt (binaryen) 可用性状态
- 🧪 基准测试配置：配置文件位置、可用任务、规模、质量设置（50 次运行 × 4 次重复）
- 📁 项目信息：版本、许可证、目的、环境指纹哈希

**常见问题**：无（仅信息性）

**注意**：这是依赖检查的更新语法（以前是 `make check-deps`）

### 🐳 Docker 容器命令

#### make docker [subcommand]

**目的**：Docker 容器操作（使用：make docker [start|stop|restart|status|logs|shell|init|build|run|full|analyze|validate|qc|stats|plots|test|info|clean|help] [flags]）
**何时使用**：在容器化环境中运行项目
**先决条件**：Docker 已安装并运行

**子命令**：

- `make docker start` - 启动 Docker 容器并进行健康检查
- `make docker stop` - 正常停止 Docker 容器
- `make docker restart` - 重启容器并验证
- `make docker status` - 显示容器状态和资源使用情况
- `make docker logs` - 显示最近的容器日志
- `make docker shell` - 进入容器进行开发
- `make docker init` - 在容器中初始化环境
- `make docker build [flags]` - 在容器中构建 WebAssembly 模块
- `make docker run [flags]` - 在容器中运行基准测试
- `make docker full [flags]` - 在容器中运行完整管道
- `make docker analyze [flags]` - 在容器中运行分析管道
- `make docker validate [flags]` - 在容器中运行基准测试验证
- `make docker qc [flags]` - 在容器中运行质量控制
- `make docker stats [flags]` - 在容器中运行统计分析
- `make docker plots [flags]` - 在容器中生成分析图表
- `make docker test [flags]` - 在容器中运行测试
- `make docker info` - 显示容器中的系统信息
- `make docker clean [all]` - 清理容器和镜像
- `make docker help` - 显示 Docker 帮助信息

**构建标志**：

- `rust` - 仅构建 Rust 模块
- `tinygo` - 仅构建 TinyGo 模块
- `config` - 构建配置文件
- `parallel` - 并行构建任务
- `no-checksums` - 跳过校验和验证

**运行标志**：

- `quick` - 使用快速配置

**测试标志**：

- `validate` - 运行 WASM 任务验证

**清理标志**：

- `all` - 完全清理包括镜像

**常见问题**：Docker 未运行、容器启动失败、权限问题

### 📦 NPM 脚本命令

#### npm run dev

**目的**：启动开发服务器并自动打开浏览器
**何时使用**：交互式开发和测试
**先决条件**：依赖项已安装
**服务器**：在端口 2025 上运行，日志记录到 dev-server.log
**常见问题**：端口冲突、浏览器打开失败

#### npm run serve:port

**目的**：在指定端口上启动开发服务器（使用 PORT 环境变量）
**何时使用**：仅服务器模式，使用自定义端口配置
**先决条件**：依赖项已安装
**示例**：`PORT=3000 npm run serve:port`
**常见问题**：端口已被使用、环境变量问题

#### npm run test

**目的**：运行完整测试套件（JavaScript 和 Python），带详细输出
**何时使用**：全面测试和验证
**先决条件**：依赖项已安装，构建已完成
**测试框架**：Vitest，300秒超时
**常见问题**：执行时间长、环境依赖项

#### npm run test:smoke

**目的**：核心功能的快速验证测试
**何时使用**：快速开发反馈
**先决条件**：构建已完成
**测试框架**：Vitest，10秒超时
**常见问题**：浏览器自动化设置问题

#### npm run test:unit

**目的**：运行隔离的单元测试
**何时使用**：测试特定组件
**先决条件**：依赖项已安装
**测试框架**：Vitest，5秒超时
**常见问题**：测试环境配置

#### npm run test:integration

**目的**：运行跨语言一致性测试
**何时使用**：验证语言实现一致性
**先决条件**：构建已完成，服务器运行中
**测试框架**：Vitest，60秒超时
**常见问题**：浏览器兼容性、时序问题

### 🐍 Python 脚本命令

#### wasm-benchmark-qc

**目的**：基准测试结果的质量控制分析
**何时使用**：验证数据完整性和统计假设
**先决条件**：结果数据可用
**分析**：异常值检测、正态性测试、方差分析
**常见问题**：缺少数据文件、统计假设违规

#### wasm-benchmark-stats

**目的**：基准测试结果的统计分析
**何时使用**：计算显著性检验和效应量
**先决条件**：结果数据可用
**分析**：Welch's t-test、Cohen's d 效应量、置信区间
**常见问题**：样本量不足、非正态分布

#### wasm-benchmark-plots

**目的**：为基准测试结果生成可视化图表
**何时使用**：创建出版级图表和图形
**先决条件**：结果数据可用
**输出**：reports/plots/ 目录中的 PNG 文件
**常见问题**：Matplotlib 后端问题、缺少数据

#### wasm-benchmark-validate

**目的**：任务实现的跨语言验证
**何时使用**：验证 WASM 模块正确性
**先决条件**：构建已完成
**验证**：跨语言的 FNV-1a 哈希比较
**常见问题**：哈希不匹配、WASM 加载失败

## 🔄 命令使用模式

### 💻 典型开发工作流程

```bash
# 初始设置
make init

# 开发周期
make build config quick
npm run dev &
make run quick
make qc quick
make analyze quick

# 完整验证
make test
```

### 🚀 生产基准测试工作流程

```bash
# 完整基准测试运行
make init
make build all
make run
make qc
make analyze
make plots
```

### 🔍 故障排除工作流程

```bash
# 检查系统状态
make status
make info

# 清理并重建
make clean all
make init
make build all

# 验证组件
make validate
make test
```

## ✅ 最佳实践总结

- **始终运行 `make init`** 在开始工作之前
- **在开发期间使用快速模式** 以获得更快的反馈
- **在发布结果之前运行完整验证**
- **检查日志** 在 dev-server.log 中查找服务器问题
- **使用 `make status`** 验证系统就绪状态和环境状态
- **使用 `make info`** 获取详细的系统和工具链信息
- **在切换工具链时使用 `make clean all` 清理构建**

### ⚙️ 运行基准测试脚本选项

#### node scripts/run_bench.js

**目的**：使用各种配置选项执行基准测试套件
**何时使用**：使用自定义设置进行性能测试和数据收集
**先决条件**：构建已完成，配置文件存在

**可用选项：**

- `--headed`：在 headed 模式下运行（显示浏览器）
- `--devtools`：打开浏览器开发者工具
- `--verbose`：启用详细日志记录
- `--parallel`：启用并行基准测试执行
- `--quick`：使用快速配置进行快速开发测试
- `--timeout=<ms>`：设置超时时间（毫秒，默认：300000，快速：30000）
- `--max-concurrent=<n>`：并行模式下的最大并发基准测试（默认：4，最大：20）
- `--failure-threshold=<rate>`：失败阈值率 0-1（默认：0.3）
- `--help, -h`：显示帮助信息

**常见使用示例：**

```bash
# 基本无头运行
node scripts/run_bench.js

# 带可见浏览器的开发
node scripts/run_bench.js --headed

# 快速开发测试
node scripts/run_bench.js --quick

# 调试的详细输出
node scripts/run_bench.js --verbose

# 并行执行
node scripts/run_bench.js --parallel --max-concurrent=5

# 慢速系统的自定义超时
node scripts/run_bench.js --timeout=600000

# 保守的失败处理
node scripts/run_bench.js --failure-threshold=0.1
```

**常见问题**：浏览器自动化失败、超时问题、缺少配置文件
