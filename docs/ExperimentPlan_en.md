# Evaluating the Efficiency of Golang and Rust in WebAssembly

## Overview

**Experimental Environment**

**Hardware:** MacBook Pro M4 10Core CPU 16GB RAM
**Operating System:** macOS 15.x
**Browser:** Headless Chromium (driven by Puppeteer)

**Language Toolchains:**

• **Rust** 1.84+ (latest stable) targeting `wasm32-unknown-unknown`, using `#[no_mangle]` bare interface (zero overhead)
• **TinyGo** 0.34+ (latest stable) + **Go** 1.23+ targeting WebAssembly (`-target wasm`)
• **Node.js** 22 LTS
• **Python** 3.12+

**Runtime Framework & Scripts:**

• **Puppeteer:** Unified loader and benchmark page, responsible for timing & memory collection, repeated execution, result persistence (JSON/CSV)  
• **Bash + Python:** One-click build, batch execution, data cleaning and statistical plotting

## Evaluation Tasks

Using 5 compute/data-intensive tasks uniformly, with Rust and TinyGo each implementing one version, same-parameter comparison:

1. **Mandelbrot** (CPU floating-point intensive)
2. **Array Sort** (integer or floating-point, fixed distribution and random seed)
3. **Base64 Encoding/Decoding** (byte processing)
4. **JSON Parsing** (structured data)
5. **Matrix Multiplication** (MatMul) (integer/floating-point optional, fixed dimensions)

Each task fixed: input scale (small, medium, large), random seed, verification function (calculate digest/hash inside Wasm, only return small result to JS, ensuring Go Rust return completely identical results for the same task)

## Key Metrics

**Execution Time:** Statistics for each pure function execution time (using browser `performance.now()`, taking difference). For each task×language×optimization level, warmup 10 times (discard), then record (measure) 100 times (ensuring statistical reliability).

**Memory Usage & Execution Time Measurement** sample code:

```javascript
// Bare interface WebAssembly module loading
async function loadWasmModule(wasmPath) {
    const wasmBytes = await fs.readFile(wasmPath);
    const wasmModule = await WebAssembly.instantiate(wasmBytes);
    return wasmModule.instance;
}

async function benchmarkTask(taskName, wasmInstance, inputData) {
    // Warmup and cleanup
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
        hash: hash >>> 0  // ensure u32
    };
}
```

**Binary Size:**
1. Raw `.wasm` size
2. Compressed (gzip) size (simulating network transmission cost)

## Statistical Analysis

**Descriptive Statistics:** Mean, standard deviation, variance, 95% confidence interval; draw box plots/bar charts (mean + error bars).

## Success Criteria

**Data Completeness:** 5 tasks on both Rust and TinyGo produce ≥90 valid samples (100 hot starts, retain ≥90 after excluding outliers)  
**Statistical Results:** Each task completes at least one set of inter-language significance comparison and effect size report  
**Report Output:** `analysis/`

---

# Stage 2: Language Toolchain Installation & Fixing

• Install and fix:
  - **Rust 1.84+** + `wasm32-unknown-unknown` target (no need for wasm-bindgen/wasm-pack)
  - **Go 1.23+** + **TinyGo 0.34+**
  - **Node.js 22 LTS**
  - **Python 3.12+** + scientific computing libraries (numpy 2.0+, scipy 1.14+, pandas 2.2+, matplotlib 3.9+, seaborn 0.13+)

• Install Chromium and headless runtime dependencies

• Install Wasm tools: Binaryen (`wasm-opt`), WABT (`wasm2wat`/`wasm-strip`)

• Generate tool fingerprint: create `fingerprint.sh`, write all versions to `results/meta.json` and `versions.lock.txt`, ensuring reproducibility

---

# Stage 3: Project & Repository Structure Setup

