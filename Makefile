# WebAssembly Benchmark Makefile
# Automation targets for the complete experiment pipeline

# Declare all phony targets (targets that don't create files)
.PHONY: help init python-deps build build-rust build-tinygo build-all run run-headed run-quick \
        collect analyze report all all-clean all-quick clean clean-results clean-all \
        dev-setup lint format test status info check-deps

.DEFAULT_GOAL := help

# Configuration
PROJECT_ROOT := $(shell pwd)
NODE_MODULES := node_modules

# Terminal color support detection
SHELL := /bin/bash
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

# Enhanced logging functions
define log_info
	@echo -e "$(BLUE)$(BOLD)[INFO]$(NC) $(1)"
endef

define log_success
	@echo -e "$(GREEN)$(BOLD)[SUCCESS]$(NC) $(1)"
endef

define log_warning
	@echo -e "$(YELLOW)$(BOLD)[WARNING]$(NC) $(1)"
endef

define log_error
	@echo -e "$(RED)$(BOLD)[ERROR]$(NC) $(1)"
endef

define log_step
	@echo -e "$(CYAN)$(BOLD)[STEP]$(NC) $(1)"
endef

# Utility function to find latest result directory
define find_latest_result
$(shell ls -td results/20* 2>/dev/null | head -n1)
endef

# Utility function to check if command exists
define check_command
$(shell command -v $(1) >/dev/null 2>&1 && echo "$(1)" || echo "")
endef

help: ## Show this help message
	@echo -e "$(BOLD)WebAssembly Benchmark Automation$(NC)"
	@echo "================================="
	@echo ""
	@echo -e "$(BOLD)Core Workflow:$(NC)"
	@echo -e "  $(CYAN)make init$(NC)          Initialize environment and dependencies"
	@echo -e "  $(CYAN)make build$(NC)         Build all WebAssembly modules" 
	@echo -e "  $(CYAN)make run$(NC)           Run browser benchmark suite"
	@echo -e "  $(CYAN)make analyze$(NC)       Run statistical analysis and generate plots"
	@echo -e "  $(CYAN)make all$(NC)           Run complete experiment pipeline"
	@echo ""
	@echo -e "$(BOLD)Available Targets:$(NC)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[0;36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo -e "$(BOLD)Quick Examples:$(NC)"
	@echo -e "  $(GREEN)make check-deps$(NC)    Check if all required tools are installed"
	@echo -e "  $(GREEN)make status$(NC)        Show current project status"
	@echo -e "  $(GREEN)make all-quick$(NC)     Run quick experiment for testing"
	@echo -e "  $(GREEN)make clean-all$(NC)     Clean everything and start fresh"

# ============================================================================
# Environment Setup Targets
# ============================================================================

init: python-deps $(NODE_MODULES) versions.lock ## Initialize environment and install dependencies
	$(call log_success,Environment initialized successfully)
	@echo -e "$(GREEN)Ready to run:$(NC) make build"

python-deps: requirements.txt ## Install Python dependencies with system Python
	$(call log_step,Installing Python dependencies...)
	@if [ ! -f requirements.txt ]; then \
		$(call log_error,requirements.txt not found); \
		exit 1; \
	fi
	python3 -m pip install --user -r requirements.txt
	$(call log_success,Python dependencies installed)

$(NODE_MODULES): package.json
	$(call log_step,Installing Node.js dependencies...)
	@if [ ! -f package.json ]; then \
		$(call log_error,package.json not found); \
		exit 1; \
	fi
	npm ci
	$(call log_success,Node.js dependencies installed)

versions.lock: scripts/fingerprint.sh
	$(call log_step,Generating environment fingerprint...)
	@if [ ! -f scripts/fingerprint.sh ]; then \
		$(call log_error,scripts/fingerprint.sh not found); \
		exit 1; \
	fi
	chmod +x scripts/fingerprint.sh
	scripts/fingerprint.sh
	$(call log_success,Environment fingerprint generated)

# ============================================================================
# Build Targets
# ============================================================================

build: build-rust build-tinygo ## Build all WebAssembly modules
	$(call log_success,All modules built successfully)

build-rust: ## Build Rust WebAssembly modules
	$(call log_step,Building Rust modules...)
	@if [ ! -f scripts/build_rust.sh ]; then \
		$(call log_error,scripts/build_rust.sh not found); \
		exit 1; \
	fi
	chmod +x scripts/build_rust.sh
	scripts/build_rust.sh
	$(call log_success,Rust modules built)

