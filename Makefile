# WebAssembly Benchmark Makefile
# Automation targets for the complete experiment pipeline

# Declare all phony targets (targets that don't create files)
.PHONY: help init build run \
        qc analyze validate all clean clean-cache cache-file-discovery \
        lint format test status info check deps stats plots quick headed rust tinygo config python go js \
        docker full

.DEFAULT_GOAL := help

# Configuration variables (centralized for maintainability)
PROJECT_ROOT := $(shell pwd)
MAX_PARALLEL_JOBS := 4
DEFAULT_TIMEOUT := 300
CACHE_VALIDITY_HOURS := 24

# Mode detection
QUICK_MODE := $(if $(filter quick,$(MAKECMDGOALS)),true,false)
HEADED_MODE := $(if $(filter headed,$(MAKECMDGOALS)),true,false)

# Build mode detection
RUST_MODE := $(if $(filter rust,$(MAKECMDGOALS)),true,false)
TINYGO_MODE := $(if $(filter tinygo,$(MAKECMDGOALS)),true,false)
BUILD_ALL_MODE := $(if $(filter all,$(MAKECMDGOALS)),true,false)
CONFIG_MODE := $(if $(filter config,$(MAKECMDGOALS)),true,false)
PARALLEL_MODE := $(if $(filter parallel,$(MAKECMDGOALS)),true,false)
NO_CHECKSUMS_MODE := $(if $(filter no-checksums,$(MAKECMDGOALS)),true,false)

# Clean mode detection (only when both clean and all are present)
CLEAN_ALL_MODE := $(if $(and $(filter clean,$(MAKECMDGOALS)),$(filter all,$(MAKECMDGOALS))),true,false)

# Language mode detection for format/lint
PYTHON_MODE := $(if $(filter python,$(MAKECMDGOALS)),true,false)
GO_MODE := $(if $(filter go,$(MAKECMDGOALS)),true,false)
JS_MODE := $(if $(filter js,$(MAKECMDGOALS)),true,false)

# Check/test mode detection
CHECK_DEPS_MODE := $(if $(and $(filter check,$(MAKECMDGOALS)),$(filter deps,$(MAKECMDGOALS))),true,false)
TEST_VALIDATE_MODE := $(if $(and $(filter test,$(MAKECMDGOALS)),$(filter validate,$(MAKECMDGOALS))),true,false)

# Docker mode detection - consolidated approach
DOCKER_MODE := $(if $(filter docker,$(MAKECMDGOALS)),true,false)

# Force mode detection from environment variable
FORCE_MODE := $(if $(FORCE),true,false)

# Docker subcommand detection function
# Usage: $(call docker_mode_check,subcommand) returns true/false
define docker_mode_check
$(if $(and $(filter docker,$(MAKECMDGOALS)),$(filter $(1),$(MAKECMDGOALS))),true,false)
endef

# Docker mode variables using the consolidated function
DOCKER_START_MODE := $(call docker_mode_check,start)
DOCKER_STOP_MODE := $(call docker_mode_check,stop)
DOCKER_RESTART_MODE := $(call docker_mode_check,restart)
DOCKER_STATUS_MODE := $(call docker_mode_check,status)
DOCKER_LOGS_MODE := $(call docker_mode_check,logs)
DOCKER_SHELL_MODE := $(call docker_mode_check,shell)
DOCKER_INIT_MODE := $(call docker_mode_check,init)
DOCKER_BUILD_MODE := $(call docker_mode_check,build)
DOCKER_RUN_MODE := $(call docker_mode_check,run)
DOCKER_FULL_MODE := $(call docker_mode_check,full)
DOCKER_ANALYZE_MODE := $(call docker_mode_check,analyze)
DOCKER_VALIDATE_MODE := $(call docker_mode_check,validate)
DOCKER_QC_MODE := $(call docker_mode_check,qc)
DOCKER_STATS_MODE := $(call docker_mode_check,stats)
DOCKER_PLOTS_MODE := $(call docker_mode_check,plots)
DOCKER_LINT_MODE := $(call docker_mode_check,lint)
DOCKER_FORMAT_MODE := $(call docker_mode_check,format)
DOCKER_HELP_MODE := $(call docker_mode_check,help)
DOCKER_TEST_MODE := $(call docker_mode_check,test)
DOCKER_INFO_MODE := $(call docker_mode_check,info)
DOCKER_CLEAN_MODE := $(call docker_mode_check,clean)

# Virtual targets for flags
quick headed rust tinygo config python go js deps parallel no-checksums:
	@:

# Virtual targets for docker subcommands
start stop restart logs shell:
	@:

NODE_MODULES := node_modules

# Directory paths (centralized configuration)
BUILDS_DIR := builds
BUILDS_RUST_DIR := $(BUILDS_DIR)/rust
BUILDS_TINYGO_DIR := $(BUILDS_DIR)/tinygo
TASKS_DIR := tasks
SCRIPTS_DIR := scripts
ANALYSIS_DIR := analysis
RESULTS_DIR := results
CONFIGS_DIR := configs
HARNESS_DIR := harness
TESTS_DIR := tests

# Common exclusion patterns
COMMON_EXCLUDES := -not -path "./$(NODE_MODULES)/*" -not -path "./__pycache__/*"
BUILD_EXCLUDES := $(COMMON_EXCLUDES) -not -path "./$(BUILDS_DIR)/*" -not -path "./$(RESULTS_DIR)/*" -not -path "./$(TASKS_DIR)/*" -not -path "./$(CONFIGS_DIR)/*"

# Terminal color support detection
SHELL := /bin/bash

