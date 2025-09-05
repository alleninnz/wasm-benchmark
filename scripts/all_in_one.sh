#!/bin/bash

# All-in-One WebAssembly Benchmark Runner
# Complete experiment flow from setup to analysis

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
RESULTS_DIR="${PROJECT_ROOT}/results"

# Print banner
print_banner() {
    cat << 'EOF'

 ╦ ╦┌─┐┌─┐┌┬┐  ╔╗ ┌─┐┌┐┌┌─┐┬ ┬┌┬┐┌─┐┬─┐┬┌─
 ║║║├─┤└─┐│││  ╠╩╗├┤ ││││  ├─┤││││├─┤├┬┘├┴┐
 ╚╩╝┴ ┴└─┘┴ ┴  ╚═╝└─┘┘└┘└─┘┴ ┴┴ ┴┴┴ ┴┴└─┴ ┴
                                                
    🦀 Rust vs TinyGo WebAssembly Performance 🐹
    Complete Experiment Suite - One Command Solution
    
EOF
}

# Print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run the complete WebAssembly benchmark experiment suite.

OPTIONS:
    -h, --help              Show this help message
    -s, --skip-build        Skip the build phase (use existing WASM files)
    -a, --analysis-only     Skip build and benchmark, run analysis only  
    -c, --clean             Clean all previous results and builds
    -q, --quick             Quick run with reduced sample sizes
    -v, --verbose           Enable verbose output throughout
    --headless              Run browser benchmarks in headless mode (default)
    --headed                Run browser benchmarks with visible browser
    --no-analysis           Skip the analysis phase
    --results-dir=DIR       Specify custom results directory

PHASES:
    1. Environment Fingerprinting  Generate system and toolchain information
    2. Build Phase                 Compile Rust and TinyGo WASM modules
    3. Benchmark Phase             Run performance measurements in browser
    4. Quality Control             Validate and clean measurement data
    5. Statistical Analysis        Generate reports and visualizations

EXAMPLES:
    $0                      # Full experiment with default settings
    $0 --quick              # Quick run for development/testing
    $0 --headed --verbose   # Full run with visible browser and detailed logs
    $0 --analysis-only      # Only run analysis on existing data
    $0 --clean              # Clean start (remove all previous results)

EOF
}

# Parse command line options
parse_options() {
    SKIP_BUILD=false
    ANALYSIS_ONLY=false
    CLEAN=false
    QUICK=false
    VERBOSE=false
    HEADLESS=true
    NO_ANALYSIS=false
    CUSTOM_RESULTS_DIR=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -s|--skip-build)
                SKIP_BUILD=true
                shift
                ;;
            -a|--analysis-only)
                ANALYSIS_ONLY=true
                shift
                ;;
            -c|--clean)
                CLEAN=true
                shift
                ;;
            -q|--quick)
                QUICK=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                set -x
                shift
                ;;
            --headless)
                HEADLESS=true
                shift
                ;;
            --headed)
                HEADLESS=false
                shift
                ;;
            --no-analysis)
                NO_ANALYSIS=true
                shift
                ;;
            --results-dir=*)
                CUSTOM_RESULTS_DIR="${1#*=}"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Override results directory if specified
    if [[ -n "$CUSTOM_RESULTS_DIR" ]]; then
        RESULTS_DIR="$CUSTOM_RESULTS_DIR"
    fi
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    local missing_tools=()
    
    # Essential build tools
    if [[ "$SKIP_BUILD" == false && "$ANALYSIS_ONLY" == false ]]; then
        command -v rustc >/dev/null 2>&1 || missing_tools+=("rustc")
        command -v cargo >/dev/null 2>&1 || missing_tools+=("cargo")
        command -v go >/dev/null 2>&1 || missing_tools+=("go")
        command -v tinygo >/dev/null 2>&1 || missing_tools+=("tinygo")
        command -v node >/dev/null 2>&1 || missing_tools+=("node")
    fi
    
    # Analysis tools
    if [[ "$NO_ANALYSIS" == false ]]; then
        command -v python3 >/dev/null 2>&1 || missing_tools+=("python3")
    fi
    
    # Optional but recommended
    command -v wasm-strip >/dev/null 2>&1 || log_warning "wasm-strip not found (wabt)"
    command -v wasm-opt >/dev/null 2>&1 || log_warning "wasm-opt not found (binaryen)"
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install the missing tools and try again"
        exit 1
    fi
    
    # Check Node.js dependencies
    if [[ "$SKIP_BUILD" == false && "$ANALYSIS_ONLY" == false ]]; then
        if [[ ! -f "${PROJECT_ROOT}/node_modules/.bin/puppeteer" ]] && [[ ! -f "${PROJECT_ROOT}/package.json" ]]; then
            log_warning "Node.js dependencies not installed. Run 'npm install' first."
        fi
    fi
    
    log_success "Prerequisites check completed"
}

