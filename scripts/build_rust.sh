#!/bin/bash

# Rust WebAssembly Build Script
# Builds all Rust tasks to optimized WASM modules

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASKS_DIR="${PROJECT_ROOT}/tasks"
BUILDS_DIR="${PROJECT_ROOT}/builds/rust"
WASM_TARGET="wasm32-unknown-unknown"
PROFILE="release"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if rust toolchain is available
check_rust_toolchain() {
    log_info "Checking Rust toolchain..."
    
    if ! command -v rustc &> /dev/null; then
        log_error "rustc not found. Please install Rust: https://rustup.rs/"
        exit 1
    fi
    
    if ! command -v cargo &> /dev/null; then
        log_error "cargo not found. Please install Rust: https://rustup.rs/"
        exit 1
    fi
    
    # Check if wasm32-unknown-unknown target is installed
    if ! rustup target list --installed | grep -q "${WASM_TARGET}"; then
        log_info "Installing ${WASM_TARGET} target..."
        rustup target add "${WASM_TARGET}"
    fi
    
    log_success "Rust toolchain ready"
    rustc --version
    cargo --version
}

# Check if wasm tools are available
check_wasm_tools() {
    log_info "Checking WebAssembly tools..."
    
    local tools_missing=false
    
    if ! command -v wasm-strip &> /dev/null; then
        log_warning "wasm-strip not found (wabt). Binary stripping will be skipped."
    fi
    
    if ! command -v wasm-opt &> /dev/null; then
        log_warning "wasm-opt not found (binaryen). Optimization will be skipped."
    fi
    
    log_success "WebAssembly tools checked"
}

# Build a single Rust task
build_rust_task() {
    local task_name="$1"
    local task_dir="${TASKS_DIR}/${task_name}/rust"
    local output_name="${task_name}-rust-o3.wasm"
    local output_path="${BUILDS_DIR}/${output_name}"
    
    if [[ ! -d "${task_dir}" ]]; then
        log_error "Task directory not found: ${task_dir}"
        return 1
    fi
    
    if [[ ! -f "${task_dir}/Cargo.toml" ]]; then
        log_error "Cargo.toml not found in: ${task_dir}"
        return 1
    fi
    
    log_info "Building ${task_name}..."
    
    # Create output directory
    mkdir -p "${BUILDS_DIR}"
    
    # Build the project
    cd "${task_dir}"
    
    # Clean previous build
    cargo clean --target "${WASM_TARGET}" --release
    
    # Build with optimizations
    if ! cargo build --target "${WASM_TARGET}" --${PROFILE}; then
        log_error "Failed to build ${task_name}"
        return 1
    fi
    
    # Copy the built wasm file
    local built_wasm="${task_dir}/target/${WASM_TARGET}/${PROFILE}/*.wasm"
    if ls ${built_wasm} 1> /dev/null 2>&1; then
        cp ${built_wasm} "${output_path}"
        log_info "Copied WASM binary to: ${output_path}"
    else
        log_error "Built WASM binary not found: ${built_wasm}"
        return 1
    fi
    
    # Post-processing
    local original_size=$(wc -c < "${output_path}")
    log_info "Original size: ${original_size} bytes"
    
    # Strip debug info
    if command -v wasm-strip &> /dev/null; then
        wasm-strip "${output_path}"
        local stripped_size=$(wc -c < "${output_path}")
        log_info "Stripped size: ${stripped_size} bytes ($(( (original_size - stripped_size) * 100 / original_size ))% reduction)"
    fi
    
    # Optimize with wasm-opt
    if command -v wasm-opt &> /dev/null; then
        local temp_wasm="${output_path}.tmp"
        wasm-opt -O3 "${output_path}" -o "${temp_wasm}"
        mv "${temp_wasm}" "${output_path}"
        local optimized_size=$(wc -c < "${output_path}")
        log_info "Optimized size: ${optimized_size} bytes"
    fi
    
    # Create gzip version for size comparison
    gzip -c "${output_path}" > "${output_path}.gz"
    local gzipped_size=$(wc -c < "${output_path}.gz")
    log_info "Gzipped size: ${gzipped_size} bytes"
    
    log_success "Built ${task_name} successfully"
    cd - > /dev/null
    return 0
}

# Generate build manifest
generate_manifest() {
    local manifest_file="${BUILDS_DIR}/manifest.json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    log_info "Generating build manifest..."
    
    cat > "${manifest_file}" << EOF
{
    "build_timestamp": "${timestamp}",
    "language": "rust",
    "target": "${WASM_TARGET}",
    "profile": "${PROFILE}",
    "rust_version": "$(rustc --version)",
    "cargo_version": "$(cargo --version)",
    "tasks": [
EOF

    local first=true
    for task in mandelbrot json_parse matrix_mul; do
        local output_name="${task}-rust-o3.wasm"
        local output_path="${BUILDS_DIR}/${output_name}"
        local gzip_path="${output_path}.gz"
        
        if [[ -f "${output_path}" ]]; then
            [[ "${first}" == "true" ]] || echo "," >> "${manifest_file}"
            first=false
            
            local raw_size=$(wc -c < "${output_path}")
            local gzip_size=0
            [[ -f "${gzip_path}" ]] && gzip_size=$(wc -c < "${gzip_path}")
            local sha256=$(shasum -a 256 "${output_path}" | cut -d' ' -f1)
            
            cat >> "${manifest_file}" << EOF
        {
            "task": "${task}",
            "filename": "${output_name}",
            "raw_size_bytes": ${raw_size},
            "gzip_size_bytes": ${gzip_size},
            "sha256": "${sha256}"
        }
EOF
        fi
    done
    
    cat >> "${manifest_file}" << EOF
    ]
}
EOF
    
    log_success "Build manifest created: ${manifest_file}"
}

# Main build function
main() {
    log_info "Starting Rust WebAssembly build process..."
    
    # Check prerequisites
    check_rust_toolchain
    check_wasm_tools
    
    # Define tasks to build
    local tasks=("mandelbrot" "json_parse" "matrix_mul")
    local failed_tasks=()
    local successful_tasks=()
    
    # Build each task
    for task in "${tasks[@]}"; do
        if build_rust_task "${task}"; then
            successful_tasks+=("${task}")
        else
            failed_tasks+=("${task}")
            log_error "Failed to build ${task}"
        fi
    done
    
    # Generate manifest for successful builds
    if [[ ${#successful_tasks[@]} -gt 0 ]]; then
        generate_manifest
    fi
    
    # Report results
    log_info "Build Summary:"
    log_success "Successfully built: ${#successful_tasks[@]} tasks"
    [[ ${#failed_tasks[@]} -gt 0 ]] && log_error "Failed builds: ${#failed_tasks[@]} tasks (${failed_tasks[*]})"
    
    # Exit with error if any builds failed
    [[ ${#failed_tasks[@]} -eq 0 ]]
}

# Handle script arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being executed directly
    if [[ $# -eq 1 && "$1" != "" ]]; then
        # Build single task
        check_rust_toolchain
        check_wasm_tools
        build_rust_task "$1"
    else
        # Build all tasks
        main "$@"
    fi
fi