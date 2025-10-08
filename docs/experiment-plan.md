# WebAssembly 基准测试：Rust vs TinyGo 性能对比研究

> **最后更新**: 2025-09-26  
> **实验完成度**: 449个参考测试向量，完整的统计分析管道，自动化质量控制  

---

## 实验概览

### 实验环境

**硬件：** MacBook Pro M4 10-Core CPU, 16GB RAM
**操作系统：** macOS 15.6+ (Darwin/arm64)
**浏览器：** Headless Chromium v140+ (Puppeteer 24.22.0)

**语言工具链：**

• **Rust** 1.90.0（稳定版）目标 `wasm32-unknown-unknown`，使用 `#[no_mangle]` 裸接口（零开销抽象）
• **TinyGo** 0.39.0 + **Go** 1.25.1 目标 WebAssembly（`-target=wasm`）
• **Node.js** 24.7.0 LTS
• **Python** 3.11+ 配科学计算栈（NumPy 2.3.3+, SciPy 1.10.0+, Matplotlib 3.6.0+）

**运行支架与脚本：**

• **Puppeteer：** 统一测试框架与基准执行，负责计时与内存采集、自动化重复执行、结果持久化（JSON 格式）
• **Vitest + Node.js：** 综合测试框架，包含单元、集成和端到端测试自动化
• **Bash + Python + Make：** 自动化构建系统、批量执行、数据质量控制和统计分析流水线

## 评测任务

统一使用 3 个计算/数据密集任务，Rust 与 TinyGo 各实现一份，同参对照：

1. **Mandelbrot 分形**（CPU 浮点密集）- 320个参考测试向量
2. **JSON 解析**（结构化数据处理）- 112个参考测试向量  
3. **矩阵乘法**（MatMul）（密集数值计算）- 17个参考测试向量

每个任务固定：输入规模（micro/small/medium/large）、随机种子、FNV-1a校验函数（在 Wasm 内部计算摘要，只把 u32 哈希值返回给 JS，确保 Rust/TinyGo 在同一任务返回结果完全一致）

**实际实现规模配置：**

- **Mandelbrot**: micro(64×64, 100 iter), small(256×256, 500 iter), medium(512×512, 1000 iter), large(1024×1024, 2000 iter)
- **JSON解析**: micro(500条), small(5000条), medium(15000条), large(30000条)
- **矩阵乘法**: micro(64×64), small(256×256), medium(384×384), large(576×576)

## 主要指标

**内存占用：** Chrome DevTools Protocol 内存指标，包含JS堆使用情况。

**质量控制：** 自动化QC管道，包含IQR异常值检测（1.5×IQR阈值）、变异系数验证（CV < 15%）、样本量验证（≥30个有效样本）。

**跨语言验证：** FNV-1a哈希算法确保实现一致性，449个参考测试向量覆盖所有任务和规模。

```javascript
// 裸接口 WebAssembly 模块加载
async function loadWasmModule(wasmPath) {
    const wasmBytes = await fs.readFile(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBytes);
    return wasmModule.instance;
}

async function benchmarkTask(taskName, wasmInstance, inputData) {
    // 预热和清理
    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));

    const memBefore = await page.metrics();

    // 准备输入数据（写入 Wasm 内存）
    const dataPtr = wasmInstance.exports.alloc(inputData.byteLength);
    const wasmMemory = new Uint8Array(wasmInstance.exports.memory.buffer);
    wasmMemory.set(new Uint8Array(inputData), dataPtr);

    // 执行基准测试
    const timeBefore = performance.now();
    const hash = wasmInstance.exports.run_task(dataPtr);
    const timeAfter = performance.now();

    const memAfter = await page.metrics();

    return {
        task: taskName,
        execution_time_ms: timeAfter - timeBefore,
        memory_used_mb: (memAfter.JSHeapTotalSize - memBefore.JSHeapTotalSize) / 1024 / 1024,
        hash: hash >>> 0  // 确保 u32
    };
}
```

## 统计分析

**核心统计方法：**

- **描述性统计：** 均值、标准差、变异系数、95%置信区间、中位数、四分位距
- **显著性检验：** Welch's t检验（适用于不等方差，p < 0.05，更稳健的t检验）
- **效应量：** Cohen's d计算（实际意义评估）
  - |d| < 0.2：可忽略效应
  - 0.2 ≤ |d| < 0.5：小效应
  - 0.5 ≤ |d| < 0.8：中效应
  - |d| ≥ 0.8：大效应
