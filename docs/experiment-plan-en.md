# WebAssembly Benchmark: Rust vs TinyGo Performance Comparison Study

## Experiment Overview

### Experimental Environment

**Hardware:** MacBook Pro M4 10Core CPU 16GB RAM
**Operating System:** macOS 15.6+
**Browser:** Headless Chromium 140+ (driven by Puppeteer 24+)

**Language Toolchain:**

• **Rust** 1.89+ (stable) targeting `wasm32-unknown-unknown`, using `#[no_mangle]` bare interface (zero overhead)
• **TinyGo** 0.39+ + **Go** 1.25+ targeting WebAssembly (`-target wasm`)
• **Node.js** 22 LTS
• **Python** 3.13+ with scientific computing stack (NumPy 2.3+, SciPy 1.16+, Pandas 2.3+, Matplotlib 3.10+)

**Runtime Harness & Scripts:**

• **Puppeteer:** Unified test harness with benchmark execution, responsible for timing & memory collection, automated repeated execution, result persistence (JSON format)
• **Vitest + Node.js:** Comprehensive testing framework with unit, integration, and end-to-end test automation
• **Bash + Python + Make:** Automated build system, batch execution, data quality control, and statistical analysis pipeline

## Benchmark Tasks

Using 3 computation/data-intensive tasks uniformly, each implemented in both Rust and TinyGo, with identical parameters for comparison:

1. **Mandelbrot** (CPU floating-point intensive)
2. **JSON Parsing** (structured data)
3. **Matrix Multiplication** (MatMul) (integer/float optional, fixed dimensions)

Each task fixed: input scale (small, medium, large), random seed, verification function (computing digest/hash within Wasm, only returning small results to JS, ensuring Go and Rust return completely identical results for the same task)

## Key Metrics

**Execution Time:** Statistics for each pure function execution time (using browser `performance.now()`, taking the difference). For each task×language×optimization level, warmup 10 times (discard), then record (measure) 100 times (ensuring statistical reliability).

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


## Statistical Analysis

**Core Statistical Methods:**

- **Descriptive Statistics:** Mean, standard deviation, coefficient of variation, 95% confidence interval
- **Significance Testing:** t-test (p < 0.05)
- **Effect Size:** Cohen's d calculation
- **Quality Control:** IQR outlier detection, CV < 20% threshold

**Visualization:** Bar chart (mean + error bars) + Box plot (distribution + outliers)

## Success Criteria

**Data Completeness:**

- 3 tasks × 2 languages × 3 scales = 18 datasets
- Each dataset ≥30 valid samples (after outlier removal)
- Coefficient of variation CV < 20%

**Statistical Requirements:**

- Basic descriptive statistics: mean, standard deviation, 95%CI
- Significance testing: t-test (p < 0.05)
- Effect size: Cohen's d (small/medium/large effect interpretation)

**Output Standards:**

- Statistical analysis report: `analysis/report.md`
- Core charts: bar chart + box plot
- Raw data: complete CSV format with checksums

## Implementation Timeline (4 weeks)

### Week 1: Environment Setup + Core Implementation

- Environment configuration confirmation and toolchain verification
- Benchmark task implementation and validation
- Build system setup and automation
- Basic testing framework establishment

### Week 2: Quality Control + Data Collection Framework

- Data quality control system implementation
- Cross-language consistency verification
- Statistical analysis foundation
- Automated testing pipeline

### Week 3-4: Integration Testing + Analysis Enhancement

- End-to-end test verification
- Statistical analysis and visualization
- Performance optimization and validation
- Documentation and reporting system

---

## Stage 1: Language Toolchain Installation and Fixation

• Install and fix:

- **Rust 1.89+** + `wasm32-unknown-unknown` target (no need for wasm-bindgen/wasm-pack)
- **Go 1.25+** + **TinyGo 0.39+**
- **Node.js 22 LTS**
- **Python 3.13+** + scientific computing libraries (numpy 2.3+, scipy 1.16+, pandas 2.3+, matplotlib 3.10+, seaborn 0.13+)

• Install Chromium and headless runtime dependencies

• Install Wasm tools: Binaryen (`wasm-opt`), WABT (`wasm2wat`/`wasm-strip`)

• Output tool fingerprint: create `fingerprint.sh`, write all versions to `meta.json` and `versions.lock`, ensuring reproducibility