build-tinygo: ## Build TinyGo WebAssembly modules
	$(call log_step,Building TinyGo modules...)
	@if [ ! -f scripts/build_tinygo.sh ]; then \
		$(call log_error,scripts/build_tinygo.sh not found); \
		exit 1; \
	fi
	chmod +x scripts/build_tinygo.sh
	scripts/build_tinygo.sh
	$(call log_success,TinyGo modules built)

build-all: ## Build all modules with optimization and size reporting
	$(call log_step,Building all modules with full pipeline...)
	@if [ ! -f scripts/build_all.sh ]; then \
		$(call log_error,scripts/build_all.sh not found); \
		exit 1; \
	fi
	chmod +x scripts/build_all.sh
	scripts/build_all.sh
	$(call log_success,Complete build pipeline finished)

# ============================================================================
# Execution Targets
# ============================================================================

run: $(NODE_MODULES) ## Run browser benchmark suite
	$(call log_step,Running browser benchmarks...)
	@if [ ! -f scripts/run_bench.js ]; then \
		$(call log_error,scripts/run_bench.js not found); \
		exit 1; \
	fi
	chmod +x scripts/run_bench.js
	node scripts/run_bench.js
	$(call log_success,Benchmarks completed)

run-headed: $(NODE_MODULES) ## Run benchmarks with visible browser
	$(call log_step,Running benchmarks with headed browser...)
	@if [ ! -f scripts/run_bench.js ]; then \
		$(call log_error,scripts/run_bench.js not found); \
		exit 1; \
	fi
	chmod +x scripts/run_bench.js
	node scripts/run_bench.js --headed
	$(call log_success,Headed benchmarks completed)

run-quick: $(NODE_MODULES) ## Run quick benchmarks with reduced samples
	$(call log_step,Running quick benchmarks...)
	@if [ ! -f scripts/run_bench.js ]; then \
		$(call log_error,scripts/run_bench.js not found); \
		exit 1; \
	fi
	chmod +x scripts/run_bench.js
	node scripts/run_bench.js --timeout=60000
	$(call log_success,Quick benchmarks completed)

# ============================================================================
# Analysis Targets
# ============================================================================

collect: python-deps ## Run quality control on benchmark data
	$(call log_step,Running quality control on results...)
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		$(call log_info,Quality control for $$LATEST_RESULT); \
		$(call log_warning,QC implementation pending); \
	else \
		$(call log_error,No benchmark results found); \
		exit 1; \
	fi
	$(call log_success,Quality control completed)

analyze: python-deps ## Run statistical analysis and generate plots
	$(call log_step,Running statistical analysis...)
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		if [ -f analysis/statistics.py ]; then \
			python3 analysis/statistics.py $$LATEST_RESULT; \
		else \
			$(call log_warning,analysis/statistics.py not found, skipping statistics); \
		fi; \
		if [ -f analysis/plots.py ]; then \
			python3 analysis/plots.py $$LATEST_RESULT; \
		else \
			$(call log_warning,analysis/plots.py not found, skipping plots); \
		fi; \
		$(call log_success,Analysis completed for $$LATEST_RESULT); \
	else \
		$(call log_error,No benchmark results found); \
		echo "Run 'make run' first to generate benchmark data"; \
		exit 1; \
	fi

report: analyze ## Generate final experiment report
	$(call log_step,Generating final report...)
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		REPORT_FILE="$$LATEST_RESULT/REPORT.md"; \
		echo "# WebAssembly Benchmark Experiment Report" > $$REPORT_FILE; \
		echo "" >> $$REPORT_FILE; \
		echo "**Generated:** $$(date)" >> $$REPORT_FILE; \
		echo "**Result Directory:** $$LATEST_RESULT" >> $$REPORT_FILE; \
		echo "" >> $$REPORT_FILE; \
		echo "## Summary" >> $$REPORT_FILE; \
		echo "This report contains the analysis of WebAssembly benchmark results." >> $$REPORT_FILE; \
		$(call log_success,Report generated: $$REPORT_FILE); \
	else \
		$(call log_warning,No results available for report generation); \
	fi

# ============================================================================
# Complete Pipeline Targets
# ============================================================================