- **质量控制：** IQR离群值检测（1.5×IQR阈值），CV < 15%阈值，样本量 ≥ 30

**可视化：** 条形图（均值+错误条+显著性标记）+ 箱线图（分布+离群值）+ 效应量热力图 + 方差分析图

## 成功标准

**数据完备性：**

- 3个任务 × 2种语言 × 4种规模 = 24个数据集（已实现）
- 每个数据集≥30个有效样本（剔除异常值后）
- 变异系数CV < 15%（比传统20%更严格）
- 449个跨语言验证测试向量（320个Mandelbrot，112个JSON，17个矩阵）

**统计要求：**

- 基本描述统计：均值、标准差、95%CI、中位数、四分位距
- 显著性检验：Welch's t检验（p < 0.05，适用于不等方差）
- 效应量：Cohen's d（实际意义评估）
- 质量控制：IQR异常值检测，CV验证，样本量验证

**产出标准：**

- 统计分析报告：`reports/plots/decision_summary.html`（交互式仪表板）
- 核心图表：执行时间对比、内存使用对比、效应量热力图、分布方差分析
- 原始数据：完整JSON格式 + 质量控制审计跟踪
- 自动化质量门禁：通过`make qc`验证所有质量标准

## 实施时间表（已完成 - 2025年实验周期）

### ✅ 已完成阶段 (2025年初-中期)

- ✅ **环境配置 + 核心实现** - 工具链固定，任务实现，构建系统完成
- ✅ **质量控制 + 数据收集框架** - 完整的QC系统，跨语言验证，统计分析管道
- ✅ **集成测试 + 分析增强** - 端到端测试，高级可视化，决策支持系统
- ✅ **质量门禁系统** - 自动化质量检查标准，完整的验证框架

### 🎯 **当前状态**

- **项目完成度**: 99% - 生产就绪的基准测试框架
- **核心功能**: 完整的实验管道，从构建到分析的全自动化流程
- **质量保证**: 多层次的质量门禁系统，确保结果可靠性和重现性
- **文档完整性**: 全面的技术文档和使用指南

### 📊 **实验成果**

- **数据规模**: 24个测试配置，449个验证向量
- **统计严谨性**: Welch's t检验，Cohen's d效应量，IQR质量控制
- **自动化程度**: 一键执行完整实验流程
- **可重现性**: 环境指纹锁定，版本控制，确定性测试

---

## Stage 1：语言工具链安装与固定

• 安装并固定：

- **Rust 1.90.0** + `wasm32-unknown-unknown` 目标（无需 wasm-bindgen/wasm-pack）
- **Go 1.25.1** + **TinyGo 0.39.0**
- **Node.js 24.7.0 LTS**
- **Python 3.11+** + 科学计算库（NumPy 2.3.3, SciPy 1.10.0+, Matplotlib 3.6.0+）

• 安装 Chromium 与无头运行依赖

• 安装 Wasm 工具：Binaryen（`wasm-opt`）、WABT（`wasm2wat`/`wasm-strip`）

• 产出工具指纹：创建 `fingerprint.sh`，把所有版本写入 `meta.json` 和 `versions.lock`，确保可复现

---

## Stage 2：项目结构

```text
wasm-benchmark/
├── analysis/                   # 统计分析模块
│   ├── common.py              # 共享工具函数
│   ├── statistics.py          # 统计计算
│   ├── qc.py                  # 质量控制系统
│   ├── plots.py               # 可视化生成
│   ├── decision.py            # 决策支持分析
│   ├── validation.py          # 跨语言验证
│   ├── data_models.py         # 数据结构定义
│   └── config_parser.py       # 配置解析
├── builds/                     # 构建产物
│   ├── rust/                  # Rust WASM 文件
│   └── tinygo/                # TinyGo WASM 文件
├── configs/                    # 配置文件
├── data/reference_hashes/      # 参考哈希值 (449个验证向量)
├── docs/                       # 项目文档
├── harness/web/                # 浏览器测试框架
├── scripts/                    # 构建和自动化脚本
│   ├── build_*.sh             # 构建脚本
│   ├── run_bench.js           # 基准测试运行器
│   ├── interfaces/            # 服务接口
│   └── services/              # 服务实现
├── tasks/                      # 基准测试任务实现
│   ├── mandelbrot/            # Mandelbrot分形计算
│   ├── json_parse/            # JSON解析基准
│   └── matrix_mul/            # 矩阵乘法
├── tests/                     # 综合测试套件
├── results/                   # 实验结果存储
├── reports/                   # 生成的报告和可视化
│   ├── plots/                 # 图表输出
│   ├── qc/                    # 质量控制报告
│   └── statistics/            # 统计分析报告
├── pyproject.toml            # Python依赖
├── package.json               # Node.js依赖
├── Makefile                   # 自动化构建和工作流
└── README.md                  # 项目说明
```

