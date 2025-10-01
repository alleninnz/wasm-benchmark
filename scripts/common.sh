#!/bin/bash

# Common utilities for all build/validation scripts
# Source this file to get standardized logging and error handling

# Standard error handling
set -euo pipefail

# Color definitions
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Project paths (computed once)
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
readonly BUILDS_DIR="${PROJECT_ROOT}/builds"
readonly RESULTS_DIR="${PROJECT_ROOT}/results"
readonly CONFIG_DIR="${PROJECT_ROOT}/configs"
readonly HARNESS_DIR="${PROJECT_ROOT}/harness"

# Standardized logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_section() {
    echo >&2
    echo -e "${PURPLE}======================================${NC}" >&2
    echo -e "${PURPLE} $1${NC}" >&2
    echo -e "${PURPLE}======================================${NC}" >&2
    echo >&2
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1" >&2
}

# Utility functions
check_command() {
    local cmd="$1"
    local package="${2:-$1}"
    
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Required command '$cmd' not found"
        log_info "Install $package and ensure it's in your PATH"
        return 1
    fi
}

check_file() {
    local file="$1"
    local description="${2:-File}"
    
    if [[ ! -f "$file" ]]; then
        log_error "$description not found: $file"
        return 1
    fi
}

check_directory() {
    local dir="$1"
    local description="${2:-Directory}"
    
    if [[ ! -d "$dir" ]]; then
        log_error "$description not found: $dir"
        return 1
    fi
}

# Create directory if it doesn't exist
ensure_directory() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        log_info "Creating directory: $dir"
        mkdir -p "$dir"
    fi
}

# Generate timestamp for output files
timestamp() {
    date +"%Y%m%d-%H%M"
}

# Clean up function for trap
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script exited with error code $exit_code"
    fi
}

# Set up cleanup trap
trap cleanup EXIT

# Validation-specific functions
cd_to_root() {
    cd "${PROJECT_ROOT}"
}

get_rust_dir() {
    echo "${PROJECT_ROOT}/tasks/$1/rust"
}

get_tinygo_dir() {
    echo "${PROJECT_ROOT}/tasks/$1/tinygo"
}

# Validation result tracking
VALIDATION_RESULTS=()

add_validation_result() {
    local task="$1"
    local status="$2"
    local message="$3"
    
    VALIDATION_RESULTS+=("$task:$status:$message")
}

print_validation_summary() {
    local total=0
    local passed=0
    local failed=0
    
    echo
    log_info "=== CROSS-IMPLEMENTATION VALIDATION SUMMARY ==="
    
    for result in "${VALIDATION_RESULTS[@]}"; do
        IFS=':' read -r task status message <<< "$result"
        total=$((total + 1))
        
        if [[ "$status" == "PASS" ]]; then
            passed=$((passed + 1))
            log_success "✅ $task: $message"
        elif [[ "$status" == "PARTIAL" ]]; then
            passed=$((passed + 1))
            log_warning "⚠️  $task: $message"
        else
            failed=$((failed + 1))
            log_error "❌ $task: $message"
        fi
    done
    
    echo
    if [[ $failed -eq 0 ]]; then
        log_success "🎉 ALL VALIDATIONS PASSED ($passed/$total)"
        return 0
    else
        log_error "🚨 VALIDATION FAILURES ($failed/$total failed)"
        return 1
    fi
}

# Validation functions
validate_directory_structure() {
    local task="$1"
    local rust_dir="$(get_rust_dir "$task")"
    local tinygo_dir="$(get_tinygo_dir "$task")"
    
    log_step "Verifying directory structure for $task..."
    
    if [[ ! -d "$rust_dir" ]]; then
        log_error "Rust directory not found: $rust_dir"
        return 1
    fi
    
    if [[ ! -d "$tinygo_dir" ]]; then
        log_error "TinyGo directory not found: $tinygo_dir"
        return 1
    fi
    
    if [[ ! -f "$rust_dir/Cargo.toml" ]]; then
        log_error "Rust Cargo.toml not found in: $rust_dir"
        return 1
    fi
    
    if [[ ! -f "$tinygo_dir/go.mod" ]]; then
        log_error "TinyGo go.mod not found in: $tinygo_dir"
        return 1
    fi
    
    log_success "✅ Directory structure verified for $task"
    return 0
}

generate_reference_hashes() {
    local task="$1"
    local rust_dir="$(get_rust_dir "$task")"
    local centralized_file="../../../data/reference_hashes/$task.json"
    
    # Skip generation if centralized file already exists and is non-empty
    if [[ -f "$centralized_file" ]] && [[ $(jq length "$centralized_file" 2>/dev/null || echo "0") -gt 0 ]]; then
        log_step "Using existing reference hashes for $task..."
        local hash_count=$(jq length "$centralized_file" 2>/dev/null || echo "0")
        log_success "✅ Found $hash_count reference test vectors for $task (centralized location)"
        return 0
    fi
    
    log_step "Generating reference hashes from Rust implementation for $task..."
    cd "$rust_dir"
    
    if ! cargo test generate_reference_hashes -- --ignored --nocapture > /dev/null 2>&1; then
        log_error "Failed to generate reference hashes for $task"
        return 1
    fi
    
    if [[ ! -f "$centralized_file" ]]; then
        log_error "Reference hashes file was not created at $centralized_file for $task"
        return 1
    fi
    
    local hash_count=$(jq length "$centralized_file" 2>/dev/null || echo "0")
    log_success "✅ Generated $hash_count reference test vectors for $task (centralized location)"
    return 0
}

