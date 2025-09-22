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

## 📊 Benchmark Tasks

## 📁 Project Structure

## ⚙️ Installation

## 🏃 Running Benchmarks

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

## 📊 Statistical Methodology

## 📈 Results & Analysis

## 🔬 Reproducibility

## ⚠️ Limitations & Considerations

## 📚 Documentation

## 🐛 Troubleshooting

## 📄 License

This project is licensed under the **MIT License** - see the [`LICENSE`](LICENSE) file for details.

---

**Keywords:** WebAssembly, WASM, Rust, Go, TinyGo, Performance, Benchmark, Comparison, Statistical Analysis