---

## Stage 3：基准任务设计与参数固化（Task Design）

## 1) 全局约定（对所有任务生效）

### 导出接口（Wasm 侧）

**Rust 实现（#[no_mangle] 裸接口）：**

```rust
#[no_mangle]
pub extern "C" fn init(seed: u32);
#[no_mangle]
pub extern "C" fn alloc(n_bytes: u32) -> u32;  // 返回内存偏移
#[no_mangle]
pub extern "C" fn run_task(params_ptr: u32) -> u32;  // 返回哈希值
```

**TinyGo 实现（对应导出）：**

```go
//export init
func init(seed uint32)
//export alloc
func alloc(nBytes uint32) uint32
//export run_task
func runTask(paramsPtr uint32) uint32  // 返回哈希值
```

• 两种语言均导出 memory，直接进行指针操作

### 固定随机性

使用 xorshift32（Uint32），跨语言实现一致。

### FNV-1a 哈希校验机制

• 使用**FNV-1a 哈希算法**替代简单累加：具有更好的分布特性和抗冲突性
• **算法**：`hash = 2166136261; for each byte: hash ^= byte; hash *= 16777619`
• **优势**：检测顺序差异、极低冲突率、雪崩效应、跨语言一致
• `run_task` 返回 u32 哈希值，确保算法实现的正确性验证
• **统一实现**：

  ```c
  uint32_t hash = 2166136261;  // FNV 偏移基础
  for (each byte) {
      hash ^= byte;
      hash *= 16777619;        // FNV 素数
  }
  return hash;
  ```

• 对于浮点运算，先归一化到固定精度（如 `round(x * 1e6)`）再参与哈希

### JS↔Wasm 往返最小化

• JS 侧仅：① alloc+memcpy 输入一次；② init(seed) 一次；③ 多次 run_task() 计时
• 不跨界读回大数据，结果只以 u32 哈希值返回

## 优化变体（编译与后处理）

### Rust（裸接口配置）

```toml
[lib]
crate-type = ["cdylib"]  # 生成动态库，用于 WebAssembly

[profile.release]
opt-level = 3           # 最高优化级别
lto = "fat"             # 链接时优化
codegen-units = 1       # 最大化内联优化
panic = "abort"         # 无异常展开
strip = "debuginfo"     # 删除调试信息

[dependencies]
# 无外部依赖，纯手工实现
```

编译：`cargo build --target wasm32-unknown-unknown --release`
后处理：`wasm-strip target/wasm32-unknown-unknown/release/*.wasm`

### TinyGo

编译：

```bash
tinygo build -target=wasm \
  -opt=2 -panic=trap -no-debug -scheduler=none \
  -o out_tinygo_o2_minrt.wasm ./cmd/yourpkg
```

## 任务一：Mandelbrot（CPU 密集 / 浮点）

**目的：** 测试标量浮点循环与分支。

**输入**（通过 JS→Wasm 一次性写入的是参数区，像素缓冲在 Wasm 内部分配）：
• **基准参数**（小/中/大）

- S：256×256，max_iter=500
- M：512×512，max_iter=1000
- L：1024×1024，max_iter=2000
• **固定视区：** center=(-0.743643887037, 0.131825904205)；scale 分别为 3.0/宽度

**校验：** 对迭代次数序列进行 FNV-1a 哈希，跨语言结果一致。

**备注：** 仅返回哈希值，不回传位图，减少边界传输。

## 任务二：JSON 解析（结构化文本 → 结构化对象）

**目的：** 测试文本扫描、数字解析、对象构建与内存分配。

**输入：** 规范化 JSON（ASCII），是一段数组：

```json
[
  {"id":0,"value":123456,"flag":true,"name":"a0"},
  {"id":1,"value":...,"flag":false,"name":"a1"},
  ...
]
```

• **生成规则**（JS 侧一次性生成字符串字节并写入）：

