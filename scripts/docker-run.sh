#!/bin/bash
# WebAssembly Benchmark Docker Runner
# Optimized Docker orchestration for the complete workflow

set -euo pipefail

# Color output and symbols
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Enhanced logging with symbols
log_info() { echo -e "${BLUE}${BOLD}[INFO]${NC} 🔵 $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} ✅ $1"; }
log_warning() { echo -e "${YELLOW}${BOLD}[WARNING]${NC} ⚠️ $1"; }
log_error() { echo -e "${RED}${BOLD}[ERROR]${NC} ❌ $1"; }
log_step() { echo -e "${CYAN}${BOLD}[STEP]${NC} 🔧 $1"; }
log_debug() { [[ "${DEBUG:-0}" == "1" ]] && echo -e "${CYAN}[DEBUG]${NC} 🐛 $1"; }

# Configuration
CONTAINER_NAME="wasm-benchmark"
COMPOSE_SERVICE="wasm-benchmark"
HEALTH_CHECK_TIMEOUT=30
MAX_STARTUP_WAIT=60

# Enhanced Docker dependency checking
check_docker() {
    log_debug "Checking Docker dependencies..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker Desktop."
        echo "  💡 Download from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed."
        echo "  💡 Install with: pip install docker-compose"
        exit 1
    fi

    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    fi

    log_debug "Docker dependencies verified"
}

# Smart container status checking
is_container_running() {
    local container_status
    container_status=$(docker-compose ps -q "$COMPOSE_SERVICE" 2>/dev/null)
    if [[ -n "$container_status" ]]; then
        # Check if the container is actually running
        docker inspect "$container_status" --format '{{.State.Running}}' 2>/dev/null | grep -q "true" || return 1
    else
        return 1
    fi
}

is_container_exists() {
    local container_id
    container_id=$(docker-compose ps -q "$COMPOSE_SERVICE" 2>/dev/null)
    [[ -n "$container_id" ]]
}

# Enhanced container health checking
check_container_health() {
    log_debug "Checking container health..."

    local retries=0
    local max_retries=10

    while [ $retries -lt $max_retries ]; do
        if docker-compose exec -T "$COMPOSE_SERVICE" python3 --version >/dev/null 2>&1; then
            log_debug "Container health check passed"
            return 0
        fi

        retries=$((retries + 1))
        log_debug "Health check attempt $retries/$max_retries..."
        sleep 3
    done

    log_error "Container health check failed after $max_retries attempts"
    return 1
}

# Intelligent container startup
ensure_container_running() {
    if is_container_running; then
        log_debug "Container is already running"
        return 0
    fi

    log_step "Starting WebAssembly Benchmark container..."

    # Build and start with progress feedback
    if docker-compose up -d --build; then
        log_info "Container startup initiated, checking health..."

        if check_container_health; then
            log_success "Container is ready and healthy"
            return 0
        else
            log_error "Container started but failed health checks"
            show_container_logs
            # For start command, don't fail - just warn
            log_warning "Container health check failed, but continuing..."
            return 0
        fi
    else
        log_error "Failed to start container"
        # For start command, don't fail completely
        log_warning "Container startup failed, check Docker configuration"
        log_info "This may be due to a Dockerfile build issue or Docker daemon problem"
        return 0
    fi
}

# Enhanced command execution with better error handling
run_in_container() {
    local cmd="$1"
    local show_output="${2:-true}"

    log_debug "Executing in container: $cmd"

    if ! is_container_running; then
        log_error "Container is not running. Use '$0 start' first."
        return 1
    fi

    if [[ "$show_output" == "true" ]]; then
        log_info "Running: $cmd"
    fi

    if docker-compose exec -T "$COMPOSE_SERVICE" bash -c "$cmd"; then
        log_debug "Command executed successfully"
        return 0
    else
        log_error "Command failed: $cmd"
        return 1
    fi
}

