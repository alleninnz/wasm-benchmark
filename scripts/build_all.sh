#!/bin/bash

# Build All WebAssembly Tasks
# One-click build script for both Rust and TinyGo implementations

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration (BUILDS_DIR already defined in common.sh)


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
    -p, --parallel      Build Rust and TinyGo in parallel (experimental)
    -v, --verbose       Enable verbose output

EXAMPLES:
    $0                  Build all tasks for both languages
    $0 -r               Build only Rust tasks
    $0 -g               Build only TinyGo tasks
    $0 -c -p            Clean and build in parallel
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

# Build Rust tasks
build_rust() {
    log_section "Building Rust WebAssembly Tasks"
    run_build_script "build_rust.sh"
}

# Build TinyGo tasks
build_tinygo() {
    log_section "Building TinyGo WebAssembly Tasks"
    run_build_script "build_tinygo.sh"
}

# Generate combined checksums
generate_checksums() {
    log_info "Generating combined checksums..."
    
    local checksum_file="${BUILDS_DIR}/checksums.txt"
    rm -f "${checksum_file}"
    
    {
        echo "# WebAssembly Build Checksums"
        echo "# Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        echo "#"
        echo "# Format: SHA256 *filename"
        echo ""
        
        # Rust checksums
        if [[ -d "${BUILDS_DIR}/rust" ]]; then
            echo "# Rust builds"
            find "${BUILDS_DIR}/rust" -name "*.wasm" -exec shasum -a 256 {} + | sed 's|.*/builds/|builds/|'
            echo ""
        fi
        
        # TinyGo checksums
        if [[ -d "${BUILDS_DIR}/tinygo" ]]; then
            echo "# TinyGo builds"
            find "${BUILDS_DIR}/tinygo" -name "*.wasm" -exec shasum -a 256 {} + | sed 's|.*/builds/|builds/|'
            echo ""
        fi
    } > "${checksum_file}"
    
    log_success "Checksums generated: ${checksum_file}"
}


# Display build summary
display_summary() {
    log_section "Build Summary"

    local rust_count=0
    local tinygo_count=0

    # Count Rust builds
    if [[ -d "${BUILDS_DIR}/rust" ]]; then
        rust_count=$(find "${BUILDS_DIR}/rust" -name "*.wasm" | wc -l)
    fi

    # Count TinyGo builds
    if [[ -d "${BUILDS_DIR}/tinygo" ]]; then
        tinygo_count=$(find "${BUILDS_DIR}/tinygo" -name "*.wasm" | wc -l)
    fi

    echo "Language    | Tasks"
    echo "------------|-------"
    printf "%-11s | %5d\n" "Rust" "${rust_count}"
    printf "%-11s | %5d\n" "TinyGo" "${tinygo_count}"
    echo "------------|-------"
    printf "%-11s | %5d\n" "Total" "$((rust_count + tinygo_count))"
    echo
    
    
    if [[ -f "${BUILDS_DIR}/checksums.txt" ]]; then
        log_info "Build checksums available in: ${BUILDS_DIR}/checksums.txt"
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
    
    # Generate configuration JSON from YAML
    log_info "Generating configuration JSON from YAML..."
    if ! node "${SCRIPT_DIR}/build_config.js"; then
        log_error "Failed to generate configuration JSON"
        build_success=false
    else
        log_success "Configuration JSON generated successfully"
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