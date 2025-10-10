# WebAssembly Benchmark: Rust vs TinyGo Performance Comparison Study

> **Last Updated**: 2025-09-26  
> **Experiment Completion**: 449 reference test vectors, complete statistical analysis pipeline, automated quality control  

---

## Experiment Overview

### Experimental Environment

- **Hardware:** AWS EC2 c7g.2xlarge (4 CPU, 16GB RAM)
- **OS:** Ubuntu 22.04 (Linux/x86_64)
- **Browser:** Headless Chromium v140+ (Puppeteer 24.22.0)

**Language Toolchains:**

• **Rust** 1.90.0 (stable) targeting `wasm32-unknown-unknown`, using `#[no_mangle]` bare interface (zero-cost abstraction)
• **TinyGo** 0.39.0 + **Go** 1.25.1 targeting WebAssembly (`-target=wasm`)
• **Node.js** 24.7.0 LTS
• **Python** 3.11+ with scientific computing stack (NumPy 2.3.3+, SciPy 1.10.0+, Matplotlib 3.6.0+)

**Execution Framework and Scripts:**

• **Puppeteer:** Unified testing framework and benchmark execution, responsible for timing and memory collection, automated repeated execution, result persistence (JSON format)
• **Vitest + Node.js:** Comprehensive testing framework including unit, integration, and end-to-end test automation
• **Bash + Python + Make:** Automated build system, batch execution, data quality control, and statistical analysis pipeline

## Benchmark Tasks

Using 3 computational/data-intensive tasks uniformly, with Rust and TinyGo each implementing one version, same parameters for comparison:

1. **Mandelbrot Fractal** (CPU floating-point intensive) - 320 reference test vectors
2. **JSON Parsing** (structured data processing) - 112 reference test vectors
3. **Matrix Multiplication** (MatMul) (dense numerical computation) - 17 reference test vectors

Each task fixed: input scale (micro/small/medium/large), random seed, FNV-1a verification function (compute digest inside Wasm, only return u32 hash to JS, ensuring Rust/TinyGo return identical results for same task)

**Actual Implementation Scale Configuration:**

- **Mandelbrot**: micro(64×64, 100 iter), small(256×256, 500 iter), medium(512×512, 1000 iter), large(1024×1024, 2000 iter)
- **JSON Parsing**: micro(500 entries), small(5000 entries), medium(15000 entries), large(30000 entries)
- **Matrix Multiplication**: micro(64×64), small(256×256), medium(384×384), large(576×576)

## Key Metrics

**Memory Usage:** Chrome DevTools Protocol memory metrics, including JS heap usage.

**Quality Control:** Automated QC pipeline including IQR outlier detection (1.5×IQR threshold), coefficient of variation validation (CV < 15%), sample size validation (≥30 valid samples).

**Cross-language Validation:** FNV-1a hash algorithm ensures implementation consistency, 449 reference test vectors covering all tasks and scales.

```javascript
// Bare interface WebAssembly module loading
async function loadWasmModule(wasmPath) {
    const wasmBytes = await fs.readFile(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBytes);
    return wasmModule.instance;
}

async function benchmarkTask(taskName, wasmInstance, inputData) {
    // Warm-up and cleanup
    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));

    const memBefore = await page.metrics();

    // Prepare input data (write to Wasm memory)
    const dataPtr = wasmInstance.exports.alloc(inputData.byteLength);
    const wasmMemory = new Uint8Array(wasmInstance.exports.memory.buffer);
    wasmMemory.set(new Uint8Array(inputData), dataPtr);

    // Execute benchmark
    const timeBefore = performance.now();
    const hash = wasmInstance.exports.run_task(dataPtr);
    const timeAfter = performance.now();

    const memAfter = await page.metrics();

    return {
        task: taskName,
        execution_time_ms: timeAfter - timeBefore,
        memory_used_mb: (memAfter.JSHeapTotalSize - memBefore.JSHeapTotalSize) / 1024 / 1024,
        hash: hash >>> 0  // Ensure u32
    };
}
```

