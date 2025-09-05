#!/bin/bash

# JSON Parse Cross-Implementation Validation Module (Template)
# Validates TinyGo implementation against Rust reference

set -e

# Import common validation functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Task-specific configuration
TASK_NAME="json_parse"
RUST_DIR="tasks/json_parse/rust"
TINYGO_DIR="tasks/json_parse/tinygo"
WASM_DIR="wasm_modules"

# JSON Parse-specific validation function
validate_json_parse() {
    log_section "JSON Parse Cross-Implementation Validation"
    
    # Validate task using common framework
    local test_file="cross_implementation_test.go"
    if validate_task "$TASK_NAME" "$test_file"; then
        log_success "✅ JSON Parse cross-implementation validation passed"
        return 0
    else
        log_error "❌ JSON Parse cross-implementation validation failed"
        return 1
    fi
}

# Main execution when run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cd_to_root
    validate_json_parse
fi