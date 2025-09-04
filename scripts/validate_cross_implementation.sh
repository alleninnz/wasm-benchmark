#!/bin/bash

# Cross-Implementation Validation Controller
# Orchestrates validation across multiple WASM benchmark tasks

set -e

# Import common validation functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/validation_common.sh"

# Available task modules
AVAILABLE_TASKS=("mandelbrot" "json_parse")

# Usage information
show_usage() {
    echo "Usage: $0 [options] [tasks...]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -a, --all      Run validation for all available tasks"
    echo "  -l, --list     List available tasks"
    echo ""
    echo "Tasks:"
    for task in "${AVAILABLE_TASKS[@]}"; do
        echo "  $task"
    done
    echo ""
    echo "Examples:"
    echo "  $0 mandelbrot              # Validate only Mandelbrot task"
    echo "  $0 --all                   # Validate all tasks"
    echo "  $0 mandelbrot json_parse   # Validate specific tasks (when available)"
}

# List available tasks
list_tasks() {
    echo "Available validation tasks:"
    for task in "${AVAILABLE_TASKS[@]}"; do
        echo "  - $task"
    done
}

# Run validation for specific task
run_task_validation() {
    local task=$1
    local task_script="$SCRIPT_DIR/validate_${task}.sh"
    
    if [[ ! -f "$task_script" ]]; then
        log_error "❌ Validation script not found: $task_script"
        return 1
    fi
    
    log_info "Running validation for task: $task"
    if bash "$task_script"; then
        log_success "✅ $task validation passed"
        return 0
    else
        log_error "❌ $task validation failed"
        return 1
    fi
}

# Main execution logic
main() {
    cd_to_root
    
    local tasks_to_run=()
    local run_all=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -l|--list)
                list_tasks
                exit 0
                ;;
            -a|--all)
                run_all=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                # Check if it's a valid task
                if [[ " ${AVAILABLE_TASKS[*]} " =~ " $1 " ]]; then
                    tasks_to_run+=("$1")
                else
                    log_error "Unknown task: $1"
                    echo "Available tasks: ${AVAILABLE_TASKS[*]}"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Determine tasks to run
    if [[ "$run_all" == true ]]; then
        tasks_to_run=("${AVAILABLE_TASKS[@]}")
    elif [[ ${#tasks_to_run[@]} -eq 0 ]]; then
        log_error "No tasks specified. Use --help for usage information."
        exit 1
    fi
    
    # Execute validations
    log_section "Cross-Implementation Validation Controller"
    log_info "Tasks to validate: ${tasks_to_run[*]}"
    
    local failed_tasks=()
    local total_tasks=${#tasks_to_run[@]}
    
    for task in "${tasks_to_run[@]}"; do
        if ! run_task_validation "$task"; then
            failed_tasks+=("$task")
        fi
        echo ""  # Add spacing between tasks
    done
    
    # Summary
    log_section "Validation Summary"
    local passed_count=$((total_tasks - ${#failed_tasks[@]}))
    
    if [[ ${#failed_tasks[@]} -eq 0 ]]; then
        log_success "🎉 ALL VALIDATIONS PASSED ($passed_count/$total_tasks)"
        exit 0
    else
        log_error "❌ VALIDATION FAILURES DETECTED"
        log_info "Passed: $passed_count/$total_tasks"
        log_info "Failed tasks: ${failed_tasks[*]}"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"