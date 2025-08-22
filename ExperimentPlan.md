# Evaluating the Efficiency of Golang and Rust in WebAssembly

## Overview

**实验环境**

**硬件：** MacBook Pro M4 10Core CPU 16GB RAM
**操作系统：** macOS 15.x
**浏览器：** Headless Chromium（由 Puppeteer 驱动）

**语言工具链：**

• **Rust** 1.84+ (latest stable) 目标 `wasm32-unknown-unknown`，使用 `#[no_mangle]` 裸接口（零开销）
• **TinyGo** 0.34+ (latest stable) + **Go** 1.23+ 目标 WebAssembly（`-target wasm`）
• **Node.js** 22 LTS
• **Python** 3.12+

**运行支架与脚本：**

• **Puppeteer：** 统一加载器与基准页，负责计时与内存采集、重复执行、结果落盘（JSON/CSV）  
• **Bash + Python：** 一键构建、批量执行、数据清理与统计制图

## 评测任务

统一使用 5 个计算/数据密集任务，Rust 与 TinyGo 各实现一份，同参对照：

1. **Mandelbrot**（CPU 浮点密集）
2. **Array Sort**（整数或浮点，固定分布与随机种子）
3. **Base64 编解码**（字节处理）
4. **JSON 解析**（结构化数据）
5. **矩阵乘法**（MatMul）（整数/浮点可选，固定维度）

每个任务固定：输入规模（小 中 大）、随机种子、校验函数（在 Wasm 内部计算摘要（hash/校验），只把小结果返回给 JS，确保 Go Rust 在同一任务重返回结果完全一致）

## 主要指标

**执行时间：** 统计每次纯函数执行时间（使用浏览器 `performance.now()`，取差值）。每个任务×语言×优化档位，预热（warmup）10次（丢弃），随后记录（measure）100次（确保统计可靠性）。

**内存占用与执行时间测量** 示例代码：

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

**产物体积：**
1. 原始 `.wasm` 大小
2. 压缩（gzip）大小（模拟网络传输成本）

## 统计分析

**描述统计：** 均值、标准差、方差、95% 置信区间；绘制箱线图/条形图（均值+误差线）。

## 成功判据

**数据完备：** 5 个任务在 Rust 与 TinyGo 上均产出 ≥90 条有效样本（热启动100次，排除异常值后保留≥90）  
**统计结果：** 每个任务至少完成一组语言间显著性对比与效应量报告  
**报告产出：** `analysis/`

---

# Stage 2：语言工具链安装与固定

• 安装并固定：
  - **Rust 1.84+** + `wasm32-unknown-unknown` 目标（无需 wasm-bindgen/wasm-pack）
  - **Go 1.23+** + **TinyGo 0.34+**
  - **Node.js 22 LTS**
  - **Python 3.12+** + 科学计算库（numpy 2.0+, scipy 1.14+, pandas 2.2+, matplotlib 3.9+, seaborn 0.13+）

• 安装 Chromium 与无头运行依赖

• 安装 Wasm 工具：Binaryen（`wasm-opt`）、WABT（`wasm2wat`/`wasm-strip`）

• 产出工具指纹：创建 `fingerprint.sh`，把所有版本写入 `results/meta.json` 和 `versions.lock.txt`，确保可复现

---

# Stage 3：项目与仓库结构搭建