## Statistical Analysis

**Core Statistical Methods:**

- **Descriptive Statistics:** Mean, standard deviation, coefficient of variation, 95% confidence interval, median, interquartile range
- **Significance Testing:** Welch's t-test (for unequal variances, p < 0.05, more robust t-test)
- **Effect Size:** Cohen's d calculation (practical significance assessment)
  - |d| < 0.2: Negligible effect
  - 0.2 ≤ |d| < 0.5: Small effect
  - 0.5 ≤ |d| < 0.8: Medium effect
  - |d| ≥ 0.8: Large effect
- **Quality Control:** IQR outlier detection (1.5×IQR threshold), CV < 15% threshold, sample size ≥ 30

**Visualization:** Bar charts (mean + error bars + significance markers) + box plots (distribution + outliers) + effect size heatmap + variance analysis plots

## Success Criteria

**Data Completeness:**

- 3 tasks × 2 languages × 4 scales = 24 datasets (implemented)
- Each dataset ≥30 valid samples (after outlier removal)
- Coefficient of variation CV < 15% (stricter than traditional 20%)
- 449 cross-language validation test vectors (320 Mandelbrot, 112 JSON, 17 matrix)

**Statistical Requirements:**

- Basic descriptive statistics: mean, standard deviation, 95% CI, median, interquartile range
- Significance testing: Welch's t-test (p < 0.05, for unequal variances)
- Effect size: Cohen's d (practical significance assessment)
- Quality control: IQR outlier detection, CV validation, sample size validation

**Output Standards:**

- Statistical analysis report: `reports/plots/decision_summary.html` (interactive dashboard)
- Core charts: execution time comparison, memory usage comparison, effect size heatmap, distribution variance analysis
- Raw data: complete JSON format + quality control audit trail
- Automated quality gates: verify all quality standards via `make qc`

## Implementation Timeline (Completed - 2025 Experiment Cycle)

### ✅ Completed Phases (Early to Mid 2025)

- ✅ **Environment Configuration + Core Implementation** - Toolchain fixed, task implementation, build system complete
- ✅ **Quality Control + Data Collection Framework** - Complete QC system, cross-language validation, statistical analysis pipeline
- ✅ **Integration Testing + Analysis Enhancement** - End-to-end testing, advanced visualization, decision support system
- ✅ **Quality Gate System** - Automated quality check standards, complete validation framework

### 🎯 **Current Status**

- **Project Completion**: 99% - Production-ready benchmark framework
- **Core Functionality**: Complete experimental pipeline, fully automated from build to analysis
- **Quality Assurance**: Multi-level quality gate system ensuring result reliability and reproducibility
- **Documentation Completeness**: Comprehensive technical documentation and user guides

### 📊 **Experimental Results**

- **Data Scale**: 24 test configurations, 449 validation vectors
- **Statistical Rigor**: Welch's t-test, Cohen's d effect size, IQR quality control
- **Automation Level**: One-click execution of complete experimental workflow
- **Reproducibility**: Environment fingerprint locking, version control, deterministic testing

---

## Stage 1: Language Toolchain Installation and Locking

• Install and lock:

- **Rust 1.90.0** + `wasm32-unknown-unknown` target (no wasm-bindgen/wasm-pack needed)
- **Go 1.25.1** + **TinyGo 0.39.0**
- **Node.js 24.7.0 LTS**
- **Python 3.11+** + scientific computing libraries (NumPy 2.3.3, SciPy 1.10.0+, Matplotlib 3.6.0+)

• Install Chromium and headless runtime dependencies

• Install Wasm tools: Binaryen (`wasm-opt`), WABT (`wasm2wat`/`wasm-strip`)

• Generate tool fingerprint: Create `fingerprint.sh`, write all versions to `meta.json` and `versions.lock`, ensure reproducibility

---

