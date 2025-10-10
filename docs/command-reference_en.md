# 🚀 WebAssembly Benchmark Project - Command Reference Guide

## 📋 Overview

This document provides a comprehensive guide for developers taking over the WebAssembly Benchmark project. It covers all available commands, their purposes, execution sequences, and common troubleshooting scenarios for both development and research workflows.

### 🛠️ Key Technologies

- WebAssembly (WASM) compilation targets
- Rust and TinyGo implementations with unified C-ABI interface
- Node.js test harness with Puppeteer browser automation (v24.22.0)
- Python statistical analysis pipeline with NumPy 2.3+, SciPy 1.10+, Matplotlib 3.6+
- Make-based automation system with service-oriented architecture (5 core services)
- uv for Python dependency management
- Vitest for JavaScript testing framework (ConfigurationService, BrowserService, ResultsService)

### 📁 Project Structure

- `tasks/` - Benchmark implementations (Rust/TinyGo)
- `scripts/` - Build and automation scripts
- `tests/` - Test suites (unit, integration, e2e)
- `analysis/` - Statistical analysis tools
- `results/` - Benchmark output data
- `docs/` - Project documentation

---

## 🏷️ Command Categories

### ⚙️ Environment Setup

Commands for initializing development environment and dependencies.

### 🔨 Build System

Commands for compiling WebAssembly modules and managing builds.

### 🧪 Test Suite

Commands for running different levels of testing and validation.

### 📊 Benchmark Execution

Commands for running performance benchmarks with various configurations.

### 📈 Analysis Pipeline

Commands for processing results and generating reports.

### 🧹 Maintenance

Commands for cleaning, linting, and project maintenance.

---

## 💻 Development Workflows

### 🆕 New Developer Setup

#### Setup Purpose

Set up development environment from scratch

#### Setup Flow

```bash
make check deps → make init → make build → make status → make test
```

#### Setup Timeline

10-20 minutes (depending on compilation time and system performance)

#### Setup Expected Outcome

Fully configured development environment with verified functionality

### 🔄 Daily Development Cycle

#### Development Purpose

Standard development and testing workflow

#### Development Flow

```bash
git pull → make build → make test → [code changes] → make test → git commit
```

#### Development Timeline

2-5 minutes per cycle

#### Development Expected Outcome

Verified code changes with passing tests

### ✅ Pre-Release Validation

#### Validation Purpose

Comprehensive validation before deployment

#### Validation Flow

```bash
make clean → make build → make test → make all quick
```

#### Validation Timeline

20-40 minutes

#### Validation Expected Outcome

Full validation with verified builds and test coverage (no performance analysis)

---

## 🔬 Research Workflows

### ⚡ Quick Performance Analysis

#### Quick Analysis Purpose

Fast performance comparison for development

#### Quick Analysis Flow

```bash
make build → make run quick
```

#### Quick Analysis Timeline

5-10s

#### Quick Analysis Expected Outcome

Verified build integrity and module correctness (no performance data generated)

### 🧪 Comprehensive Research Experiment

#### Research Purpose

Full research-grade performance analysis

#### Research Flow

```bash
make clean → make all
```

#### Research Timeline

30-60 minutes

#### Research Expected Outcome

Complete research dataset with statistical significance

### 🎯 Focused Task Analysis

#### Focused Purpose

Analyze specific benchmark task performance

#### Focused Flow

```bash
make build → make run → make analyze
```

#### Focused Timeline

10-20 minutes

#### Focused Expected Outcome

Detailed analysis of single benchmark task

---

## 📖 Command Reference

### 🔧 Makefile Commands

#### make check deps

**Purpose**: Verify all required tools and dependencies are available
**When to Use**: Before any other operations, especially in new environments
**Prerequisites**: None
**Common Issues**: Missing Rust/TinyGo toolchain, Node.js version incompatibility

#### make init

**Purpose**: Initialize development environment, install Node.js and Python dependencies, generate environment fingerprint
**When to Use**: First-time setup or after clean-all
**Prerequisites**: check-deps passed

**Dependencies Installed**:

- Node.js packages via npm ci (chalk, puppeteer, yaml, eslint, express, vitest)
- Python packages via uv (numpy, matplotlib, scipy, pyyaml, black, ruff)
- Environment fingerprint (versions.lock, meta.json)

**Common Issues**: Network connectivity, uv not installed, permission issues

#### make build

**Purpose**: Build WebAssembly modules or config (use: make build [rust/tinygo/all/config/parallel/no-checksums])
**When to Use**: After code changes, before testing or benchmarking
**Prerequisites**: init completed

**Options**:

- `make build` - Build both Rust and TinyGo modules
- `make build rust` - Build only Rust modules
- `make build tinygo` - Build only TinyGo modules
- `make build all` - Build all with full pipeline and optimization analysis
- `make build config` - Build configuration files from YAML
- `make build parallel` - Build tasks in parallel
- `make build no-checksums` - Skip checksum verification

**Common Issues**: Compilation errors, missing source files, Rust/TinyGo toolchain issues

#### make run

**Purpose**: Run browser benchmark suite (use quick headed for options)
**When to Use**: Performance testing and data collection
**Prerequisites**: build completed

**Options**:

- `make run` - Run with default configuration
- `make run quick` - Run quick benchmarks for development
- `make run headed` - Run with visible browser for debugging
- `make run quick headed` - Quick benchmarks with visible browser

**Common Issues**: Browser automation failures, timeout issues, missing configuration

#### make qc

**Purpose**: Run quality control on benchmark data (use quick for quick mode)
**When to Use**: After benchmark execution to validate data quality
**Prerequisites**: benchmark results available

**Options**:

- `make qc` - Full quality control analysis
- `make qc quick` - Quick quality control for development

**Common Issues**: Missing Python dependencies, no results data, uv environment issues

#### make validate

**Purpose**: Run benchmark validation analysis (use quick for quick mode)
**When to Use**: After benchmark execution to validate data integrity
**Prerequisites**: benchmark results available

**Options**:

- `make validate` - Full validation analysis
- `make validate quick` - Quick validation for development

**Common Issues**: Missing Python dependencies, no results data

#### make stats

**Purpose**: Run statistical analysis (use quick for quick mode)
**When to Use**: After benchmark execution to compute statistical metrics
**Prerequisites**: benchmark results available

**Options**:

- `make stats` - Full statistical analysis
- `make stats quick` - Quick statistical analysis for development

**Common Issues**: Missing Python dependencies, uv not initialized

#### make plots

**Purpose**: Generate analysis plots (use quick for quick mode)
**When to Use**: After benchmark execution to create visualizations
**Prerequisites**: benchmark results available

**Options**:

- `make plots` - Generate full plot suite
- `make plots quick` - Generate quick development plots

**Common Issues**: Missing Python dependencies, matplotlib display issues

#### make analyze

**Purpose**: Run validation, quality control, statistical analysis, and plotting (use quick for quick mode)
**When to Use**: After benchmark execution for complete analysis
**Prerequisites**: benchmark results available
**Pipeline**: validate → qc → stats → plots

**Options**:

- `make analyze` - Full analysis pipeline
- `make analyze quick` - Quick analysis for development

**Common Issues**: Missing Python dependencies, uv not initialized, matplotlib display issues

#### make all

**Purpose**: Execute complete experiment pipeline (build → run → analyze)
**When to Use**: Full research experiments
**Prerequisites**: init completed
**Common Issues**: Long execution time, any step failure stops pipeline

#### make all quick

**Purpose**: Complete pipeline with quick settings for development/testing
**When to Use**: Development verification, quick experimentation
**Prerequisites**: init completed
**Common Issues**: No benchmark data generated, analysis step should be omitted

#### make clean

**Purpose**: Clean everything including dependencies, results, and caches
**When to Use**: Build issues, disk space cleanup, environment reset

**Cleaned Items**:

- Node.js dependencies (node_modules/)
- Build artifacts (*.wasm, checksums.txt, sizes.csv, metrics.json)
- Generated configuration files (bench.json, bench-quick.json)
- Reports and plots (except templates/)
- Results directories
- Environment locks (versions.lock, uv.lock, package-lock.json)
- Metadata files (meta.json)
- Log files (*.log, dev-server.log)
- Cache files (.cache.*)
- Temporary files (\*.tmp, \_\_pycache\_\_, \*.pyc)
- Rust build artifacts (target/, Cargo.lock)

**Preserved Items**:

- Source YAML configs (bench.yaml, bench-quick.yaml)
- Report templates (reports/plots/templates/)

**Common Issues**: Permission issues on protected files, accidental data loss (confirmation required)

#### make lint

**Purpose**: Run code quality checks (use: make lint [python/rust/go/js])
**When to Use**: Code quality assurance, pre-commit checks
**Prerequisites**: Dependencies installed

**Options**:

- `make lint` - Run all language linters
- `make lint python` - Python linting with ruff
- `make lint rust` - Rust linting with cargo clippy
- `make lint go` - Go linting with go vet and gofmt
- `make lint js` - JavaScript linting with ESLint

**Common Issues**: Missing linters, code formatting issues, linting rule violations

#### make format

**Purpose**: Format code (use: make format [python/rust/go])
**When to Use**: Code formatting, consistent style
**Prerequisites**: Dependencies installed

