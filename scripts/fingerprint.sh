#!/bin/bash

# Environment Fingerprint Generator
# Captures all relevant system and toolchain information for reproducible builds

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
VERSIONS_LOCK="${PROJECT_ROOT}/versions.lock"
META_JSON="${PROJECT_ROOT}/meta.json"
# Check for FORCE environment variable or --force flag
# FORCE can be "1", "true", "TRUE", or "yes"
if [[ "${FORCE:-false}" == "1" || "${FORCE:-false}" == "true" || "${FORCE:-false}" == "TRUE" || "${FORCE:-false}" == "yes" ]]; then
    FORCE_MODE=true
else
    FORCE_MODE=false
fi

# Get command version or return "not found"
get_version() {
    local cmd="$1"
    local args="${2:-"--version"}"
    
    if command -v "$cmd" &> /dev/null; then
        $cmd $args 2>/dev/null | head -n1 || echo "unknown"
    else
        echo "not found"
    fi
}

# Get system information
get_system_info() {
    log_info "Gathering system information..."
    
    # Operating System
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS_NAME="macOS"
        OS_VERSION=$(sw_vers -productVersion)
        OS_BUILD=$(sw_vers -buildVersion)
        ARCHITECTURE=$(uname -m)
        
        # Get CPU information
        CPU_BRAND=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "unknown")
        CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "unknown")
        MEMORY_GB=$(echo "scale=2; $(sysctl -n hw.memsize) / 1024 / 1024 / 1024" | bc -l 2>/dev/null || echo "unknown")
        
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS_NAME="Linux"
        OS_VERSION=$(lsb_release -rs 2>/dev/null || cat /etc/os-release | grep VERSION_ID | cut -d'"' -f2)
        OS_BUILD=$(uname -r)
        ARCHITECTURE=$(uname -m)
        
        # Get CPU information
        CPU_BRAND=$(grep "model name" /proc/cpuinfo | head -n1 | cut -d: -f2 | sed 's/^ *//' || echo "unknown")
        CPU_CORES=$(nproc 2>/dev/null || echo "unknown")
        MEMORY_GB=$(echo "scale=2; $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024" | bc -l 2>/dev/null || echo "unknown")
        
    else
        OS_NAME="$OSTYPE"
        OS_VERSION="unknown"
        OS_BUILD="unknown"
        ARCHITECTURE=$(uname -m)
        CPU_BRAND="unknown"
        CPU_CORES="unknown"
        MEMORY_GB="unknown"
    fi
    
    log_success "System: $OS_NAME $OS_VERSION ($ARCHITECTURE)"
    log_info "CPU: $CPU_BRAND ($CPU_CORES cores)"
    log_info "Memory: ${MEMORY_GB}GB"
}

# Get toolchain versions
get_toolchain_versions() {
    log_info "Gathering toolchain versions..."
    
    # Rust toolchain
    RUST_VERSION=$(get_version "rustc")
    CARGO_VERSION=$(get_version "cargo")
    
    # Check for wasm32-unknown-unknown target
    if command -v rustup &> /dev/null; then
        if rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
            WASM32_TARGET="installed"
        else
            WASM32_TARGET="not installed"
        fi
    else
        WASM32_TARGET="rustup not found"
    fi
    
    # Go toolchain
    GO_VERSION=$(get_version "go" "version")
    TINYGO_VERSION=$(get_version "tinygo" "version")
    
    # Node.js and npm
    NODE_VERSION=$(get_version "node")
    NPM_VERSION=$(get_version "npm")
    
    # Python
    PYTHON_VERSION=$(get_version "python3")
    PIP_VERSION=$(get_version "pip3")
    
    # WebAssembly tools
    WASM_STRIP_VERSION=$(get_version "wasm-strip")
    WASM_OPT_VERSION=$(get_version "wasm-opt")
    WASM2WAT_VERSION=$(get_version "wasm2wat")
    
    # Build tools
    MAKE_VERSION=$(get_version "make")
    GIT_VERSION=$(get_version "git")
    
    log_success "Core toolchains detected"
}

# Get Python scientific library versions
get_python_libs() {
    log_info "Checking Python scientific libraries..."
    
    if command -v python3 &> /dev/null; then
        NUMPY_VERSION=$(python3 -c "import numpy; print(numpy.__version__)" 2>/dev/null || echo "not found")
        SCIPY_VERSION=$(python3 -c "import scipy; print(scipy.__version__)" 2>/dev/null || echo "not found")
        PANDAS_VERSION=$(python3 -c "import pandas; print(pandas.__version__)" 2>/dev/null || echo "not found")
        MATPLOTLIB_VERSION=$(python3 -c "import matplotlib; print(matplotlib.__version__)" 2>/dev/null || echo "not found")
        SEABORN_VERSION=$(python3 -c "import seaborn; print(seaborn.__version__)" 2>/dev/null || echo "not found")
    else
        NUMPY_VERSION="python3 not found"
        SCIPY_VERSION="python3 not found"
        PANDAS_VERSION="python3 not found"
        MATPLOTLIB_VERSION="python3 not found"
        SEABORN_VERSION="python3 not found"
    fi
    
    log_info "Scientific libraries checked"
}