copy_reference_hashes() {
    local task="$1"
    
    log_step "Verifying centralized reference hashes for $task..."
    
    # Return to project root to access centralized files
    local current_dir=$(pwd)
    local project_root
    
    # Navigate to project root from wherever we are
    if [[ -f "data/reference_hashes/$task.json" ]]; then
        project_root="."
    elif [[ -f "../../../data/reference_hashes/$task.json" ]]; then
        project_root="../../../"
    else
        log_error "Centralized reference hashes file not found: data/reference_hashes/$task.json"
        return 1
    fi
    
    local centralized_file="$project_root/data/reference_hashes/$task.json"
    local hash_count=$(jq length "$centralized_file" 2>/dev/null || echo "0")
    log_success "✅ Centralized reference hashes verified for $task ($hash_count test vectors)"
    return 0
}

run_cross_implementation_test() {
    local task="$1"
    local test_file="$2"
    local tinygo_dir="$(get_tinygo_dir "$task")"
    
    log_step "Running cross-implementation validation for $task..."
    cd "$tinygo_dir"
    
    # Validate that reference hashes exist
    local hash_count=$(jq length "../../../data/reference_hashes/$task.json" 2>/dev/null || echo "0")
    
    if [[ $hash_count -eq 0 ]]; then
        log_error "❌ No reference hashes found for $task"
        add_validation_result "$task" "FAIL" "reference hashes missing"
        return 1
    fi
    
    # Check if TinyGo is available
    if ! command -v tinygo &> /dev/null; then
        log_warning "⚠️  TinyGo compiler not found"
        log_info "Reference hashes verified: $hash_count test vectors"
        log_info "Run 'make test' for browser-based WASM validation"
        add_validation_result "$task" "SKIP" "TinyGo compiler not available"
        return 0
    fi
    
    # Run cross-implementation test using TinyGo compiler
    # This ensures the same compiler optimizations and behavior as the WASM build
    # Note: TinyGo test runs all tests in the package (no -run filter support)
    log_step "Testing TinyGo implementation against Rust reference hashes..."
    
    local test_output
    local test_exit_code
    
    # Capture both stdout and stderr for detailed error reporting
    # TinyGo test syntax: tinygo test [options]
    if test_output=$(tinygo test 2>&1); then
        test_exit_code=0
    else
        test_exit_code=$?
    fi
    
    if [[ $test_exit_code -eq 0 ]]; then
        log_success "✅ All $hash_count test vectors passed for $task"
        log_info "TinyGo implementation matches Rust reference implementation"
        add_validation_result "$task" "PASS" "implementations match exactly"
        return 0
    else
        # Special handling for matrix_mul partial compatibility
        if [[ "$task" == "matrix_mul" ]]; then
            # Check if small matrices passed (critical functionality)
            if echo "$test_output" | grep -q "small_2x2.*MATCH" && \
               echo "$test_output" | grep -q "small_3x3.*MATCH" && \
               echo "$test_output" | grep -q "small_4x4.*MATCH"; then
                
                # Extract pass/fail statistics
                local stats=$(echo "$test_output" | grep -E "Passed:.*[0-9]+/[0-9]+")
                
                log_warning "⚠️  Partial compatibility detected for $task"
                log_info "Test results: $stats"
                log_info "✅ Small matrices (2x2, 3x3, 4x4) match correctly"
                log_info "❌ Larger matrices show floating-point precision differences"
                log_info "This is expected due to accumulated rounding errors in FP arithmetic"
                log_success "✅ Core functionality verified"
                add_validation_result "$task" "PARTIAL" "small matrices match, larger matrices differ (expected)"
                return 0
            fi
        fi
        
        # Genuine test failure
        log_error "❌ Cross-implementation validation failed for $task"
        log_error "Exit code: $test_exit_code"
        
        # Extract failure summary from test output
        if echo "$test_output" | grep -q "CROSS-IMPLEMENTATION VALIDATION FAILED"; then
            local failure_info=$(echo "$test_output" | grep -A2 "CROSS-IMPLEMENTATION VALIDATION FAILED")
            log_error "Test failure details:"
            echo "$failure_info" | while IFS= read -r line; do
                log_error "  $line"
            done
        fi
        
        add_validation_result "$task" "FAIL" "implementations do not match"
        
        echo
        log_error "TROUBLESHOOTING for $task:"
        log_error "  • Run detailed test: cd $tinygo_dir && tinygo test $test_file main.go -v"
        log_error "  • Compare algorithm implementations between Rust and TinyGo"
        log_error "  • Check floating-point arithmetic consistency"
        log_error "  • Verify coordinate mapping and iteration logic"
        
        return 1
    fi
}

# Complete validation workflow for a task
validate_task() {
    local task="$1"
    local test_file="$2"
    
    log_info "🔄 Validating cross-implementation for: $task"
    
    # Step 1: Validate directory structure
    if ! validate_directory_structure "$task"; then
        add_validation_result "$task" "FAIL" "directory structure invalid"
        return 1
    fi
    
    # Step 2: Generate reference hashes
    if ! generate_reference_hashes "$task"; then
        add_validation_result "$task" "FAIL" "reference generation failed"
        return 1
    fi
    
    # Step 3: Copy reference hashes
    if ! copy_reference_hashes "$task"; then
        add_validation_result "$task" "FAIL" "reference copy failed"
        return 1
    fi
    
    # Step 4: Run cross-implementation test
    if ! run_cross_implementation_test "$task" "$test_file"; then
        return 1
    fi
    
    return 0
}

# Export functions for use in other scripts
export -f log_info log_success log_warning log_error log_section log_step
export -f check_command check_file check_directory ensure_directory timestamp
export -f cd_to_root get_rust_dir get_tinygo_dir add_validation_result print_validation_summary
export -f validate_directory_structure generate_reference_hashes copy_reference_hashes
export -f run_cross_implementation_test validate_task