```
~/wasm-benchmark/
├─ configs/
│  ├─ bench.yaml                 # 任务/规模/重复次数/优化开关
│  └─ versions.lock              # 固定工具链版本
├─ harness/
│  └─ web/
│     ├─ bench.html              # 基准页（Puppeteer 加载）
│     ├─ bench.js                # ESM：加载 .wasm、计时/内存采集
│     └─ wasm_loader.js          # WebAssembly 模块加载器
├─ scripts/
│  ├─ build_rust.sh             # Rust 构建脚本
│  ├─ build_tinygo.sh           # TinyGo 构建脚本
│  ├─ build_all.sh              # 一键构建所有任务
│  ├─ run_browser_bench.js      # Puppeteer 驱动器
│  ├─ fingerprint.sh            # 环境指纹生成
│  └─ all_in_one.sh             # 完整实验流程
├─ tasks/
│  ├─ mandelbrot/
│  │  ├─ rust/                  # Rust 实现
│  │  │  ├─ Cargo.toml
│  │  │  └─ src/lib.rs
│  │  └─ tinygo/                # TinyGo 实现
│  │     └─ main.go
│  ├─ array_sort/               # 同上结构
│  ├─ base64/                   # 同上结构
│  ├─ json_parse/               # 同上结构
│  └─ matrix_mul/               # 同上结构
├─ builds/
│  ├─ rust/                     # Rust 产物
│  ├─ tinygo/                   # TinyGo 产物
│  ├─ checksums.txt             # SHA256 校验和
│  └─ sizes.csv                 # 二进制大小统计
├─ results/
│  ├─ 20250821-1430/            # 时间戳目录
│  │  ├─ raw_data.csv           # 原始数据
│  │  ├─ raw_data.json          # JSON 格式
│  │  ├─ final_dataset.csv      # QC 后数据
│  │  ├─ qc_report.txt          # 质量控制报告
│  │  └─ logs/                  # 运行日志
│  └─ meta.json                 # 实验元数据
├─ analysis/
│  ├─ statistics.py             # 统计分析脚本
│  ├─ plots.py                  # 可视化脚本
│  ├─ report.md                 # 分析报告
│  ├─ figures/                  # 图表输出
│  │  ├─ *.png                  # 论文用图
│  │  └─ *.svg                  # 高清矢量图
│  └─ analysis_log.txt          # 分析日志
├─ docs/                        # 文档目录
│  ├─ ExperimentPlan.md         # 实验计划
│  └─ README.md                 # 项目说明
├─ .venv/                       # Python 虚拟环境
├─ requirements.txt             # Python 依赖
├─ package.json                 # Node.js 依赖
└─ Makefile                     # 自动化构建
```

---

# Stage 4：基准任务设计与参数固化（Task Design）

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

### 多项式滚动哈希校验机制
• 使用**多项式滚动哈希**替代简单累加：`hash = (hash * 31 + value) & 0xFFFFFFFF`
• **优势**：检测顺序差异、低冲突率、实现简单、跨语言一致
• `run_task` 返回 u32 哈希值，确保算法实现的正确性验证
• **统一实现**：
  ```c
  uint32_t hash = 0;
  for (each value) {
      hash = (hash * 31 + value) & 0xFFFFFFFF;
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
  -opt=3 -panic=trap -no-debug -scheduler=none \
  -o out_tinygo_o3_minrt.wasm ./cmd/yourpkg
```

## 任务一：Mandelbrot（CPU 密集 / 浮点）

**目的：** 测试标量浮点循环与分支。

**输入**（通过 JS→Wasm 一次性写入的是参数区，像素缓冲在 Wasm 内部分配）：
• **基准参数**（小/中/大）
  - S：256×256，max_iter=500
  - M：512×512，max_iter=1000
  - L：1024×1024，max_iter=2000
• **固定视区：** center=(-0.743643887037, 0.131825904205)；scale 分别为 3.0/宽度

**校验：** 对迭代次数序列进行多项式滚动哈希，跨语言结果一致。

**备注：** 仅返回哈希值，不回传位图，减少边界传输。

## 任务二：数组快速排序

**目的：** 测试整数比较、内存访问与原地修改算法。

**输入：** 长度为 N 的 int32 数组（JS 以 xorshift32 生成 → alloc 区一次性写入）。

**规模**（渐进式GC触发设计）
• S：200,000（800KB，**不触发GC**）
• M：800,000（3.2MB，**轻度触发GC**）
• L：2,000,000（8MB，**中度触发GC**）

**过程**（Wasm 内）
1. 将输入缓冲视为 i32 切片
2. **标准三路快排**（Dijkstra 3-way quicksort）：
   - 相同的分区策略：`< pivot | = pivot | > pivot`
   - 相同的基准选择：median-of-three
   - 相同的递归终止条件：长度 ≤ 16 时切换到插入排序