- 无多余空白，字段顺序固定：id,value,flag,name
- id 单调递增；value 由 xorshift32 生成（取 31 位非负）
- flag = (value & 1) == 0；name = "a" + id（ASCII）
• **规模**（条目数，渐进式GC触发设计）
- S：6,000（~300KB JSON + 600KB解析对象 = 900KB，**不触发GC**）
- M：20,000（~1MB JSON + 2MB解析对象 = 3MB，**轻度触发GC**）
- L：50,000（~2.5MB JSON + 5MB解析对象 = 7.5MB，**中度触发GC**）

以平均每条 ~50 字节JSON + ~100字节解析对象估算，测试小对象分配的GC影响。

**过程**（Wasm 内）

1. 在 Wasm 内部解析 JSON（手写微型解析器或使用最小依赖），解析为临时结构或边扫边聚合
2. **聚合指标：**
   - sum_id（u64）
   - sum_value（u64）
   - cnt_true_flag（u32）
   - hash_name（对所有 name 字节进行 FNV-1a 哈希）
3. 将四个聚合值按顺序进行 FNV-1a 哈希：

   ```c
   hash = 2166136261;  // FNV 偏移基础
   // 将每个 u32 值转换为字节序列并用 FNV-1a 哈希
   hash = fnv1a_hash_u32(hash, sum_id);
   hash = fnv1a_hash_u32(hash, sum_value);
   hash = fnv1a_hash_u32(hash, cnt_true_flag);
   hash = fnv1a_hash_u32(hash, hash_name);
   return hash;
   ```

**校验：** 只比对哈希值即可；两语言解析路径不同也能对齐。

## 任务三：矩阵乘法

**目的：** 测试密集型数值计算、缓存访问。

**数据类型：** f32（两语言一致）。

**输入：** 两矩阵 A, B（行主序，连续 Float32Array），元素由 xorshift32 生成并映射到 [0,1)：

```text
val = (x >>> 0) * (1.0 / 4294967296.0)
```

**规模**（N×N，渐进式GC触发设计）
• S：256（768KB：A/B/C 各256KB = 768KB，**不触发GC**）
• M：384（1.7MB：A/B/C 各576KB + 计算临时变量 ≈ 3MB，**轻度触发GC**）
• L：512（3MB：A/B/C 各1MB + 计算临时变量 ≈ 8MB，**中度触发GC**）

**过程**（Wasm 内）

1. 读取 A,B，分配 C
2. 朴素三重循环（i,j,k 同序），保证不同语言浮点舍入路径一致
3. **生成摘要：** 将 C 每个元素按 `round(x * 1e6)` 转为 i32，进行 FNV-1a 哈希，返回哈希值

**校验：** 哈希值可重复且跨语言一致（同序 + f32 + 固定精度）。

## GC触发导向的测试规模设计原则

**TinyGo GC触发梯度设计**：

- **S（不触发GC）**：< 1MB内存使用，基本无GC影响，测试纯计算性能差异
- **M（轻度触发GC）**：2-4MB内存使用，开始有GC开销，性能差异开始显现
- **L（中度触发GC）**：6-10MB内存使用，GC开销明显，Rust零成本优势突出

**各任务GC压力特点**：

- **JSON解析**：大量小对象分配，测试细粒度GC开销
- **矩阵乘法**：大块连续内存，测试大对象分配的GC影响
- **Mandelbrot**：纯计算基线，几乎无内存分配，GC影响最小

**实验立场确认**：

- **目标**：通过渐进式GC压力量化"GC vs 零成本抽象"的性能差异
- **方法**：S规模建立无GC基线，M/L规模逐步暴露GC成本
- **预期**：S规模差异最小，M规模开始分化，L规模Rust优势明显

## 产物命名规范

`{task}-{lang}-{opt}.wasm`

例（优化级别后缀由 `configs/bench.yaml` 配置文件决定）：

- `mandelbrot-rust-o3.wasm`（Rust 裸接口 + O3 优化，后缀来自配置）
- `mandelbrot-tinygo-o2.wasm`（TinyGo + O2 优化，后缀来自配置）
- `json_parse-rust-o3.wasm`
- `json_parse-tinygo-o2.wasm`

**构建目录结构：**

```text
builds/
├─ rust/
│  ├─ mandelbrot-rust-o3.wasm  # 优化级别后缀(o3)从配置文件读取
│  ├─ json_parse-rust-o3.wasm
│  └─ matrix_mul-rust-o3.wasm
└─ tinygo/
   ├─ mandelbrot-tinygo-o2.wasm  # 优化级别后缀(o2)从配置文件读取
   ├─ json_parse-tinygo-o2.wasm
   └─ matrix_mul-tinygo-o2.wasm
```

