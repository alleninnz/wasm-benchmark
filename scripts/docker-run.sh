#!/bin/bash
# WebAssembly Benchmark Docker Runner
# Run complete workflow in Docker container

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}${BOLD}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}${BOLD}[ERROR]${NC} $1"; }

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
}

# Build and start container
start_container() {
    log_info "Building and starting WebAssembly Benchmark container..."
    docker-compose up -d --build
    log_success "Container started successfully"
}

# Execute command in container
run_in_container() {
    local cmd="$1"
    log_info "Executing command: $cmd"
    docker-compose exec -T wasm-benchmark bash -c "$cmd"
}

# Initialize development environment
init_environment() {
    log_info "Initializing development environment..."
    run_in_container "make init"
    log_success "Environment initialization completed"
}

# Run complete pipeline
run_full_pipeline() {
    local mode="${1:-quick}"
    log_info "Running complete benchmark pipeline (mode: $mode)..."
    run_in_container "make all $mode"
    log_success "Benchmark testing completed"
}

# Enter container for development
enter_container() {
    log_info "Entering container for development..."
    docker-compose exec wasm-benchmark bash
}

# Show help information
show_help() {
    echo "WebAssembly Benchmark Docker Runner"
    echo ""
    echo "Usage:"
    echo "  $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start       Build and start container"
    echo "  init        Initialize environment (install dependencies)"
    echo "  build       Build WebAssembly modules"
    echo "  run [mode]  Run benchmarks (mode: quick or full)"
    echo "  test        Run test suite"
    echo "  analyze     Run data analysis"
    echo "  full        Run complete pipeline (init + build + run + analyze)"
    echo "  shell       Enter container shell"
    echo "  stop        Stop container"
    echo "  clean       Clean containers and images"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 full        # Run complete pipeline"
    echo "  $0 run quick   # Quick benchmark test"
    echo "  $0 shell       # Enter container for development"
}

# Stop container
stop_container() {
    log_info "Stopping container..."
    docker-compose down
    log_success "Container stopped"
}

# Clean containers and images
clean_container() {
    log_warning "Cleaning containers and images..."
    docker-compose down --rmi all --volumes --remove-orphans
    log_success "Cleanup completed"
}

# Main function
main() {
    local command="${1:-help}"

    check_docker

    case "$command" in
        start)
            start_container
            ;;
        init)
            start_container
            init_environment
            ;;
        build)
            start_container
            run_in_container "make build"
            ;;
        run)
            start_container
            run_full_pipeline "${2:-quick}"
            ;;
        test)
            start_container
            run_in_container "make test"
            ;;
        analyze)
            start_container
            run_in_container "make analyze"
            ;;
        full)
            start_container
            init_environment
            run_in_container "make build"
            run_full_pipeline "quick"
            ;;
        shell)
            start_container
            enter_container
            ;;
        stop)
            stop_container
            ;;
        clean)
            clean_container
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"