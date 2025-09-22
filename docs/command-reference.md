# WebAssembly Benchmark Project - Command Reference Guide

## Overview

This document provides a comprehensive guide for developers taking over the WebAssembly Benchmark project. It covers all available commands, their purposes, execution sequences, and common troubleshooting scenarios for both development and research workflows.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Command Categories](#command-categories)
3. [Development Workflows](#development-workflows)
4. [Research Workflows](#research-workflows)
5. [Command Reference](#command-reference)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Flow Charts](#flow-charts)

---

## Project Overview

This project benchmarks WebAssembly performance by comparing Rust and TinyGo implementations across multiple computational tasks. The project supports both development and research scenarios with automated pipelines for building, testing, and analyzing performance data.

### Key Technologies

- WebAssembly (WASM) compilation targets
- Rust and TinyGo implementations
- Node.js test harness with Puppeteer
- Python statistical analysis pipeline
- Make-based automation system

### Project Structure

- `tasks/` - Benchmark implementations (Rust/TinyGo)
- `scripts/` - Build and automation scripts
- `tests/` - Test suites (unit, integration, e2e)
- `analysis/` - Statistical analysis tools
- `results/` - Benchmark output data
- `docs/` - Project documentation

---

## Command Categories

### Environment Setup

Commands for initializing development environment and dependencies.

### Build System

Commands for compiling WebAssembly modules and managing builds.

### Test Suite

Commands for running different levels of testing and validation.

### Benchmark Execution

Commands for running performance benchmarks with various configurations.

### Analysis Pipeline

Commands for processing results and generating reports.

### Maintenance

Commands for cleaning, linting, and project maintenance.

---

## Development Workflows

### New Developer Setup

#### Setup Purpose

Set up development environment from scratch

#### Setup Flow

```bash
make check-deps → make init → make build → npm run test:smoke → make status
```

#### Setup Timeline

10-20 minutes (depending on compilation time and system performance)

#### Setup Expected Outcome

Fully configured development environment with verified functionality

### Daily Development Cycle

#### Development Purpose

Standard development and testing workflow

#### Development Flow

```bash
git pull → make build → npm run test:unit → [code changes] → npm run test:smoke → git commit
```

#### Development Timeline

2-5 minutes per cycle

#### Development Expected Outcome

Verified code changes with passing tests

### Pre-Release Validation

#### Validation Purpose

Comprehensive validation before deployment

#### Validation Flow

```bash
make clean-all → make build → npm run test → make all-quick
```

#### Validation Timeline

20-40 minutes

#### Validation Expected Outcome

Full validation with verified builds and test coverage (no performance analysis)

---

## Research Workflows

### Quick Performance Analysis

#### Quick Analysis Purpose

Fast performance comparison for development

#### Quick Analysis Flow

```bash
make build → make run-quick
```

#### Quick Analysis Timeline

2-3 minutes

#### Quick Analysis Expected Outcome

Verified build integrity and module correctness (no performance data generated)

### Comprehensive Research Experiment

#### Research Purpose

Full research-grade performance analysis

#### Research Flow

```bash
make clean-all → make all
```

#### Research Timeline

30-60 minutes

#### Research Expected Outcome

Complete research dataset with statistical significance

### Focused Task Analysis

#### Focused Purpose

Analyze specific benchmark task performance

#### Focused Flow

```bash
make build → npm run bench → make analyze
```

#### Focused Timeline

10-20 minutes

#### Focused Expected Outcome

Detailed analysis of single benchmark task

---

## Command Reference

### Makefile Commands

#### **make check-deps**

**Purpose**: Verify all required tools and dependencies are available
**When to Use**: Before any other operations, especially in new environments
**Prerequisites**: None
**Common Issues**: Missing Rust/TinyGo toolchain, Node.js version incompatibility

#### **make init**

**Purpose**: Initialize development environment and install dependencies
**When to Use**: First-time setup or after clean-all
**Prerequisites**: check-deps passed
**Common Issues**: Network connectivity, permission issues with pip/npm

#### **make build**

**Purpose**: Build all WebAssembly modules for both Rust and TinyGo
**When to Use**: After code changes, before testing or benchmarking
**Prerequisites**: init completed
**Common Issues**: Compilation errors, missing source files

#### **make build-rust**

**Purpose**: Build only Rust WebAssembly modules
**When to Use**: Working specifically on Rust implementations
**Prerequisites**: Rust toolchain available
**Common Issues**: Rust compilation errors, wasm-pack issues

#### **make build-tinygo**

**Purpose**: Build only TinyGo WebAssembly modules
**When to Use**: Working specifically on TinyGo implementations
**Prerequisites**: TinyGo toolchain available
**Common Issues**: TinyGo compilation errors, WASM target issues

#### **make build-all**

**Purpose**: Build all modules with optimization and size reporting
**When to Use**: Production builds with detailed optimization analysis
**Prerequisites**: init completed
**Common Issues**: Compilation errors, optimization tool availability

#### **make build-config**

**Purpose**: Build configuration file (bench.json) from YAML
**When to Use**: After modifying bench.yaml configuration
**Prerequisites**: bench.yaml exists
**Common Issues**: YAML syntax errors, missing configuration fields

#### **make build-config-quick**

**Purpose**: Build quick configuration file (bench-quick.json) from YAML
**When to Use**: After modifying bench-quick.yaml for development testing
**Prerequisites**: bench-quick.yaml exists
**Common Issues**: YAML syntax errors, missing configuration fields

#### **make run**

**Purpose**: Execute benchmark suite with default configuration
**When to Use**: Performance testing and data collection
**Prerequisites**: build completed
**Common Issues**: Browser automation failures, timeout issues

#### **make run-headed**

**Purpose**: Run benchmarks with visible browser (debugging mode)
**When to Use**: Debugging benchmark issues, visual verification
**Prerequisites**: build completed, display available
**Common Issues**: Display/X11 forwarding issues in headless environments

#### **make run-quick**

**Purpose**: Run quick benchmarks for development (~2-3 min vs 30+ min full suite)
**When to Use**: Development validation, verifying builds work correctly
**Prerequisites**: build completed
**Common Issues**: Build failures, validation script errors

#### **make qc**

**Purpose**: Run quality control on benchmark data
**When to Use**: After benchmark execution to validate data quality
**Prerequisites**: benchmark results available
**Common Issues**: Missing Python dependencies, no results data

#### **make analyze**

**Purpose**: Run statistical analysis and generate plots
**When to Use**: After benchmark execution
**Prerequisites**: benchmark results available
**Common Issues**: Missing Python dependencies, no results data

#### **make all**

**Purpose**: Execute complete experiment pipeline (build → run → analyze)
**When to Use**: Full research experiments
**Prerequisites**: init completed
**Common Issues**: Long execution time, any step failure stops pipeline

#### **make all-quick**

**Purpose**: Complete pipeline with quick settings for development/testing
**When to Use**: Development verification, quick experimentation
**Prerequisites**: init completed
**Common Issues**: No benchmark data generated, analysis step should be omitted

#### **make clean**

**Purpose**: Remove build artifacts and temporary files
**When to Use**: Build issues, disk space cleanup
**Prerequisites**: None
**Common Issues**: Permission issues on protected files

#### **make clean-results**

**Purpose**: Clean all benchmark results (with confirmation)
**When to Use**: Disk space cleanup, removing old experiment data
**Prerequisites**: None
**Common Issues**: Accidental data loss, permission issues

#### **make clean-all**

**Purpose**: Complete cleanup including dependencies
**When to Use**: Fresh start, resolving dependency conflicts
**Prerequisites**: None
**Common Issues**: Requires re-running init afterward

#### **make clean-cache**

**Purpose**: Clean discovery cache files
**When to Use**: Cache corruption, performance issues
**Prerequisites**: None
**Common Issues**: None (informational only)

#### **make cache-file-discovery**

**Purpose**: Cache file discovery results for performance
**When to Use**: Performance optimization for large codebases
**Prerequisites**: None
**Common Issues**: None (informational only)

#### **make status**

**Purpose**: Display current project state and environment info
**When to Use**: Debugging, status verification
**Prerequisites**: None
**Common Issues**: None (informational only)

#### **make info**

**Purpose**: Show system information
**When to Use**: Debugging environment issues
**Prerequisites**: None
**Common Issues**: None (informational only)

#### **make validate**

**Purpose**: Run WASM task validation suite
**When to Use**: Verifying implementation correctness
**Prerequisites**: build completed
**Common Issues**: WASM module loading failures

### NPM Script Commands

#### **npm run dev**

**Purpose**: Start development server with auto-opening browser
**When to Use**: Interactive development and testing
**Prerequisites**: Dependencies installed
**Common Issues**: Port conflicts, browser opening failures

#### **npm run serve:port**

**Purpose**: Start development server on specified port (uses PORT environment variable)
**When to Use**: Server-only mode with custom port configuration
**Prerequisites**: Dependencies installed
**Common Issues**: Port already in use, environment variable issues

#### **npm run test**

**Purpose**: Run full test suite (JavaScript and Python) with verbose output
**When to Use**: Comprehensive testing and validation
**Prerequisites**: Dependencies installed, build completed
**Common Issues**: Long execution time, environment dependencies

#### **npm run test:smoke**

**Purpose**: Quick validation tests for core functionality
**When to Use**: Fast development feedback
**Prerequisites**: Build completed
**Common Issues**: Browser automation setup issues

#### **npm run test:unit**

**Purpose**: Run isolated unit tests
**When to Use**: Testing specific components
**Prerequisites**: Dependencies installed
**Common Issues**: Test environment configuration

#### **npm run test:integration**

**Purpose**: Run cross-language consistency tests
**When to Use**: Validating language implementation consistency
**Prerequisites**: Build completed, server running
**Common Issues**: Browser compatibility, timing issues

#### **npm run build**

**Purpose**: Build configuration and WebAssembly modules
**When to Use**: Alternative to make build
**Prerequisites**: Dependencies installed
**Common Issues**: Build script execution failures

#### **npm run bench**

**Purpose**: Run benchmarks with custom configuration
**When to Use**: Specific benchmark scenarios
**Prerequisites**: Build completed
**Common Issues**: Configuration parameter errors

#### **npm run validate**

**Purpose**: Validate all task implementations
**When to Use**: Verifying implementation correctness
**Prerequisites**: Build completed
**Common Issues**: WASM module loading failures

### Run Bench Script Options

#### **node scripts/run_bench.js**

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

## Troubleshooting Guide

### Build Issues

#### Rust Compilation Failures

- **Symptoms**: Cargo build errors, missing dependencies
- **Solutions**:
  - Verify Rust toolchain: `rustup show`
  - Update Rust: `rustup update`
  - Check wasm-pack: `wasm-pack --version`
  - Clean Rust cache: `cargo clean`

#### TinyGo Compilation Failures

- **Symptoms**: TinyGo build errors, WASM target issues
- **Solutions**:
  - Verify TinyGo installation: `tinygo version`
  - Check WASM target support: `tinygo targets`
  - Update TinyGo to latest version
  - Verify Go version compatibility

#### Cross-Platform Issues

- **Symptoms**: `numfmt: command not found` on macOS
- **Solutions**: This has been fixed with portable formatting functions
- **Prevention**: Use provided build scripts, avoid direct GNU tools

### Test Failures

#### Browser Automation Issues

- **Symptoms**: Puppeteer timeouts, browser launch failures
- **Solutions**:
  - Check Chrome/Chromium installation
  - Verify display configuration (headless vs headed)
  - Increase timeout values for slow systems
  - Check port availability (default: 2025)

#### Cross-Language Consistency Failures

- **Symptoms**: Hash mismatches, precision differences
- **Solutions**:
  - Verify both implementations built successfully
  - Check floating-point standardization
  - Run validation script: `npm run validate`
  - Review recent changes to algorithm implementations

#### Performance Measurement Issues

- **Symptoms**: Invalid timing data, coefficient of variation warnings
- **Solutions**: These have been fixed in recent updates
- **Verification**: Ensure property path consistency in test code

### Environment Issues

#### Dependency Conflicts

- **Symptoms**: Version mismatches, installation failures
- **Solutions**:
  - Run `make clean-all` followed by `make init`
  - Check Node.js version: `node --version` (>=18.0.0 required)
  - Verify Python version: `python3 --version`
  - Clear npm cache: `npm cache clean --force`

#### Permission Issues

- **Symptoms**: Access denied, file permission errors
- **Solutions**:
  - Check file permissions in build directories
  - Avoid running as root unless necessary
  - Verify write access to results/ and builds/
  - Use `--user` flag for pip installations

#### Memory/Resource Issues

- **Symptoms**: Out of memory, slow performance
- **Solutions**:
  - Monitor system resources during builds/tests
  - Use `make all-quick` for resource-constrained environments
  - Adjust timeout values in test configurations
  - Close unnecessary applications

### Analysis Issues

#### Missing Results Data

- **Symptoms**: No data to analyze, analysis script failures
- **Solutions**:
  - Verify benchmark execution completed successfully
  - Check results/ directory for recent data
  - Ensure proper file permissions
  - Re-run benchmarks if data is corrupted

#### Statistical Analysis Errors

- **Symptoms**: Python script failures, plotting errors
- **Solutions**:
  - Verify Python dependencies: `pip3 list`
  - Check data file formats and integrity
  - Ensure matplotlib/numpy compatibility
  - Review analysis script for recent changes

---

## Flow Charts

### Development Workflow

```mermaid
flowchart TD
    A[New Developer] --> B[make check-deps]
    B --> C{Dependencies OK?}
    C -->|No| D[Install Missing Tools]
    D --> B
    C -->|Yes| E[make init]
    E --> F[make build]
    F --> G{Build Success?}
    G -->|No| H[Fix Build Issues]
    H --> F
    G -->|Yes| I[npm run test:smoke]
    I --> J{Tests Pass?}
    J -->|No| K[Fix Test Issues]
    K --> I
    J -->|Yes| L[Development Ready]

    L --> M[Code Changes]
    M --> N[make build]
    N --> O[npm run test:unit]
    O --> P{Tests Pass?}
    P -->|No| M
    P -->|Yes| Q[Commit Changes]
    Q --> M
```

### Research Workflow

```mermaid
flowchart TD
    A[Research Analysis] --> B{Analysis Type?}
    B -->|Quick| C[make build]
    B -->|Comprehensive| D[make clean-all]

    C --> E[make run-quick]
    E --> G[Validation Results]

    D --> I[make all]
    I --> K[Research Dataset]

    G --> L[Iterate/Refine]
    K --> L
    L --> M{More Analysis?}
    M -->|Yes| B
    M -->|No| N[Complete]
```

### Troubleshooting Decision Tree

```mermaid
flowchart TD
    A[Issue Encountered] --> B{Issue Type?}
    B -->|Build| C[Build Troubleshooting]
    B -->|Test| D[Test Troubleshooting]
    B -->|Performance| E[Performance Troubleshooting]

    C --> F{Rust or TinyGo?}
    F -->|Rust| G[Check Rust Toolchain]
    F -->|TinyGo| H[Check TinyGo Setup]
    F -->|Both| I[Check Common Issues]

    D --> J{Browser Issues?}
    J -->|Yes| K[Check Puppeteer Setup]
    J -->|No| L[Check Test Environment]

    E --> M{Measurement Issues?}
    M -->|Yes| N[Check Timing Logic]
    M -->|No| O[Check System Resources]

    G --> P[Apply Fix]
    H --> P
    I --> P
    K --> P
    L --> P
    N --> P
    O --> P

    P --> Q[Test Fix]
    Q --> R{Fixed?}
    R -->|No| A
    R -->|Yes| S[Complete]
```

---

## Best Practices

### Development Practices

- Always run `make check-deps` in new environments
- Use `make status` to verify project state
- Run smoke tests after significant changes: `npm run test:smoke`
- Keep builds clean with regular `make clean`

### Research Practices

- Use `make run-quick` for quick validation, `make all` for full exploration
- Run full experiments with `make all` for publication
- Document experimental parameters and results
- Validate cross-language consistency regularly

### Maintenance Practices

- Update dependencies regularly
- Monitor disk space in results/ directory
- Keep documentation synchronized with code changes
- Use version control effectively for experiment tracking

---

## Timeout Configuration Strategy

The project implements a comprehensive timeout strategy designed to handle intensive WebAssembly tasks while preventing resource waste and providing fast feedback during development.

### 🎯 **Timeout Strategy Overview**

| 模式 | 基础超时 | 浏览器协议 | 任务执行 | WASM密集任务 |
|------|---------|-----------|---------|-------------|
| **正常模式** | 600s | 1200s (20min) | 1500s (25min) | 1800s (30min) |
| **快速模式** | 60s | 120s (2min) | 150s (2.5min) | 180s (3min) |

### **Configuration Hierarchy**

1. **Base Timeout**: Configured in `configs/bench.yaml` and `configs/bench-quick.yaml`

   ```yaml
   environment:
     timeout: 600  # Normal mode: 10 minutes
     timeout: 20   # Quick mode: 20 seconds
   ```

2. **Timeout Multipliers** (defined in `ConfigurationService.js`):
   - **Browser Protocol**: 2x base (for Puppeteer automation)
   - **Navigation**: 1x base (for page loading)
   - **Task Execution**: 2.5x base (for individual benchmark tasks)
   - **Element Wait**: 0.25x base (for DOM element waiting)
   - **WASM Intensive**: 3x base (for CPU-intensive WASM tasks)
   - **Quick Mode Factor**: 0.1x (reduction for development mode)

### **Implementation Details**

- **Protocol Timeout**: Set in `BrowserService.js` via `protocolTimeout` parameter
- **Page Timeout**: Set via `page.setDefaultTimeout()` for browser operations
- **Task Timeout**: Applied at benchmark execution level
- **Quick Mode**: Automatically reduces all timeouts by 90% for fast feedback

### **Troubleshooting Timeout Issues**

Common timeout errors and solutions:

1. **`Runtime.callFunctionOn timed out`**:
   - Increase base timeout in config files
   - Check if task complexity requires more time
   - Verify browser protocol timeout is sufficient

2. **Navigation timeout**:
   - Check network connectivity
   - Increase navigation timeout multiplier
   - Verify development server is running

3. **Element wait timeout**:
   - Check DOM element selectors
   - Increase element wait timeout
   - Verify page loading completion

For detailed timeout configuration, see `docs/run-quick-flow.md`.

---

## Additional Resources

- **Project Repository**: <https://github.com/alleninnz/wasm-benchmark>
- **Testing Strategy**: `docs/testing-strategy-guide.md`
- **Development Plan**: `docs/development-plan.md`
- **Experiment Plans**: `docs/experiment-plan_en.md`
- **Timeout Configuration**: `docs/run-quick-flow.md` (详细超时配置)