## 公平性与一致性守则（强制）

• **同算法同序：** 排序/矩阵乘法的循环与比较顺序保持一致；Mandelbrot 统一 f64；MatMul 统一 f32
• **零外部依赖：** Rust 使用 `#[no_mangle]` 裸接口，TinyGo 使用 `//export`，均不引入高阶库
• **单线程 / 无 SIMD：** 本轮基线不启用多线程与 SIMD（可做扩展实验另立变体，如 o3-simd）
• **内存管理策略说明：**

- **Rust**：零成本抽象，编译时内存管理，无运行时GC开销
- **TinyGo**：带垃圾回收器，存在GC暂停和分配开销
- **实验立场**：将内存管理差异视为**语言特性的组成部分**，不试图消除，而是在分析中区分"纯计算性能"与"内存管理开销"的影响
• **一次拷入：** 所有输入通过 alloc 区一次性写入
• **同样的后处理：** wasm-strip → wasm-opt -O*/-Oz → gzip

## 结果与异常处理（落盘格式不变）

• `results/bench-*.ndjson` 保留每次 100 样本的 ms，以及 hash（来自返回值 u32）
• 对于失败（解析错误等），`run_task` 可返回固定错误码（如 `0xDEAD_xxxx`），JS 端把这次样本标记为 `ok:false` 并计入异常统计（不纳入均值）

---

## Stage 4：数据采集与质量控制

## 1. 数据采集流程

### 1. 初始化测试环境

- 确认硬件与软件环境与 Stage 2 配置一致
- 清理浏览器缓存及 Node.js 临时文件，确保测试前无残留状态
- 关闭后台高占用程序，减少干扰

### 2. 运行测试任务

- 在浏览器端（Puppeteer 驱动 Headless Chrome）Stage 3 中定义的 3 个任务
- 每个任务执行 10 次冷启动（首次加载计时）与 100 次热启动（已加载模块重复调用计时）
- 每次执行记录以下原始指标：
  - `execution_time_ms`（执行时间，`performance.now()` 记录）
  - `memory_usage_mb`（Chrome 的 `performance.memory` 或等效 Node 监控）
- Puppeteer 自动将每次运行的结果输出到 JSON 文件，如：

```json
{
  "task": "mandelbrot",
  "language": "rust",
  "run_type": "cold",
  "execution_time_ms": 123.45,
  "memory_usage_mb": 45.6,
}
```

### 3. 结果文件存储

• 按 YYYYMMDD-HHMM 时间戳命名文件夹，保证可追溯性
• 原始数据保存为 CSV 与 JSON 两种格式，方便后续分析：

```text
/results/20250815/
  ├── raw_data.json
  ├── raw_data.csv
  ├── logs/
  └── screenshots/  # 仅浏览器端可选
```

## 2. 数据质量控制

**目标：** 确保数据可靠性

### 自动化QC检查

• **数值验证：** 执行时间 > 0，内存使用合理范围
• **异常值检测：** IQR方法，超出Q1-1.5×IQR或Q3+1.5×IQR直接剔除
• **重复性验证：** CV < 20%，否则标记为"需复测"

### 数据汇总

• 生成 `final_dataset.csv`
• 计算基本统计量：均值、标准差、变异系数
• SHA256校验和锁定最终数据集

## 3. 数据交付

### 数据处理

- 通过质量控制流水线处理基准测试结果
- 生成综合统计分析报告
- 在 `reports/plots/` 创建可视化图表和图形
- 通过自动化QC检查验证数据完整性

### 高级分析

- 跨语言性能对比
- 统计显著性检验
- 内存使用模式分析
- 二进制大小优化分析

---

## Stage 5：统计分析

## 1. 分析准备

• **数据来源：** `results/` 目录中的结果JSON文件（经过QC验证）
• **分析环境：** Python 3.11+ 配科学计算栈
• **分析模块：** `analysis/statistics.py`、`analysis/qc.py`、`analysis/plots.py`、`analysis/decision.py`、`analysis/validation.py`
• **数据结构：** 结构化JSON，包含任务、语言、执行指标和验证数据

## 2. 核心统计分析

### 基本统计量计算

对每个 **任务+语言** 组合计算：

- 均值、标准差、变异系数
- 95%置信区间
- 二进制体积压缩率

### 显著性检验