## Stage 2: Project Structure

```text
wasm-benchmark/
├── analysis/                   # Statistical analysis modules
│   ├── common.py              # Shared utility functions
│   ├── statistics.py          # Statistical calculations
│   ├── qc.py                  # Quality control system
│   ├── plots.py               # Visualization generation
│   ├── decision.py            # Decision support analysis
│   ├── validation.py          # Cross-language validation
│   ├── data_models.py         # Data structure definitions
│   └── config_parser.py       # Configuration parsing
├── builds/                     # Build artifacts
│   ├── rust/                  # Rust WASM files
│   └── tinygo/                # TinyGo WASM files
├── configs/                    # Configuration files
├── data/reference_hashes/      # Reference hash values (449 validation vectors)
├── docs/                       # Project documentation
├── harness/web/                # Browser testing framework
├── scripts/                    # Build and automation scripts
│   ├── build_*.sh             # Build scripts
│   ├── run_bench.js           # Benchmark runner
│   ├── interfaces/            # Service interfaces
│   └── services/              # Service implementations
├── tasks/                      # Benchmark task implementations
│   ├── mandelbrot/            # Mandelbrot fractal computation
│   ├── json_parse/            # JSON parsing benchmark
│   └── matrix_mul/            # Matrix multiplication
├── tests/                     # Comprehensive test suite
├── results/                   # Experiment results storage
├── reports/                   # Generated reports and visualizations
│   ├── plots/                 # Chart outputs
│   ├── qc/                    # Quality control reports
│   └── statistics/            # Statistical analysis reports
├── pyproject.toml            # Python dependencies
├── package.json               # Node.js dependencies
├── Makefile                   # Automated builds and workflows
└── README.md                  # Project description
```

---

## Stage 3: Benchmark Task Design and Parameter Solidification (Task Design)

## 1) Global Conventions (Effective for All Tasks)

### Export Interface (Wasm Side)