---

## Stage 2: Project Structure

```text
wasm-benchmark/
├── analysis/                   # Statistical analysis modules
│   ├── plots.py               # Visualization generation
│   ├── qc.py                  # Quality control system
│   └── statistics.py          # Statistical computation
├── builds/                     # Build artifacts
│   ├── rust/                  # Rust WASM files
│   │   ├── *.wasm            # Compiled WASM modules
│   │   ├── *.wasm.gz         # Compressed WASM modules
│   └── tinygo/               # TinyGo WASM files
│       ├── *.wasm            # Compiled WASM modules
│       ├── *.wasm.gz         # Compressed WASM modules
├── configs/                    # Configuration files
│   ├── bench.yaml             # Benchmark configuration
│   ├── bench.json             # JSON format configuration
│   ├── bench-quick.yaml       # Quick test configuration
│   └── bench-quick.json       # Quick test JSON config
├── data/                       # Test data and references
│   └── reference_hashes/       # Reference hash values
│       ├── json_parse.json    # JSON parsing task hashes
│       ├── mandelbrot.json    # Mandelbrot task hashes
│       └── matrix_mul.json    # Matrix multiplication task hashes
├── docs/                       # Project documentation
│   ├── command-reference.md   # Command reference guide
│   ├── development-todo-en.md # Development progress (English)
│   ├── development-todo-zh.md # Development progress (Chinese)
│   ├── experiment-plan-en.md  # Experiment plan (English)
│   ├── experiment-plan-zh.md  # Experiment plan (Chinese)
│   ├── run-quick-flow.md      # Quick run workflow
│   ├── statistical-decision.md # Statistical methodology
│   ├── statistical-terminology.md # Statistical terms
│   └── testing-strategy.md    # Testing strategy guide
├── harness/                    # Test runtime environment
│   └── web/                    # Browser test framework
│       ├── bench.html         # Benchmark test page
│       ├── bench.js           # Test execution script
│       ├── config_loader.js   # Configuration loader
│       └── wasm_loader.js     # WASM loader utility
├── scripts/                    # Build and automation scripts
│   ├── all_in_one.sh         # Complete pipeline script
│   ├── build_all.sh          # Build all tasks
│   ├── build_config.js       # Build configuration
│   ├── build_rust.sh         # Rust build script
│   ├── build_tinygo.sh       # TinyGo build script
│   ├── common.sh             # Common utilities
│   ├── dev-server.js         # Development server
│   ├── fingerprint.sh        # Environment fingerprint
│   ├── run_bench.js          # Benchmark runner
│   ├── validate-tasks.sh     # Task validation
│   ├── interfaces/           # Service interfaces
│   │   ├── IBenchmarkOrchestrator.js
│   │   ├── IBrowserService.js
│   │   ├── IConfigurationService.js
│   │   ├── ILoggingService.js
│   │   └── IResultsService.js
│   └── services/             # Service implementations
│       ├── BenchmarkOrchestrator.js
│       ├── BrowserService.js
│       ├── ConfigurationService.js
│       ├── LoggingService.js
│       └── ResultsService.js
├── tasks/                      # Benchmark task implementations
│   ├── mandelbrot/            # Mandelbrot fractal computation
│   │   ├── rust/              # Rust implementation
│   │   └── tinygo/            # TinyGo implementation
│   ├── json_parse/            # JSON parsing benchmark
│   │   ├── rust/              # Rust implementation
│   │   └── tinygo/            # TinyGo implementation
│   └── matrix_mul/            # Matrix multiplication
│       ├── rust/              # Rust implementation
│       └── tinygo/            # TinyGo implementation
├── tests/                     # Comprehensive test suite
│   ├── unit/                  # Unit tests
│   │   ├── config-parser.test.js
│   │   └── statistics.test.js
│   ├── integration/           # Integration tests
│   │   ├── cross-language.test.js
│   │   └── experiment-pipeline.test.js
│   ├── setup.js              # Test configuration
│   └── utils/                 # Test utilities
│       ├── browser-test-harness.js
│       ├── prettify-test-results.js
│       ├── server-checker.js
│       ├── test-assertions.js
│       └── test-data-generator.js
├── results/                   # Experiment results storage
├── reports/                   # Generated reports and visualizations
│   └── plots/                 # Chart outputs
├── meta.json                  # Experiment metadata
├── versions.lock              # Toolchain version lock
├── pyproject.toml            # Python dependencies
├── package.json               # Node.js dependencies
├── Makefile                   # Automated build and workflow
├── vitest.config.js           # Test configuration
├── eslint.config.js           # Code quality configuration
└── README.md                  # Project description
```