3. 对排序后数组进行多项式滚动哈希：`hash = (hash * 31 + element) & 0xFFFFFFFF`，返回哈希值

**注**：原地排序算法，内存分配主要来自输入数据本身，GC压力来自数据规模

## 任务三：Base64 编解码

**目的：** 测试字节处理与表驱动、分支。

**输入：** 长度为 N 的随机字节（xorshift32 生成，取低 8 位）。

**规模**（渐进式GC触发设计）
• S：300 KiB（编码后400KB + 解码300KB = 1MB，**不触发GC**）
• M：900 KiB（编码后1.2MB + 解码900KB = 3MB，**轻度触发GC**）
• L：2.4 MiB（编码后3.2MB + 解码2.4MB = 8MB，**中度触发GC**）

**过程**（Wasm 内）
1. **编码：** bytes → base64（标准表，\r\n 禁用，纯一行）
2. **解码：** base64 → bytes2
3. **校验：** 比较 bytes2 与原始 bytes（若不等直接返回特定错误码，例如 `0xDEAD_B64`）
4. 对 bytes2 所有字节进行多项式滚动哈希，返回哈希值

**备注：** 全流程在 Wasm 内完成；JS 不参与字符串构造或比较。

## 任务四：JSON 解析（结构化文本 → 结构化对象）

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
   - hash_name（对所有 name 字节进行多项式滚动哈希）
3. 将四个聚合值按顺序进行多项式滚动哈希：
   ```c
   hash = 0;
   hash = (hash * 31 + (sum_id & 0xFFFFFFFF)) & 0xFFFFFFFF;
   hash = (hash * 31 + (sum_value & 0xFFFFFFFF)) & 0xFFFFFFFF;
   hash = (hash * 31 + cnt_true_flag) & 0xFFFFFFFF;
   hash = (hash * 31 + hash_name) & 0xFFFFFFFF;
   return hash;
   ```

**校验：** 只比对哈希值即可；两语言解析路径不同也能对齐。

## 任务五：矩阵乘法

**目的：** 测试密集型数值计算、缓存访问。

**数据类型：** f32（两语言一致）。

**输入：** 两矩阵 A, B（行主序，连续 Float32Array），元素由 xorshift32 生成并映射到 [0,1)：
```
val = (x >>> 0) * (1.0 / 4294967296.0)
```

**规模**（N×N，渐进式GC触发设计）
• S：256（768KB：A/B/C 各256KB = 768KB，**不触发GC**）
• M：384（1.7MB：A/B/C 各576KB + 计算临时变量 ≈ 3MB，**轻度触发GC**）
• L：512（3MB：A/B/C 各1MB + 计算临时变量 ≈ 8MB，**中度触发GC**）

**过程**（Wasm 内）
1. 读取 A,B，分配 C
2. 朴素三重循环（i,j,k 同序），保证不同语言浮点舍入路径一致
3. **生成摘要：** 将 C 每个元素按 `round(x * 1e6)` 转为 i32，进行多项式滚动哈希，返回哈希值

**校验：** 哈希值可重复且跨语言一致（同序 + f32 + 固定精度）。

## GC触发导向的测试规模设计原则

**TinyGo GC触发梯度设计**：
- **S（不触发GC）**：< 1MB内存使用，基本无GC影响，测试纯计算性能差异
- **M（轻度触发GC）**：2-4MB内存使用，开始有GC开销，性能差异开始显现
- **L（中度触发GC）**：6-10MB内存使用，GC开销明显，Rust零成本优势突出

**各任务GC压力特点**：
- **快速排序**：原地算法，主要压力来自输入数据规模
- **Base64**：字符串分配，测试连续内存分配的GC影响
- **JSON解析**：大量小对象分配，测试细粒度GC开销
- **矩阵乘法**：大块连续内存，测试大对象分配的GC影响
- **Mandelbrot**：纯计算基线，几乎无内存分配，GC影响最小