# Clean previous results
clean_previous() {
    log_step "Cleaning previous results and builds..."
    
    rm -rf "${PROJECT_ROOT}/builds"
    rm -rf "${PROJECT_ROOT}/results"/*
    rm -rf "${PROJECT_ROOT}/.benchmark_cache"
    
    # Clean any temporary files
    find "${PROJECT_ROOT}" -name "*.tmp" -delete 2>/dev/null || true
    find "${PROJECT_ROOT}" -name ".DS_Store" -delete 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Generate environment fingerprint
generate_fingerprint() {
    log_step "Generating environment fingerprint..."
    
    chmod +x "${SCRIPT_DIR}/fingerprint.sh"
    if "${SCRIPT_DIR}/fingerprint.sh"; then
        log_success "Environment fingerprint generated"
    else
        log_error "Failed to generate environment fingerprint"
        exit 1
    fi
}

# Run build phase
run_build_phase() {
    log_step "Running build phase..."
    
    chmod +x "${SCRIPT_DIR}/build_all.sh"
    
    local build_args=()
    [[ "$VERBOSE" == true ]] && build_args+=("--verbose")
    [[ "$CLEAN" == true ]] && build_args+=("--clean")
    
    if "${SCRIPT_DIR}/build_all.sh" "${build_args[@]}"; then
        log_success "Build phase completed"
    else
        log_error "Build phase failed"
        exit 1
    fi
}

# Run benchmark phase  
run_benchmark_phase() {
    log_step "Running benchmark phase..."
    
    chmod +x "${SCRIPT_DIR}/run_browser_bench.js"
    
    local bench_args=()
    [[ "$HEADLESS" == true ]] && bench_args+=("--headless") || bench_args+=("--headed")
    [[ "$VERBOSE" == true ]] && bench_args+=("--verbose")
    [[ "$QUICK" == true ]] && bench_args+=("--timeout=60000") || bench_args+=("--timeout=300000")
    
    if node "${SCRIPT_DIR}/run_browser_bench.js" "${bench_args[@]}"; then
        log_success "Benchmark phase completed"
        return 0
    else
        log_error "Benchmark phase failed"
        return 1
    fi
}

# Run quality control
run_quality_control() {
    log_step "Running quality control..."
    
    # Find the most recent results directory
    local latest_results=$(find "${RESULTS_DIR}" -maxdepth 1 -type d -name "20*" | sort | tail -n1)
    
    if [[ -z "$latest_results" ]]; then
        log_error "No benchmark results found for quality control"
        return 1
    fi
    
    log_info "Processing results from: $latest_results"
    
    # Run QC script if it exists
    local qc_script="${PROJECT_ROOT}/analysis/qc.py"
    if [[ -f "$qc_script" ]]; then
        if python3 "$qc_script" "$latest_results"; then
            log_success "Quality control completed"
        else
            log_warning "Quality control reported issues (check logs)"
        fi
    else
        log_warning "QC script not found, skipping quality control"
    fi
}

# Run analysis phase
run_analysis_phase() {
    log_step "Running analysis phase..."
    
    # Find the most recent results directory
    local latest_results=$(find "${RESULTS_DIR}" -maxdepth 1 -type d -name "20*" | sort | tail -n1)
    
    if [[ -z "$latest_results" ]]; then
        log_error "No benchmark results found for analysis"
        return 1
    fi
    
    log_info "Analyzing results from: $latest_results"
    
    # Run statistics analysis
    local stats_script="${PROJECT_ROOT}/analysis/statistics.py"
    if [[ -f "$stats_script" ]]; then
        if python3 "$stats_script" "$latest_results"; then
            log_success "Statistical analysis completed"
        else
            log_error "Statistical analysis failed"
            return 1
        fi
    else
        log_warning "Statistics script not found"
    fi
    
    # Run visualization
    local plots_script="${PROJECT_ROOT}/analysis/plots.py"
    if [[ -f "$plots_script" ]]; then
        if python3 "$plots_script" "$latest_results"; then
            log_success "Visualization completed"
        else
            log_error "Visualization failed"
            return 1
        fi
    else
        log_warning "Plots script not found"
    fi
    
    log_success "Analysis phase completed"
}

# Generate final report
generate_report() {
    log_step "Generating final report..."
    
    local latest_results=$(find "${RESULTS_DIR}" -maxdepth 1 -type d -name "20*" | sort | tail -n1)
    
    if [[ -z "$latest_results" ]]; then
        log_warning "No results found for report generation"
        return
    fi
    
    local report_file="${latest_results}/experiment_report.md"
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    
    cat > "$report_file" << EOF
# WebAssembly Performance Benchmark Results

**Generated:** $timestamp  
**Experiment:** Rust vs TinyGo WebAssembly Performance Comparison  
**Results Directory:** $latest_results

## Experiment Overview

This experiment compared the performance of Rust and TinyGo when compiled to WebAssembly across three computational tasks:

1. **Mandelbrot Set** - CPU-intensive floating point computation
2. **JSON Parsing** - Structured data processing
3. **Matrix Multiplication** - Dense numerical computation

Each task was executed with three different input scales (small, medium, large) designed to progressively trigger garbage collection pressure in TinyGo.

## Results Summary

Results are available in the following files:
- \`raw_data.json\` - Complete measurement data
- \`raw_data.csv\` - CSV format for analysis tools
- \`final_dataset.csv\` - Quality-controlled data
- \`analysis/figures/\` - Generated charts and visualizations

## System Information

$(cat "${PROJECT_ROOT}/versions.lock" | grep -E "(os_|cpu_|memory_|rust_|go_|tinygo_)" | sed 's/^/- /')

## Analysis Details

Detailed statistical analysis and visualizations can be found in the \`analysis/\` subdirectory.

---
*Report generated by all_in_one.sh experiment runner*
EOF
    
    log_success "Final report generated: $report_file"
}

# Print experiment summary
print_summary() {
    log_section "Experiment Summary"
    
    local latest_results=$(find "${RESULTS_DIR}" -maxdepth 1 -type d -name "20*" | sort | tail -n1)
    
    if [[ -n "$latest_results" ]]; then
        log_success "Results saved to: $latest_results"
        
        # Count result files
        local json_files=$(find "$latest_results" -name "*.json" | wc -l)
        local csv_files=$(find "$latest_results" -name "*.csv" | wc -l)
        local figures=$(find "$latest_results" -name "figures" -type d 2>/dev/null && find "$latest_results/analysis/figures" -name "*.png" -o -name "*.svg" 2>/dev/null | wc -l || echo 0)
        
        echo "Generated artifacts:"
        echo "  - JSON files: $json_files"
        echo "  - CSV files: $csv_files"
        echo "  - Figures: $figures"
        
        if [[ -f "$latest_results/experiment_report.md" ]]; then
            log_info "📊 Experiment report: $latest_results/experiment_report.md"
        fi
    fi
    
    local duration=$(( ($(date +%s) - start_time) ))
    local hours=$(( duration / 3600 ))
    local minutes=$(( (duration % 3600) / 60 ))
    local seconds=$(( duration % 60 ))
    
    printf "Total experiment time: "
    [[ $hours -gt 0 ]] && printf "%dh " $hours
    [[ $minutes -gt 0 ]] && printf "%dm " $minutes
    printf "%ds\n" $seconds
}

# Main experiment function
main() {
    local start_time=$(date +%s)
    
    print_banner
    parse_options "$@"
    
    log_section "WebAssembly Benchmark Experiment Suite"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Results directory: $RESULTS_DIR" 
    log_info "Mode: $([ "$ANALYSIS_ONLY" == true ] && echo "Analysis only" || echo "Full experiment")"
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    
    # Phase 1: Cleanup (if requested)
    if [[ "$CLEAN" == true ]]; then
        clean_previous
    fi
    
    # Phase 2: Prerequisites check
    check_prerequisites
    
    # Phase 3: Environment fingerprinting (unless analysis-only)
    if [[ "$ANALYSIS_ONLY" == false ]]; then
        generate_fingerprint
    fi
    
    # Phase 4: Build phase (unless skipped)
    if [[ "$SKIP_BUILD" == false && "$ANALYSIS_ONLY" == false ]]; then
        run_build_phase
    fi
    
    # Phase 5: Benchmark phase (unless analysis-only)
    if [[ "$ANALYSIS_ONLY" == false ]]; then
        if ! run_benchmark_phase; then
            log_error "Benchmark phase failed. Continuing with any existing data..."
        fi
    fi
    
    # Phase 6: Quality control
    run_quality_control
    
    # Phase 7: Analysis phase (unless disabled)
    if [[ "$NO_ANALYSIS" == false ]]; then
        run_analysis_phase
    fi
    
    # Phase 8: Generate final report
    generate_report
    
    # Summary
    print_summary
    
    log_section "Experiment Completed Successfully! 🎉")
}

# Error handling
trap 'log_error "Experiment interrupted!"; exit 1' INT TERM

# Run main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi