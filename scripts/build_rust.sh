#!/bin/bash

# Rust WebAssembly Build Script
# Builds all Rust tasks to optimized WASM modules with parallel compilation and checksums

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
TASKS_DIR="${PROJECT_ROOT}/tasks"
# BUILDS_DIR already defined in common.sh
RUST_OUTPUT_DIR="${BUILDS_DIR}/rust"
CONFIG_FILE="${PROJECT_ROOT}/configs/bench.json"
WASM_TARGET="wasm32-unknown-unknown"
PROFILE="release"

# Build options
PARALLEL_BUILD=false
GENERATE_CHECKSUMS=true
BUILD_METRICS_FILE="${BUILDS_DIR}/metrics.json"
CHECKSUM_FILE="${RUST_OUTPUT_DIR}/checksums.txt"

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

# Read Rust configuration from bench.json and set CARGO environment variables
read_rust_config() {
    if [[ -f "${CONFIG_FILE}" ]] && command -v jq &> /dev/null; then
        log_info "Reading Rust configuration from ${CONFIG_FILE}..."

        # Read cargo config settings and set environment variables
        local opt_level=$(jq -r '.languages.rust.optimizationLevels[0].cargoConfig.optLevel // 3' "${CONFIG_FILE}" 2>/dev/null)
        local lto=$(jq -r '.languages.rust.optimizationLevels[0].cargoConfig.lto // "fat"' "${CONFIG_FILE}" 2>/dev/null)
        local codegen_units=$(jq -r '.languages.rust.optimizationLevels[0].cargoConfig.codegenUnits // 1' "${CONFIG_FILE}" 2>/dev/null)
        local panic=$(jq -r '.languages.rust.optimizationLevels[0].cargoConfig.panic // "abort"' "${CONFIG_FILE}" 2>/dev/null)
        local strip=$(jq -r '.languages.rust.optimizationLevels[0].cargoConfig.strip // "debuginfo"' "${CONFIG_FILE}" 2>/dev/null)

        # Set CARGO environment variables to override profile settings
        export CARGO_PROFILE_RELEASE_OPT_LEVEL="$opt_level"
        export CARGO_PROFILE_RELEASE_LTO="$lto"
        export CARGO_PROFILE_RELEASE_CODEGEN_UNITS="$codegen_units"
        export CARGO_PROFILE_RELEASE_PANIC="$panic"
        export CARGO_PROFILE_RELEASE_STRIP="$strip"

        # Read target
        local target=$(jq -r '.languages.rust.target // "wasm32-unknown-unknown"' "${CONFIG_FILE}" 2>/dev/null)
        WASM_TARGET="$target"

        log_success "Configuration loaded: opt-level=${opt_level}, lto=${lto}, codegen-units=${codegen_units}, panic=${panic}, strip=${strip}"
        log_info "Using target: ${WASM_TARGET}"
    else
        log_warning "Configuration file not found or jq not available, using defaults"
        log_info "Default settings: opt-level=3, lto=fat, codegen-units=1, panic=abort, strip=debuginfo"
    fi
}

