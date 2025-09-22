#!/bin/bash

# TinyGo WebAssembly Build Script
# Builds all TinyGo tasks to optimized WASM modules

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
TASKS_DIR="${PROJECT_ROOT}/tasks"
TINYGO_BUILDS_DIR="${BUILDS_DIR}/tinygo"
CONFIG_FILE="${PROJECT_ROOT}/configs/bench.json"

# Default values (will be overridden by configuration)
WASM_TARGET="wasm"
TINYGO_BUILD_FLAGS=()

# Check if Go and TinyGo toolchain is available
check_tinygo_toolchain() {
    log_info "Checking TinyGo toolchain..."
    
    if ! command -v go &> /dev/null; then
        log_error "go not found. Please install Go: https://golang.org/dl/"
        exit 1
    fi
    
    if ! command -v tinygo &> /dev/null; then
        log_error "tinygo not found. Please install TinyGo: https://tinygo.org/getting-started/install/"
        exit 1
    fi
    
    log_success "TinyGo toolchain ready"
    go version
    tinygo version
}

# Check if wasm tools are available
check_wasm_tools() {
    log_info "Checking WebAssembly tools..."
    
    if ! command -v wasm-strip &> /dev/null; then
        log_warning "wasm-strip not found (wabt). Binary stripping will be skipped."
    fi
    
    if ! command -v wasm-opt &> /dev/null; then
        log_warning "wasm-opt not found (binaryen). Optimization will be skipped."
    fi
    
    log_success "WebAssembly tools checked"
}

# Read TinyGo configuration from bench.json
read_tinygo_config() {
    WASM_TARGET=$(jq -r '.languages.tinygo.target // "wasm"' "${CONFIG_FILE}" 2>/dev/null || echo "wasm")
    TINYGO_BUILD_FLAGS=($(jq -r '.languages.tinygo.optimizationLevels[0].buildFlags[]? // empty' "${CONFIG_FILE}" 2>/dev/null))

    [[ ${#TINYGO_BUILD_FLAGS[@]} -eq 0 ]] && TINYGO_BUILD_FLAGS=("-opt=2" "-panic=trap" "-no-debug" "-scheduler=none" "-gc=conservative")

    log_info "TinyGo: target=${WASM_TARGET}, flags=${TINYGO_BUILD_FLAGS[*]}"
}

# Build a single TinyGo task
build_tinygo_task() {
    local task_name="$1"
    local task_dir="${TASKS_DIR}/${task_name}/tinygo"
    local output_name="${task_name}-tinygo-o3.wasm"
    local output_path="${TINYGO_BUILDS_DIR}/${output_name}"
    
    if [[ ! -d "${task_dir}" ]]; then
        log_error "Task directory not found: ${task_dir}"
        return 1
    fi
    
    if [[ ! -f "${task_dir}/main.go" ]]; then
        log_error "main.go not found in: ${task_dir}"
        return 1
    fi
    
    log_info "Building ${task_name}..."
    
    # Create output directory
    mkdir -p "${TINYGO_BUILDS_DIR}"
    
    # Build with TinyGo
    cd "${task_dir}"
    
    # TinyGo build command with optimizations
    local build_flags=(
        "-target=${WASM_TARGET}"
        "${TINYGO_BUILD_FLAGS[@]}"
    )
    
    if ! tinygo build "${build_flags[@]}" -o "${output_path}" .; then
        log_error "Failed to build ${task_name}"
        return 1
    fi
    
    log_info "Built WASM binary: ${output_path}"
    
    # Post-processing
    local original_size=$(wc -c < "${output_path}")
    log_info "Original size: ${original_size} bytes"
    
    # Strip debug info
    if command -v wasm-strip &> /dev/null; then
        wasm-strip "${output_path}"
        local stripped_size=$(wc -c < "${output_path}")
        log_info "Stripped size: ${stripped_size} bytes ($(( (original_size - stripped_size) * 100 / original_size ))% reduction)"
    fi
    
    # Optimize with wasm-opt (enable bulk memory operations)
    if command -v wasm-opt &> /dev/null; then
        local temp_wasm="${output_path}.tmp"
        wasm-opt -Oz --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "${output_path}" -o "${temp_wasm}"
        if mv "${temp_wasm}" "${output_path}" 2>/dev/null; then
            local optimized_size=$(wc -c < "${output_path}")
            log_info "Optimized size: ${optimized_size} bytes"
        else
            log_warning "Failed to move optimized file, keeping original"
            rm -f "${temp_wasm}" 2>/dev/null || true
        fi
    fi
    
    # Create gzip version for distribution
    gzip -c "${output_path}" > "${output_path}.gz"
    local gzipped_size=$(wc -c < "${output_path}.gz")
    log_info "Gzipped size: ${gzipped_size} bytes"
    
    log_success "Built ${task_name} successfully"
    cd - > /dev/null
    return 0
}


# Main build function
main() {
    log_info "Starting TinyGo WebAssembly build process..."

    # Check prerequisites
    check_tinygo_toolchain
    check_wasm_tools

    # Load configuration
    read_tinygo_config

    # Define tasks to build
    local tasks=("mandelbrot" "json_parse" "matrix_mul")
    local failed_tasks=()
    local successful_tasks=()
    
    # Build each task
    for task in "${tasks[@]}"; do
        if build_tinygo_task "${task}"; then
            successful_tasks+=("${task}")
        else
            failed_tasks+=("${task}")
            log_error "Failed to build ${task}"
        fi
    done
    
    # Build completed successfully
    
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
        check_tinygo_toolchain
        check_wasm_tools
        read_tinygo_config
        build_tinygo_task "$1"
    else
        # Build all tasks
        main "$@"
    fi
fi