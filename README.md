# WebAssembly Performance Benchmark: Go vs Rust

A comprehensive benchmarking framework to evaluate the efficiency of Golang (TinyGo) and Rust when compiled to WebAssembly across various computational workloads.

## Overview

This project compares WebAssembly performance between:
- **Rust 1.84+** with `wasm32-unknown-unknown` target (zero-cost abstractions, no GC)
- **TinyGo 0.34+** with WebAssembly target (garbage collected runtime)

**Test Environment:**
- **Hardware:** MacBook Pro M4 10-Core CPU, 16GB RAM
- **OS:** macOS 15.x
- **Browser:** Headless Chromium (Puppeteer)
- **Languages:** Rust 1.84+, Go 1.23+, TinyGo 0.34+, Node.js 22 LTS, Python 3.12+

## Benchmark Tasks

Five computational tasks designed to test different aspects of performance:

1. **Mandelbrot Set** - CPU-intensive floating-point calculations
2. **Array Sorting** - Integer operations and memory access patterns
3. **Base64 Encoding/Decoding** - Byte manipulation and lookup tables
4. **JSON Parsing** - Structured data processing and object allocation
5. **Matrix Multiplication** - Dense numerical computation

Each task is implemented with three data sizes (Small/Medium/Large) to progressively stress garbage collection in TinyGo.

## Key Metrics

- **Execution Time:** Pure function execution using `performance.now()`
- **Memory Usage:** Peak memory consumption during execution
- **Binary Size:** Raw `.wasm` size and gzipped size
- **Statistical Analysis:** Mean, standard deviation, 95% confidence intervals

## Project Structure

```
wasm-benchmark/
├── configs/
│   ├── bench.yaml              # Task configurations
│   └── versions.lock           # Toolchain versions
├── harness/
│   └── web/
│       ├── bench.html          # Benchmark runner page
│       ├── bench.js            # WebAssembly loader and timer
│       └── wasm_loader.js      # Module instantiation
├── scripts/
│   ├── build_rust.sh          # Rust build script
│   ├── build_tinygo.sh        # TinyGo build script
│   ├── build_all.sh           # Complete build pipeline
│   ├── run_browser_bench.js   # Puppeteer test runner
│   ├── fingerprint.sh         # Environment fingerprinting
│   └── all_in_one.sh          # Full experiment pipeline
├── tasks/
│   ├── mandelbrot/
│   │   ├── rust/              # Rust implementation
│   │   └── tinygo/            # TinyGo implementation
│   ├── array_sort/            # Array sorting task
│   ├── base64/                # Base64 codec task
│   ├── json_parse/            # JSON parsing task
│   └── matrix_mul/            # Matrix multiplication task
├── builds/                    # Compiled WebAssembly modules
├── results/                   # Benchmark data and logs
├── analysis/                  # Statistical analysis and plots
└── docs/                      # Documentation
```

## Quick Start

### Prerequisites

Install required toolchains:

```bash
# Rust with WebAssembly target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Go and TinyGo
brew install go tinygo

# Node.js and Python
brew install node python@3.12

# WebAssembly tools
brew install binaryen wabt

# Python dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Running the Benchmark

```bash
# Initialize environment and install dependencies
make init

# Build all WebAssembly modules
make build

# Run benchmark tests
make run

# Collect and validate data
make collect

# Generate statistical analysis
make analyze

# Create final report
make report
```

Or run the complete pipeline:

```bash
./scripts/all_in_one.sh
```

## Implementation Details

### WebAssembly Interface

Both languages export a unified C-style interface:

```c
// Initialize random seed
void init(uint32_t seed);

// Allocate memory and return pointer
uint32_t alloc(uint32_t n_bytes);

// Execute task and return hash of results
uint32_t run_task(uint32_t params_ptr);
```

### Build Optimizations

**Rust Configuration:**
```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "debuginfo"
```

**TinyGo Compilation:**
```bash
tinygo build -target=wasm -opt=3 -panic=trap -no-debug -scheduler=none
```

### Verification System

Each task implements polynomial rolling hash verification:
```c
hash = (hash * 31 + value) & 0xFFFFFFFF
```

This ensures identical results across languages and detects implementation errors.

## Statistical Analysis

- **Warmup:** 10 iterations (discarded)
- **Measurement:** 100 iterations per task/language combination
- **Outlier Detection:** IQR method with 1.5×IQR and 3×IQR thresholds
- **Significance Testing:** Independent t-test or Mann-Whitney U test
- **Multiple Comparison Correction:** Benjamini-Hochberg FDR control
- **Effect Size:** Cohen's d calculation

## Results and Analysis

The benchmark generates:

- **Raw Data:** JSON/CSV format with execution times and memory usage
- **Statistical Reports:** Means, standard deviations, confidence intervals
- **Visualizations:** Bar charts, box plots, scatter plots (PNG/SVG)
- **Significance Testing:** p-values with multiple comparison correction
- **Effect Sizes:** Cohen's d for practical significance

## Reproducibility

- **Environment Fingerprinting:** All tool versions locked in `versions.lock`
- **Data Integrity:** SHA256 checksums for all build artifacts and datasets
- **Quality Control:** Automated outlier detection and variance analysis
- **Full Automation:** One-command reproduction via `make` or `all_in_one.sh`

## Limitations

- **Single-threaded:** WebAssembly threading not utilized
- **Browser-specific:** Results specific to V8 JavaScript engine
- **Memory constraints:** Limited by 16GB system RAM
- **Task selection:** Five tasks may not represent all use cases
- **Platform-specific:** Results specific to Apple M4 architecture

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add new benchmark tasks in `tasks/`
4. Update build scripts and analysis accordingly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.



