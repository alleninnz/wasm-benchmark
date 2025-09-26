# WebAssembly Performance Benchmark: Rust vs TinyGo

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey.svg)
![Rust](https://img.shields.io/badge/rust-1.89.0-orange.svg)
![TinyGo](https://img.shields.io/badge/tinygo-0.39.0-00ADD8.svg)
![Node.js](https://img.shields.io/badge/node-24.7.0-green.svg)
![Python](https://img.shields.io/badge/python-3.13.5-blue.svg)

> **Project Status**: 98% Complete - Production-ready benchmarking framework with comprehensive statistical analysis

A comprehensive benchmarking framework to evaluate the efficiency of **Rust** and **TinyGo** when compiled to WebAssembly across various computational workloads.

## 🎯 Overview

This project provides a rigorous performance comparison between:

| Language | Target | Runtime | Optimization |
|----------|--------|---------|--------------|
| **Rust 1.89** | `wasm32-unknown-unknown` | Zero-cost abstractions, no GC | `-O3`, fat LTO |
| **TinyGo 0.39** | `wasm` | Garbage collected runtime | `-opt=3`, no scheduler |

**Test Environment:**

- **Hardware:** MacBook Pro M4 10-Core CPU, 16GB RAM
- **OS:** macOS 15.6+ (Darwin/arm64)
- **Runtime:** Headless Chromium v140+ (Puppeteer)
- **Toolchain:** Rust 1.89, Go 1.25, TinyGo 0.39, Node.js 24.7, Python 3.13

## 🚀 Quick Start

```bash
# 1. Install dependencies
make check deps  # Verify required tools
make init        # Install project dependencies

# 2. Build WebAssembly modules
make build       # Build all WASM modules for both languages

# 3. Run benchmarks
make run quick   # Fast development test (~2-3 minutes)
make run         # Full benchmark suite (~30+ minutes)

# 4. Analyze results
make qc          # Quality control validation
make analyze     # Statistical analysis and visualization

# All-in-one execution
make all quick   # Complete pipeline with quick settings
make all         # Complete research-grade pipeline
```

**📋 Requirements**: Rust 1.89+, TinyGo 0.39+, Go 1.25+, Node.js 24+, Python 3.13+, WebAssembly tools

## 📊 Benchmark Tasks

Three representative WebAssembly workloads designed to compare language performance:

### 🔢 **Mandelbrot Set Computation**

- **Type**: CPU-intensive floating-point operations
- **Purpose**: Test scalar math performance and loop optimization
- **Scales**:
  - **micro**: 64×64, 100 iterations
  - **small**: 256×256, 500 iterations
  - **medium**: 512×512, 1000 iterations
  - **large**: 1024×1024, 2000 iterations
- **Verification**: FNV-1a hash on iteration counts

### 📝 **JSON Parsing & Processing**

- **Type**: String processing and memory allocation
- **Purpose**: Test parsing performance and garbage collection impact
- **Scales**:
  - **micro**: 500 records
  - **small**: 5,000 records
  - **medium**: 15,000 records
  - **large**: 30,000 records
- **Schema**: Fields: id, value, flag, name with sequential/random/derived patterns
- **Verification**: Hash of aggregated field values

### ⚡ **Matrix Multiplication**

- **Type**: Dense numerical computation with memory access patterns
- **Purpose**: Test compute-intensive algorithms and cache utilization
- **Scales**:
  - **micro**: 64×64 matrices
  - **small**: 256×256 matrices
  - **medium**: 384×384 matrices
  - **large**: 576×576 matrices
- **Verification**: Hash of result matrix elements

**🎯 Design Principle**: Identical algorithms and verification across languages ensure fair comparison.

## 📁 Project Structure

```text
wasm-benchmark/
├── 📦 tasks/                    # Benchmark implementations
│   ├── mandelbrot/
│   │   ├── rust/                # Rust WASM implementation
│   │   │   ├── src/lib.rs       # Main benchmark entry point
│   │   │   ├── src/mandelbrot.rs # Core algorithm
│   │   │   ├── src/hash.rs      # FNV-1a hashing
│   │   │   └── Cargo.toml       # Rust configuration
│   │   └── tinygo/              # TinyGo WASM implementation
│   │       ├── main.go          # Main benchmark entry point
│   │       ├── main_test.go     # Unit tests
│   │       └── go.mod           # Go module configuration
│   ├── json_parse/              # JSON parsing benchmark
│   │   ├── rust/src/            # Rust parser, generator, types
│   │   └── tinygo/              # TinyGo implementation
│   └── matrix_mul/              # Matrix multiplication
│       ├── rust/src/            # Rust matrix operations
│       └── tinygo/              # TinyGo implementation
├── 🔧 scripts/                  # Build and automation
│   ├── build_all.sh            # Complete build pipeline
│   ├── build_rust.sh           # Rust-specific builds
│   ├── build_tinygo.sh         # TinyGo-specific builds
│   ├── build_config.js         # Configuration file generation
│   ├── run_bench.js            # Main benchmark orchestrator
│   ├── fingerprint.sh          # Environment fingerprinting
│   ├── validate_*.sh           # Task validation scripts
│   ├── services/               # Service architecture (DI pattern)
│   │   ├── BrowserService.js   # Browser automation
│   │   ├── ResultsService.js   # Result collection
│   │   └── LoggingService.js   # Structured logging
│   └── interfaces/             # Service interfaces
├── 🧪 harness/web/             # Browser test environment
│   ├── bench.html             # Test execution page
│   ├── bench.js               # Browser-side test logic
│   ├── config_loader.js       # Configuration management
│   └── wasm_loader.js         # WebAssembly module loading
├── 📊 analysis/                # Statistical analysis pipeline
│   ├── qc.py                  # Quality control & outlier detection
│   ├── statistics.py          # Welch's t-test, Cohen's d analysis
│   ├── plots.py               # Matplotlib visualization generation
│   ├── decision.py            # Decision support analysis
│   ├── data_models.py         # Data structure definitions
│   ├── validation.py          # Cross-language validation
│   └── common.py              # Shared utilities
├── 🧪 tests/                  # Comprehensive test suite
│   ├── unit/                  # Unit tests (Vitest)
│   │   ├── config-parser.test.js
│   │   └── statistics.test.js
│   ├── integration/           # Cross-language validation
│   │   └── cross-language.test.js
│   ├── utils/                 # Test utilities
│   └── setup.js              # Test configuration
├── ⚙️ configs/                # Configuration management
│   ├── bench.yaml            # Production benchmark config
│   ├── bench.json            # Compiled JSON configuration
│   ├── bench-quick.yaml      # Development/CI config
│   └── bench-quick.json      # Quick test configuration
├── 📈 results/                # Benchmark output data
├── 📋 reports/                # Generated reports and analysis
│   ├── plots/                 # Visualization outputs
│   └── statistics/            # Statistical analysis reports
├── 🗂️ data/                  # Reference data and validation
│   └── reference_hashes/      # Cross-language validation hashes
├── 🏗️ builds/                # Compiled WebAssembly modules
│   ├── rust/                  # Optimized Rust WASM files
│   └── tinygo/                # Optimized TinyGo WASM files
├── meta.json                  # Experiment metadata
├── versions.lock              # Toolchain version lock
├── pyproject.toml            # Python dependencies (Poetry)
├── package.json              # Node.js dependencies
├── vitest.config.js          # Test framework configuration
├── eslint.config.js          # Code quality configuration
└── Makefile                  # Automated build and workflow
```

## ⚙️ Installation & Setup

### **System Requirements**

- **macOS** 15+ (primary development platform)
- **Linux** Ubuntu 20.04+ (manual setup required)
- **Hardware**: 8GB+ RAM recommended for full benchmarks

> **Note**: Docker support for Linux is planned for future releases to simplify cross-platform setup.

### **Quick Setup**

```bash
# 1. Install required toolchains
# Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Go 1.25+: https://golang.org/dl/
# TinyGo 0.39+: go install tinygo.org/x/tools/...@latest
# Node.js 24+: nvm install 24 && nvm use 24
# Python 3.13+: curl -sSL https://install.python-poetry.org | python3 -

# 2. WebAssembly tools (macOS)
brew install binaryen wabt

# 3. Verify setup and install dependencies
make check deps
make init
```

### **Required Components**

| Tool | Version | Purpose |
|------|---------|----------|
| **Rust** | 1.89+ | WASM compilation with `wasm32-unknown-unknown` target |
| **TinyGo** | 0.39+ | Go-to-WASM compilation |
| **Node.js** | 24+ | Test harness and automation |
| **Python** | 3.13+ | Statistical analysis with Poetry |
| **Binaryen** | Latest | `wasm-opt` optimization |
| **WABT** | Latest | `wasm-strip` binary processing |

## 🏃 Running Benchmarks

### **Development Workflow**

```bash
# Quick validation (~2-3 minutes)
make run quick

# With visible browser (debugging)
make run quick headed

# Full benchmark suite (~30+ minutes)
make run

# Complete experimental pipeline
make all     # build → run → qc → analyze → plots
```

### **Command Reference**

| Command | Purpose | Duration | Use Case |
|---------|---------|----------|----------|
| `make run quick` | Fast development test | 2-3 min | Development validation |
| `make run` | Full benchmark suite | 30+ min | Research analysis |
| `make run quick headed` | Debug with visible browser | 2-3 min | Troubleshooting |
| `make all quick` | Complete pipeline (quick) | 5-8 min | CI/CD validation |
| `make all` | Complete research pipeline | 45-60 min | Publication data |

### **Advanced Options**

```bash
# Custom benchmark execution
node scripts/run_bench.js --parallel --max-concurrent=4
node scripts/run_bench.js --verbose
node scripts/run_bench.js --timeout=120000

# Configuration editing
# Edit configs/bench.yaml or configs/bench-quick.yaml
```

## 🔧 Technical Implementation

### **WebAssembly Interface**

Both languages export a unified **C-style interface** for fair comparison:

```c
void     init(uint32_t seed);           // Initialize PRNG
uint32_t alloc(uint32_t n_bytes);       // Allocate memory
uint32_t run_task(uint32_t params_ptr); // Execute & return result hash
```

### **Optimization Settings**

| Language | Target | Flags | Post-processing |
|----------|--------|-------|----------------|
| **Rust** | `wasm32-unknown-unknown` | `-O3`, fat LTO, 1 codegen unit | `wasm-strip`, `wasm-opt -O3` |
| **TinyGo** | `wasm` | `-opt=3`, panic trap, no debug | `wasm-strip`, `wasm-opt -Oz` |

### **Result Verification**

**FNV-1a Hash** ensures correctness across languages with **449 reference test vectors** (320 Mandelbrot, 112 JSON, 17 Matrix).

## 📊 Statistical Methodology

### **Quality Control Pipeline**

- **Outlier Detection**: IQR-based filtering (Q1-1.5×IQR, Q3+1.5×IQR)
- **Stability Validation**: Coefficient of Variation < 15% threshold
- **Sample Size**: Minimum 30 valid measurements per condition
- **Cross-Language Verification**: Hash-based result consistency

### **Statistical Analysis**

**Significance Testing**:

- **Welch's t-test** for unequal variances (more robust than Student's t-test)
- **p-value interpretation**: p < 0.05 for statistical significance
- **95% Confidence Intervals** for mean difference estimation

**Effect Size Analysis**:

- **Cohen's d** for practical significance assessment
- **Thresholds**: |d| < 0.2 (negligible), 0.2-0.5 (small), 0.5-0.8 (medium), ≥0.8 (large)
- **Decision Framework**: Statistical significance + effect size → language recommendation

### **Quality Standards**

| Metric | Threshold | Purpose |
|--------|-----------|----------|
| Coefficient of Variation | ≤ 15% | Measurement stability |
| Minimum Sample Size | ≥ 30 | Statistical power |
| Success Rate | ≥ 80% | Data reliability |
| Timeout Rate | ≤ 10% | System stability |

## 🔬 Reproducibility & Validation

### **Environment Fingerprinting**

```bash
# Generate reproducible environment snapshot
./scripts/fingerprint.sh
# Outputs: meta.json, versions.lock
```

**Locked Versions:**

- All toolchain versions recorded (`versions.lock`)
- Dependency versions pinned (`package-lock.json`, `poetry.lock`)
- System information captured (`meta.json`)
- Random seeds fixed for deterministic data generation

### **Validation Framework**

- ✅ **Hash Verification**: FNV-1a algorithm ensures implementation correctness
- ✅ **Cross-Language Consistency**: 449 reference test vectors
- ✅ **Statistical Validation**: Automated quality control checks
- ✅ **Audit Trail**: Complete logging of benchmark execution

## 🎯 Project Status & Features

### **✅ Completed (Production Ready)**

| Component | Status | Implementation |
|-----------|--------|----------------|
| **Statistical Analysis** | ✅ Complete | Welch's t-test, Cohen's d, confidence intervals |
| **Quality Control** | ✅ Complete | IQR outlier detection, CV validation |
| **Cross-Language Validation** | ✅ Complete | 449 reference test vectors |
| **Visualization System** | ✅ Complete | Bar charts, box plots, statistical tables |
| **Test Suite** | ✅ Complete | Unit, integration, E2E tests |
| **Build System** | ✅ Complete | Rust/TinyGo optimized builds |
| **Documentation** | ✅ Complete | Comprehensive guides and references |

### **Getting Help**

- **Command Reference**: `make help`
- **System Check**: `make status` for environment validation
- **Dependency Verification**: `make check deps` for toolchain validation
- **Issue Reporting**: Include output from `make info` and `make status`

## 📈 Results & Analysis

### **Visualization Outputs**

Generated in `reports/plots/`:

- **`execution_time_comparison.png`**: Bar charts with means, medians, error bars, and significance markers
- **`memory_usage_comparison.png`**: Memory consumption patterns with GC impact analysis
- **`effect_size_heatmap.png`**: Cohen's d effect size visualization with color-coded significance levels
- **`distribution_variance_analysis.png`**: Side-by-side box plots showing performance consistency and variance patterns
- **`decision_summary.html`**: Interactive HTML dashboard with comprehensive analysis results

### **Analysis Pipeline**

The analysis system provides comprehensive statistical evaluation:

```bash
# Step-by-step analysis
make qc          # Quality control: IQR outlier detection, CV validation
make stats       # Statistical analysis: Welch's t-tests, Cohen's d effect sizes
make plots       # Visualization generation: 4 chart types + HTML dashboard
make analyze     # Complete pipeline: qc → stats → plots → decision support

# Direct analysis execution
python analysis/qc.py          # Outlier detection and quality validation
python analysis/statistics.py  # Statistical significance testing
python analysis/plots.py       # Matplotlib chart generation
```

**Analysis Features:**

- **Quality Control**: Coefficient of variation analysis, outlier detection, success rate validation
- **Statistical Testing**: Welch's t-tests for unequal variances, 95% confidence intervals
- **Effect Size Analysis**: Cohen's d calculation with practical significance thresholds
- **Visualization Suite**: 4 chart types supporting engineering decision-making
- **Decision Support**: Automated language recommendation based on statistical evidence

## ⚠️ Limitations & Considerations

### **Environmental Factors**

- **Single-platform Testing**: Results primarily from macOS/Chromium environment
- **System Interference**: Background processes may affect timing precision
- **Browser Variations**: Results specific to Chromium V8 WebAssembly implementation

### **Benchmark Scope**

- **Limited Task Coverage**: Three computational patterns (not comprehensive)
- **No I/O Testing**: Focus on CPU/memory intensive workloads only
- **Single-threaded**: No multi-threading evaluation
- **Memory Model**: JavaScript-WASM boundary overhead not isolated
- **Variance Heterogeneity**: Welch's t-test accounts for unequal variances between languages
- **GC Impact**: TinyGo's garbage collector introduces measurement variability (higher CV thresholds)

## 📄 License

This project is licensed under the **MIT License** - see the [`LICENSE`](LICENSE) file for details.

---

**Keywords:** WebAssembly, WASM, Rust, Go, TinyGo, Performance, Benchmark, Comparison, Statistical Analysis