# Get browser information
get_browser_info() {
    log_info "Checking browser information..."
    
    # Try to get Chromium/Chrome version
    if [[ "$OSTYPE" == "darwin"* ]] && [[ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
        CHROME_VERSION=$("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version 2>/dev/null | cut -d' ' -f3 || echo "unknown")
    elif command -v google-chrome &> /dev/null; then
        CHROME_VERSION=$(google-chrome --version 2>/dev/null | cut -d' ' -f3 || echo "unknown")
    elif command -v chromium &> /dev/null; then
        CHROME_VERSION=$(chromium --version 2>/dev/null | cut -d' ' -f2 || echo "unknown")
    elif command -v chromium-browser &> /dev/null; then
        CHROME_VERSION=$(chromium-browser --version 2>/dev/null | cut -d' ' -f2 || echo "unknown")
    else
        CHROME_VERSION="not found"
    fi
    
    # Check Puppeteer version (from package.json if available)
    if [[ -f "${PROJECT_ROOT}/package.json" ]] && command -v node &> /dev/null; then
        PUPPETEER_VERSION=$(node -e "try { console.log(require('${PROJECT_ROOT}/package.json').dependencies.puppeteer || 'not listed'); } catch(e) { console.log('package.json not found'); }" 2>/dev/null || echo "unknown")
    else
        PUPPETEER_VERSION="unknown"
    fi
    
    log_info "Browser info collected"
}

# Generate versions.lock file
generate_versions_lock() {
    log_info "Generating versions.lock file..."
    
    cat > "$VERSIONS_LOCK" << EOF
# Fixed Toolchain Versions for Reproducible Builds
# Generated by fingerprint.sh - DO NOT EDIT MANUALLY

# Core Languages
rust_version=$RUST_VERSION
cargo_version=$CARGO_VERSION
wasm32_target=$WASM32_TARGET

# Go Toolchain  
go_version=$GO_VERSION
tinygo_version=$TINYGO_VERSION

# WebAssembly Tools
wasm_strip_version=$WASM_STRIP_VERSION
wasm_opt_version=$WASM_OPT_VERSION
wasm2wat_version=$WASM2WAT_VERSION

# Runtime Environment
nodejs_version=$NODE_VERSION
npm_version=$NPM_VERSION

# Python Environment
python_version=$PYTHON_VERSION
pip_version=$PIP_VERSION

# Python Scientific Libraries
numpy_version=$NUMPY_VERSION
scipy_version=$SCIPY_VERSION
pandas_version=$PANDAS_VERSION
matplotlib_version=$MATPLOTLIB_VERSION
seaborn_version=$SEABORN_VERSION

# Browser Engine
chrome_version=$CHROME_VERSION
puppeteer_version=$PUPPETEER_VERSION

# System Information
os_name=$OS_NAME
os_version=$OS_VERSION
os_build=$OS_BUILD
architecture=$ARCHITECTURE
cpu_brand=$CPU_BRAND
cpu_cores=$CPU_CORES
memory_gb=$MEMORY_GB

# Build Tools
make_version=$MAKE_VERSION
git_version=$GIT_VERSION

# Lock File Metadata
generated_date=$(date +"%Y-%m-%dT%H:%M:%S%z")
generator_script=scripts/fingerprint.sh
lock_file_version=1.0
project_root=$PROJECT_ROOT
EOF
    
    log_success "Versions lock file created: $VERSIONS_LOCK"
}

# Generate meta.json for results
generate_meta_json() {
    log_info "Generating meta.json for results..."
    
    cat > "$META_JSON" << EOF
{
    "experiment": {
        "name": "WebAssembly Performance Benchmark",
        "description": "Comparing Rust and TinyGo WebAssembly performance across computational tasks",
        "version": "1.0",
    "generated_date": "$(date +"%Y-%m-%dT%H:%M:%S%z")",
        "project_root": "$PROJECT_ROOT"
    },
    "system": {
        "os": {
            "name": "$OS_NAME",
            "version": "$OS_VERSION",
            "build": "$OS_BUILD",
            "architecture": "$ARCHITECTURE"
        },
        "hardware": {
            "cpu": "$CPU_BRAND",
            "cores": "$CPU_CORES",
            "memory_gb": "$MEMORY_GB"
        }
    },
    "toolchains": {
        "rust": {
            "rustc_version": "$RUST_VERSION",
            "cargo_version": "$CARGO_VERSION",
            "wasm32_target": "$WASM32_TARGET"
        },
        "go": {
            "go_version": "$GO_VERSION",
            "tinygo_version": "$TINYGO_VERSION"
        },
        "node": {
            "node_version": "$NODE_VERSION",
            "npm_version": "$NPM_VERSION"
        },
        "python": {
            "python_version": "$PYTHON_VERSION",
            "pip_version": "$PIP_VERSION",
            "libraries": {
                "numpy": "$NUMPY_VERSION",
                "scipy": "$SCIPY_VERSION", 
                "pandas": "$PANDAS_VERSION",
                "matplotlib": "$MATPLOTLIB_VERSION",
                "seaborn": "$SEABORN_VERSION"
            }
        }
    },
    "webassembly_tools": {
        "wasm_strip": "$WASM_STRIP_VERSION",
        "wasm_opt": "$WASM_OPT_VERSION",
        "wasm2wat": "$WASM2WAT_VERSION"
    },
    "browser": {
        "chrome_version": "$CHROME_VERSION",
        "puppeteer_version": "$PUPPETEER_VERSION"
    },
    "build_tools": {
        "make": "$MAKE_VERSION",
        "git": "$GIT_VERSION"
    }
}
EOF
    
    log_success "Meta JSON file created: $META_JSON"
}

# Display environment summary
display_summary() {
    log_section "Environment Fingerprint Summary"
    
    echo "System Information:"
    echo "  OS: $OS_NAME $OS_VERSION ($ARCHITECTURE)"
    echo "  CPU: $CPU_BRAND"
    echo "  Cores: $CPU_CORES"
    echo "  Memory: ${MEMORY_GB}GB"
    echo
    
    echo "Core Toolchains:"
    echo "  Rust: $RUST_VERSION"
    echo "  Cargo: $CARGO_VERSION"
    echo "  Go: $GO_VERSION"
    echo "  TinyGo: $TINYGO_VERSION"
    echo "  Node.js: $NODE_VERSION"
    echo "  Python: $PYTHON_VERSION"
    echo
    
    echo "WebAssembly Tools:"
    echo "  wasm-strip: $WASM_STRIP_VERSION"
    echo "  wasm-opt: $WASM_OPT_VERSION"
    echo "  wasm2wat: $WASM2WAT_VERSION"
    echo
    
    echo "Python Libraries:"
    echo "  NumPy: $NUMPY_VERSION"
    echo "  SciPy: $SCIPY_VERSION"
    echo "  Pandas: $PANDAS_VERSION"
    echo "  Matplotlib: $MATPLOTLIB_VERSION"
    echo "  Seaborn: $SEABORN_VERSION"
    echo
    
    echo "Browser:"
    echo "  Chrome/Chromium: $CHROME_VERSION"
    echo "  Puppeteer: $PUPPETEER_VERSION"
    echo
    
    log_info "Files generated:"
    log_info "  Versions lock: $VERSIONS_LOCK"
    log_info "  Meta JSON: $META_JSON"
}

# Main function
main() {
    if [[ "$FORCE_MODE" == "true" ]]; then
        log_section "Environment Fingerprint Generation (FORCE MODE)"
        log_warning "Force mode enabled - removing existing fingerprint files"
        rm -f "$VERSIONS_LOCK" "$META_JSON" 2>/dev/null || true
    else
        log_section "Environment Fingerprint Generation"

        # Check if files already exist and skip if they do (unless force mode)
        if [[ -f "$VERSIONS_LOCK" && -f "$META_JSON" ]]; then
            log_info "Environment fingerprint files already exist:"
            log_info "  - $VERSIONS_LOCK"
            log_info "  - $META_JSON"
            log_info "Use --force option or make init FORCE=1 to regenerate"
            return 0
        fi
    fi

    # Gather all information
    get_system_info
    get_toolchain_versions
    get_python_libs
    get_browser_info

    # Generate output files
    generate_versions_lock
    generate_meta_json

    # Display summary
    display_summary

    log_section "Fingerprint Generation Complete"
    if [[ "$FORCE_MODE" == "true" ]]; then
        log_success "Environment fingerprint forcefully regenerated"
    else
        log_success "Environment fingerprint captured successfully"
    fi
}

# Handle command line arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                echo "Usage: $0 [--force] [--help]"
                echo "   or: FORCE=1 $0"
                echo ""
                echo "Generate environment fingerprint for reproducible builds."
                echo ""
                echo "Options:"
                echo "  --force    Force regeneration of fingerprint files"
                echo "  --help     Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  FORCE=1    Force regeneration (same as --force)"
                echo ""
                echo "This script captures:"
                echo "  - System information (OS, CPU, memory)"
                echo "  - Toolchain versions (Rust, Go, TinyGo, Node.js, Python)"
                echo "  - WebAssembly tools (wasm-strip, wasm-opt, etc.)"
                echo "  - Python scientific libraries"
                echo "  - Browser information"
                echo ""
                echo "Output files:"
                echo "  - versions.lock"
                echo "  - meta.json"
                exit 0
                ;;
            --force)
                FORCE_MODE=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    main
fi