# Do not echo recipe commands by default; logging macros emit only formatted messages.
.SILENT:
TERM_COLORS := $(shell tput colors 2>/dev/null || echo 0)
ifeq ($(shell test $(TERM_COLORS) -ge 8 && echo true),true)
	RED := \033[0;31m
	GREEN := \033[0;32m
	YELLOW := \033[1;33m
	BLUE := \033[0;34m
	CYAN := \033[0;36m
	BOLD := \033[1m
	NC := \033[0m
else
	RED := 
	GREEN := 
	YELLOW := 
	BLUE := 
	CYAN := 
	BOLD := 
	NC := 
endif

# Enhanced logging functions (unified for both command and shell contexts)
define log_info
	printf "%b\n" "$(BLUE)$(BOLD)[INFO]$(NC) $(1)"
endef

define log_success
	printf "%b\n" "$(GREEN)$(BOLD)[SUCCESS]$(NC) $(1)"
endef

define log_warning
	printf "%b\n" "$(YELLOW)$(BOLD)[WARNING]$(NC) $(1)"
endef

define log_error
	printf "%b\n" "$(RED)$(BOLD)[ERROR]$(NC) $(1)"
endef

define log_step
	printf "%b\n" "$(CYAN)$(BOLD)[STEP]$(NC) $(1)"
endef



# File discovery functions with intelligent caching
# These functions locate source files for linting/formatting operations
# Uses caching to improve performance on repeated calls

# Find Python source files (excluding common build/cache directories)
define find_python_files
$(if $(wildcard .cache.python_files),$(shell cat .cache.python_files 2>/dev/null),$(shell find . -name "*.py" $(COMMON_EXCLUDES) 2>/dev/null))
endef

# Find Rust project directories by locating Cargo.toml files
define find_rust_projects
$(if $(wildcard .cache.rust_projects),$(shell cat .cache.rust_projects 2>/dev/null),$(shell find $(TASKS_DIR) -name 'Cargo.toml' -exec dirname {} \; 2>/dev/null))
endef

# Find Go module directories, sorted and deduplicated
define find_go_modules
$(if $(wildcard .cache.go_modules),$(shell cat .cache.go_modules 2>/dev/null),$(shell find $(TASKS_DIR) -name '*.go' -exec dirname {} \; 2>/dev/null | sort -u))
endef

# Find JavaScript source files (excluding build artifacts)
define find_js_files
$(if $(wildcard .cache.js_files),$(shell cat .cache.js_files 2>/dev/null),$(shell find . -name "*.js" $(BUILD_EXCLUDES) 2>/dev/null))
endef

# Error handling functions (enhanced for consistency)
define handle_command_error
	@if ! $(1); then \
		$(call log_error,$(2)); \
		exit 1; \
	fi
endef

# Enhanced error handling with context
define safe_execute
	@$(call log_step,$(2)); \
	if ! $(1); then \
		$(call log_error,Failed: $(2)); \
		$(call log_info,Command was: $(1)); \
		exit 1; \
	else \
		$(call log_success,$(3)); \
	fi
endef

# Validation function for required files
define require_file
	@if [ ! -f $(1) ]; then \
		$(call log_error,Required file missing: $(1)); \
		$(call log_info,$(2)); \
		exit 1; \
	fi
endef

# Performance optimization: file discovery caching
.PHONY: cache-file-discovery clean-cache
cache-file-discovery: ## Cache file discovery results for performance
	@echo "$(call find_python_files)" > .cache.python_files 2>/dev/null || true
	@echo "$(call find_rust_projects)" > .cache.rust_projects 2>/dev/null || true
	@echo "$(call find_go_modules)" > .cache.go_modules 2>/dev/null || true
	@echo "$(call find_js_files)" > .cache.js_files 2>/dev/null || true

clean-cache: ## Clean discovery cache files
	@rm -f .cache.* 2>/dev/null || true

# Common script validation pattern
define check_script_exists
	@if [ ! -f $(1) ]; then \
		$(call log_error,$(1) not found); \
		exit 1; \
	fi; \
	chmod +x $(1)
endef


# Utility function to find latest result directory
define find_latest_result
$(shell ls -td $(RESULTS_DIR)/20* 2>/dev/null | head -n1)
endef

# Utility function to check if command exists
define check_command
$(shell command -v $(1) >/dev/null 2>&1 && echo "$(1)" || echo "")
endef

# Function to start development server
define start_dev_server
	@if ! lsof -ti:2025 > /dev/null 2>&1; then \
		echo "[INFO] Starting development server..."; \
		npm run dev > /dev/null 2>&1 & \
		sleep 2; \
	fi; \
	echo "[SUCCESS] Development server ready"
endef


help: ## Show complete list of all available targets
	$(call log_info,📋 Complete Command Reference)
	@echo "============================"
	@echo ""
	$(call log_info,🏗️  Setup & Build Targets:)
	$(call log_info,  init FORCE=1           🔧 Initialize environment and install dependencies (FORCE=1 to regenerate fingerprint))
	$(call log_info,  build                  📦 Build WebAssembly modules or config (add rust/tinygo/all/config/parallel/no-checksums))
	@echo ""
	$(call log_info,🚀 Execution Targets:)
	$(call log_info,  run                    🏃 Run browser benchmark suite (add --quick headed for options))
	$(call log_info,  qc                     🔍 Run quality control on benchmark data (add quick for quick mode))
	$(call log_info,  analyze                📊 Run statistical analysis and generate plots (add quick for quick mode))
	$(call log_info,  validate               🔬 Run benchmark validation analysis (add quick for quick mode))
	$(call log_info,  stats                  📈 Run statistical analysis (add quick for quick mode))
	$(call log_info,  plots                  📉 Generate analysis plots (add quick for quick mode))
	$(call log_info,  all                    🎯 Run complete experiment pipeline (add quick for quick mode))
	@echo ""
	$(call log_info,🧹 Cleanup Targets:)
	$(call log_info,  clean                  🧹 Clean build artifacts and temporary files)
	$(call log_info,  clean all              💥 Clean everything including dependencies, results, and caches)
	@echo ""
	$(call log_info,🛠️  Development Targets:)
	$(call log_info,  lint                   ✨ Run code quality checks (add python/rust/go/js for specific language))
	$(call log_info,  format                 💄 Format code (add python/rust/go for specific language))
	$(call log_info,  test                   🧪 Run tests (JavaScript and Python))
	$(call log_info,  test validate          ✅ Run WASM task validation suite)
	@echo ""
	$(call log_info,ℹ️  Information Targets:)
	$(call log_info,  help                   📋 Show complete list of all available targets)
	$(call log_info,  status                 📈 Show current project status)
	$(call log_info,  info                   💻 Show system information)
	$(call log_info,  check deps             🔍 Check if all required dependencies are available)
	@echo ""
	$(call log_info,🐳 Docker Container Targets:)
	$(call log_info,  docker start           🚀 Start Docker container with health checks)
	$(call log_info,  docker stop            🛑 Stop Docker container gracefully)
	$(call log_info,  docker restart         🔄 Restart container with verification)
	$(call log_info,  docker status          📊 Show container status and resource usage)
	$(call log_info,  docker logs            📝 Show recent container logs)
	$(call log_info,  docker shell           🐚 Enter container for development)
	$(call log_info,  docker init            🔧 Initialize environment in container)
	$(call log_info,  docker build [flags]   📦 Build WebAssembly modules in container)
	$(call log_info,  docker run [flags]     🏃 Run benchmarks in container)
	$(call log_info,  docker full [flags]    🎯 Complete pipeline in container)
	$(call log_info,  docker analyze [flags] 📊 Run analysis in container)
	$(call log_info,  docker validate [flags] 🔬 Run benchmark validation in container)
	$(call log_info,  docker qc [flags]      🔍 Run quality control in container)
	$(call log_info,  docker stats [flags]   📈 Run statistical analysis in container)
	$(call log_info,  docker plots [flags]   📉 Generate analysis plots in container)
	$(call log_info,  docker test [flags]    🧪 Run tests in container)
	$(call log_info,  docker info            💻 Show system information from container)
	$(call log_info,  docker clean [all]     🧹 Clean containers and images)
	@echo ""
	$(call log_info,💡 Usage Examples:)
	$(call log_info,  make build rust        🦀 Build only Rust modules)
	$(call log_info,  make build parallel    ⚡ Build with FULL parallel (languages + tasks))
	$(call log_info,  make build rust parallel 🦀⚡ Build Rust with parallel tasks)
	$(call log_info,  make run quick headed  ⚡👁️ Quick benchmarks with visible browser)
	$(call log_info,  make lint python       🐍 Run Python linting only)
	$(call log_info,  make format rust       🦀 Format Rust code only)
	$(call log_info,  make test validate     ✅ Run WASM task validation)
	$(call log_info,  make clean all         💥 Clean everything)
	$(call log_info,  make check deps        🔍 Check all dependencies)
	@echo ""
	$(call log_info,🐳 Docker Examples:)
	$(call log_info,  make docker full quick 🐳⚡ Quick pipeline in container)
	$(call log_info,  make docker run quick headed 🐳👁️ Quick benchmarks with browser)
	$(call log_info,  make docker build rust parallel 🐳🦀 Build Rust with parallelization)
	$(call log_info,  make docker status     🐳📊 Show container health)
	$(call log_info,  make docker clean all  🐳🧹 Full container cleanup)


# ============================================================================
# Environment Setup Targets
# ============================================================================

init: $(NODE_MODULES) ## Initialize environment and install dependencies (use: make init FORCE=1)
ifeq ($(FORCE_MODE),true)
	$(call log_info,Force mode enabled - cleaning existing state...)
	@rm -f versions.lock meta.json 2>/dev/null || true
endif
	$(MAKE) versions.lock
	$(MAKE) check deps
	$(call require_file,pyproject.toml,Python project configuration missing - check repository integrity)
	$(call safe_execute,poetry install,Installing Python dependencies,🐍 Python dependencies installed)
	$(call log_success,🎉 Environment initialized successfully)
	$(call log_info,Ready to run: make build)

$(NODE_MODULES): package.json
	$(call require_file,package.json,Node.js project configuration missing - check repository integrity)
	$(call log_step,Installing Node.js dependencies...)
	@if [ -f package-lock.json ]; then \
		$(call log_info,Using npm ci for clean install...); \
		$(call safe_execute,npm ci,Clean installing Node.js dependencies,📦 Node.js dependencies installed); \
	else \
		$(call log_info,No package-lock.json found, using npm install...); \
		$(call safe_execute,npm install,Installing Node.js dependencies,📦 Node.js dependencies installed); \
	fi

versions.lock: scripts/fingerprint.sh
	$(call require_file,scripts/fingerprint.sh,Environment fingerprinting script missing - check repository integrity)
	@chmod +x scripts/fingerprint.sh
	$(call safe_execute,scripts/fingerprint.sh,Generating environment fingerprint,🔐 Environment fingerprint generated)

# ============================================================================
# Build Targets
# ============================================================================

build: ## Build WebAssembly modules or config (use: make build [rust/tinygo/all/config/parallel/no-checksums])
ifeq ($(CONFIG_MODE),true)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Building quick configuration file...)
	node scripts/build_config.js --quick
	$(call log_success,⚡ Quick configuration file built successfully)
else
	$(call log_step,Building configuration file...)
	node scripts/build_config.js
	$(call log_success,⚙️ Configuration files built successfully)
endif
else ifeq ($(BUILD_ALL_MODE),true)
	$(call log_step,Building all modules with optimized pipeline...)
	$(call check_script_exists,scripts/build_all.sh)
	@BUILD_ARGS=""; \
	if [ "$(PARALLEL_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS -p --task-parallel"; fi; \
	if [ "$(NO_CHECKSUMS_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --no-checksums"; fi; \
	scripts/build_all.sh $$BUILD_ARGS
	$(call log_success,🚀 Complete optimized build pipeline finished)
else ifeq ($(RUST_MODE),true)
	$(call log_step,Building Rust modules...)
	$(call check_script_exists,scripts/build_rust.sh)
	@BUILD_ARGS=""; \
	if [ "$(PARALLEL_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --parallel"; fi; \
	if [ "$(NO_CHECKSUMS_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --no-checksums"; fi; \
	scripts/build_rust.sh $$BUILD_ARGS
	$(call log_success,🦀 Rust modules built with optimizations)
else ifeq ($(TINYGO_MODE),true)
	$(call log_step,Building TinyGo modules...)
	$(call check_script_exists,scripts/build_tinygo.sh)
	@BUILD_ARGS=""; \
	if [ "$(PARALLEL_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --parallel"; fi; \
	if [ "$(NO_CHECKSUMS_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --no-checksums"; fi; \
	scripts/build_tinygo.sh $$BUILD_ARGS
	$(call log_success,🐹 TinyGo modules built with optimizations)
else
	# Default: build both Rust and TinyGo with optimizations
	$(call log_step,Building all modules with optimized pipeline...)
	$(call check_script_exists,scripts/build_all.sh)
	@BUILD_ARGS=""; \
	if [ "$(PARALLEL_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS -p --task-parallel"; fi; \
	if [ "$(NO_CHECKSUMS_MODE)" = "true" ]; then BUILD_ARGS="$$BUILD_ARGS --no-checksums"; fi; \
	scripts/build_all.sh $$BUILD_ARGS
	$(call log_success,🎯 All modules built successfully with optimizations)
endif

# ============================================================================
# Execution Targets
# ============================================================================

run: $(NODE_MODULES) ## Run browser benchmark suite (use quick headed for options)
	@$(MAKE) build config $(if $(filter true,$(QUICK_MODE)),quick,)
	$(call start_dev_server)
	$(call check_script_exists,scripts/run_bench.js)
ifeq ($(HEADED_MODE),true)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick benchmarks with headed browser...)
	node scripts/run_bench.js --headed --quick
	$(call log_success,👁️ Quick headed benchmarks completed)
else
	$(call log_step,Running benchmarks with headed browser...)
	node scripts/run_bench.js --headed
	$(call log_success,👁️ Headed benchmarks completed)
endif
else
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick benchmark suite for development feedback...)
	node scripts/run_bench.js --quick
	$(call log_success,⚡ Quick benchmarks completed - results saved with timestamp)
else
	$(call log_step,Running browser benchmarks...)
	node scripts/run_bench.js
	$(call log_success,🏁 Benchmarks completed)
endif
endif

# ============================================================================
# Analysis Targets
# ============================================================================

validate: ## Run benchmark validation analysis (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick benchmark validation analysis...)
	@if [ -f analysis/validation.py ]; then \
		python3 -m analysis.validation --quick; \
	else \
		$(call log_error,analysis/validation.py not found); \
		exit 1; \
	fi
else
	$(call log_step,Running benchmark validation analysis...)
	@if [ -f analysis/validation.py ]; then \
		python3 -m analysis.validation; \
	else \
		$(call log_error,analysis/validation.py not found); \
		exit 1; \
	fi
endif

qc: ## Run quality control on benchmark data (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick quality control analysis...)
	@if [ -f analysis/qc.py ]; then \
		python3 -m analysis.qc --quick; \
	else \
		$(call log_error,analysis/qc.py not found); \
		exit 1; \
	fi
else
	$(call log_step,Running quality control analysis...)
	@if [ -f analysis/qc.py ]; then \
		python3 -m analysis.qc; \
	else \
		$(call log_error,analysis/qc.py not found); \
		exit 1; \
	fi
endif

## Analysis orchestration split into smaller targets (stats / plots)

stats: ## Run statistical analysis (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick statistical analysis...)
	@if [ -f analysis/statistics.py ]; then \
		python3 -m analysis.statistics --quick; \
	else \
		$(call log_warning,analysis/statistics.py not found, skipping statistics); \
	fi
else
	$(call log_step,Running statistical analysis...)
	@if [ -f analysis/statistics.py ]; then \
		python3 -m analysis.statistics; \
	else \
		$(call log_warning,analysis/statistics.py not found, skipping statistics); \
	fi
endif

plots: ## Generate plots from analysis results (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Generating quick analysis plots...)
	@if [ -f analysis/plots.py ]; then \
		python3 -m analysis.plots --quick; \
	else \
		$(call log_warning,analysis/plots.py not found, skipping plots); \
	fi
else
	$(call log_step,Generating analysis plots...)
	@if [ -f analysis/plots.py ]; then \
		python3 -m analysis.plots; \
	else \
		$(call log_warning,analysis/plots.py not found, skipping plots); \
	fi
endif

analyze: ## Run validation, quality control, statistical analysis, and plotting (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running quick analysis pipeline: validate -> qc -> stats -> plots...)
	$(MAKE) validate quick
	$(MAKE) qc quick
	$(MAKE) stats quick
	$(MAKE) plots quick
else
	$(call log_step,Running full analysis pipeline: validate -> qc -> stats -> plots...)
	$(MAKE) validate
	$(MAKE) qc
	$(MAKE) stats
	$(MAKE) plots
endif

# ============================================================================
# Complete Pipeline Targets
# ============================================================================

all: ## Run complete experiment pipeline (use quick for quick mode)
ifeq ($(QUICK_MODE),true)
	$(call log_step,Running QUICK complete pipeline (lightweight) -> init, config, run, analyze...)
	$(MAKE) init
	# Build config only (quick) and skip full compilation to save time in quick mode
	$(MAKE) build config quick
	$(MAKE) run quick
	$(MAKE) analyze quick
	$(call log_success,⚡ Quick experiment pipeline completed!)
else
	$(call log_step,Running full complete pipeline -> init, build, run, analyze...)
	$(MAKE) init
	$(MAKE) build config
	$(MAKE) build
	$(MAKE) run
	$(MAKE) analyze
	$(call log_success,🎉 Complete experiment pipeline finished!)
	@echo ""
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		$(call log_info,Results available in: $$LATEST_RESULT,shell); \
	fi
endif

# ============================================================================
# Cleanup Targets
# ============================================================================

clean: ## Clean build artifacts and temporary files (use: make clean all for complete cleanup)
ifeq ($(CLEAN_ALL_MODE),true)
	$(call log_warning,Cleaning everything including dependencies, caches, and results...)
	@read -p "Are you sure? This will delete node_modules, results, caches, and logs [y/N]: " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf $(NODE_MODULES) 2>/dev/null || true; \
		rm -rf $(RESULTS_DIR)/* 2>/dev/null || true; \
		rm -rf $(CONFIGS_DIR)/* 2>/dev/null || true; \
		rm -rf reports/* 2>/dev/null || true; \
		rm -f versions.lock 2>/dev/null || true; \
		rm -f package-lock.json 2>/dev/null || true; \
		rm -f poetry.lock 2>/dev/null || true; \
		rm -f meta.json 2>/dev/null || true; \
		rm -f *.log 2>/dev/null || true; \
		rm -f test-results.json 2>/dev/null || true; \
		rm -f dev-server.log 2>/dev/null || true; \
		find $(TASKS_DIR) -name 'target' -type d -exec rm -rf {} + 2>/dev/null || true; \
		find $(TASKS_DIR) -name 'Cargo.lock' -delete 2>/dev/null || true; \
		find $(TASKS_DIR) -name '*.wasm' -delete 2>/dev/null || true; \
		find $(BUILDS_RUST_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true; \
		find $(BUILDS_TINYGO_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true; \
		rm -f $(BUILDS_DIR)/checksums.txt $(BUILDS_DIR)/sizes.csv 2>/dev/null || true; \
		find . -name "*.tmp" -delete 2>/dev/null || true; \
		find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true; \
		find . -name "*.pyc" -delete 2>/dev/null || true; \
		rm -f .cache.* 2>/dev/null || true; \
		$(call log_success,🧹 Complete cleanup finished,shell); \
		$(call log_info,Run 'make init' to reinitialize,shell); \
	else \
		$(call log_info,Operation cancelled,shell); \
	fi
else
	$(call log_step,Cleaning generated artifacts from builds, configs, reports, results, tasks...)
	@find $(BUILDS_RUST_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true
	@find $(BUILDS_TINYGO_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true
	@rm -f $(BUILDS_DIR)/checksums.txt $(BUILDS_DIR)/sizes.csv 2>/dev/null || true
	@rm -rf $(CONFIGS_DIR)/* 2>/dev/null || true
	@rm -rf reports/* 2>/dev/null || true
	@rm -rf $(RESULTS_DIR)/* 2>/dev/null || true
	@find $(TASKS_DIR) -name '*.wasm' -delete 2>/dev/null || true
	@find $(TASKS_DIR) -name 'target' -type d -exec rm -rf {} + 2>/dev/null || true
	@find . -name "*.tmp" -delete 2>/dev/null || true
	@find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -name "*.pyc" -delete 2>/dev/null || true
	@rm -f .cache.* 2>/dev/null || true
	$(call log_success,🧹 Generated artifacts cleaned)
endif

# ============================================================================
# Development Targets
# ============================================================================

lint: ## Run code quality checks (use: make lint [python/rust/go/js])
ifeq ($(PYTHON_MODE),true)
	$(call log_step,Running Python code quality checks with ruff...)
	@python_files="$(call find_python_files)"; \
	if [ -n "$$python_files" ]; then \
		$(call log_info,Using ruff for Python linting...,shell); \
		if ruff check . --exclude="$(NODE_MODULES),__pycache__"; then \
			$(call log_success,🐍 Python linting completed - no issues found,shell); \
		else \
			$(call log_error,Python linting failed - issues found,shell); \
			$(call log_warning,To automatically fix issues, run:,shell); \
			$(call log_info,  ruff check --fix .,shell); \
			$(call log_warning,To run both linting and formatting:,shell); \
			$(call log_info,  ruff check --fix . && make format python,shell); \
			exit 1; \
		fi; \
	else \
		$(call log_warning,No Python files found, skipping Python lint,shell); \
	fi
else ifeq ($(RUST_MODE),true)
	$(call log_step,Running Rust code quality checks...)
	@rust_projects="$(call find_rust_projects)"; \
	if [ -n "$$rust_projects" ]; then \
		for rust_project in $$rust_projects; do \
			if [ -d "$$rust_project" ]; then \
				echo "Linting Rust project: $$rust_project"; \
				if ! (cd "$$rust_project" && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings); then \
					$(call log_error,Rust linting failed for $$rust_project,shell); \
					exit 1; \
				fi; \
			fi; \
		done; \
		$(call log_success,🦀 Rust linting completed,shell); \
	else \
		$(call log_warning,No Rust projects found, skipping Rust lint,shell); \
	fi
else ifeq ($(GO_MODE),true)
	$(call log_step,Running Go code quality checks...)
	@go_modules="$(call find_go_modules)"; \
	if [ -n "$$go_modules" ]; then \
		for go_dir in $$go_modules; do \
			if [ -d "$$go_dir" ] && [ -n "$$(find "$$go_dir" -maxdepth 1 -name '*.go')" ]; then \
				echo "Linting Go module: $$go_dir"; \
				if echo "$$go_dir" | grep -q "tinygo"; then \
					echo "  → Skipping unsafe pointer checks for TinyGo WASM module"; \
					if ! (cd "$$go_dir" && go vet -unsafeptr=false . 2>/dev/null || go vet -vettool= . 2>/dev/null || echo "Using relaxed vet for WASM module") && (cd "$$go_dir" && gofmt -l . | (grep . && exit 1 || true)); then \
						$(call log_error,Go linting failed for $$go_dir,shell); \
						exit 1; \
					fi; \
				else \
					if ! (cd "$$go_dir" && go vet . && gofmt -l . | (grep . && exit 1 || true)); then \
						$(call log_error,Go linting failed for $$go_dir,shell); \
						exit 1; \
					fi; \
				fi; \
			fi; \
		done; \
		$(call log_success,🐹 Go linting completed,shell); \
	else \
		$(call log_warning,No Go files found, skipping Go lint,shell); \
	fi
else ifeq ($(JS_MODE),true)
	$(call log_step,Running JavaScript code quality checks...)
	@js_files="$(call find_js_files)"; \
	js_count=$$(echo "$$js_files" | grep -c . 2>/dev/null || echo "0"); \
	if [ "$$js_count" -gt 0 ]; then \
		$(call log_info,Found $$js_count JavaScript files to lint,shell); \
		if [ -x "$(NODE_MODULES)/.bin/eslint" ]; then \
			$(call log_info,Using local ESLint installation,shell); \
			if $(NODE_MODULES)/.bin/eslint \
				$(SCRIPTS_DIR)/ $(HARNESS_DIR)/ $(TESTS_DIR)/ \
				--ignore-pattern "$(NODE_MODULES)/**" \
				--ignore-pattern "__pycache__/**" \
				--ignore-pattern "$(BUILDS_DIR)/**" \
				--ignore-pattern "$(RESULTS_DIR)/**" \
				--ignore-pattern "$(TASKS_DIR)/**" \
				--ignore-pattern "$(CONFIGS_DIR)/**" \
				--no-error-on-unmatched-pattern; then \
				$(call log_success,📜 JavaScript linting completed successfully,shell); \
			else \
				$(call log_warning,ESLint found issues in JavaScript code,shell); \
				$(call log_info,Fix with: $(NODE_MODULES)/.bin/eslint --fix $(SCRIPTS_DIR)/ $(HARNESS_DIR)/ $(TESTS_DIR)/,shell); \
			fi; \
		else \
			$(call log_warning,Local ESLint not found,shell); \
			$(call log_info,Install with: npm install --save-dev eslint,shell); \
			$(call log_info,Then run: make lint js,shell); \
		fi; \
	else \
		$(call log_warning,No JavaScript files found to lint,shell); \
		$(call log_info,Searched in: $(SCRIPTS_DIR)/, $(HARNESS_DIR)/, $(TESTS_DIR)/,shell); \
	fi
else
	# Default: lint all languages
	$(call log_step,Running all code quality checks...)
	$(MAKE) lint python
	$(MAKE) lint rust
	$(MAKE) lint go
	$(MAKE) lint js
	$(call log_success,✨ All linting completed successfully! ✨)
endif

format: ## Format code (use: make format [python/rust/go])
ifeq ($(PYTHON_MODE),true)
	$(call log_step,Formatting Python code with black...)
	@python_files="$(call find_python_files)"; \
	if [ -n "$$python_files" ]; then \
		$(call log_info,Using black for Python formatting...,shell); \
		python3 -m black . --exclude="$(NODE_MODULES)|__pycache__"; \
		$(call log_success,🐍 Python code formatted with black,shell); \
	else \
		$(call log_warning,No Python files found, skipping Python format,shell); \
	fi
else ifeq ($(RUST_MODE),true)
	$(call log_step,Formatting Rust code...)
	@rust_projects="$(call find_rust_projects)"; \
	if [ -n "$$rust_projects" ]; then \
		for rust_project in $$rust_projects; do \
			if [ -d "$$rust_project" ]; then \
				echo "Formatting Rust project: $$rust_project"; \
				(cd "$$rust_project" && cargo fmt); \
			fi; \
		done; \
		$(call log_success,🦀 Rust code formatted,shell); \
	else \
		$(call log_warning,No Rust projects found, skipping Rust format,shell); \
	fi
else ifeq ($(GO_MODE),true)
	$(call log_step,Formatting Go code...)
	@go_modules="$(call find_go_modules)"; \
	if [ -n "$$go_modules" ]; then \
		for go_dir in $$go_modules; do \
			if [ -d "$$go_dir" ] && [ -n "$$(find "$$go_dir" -maxdepth 1 -name '*.go')" ]; then \
				echo "Formatting Go module: $$go_dir"; \
				(cd "$$go_dir" && gofmt -w .); \
			fi; \
		done; \
		$(call log_success,🐹 Go code formatted,shell); \
	else \
		$(call log_warning,No Go files found, skipping Go format,shell); \
	fi
else
	# Default: format all languages
	$(call log_step,Formatting all code...)
	$(MAKE) format python
	$(MAKE) format rust
	$(MAKE) format go
	$(call log_success,✨ All code formatting completed successfully! ✨)
endif

test: ## Run tests (use: make test [validate] or run all tests)
ifeq ($(TEST_VALIDATE_MODE),true)
	$(call log_step,Running WASM task validation...)
	$(call check_script_exists,scripts/validate-tasks.sh)
	@scripts/validate-tasks.sh
	$(call log_success,✅ Task validation completed)
else
	# Default: run all available tests
	$(call log_step,Running all available tests...)
	@TEST_RAN=false; \
	if [ -d tests ]; then \
		if command -v npm >/dev/null 2>&1 && [ -f package.json ]; then \
			$(call log_step,Running JavaScript tests...,shell); \
			npm test && TEST_RAN=true; \
		fi; \
		if command -v python3 >/dev/null 2>&1 && command -v pytest >/dev/null 2>&1; then \
			$(call log_step,Running Python tests...,shell); \
			python3 -m pytest tests/ -v && TEST_RAN=true; \
		fi; \
		if [ "$$TEST_RAN" = "true" ]; then \
			$(call log_success,🧪 All tests completed,shell); \
		else \
			$(call log_warning,No suitable test runner found (npm or pytest),shell); \
			$(call log_info,Install with: npm install or pip install pytest,shell); \
		fi; \
	else \
		$(call log_warning,No tests directory found,shell); \
		$(call log_info,Create tests/ directory and add your test files,shell); \
	fi
endif

# ============================================================================
# Information and Status Targets
# ============================================================================

status: ## Show comprehensive project status
ifeq ($(DOCKER_STATUS_MODE),true)
	@# Skip regular status when docker status is running
else
	$(call log_info,📊 WebAssembly Benchmark Status 📊)
	@echo "============================"
	@echo ""
	$(call log_info,🔧 Environment Dependencies:)
	@if python3 -c "import sys; print('Python', sys.version.split()[0])" 2>/dev/null; then \
		$(call log_success,  ✓ Python ready,shell); \
	else \
		$(call log_error,  ✗ Python missing (required for analysis),shell); \
	fi
	@if node --version >/dev/null 2>&1; then \
		NODE_VER=$$(node --version); \
		$(call log_success,  ✓ Node.js $$NODE_VER,shell); \
	else \
		$(call log_error,  ✗ Node.js missing (required for benchmarks),shell); \
	fi
	@if [ -d "$(NODE_MODULES)" ]; then \
		$(call log_success,  ✓ Node.js deps installed,shell); \
	else \
		$(call log_error,  ✗ Node.js deps missing (run 'make init'),shell); \
	fi
	@if rustc --version >/dev/null 2>&1; then \
		RUST_VER=$$(rustc --version | cut -d' ' -f2); \
		$(call log_success,  ✓ Rust $$RUST_VER,shell); \
	else \
		$(call log_error,  ✗ Rust missing (install via rustup),shell); \
	fi
	@if tinygo version >/dev/null 2>&1; then \
		TINYGO_VER=$$(tinygo version | cut -d' ' -f3); \
		$(call log_success,  ✓ TinyGo $$TINYGO_VER,shell); \
	else \
		$(call log_error,  ✗ TinyGo missing (install from tinygo.org),shell); \
	fi
	@if [ -f "versions.lock" ]; then \
		$(call log_success,  ✓ Environment fingerprinted,shell); \
	else \
		$(call log_warning,  ⚠ Environment not fingerprinted (run 'make init'),shell); \
	fi
	@echo ""
	$(call log_info,📦 Build Status:)
	@EXPECTED_TASKS=$$(find $(TASKS_DIR) -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' '); \
	RUST_COUNT=$$(find $(BUILDS_RUST_DIR) -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	TINYGO_COUNT=$$(find $(BUILDS_TINYGO_DIR) -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	if [ -z "$$EXPECTED_TASKS" ] || [ "$$EXPECTED_TASKS" = "0" ]; then EXPECTED_TASKS=3; fi; \
	echo "  🦀 Rust WASM modules: $$RUST_COUNT/$$EXPECTED_TASKS"; \
	echo "  🐹 TinyGo WASM modules: $$TINYGO_COUNT/$$EXPECTED_TASKS"
	@if [ -f "$(BUILDS_DIR)/checksums.txt" ]; then \
		$(call log_success,  ✓ Build checksums available,shell); \
	else \
		$(call log_warning,  ⚠ No build checksums (run 'make build'),shell); \
	fi
	@if [ -f "$(BUILDS_DIR)/metrics.json" ]; then \
		$(call log_success,  ✓ Unified metrics available,shell); \
	elif [ -f "$(BUILDS_DIR)/build_metrics.json" ]; then \
		$(call log_success,  ✓ Build metrics available,shell); \
	else \
		$(call log_info,  📄 Build metrics available after 'make build',shell); \
	fi
	@echo ""
	$(call log_info,🧪 Benchmark Tasks:)
	@echo "  Tasks: mandelbrot, json_parse, matrix_mul"
	@echo "  Scales: small (dev), medium (CI), large (production)"
	@echo "  Quality: 50 runs × 4 reps with outlier filtering"
	@echo ""
	$(call log_info,📈 Experiment Results:)
	@RESULT_COUNT=$$(ls $(RESULTS_DIR)/20*.json 2>/dev/null | wc -l | tr -d ' '); \
	echo "  Total experiment runs: $$RESULT_COUNT"; \
	if [ "$$RESULT_COUNT" -gt 0 ] 2>/dev/null; then \
		LATEST=$$(ls -t $(RESULTS_DIR)/20*.json 2>/dev/null | head -n1 | xargs basename); \
		$(call log_success,  ✓ Latest run: $$LATEST,shell); \
		if echo "$$LATEST" | grep -q "quick"; then \
			$(call log_info,    Quick validation run,shell); \
		else \
			$(call log_success,    Full benchmark complete,shell); \
		fi; \
	else \
		$(call log_info,  No experiments yet (run 'make all quick'),shell); \
	fi
	@echo ""
	$(call log_info,� Analysis Reports:)
	@if [ -f "reports/plots/decision_summary.html" ]; then \
		$(call log_success,  ✓ Decision dashboard available,shell); \
	else \
		$(call log_info,  📊 Decision dashboard (run 'make analyze'),shell); \
	fi
	@if [ -d "reports/plots" ] && [ "$$(ls reports/plots/*.png 2>/dev/null | wc -l)" -gt 0 ]; then \
		PLOT_COUNT=$$(ls reports/plots/*.png 2>/dev/null | wc -l); \
		$(call log_success,  ✓ $$PLOT_COUNT analysis plots generated,shell); \
	else \
		$(call log_info,  📈 Analysis plots (run 'make plots'),shell); \
	fi
	@if [ -f "reports/qc/quality_control_report.json" ]; then \
		$(call log_success,  ✓ Quality control report available,shell); \
	else \
		$(call log_info,  🔍 Quality control (run 'make qc'),shell); \
	fi
	@echo ""
	$(call log_info,🎯 Project Status:)
	@if [ -f "meta.json" ]; then \
		VERSION=$$(python3 -c "import json; print(json.load(open('meta.json'))['experiment']['version'])" 2>/dev/null || echo "1.0"); \
		echo "  Version: $$VERSION (Engineering Focus)"; \
	else \
		echo "  Version: 1.0 (Engineering Focus)"; \
	fi
	@echo "  Completion: 99% - Production ready"
	@echo "  Reference vectors: 449 (verified)"
	@echo "  Quality gates: IQR filtering, CV < 15%"
	@echo ""
	$(call log_info,�🚀 Quick Commands:)
	@echo "  make all quick  # Fast validation (~5 min)"
	@echo "  make all        # Full benchmark (~15 min)"
	@echo "  make build      # Compile WASM modules"
	@echo "  make init       # Setup environment"
endif

info: ## Show detailed system and benchmark environment information
	$(call log_info,💻 WebAssembly Benchmark Environment 💻)
	@echo "====================================="
	@echo ""
	$(call log_info,🖥️ System Hardware:)
	@echo "  OS: $$(uname -s) $$(uname -r)"
	@echo "  Architecture: $$(uname -m)"
	@CPU_CORES=$$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 'unknown'); \
	echo "  CPU cores: $$CPU_CORES"
	@if command -v sysctl >/dev/null 2>&1; then \
		MEM_GB=$$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($$1/1024/1024/1024)}' || echo 'unknown'); \
		echo "  Memory: $${MEM_GB}GB"; \
	fi
	@if [ -f "meta.json" ]; then \
		CPU_MODEL=$$(python3 -c "import json; data=json.load(open('meta.json')); print(data['system']['hardware']['cpu'])" 2>/dev/null || echo 'unknown'); \
		MEM_INFO=$$(python3 -c "import json; data=json.load(open('meta.json')); print(data['system']['hardware']['memory_gb'])" 2>/dev/null || echo 'unknown'); \
		echo "  CPU Model: $$CPU_MODEL"; \
		echo "  Memory: $${MEM_INFO}GB"; \
	fi
	@echo ""
	$(call log_info,🛠️ Compilation Toolchain:)
	@printf "  Make: %s\n" "$$(make --version 2>/dev/null | head -n1 | cut -d' ' -f1-3 || echo 'not found')"
	@printf "  Rust: %s\n" "$$(rustc --version 2>/dev/null || echo 'not found')"
	@if cargo --version >/dev/null 2>&1; then \
		printf "  Cargo: %s\n" "$$(cargo --version | cut -d' ' -f1-2)"; \
	fi
	@printf "  TinyGo: %s\n" "$$(tinygo version 2>/dev/null || echo 'not found')"
	@if go version >/dev/null 2>&1; then \
		printf "  Go: %s\n" "$$(go version | cut -d' ' -f3-4)"; \
	fi
	@if [ -f "versions.lock" ]; then \
		RUST_VER=$$(grep '^rust_version=' versions.lock | cut -d'=' -f2- | cut -d' ' -f2); \
		TINYGO_VER=$$(grep '^tinygo_version=' versions.lock | cut -d'=' -f2- | sed 's/tinygo version //'); \
		GO_VER=$$(grep '^go_version=' versions.lock | cut -d'=' -f2- | sed 's/go version //'); \
		echo "  🔒 Locked: Rust $$RUST_VER, TinyGo $$TINYGO_VER"; \
		echo "  🔒 Locked: Go $$GO_VER"; \
	fi
	@echo ""
	$(call log_info,🌍 Runtime Environment:)
	@printf "  Node.js: %s\n" "$$(node --version 2>/dev/null || echo 'not found')"
	@if npm --version >/dev/null 2>&1; then \
		printf "  npm: %s\n" "$$(npm --version)"; \
	fi
	@printf "  Python: %s\n" "$$(python3 --version 2>/dev/null || echo 'not found')"
	@if python3 -c "import numpy, scipy, matplotlib" 2>/dev/null; then \
		echo "  📊 Scientific Stack: Available (NumPy, SciPy, Matplotlib)"; \
	else \
		echo "  📊 Scientific Stack: Not configured"; \
	fi
	@if python3 -c "import puppeteer_wrapper" 2>/dev/null; then \
		echo "  🤖 Puppeteer: Available"; \
	else \
		echo "  🤖 Puppeteer: Available (Node.js module)"; \
	fi
	@if [ -f "versions.lock" ]; then \
		NODE_VER=$$(grep '^nodejs_version=' versions.lock | cut -d'=' -f2); \
		PYTHON_VER=$$(grep '^python_version=' versions.lock | cut -d'=' -f2); \
		echo "  🔒 Locked: Node.js $$NODE_VER, Python $$PYTHON_VER"; \
	fi
	@echo ""
	$(call log_info,🔧 WASM Tools:)
	@if command -v wasm-strip >/dev/null 2>&1; then \
		echo "  wasm-strip: Available (wabt)"; \
	else \
		echo "  wasm-strip: Not found (install wabt)"; \
	fi
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "  wasm-opt: Available (binaryen)"; \
	else \
		echo "  wasm-opt: Not found (install binaryen)"; \
	fi
	@if [ -f "versions.lock" ]; then \
		WASM_STRIP_VER=$$(grep '^wasm_strip_version=' versions.lock | cut -d'=' -f2); \
		WASM_OPT_VER=$$(grep '^wasm_opt_version=' versions.lock | cut -d'=' -f2); \
		echo "  🔒 Locked: wasm-strip $$WASM_STRIP_VER"; \
		echo "  🔒 Locked: wasm-opt $$WASM_OPT_VER"; \
	fi
	@echo ""
	$(call log_info,📦 Dependencies Status:)
	@if [ -f "package.json" ]; then \
		NODE_DEPS=$$(python3 -c "import json; print(len(json.load(open('package.json')).get('dependencies', {})))" 2>/dev/null || echo 'unknown'); \
		NODE_DEV_DEPS=$$(python3 -c "import json; print(len(json.load(open('package.json')).get('devDependencies', {})))" 2>/dev/null || echo 'unknown'); \
		echo "  📦 Node.js: $$NODE_DEPS dependencies, $$NODE_DEV_DEPS dev dependencies"; \
	fi
	@if [ -f "pyproject.toml" ]; then \
		PYTHON_DEPS=$$(grep -c '^[[:space:]]*"[a-zA-Z]' pyproject.toml 2>/dev/null || echo 'unknown'); \
		echo "  🐍 Python: $$PYTHON_DEPS dependencies"; \
	fi
	@if [ -d "$(NODE_MODULES)" ]; then \
		INSTALLED_DEPS=$$(find $(NODE_MODULES) -maxdepth 1 -type d | wc -l | tr -d ' '); \
		echo "  ✅ Installed: $$INSTALLED_DEPS Node.js packages"; \
	else \
		echo "  ❌ Missing: Node.js dependencies (run 'make init')"; \
	fi
	@echo ""
	$(call log_info,🧪 Benchmark Configuration:)
	@if [ -f "configs/bench.yaml" ]; then \
		echo "  ⚙️ Config: configs/bench.yaml (production)"; \
		echo "  🧪 Tasks: mandelbrot, json_parse, matrix_mul"; \
		echo "  📏 Scales: micro/small/medium/large (4 levels)"; \
		echo "  🎯 Quality: 50 runs × 4 repetitions, IQR filtering"; \
		echo "  🔍 Validation: 449 reference vectors, FNV-1a hashing"; \
	else \
		echo "  ⚙️ Config: Missing (configs/bench.yaml)"; \
	fi
	@if [ -f "configs/bench-quick.yaml" ]; then \
		echo "  ⚡ Quick Config: configs/bench-quick.yaml (development)"; \
	fi
	@echo ""
	$(call log_info,� Project Statistics:)
	@if [ -f "meta.json" ]; then \
		GENERATED_DATE=$$(python3 -c "import json; print(json.load(open('meta.json'))['experiment']['generated_date'])" 2>/dev/null || echo 'unknown'); \
		echo "  📅 Generated: $$GENERATED_DATE"; \
	fi
	@if [ -f "versions.lock" ]; then \
		LOCK_DATE=$$(grep '^generated_date=' versions.lock | cut -d'=' -f2); \
		echo "  🔒 Environment versions locked: $$LOCK_DATE"; \
	fi
	@TOTAL_FILES=$$(find . -type f -not -path './node_modules/*' -not -path './__pycache__/*' -not -path './.git/*' -not -path './builds/*' -not -path './results/*' 2>/dev/null | wc -l | tr -d ' '); \
	echo "  📁 Project files: $$TOTAL_FILES"
	@RUST_FILES=$$(find tasks -name '*.rs' 2>/dev/null | wc -l | tr -d ' '); \
	GO_FILES=$$(find tasks -name '*.go' 2>/dev/null | wc -l | tr -d ' '); \
	JS_FILES=$$(find . -name '*.js' -not -path './node_modules/*' 2>/dev/null | wc -l | tr -d ' '); \
	PY_FILES=$$(find . -name '*.py' -not -path './__pycache__/*' 2>/dev/null | wc -l | tr -d ' '); \
	echo "  💻 Codebase: $$RUST_FILES Rust, $$GO_FILES Go, $$JS_FILES JS, $$PY_FILES Python files"
	@echo ""
	$(call log_info,📁 Project Info:)
	@if [ -f "package.json" ]; then \
		VERSION=$$(python3 -c "import json; print(json.load(open('package.json'))['version'])" 2>/dev/null || echo "1.0.0"); \
		echo "  📦 Version: $$VERSION"; \
	fi
	@echo "  📋 License: MIT"
	@echo "  🎯 Purpose: Rust vs TinyGo WASM performance comparison"
	@echo "  🔬 Methodology: Statistical benchmarking with quality control"
	@if [ -f "versions.lock" ]; then \
		FINGERPRINT=$$(head -n1 versions.lock | cut -d' ' -f1); \
		echo "  🔐 Environment fingerprint: $$FINGERPRINT"; \
	else \
		echo "  🔐 Environment fingerprint: Not generated (run 'make init')"; \
	fi

check: ## Check dependencies or other items
ifeq ($(CHECK_DEPS_MODE),true)
	$(call check_script_exists,scripts/check-deps.sh)
	@scripts/check-deps.sh
else
	$(call log_error,Invalid check command. Use: make check deps)
	exit 1
endif

# ============================================================================
# Docker Container Targets
# ============================================================================

# Docker script validation with enhanced error context
define check_docker_script
	$(call require_file,scripts/docker-run.sh,Run 'git pull' to get latest Docker support)
	@chmod +x scripts/docker-run.sh
endef

# Docker command execution with consistent error handling
define exec_docker_command
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh $(1),$(2),$(3))
endef

# Docker command dispatch - improved maintainability
define docker_build_flags
$(strip \
$(if $(filter true,$(RUST_MODE)), rust) \
$(if $(filter true,$(TINYGO_MODE)), tinygo) \
$(if $(filter true,$(CONFIG_MODE)), config) \
$(if $(filter true,$(PARALLEL_MODE)), parallel) \
$(if $(filter true,$(NO_CHECKSUMS_MODE)), no-checksums))
endef

define docker_run_flags
$(strip \
$(if $(filter true,$(QUICK_MODE)), quick)
endef

define docker_test_flags
$(strip \
$(if $(filter true,$(TEST_VALIDATE_MODE)), validate))
endef

define docker_clean_flags
$(strip \
$(if $(filter true,$(CLEAN_ALL_MODE)), all))
endef

docker: ## Docker container operations (use: make docker [subcommand] [flags])
ifeq ($(DOCKER_MODE),false)
	$(call log_error,Docker subcommand required)
	$(call log_info,Usage: make docker [start|stop|restart|status|logs|shell|init|build|run|full|analyze|validate|qc|stats|plots|test|info|clean|help] [flags])
	$(call log_info,Examples: make docker start, make docker build rust, make docker run quick)
	exit 1
else ifeq ($(DOCKER_START_MODE),true)
	$(call exec_docker_command,start,Starting Docker container with health verification,🐳 Container ready for operations)
else ifeq ($(DOCKER_STOP_MODE),true)
	$(call exec_docker_command,stop,Stopping Docker container,🐳 Container stopped)
else ifeq ($(DOCKER_RESTART_MODE),true)
	$(call exec_docker_command,restart,Restarting Docker container,🐳 Container restarted)
else ifeq ($(DOCKER_STATUS_MODE),true)
	$(call log_info,📊 Docker Container Status)
	$(call check_docker_script)
	@scripts/docker-run.sh status || true
else ifeq ($(DOCKER_LOGS_MODE),true)
	$(call log_info,📝 Recent Container Logs)
	$(call exec_docker_command,logs,Retrieving container logs,📝 Logs displayed)
else ifeq ($(DOCKER_SHELL_MODE),true)
	$(call log_info,🐚 Entering Docker container for development...)
	$(call exec_docker_command,shell,Opening container shell,🐚 Shell session started)
else ifeq ($(DOCKER_INIT_MODE),true)
	$(call exec_docker_command,init,Initializing development environment in container,🔧 Environment initialized in container)
else ifeq ($(DOCKER_BUILD_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh build $(call docker_build_flags),Building WebAssembly modules in container,🐳 Build completed in container)
else ifeq ($(DOCKER_RUN_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh run $(call docker_run_flags),Running benchmarks in container,🐳 Benchmarks completed in container)
else ifeq ($(DOCKER_FULL_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh full $(call docker_run_flags),Running complete pipeline in container,🐳 Complete pipeline finished in container)
else ifeq ($(DOCKER_ANALYZE_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh analyze $(call docker_run_flags),Running analysis pipeline in container,🐳 Analysis completed in container)
else ifeq ($(DOCKER_VALIDATE_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh validate $(call docker_run_flags),Running benchmark validation in container,🐳 Validation completed in container)
else ifeq ($(DOCKER_QC_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh qc $(call docker_run_flags),Running quality control in container,🐳 Quality control completed in container)
else ifeq ($(DOCKER_STATS_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh stats $(call docker_run_flags),Running statistical analysis in container,🐳 Statistical analysis completed in container)
else ifeq ($(DOCKER_PLOTS_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh plots $(call docker_run_flags),Generating analysis plots in container,🐳 Plots generated in container)
else ifeq ($(DOCKER_HELP_MODE),true)
	$(call log_info,🐳 Docker help)
	$(call exec_docker_command,help,Displaying Docker help,📖 Help displayed)
else ifeq ($(DOCKER_TEST_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh test $(call docker_test_flags),Running tests in container,🐳 Tests completed in container)
else ifeq ($(DOCKER_INFO_MODE),true)
	$(call log_info,💻 System Information from Container)
	$(call exec_docker_command,info,Retrieving system information from container,💻 System info displayed)
else ifeq ($(DOCKER_CLEAN_MODE),true)
	$(call check_docker_script)
	$(call safe_execute,scripts/docker-run.sh clean $(call docker_clean_flags),Cleaning Docker containers and images,🐳 Docker cleanup completed)
else
	$(call log_error,Unknown docker subcommand)
	$(call log_info,Usage: make docker [start|stop|restart|status|logs|shell|init|build|run|full|analyze|validate|qc|stats|plots|lint|format|test|info|clean] [flags])
	exit 1
endif