# Build a single Rust task
build_rust_task() {
    local task_name="$1"
    local task_dir="${TASKS_DIR}/${task_name}/rust"
    local output_name="${task_name}-rust-o3.wasm"
    local output_path="${RUST_OUTPUT_DIR}/${output_name}"
    
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
    mkdir -p "${RUST_OUTPUT_DIR}"

    # Extract package name from Cargo.toml
    local package_name=$(grep '^name = ' "${task_dir}/Cargo.toml" | head -1 | sed 's/name = "\(.*\)"/\1/')
    if [[ -z "${package_name}" ]]; then
        log_error "Could not extract package name from Cargo.toml"
        return 1
    fi
    log_info "Package name: ${package_name}"

    # Build the project
    cd "${task_dir}"

    # Clean previous build
    cargo clean --target "${WASM_TARGET}" --release

    # Build with optimizations
    if ! cargo build --target "${WASM_TARGET}" --${PROFILE}; then
        log_error "Failed to build ${task_name}"
        return 1
    fi

    # Copy the built wasm file using the exact package name
    local built_wasm="${task_dir}/target/${WASM_TARGET}/${PROFILE}/${package_name}.wasm"
    if [[ -f "${built_wasm}" ]]; then
        cp "${built_wasm}" "${output_path}"
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
    
    # Optimize with wasm-opt (enable bulk memory operations)
    if command -v wasm-opt &> /dev/null; then
        local temp_wasm="${output_path}.tmp"
        wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext "${output_path}" -o "${temp_wasm}"
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

# Generate checksum for a built task
generate_task_checksum() {
    local task_name="$1"
    local output_name="${task_name}-rust-o3.wasm"
    local output_path="${RUST_OUTPUT_DIR}/${output_name}"
    local gz_path="${output_path}.gz"

    if [[ ! -f "${output_path}" ]]; then
        log_error "WASM file not found for checksum: ${output_path}"
        return 1
    fi

    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    local original_size=$(wc -c < "${output_path}")
    local gz_size="N/A"

    if [[ -f "${gz_path}" ]]; then
        gz_size=$(wc -c < "${gz_path}")
    fi

    # Generate checksums
    local sha256_wasm=$(shasum -a 256 "${output_path}" | cut -d' ' -f1)
    local sha256_gz="N/A"

    if [[ -f "${gz_path}" ]]; then
        sha256_gz=$(shasum -a 256 "${gz_path}" | cut -d' ' -f1)
    fi

    # Append to checksum file
    {
        echo "# Task: ${task_name}"
        echo "# Build: ${timestamp}"
        echo "# Language: rust"
        echo "# WASM size: ${original_size} bytes"
        echo "# GZ size: ${gz_size} bytes"
        echo "${sha256_wasm} *${output_name}"
        if [[ "${sha256_gz}" != "N/A" ]]; then
            echo "${sha256_gz} *${output_name}.gz"
        fi
        echo ""
    } >> "${CHECKSUM_FILE}"

    log_info "Checksum generated for ${task_name}"
}

# Collect build metrics for a task
collect_build_metrics() {
    local task_name="$1"
    local build_start_time="$2"
    local build_end_time="$3"
    local success="$4"

    local output_name="${task_name}-rust-o3.wasm"
    local output_path="${RUST_OUTPUT_DIR}/${output_name}"
    local gz_path="${output_path}.gz"

    local build_time_ms=$(( (build_end_time - build_start_time) * 1000 ))
    local wasm_size=0
    local gz_size=0

    if [[ -f "${output_path}" ]]; then
        wasm_size=$(wc -c < "${output_path}")
    fi

    if [[ -f "${gz_path}" ]]; then
        gz_size=$(wc -c < "${gz_path}")
    fi

    # Store metrics in JSON format (will be aggregated later)
    local metrics_temp="${BUILD_METRICS_FILE}.${task_name}.tmp"
    cat > "${metrics_temp}" << EOF
{
    "task": "${task_name}",
    "build_time_ms": ${build_time_ms},
    "success": ${success},
    "sizes": {
        "wasm": ${wasm_size},
        "gzipped": ${gz_size}
    }
}
EOF

    log_info "Metrics collected for ${task_name}: ${build_time_ms}ms, ${wasm_size} bytes"
}


# Build task with metrics collection
build_rust_task_with_metrics() {
    local task_name="$1"
    local start_time=$(date +%s)

    log_info "Building ${task_name}..."

    if build_rust_task "${task_name}"; then
        local end_time=$(date +%s)
        collect_build_metrics "${task_name}" "${start_time}" "${end_time}" "true"

        if [[ "${GENERATE_CHECKSUMS}" == "true" ]]; then
            generate_task_checksum "${task_name}"
        fi

        log_success "✓ ${task_name} built successfully"
        return 0
    else
        local end_time=$(date +%s)
        collect_build_metrics "${task_name}" "${start_time}" "${end_time}" "false"
        log_error "✗ ${task_name} build failed"
        return 1
    fi
}

# Parallel build function
build_parallel() {
    local tasks=("$@")
    local pids=()
    local temp_results=()

    log_info "Building ${#tasks[@]} tasks in parallel..."

    # Start all builds in parallel
    for task in "${tasks[@]}"; do
        (
            if build_rust_task_with_metrics "${task}"; then
                echo "SUCCESS:${task}" > "${RUST_OUTPUT_DIR}/.${task}.result"
            else
                echo "FAILED:${task}" > "${RUST_OUTPUT_DIR}/.${task}.result"
            fi
        ) &
        pids+=($!)
    done

    # Wait for all parallel builds to complete
    log_info "Waiting for parallel builds to complete..."
    for pid in "${pids[@]}"; do
        wait "${pid}"
    done

    # Collect results
    local successful_tasks=()
    local failed_tasks=()

    for task in "${tasks[@]}"; do
        if [[ -f "${RUST_OUTPUT_DIR}/.${task}.result" ]]; then
            local result=$(cat "${RUST_OUTPUT_DIR}/.${task}.result")
            if [[ "${result}" == "SUCCESS:${task}" ]]; then
                successful_tasks+=("${task}")
            else
                failed_tasks+=("${task}")
            fi
            rm -f "${RUST_OUTPUT_DIR}/.${task}.result"
        else
            failed_tasks+=("${task}")
            log_error "No result file found for ${task}"
        fi
    done

    return "${#failed_tasks[@]}"
}

# Sequential build function
build_sequential() {
    local tasks=("$@")
    local failed_tasks=()
    local successful_tasks=()

    log_info "Building ${#tasks[@]} tasks sequentially..."

    for task in "${tasks[@]}"; do
        if build_rust_task_with_metrics "${task}"; then
            successful_tasks+=("${task}")
        else
            failed_tasks+=("${task}")
        fi
    done

    return "${#failed_tasks[@]}"
}

# Aggregate build metrics from temporary files into unified JSON
aggregate_build_metrics() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local rust_version=$(rustc --version 2>/dev/null || echo "unknown")
    local temp_rust_data="${BUILD_METRICS_FILE}.rust.tmp"

    # Create Rust metrics object
    {
        echo "{"
        echo "  \"timestamp\": \"${timestamp}\","
        echo "  \"language\": \"rust\","
        echo "  \"toolchain\": \"${rust_version}\","
        echo "  \"tasks\": {"

        local first=true
        for metrics_file in "${BUILD_METRICS_FILE}".*.tmp; do
            if [[ -f "${metrics_file}" ]] && [[ "${metrics_file}" != *".rust.tmp" ]] && [[ "${metrics_file}" != *".tinygo.tmp" ]]; then
                if [[ "${first}" == "false" ]]; then
                    echo ","
                fi

                local task_name=$(basename "${metrics_file}" .tmp | sed 's/.*\.//')
                echo -n "    \"${task_name}\": "
                cat "${metrics_file}" | tr -d '\n'
                first=false

                rm -f "${metrics_file}"
            fi
        done

        echo ""
        echo "  }"
        echo "}"
    } > "${temp_rust_data}"

    # Merge with existing metrics or create new unified metrics
    merge_unified_metrics "rust" "${temp_rust_data}"
    rm -f "${temp_rust_data}"

    log_success "Build metrics saved to: ${BUILD_METRICS_FILE}"
}