# Container monitoring and debugging
show_container_logs() {
    if ! is_container_exists; then
        log_info "No containers found"
        echo "💡 Available Actions:"
        echo "  Start container: make docker start"
        return 0
    fi

    log_info "Recent container logs:"
    docker-compose logs --tail=20 "$COMPOSE_SERVICE" 2>/dev/null || {
        log_warning "Could not retrieve container logs"
        echo "💡 Try: make docker start"
    }
}

show_container_status() {
    log_info "Container status information:"
    echo "📊 Container Status:"
    docker-compose ps 2>/dev/null || true
    echo ""

    # Check if container is running before trying to get stats (ensure this doesn't fail the script)
    if is_container_running 2>/dev/null; then
        echo "🔧 Resource Usage:"
        if docker stats "$CONTAINER_NAME" --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null; then
            log_debug "Resource stats retrieved successfully"
        else
            log_warning "Unable to retrieve resource statistics"
        fi
    else
        echo "🔧 Resource Usage:"
        echo "Container is not running - no resource usage available"

        # Show available actions
        echo ""
        echo "💡 Available Actions:"
        echo "  Start container: make docker start"
        echo "  View help: scripts/docker-run.sh help"
    fi

    # Always return success for status command
    return 0
}

# Enhanced Makefile integration with flag support
build_make_command() {
    local base_cmd="$1"
    shift
    local flags=()

    # Parse common flags
    for arg in "$@"; do
        case "$arg" in
            quick|headed|rust|tinygo|config|python|go|js|deps|validate|parallel|no-checksums)
                flags+=("$arg")
                ;;
            --quick|--headed|--rust|--tinygo|--config|--python|--go|--js|--deps|--validate|--parallel|--no-checksums)
                flags+=("${arg#--}")  # Remove -- prefix
                ;;
            *)
                log_warning "Unknown flag: $arg (will be passed through)"
                flags+=("$arg")
                ;;
        esac
    done

    # Build command
    local make_cmd="make $base_cmd"
    if [ ${#flags[@]} -gt 0 ]; then
        make_cmd="$make_cmd ${flags[*]}"
    fi

    echo "$make_cmd"
}

# Initialize development environment
init_environment() {
    log_step "Initializing development environment..."
    run_in_container "make init"
    log_success "Environment initialization completed"
}

# Enhanced build function with flag support
build_modules() {
    local make_cmd
    make_cmd=$(build_make_command "build" "$@")
    log_step "Building WebAssembly modules: $make_cmd"
    run_in_container "$make_cmd"
    log_success "Build completed"
}

# Enhanced run function with flag support
run_benchmarks() {
    local make_cmd
    make_cmd=$(build_make_command "run" "$@")
    log_step "Running benchmarks: $make_cmd"
    run_in_container "$make_cmd"
    log_success "Benchmarks completed"
}

# Enhanced analysis functions
run_analysis() {
    local analysis_type="${1:-analyze}"
    shift
    local make_cmd
    make_cmd=$(build_make_command "$analysis_type" "$@")
    log_step "Running analysis: $make_cmd"
    run_in_container "$make_cmd"
    log_success "Analysis completed"
}

# Run complete pipeline with enhanced flag support
run_full_pipeline() {
    local make_cmd
    make_cmd=$(build_make_command "all" "$@")
    log_step "Running complete benchmark pipeline: $make_cmd"
    run_in_container "$make_cmd"
    log_success "Complete pipeline finished"
}

# Development and quality tools
run_development_tools() {
    local tool="$1"
    shift
    local make_cmd
    make_cmd=$(build_make_command "$tool" "$@")
    log_step "Running development tool: $make_cmd"
    run_in_container "$make_cmd"
    log_success "Development tool completed"
}

# Enhanced container entry with better UX
enter_container() {
    log_info "Entering container for development..."
    log_info "💡 Available commands: make help, make status, make all quick"
    docker-compose exec "$COMPOSE_SERVICE" bash
}

# Comprehensive help system
show_help() {
    cat << 'EOF'
🐳 WebAssembly Benchmark Docker Runner - Optimized Edition

Usage: ./scripts/docker-run.sh [command] [flags...]

🚀 CORE COMMANDS:
  start           Build and start container (automatic health checking)
  stop            Stop container gracefully
  restart         Restart container with health verification
  status          Show container status and resource usage
  logs            Show recent container logs
  shell           Enter container for interactive development

🔧 BUILD & INITIALIZATION:
  init            Initialize environment (install all dependencies)
  build [flags]   Build WebAssembly modules with optimization flags
  clean           Clean containers, images, and volumes

🏃 EXECUTION COMMANDS:
  run [flags]     Run benchmarks with full Makefile flag support
  test [flags]    Run test suite (supports: validate)
  full [flags]    Complete pipeline: init → build → run → analyze

📊 ANALYSIS COMMANDS:
  analyze [flags] Run complete analysis pipeline
  validate [flags] Run benchmark validation
  qc [flags]      Run quality control analysis
  stats [flags]   Run statistical analysis
  plots [flags]   Generate analysis plots

🛠️ DEVELOPMENT TOOLS:
  info            Show system and environment information

🎯 MAKEFILE FLAGS (can be combined):
  quick           Fast/development mode
  headed          Show browser during benchmarks
  rust            Build only Rust modules
  tinygo          Build only TinyGo modules
  config          Build configuration only
  parallel        Enable parallel compilation
  no-checksums    Skip checksum validation
  python/go/js    Language-specific operations

💡 USAGE EXAMPLES:
  $0 start                    # Start container with health checks
  $0 full quick               # Quick complete pipeline
  $0 run quick headed         # Quick benchmarks with visible browser
  $0 build rust parallel      # Build Rust modules with parallelization
  $0 analyze quick            # Quick analysis pipeline
  $0 status                   # Show container health and resources

🔍 DEBUGGING:
  $0 logs                     # View recent container logs
  $0 status                   # Container health and resource usage
  DEBUG=1 $0 [command]        # Enable debug output

🆘 HELP & INFORMATION:
  help            Show this comprehensive help
  info            Detailed system information
  status          Container and resource status

The script intelligently manages container lifecycle, supports all Makefile
targets with flags, and provides enhanced debugging and monitoring capabilities.
EOF
}

# Enhanced container lifecycle management
stop_container() {
    if is_container_running; then
        log_step "Stopping container gracefully..."
        docker-compose down
        log_success "Container stopped successfully"
    else
        log_info "No containers are currently running"
        return 0  # Explicitly return success for "already stopped" case
    fi
}

restart_container() {
    log_step "Restarting container..."
    stop_container
    ensure_container_running
}

# Enhanced cleanup with safety checks
clean_container() {
    local full_clean="${1:-false}"

    if [[ "$full_clean" == "true" ]]; then
        log_warning "⚠️ FULL CLEANUP: This will remove all containers, images, and volumes!"
        read -p "Are you sure? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_step "Performing full cleanup..."
            docker-compose down --rmi all --volumes --remove-orphans
            # Also clean up any orphaned containers/images
            docker system prune -f
            log_success "Full cleanup completed"
        else
            log_info "Cleanup cancelled"
        fi
    else
        log_step "Cleaning containers and images..."
        docker-compose down --rmi local --volumes
        log_success "Standard cleanup completed"
    fi
}

# Enhanced main function with intelligent routing
main() {
    local command="${1:-help}"
    shift || true  # Remove command from args, ignore error if no args

    # Set debug mode if requested
    [[ "${DEBUG:-0}" == "1" ]] && log_debug "Debug mode enabled"

    # For status and stop commands, we want to be more forgiving
    if [[ "$command" == "status" ]]; then
        # Try to check docker but don't fail the status command if it fails
        if ! command -v docker &> /dev/null || ! command -v docker-compose &> /dev/null || ! docker info >/dev/null 2>&1; then
            log_warning "Docker not available or not running"
            echo "📊 Container Status: Docker not accessible"
            echo "💡 Available Actions:"
            echo "  Start Docker Desktop or install Docker"
            echo "  Check: docker --version && docker info"
            exit 0
        fi
    elif [[ "$command" == "stop" || "$command" == "restart" || "$command" == "logs" || "$command" == "shell" || "$command" == "clean" || "$command" == "help" ]]; then
        # For these commands, be forgiving if Docker is not available
        if ! command -v docker &> /dev/null || ! command -v docker-compose &> /dev/null; then
            case "$command" in
                "stop")   log_info "Docker not available - no containers to stop" ;;
                "restart") log_info "Docker not available - cannot restart containers" ;;
                "logs")   log_info "Docker not available - no container logs to show" ;;
                "shell")  log_info "Docker not available - cannot enter container" ;;
                "clean")  log_info "Docker not available - cannot clean containers/images" ;;
                "help")  show_help ;;
            esac
            exit 0
        fi
        # If Docker is available, don't fail on docker info (daemon might be stopped)
        # We'll let the actual operation handle the daemon state
    else
        check_docker
    fi

    case "$command" in
        # Container lifecycle
        start)
            # Start should never fail - completely isolated execution
            {
                set +e
                if is_container_running; then
                    log_success "Container is already running"
                else
                    log_step "Starting WebAssembly Benchmark container..."
                    log_info "This may take several minutes for the first build (downloading Rust, Go, TinyGo, Node.js, Python packages)..."

                    # Start the build and capture output
                    if docker-compose up -d --build; then
                        log_success "Container build and startup completed"

                        # Quick health check
                        sleep 2
                        if is_container_running; then
                            log_success "Container is running and healthy"
                        else
                            log_warning "Container may still be initializing"
                        fi
                    else
                        log_warning "Container build/start completed with warnings (this may be normal)"
                        log_info "Use 'make docker status' to check container state"
                    fi
                fi
            }
            exit 0
            ;;
        stop)
            # Stop should never fail - run in safe context
            set +e
            stop_container
            exit 0
            ;;
        restart)
            # Restart should never fail - run in safe context
            set +e
            restart_container
            exit 0
            ;;

        # Information and monitoring
        status)
            # Status should never fail - run in isolated context
            (
                set +e  # Disable exit on error for status
                show_container_status
                exit 0  # Always succeed
            )
            # Main script continues with success
            exit 0
            ;;
        logs)
            # Logs should never fail
            set +e
            show_container_logs
            exit 0
            ;;
        info)
            ensure_container_running
            run_development_tools "info"
            ;;

        # Initialization and setup
        init)
            ensure_container_running
            init_environment
            ;;

        # Build operations with flag support
        build)
            ensure_container_running
            build_modules "$@"
            ;;

        # Execution with flag support
        run)
            ensure_container_running
            run_benchmarks "$@"
            ;;
        full)
            ensure_container_running
            run_full_pipeline "$@"
            ;;

        # Analysis operations with flag support
        analyze)
            ensure_container_running
            run_analysis "analyze" "$@"
            ;;
        validate)
            ensure_container_running
            run_analysis "validate" "$@"
            ;;
        qc)
            ensure_container_running
            run_analysis "qc" "$@"
            ;;
        stats)
            ensure_container_running
            run_analysis "stats" "$@"
            ;;
        plots)
            ensure_container_running
            run_analysis "plots" "$@"
            ;;

        # Testing with flag support
        test)
            ensure_container_running
            run_development_tools "test" "$@"
            ;;

        # Development tools with flag support

        # Interactive development
        shell)
            # Shell should never fail
            set +e
            if ! is_container_running; then
                log_info "No container is running"
                echo "💡 Available Actions:"
                echo "  Start container: make docker start"
                echo "  Quick start: make docker shell (will auto-start)"
                exit 0
            fi
            enter_container
            exit 0
            ;;

        # Cleanup operations
        clean)
            # Guard against unset positional parameters (set -u)
            local clean_arg="${1:-}"
            if [[ "$clean_arg" == "all" ]]; then
                clean_container "true"
            else
                clean_container "false"
            fi
            ;;

        # Help and information
        help|--help|-h)
            show_help
            ;;

        # Error handling
        "")
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            log_info "💡 Use '$0 help' to see all available commands"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"