**实验立场确认**：
- **目标**：通过渐进式GC压力量化"GC vs 零成本抽象"的性能差异
- **方法**：S规模建立无GC基线，M/L规模逐步暴露GC成本
- **预期**：S规模差异最小，M规模开始分化，L规模Rust优势明显

## 产物命名规范
`{task}-{lang}-{opt}.wasm`

例：
- `array_sort-rust-o3.wasm`（Rust 裸接口 + O3 优化）
- `array_sort-tinygo-oz.wasm`（TinyGo + Oz 优化）
- `mandelbrot-rust-o3.wasm`
- `mandelbrot-tinygo-oz.wasm`

**构建目录结构：**
```
builds/
├─ rust/
│  ├─ mandelbrot-rust-o3.wasm
│  ├─ array_sort-rust-o3.wasm
│  └─ ...
└─ tinygo/
   ├─ mandelbrot-tinygo-oz.wasm
   ├─ array_sort-tinygo-oz.wasm
   └─ ...
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
• 对于失败（解析错误、Base64 对比失败等），`run_task` 可返回固定错误码（如 `0xDEAD_xxxx`），JS 端把这次样本标记为 `ok:false` 并计入异常统计（不纳入均值）
• 二进制大小来自 `*.manifest.json`（raw/opt/gz）

---

# Stage 5：数据采集与质量控制（Run & Collect）

## 1. 数据采集流程

### 1. 初始化测试环境
- 确认硬件与软件环境与 Stage 2 配置一致
- 清理浏览器缓存及 Node.js 临时文件，确保测试前无残留状态
- 关闭后台高占用程序，减少干扰

### 2. 运行测试任务
- 在浏览器端（Puppeteer 驱动 Headless Chrome）Stage 4 中定义的 5 个任务
- 每个任务执行 10 次冷启动（首次加载计时）与 100 次热启动（已加载模块重复调用计时）
- 每次执行记录以下原始指标：
  - `execution_time_ms`（执行时间，`performance.now()` 记录）
  - `memory_usage_mb`（Chrome 的 `performance.memory` 或等效 Node 监控）
  - `binary_size_raw_kb` 与 `binary_size_gzip_kb`（从构建输出直接读取）
- Puppeteer 自动将每次运行的结果输出到 JSON 文件，如：

```json
{
  "task": "mandelbrot",
  "language": "rust",
  "run_type": "cold",
  "execution_time_ms": 123.45,
  "memory_usage_mb": 45.6,
  "binary_size_raw_kb": 203,
  "binary_size_gzip_kb": 89
}
```

### 3. 结果文件存储
• 按 YYYYMMDD-HHMM 时间戳命名文件夹，保证可追溯性
• 原始数据保存为 CSV 与 JSON 两种格式，方便后续分析：

```
/results/20250815/
  ├── raw_data.json
  ├── raw_data.csv
  ├── logs/
  └── screenshots/  # 仅浏览器端可选