# Merge language-specific metrics into unified JSON file
merge_unified_metrics() {
    local language="$1"
    local new_data_file="$2"
    local temp_unified="${BUILD_METRICS_FILE}.tmp"

    # Read existing metrics if available
    if [[ -f "${BUILD_METRICS_FILE}" ]]; then
        # Use jq to merge if available, otherwise manual merge
        if command -v jq >/dev/null 2>&1; then
            local new_data=$(cat "${new_data_file}")
            jq --argjson new_data "${new_data}" \
               --arg lang "${language}" \
               '.[$lang] = $new_data | .timestamp = $new_data.timestamp' \
               "${BUILD_METRICS_FILE}" > "${temp_unified}" && \
            mv "${temp_unified}" "${BUILD_METRICS_FILE}"
        else
            # Manual merge fallback
            manual_merge_metrics "${language}" "${new_data_file}"
        fi
    else
        # Create new unified metrics file
        {
            echo "{"
            echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
            echo "  \"${language}\": $(cat "${new_data_file}")"
            echo "}"
        } > "${BUILD_METRICS_FILE}"
    fi

    # Format JSON if jq is available
    if command -v jq >/dev/null 2>&1 && [[ -f "${BUILD_METRICS_FILE}" ]]; then
        jq '.' "${BUILD_METRICS_FILE}" > "${temp_unified}" && \
        mv "${temp_unified}" "${BUILD_METRICS_FILE}"
    fi
}