---

## Stage 3: Benchmark Task Design and Parameter Fixation (Task Design)

## 1) Global Conventions (applies to all tasks)

### Export Interface (Wasm side)

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

• Both languages export memory, directly performing pointer operations

### Fixed Randomness

Use xorshift32 (Uint32), consistent implementation across languages.

### FNV-1a Hash Verification Mechanism

• Use **FNV-1a hash algorithm** instead of simple accumulation: better distribution properties and collision resistance
• **Algorithm:** `hash = 2166136261; for each byte: hash ^= byte; hash *= 16777619`
• **Advantages:** Detect sequence differences, extremely low collision rate, avalanche effect, cross-language consistency
• `run_task` returns u32 hash value, ensuring algorithm implementation correctness verification
• **Unified Implementation:**

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
• Don't read back large data across boundaries, results only returned as u32 hash values

## Optimization Variants (compilation and post-processing)

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

**Input** (parameters written to Wasm once via JS→Wasm, pixel buffer allocated internally in Wasm):
• **Benchmark parameters** (small/medium/large)

- S: 256×256, max_iter=500
- M: 512×512, max_iter=1000
- L: 1024×1024, max_iter=2000
• **Fixed viewport:** center=(-0.743643887037, 0.131825904205); scale respectively 3.0/width

**Verification:** FNV-1a hash on iteration count sequence, consistent results across languages.

**Note:** Only return hash value, don't transfer bitmap back, reducing boundary transmission.

## Task Two: JSON Parsing (structured text → structured object)

**Purpose:** Test text scanning, number parsing, object construction and memory allocation.

**Input:** Normalized JSON (ASCII), an array segment:

```json
[
  {"id":0,"value":123456,"flag":true,"name":"a0"},
  {"id":1,"value":...,"flag":false,"name":"a1"},
  ...
]
```

• **Generation rules** (JS side generates string bytes once and writes):

- No extra whitespace, fixed field order: id,value,flag,name
- id monotonically increasing; value generated by xorshift32 (take 31-bit non-negative)
- flag = (value & 1) == 0; name = "a" + id (ASCII)
• **Scale** (entry count, progressive GC trigger design)
- S: 6,000 (~300KB JSON + 600KB parsed objects = 900KB, **no GC trigger**)
- M: 20,000 (~1MB JSON + 2MB parsed objects = 3MB, **light GC trigger**)
- L: 50,000 (~2.5MB JSON + 5MB parsed objects = 7.5MB, **moderate GC trigger**)

Estimated ~50 bytes JSON + ~100 bytes parsed object per entry on average, testing GC impact of small object allocation.

**Process** (within Wasm)

1. Parse JSON within Wasm (hand-written micro parser or using minimal dependencies), parse to temporary structures or scan-and-aggregate
2. **Aggregation metrics:**
   - sum_id (u64)
   - sum_value (u64)
   - cnt_true_flag (u32)
   - hash_name (FNV-1a hash on all name bytes)
3. FNV-1a hash the four aggregated values in sequence:

   ```c
   hash = 2166136261;  // FNV offset basis
   // Convert each u32 value to byte sequence and hash with FNV-1a
   hash = fnv1a_hash_u32(hash, sum_id);
   hash = fnv1a_hash_u32(hash, sum_value);
   hash = fnv1a_hash_u32(hash, cnt_true_flag);
   hash = fnv1a_hash_u32(hash, hash_name);
   return hash;
   ```

**Verification:** Only compare hash values; different parsing paths between languages can still align.

## Task Three: Matrix Multiplication

**Purpose:** Test intensive numerical computation, cache access.

**Data Type:** f32 (consistent between languages).

**Input:** Two matrices A, B (row-major order, contiguous Float32Array), elements generated by xorshift32 and mapped to [0,1):

```text
val = (x >>> 0) * (1.0 / 4294967296.0)
```

