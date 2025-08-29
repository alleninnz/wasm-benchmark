# WebAssembly Performance Benchmark: Rust vs TinyGo

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)
![Rust](https://img.shields.io/badge/rust-1.89.0-orange.svg)
![TinyGo](https://img.shields.io/badge/tinygo-0.39.0-00ADD8.svg)
![Node.js](https://img.shields.io/badge/node-22.18.0-green.svg)
![Python](https://img.shields.io/badge/python-3.13.5-blue.svg)

A comprehensive benchmarking framework to evaluate the efficiency of **Rust** and **TinyGo** when compiled to WebAssembly across various computational workloads.

## 🎯 Overview

This project provides a rigorous performance comparison between:

| Language | Target | Runtime | Optimization |
|----------|--------|---------|--------------|
| **Rust 1.89** | `wasm32-unknown-unknown` | Zero-cost abstractions, no GC | `-O3`, fat LTO |
| **TinyGo 0.39** | `wasm` | Garbage collected runtime | `-opt=3`, no scheduler |

**Test Environment:**
- **Hardware:** MacBook Pro M4 10-Core CPU, 16GB RAM  
- **OS:** macOS 15.x (Darwin/amd64)
- **Runtime:** Headless Chromium v122+ (Puppeteer)
- **Toolchain:** Rust 1.89, Go 1.25, TinyGo 0.39, Node.js 22.18, Python 3.13

## 🚀 Quick Start

Choose your path:

### For Researchers (Full Pipeline)
```bash
# Clone and run complete experiment
git clone https://github.com/user/wasm-benchmark.git
cd wasm-benchmark
make all                    # ~15-20 minutes
```

### For Developers (Build & Test)
```bash
make init                   # Install dependencies
make build                  # Build all WASM modules  
make run                    # Run benchmarks
make analyze                # Generate statistics & plots
```

### For Quick Testing
```bash
make all-quick              # Reduced sample size (~5 minutes)
```

## 📊 Benchmark Tasks

Three computational tasks designed to test different performance aspects:

| Task | Focus | Small | Medium | Large |
|------|-------|-------|--------|-------|
| **Mandelbrot** | CPU-intensive floating-point | 256×256 | 512×512 | 1024×1024 |
| **JSON Parse** | Object allocation patterns | 6K records | 20K records | 50K records |
| **Matrix Mul** | Dense numerical computation | 256×256 | 384×384 | 512×512 |

*Each task runs with progressive memory pressure (1MB → 3MB → 8MB) to stress garbage collection.*

## 📈 Key Metrics

- **⚡ Execution Time** — Function-level timing via `performance.now()`
- **🧠 Memory Usage** — Peak allocation during execution  
- **📦 Binary Size** — Raw `.wasm` + gzipped sizes
- **📊 Statistical Analysis** — Means, confidence intervals, effect sizes

## 📁 Project Structure

```
wasm-benchmark/
├── 📋 Makefile                 # Automation targets & pipeline
├── 📦 package.json             # Node.js dependencies & scripts
├── 🐍 requirements.txt         # Python analysis dependencies
├── 📄 LICENSE                  # MIT license
├── 
├── 🔧 configs/
│   ├── bench.yaml              # Task configurations & parameters
│   └── versions.lock           # Environment fingerprint
├── 
├── 🌐 harness/web/             # Browser benchmark runner
│   ├── bench.html              # Test page & UI
│   ├── bench.js                # WASM loader & timer
│   └── wasm_loader.js          # Module instantiation
├── 
├── 🛠️  scripts/                 # Build & automation scripts
│   ├── build_rust.sh          # Rust → WASM compilation
│   ├── build_tinygo.sh        # TinyGo → WASM compilation  
│   ├── build_all.sh           # Complete build pipeline
│   ├── run_browser_bench.js   # Puppeteer test runner
│   ├── fingerprint.sh         # Environment detection
│   └── all_in_one.sh          # Full experiment pipeline
├── 
├── 🎯 tasks/                   # Language implementations
│   ├── mandelbrot/{rust,tinygo}/
│   ├── json_parse/{rust,tinygo}/
│   └── matrix_mul/{rust,tinygo}/
├── 
├── 📦 builds/                  # Generated WASM modules
│   ├── rust/*.wasm
│   ├── tinygo/*.wasm
│   └── sizes.csv              # Binary size analysis
├── 
├── 📊 results/                 # Benchmark outputs
│   └── YYYYMMDD-HHMM/         # Timestamped runs
│       ├── raw_data.{json,csv}
│       ├── qc_report.txt
│       └── logs/
├── 
├── 📈 analysis/                # Statistical analysis
│   ├── statistics.py          # Descriptive & inferential stats  
│   ├── plots.py              # Visualization generation
│   ├── figures/              # Generated charts (PNG/SVG)
│   └── report.md             # Analysis template
└── 
└── 📚 docs/                    # Documentation
    ├── ExperimentPlan.md      # Research methodology
    └── ExperimentPlan_en.md   # English translation
```

## ⚙️ Installation

### System Requirements

| Component | Version | Installation |
|-----------|---------|--------------|
| **Node.js** | ≥18.0.0 (tested: 22.18) | `brew install node` |
| **Python** | ≥3.12 (tested: 3.13.5) | `brew install python@3.13` |
| **Rust** | ≥1.84 (tested: 1.89) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Go** | ≥1.23 (tested: 1.25) | `brew install go` |
| **TinyGo** | ≥0.34 (tested: 0.39) | `brew install tinygo` |
| **WASM Tools** | Latest | `brew install binaryen wabt` |

### One-Command Setup

```bash
# Check dependencies
make check-deps

# Install everything (dependencies + tools)
make init

# Verify installation
make info
```

<details>
<summary>Manual Installation (Click to expand)</summary>

```bash
# Install Rust + WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Install Go toolchain  
brew install go tinygo

# Install Node.js + Python
brew install node python@3.13

# Install WASM optimization tools
brew install binaryen wabt

# Setup Python environment
python3 -m venv .venv
source .venv/bin/activate  
pip install -r requirements.txt

# Install Node.js dependencies
npm ci
```

</details>

## 🏃 Running Benchmarks

### Available Commands

| Command | Description | Time | Use Case |
|---------|-------------|------|----------|
| `make all` | Complete pipeline | ~15-20min | Research & publication |
| `make all-quick` | Reduced samples | ~5min | Development & testing |

### Step-by-Step Execution

```bash
make init                   # Setup environment
make build                  # Compile WASM modules (~2min)
make run                    # Execute benchmarks (~10min) 
make analyze                # Generate statistics (~1min)
make report                 # Create final report
```

### Advanced Usage

```bash
# Build specific language
make build-rust             # Rust modules only
make build-tinygo          # TinyGo modules only

# Run with custom settings
make run-headed            # Visible browser (debugging)
make run-quick             # Reduced sample size

# Check project status
make status                # Build status & results
make info                  # System information
```

## 🔧 Technical Implementation  

### WebAssembly Interface

Both languages export a unified **C-style interface** for fair comparison:

```c
void     init(uint32_t seed);           // Initialize PRNG
uint32_t alloc(uint32_t n_bytes);       // Allocate memory  
uint32_t run_task(uint32_t params_ptr); // Execute & return result hash
```

### Optimization Settings

| Language | Target | Flags | Post-processing |
|----------|--------|-------|----------------|
| **Rust** | `wasm32-unknown-unknown` | `-O3`, fat LTO, 1 codegen unit | `wasm-strip`, `wasm-opt -O3` |
| **TinyGo** | `wasm` | `-opt=3`, panic trap, no debug | `wasm-strip`, `wasm-opt -Oz` |

<details>
<summary>Detailed Configuration (Click to expand)</summary>

**Rust `Cargo.toml`:**
```toml
[profile.release]
opt-level = 3           # Maximum optimization
lto = "fat"            # Link-time optimization
codegen-units = 1      # Single compilation unit
panic = "abort"        # No unwinding overhead  
strip = "debuginfo"    # Remove debug symbols
```

**TinyGo Command:**
```bash
tinygo build -target=wasm \
  -opt=3                    # Maximum optimization
  -panic=trap              # Trap on panic
  -no-debug                # No debug info
  -scheduler=none          # No goroutine scheduler
```

</details>

### Result Verification

**FNV-1a Hash** ensures correctness across languages:
```c
hash = 2166136261;               // FNV offset basis
for each byte:
    hash ^= byte;
    hash *= 16777619;            // FNV prime
```

✅ Superior collision resistance  
✅ Better data distribution (avalanche effect)  
✅ Language-agnostic verification  
✅ Prevents optimization bypass

## 📊 Statistical Methodology

### Experimental Design
- **Warmup:** 10 iterations (discarded for cold start elimination)
- **Measurement:** 100 iterations per task/language/scale combination
- **Randomization:** Task order shuffled to minimize systematic bias
- **Environment:** Controlled temperature, isolated processes

### Quality Control Pipeline
| Stage | Method | Threshold |
|-------|--------|-----------|
| **Outlier Detection** | IQR method | 1.5×IQR (mild), 3.0×IQR (severe) |
| **Variance Check** | Coefficient of variation | <15% CV required |
| **Sample Size** | Post-filtering minimum | ≥90 valid samples |
| **Normality** | Shapiro-Wilk test | p<0.05 → non-parametric |

### Statistical Tests
- **Significance:** Independent t-test or Mann-Whitney U  
- **Multiple Comparisons:** Benjamini-Hochberg FDR correction (α=0.05)
- **Effect Size:** Cohen's d for practical significance
- **Confidence Intervals:** 95% bootstrap intervals

## 📈 Results & Analysis

### Generated Outputs

| Output Type | Location | Description |
|-------------|----------|-------------|
| **Raw Data** | `results/*/raw_data.{json,csv}` | Individual execution times & memory |
| **QC Report** | `results/*/qc_report.txt` | Outlier analysis & data quality |
| **Statistics** | `analysis/figures/` | Descriptive stats & significance tests |
| **Visualizations** | `analysis/figures/` | Bar charts, box plots, distributions |
| **Final Report** | `results/*/REPORT.md` | Executive summary & conclusions |

### Expected Results Structure

```
results/20250824-1430/
├── raw_data.json          # Individual measurements  
├── raw_data.csv           # Tabular format for analysis
├── qc_report.txt          # Quality control summary
├── logs/benchmark.log     # Execution details
└── REPORT.md             # Auto-generated analysis
```

## 🔬 Reproducibility

| Component | Method | Purpose |
|-----------|--------|---------|
| **Environment** | `versions.lock` fingerprint | Lock all tool versions |
| **Data Integrity** | SHA256 checksums | Verify build artifacts |
| **Automation** | `make all` pipeline | One-command reproduction |
| **Quality Assurance** | Automated outlier detection | Consistent data quality |

### Reproduction Steps
```bash
git clone <repo> && cd wasm-benchmark
make all                    # Complete experiment
# Results in: results/$(date +%Y%m%d-%H%M)/
```

## ⚠️ Limitations & Considerations

- **🔗 Single-threaded:** WASM threading not used (consistency)
- **🌐 Browser-specific:** V8 engine results (Chrome/Node.js)  
- **💾 Memory-bound:** Limited by 16GB system RAM
- **🎯 Task coverage:** 3 tasks may not represent all workloads
- **🖥️ Platform-specific:** Apple M4 architecture results
- **⏱️ Temporal:** Performance may vary with browser/OS updates

## 🤝 Contributing

1. **Fork** the repository  
2. **Create** feature branch: `git checkout -b feature/new-task`
3. **Add** your implementation in `tasks/your_task/{rust,tinygo}/`
4. **Update** `configs/bench.yaml` with task configuration
5. **Test** with `make all-quick`
6. **Submit** pull request

## 📚 Documentation

- [`docs/ExperimentPlan.md`](docs/ExperimentPlan.md) — Research methodology (Chinese)
- [`docs/ExperimentPlan_en.md`](docs/ExperimentPlan_en.md) — Research methodology (English)
- [`configs/bench.yaml`](configs/bench.yaml) — Task parameters & configuration
- [`analysis/report.md`](analysis/report.md) — Analysis template

## 🐛 Troubleshooting

<details>
<summary>Common Issues (Click to expand)</summary>

**Build Failures:**
```bash
make clean && make init     # Reset environment
make check-deps            # Verify tool installations
```

**Benchmark Timeouts:**
```bash
make run-quick             # Reduce sample size
# Edit configs/bench.yaml → timeout_ms: 60000
```

**Memory Issues:**
```bash
# Reduce task scales in configs/bench.yaml
scales:
  large: { /* reduce parameters */ }
```

**Browser Crashes:**
```bash
make run-headed            # Debug with visible browser
# Check system memory usage
```

</details>

## 📄 License

This project is licensed under the **MIT License** - see the [`LICENSE`](LICENSE) file for details.

---

**Keywords:** WebAssembly, WASM, Rust, Go, TinyGo, Performance, Benchmark, Comparison, Statistical Analysis