# Manual merge when jq is not available
manual_merge_metrics() {
    local language="$1"
    local new_data_file="$2"
    local temp_file="${BUILD_METRICS_FILE}.manual.tmp"

    # Simple manual merge by rebuilding the JSON structure
    {
        echo "{"
        echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","

        # Copy existing languages (skip timestamp and current language)
        if [[ -f "${BUILD_METRICS_FILE}" ]]; then
            grep -E '^  "(rust|tinygo)"' "${BUILD_METRICS_FILE}" | \
            grep -v "\"${language}\"" | \
            sed 's/$/,/' || true
        fi

        # Add new language data
        echo "  \"${language}\": $(cat "${new_data_file}")"
        echo "}"
    } > "${temp_file}" && mv "${temp_file}" "${BUILD_METRICS_FILE}"
}

# Main build function
main() {
    log_info "Starting Rust WebAssembly build process..."

    # Check prerequisites
    check_rust_toolchain
    check_wasm_tools

    # Load configuration
    read_rust_config

    # Create output directory and initialize checksum file
    mkdir -p "${RUST_OUTPUT_DIR}"

    if [[ "${GENERATE_CHECKSUMS}" == "true" ]]; then
        {
            echo "# Rust WebAssembly Build Checksums"
            echo "# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
            echo "# Format: SHA256 *filename"
            echo ""
        } > "${CHECKSUM_FILE}"
    fi

    # Define tasks to build
    local tasks=("mandelbrot" "json_parse" "matrix_mul")
    local failed_count=0

    # Build tasks (parallel or sequential)
    if [[ "${PARALLEL_BUILD}" == "true" ]]; then
        build_parallel "${tasks[@]}"
        failed_count=$?
    else
        build_sequential "${tasks[@]}"
        failed_count=$?
    fi

    # Aggregate metrics
    aggregate_build_metrics

    # Report results
    local successful_count=$((${#tasks[@]} - failed_count))
    log_info "Build Summary:"
    log_success "Successfully built: ${successful_count}/${#tasks[@]} tasks"

    if [[ ${failed_count} -gt 0 ]]; then
        log_error "Failed builds: ${failed_count} tasks"
        return 1
    else
        log_success "🎉 All Rust tasks built successfully!"
        if [[ "${GENERATE_CHECKSUMS}" == "true" ]]; then
            log_info "Checksums available in: ${CHECKSUM_FILE}"
        fi
        return 0
    fi
}

# Print usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS] [TASK_NAME]

Build Rust WebAssembly tasks with optimizations and checksums.

OPTIONS:
    -p, --parallel      Build tasks in parallel (faster)
    -s, --sequential    Build tasks sequentially (default)
    -c, --checksums     Generate checksums (default: enabled)
    --no-checksums      Disable checksum generation
    -h, --help          Show this help message

TASK_NAME:
    If specified, builds only the specified task (mandelbrot, json_parse, or matrix_mul)
    If omitted, builds all tasks

EXAMPLES:
    $0                      # Build all tasks sequentially
    $0 --parallel           # Build all tasks in parallel
    $0 mandelbrot           # Build only mandelbrot task
    $0 -p --no-checksums    # Parallel build without checksums
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--parallel)
                PARALLEL_BUILD=true
                shift
                ;;
            -s|--sequential)
                PARALLEL_BUILD=false
                shift
                ;;
            -c|--checksums)
                GENERATE_CHECKSUMS=true
                shift
                ;;
            --no-checksums)
                GENERATE_CHECKSUMS=false
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            mandelbrot|json_parse|matrix_mul)
                # Single task build
                SINGLE_TASK="$1"
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                log_error "Unknown argument: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Handle script arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being executed directly
    SINGLE_TASK=""

    # Parse arguments
    parse_args "$@"

    # Check prerequisites
    check_rust_toolchain
    check_wasm_tools
    read_rust_config

    # Create output directory
    mkdir -p "${RUST_OUTPUT_DIR}"

    if [[ -n "${SINGLE_TASK}" ]]; then
        # Build single task
        log_info "Building single task: ${SINGLE_TASK}"

        if [[ "${GENERATE_CHECKSUMS}" == "true" ]]; then
            {
                echo "# Rust WebAssembly Build Checksums (Single Task)"
                echo "# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
                echo "# Format: SHA256 *filename"
                echo ""
            } > "${CHECKSUM_FILE}"
        fi

        if build_rust_task_with_metrics "${SINGLE_TASK}"; then
            aggregate_build_metrics
            log_success "🎉 Task ${SINGLE_TASK} built successfully!"
            exit 0
        else
            log_error "Failed to build ${SINGLE_TASK}"
            exit 1
        fi
    else
        # Build all tasks
        main
    fi
fi