**Options**:

- `make format` - Format all supported languages
- `make format python` - Python formatting with black
- `make format rust` - Rust formatting with cargo fmt
- `make format go` - Go formatting with gofmt

**Common Issues**: Missing formatters, conflicting formatting rules

#### make test

**Purpose**: Run tests (use: make test [validate] or run all tests)
**When to Use**: Test execution, validation
**Prerequisites**: Dependencies installed

**Options**:

- `make test` - Run all available tests (JavaScript + Python)
- `make test validate` - Run WASM task validation suite

**Common Issues**: Missing test runners, environment setup issues

#### make status

**Purpose**: Show comprehensive project status with environment, build, and experiment information
**When to Use**: Debugging, status verification, environment validation

**Displays**:

- 🔧 Environment Dependencies: Python, Node.js, Rust, TinyGo versions and availability status
- 📦 Build Status: WASM module counts (Rust/TinyGo out of 3), checksums availability, build metrics
- 🧪 Benchmark Tasks: Available tasks (mandelbrot, json_parse, matrix_mul), scales (small/medium/large), quality settings (50 runs × 4 reps)
- 📈 Experiment Results: Total experiment runs count, latest experiment filename, quick vs full benchmark status
- 🚀 Quick Commands: Common shortcuts for development with time estimates

**Common Issues**: None (informational only)

#### make info

**Purpose**: Show detailed system and benchmark environment information
**When to Use**: Debugging environment issues, system compatibility checks

**Displays**:

- 🖥️ System Hardware: OS version, architecture, CPU cores, memory size
- 🛠️ Compilation Toolchain: Make, Rust, Cargo, TinyGo, Go versions and availability
- 🌍 Runtime Environment: Node.js, npm, Python versions, Puppeteer configuration status
- 🔧 WASM Tools: wasm-strip (wabt), wasm-opt (binaryen) availability status
- 🧪 Benchmark Configuration: Config file location, available tasks, scales, quality settings (50 runs × 4 repetitions)
- 📁 Project Info: Version, license, purpose, environment fingerprint hash

**Common Issues**: None (informational only)

**Note**: This is the updated syntax for dependency checking (was `make check-deps`)

### 🐳 Docker Container Commands

#### make docker [subcommand]

**Purpose**: Docker container operations (use: make docker [start|stop|restart|status|logs|shell|init|build|run|full|analyze|validate|qc|stats|plots|test|info|clean|help] [flags])
**When to Use**: Running the project in a containerized environment
**Prerequisites**: Docker installed and running

**Subcommands**:

- `make docker start` - Start Docker container with health checks
- `make docker stop` - Stop Docker container gracefully
- `make docker restart` - Restart container with verification
- `make docker status` - Show container status and resource usage
- `make docker logs` - Show recent container logs
- `make docker shell` - Enter container for development
- `make docker init` - Initialize environment in container
- `make docker build [flags]` - Build WebAssembly modules in container
- `make docker run [flags]` - Run benchmarks in container
- `make docker full [flags]` - Run complete pipeline in container
- `make docker analyze [flags]` - Run analysis pipeline in container
- `make docker validate [flags]` - Run benchmark validation in container
- `make docker qc [flags]` - Run quality control in container
- `make docker stats [flags]` - Run statistical analysis in container
- `make docker plots [flags]` - Generate analysis plots in container
- `make docker test [flags]` - Run tests in container
- `make docker info` - Show system information from container
- `make docker clean [all]` - Clean containers and images
- `make docker help` - Show Docker help information

**Build Flags**:

- `rust` - Build only Rust modules
- `tinygo` - Build only TinyGo modules
- `config` - Build configuration files
- `parallel` - Build tasks in parallel
- `no-checksums` - Skip checksum verification

**Run Flags**:

- `quick` - Use quick configuration

**Test Flags**:

- `validate` - Run WASM task validation

**Clean Flags**:

- `all` - Complete cleanup including images

**Common Issues**: Docker not running, container startup failures, permission issues

### 📦 NPM Script Commands

#### npm run dev

**Purpose**: Start development server with auto-opening browser
**When to Use**: Interactive development and testing
**Prerequisites**: Dependencies installed
**Server**: Runs on port 2025, logs to dev-server.log
**Common Issues**: Port conflicts, browser opening failures

#### npm run serve:port

**Purpose**: Start development server on specified port (uses PORT environment variable)
**When to Use**: Server-only mode with custom port configuration
**Prerequisites**: Dependencies installed
**Example**: `PORT=3000 npm run serve:port`
**Common Issues**: Port already in use, environment variable issues

#### npm run test