**Scale** (N×N, progressive GC trigger design)
• S: 256 (768KB: A/B/C each 256KB = 768KB, **no GC trigger**)
• M: 384 (1.7MB: A/B/C each 576KB + computation temporaries ≈ 3MB, **light GC trigger**)
• L: 512 (3MB: A/B/C each 1MB + computation temporaries ≈ 8MB, **moderate GC trigger**)

**Process** (within Wasm)

1. Read A,B, allocate C
2. Naive triple loop (i,j,k same order), ensuring consistent floating-point rounding paths between languages
3. **Generate digest:** Convert each element of C to i32 via `round(x * 1e6)`, perform FNV-1a hash, return hash value

**Verification:** Hash value repeatable and consistent across languages (same order + f32 + fixed precision).

## GC Trigger-Oriented Test Scale Design Principles

**TinyGo GC Trigger Gradient Design**:

- **S (no GC trigger)**: < 1MB memory usage, basically no GC impact, test pure computational performance differences
- **M (light GC trigger)**: 2-4MB memory usage, start having GC overhead, performance differences begin to emerge
- **L (moderate GC trigger)**: 6-10MB memory usage, obvious GC overhead, Rust zero-cost advantage prominent

**GC Pressure Characteristics of Each Task**:

- **JSON parsing**: Lots of small object allocation, test fine-grained GC overhead
- **Matrix multiplication**: Large contiguous memory blocks, test GC impact of large object allocation
- **Mandelbrot**: Pure computation baseline, almost no memory allocation, minimal GC impact

**Experimental Position Confirmation**:

- **Goal**: Quantify "GC vs zero-cost abstraction" performance differences through progressive GC pressure
- **Method**: S scale establishes no-GC baseline, M/L scales progressively expose GC costs
- **Expectation**: S scale minimal differences, M scale begins divergence, L scale Rust advantage obvious

## Build Artifact Naming Convention

`{task}-{lang}-{opt}.wasm`

Examples:

- `mandelbrot-rust-o3.wasm` (Rust bare interface + O3 optimization)
- `mandelbrot-tinygo-oz.wasm` (TinyGo + Oz optimization)
- `json_parse-rust-o3.wasm`
- `json_parse-tinygo-oz.wasm`

**Build directory structure:**

```text
builds/
├─ rust/
│  ├─ mandelbrot-rust-o3.wasm
│  ├─ json_parse-rust-o3.wasm
│  └─ matrix_mul-rust-o3.wasm
└─ tinygo/
   ├─ mandelbrot-tinygo-oz.wasm
   ├─ json_parse-tinygo-oz.wasm
   └─ matrix_mul-tinygo-oz.wasm
```

## Fairness and Consistency Rules (mandatory)

• **Same algorithm same order:** Sorting/matrix multiplication loop and comparison order remain consistent; Mandelbrot unified f64; MatMul unified f32
• **Zero external dependencies:** Rust uses `#[no_mangle]` bare interface, TinyGo uses `//export`, both without high-level libraries
• **Single-threaded / no SIMD:** This baseline round doesn't enable multithreading and SIMD (can do extension experiments with separate variants, such as o3-simd)
• **Memory management strategy explanation:**

- **Rust**: Zero-cost abstractions, compile-time memory management, no runtime GC overhead
- **TinyGo**: With garbage collector, has GC pauses and allocation overhead
- **Experimental position**: Treat memory management differences as **part of language characteristics**, don't try to eliminate, but distinguish "pure computational performance" vs "memory management overhead" impact in analysis
• **One-time copy-in:** All input written once via alloc area
• **Same post-processing:** wasm-strip → wasm-opt -O*/-Oz → gzip

## Results and Exception Handling (output format unchanged)

• `results/bench-*.ndjson` retains each 100-sample ms, plus hash (from return value u32)
• For failures (parsing errors etc.), `run_task` can return fixed error codes (e.g., `0xDEAD_xxxx`), JS side marks this sample as `ok:false` and includes in exception statistics (not included in mean)

---

## Stage 4: Data Collection and Quality Control

## 1. Data Collection Process

### 1. Initialize Test Environment

- Confirm hardware and software environment consistent with Stage 2 configuration
- Clear browser cache and Node.js temporary files, ensure no residual state before testing
- Close background high-usage programs to reduce interference

### 2. Run Test Tasks

