#!/bin/bash

# Build All WebAssembly Tasks
# Optimized build script for both Rust and TinyGo implementations with parallel compilation

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration (BUILDS_DIR already defined in common.sh)
TASK_PARALLEL=false
GENERATE_CHECKSUMS=true


# Print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build all WebAssembly benchmark tasks for both Rust and TinyGo.

OPTIONS:
    -h, --help          Show this help message
    -r, --rust-only     Build only Rust tasks
    -g, --tinygo-only   Build only TinyGo tasks
    -c, --clean         Clean build directories before building
    -p, --parallel      Build Rust and TinyGo in parallel
    --task-parallel     Use parallel compilation within languages
    --no-checksums      Disable checksum generation
    -v, --verbose       Enable verbose output

EXAMPLES:
    $0                      Build all tasks for both languages
    $0 -r                   Build only Rust tasks
    $0 -g                   Build only TinyGo tasks
    $0 -c -p                Clean and build languages in parallel
    $0 --task-parallel      Build with parallel task compilation
    $0 -p --task-parallel   Full parallel build (languages + tasks)
EOF
}

# Clean build directories
clean_builds() {
    log_info "Cleaning build directories..."
    rm -rf "${BUILDS_DIR}/rust"
    rm -rf "${BUILDS_DIR}/tinygo"
    rm -f "${BUILDS_DIR}/checksums.txt"
    rm -f "${BUILDS_DIR}/sizes.csv"
    log_success "Build directories cleaned"
}

# Run build script with error handling
run_build_script() {
    local script_name="$1"
    local script_path="${SCRIPT_DIR}/${script_name}"
    
    if [[ ! -f "${script_path}" ]]; then
        log_error "Build script not found: ${script_path}"
        return 1
    fi
    
    if [[ ! -x "${script_path}" ]]; then
        log_info "Making build script executable: ${script_name}"
        chmod +x "${script_path}"
    fi
    
    log_info "Running ${script_name}..."
    if "${script_path}"; then
        log_success "${script_name} completed successfully"
        return 0
    else
        log_error "${script_name} failed"
        return 1
    fi
}