**Purpose**: Run full test suite (JavaScript and Python) with verbose output
**When to Use**: Comprehensive testing and validation
**Prerequisites**: Dependencies installed, build completed
**Test Framework**: Vitest with 300s timeout
**Common Issues**: Long execution time, environment dependencies

#### npm run test:smoke

**Purpose**: Quick validation tests for core functionality
**When to Use**: Fast development feedback
**Prerequisites**: Build completed
**Test Framework**: Vitest with 10s timeout
**Common Issues**: Browser automation setup issues

#### npm run test:unit

**Purpose**: Run isolated unit tests
**When to Use**: Testing specific components
**Prerequisites**: Dependencies installed
**Test Framework**: Vitest with 5s timeout
**Common Issues**: Test environment configuration

#### npm run test:integration

**Purpose**: Run cross-language consistency tests
**When to Use**: Validating language implementation consistency
**Prerequisites**: Build completed, server running
**Test Framework**: Vitest with 60s timeout
**Common Issues**: Browser compatibility, timing issues

### 🐍 Python Script Commands

#### wasm-benchmark-qc

**Purpose**: Quality control analysis of benchmark results
**When to Use**: Validating data integrity and statistical assumptions
**Prerequisites**: Results data available
**Analysis**: Outlier detection, normality tests, variance analysis
**Common Issues**: Missing data files, statistical assumption violations

#### wasm-benchmark-stats

**Purpose**: Statistical analysis of benchmark results
**When to Use**: Computing significance tests and effect sizes
**Prerequisites**: Results data available
**Analysis**: Welch's t-test, Cohen's d effect size, confidence intervals
**Common Issues**: Insufficient sample sizes, non-normal distributions

#### wasm-benchmark-plots

**Purpose**: Generate visualization plots for benchmark results
**When to Use**: Creating publication-ready charts and graphs
**Prerequisites**: Results data available
**Output**: PNG files in reports/plots/ directory
**Common Issues**: Matplotlib backend issues, missing data

#### wasm-benchmark-validate

**Purpose**: Cross-language validation of task implementations
**When to Use**: Verifying WASM module correctness
**Prerequisites**: Build completed
**Validation**: FNV-1a hash comparison across languages
**Common Issues**: Hash mismatches, WASM loading failures

## 🔄 Command Usage Patterns

### 💻 Typical Development Workflow

```bash
# Initial setup
make init

# Development cycle
make build config quick
npm run dev &
make run quick
make qc quick
make analyze quick

# Full validation
make test
```

### 🚀 Production Benchmarking Workflow

```bash
# Complete benchmark run
make init
make build all
make run
make qc
make analyze
make plots
```

### 🔍 Troubleshooting Workflow

```bash
# Check system status
make status
make info

# Clean and rebuild
make clean
make init
make build all

# Validate components
make validate
make test
```

**Note**: `make clean` now performs complete cleanup (no need for `make clean all`)

## ✅ Best Practices Summary

- **Always run `make init`** before starting work
- **Use quick modes** during development for faster feedback
- **Run full validation** before publishing results
- **Check logs** in dev-server.log for server issues
- **Use `make status`** to verify system readiness and environment state
- **Use `make info`** for detailed system and toolchain information
- **Clean builds** with `make clean` when switching toolchains or resetting environment

### ⚙️ Run Bench Script Options

#### node scripts/run_bench.js

**Purpose**: Execute benchmark suite with various configuration options
**When to Use**: Performance testing and data collection with custom settings
**Prerequisites**: build completed, configuration files exist

**Available Options:**

- `--headed`: Run in headed mode (show browser)
- `--devtools`: Open browser DevTools
- `--verbose`: Enable verbose logging
- `--parallel`: Enable parallel benchmark execution
- `--quick`: Use quick configuration for fast development testing
- `--timeout=<ms>`: Set timeout in milliseconds (default: 300000, quick: 30000)
- `--max-concurrent=<n>`: Max concurrent benchmarks in parallel mode (default: 4, max: 20)
- `--failure-threshold=<rate>`: Failure threshold rate 0-1 (default: 0.3)
- `--help, -h`: Show help message

**Common Usage Examples:**

```bash
# Basic headless run
node scripts/run_bench.js

# Development with visible browser
node scripts/run_bench.js --headed

# Quick development testing
node scripts/run_bench.js --quick

# Verbose output for debugging
node scripts/run_bench.js --verbose

# Parallel execution
node scripts/run_bench.js --parallel --max-concurrent=5

# Custom timeout for slow systems
node scripts/run_bench.js --timeout=600000

# Conservative failure handling
node scripts/run_bench.js --failure-threshold=0.1
```

**Common Issues**: Browser automation failures, timeout issues, configuration file missing