```

## 2. 数据质量控制（QC）

**目标：** 确保数据的可靠性与可重复性

### 自动化 QC 检查
• **格式验证：** 所有记录必须包含 task、language、run_type、execution_time_ms、binary_size_raw_kb 字段
• **数值范围检查：** 例如，执行时间不能为负数，内存使用不能超过系统物理限制
• **异常值检测（IQR方法）：**
  - 计算第一四分位数(Q1)和第三四分位数(Q3)，IQR = Q3 - Q1
  - 异常值定义：数值 < Q1 - 1.5×IQR 或 数值 > Q3 + 1.5×IQR
  - 对于严重异常值：数值 < Q1 - 3×IQR 或 数值 > Q3 + 3×IQR，直接剔除
  - 轻微异常值（1.5×IQR到3×IQR之间）标记但保留，用于分析噪声水平
  - 所有异常值记录到 `qc_report.log`，包含原始值、异常程度、run_id

### 重复性验证
• 对比 100 次热启动运行的标准差，如果单个任务单语言的变异系数（CV = σ / μ）超过 15%，自动标记为"需复测"
• 若复测后仍超标，则记录在实验限制说明中，并分析可能的系统性噪声源

## 3. 数据汇总与交付

### 1. 合并多轮测试结果
- 使用 Python 脚本合并多批 JSON/CSV，生成统一的 `final_dataset.csv`
- 为每个任务+语言组合计算：
  - 平均执行时间（mean）
  - 标准差（std_dev）
  - 峰值内存（peak_mem）
  - 平均与压缩后二进制大小

### 2. 生成可视化预览
- 自动绘制执行时间、内存使用、二进制大小的柱状图、箱型图、散点/蜂群图，用于初步分析

### 3. 数据锁定
- 一旦数据通过 QC，生成 checksum 文件（SHA256），保证后续分析使用的就是这一版数据

---

# Stage 6：度量与统计分析

## 1. 分析输入与准备
• **数据来源：** 上一个 Stage 最终通过 QC 的 `final_dataset.csv` 与 `system_stats.log`
• **分析环境：**
  - Python 3（使用 pandas、numpy、scipy、matplotlib、seaborn）
  - 数据可视化要求保证 PNG 与 SVG 双版本输出
  - 运行环境必须与数据采集阶段一致，避免版本差异造成计算误差
• **数据结构：**
  - 每行包含：task、language、run_type、execution_time_ms、memory_usage_mb、binary_size_raw_kb、binary_size_gzip_kb

## 2. 指标计算（Metrics Calculation）
对每个 **任务（task）** + **语言（language）** + **run_type** 组合，计算：
1. 均值
2. 标准差
3. 方差
4. Confidence Interval
5. **二进制体积：** 计算均值、标准差、压缩率

## 3. 显著性检验（Significance Testing）

### 1. 正态性检验（Shapiro–Wilk）
- 对每个语言的执行时间与内存数据进行检验
- H₀：样本来自正态分布
- p ≥ 0.05 → 认为符合正态分布
- p < 0.05 → 拒绝正态性假设

### 2. 差异显著性检验
- 若两组均正态 → 使用 **独立样本 t 检验**（Independent t-test）
- 若至少一组不正态 → 使用 **Mann–Whitney U 检验**（非参数）
- 原始显著性水平 α = 0.05

### 2.1 多重比较校正（必须）
**问题**：5任务 × 3规模 × 2指标（执行时间、内存）= **30个假设检验**，需校正假阳性率

**方法**：**Benjamini-Hochberg FDR 校正**
- 将所有30个p值从小到大排序：p₁ ≤ p₂ ≤ ... ≤ p₃₀  
- 寻找最大的i使得：pᵢ ≤ (i/30) × 0.05
- 拒绝H₀对应p₁, p₂, ..., pᵢ
- **控制假发现率（FDR）≤ 5%**

**报告格式**：同时报告原始p值和校正后的判定结果

### 3. 效应量（Cohen's d）

公式：**d = (μ₁ - μ₂) / sₚ**

• sₚ（pooled standard deviation）按两组数据加权计算
• **解释：**
  - 0.2 ≤ d < 0.5 → 小效应
  - 0.5 ≤ d < 0.8 → 中效应
  - d ≥ 0.8 → 大效应

## 4. 可视化（Visualization）
所有图表同时导出 **PNG**（论文插图用） 与 **SVG**（高清可缩放） 格式。

### 1. 条形图（Bar Chart）
- X 轴：任务类型（task）
- Y 轴：均值（execution_time_ms / memory_usage_mb / binary_size_kb）
- 分组：语言（Go / Rust）
- 误差线：±标准差或 95% CI

### 2. 箱线图（Box Plot）
- 显示分布的中位数、四分位距、异常值
- 每个任务一个子图，语言分颜色

### 3. 散点/蜂群图（Scatter / Swarm Plot）
- 每个点代表一次重复实验结果
- 任务 + 语言组合作为 X 轴，执行时间/内存作为 Y 轴
- 可用透明度（alpha）防止点重叠

### 4. 压缩率对比图
- Y 轴：压缩率（gzip/raw）
- 直观比较不同语言的 Wasm 模块压缩效率

## 5. 分析产出（Deliverables）
运行分析脚本后，自动生成：

### 1. Markdown 报告文件 `/analysis/report.md`：
- 含统计表格（均值、std、方差、CI、p 值、效应量）
- 文字解释显著性检验结果（包括正态性结果）
- 每个任务的分析小结

### 2. 图表文件：
- `/analysis/figures/*.png`
- `/analysis/figures/*.svg`

### 3. 分析日志：
- `/analysis/analysis_log.txt`
记录数据处理过程、丢弃的异常值、使用的统计方法

### 4. 可选输出（供论文附录用）：
- 完整原始数据副本（QC 后）
- Python 脚本与依赖环境说明

---

# Stage 7：结果汇编与结论

• 汇总每任务赢家/劣势点，解释可能原因（GC/所有权、ABI/FFI、边界开销、指令选择）
• 结合体积与下载/冷启动影响，给出"不同应用场景"的选择建议
• 局限性与威胁：16GB RAM 限制、浏览器差异、单机单核调度干扰等

## 局限性与威胁分析

### 硬件限制（16GB RAM）
在数据采集过程中，超大数据集测试（如矩阵乘法 1024×1024）可能占用较多内存，需监控内存使用避免交换。

### 浏览器差异
虽然主要使用 Chrome（`performance.now` + `performance.memory`），但不同浏览器的 Wasm 引擎（V8、SpiderMonkey、JavaScriptCore）对执行速度与内存分配策略存在差异，限制结果的跨浏览器适用性。

### 单机调度干扰
实验运行在单机单进程条件下，若系统后台任务抢占 CPU，可能导致执行时间出现偶发性异常；虽然 Stage 5 采用了异常值剔除，但仍存在测量噪声风险。

### Wasm 单线程约束
当前测试任务运行在单线程 Wasm 环境，多核并行优势未被验证，因此结果对未来支持多线程的 Wasm 环境可能不完全适用。

### 任务选择范围有限
本研究的 5 个任务虽涵盖计算、数据处理、内存管理等典型场景，但不能完全代表所有实际 WebAssembly 应用类型。

配一张 **"任务-语言优势矩阵图"**（5 个任务 × 3 个指标 × 两种语言的颜色标记），这会让结论更直观

---

# Stage 8 [Optional]：Automation

• **Makefile 目标：** `make init`（安装依赖）、`make build`、`make run`、`make collect`、`make analyze`、`make report`
• **单命令复现实验：** `scripts/all_in_one.sh`（从构建到报告）
• **结果打包：** `results/` 与 `analysis/` 压缩归档，生成 README（包含运行命令与期望产物）

## Makefile 目标

**约定：** 所有命令幂等、支持 `VERBOSE=1` 与 `DRYRUN=1`。失败时以非零退出码并写入 `logs/`。

• **`make init`**
  - **目的：** 初始化/检查运行环境（语言工具链、Node、Python）、创建虚拟环境、安装依赖、写入版本锁定、拉起 headless 浏览器依赖
  - **产出：** `.venv/`、`config/versions.lock`、`logs/init_*.log`

• **`make build`**
  - **目的：** 构建 Rust 与 Go 的五个 Wasm 任务（Release），同时产出 raw_size 与 gzip_size
  - **产出：** `wasm/build/` 下 `.wasm`、`.map`、`sizes.csv`、`checksums.txt`（SHA256）

• **`make run`**
  - **目的：** 按 `config/bench.yml` 执行浏览器端与 Node 端基准（含冷/热）。可选 `BACKEND=browser|node|both`
  - **产出：** `results/<timestamp>/raw/*.json` 与对应 `logs/`

• **`make collect`**
  - **目的：** 格式校验、异常值标记、合并多轮结果、生成 `final_dataset.csv`、系统状态记录
  - **产出：** `results/<timestamp>/final_dataset.csv`、`qc_report.txt`、`system_stats.log`、`checksums.txt`

• **`make analyze`**
  - **目的：** 计算均值/标准差/方差/95%CI，正态性检验、t/Mann–Whitney、Cohen