# Build Rust tasks with options
build_rust() {
    log_section "Building Rust WebAssembly Tasks"

    local rust_args=()
    if [[ "${TASK_PARALLEL}" == "true" ]]; then
        rust_args+=("--parallel")
    fi
    if [[ "${GENERATE_CHECKSUMS}" == "false" ]]; then
        rust_args+=("--no-checksums")
    fi

    log_info "Running build_rust.sh with args: ${rust_args[*]:-}"

    if [[ ${#rust_args[@]} -gt 0 ]]; then
        "${SCRIPT_DIR}/build_rust.sh" "${rust_args[@]}"
    else
        run_build_script "build_rust.sh"
    fi
}

# Build TinyGo tasks with options
build_tinygo() {
    log_section "Building TinyGo WebAssembly Tasks"

    local tinygo_args=()
    if [[ "${TASK_PARALLEL}" == "true" ]]; then
        tinygo_args+=("--parallel")
    fi
    if [[ "${GENERATE_CHECKSUMS}" == "false" ]]; then
        tinygo_args+=("--no-checksums")
    fi

    log_info "Running build_tinygo.sh with args: ${tinygo_args[*]:-}"

    if [[ ${#tinygo_args[@]} -gt 0 ]]; then
        "${SCRIPT_DIR}/build_tinygo.sh" "${tinygo_args[@]}"
    else
        run_build_script "build_tinygo.sh"
    fi
}

# Generate combined checksums and metrics
generate_checksums() {
    if [[ "${GENERATE_CHECKSUMS}" == "false" ]]; then
        log_info "Checksum generation disabled, skipping..."
        return 0
    fi

    log_info "Generating unified checksums..."

    local unified_checksum_file="${BUILDS_DIR}/checksums.txt"

    # Generate unified checksums
    {
        echo "# WebAssembly Build Checksums (Unified)"
        echo "# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        echo "# This file aggregates checksums from individual language builds"
        echo "#"
        echo "# Format: SHA256 *filename"
        echo ""

        # Include Rust checksums if available
        if [[ -f "${BUILDS_DIR}/rust/checksums.txt" ]]; then
            echo "# ============================================"
            echo "# Rust WebAssembly Builds"
            echo "# ============================================"
            cat "${BUILDS_DIR}/rust/checksums.txt"
            echo ""
        elif [[ -d "${BUILDS_DIR}/rust" ]]; then
            echo "# Rust builds (generated on-demand)"
            find "${BUILDS_DIR}/rust" -name "*.wasm" -exec shasum -a 256 {} + | sed 's|.*/builds/|builds/|'
            echo ""
        fi

        # Include TinyGo checksums if available
        if [[ -f "${BUILDS_DIR}/tinygo/checksums.txt" ]]; then
            echo "# ============================================"
            echo "# TinyGo WebAssembly Builds"
            echo "# ============================================"
            cat "${BUILDS_DIR}/tinygo/checksums.txt"
            echo ""
        elif [[ -d "${BUILDS_DIR}/tinygo" ]]; then
            echo "# TinyGo builds (generated on-demand)"
            find "${BUILDS_DIR}/tinygo" -name "*.wasm" -exec shasum -a 256 {} + | sed 's|.*/builds/|builds/|'
            echo ""
        fi
    } > "${unified_checksum_file}"



    log_success "Unified checksums generated: ${unified_checksum_file}"
}


# Display enhanced build summary
display_summary() {
    log_section "Build Summary"

    local rust_count=0
    local tinygo_count=0
    local rust_size=0
    local tinygo_size=0

    # Count Rust builds and calculate total size
    if [[ -d "${BUILDS_DIR}/rust" ]]; then
        rust_count=$(find "${BUILDS_DIR}/rust" -name "*.wasm" | wc -l)
        for wasm_file in "${BUILDS_DIR}/rust"/*.wasm; do
            if [[ -f "${wasm_file}" ]]; then
                rust_size=$((rust_size + $(wc -c < "${wasm_file}")))
            fi
        done
    fi

    # Count TinyGo builds and calculate total size
    if [[ -d "${BUILDS_DIR}/tinygo" ]]; then
        tinygo_count=$(find "${BUILDS_DIR}/tinygo" -name "*.wasm" | wc -l)
        for wasm_file in "${BUILDS_DIR}/tinygo"/*.wasm; do
            if [[ -f "${wasm_file}" ]]; then
                tinygo_size=$((tinygo_size + $(wc -c < "${wasm_file}")))
            fi
        done
    fi

    # Format sizes
    local rust_size_kb=$((rust_size / 1024))
    local tinygo_size_kb=$((tinygo_size / 1024))

    echo "Language    | Tasks | Total Size"
    echo "------------|-------|------------"
    printf "%-11s | %5d | %7s KB\n" "Rust" "${rust_count}" "${rust_size_kb}"
    printf "%-11s | %5d | %7s KB\n" "TinyGo" "${tinygo_count}" "${tinygo_size_kb}"
    echo "------------|-------|------------"
    printf "%-11s | %5d | %7s KB\n" "Total" "$((rust_count + tinygo_count))" "$(((rust_size + tinygo_size) / 1024))"
    echo

    # Show available reports
    if [[ -f "${BUILDS_DIR}/checksums.txt" ]]; then
        log_info "📋 Unified checksums: ${BUILDS_DIR}/checksums.txt"
    fi

    if [[ -f "${BUILDS_DIR}/metrics.json" ]]; then
        log_info "📊 Unified metrics: ${BUILDS_DIR}/metrics.json"
    fi

    # Show individual language reports
    if [[ -f "${BUILDS_DIR}/rust/checksums.txt" ]]; then
        log_info "🦀 Rust checksums: ${BUILDS_DIR}/rust/checksums.txt"
    fi

    if [[ -f "${BUILDS_DIR}/tinygo/checksums.txt" ]]; then
        log_info "🐹 TinyGo checksums: ${BUILDS_DIR}/tinygo/checksums.txt"
    fi
}

# Main build function
main() {
    local build_rust=true
    local build_tinygo=true
    local clean=false
    local parallel=false
    local verbose=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -r|--rust-only)
                build_rust=true
                build_tinygo=false
                shift
                ;;
            -g|--tinygo-only)
                build_rust=false
                build_tinygo=true
                shift
                ;;
            -c|--clean)
                clean=true
                shift
                ;;
            -p|--parallel)
                parallel=true
                shift
                ;;
            --task-parallel)
                TASK_PARALLEL=true
                shift
                ;;
            --no-checksums)
                GENERATE_CHECKSUMS=false
                shift
                ;;
            -v|--verbose)
                verbose=true
                set -x
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Start build process
    log_section "WebAssembly Build Process Started"
    log_info "Project root: ${PROJECT_ROOT}"
    log_info "Build directory: ${BUILDS_DIR}"
    
    # Clean if requested
    if [[ "${clean}" == "true" ]]; then
        clean_builds
    fi
    
    # Create build directory
    mkdir -p "${BUILDS_DIR}"
    
    # Generate configuration JSONs from YAML (both normal and quick variants)
    log_info "Generating configuration JSONs from YAML..."
    local config_success=true

    # Build both configurations in parallel for efficiency
    node "${SCRIPT_DIR}/build_config.js" &
    local pid_normal=$!
    node "${SCRIPT_DIR}/build_config.js" --quick &
    local pid_quick=$!

    # Wait for both processes and check results
    if wait "${pid_normal}"; then
        log_success "✓ bench.json generated successfully"
    else
        log_error "✗ Failed to generate bench.json"
        config_success=false
    fi

    if wait "${pid_quick}"; then
        log_success "✓ bench-quick.json generated successfully"
    else
        log_error "✗ Failed to generate bench-quick.json"
        config_success=false
    fi

    if [[ "${config_success}" != "true" ]]; then
        log_error "Configuration generation failed"
        build_success=false
    fi
    
    # Build process
    local build_success=true
    
    if [[ "${parallel}" == "true" && "${build_rust}" == "true" && "${build_tinygo}" == "true" ]]; then
        log_info "Building Rust and TinyGo in parallel..."
        
        # Start background builds
        build_rust &
        local rust_pid=$!
        
        build_tinygo &
        local tinygo_pid=$!
        
        # Wait for both to complete
        wait ${rust_pid} || build_success=false
        wait ${tinygo_pid} || build_success=false
        
    else
        # Sequential builds
        if [[ "${build_rust}" == "true" ]]; then
            build_rust || build_success=false
        fi
        
        if [[ "${build_tinygo}" == "true" ]]; then
            build_tinygo || build_success=false
        fi
    fi
    
    # Generate post-build artifacts if any builds succeeded
    if [[ "${build_success}" == "true" ]]; then
        generate_checksums
        display_summary
        
        log_section "Build Process Completed Successfully"
    else
        log_error "Build process completed with errors"
        exit 1
    fi
}

# Make scripts executable on first run
chmod +x "${SCRIPT_DIR}/build_rust.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/build_tinygo.sh" 2>/dev/null || true

# Run main function
main "$@"