**Rust Implementation (#[no_mangle] bare interface):**

```rust
#[no_mangle]
pub extern "C" fn init(seed: u32);
#[no_mangle]
pub extern "C" fn alloc(n_bytes: u32) -> u32;  // Return memory offset
#[no_mangle]
pub extern "C" fn run_task(params_ptr: u32) -> u32;  // Return hash value
```

**TinyGo Implementation (corresponding exports):**

```go
//export init
func init(seed uint32)
//export alloc
func alloc(nBytes uint32) uint32
//export run_task
func runTask(paramsPtr uint32) uint32  // Return hash value
```

• Both languages export memory, perform direct pointer operations

### Fixed Randomness

Using xorshift32 (Uint32), consistent cross-language implementation.

### FNV-1a Hash Verification Mechanism

• Use **FNV-1a hash algorithm** instead of simple summation: better distribution and collision resistance
• **Algorithm**: `hash = 2166136261; for each byte: hash ^= byte; hash *= 16777619`
• **Advantages**: Detects order differences, very low collision rate, avalanche effect, cross-language consistency
• `run_task` returns u32 hash value, ensuring algorithm implementation correctness verification
• **Unified Implementation**:

  ```c
  uint32_t hash = 2166136261;  // FNV offset basis
  for (each byte) {
      hash ^= byte;
      hash *= 16777619;        // FNV prime
  }
  return hash;
  ```

• For floating-point operations, normalize to fixed precision first (e.g., `round(x * 1e6)`) before hashing

### JS↔Wasm Round-trip Minimization

• JS side only: ① alloc+memcpy input once; ② init(seed) once; ③ multiple run_task() timing
• No cross-boundary read-back of large data, results returned only as u32 hash value

## Optimization Variants (Compilation and Post-processing)

### Rust (Bare Interface Configuration)

```toml
[lib]
crate-type = ["cdylib"]  # Generate dynamic library for WebAssembly

[profile.release]
opt-level = 3           # Highest optimization level
lto = "fat"             # Link-time optimization
codegen-units = 1       # Maximize inlining optimization
panic = "abort"         # No exception unwinding
strip = "debuginfo"     # Remove debug information

[dependencies]
# No external dependencies, pure manual implementation
```

Compile: `cargo build --target wasm32-unknown-unknown --release`
Post-process: `wasm-strip target/wasm32-unknown-unknown/release/*.wasm`

### TinyGo

Compile:

```bash
tinygo build -target=wasm \
  -opt=2 -panic=trap -no-debug -scheduler=none \
  -o out_tinygo_o2_minrt.wasm ./cmd/yourpkg
```

## Task 1: Mandelbrot (CPU Intensive / Floating-point)

**Purpose:** Test scalar floating-point loops and branches.

**Input** (Parameters written once from JS→Wasm, pixel buffer allocated inside Wasm):
• **Benchmark Parameters** (small/medium/large)

- S: 256×256, max_iter=500
- M: 512×512, max_iter=1000
- L: 1024×1024, max_iter=2000
• **Fixed Viewport:** center=(-0.743643887037, 0.131825904205); scale respectively 3.0/width

**Verification:** FNV-1a hash of iteration count sequence, cross-language result consistency.

**Note:** Only return hash value, no bitmap transmission back, reducing boundary transfer.

## Task 2: JSON Parsing (Structured Text → Structured Objects)

**Purpose:** Test text scanning, number parsing, object construction, and memory allocation.

**Input:** Normalized JSON (ASCII), an array:

```json
[
  {"id":0,"value":123456,"flag":true,"name":"a0"},
  {"id":1,"value":...,"flag":false,"name":"a1"},
  ...
]
```

• **Generation Rules** (String bytes generated once on JS side and written):

- No extra whitespace, field order fixed: id,value,flag,name
- id monotonically increasing; value generated by xorshift32 (take 31-bit non-negative)
- flag = (value & 1) == 0; name = "a" + id (ASCII)
• **Scales** (entry count, progressive GC triggering design)
- S: 6,000 (~300KB JSON + 600KB parsed objects = 900KB, **no GC trigger**)
- M: 20,000 (~1MB JSON + 2MB parsed objects = 3MB, **light GC trigger**)
- L: 50,000 (~2.5MB JSON + 5MB parsed objects = 7.5MB, **medium GC trigger**)

Estimated ~50 bytes per entry JSON + ~100 bytes parsed object, testing GC impact on small object allocation.

**Process** (Inside Wasm)

1. Parse JSON inside Wasm (hand-written micro parser or minimal dependencies), parse into temporary structures or aggregate while scanning
2. **Aggregation Metrics:**
   - sum_id (u64)
   - sum_value (u64)
   - cnt_true_flag (u32)
   - hash_name (FNV-1a hash of all name bytes)
3. FNV-1a hash the four aggregated values in order:

   ```c
   hash = 2166136261;  // FNV offset basis
   // Convert each u32 value to byte sequence and hash with FNV-1a
   hash = fnv1a_hash_u32(hash, sum_id);
   hash = fnv1a_hash_u32(hash, sum_value);
   hash = fnv1a_hash_u32(hash, cnt_true_flag);
   hash = fnv1a_hash_u32(hash, hash_name);
   return hash;
   ```

**Verification:** Only compare hash values; different parsing paths in two languages can still align.

## Task 3: Matrix Multiplication

**Purpose:** Test dense numerical computation, cache access.

**Data Type:** f32 (consistent across languages).

**Input:** Two matrices A, B (row-major, contiguous Float32Array), elements generated by xorshift32 and mapped to [0,1):

```text
val = (x >>> 0) * (1.0 / 4294967296.0)
```

**Scales** (N×N, progressive GC triggering design)
• S: 256 (768KB: A/B/C each 256KB = 768KB, **no GC trigger**)
• M: 384 (1.7MB: A/B/C each 576KB + computation temporaries ≈ 3MB, **light GC trigger**)
• L: 512 (3MB: A/B/C each 1MB + computation temporaries ≈ 8MB, **medium GC trigger**)

**Process** (Inside Wasm)

1. Read A,B, allocate C
2. Naive triple loop (i,j,k same order), ensure consistent floating-point rounding paths across languages
3. **Generate Digest:** Convert each C element to i32 via `round(x * 1e6)`, FNV-1a hash, return hash value

**Verification:** Hash values repeatable and cross-language consistent (same order + f32 + fixed precision).

## GC-Triggering-Oriented Test Scale Design Principles

**TinyGo GC Trigger Gradient Design**:

- **S (No GC Trigger)**: < 1MB memory usage, basically no GC impact, test pure computation performance differences
- **M (Light GC Trigger)**: 2-4MB memory usage, start having GC overhead, performance differences begin to appear
- **L (Medium GC Trigger)**: 6-10MB memory usage, GC overhead obvious, Rust zero-cost advantage prominent

**GC Pressure Characteristics per Task**:

- **JSON Parsing**: Massive small object allocation, test fine-grained GC overhead
- **Matrix Multiplication**: Large contiguous memory blocks, test GC impact on large object allocation
- **Mandelbrot**: Pure computation baseline, almost no memory allocation, minimal GC impact

**Experimental Position Confirmation**:

- **Goal**: Quantify "GC vs zero-cost abstraction" performance differences through progressive GC pressure
- **Method**: S scale establishes no-GC baseline, M/L scales progressively expose GC costs
- **Expected**: Minimal differences at S scale, differentiation begins at M scale, Rust advantage obvious at L scale

## Artifact Naming Convention

`{task}-{lang}-{opt}.wasm`

Examples (optimization level suffixes are determined by `configs/bench.yaml` configuration file):

- `mandelbrot-rust-o3.wasm` (Rust bare interface + O3 optimization, suffix from config)
- `mandelbrot-tinygo-o2.wasm` (TinyGo + O2 optimization, suffix from config)
- `json_parse-rust-o3.wasm`
- `json_parse-tinygo-o2.wasm`

**Build Directory Structure:**

```text
builds/
├─ rust/
│  ├─ mandelbrot-rust-o3.wasm  # Optimization level suffix (o3) read from config
│  ├─ json_parse-rust-o3.wasm
│  └─ matrix_mul-rust-o3.wasm
└─ tinygo/
   ├─ mandelbrot-tinygo-o2.wasm  # Optimization level suffix (o2) read from config
   ├─ json_parse-tinygo-o2.wasm
   └─ matrix_mul-tinygo-o2.wasm
```

## Fairness and Consistency Guidelines (Mandatory)

• **Same Algorithm Same Order:** Loop and comparison order for sorting/matrix multiplication kept consistent; Mandelbrot unified f64; MatMul unified f32
• **Zero External Dependencies:** Rust uses `#[no_mangle]` bare interface, TinyGo uses `//export`, no introduction of high-level libraries
• **Single-threaded / No SIMD:** This round baseline does not enable multi-threading or SIMD (can be extended experiments with separate variants, e.g., o3-simd)
• **Memory Management Strategy Explanation:**

- **Rust**: Zero-cost abstraction, compile-time memory management, no runtime GC overhead
- **TinyGo**: With garbage collector, has GC pauses and allocation overhead
- **Experimental Position**: Treat memory management differences as **language feature components**, do not attempt to eliminate, but distinguish "pure computation performance" vs "memory management overhead" impact in analysis
• **One-time Copy In:** All inputs written through alloc area once
• **Same Post-processing:** wasm-strip → wasm-opt -O*/-Oz → gzip

## Results and Exception Handling (Persistent Format Unchanged)

• `results/bench-*.ndjson` retains 100 samples per run in ms, plus hash (from returned u32)
• For failures (parsing errors, etc.), `run_task` can return fixed error code (e.g., `0xDEAD_xxxx`), JS side marks this sample as `ok:false` and counts in exception statistics (not included in mean)

---

## Stage 4: Data Collection and Quality Control

## 1. Data Collection Process

### 1. Initialize Test Environment

- Confirm hardware and software environment consistent with Stage 2 configuration
- Clean browser cache and Node.js temp files, ensure no residual state before testing
- Close background high-usage programs, reduce interference

### 2. Run Test Tasks

- Run 3 tasks defined in Stage 3 on browser side (Puppeteer-driven Headless Chrome)
- Each task executes 10 cold starts (first load timing) and 100 hot starts (repeated calls on loaded module)
- Each execution records raw metrics:
  - `execution_time_ms` (execution time, recorded by `performance.now()`)
  - `memory_usage_mb` (Chrome's `performance.memory` or equivalent Node monitoring)
- Puppeteer automatically outputs results of each run to JSON file, e.g.:

```json
{
  "task": "mandelbrot",
  "language": "rust",
  "run_type": "cold",
  "execution_time_ms": 123.45,
  "memory_usage_mb": 45.6,
}
```

### 3. Result File Storage

• Folder named by YYYYMMDD-HHMM timestamp for traceability
• Raw data saved in both CSV and JSON formats for subsequent analysis:

```text
/results/20250815/
  ├── raw_data.json
  ├── raw_data.csv
  ├── logs/
  └── screenshots/  # Optional for browser side only
```

## 2. Data Quality Control

**Goal:** Ensure data reliability

### Automated QC Checks

• **Numerical Validation:** Execution time > 0, memory usage in reasonable range
• **Outlier Detection:** IQR method, directly exclude beyond Q1-1.5×IQR or Q3+1.5×IQR
• **Repeatability Validation:** CV < 20%, otherwise mark as "needs retest"

### Data Aggregation

• Generate `final_dataset.csv`
• Calculate basic statistics: mean, standard deviation, coefficient of variation
• SHA256 checksum locks final dataset

## 3. Data Delivery

### Data Processing

- Process benchmark results through quality control pipeline
- Generate comprehensive statistical analysis reports
- Create visualization charts and graphics in `reports/plots/`
- Verify data integrity through automated QC checks

### Advanced Analysis

- Cross-language performance comparison
- Statistical significance testing
- Memory usage pattern analysis
- Binary size optimization analysis

---

## Stage 5: Statistical Analysis

## 1. Analysis Preparation

• **Data Source:** Result JSON files in `results/` directory
• **Analysis Environment:** Python 3.11+ with scientific computing stack
• **Analysis Modules:** `analysis/statistics.py`, `analysis/qc.py`, `analysis/plots.py`, `analysis/decision.py`, `analysis/validation.py`
• **Data Structure:** Structured JSON containing tasks, languages, execution metrics, and validation data

## 2. Core Statistical Analysis

### Basic Statistics Calculation

Calculate for each **task+language** combination:

- Mean, standard deviation, coefficient of variation
- 95% confidence interval
- Binary size compression ratio

### Significance Testing

- **Welch's t-test:** Robust t-test for unequal variances (p < 0.05, better suited for heteroscedasticity between languages)
- **Effect Size:** Cohen's d calculation
  - |d| < 0.2: Negligible effect
  - 0.2 ≤ |d| < 0.5: Small effect
  - 0.5 ≤ |d| < 0.8: Medium effect
  - |d| ≥ 0.8: Large effect

## 3. Visualization

### 5 Core Charts

1. **Execution Time Comparison Chart:** Mean comparison + error bars + significance markers
   - X-axis: Task type, Y-axis: Execution time (ms)
   - Grouped: Rust vs TinyGo, faceted by scale

2. **Memory Usage Comparison Chart:** Memory consumption pattern analysis
   - Show GC impact and memory management differences

3. **Effect Size Heatmap:** Cohen's d visualization
   - Color-coded significance levels and effect sizes

4. **Distribution Variance Analysis Chart:** Box plots + distribution comparison
   - Show median, interquartile range, outliers, and variance patterns

5. **Decision Analysis Dashboard:** Interactive HTML report
   - Comprehensive all analysis results and decision recommendations

**Output Format:** PNG (static charts) + HTML (interactive dashboard) output to `/reports/plots/`

## 4. Analysis Outputs

### Automatically Generated Outputs

- **Quality Control Report:** `reports/qc/quality_control_report.json` (automated QC analysis)
- **Statistical Analysis Report:** `reports/statistics/` (complete statistical analysis)
- **Visualization Charts:** `reports/plots/*.png` + `decision_summary.html` (for publication)
- **Data Validation Logs:** Complete quality control audit trail and cross-language validation

---

## Stage 6: Result Analysis and Conclusions

## Result Summary

• Summarize performance comparison results per task
• Analyze possible causes of performance differences (GC overhead, memory management, instruction optimization)
• Provide application scenario recommendations combining binary size

## Experimental Limitations

• **Environment Limitations:** Single-machine Chrome environment, limited result applicability
• **Task Scope:** 3 benchmark tasks, limited representativeness
• **Measurement Precision:** Browser environment has scheduling interference

---

## 🎯 **Experiment Completion Summary (2025-09-26)**

### ✅ **Implemented Core Features**

- **Complete Experimental Framework**: 3 benchmark tasks × 2 languages × 4 scales = 24 test configurations
- **Quality Assurance System**: 449 cross-language validation vectors, IQR quality control, CV < 15% threshold
- **Statistical Analysis Pipeline**: Welch's t-test, Cohen's d effect size, 95% confidence intervals
- **Automated Workflow**: One-click execution of complete experimental workflow (build→run→QC→analysis)
- **Visualization System**: 5 chart types + interactive decision dashboard
- **Reproducibility Guarantee**: Environment fingerprint locking, version control, deterministic testing

### 📊 **Experimental Data Scale**

- **Test Vectors**: 449 reference hashes (320 Mandelbrot, 112 JSON, 17 matrix)
- **Configuration Combinations**: 24 (3 tasks × 2 languages × 4 scales)
- **Quality Standards**: CV < 15%, sample size ≥ 30, success rate ≥ 80%
- **Statistical Power**: Welch's t-test + Cohen's d effect size analysis

### 🔧 **Technical Implementation Highlights**

- **Cross-language Validation**: FNV-1a hash ensures implementation consistency
- **Quality Gates**: Automated QC pipeline, outlier detection, and data validation
- **Statistical Rigor**: Welch's t-test suitable for unequal variances
- **Visualization Completeness**: 5 chart types supporting comprehensive performance analysis
- **Automation Level**: Complete CI/CD-ready experimental pipeline

### 🎯 **Experimental Value**

- **Scientific Rigor**: Complete statistical methodology and quality control
- **Engineering Practicality**: Production-ready benchmark framework
- **Reproducibility**: Environment locking and version control ensure reliable results
- **Decision Support**: Language selection recommendations based on statistical evidence

## Core Automation

• **`make build`** - Build all WASM modules (both languages)
• **`make run`** - Execute comprehensive benchmarks
• **`make qc`** - Run quality control analysis on results
• **`make analyze`** - Generate statistical analysis and visualizations
• **`make all`** - Complete experimental workflow (build + run + QC + analysis)

## One-click Execution

```bash
# Complete experimental workflow
make all

# Quick test workflow
make all quick

# Individual components
make build          # Build all WASM modules
make run            # Run benchmarks
make qc             # Quality control checks
make analyze        # Statistical analysis

# Output files:
# - results/*.json              # Timestamp-named raw benchmark data
# - reports/plots/*.png         # Static visualization charts
# - reports/plots/decision_summary.html  # Interactive analysis dashboard
# - reports/qc/quality_control_report.json  # Quality control report
# - reports/statistics/          # Detailed statistical analysis reports
```