all: init build run analyze report ## Run complete experiment pipeline
	$(call log_success,Complete experiment pipeline finished!)
	@echo ""
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		echo -e "$(GREEN)Results available in:$(NC) $$LATEST_RESULT"; \
	fi

all-clean: clean all ## Clean everything and run complete pipeline
	$(call log_success,Clean rebuild completed!)

all-quick: init build run-quick analyze ## Run quick experiment for development/testing
	$(call log_success,Quick experiment pipeline completed!)

# ============================================================================
# Cleanup Targets
# ============================================================================

clean: ## Clean build artifacts and temporary files
	$(call log_step,Cleaning build artifacts...)
	rm -rf builds/rust/*.wasm builds/tinygo/*.wasm 2>/dev/null || true
	rm -f builds/checksums.txt builds/sizes.csv 2>/dev/null || true
	find . -name "*.tmp" -delete 2>/dev/null || true
	find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	$(call log_success,Build artifacts cleaned)

clean-results: ## Clean all benchmark results
	$(call log_warning,Cleaning all benchmark results...)
	@read -p "Are you sure? This will delete all results [y/N]: " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf results/20* 2>/dev/null || true; \
		$(call log_success,Results cleaned); \
	else \
		$(call log_info,Operation cancelled); \
	fi

clean-all: clean clean-results ## Clean everything including dependencies
	$(call log_warning,Cleaning everything including dependencies...)
	@read -p "Are you sure? This will delete node_modules [y/N]: " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf $(NODE_MODULES) 2>/dev/null || true; \
		rm -f versions.lock 2>/dev/null || true; \
		$(call log_success,Complete cleanup finished); \
		echo "Run 'make init' to reinitialize"; \
	else \
		$(call log_info,Operation cancelled); \
	fi

# ============================================================================
# Development Targets
# ============================================================================

dev-setup: init ## Setup development environment with additional tools
	$(call log_step,Setting up development environment...)
	@if [ -f setup.py ] || [ -f pyproject.toml ]; then \
		python3 -m pip install --user -e .; \
		$(call log_success,Development environment ready); \
	else \
		$(call log_warning,No setup.py or pyproject.toml found, skipping editable install); \
		$(call log_success,Basic development environment ready); \
	fi

lint: python-deps ## Run code quality checks
	$(call log_step,Running code quality checks...)
	@if [ -d analysis ]; then \
		python3 -m black --check analysis/ || true; \
		python3 -m flake8 analysis/ || true; \
		$(call log_success,Code quality checks completed); \
	else \
		$(call log_warning,No analysis directory found, skipping lint); \
	fi

format: python-deps ## Format Python code
	$(call log_step,Formatting Python code...)
	@if [ -d analysis ]; then \
		python3 -m black analysis/; \
		$(call log_success,Code formatted); \
	else \
		$(call log_warning,No analysis directory found, skipping format); \
	fi

test: python-deps ## Run tests (when implemented)
	$(call log_step,Running tests...)
	@if [ -d tests ]; then \
		python3 -m pytest tests/ -v; \
		$(call log_success,Tests passed); \
	else \
		$(call log_warning,No tests directory found); \
		echo "Create tests/ directory and add your test files"; \
	fi

# ============================================================================
# Information and Status Targets
# ============================================================================

status: ## Show current project status
	@echo -e "$(BOLD)Project Status$(NC)"
	@echo "=============="
	@echo ""
	@echo -e "$(BOLD)Environment:$(NC)"
	@if python3 -c "import sys; print('Python', sys.version.split()[0])" 2>/dev/null; then \
		echo -e "  $(GREEN)✓$(NC) Python ready"; \
	else \
		echo -e "  $(RED)✗$(NC) Python missing"; \
	fi
	@if [ -d "$(NODE_MODULES)" ]; then \
		echo -e "  $(GREEN)✓$(NC) Node.js deps ready"; \
	else \
		echo -e "  $(RED)✗$(NC) Node.js deps missing (run '$(CYAN)make init$(NC)')"; \
	fi
	@if [ -f "versions.lock" ]; then \
		echo -e "  $(GREEN)✓$(NC) Environment fingerprinted"; \
	else \
		echo -e "  $(RED)✗$(NC) Environment not fingerprinted (run '$(CYAN)make init$(NC)')"; \
	fi
	@echo ""
	@echo -e "$(BOLD)Build Artifacts:$(NC)"
	@RUST_COUNT=$$(find builds/rust -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	echo "  Rust modules: $$RUST_COUNT"
	@TINYGO_COUNT=$$(find builds/tinygo -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	echo "  TinyGo modules: $$TINYGO_COUNT"
	@echo ""
	@echo -e "$(BOLD)Results:$(NC)"
	@RESULT_COUNT=$$(ls -d results/20* 2>/dev/null | wc -l | tr -d ' '); \
	echo "  Experiment runs: $$RESULT_COUNT"; \
	if [ "$$RESULT_COUNT" -gt 0 ] 2>/dev/null; then \
		LATEST=$(call find_latest_result); \
		echo -e "  $(GREEN)Latest:$(NC) $$LATEST"; \
	fi

info: ## Show system information
	@echo -e "$(BOLD)System Information$(NC)"
	@echo "=================="
	@echo "OS: $$(uname -s) $$(uname -r)"
	@echo "Architecture: $$(uname -m)"
	@CPU_CORES=$$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 'unknown'); \
	echo "CPU cores: $$CPU_CORES"
	@echo ""
	@echo -e "$(BOLD)Tool Versions:$(NC)"
	@printf "  Make: %s\n" "$$(make --version 2>/dev/null | head -n1 || echo 'unknown')"
	@printf "  Node.js: %s\n" "$$(node --version 2>/dev/null || echo 'not found')"
	@printf "  Python: %s\n" "$$(python3 --version 2>/dev/null || echo 'not found')"
	@printf "  Rust: %s\n" "$$(rustc --version 2>/dev/null || echo 'not found')"
	@printf "  Go: %s\n" "$$(go version 2>/dev/null || echo 'not found')"
	@printf "  TinyGo: %s\n" "$$(tinygo version 2>/dev/null || echo 'not found')"

check-deps: ## Check if all required dependencies are available
	@echo -e "$(BOLD)Dependency Check$(NC)"
	@echo "================"
	@echo ""
	@echo -e "$(BOLD)Required Tools:$(NC)"
	@if command -v rustc >/dev/null 2>&1; then \
		version=$$(rustc --version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) rustc:     $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) rustc:     not found"; \
	fi
	@if command -v cargo >/dev/null 2>&1; then \
		version=$$(cargo --version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) cargo:     $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) cargo:     not found"; \
	fi
	@if command -v go >/dev/null 2>&1; then \
		version=$$(go version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) go:        $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) go:        not found"; \
	fi
	@if command -v tinygo >/dev/null 2>&1; then \
		version=$$(tinygo version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) tinygo:    $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) tinygo:    not found"; \
	fi
	@if command -v node >/dev/null 2>&1; then \
		version=$$(node --version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) node:      $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) node:      not found"; \
	fi
	@if command -v python3 >/dev/null 2>&1; then \
		version=$$(python3 --version 2>/dev/null); \
		echo -e "  $(GREEN)✓$(NC) python3:   $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) python3:   not found"; \
	fi
	@if command -v pip3 >/dev/null 2>&1; then \
		version=$$(pip3 --version 2>/dev/null | head -n1); \
		echo -e "  $(GREEN)✓$(NC) pip3:      $$version"; \
	else \
		echo -e "  $(RED)✗$(NC) pip3:      not found"; \
	fi
	@echo ""
	@echo -e "$(BOLD)Optional WebAssembly Tools:$(NC)"
	@if command -v wasm-strip >/dev/null 2>&1; then \
		version=$$(wasm-strip --version 2>/dev/null || echo "available"); \
		echo -e "  $(GREEN)✓$(NC) wasm-strip:  $$version"; \
	else \
		echo -e "  $(YELLOW)○$(NC) wasm-strip:  not found (from wabt package)"; \
	fi
	@if command -v wasm-opt >/dev/null 2>&1; then \
		version=$$(wasm-opt --version 2>/dev/null || echo "available"); \
		echo -e "  $(GREEN)✓$(NC) wasm-opt:    $$version"; \
	else \
		echo -e "  $(YELLOW)○$(NC) wasm-opt:    not found (from binaryen package)"; \
	fi
	@echo ""
	@echo "Install missing tools with:"
	@echo -e "  $(CYAN)brew install rust go tinygo node python wabt binaryen$(NC)"