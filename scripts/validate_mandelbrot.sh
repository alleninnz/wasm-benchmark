#!/bin/bash

# Mandelbrot Cross-Implementation Validation Module
# Validates TinyGo implementation against Rust reference

set -e

# Import common validation functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/validation_common.sh"

# Task-specific configuration
TASK_NAME="mandelbrot"
RUST_DIR="tasks/mandelbrot/rust"
TINYGO_DIR="tasks/mandelbrot/tinygo"
WASM_DIR="wasm_modules"

# Mandelbrot-specific validation function
validate_mandelbrot() {
    log_section "Mandelbrot Cross-Implementation Validation"
    
    # Validate task using common framework
    local test_file="cross_implementation_test.go"
    if validate_task "$TASK_NAME" "$test_file"; then
        log_success "✅ Mandelbrot cross-implementation validation passed"
        return 0
    else
        log_error "❌ Mandelbrot cross-implementation validation failed"
        return 1
    fi
}

# Main execution when run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cd_to_root
    validate_mandelbrot
fi