- **Welch's t检验：** 适用于不等方差的稳健t检验（p < 0.05，更适合语言间方差异质性）
- **效应量：** Cohen's d计算
  - |d| < 0.2：可忽略效应
  - 0.2 ≤ |d| < 0.5：小效应
  - 0.5 ≤ |d| < 0.8：中效应
  - |d| ≥ 0.8：大效应

## 3. 可视化

### 5个核心图表

1. **执行时间对比图：** 均值对比 + 错误条 + 显著性标记
   - X轴：任务类型，Y轴：执行时间(ms)
   - 分组：Rust vs TinyGo，按规模分面

2. **内存使用对比图：** 内存消耗模式分析
   - 显示GC影响和内存管理差异

3. **效应量热力图：** Cohen's d可视化
   - 颜色编码显著性水平和效应大小

4. **分布方差分析图：** 箱线图 + 分布对比
   - 显示中位数、四分位距、异常值和方差模式

5. **决策分析仪表板：** 交互式HTML报告
   - 综合所有分析结果和决策建议

**输出格式：** PNG（静态图表）+ HTML（交互式仪表板）输出到 `/reports/plots/`

## 4. 分析产出

### 自动生成输出

- **质量控制报告：** `reports/qc/quality_control_report.json`（自动化QC分析）
- **统计分析报告：** `reports/statistics/`（完整统计分析）
- **可视化图表：** `reports/plots/*.png` + `decision_summary.html`（用于发表）
- **数据验证日志：** 完整的质量控制审计跟踪和跨语言验证

---

## Stage 6：结果分析与结论

## 结果汇总

• 汇总每任务性能对比结果
• 分析性能差异的可能原因（GC开销、内存管理、指令优化）
• 结合二进制体积给出应用场景建议

## 实验限制

• **环境限制：** 单机Chrome环境，结果适用性有限
• **任务范围：** 3个基准任务，代表性有限
• **测量精度：** 浏览器环境存在调度干扰

---

## 🎯 **实验完成总结 (2025-09-26)**

### ✅ **已实现的核心功能**

- **完整的实验框架**: 3个基准任务 × 2种语言 × 4种规模 = 24个测试配置
- **质量保证系统**: 449个跨语言验证向量，IQR质量控制，CV < 15%阈值
- **统计分析管道**: Welch's t检验，Cohen's d效应量，95%置信区间
- **自动化工作流**: 一键执行完整实验流程（构建→运行→QC→分析）
- **可视化系统**: 5种图表类型 + 交互式决策仪表板
- **重现性保证**: 环境指纹锁定，版本控制，确定性测试

### 📊 **实验数据规模**

- **测试向量**: 449个参考哈希（320个Mandelbrot，112个JSON，17个矩阵）
- **配置组合**: 24个（3任务 × 2语言 × 4规模）
- **质量标准**: CV < 15%, 样本量 ≥ 30, 成功率 ≥ 80%
- **统计功效**: Welch's t检验 + Cohen's d效应量分析

### 🔧 **技术实现亮点**

- **跨语言验证**: FNV-1a哈希确保实现一致性
- **质量门禁**: 自动化QC管道，异常值检测和数据验证
- **统计严谨性**: 适用于不等方差的Welch's t检验
- **可视化完整性**: 5图表类型支持全面性能分析
- **自动化程度**: 完整的CI/CD就绪实验管道

### 🎯 **实验价值**

- **科学严谨性**: 完整的统计方法论和质量控制
- **工程实用性**: 生产就绪的基准测试框架
- **可重现性**: 环境锁定和版本控制确保结果可靠
- **决策支持**: 基于统计证据的语言选择建议

## 核心自动化

• **`make build`** - 构建所有WASM模块（两种语言）
• **`make run`** - 执行综合基准测试
• **`make qc`** - 对结果运行质量控制分析
• **`make analyze`** - 生成统计分析和可视化
• **`make all`** - 完整实验工作流（构建 + 运行 + QC + 分析）

## 一键执行

```bash
# 完整实验工作流
make all

# 快速测试工作流
make all quick

# 单独组件
make build          # 构建所有WASM模块
make run             # 运行基准测试
make qc              # 质量控制检查
make analyze         # 统计分析

# 输出文件：
# - results/*.json              # 时间戳命名的原始基准数据
# - reports/plots/*.png         # 静态可视化图表
# - reports/plots/decision_summary.html  # 交互式分析仪表板
# - reports/qc/quality_control_report.json  # 质量控制报告
# - reports/statistics/          # 详细统计分析报告
```