```
~/wasm-benchmark/
├─ configs/
│  ├─ bench.yaml                 # Task/scale/repeat count/optimization switches
│  └─ versions.lock              # Fixed toolchain versions
├─ harness/
│  └─ web/
│     ├─ bench.html              # Benchmark page (Puppeteer loading)
│     ├─ bench.js                # ESM: load .wasm, timing/memory collection
│     └─ wasm_loader.js          # WebAssembly module loader
├─ scripts/
│  ├─ build_rust.sh             # Rust build script
│  ├─ build_tinygo.sh           # TinyGo build script
│  ├─ build_all.sh              # One-click build all tasks
│  ├─ run_browser_bench.js      # Puppeteer driver
│  ├─ fingerprint.sh            # Environment fingerprint generation
│  └─ all_in_one.sh             # Complete experiment pipeline
├─ tasks/
│  ├─ mandelbrot/
│  │  ├─ rust/                  # Rust implementation
│  │  │  ├─ Cargo.toml
│  │  │  └─ src/lib.rs
│  │  └─ tinygo/                # TinyGo implementation
│  │     └─ main.go
│  ├─ array_sort/               # Same structure as above
│  ├─ base64/                   # Same structure as above
│  ├─ json_parse/               # Same structure as above
│  └─ matrix_mul/               # Same structure as above
├─ builds/
│  ├─ rust/                     # Rust artifacts
│  ├─ tinygo/                   # TinyGo artifacts
│  ├─ checksums.txt             # SHA256 checksums
│  └─ sizes.csv                 # Binary size statistics
├─ results/
│  ├─ 20250821-1430/            # Timestamp directory
│  │  ├─ raw_data.csv           # Raw data
│  │  ├─ raw_data.json          # JSON format
│  │  ├─ final_dataset.csv      # Post-QC data
│  │  ├─ qc_report.txt          # Quality control report
│  │  └─ logs/                  # Runtime logs
│  └─ meta.json                 # Experiment metadata
├─ analysis/
│  ├─ statistics.py             # Statistical analysis script
│  ├─ plots.py                  # Visualization script
│  ├─ report.md                 # Analysis report
│  ├─ figures/                  # Chart output
│  │  ├─ *.png                  # Paper figures
│  │  └─ *.svg                  # High-resolution vector graphics
│  └─ analysis_log.txt          # Analysis logs
├─ docs/                        # Documentation directory
│  ├─ ExperimentPlan.md         # Experiment plan
│  └─ README.md                 # Project description
├─ .venv/                       # Python virtual environment
├─ requirements.txt             # Python dependencies
├─ package.json                 # Node.js dependencies
└─ Makefile                     # Automated build
```

---

# Stage 4: Benchmark Task Design & Parameter Fixation (Task Design)

## 1) Global Conventions (applying to all tasks)