- Run the 3 tasks defined in Stage 3 in browser (Puppeteer-driven Headless Chrome)
- Each task executes 10 cold starts (first load timing) and 100 warm starts (repeated calls on loaded module timing)
- Record the following raw metrics for each execution:
  - `execution_time_ms` (execution time, recorded by `performance.now()`)
  - `memory_usage_mb` (Chrome's `performance.memory` or equivalent Node monitoring)
- Puppeteer automatically outputs each run's results to JSON files, such as:

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

• Name folders by YYYYMMDD-HHMM timestamp, ensuring traceability
• Save raw data in both CSV and JSON formats for easy subsequent analysis:

```text
/results/20250815/
  ├── raw_data.json
  ├── raw_data.csv
  ├── logs/
  └── screenshots/  # Browser-side optional only
```

## 2. Data Quality Control

**Goal:** Ensure data reliability

### Automated QC Checks

• **Numerical validation:** Execution time > 0, memory usage within reasonable range
• **Outlier detection:** IQR method, directly remove values exceeding Q1-1.5×IQR or Q3+1.5×IQR
• **Repeatability verification:** CV < 20%, otherwise mark as "needs re-testing"

### Data Aggregation

• Generate `final_dataset.csv`
• Calculate basic statistics: mean, standard deviation, coefficient of variation
• SHA256 checksum locks final dataset

## 3. Data Delivery

### Data Processing

- Process benchmark results through quality control pipeline
- Generate comprehensive statistical analysis reports
- Create visualization charts and plots in `reports/plots/`
- Validate data integrity with automated QC checks

### Advanced Analysis

- Cross-language performance comparison
- Statistical significance testing
- Memory usage pattern analysis

---

## Stage 5: Statistical Analysis

## 1. Analysis Preparation

• **Data source:** Results JSON files from the `results/` directory (post-QC validation)
• **Analysis environment:** Python 3.12+ with scientific computing stack
• **Analysis modules:** `analysis/statistics.py`, `analysis/qc.py`, `analysis/plots.py`
• **Data structure:** Structured JSON with task, language, execution metrics, and validation data

## 2. Core Statistical Analysis

### Basic Statistics Calculation

Calculate for each **task+language** combination:

- Mean, standard deviation, coefficient of variation
- 95% confidence interval

### Significance Testing

- **t-test:** Detect performance differences between languages (p < 0.05)
- **Effect size:** Cohen's d calculation
  - d < 0.5: small effect
  - 0.5 ≤ d < 0.8: medium effect
  - d ≥ 0.8: large effect

## 3. Visualization

### 2 core charts

1. **Bar chart:** Mean comparison + error bars (standard deviation)
   - X-axis: task type, Y-axis: execution time/memory usage
   - Groups: Rust vs TinyGo

2. **Box plot:** Distribution comparison + outlier marking
   - Show median, interquartile range, anomalies
   - One subplot per task, languages by color

**Output formats:** PNG (for reports) + SVG (high resolution) in `/reports/plots/`

## 4. Analysis Output

### Auto-generated Output

- **Quality control reports:** Automated QC analysis with outlier detection
- **Statistical analysis:** `/reports/` directory with comprehensive analysis
- **Visualization charts:** `/reports/plots/*.png` for publications
- **Data validation logs:** Complete audit trail of quality control process

---

## Stage 6: Result Analysis and Conclusions

## Result Summary

• Summarize performance comparison results for each task
• Analyze possible causes of performance differences (GC overhead, memory management, instruction optimization)
• Provide application scenario recommendations based on performance analysis

## Experimental Limitations

• **Environmental limitations:** Single-machine Chrome environment, limited result applicability
• **Task scope:** 3 benchmark tasks, limited representativeness
• **Measurement precision:** Browser environment has scheduling interference

---

## Stage 7: Automation

## Core Automation

• **`make build`** - Build all WASM modules for both languages
• **`make run`** - Execute comprehensive benchmark tests
• **`make qc`** - Run quality control analysis on results
• **`make analyze`** - Generate statistical analysis and visualizations
• **`make all`** - Complete experiment workflow (build + run + qc + analyze)

## One-click Execution

```bash
# Complete experiment workflow
make all

# Quick test workflow
make all-quick

# Individual components
make build          # Build all WASM modules
make run             # Run benchmarks
make qc              # Quality control check
make analyze         # Statistical analysis

# Output files:
# - results/*.json         # Raw benchmark data
# - reports/plots/*.png    # Visualization charts
# - Quality control reports
```
