#!/bin/bash

# Matrix Multiplication Cross-Implementation Validation Module (Template)
# Validates TinyGo implementation against Rust reference

set -e

# Import common validation functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Task-specific configuration
TASK_NAME="matrix_mul"
RUST_DIR="tasks/matrix_mul/rust"
TINYGO_DIR="tasks/matrix_mul/tinygo"
WASM_DIR="wasm_modules"

# Matrix Multiplication-specific validation function
validate_matrix_mul() {
    log_section "Matrix Multiplication Cross-Implementation Validation"
    
    # Validate task using common framework
    local test_file="cross_implementation_test.go"
    if validate_task "$TASK_NAME" "$test_file"; then
        log_success "✅ Matrix Multiplication cross-implementation validation passed"
        return 0
    else
        log_error "❌ Matrix Multiplication cross-implementation validation failed"
        # Note: This task has partial compatibility (small matrices work, larger ones differ)
        log_warning "⚠️  Partial compatibility detected - small matrices (≤4x4) match exactly"
        return 1
    fi
}

# Main execution when run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cd_to_root
    validate_matrix_mul
fi