### Export Interface (Wasm side)
**Rust implementation (#[no_mangle] bare interface):**
```rust
#[no_mangle]
pub extern "C" fn init(seed: u32);
#[no_mangle] 
pub extern "C" fn alloc(n_bytes: u32) -> u32;  // return memory offset
#[no_mangle]
pub extern "C" fn run_task(params_ptr: u32) -> u32;  // return hash value
```

**TinyGo implementation (corresponding exports):**
```go
//export init
func init(seed uint32)
//export alloc  
func alloc(nBytes uint32) uint32
//export run_task
func runTask(paramsPtr uint32) uint32  // return hash value
```

• Both languages export memory, directly perform pointer operations

### Fixed Randomness
Use xorshift32 (Uint32), consistent cross-language implementation.

### FNV-1a Hash Verification Mechanism
• Use **FNV-1a hash algorithm** instead of simple accumulation: better distribution and collision resistance
• **Algorithm:** `hash = 2166136261; for each byte: hash ^= byte; hash *= 16777619`
• **Advantages:** Detects order differences, extremely low collision rate, avalanche effect, cross-language consistency
• `run_task` returns u32 hash value, ensuring correctness verification of algorithm implementation
• **Unified implementation:**
  ```c
  uint32_t hash = 2166136261;  // FNV offset basis
  for (each byte) {
      hash ^= byte;
      hash *= 16777619;        // FNV prime
  }
  return hash;
  ```
• For floating-point operations, first normalize to fixed precision (e.g., `round(x * 1e6)`) then participate in hashing

### JS↔Wasm Round-trip Minimization
• JS side only: ① alloc+memcpy input once; ② init(seed) once; ③ multiple run_task() timing  
• No cross-boundary reading of large data, results only returned as u32 hash values

## Optimization Variants (compilation & post-processing)

### Rust (bare interface configuration)

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

Compilation: `cargo build --target wasm32-unknown-unknown --release`
Post-processing: `wasm-strip target/wasm32-unknown-unknown/release/*.wasm`

### TinyGo
Compilation:
```bash
tinygo build -target=wasm \
  -opt=3 -panic=trap -no-debug -scheduler=none \
  -o out_tinygo_o3_minrt.wasm ./cmd/yourpkg
```

## Task One: Mandelbrot (CPU intensive / floating-point)

**Purpose:** Test scalar floating-point loops and branches.

**Input** (parameters written to Wasm via JS→Wasm once, pixel buffer allocated inside Wasm):
• **Benchmark parameters** (small/medium/large)
  - S: 256×256, max_iter=500
  - M: 512×512, max_iter=1000
  - L: 1024×1024, max_iter=2000
• **Fixed viewport:** center=(-0.743643887037, 0.131825904205); scale respectively 3.0/width

**Verification:** FNV-1a hash on iteration count sequence, consistent results across languages.

**Note:** Only return hash value, no bitmap return, reducing boundary transmission.

## Task Two: Array Quicksort

**Purpose:** Test integer comparison, memory access and in-place modification algorithms.

**Input:** int32 array of length N (JS generates with xorshift32 → written to alloc area once).

**Scale** (progressive GC trigger design)
• S: 200,000 (800KB, **no GC trigger**)
• M: 800,000 (3.2MB, **light GC trigger**)
• L: 2,000,000 (8MB, **medium GC trigger**)

**Process** (inside Wasm)
1. View input buffer as i32 slice
2. **Standard three-way quicksort** (Dijkstra 3-way quicksort):
   - Same partitioning strategy: `< pivot | = pivot | > pivot`
   - Same pivot selection: median-of-three
   - Same recursion termination condition: switch to insertion sort when length ≤ 16
3. Perform FNV-1a hash on sorted array, return hash value

**Note:** In-place sorting algorithm, memory allocation mainly from input data itself, GC pressure from data scale

## Task Three: Base64 Encoding/Decoding

**Purpose:** Test byte processing and table-driven, branching.

**Input:** Random bytes of length N (generated by xorshift32, taking low 8 bits).

**Scale** (progressive GC trigger design)
• S: 300 KiB (encoded 400KB + decoded 300KB = 1MB, **no GC trigger**)
• M: 900 KiB (encoded 1.2MB + decoded 900KB = 3MB, **light GC trigger**)
• L: 2.4 MiB (encoded 3.2MB + decoded 2.4MB = 8MB, **medium GC trigger**)

**Process** (inside Wasm)
1. **Encoding:** bytes → base64 (standard table, \r\n disabled, pure single line)
2. **Decoding:** base64 → bytes2
3. **Verification:** Compare bytes2 with original bytes (if not equal, directly return specific error code, e.g., `0xDEAD_B64`)
4. Perform FNV-1a hash on all bytes of bytes2, return hash value

**Note:** Complete process inside Wasm; JS does not participate in string construction or comparison.

## Task Four: JSON Parsing (structured text → structured object)

**Purpose:** Test text scanning, number parsing, object construction and memory allocation.

**Input:** Canonical JSON (ASCII), an array segment:
```json
[
  {"id":0,"value":123456,"flag":true,"name":"a0"},
  {"id":1,"value":...,"flag":false,"name":"a1"},
  ...
]
```

• **Generation rules** (JS side generates string bytes once and writes):
  - No extra whitespace, fixed field order: id,value,flag,name
  - id monotonically increasing; value generated by xorshift32 (taking 31-bit non-negative)
  - flag = (value & 1) == 0; name = "a" + id (ASCII)
• **Scale** (number of entries, progressive GC trigger design)
  - S: 6,000 (~300KB JSON + 600KB parsed objects = 900KB, **no GC trigger**)
  - M: 20,000 (~1MB JSON + 2MB parsed objects = 3MB, **light GC trigger**)
  - L: 50,000 (~2.5MB JSON + 5MB parsed objects = 7.5MB, **medium GC trigger**)

Estimated at average ~50 bytes JSON + ~100 bytes parsed objects per entry, testing GC impact of small object allocation.

**Process** (inside Wasm)
1. Parse JSON inside Wasm (handwritten micro parser or minimal dependency), parse to temporary structure or scan and aggregate on-the-fly
2. **Aggregation metrics:**
   - sum_id (u64)
   - sum_value (u64)
   - cnt_true_flag (u32)
   - hash_name (FNV-1a hash on all name bytes)
3. Perform FNV-1a hash on four aggregated values in order:
   ```c
   hash = 2166136261;  // FNV offset basis
   // Convert each u32 value to bytes and hash with FNV-1a
   hash = fnv1a_hash_u32(hash, sum_id);
   hash = fnv1a_hash_u32(hash, sum_value);
   hash = fnv1a_hash_u32(hash, cnt_true_flag);
   hash = fnv1a_hash_u32(hash, hash_name);
   return hash;
   ```

**Verification:** Only compare hash values; different parsing paths in two languages can still align.

## Task Five: Matrix Multiplication

**Purpose:** Test intensive numerical computation, cache access.

**Data type:** f32 (consistent between two languages).

**Input:** Two matrices A, B (row-major order, contiguous Float32Array), elements generated by xorshift32 and mapped to [0,1):
```
val = (x >>> 0) * (1.0 / 4294967296.0)
```

**Scale** (N×N, progressive GC trigger design)
• S: 256 (768KB: A/B/C each 256KB = 768KB, **no GC trigger**)
• M: 384 (1.7MB: A/B/C each 576KB + computation temporaries ≈ 3MB, **light GC trigger**)
• L: 512 (3MB: A/B/C each 1MB + computation temporaries ≈ 8MB, **medium GC trigger**)

**Process** (inside Wasm)
1. Read A,B, allocate C
2. Naive triple loop (i,j,k same order), ensuring consistent floating-point rounding paths in different languages
3. **Generate digest:** Convert each element of C to i32 by `round(x * 1e6)`, perform FNV-1a hash, return hash value

**Verification:** Hash value repeatable and cross-language consistent (same order + f32 + fixed precision).

## GC Trigger-Oriented Test Scale Design Principles

**TinyGo GC Trigger Gradient Design**:
- **S (no GC trigger)**: < 1MB memory usage, basically no GC impact, test pure computational performance difference
- **M (light GC trigger)**: 2-4MB memory usage, start having GC overhead, performance difference begins to show
- **L (medium GC trigger)**: 6-10MB memory usage, obvious GC overhead, Rust zero-cost advantage prominent

**GC Pressure Characteristics of Each Task**:
- **Quicksort**: In-place algorithm, main pressure from input data scale
- **Base64**: String allocation, test GC impact of continuous memory allocation
- **JSON parsing**: Lots of small object allocation, test fine-grained GC overhead
- **Matrix multiplication**: Large contiguous memory blocks, test GC impact of large object allocation
- **Mandelbrot**: Pure computation baseline, almost no memory allocation, minimal GC impact

**Experimental Position Confirmation**:
- **Goal**: Quantify "GC vs zero-cost abstraction" performance difference through progressive GC pressure
- **Method**: S scale establishes no-GC baseline, M/L scales gradually expose GC costs
- **Expectation**: S scale minimal difference, M scale starts to diverge, L scale Rust advantage obvious

## Artifact Naming Convention
`{task}-{lang}-{opt}.wasm`

Examples:
- `array_sort-rust-o3.wasm` (Rust bare interface + O3 optimization)
- `array_sort-tinygo-oz.wasm` (TinyGo + Oz optimization)
- `mandelbrot-rust-o3.wasm`
- `mandelbrot-tinygo-oz.wasm`

**Build directory structure:**
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

## Fairness & Consistency Rules (Mandatory)
• **Same algorithm same order:** Sorting/matrix multiplication loop and comparison order remain consistent; Mandelbrot unified f64; MatMul unified f32
• **Zero external dependencies:** Rust uses `#[no_mangle]` bare interface, TinyGo uses `//export`, both without high-level libraries
• **Single-threaded / no SIMD:** This round baseline does not enable multithreading and SIMD (can do extension experiments as separate variants, like o3-simd)
• **Memory management strategy explanation:** 
  - **Rust**: Zero-cost abstractions, compile-time memory management, no runtime GC overhead
  - **TinyGo**: With garbage collector, has GC pause and allocation overhead
  - **Experimental position**: Treat memory management differences as **part of language characteristics**, not trying to eliminate, but distinguish "pure computational performance" and "memory management overhead" impact in analysis
• **One-time copy-in:** All input written to alloc area once
• **Same post-processing:** wasm-strip → wasm-opt -O*/-Oz → gzip

## Result & Exception Handling (disk format unchanged)
• `results/bench-*.ndjson` retains each 100 samples' ms, and hash (from return value u32)
• For failures (parsing errors, Base64 comparison failures, etc.), `run_task` can return fixed error codes (like `0xDEAD_xxxx`), JS side marks this sample as `ok:false` and counts in exception statistics (not included in mean)
• Binary size from `*.manifest.json` (raw/opt/gz)

---

# Stage 5: Data Collection & Quality Control (Run & Collect)

## 1. Data Collection Process

### 1. Initialize Test Environment
- Confirm hardware and software environment consistent with Stage 2 configuration
- Clean browser cache and Node.js temporary files, ensure no residual state before testing
- Close background high-usage programs, reduce interference

### 2. Run Test Tasks
- In browser (Puppeteer driving Headless Chrome) the 5 tasks defined in Stage 4
- Each task executes 10 cold starts (first load timing) and 100 hot starts (loaded module repeated call timing)
- Each execution records the following raw metrics:
  - `execution_time_ms` (execution time, `performance.now()` record)
  - `memory_usage_mb` (Chrome's `performance.memory` or equivalent Node monitoring)
  - `binary_size_raw_kb` and `binary_size_gzip_kb` (read directly from build output)
- Puppeteer automatically outputs each run's results to JSON file, like:

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

### 3. Result File Storage
• Name folders by YYYYMMDD-HHMM timestamp, ensure traceability
• Save raw data in both CSV and JSON formats for subsequent analysis:

```
/results/20250815/
  ├── raw_data.json
  ├── raw_data.csv
  ├── logs/
  └── screenshots/  # Browser-side optional only
```

## 2. Data Quality Control (QC)

**Goal:** Ensure data reliability and repeatability

### Automated QC Checks
• **Format validation:** All records must contain task, language, run_type, execution_time_ms, binary_size_raw_kb fields
• **Numerical range checks:** E.g., execution time cannot be negative, memory usage cannot exceed system physical limits
• **Outlier detection (IQR method):**
  - Calculate first quartile (Q1) and third quartile (Q3), IQR = Q3 - Q1
  - Outlier definition: value < Q1 - 1.5×IQR or value > Q3 + 1.5×IQR
  - For severe outliers: value < Q1 - 3×IQR or value > Q3 + 3×IQR, directly remove
  - Mild outliers (between 1.5×IQR to 3×IQR) marked but retained, used for noise level analysis
  - All outliers recorded in `qc_report.log`, including original value, outlier degree, run_id

### Repeatability Verification
• Compare standard deviation of 100 hot start runs, if coefficient of variation (CV = σ / μ) for single task single language exceeds 15%, automatically mark as "needs retest"
• If still exceeds after retest, record in experimental limitation description and analyze possible systematic noise sources

## 3. Data Aggregation & Delivery

### 1. Merge Multi-round Test Results
- Use Python script to merge multiple batches of JSON/CSV, generate unified `final_dataset.csv`
- For each task+language combination calculate:
  - Average execution time (mean)
  - Standard deviation (std_dev)
  - Peak memory (peak_mem)
  - Average and compressed binary size

### 2. Generate Visualization Preview
- Automatically draw bar charts, box plots, scatter/swarm plots of execution time, memory usage, binary size for preliminary analysis

### 3. Data Locking
- Once data passes QC, generate checksum file (SHA256), ensure subsequent analysis uses this version of data

---

# Stage 6: Measurement & Statistical Analysis

## 1. Analysis Input & Preparation
• **Data source:** Final QC-passed `final_dataset.csv` and `system_stats.log` from previous stage
• **Analysis environment:**
  - Python 3 (using pandas, numpy, scipy, matplotlib, seaborn)
  - Data visualization requires ensuring both PNG and SVG dual-version output
  - Runtime environment must be consistent with data collection stage, avoid version differences causing calculation errors
• **Data structure:**
  - Each row contains: task, language, run_type, execution_time_ms, memory_usage_mb, binary_size_raw_kb, binary_size_gzip_kb

## 2. Metrics Calculation
For each **task** + **language** + **run_type** combination, calculate:
1. Mean
2. Standard deviation
3. Variance
4. Confidence Interval
5. **Binary size:** Calculate mean, standard deviation, compression ratio

## 3. Significance Testing

### 1. Normality Test (Shapiro–Wilk)
- Test execution time and memory data for each language
- H₀: Sample comes from normal distribution
- p ≥ 0.05 → Consider conforming to normal distribution
- p < 0.05 → Reject normality assumption

### 2. Difference Significance Testing
- If both groups normal → Use **Independent t-test**
- If at least one group not normal → Use **Mann–Whitney U test** (non-parametric)
- Raw significance level α = 0.05

### 2.1 Multiple Comparison Correction (mandatory)
**Problem**: 5 tasks × 3 scales × 2 metrics (execution time, memory) = **30 hypothesis tests**, need to correct false positive rate

**Method**: **Benjamini-Hochberg FDR correction**
- Sort all 30 p-values from small to large: p₁ ≤ p₂ ≤ ... ≤ p₃₀  
- Find largest i such that: pᵢ ≤ (i/30) × 0.05
- Reject H₀ corresponding to p₁, p₂, ..., pᵢ
- **Control false discovery rate (FDR) ≤ 5%**

**Report format**: Report both raw p-values and corrected determination results

### 3. Effect Size (Cohen's d)

Formula: **d = (μ₁ - μ₂) / sₚ**

• sₚ (pooled standard deviation) calculated weighted by both groups' data
• **Interpretation:**
  - 0.2 ≤ d < 0.5 → Small effect
  - 0.5 ≤ d < 0.8 → Medium effect
  - d ≥ 0.8 → Large effect

## 4. Visualization

All charts export both **PNG** (paper figures) and **SVG** (high-resolution scalable) formats simultaneously.

### 1. Bar Chart
- X axis: Task type
- Y axis: Mean (execution_time_ms / memory_usage_mb / binary_size_kb)
- Grouping: Language (Go / Rust)
- Error bars: ±standard deviation or 95% CI

### 2. Box Plot
- Show distribution median, interquartile range, outliers
- One subplot per task, languages by color

### 3. Scatter/Swarm Plot
- Each point represents one repeated experiment result
- Task + language combination as X axis, execution time/memory as Y axis
- Can use transparency (alpha) to prevent point overlap

### 4. Compression Ratio Comparison Chart
- Y axis: Compression ratio (gzip/raw)
- Intuitively compare compression efficiency of different languages' Wasm modules

## 5. Analysis Output (Deliverables)
After running analysis script, automatically generate:

### 1. Markdown report file `/analysis/report.md`:
- Contains statistical tables (mean, std, variance, CI, p values, effect size)
- Text explanation of significance test results (including normality results)
- Analysis summary for each task

### 2. Chart files:
- `/analysis/figures/*.png`
- `/analysis/figures/*.svg`

### 3. Analysis logs:
- `/analysis/analysis_log.txt`
Records data processing, discarded outliers, statistical methods used

### 4. Optional output (for paper appendix):
- Complete raw data copy (post-QC)
- Python scripts and dependency environment description

---

# Stage 7: Result Compilation & Conclusions

• Summarize each task's winner/disadvantage points, explain possible causes (GC/ownership, ABI/FFI, boundary overhead, instruction selection)
• Combine size and download/cold start impact, give "different application scenario" selection recommendations
• Limitations and threats: 16GB RAM limitation, browser differences, single-machine single-core scheduling interference, etc.

## Limitations & Threat Analysis

### Hardware Limitations (16GB RAM)
During data collection, super-large dataset tests (like 1024×1024 matrix multiplication) may occupy considerable memory, need to monitor memory usage to avoid swapping.

### Browser Differences
Although mainly using Chrome (`performance.now` + `performance.memory`), different browsers' Wasm engines (V8, SpiderMonkey, JavaScriptCore) have differences in execution speed and memory allocation strategies, limiting cross-browser applicability of results.

### Single-machine Scheduling Interference
Experiments run under single-machine single-process conditions, if system background tasks preempt CPU, may cause occasional anomalies in execution time; although Stage 5 adopted outlier removal, measurement noise risk still exists.

### Wasm Single-threaded Constraints
Current test tasks run in single-threaded Wasm environment, multi-core parallel advantages not verified, so results may not fully apply to future multi-threading supporting Wasm environments.

### Limited Task Selection Range
This study's 5 tasks, although covering typical scenarios like computation, data processing, memory management, cannot completely represent all practical WebAssembly application types.

Configure a **"Task-Language Advantage Matrix Chart"** (5 tasks × 3 metrics × two languages' color marking), this will make conclusions more intuitive

---

# Stage 8 [Optional]: Automation

• **Makefile targets:** `make init` (install dependencies), `make build`, `make run`, `make collect`, `make analyze`, `make report`
• **Single command experiment reproduction:** `scripts/all_in_one.sh` (from build to report)
• **Result packaging:** `results/` and `analysis/` compressed archive, generate README (including run commands and expected artifacts)

## Makefile Targets

**Convention:** All commands idempotent, support `VERBOSE=1` and `DRYRUN=1`. Exit with non-zero code on failure and write to `logs/`.

• **`make init`**
  - **Purpose:** Initialize/check runtime environment (language toolchains, Node, Python), create virtual environment, install dependencies, write version locking, pull up headless browser dependencies
  - **Output:** `.venv/`, `config/versions.lock`, `logs/init_*.log`

• **`make build`**
  - **Purpose:** Build Rust and Go's five Wasm tasks (Release), simultaneously output raw_size and gzip_size
  - **Output:** `.wasm`, `.map`, `sizes.csv`, `checksums.txt` (SHA256) under `wasm/build/`

• **`make run`**
  - **Purpose:** Execute browser and Node side benchmarks (including cold/hot) according to `config/bench.yml`. Optional `BACKEND=browser|node|both`
  - **Output:** `results/<timestamp>/raw/*.json` and corresponding `logs/`

• **`make collect`**
  - **Purpose:** Format validation, outlier marking, merge multi-round results, generate `final_dataset.csv`, system status recording
  - **Output:** `results/<timestamp>/final_dataset.csv`, `qc_report.txt`, `system_stats.log`, `checksums.txt`

• **`make analyze`**
  - **Purpose:** Calculate mean/standard deviation/variance/95%CI, normality test, t/Mann–Whitney, Cohen's d, generate statistical report and visualization
  - **Output:** `/analysis/report.md`, `/analysis/figures/`, `/analysis/analysis_log.txt`

• **`make report`**
  - **Purpose:** Generate final comprehensive report, package all results, create reproducible archive
  - **Output:** `final_report.pdf`, `results_archive.tar.gz`

• **`make clean`**
  - **Purpose:** Clean all build artifacts and temporary files, keep source code and configuration
  - **Effect:** Remove `builds/`, `results/`, `analysis/`, `.venv/` directories

• **`make help`**
  - **Purpose:** Display all available Makefile targets and their descriptions
  - **Output:** Help text to console

### Single Command Full Pipeline
```bash
# Complete experiment from scratch
./scripts/all_in_one.sh

# With verbose output
VERBOSE=1 ./scripts/all_in_one.sh

# Dry run (show what would be executed)
DRYRUN=1 ./scripts/all_in_one.sh
```

### Result Packaging
- Automatically create timestamped archive containing all results, analysis, and reproduction instructions
- Include environment fingerprint and checksums for complete reproducibility
- Generate standalone HTML report that can be viewed without external dependencies