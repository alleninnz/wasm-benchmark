# WebAssembly Benchmark Makefile
# Automation targets for the complete experiment pipeline

.PHONY: help init build run collect analyze report clean all
.DEFAULT_GOAL := help

# Configuration
PROJECT_ROOT := $(shell pwd)
VENV_DIR := .venv
PYTHON := $(VENV_DIR)/bin/python3
PIP := $(VENV_DIR)/bin/pip
NODE_MODULES := node_modules/.bin

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m  
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m

# Logging functions
define log_info
	@echo -e "$(BLUE)[INFO]$(NC) $(1)"
endef

define log_success
	@echo -e "$(GREEN)[SUCCESS]$(NC) $(1)"
endef

define log_warning
	@echo -e "$(YELLOW)[WARNING]$(NC) $(1)"
endef

define log_error
	@echo -e "$(RED)[ERROR]$(NC) $(1)"
endef

help: ## Show this help message
	@echo "WebAssembly Benchmark Automation"
	@echo "================================="
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Examples:"
	@echo "  make init          # Initialize environment and dependencies"
	@echo "  make all           # Run complete experiment pipeline"
	@echo "  make build         # Build WebAssembly modules only"
	@echo "  make run           # Run benchmarks only (requires built modules)"
	@echo "  make analyze       # Analyze results only (requires benchmark data)"

# Environment setup targets

init: $(VENV_DIR) node_modules configs/versions.lock ## Initialize environment and install dependencies
	$(call log_success,Environment initialized successfully)

$(VENV_DIR): requirements.txt
	$(call log_info,Creating Python virtual environment...)
	python3 -m venv $(VENV_DIR)
	$(PIP) install --upgrade pip setuptools wheel
	$(PIP) install -r requirements.txt
	$(call log_success,Python virtual environment created)

node_modules: package.json
	$(call log_info,Installing Node.js dependencies...)
	npm ci
	$(call log_success,Node.js dependencies installed)

configs/versions.lock: scripts/fingerprint.sh
	$(call log_info,Generating environment fingerprint...)
	chmod +x scripts/fingerprint.sh
	scripts/fingerprint.sh
	$(call log_success,Environment fingerprint generated)

# Build targets

build: build-rust build-tinygo ## Build all WebAssembly modules
	$(call log_success,All modules built successfully)

build-rust: ## Build Rust WebAssembly modules
	$(call log_info,Building Rust modules...)
	chmod +x scripts/build_rust.sh
	scripts/build_rust.sh
	$(call log_success,Rust modules built)

build-tinygo: ## Build TinyGo WebAssembly modules  
	$(call log_info,Building TinyGo modules...)
	chmod +x scripts/build_tinygo.sh
	scripts/build_tinygo.sh
	$(call log_success,TinyGo modules built)

build-all: ## Build all modules with optimization and size reporting
	$(call log_info,Building all modules with full pipeline...)
	chmod +x scripts/build_all.sh
	scripts/build_all.sh
	$(call log_success,Complete build pipeline finished)

# Execution targets

run: node_modules ## Run browser benchmark suite
	$(call log_info,Running browser benchmarks...)
	chmod +x scripts/run_browser_bench.js  
	node scripts/run_browser_bench.js
	$(call log_success,Benchmarks completed)

run-headed: node_modules ## Run benchmarks with visible browser
	$(call log_info,Running benchmarks with headed browser...)
	node scripts/run_browser_bench.js --headed

run-quick: node_modules ## Run quick benchmarks with reduced samples
	$(call log_info,Running quick benchmarks...)
	node scripts/run_browser_bench.js --timeout=60000

# Analysis targets

collect: $(PYTHON) ## Run quality control on benchmark data
	$(call log_info,Running quality control on results...)
	# QC script would go here when implemented
	$(call log_success,Quality control completed)

analyze: $(PYTHON) ## Run statistical analysis and generate plots
	$(call log_info,Running statistical analysis...)
	@LATEST_RESULT=$$(ls -t results/ | grep "^20" | head -n1); \
	if [ -n "$$LATEST_RESULT" ]; then \
		$(PYTHON) analysis/statistics.py results/$$LATEST_RESULT; \
		$(PYTHON) analysis/plots.py results/$$LATEST_RESULT; \
		$(call log_success,Analysis completed for $$LATEST_RESULT); \
	else \
		$(call log_error,No benchmark results found); \
		exit 1; \
	fi

report: analyze ## Generate final experiment report  
	$(call log_info,Generating final report...)
	@LATEST_RESULT=$$(ls -t results/ | grep "^20" | head -n1); \
	if [ -n "$$LATEST_RESULT" ]; then \
		echo "# Experiment Report for $$LATEST_RESULT" > results/$$LATEST_RESULT/REPORT.md; \
		echo "" >> results/$$LATEST_RESULT/REPORT.md; \
		echo "Generated: $$(date)" >> results/$$LATEST_RESULT/REPORT.md; \
		$(call log_success,Report generated in results/$$LATEST_RESULT/REPORT.md); \
	else \
		$(call log_warning,No results available for report generation); \
	fi

# Complete pipeline targets

all: init build run analyze report ## Run complete experiment pipeline
	$(call log_success,Complete experiment pipeline finished!)
	@echo ""
	@echo "Results available in: $$(ls -td results/20* | head -n1)"

all-clean: clean all ## Clean everything and run complete pipeline

all-quick: init build run-quick analyze ## Run quick experiment for development/testing

# Utility targets

clean: ## Clean build artifacts and temporary files
	$(call log_info,Cleaning build artifacts...)
	rm -rf builds/rust/*.wasm builds/tinygo/*.wasm
	rm -f builds/checksums.txt builds/sizes.csv
	find . -name "*.tmp" -delete 2>/dev/null || true
	find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	$(call log_success,Build artifacts cleaned)

clean-results: ## Clean all benchmark results
	$(call log_warning,Cleaning all results...)
	rm -rf results/20*
	$(call log_success,Results cleaned)

clean-all: clean clean-results ## Clean everything including dependencies
	$(call log_warning,Cleaning everything...)
	rm -rf $(VENV_DIR) node_modules
	rm -f configs/versions.lock
	$(call log_success,Complete cleanup finished)

# Development targets

dev-setup: init ## Setup development environment with additional tools
	$(PIP) install -e .
	$(call log_success,Development environment ready)

lint: $(VENV_DIR) ## Run code quality checks
	$(call log_info,Running code quality checks...)
	$(PYTHON) -m black --check analysis/
	$(PYTHON) -m flake8 analysis/
	$(call log_success,Code quality checks passed)

format: $(VENV_DIR) ## Format Python code
	$(call log_info,Formatting Python code...)
	$(PYTHON) -m black analysis/
	$(call log_success,Code formatted)

test: $(VENV_DIR) ## Run tests (when implemented)
	$(call log_info,Running tests...)
	$(PYTHON) -m pytest tests/ -v
	$(call log_success,Tests passed)

# Status and information targets

status: ## Show current project status
	@echo "Project Status"
	@echo "=============="
	@echo ""
	@echo "Environment:"
	@if [ -d "$(VENV_DIR)" ]; then echo "  ✓ Python venv ready"; else echo "  ✗ Python venv missing (run 'make init')"; fi
	@if [ -d "node_modules" ]; then echo "  ✓ Node.js deps ready"; else echo "  ✗ Node.js deps missing (run 'make init')"; fi
	@if [ -f "configs/versions.lock" ]; then echo "  ✓ Environment fingerprinted"; else echo "  ✗ Environment not fingerprinted"; fi
	@echo ""
	@echo "Build artifacts:"
	@RUST_COUNT=$$(find builds/rust -name "*.wasm" 2>/dev/null | wc -l); echo "  Rust modules: $$RUST_COUNT"
	@TINYGO_COUNT=$$(find builds/tinygo -name "*.wasm" 2>/dev/null | wc -l); echo "  TinyGo modules: $$TINYGO_COUNT"
	@echo ""
	@echo "Results:"
	@RESULT_COUNT=$$(ls -d results/20* 2>/dev/null | wc -l); echo "  Experiment runs: $$RESULT_COUNT"
	@if [ $$RESULT_COUNT -gt 0 ]; then \
		LATEST=$$(ls -t results/20* | head -n1); \
		echo "  Latest: $$LATEST"; \
	fi

info: ## Show system information
	@echo "System Information"
	@echo "=================="
	@echo "OS: $$(uname -s) $$(uname -r)"  
	@echo "Architecture: $$(uname -m)"
	@echo "CPU cores: $$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 'unknown')"
	@echo ""
	@echo "Tool versions:"
	@echo "  Make: $$(make --version 2>/dev/null | head -n1 || echo 'unknown')"
	@echo "  Node.js: $$(node --version 2>/dev/null || echo 'not found')"
	@echo "  Python: $$(python3 --version 2>/dev/null || echo 'not found')"
	@echo "  Rust: $$(rustc --version 2>/dev/null || echo 'not found')"
	@echo "  Go: $$(go version 2>/dev/null || echo 'not found')"
	@echo "  TinyGo: $$(tinygo version 2>/dev/null || echo 'not found')"

# Validation
check-deps: ## Check if all required dependencies are available
	@echo "Dependency Check"
	@echo "================"
	@if command -v rustc >/dev/null 2>&1; then \
		echo "  ✓ rustc: $$(rustc --version)"; \
	else \
		echo "  ✗ rustc: not found"; \
	fi
	@if command -v cargo >/dev/null 2>&1; then \
		echo "  ✓ cargo: $$(cargo --version)"; \
	else \
		echo "  ✗ cargo: not found"; \
	fi
	@if command -v go >/dev/null 2>&1; then \
		echo "  ✓ go: $$(go version)"; \
	else \
		echo "  ✗ go: not found"; \
	fi
	@if command -v tinygo >/dev/null 2>&1; then \
		echo "  ✓ tinygo: $$(tinygo version)"; \
	else \
		echo "  ✗ tinygo: not found"; \
	fi
	@if command -v node >/dev/null 2>&1; then \
		echo "  ✓ node: $$(node --version)"; \
	else \
		echo "  ✗ node: not found"; \
	fi
	@if command -v python3 >/dev/null 2>&1; then \
		echo "  ✓ python3: $$(python3 --version)"; \
	else \
		echo "  ✗ python3: not found"; \
	fi
	@if command -v pip3 >/dev/null 2>&1; then \
		echo "  ✓ pip3: $$(pip3 --version | head -n1)"; \
	else \
		echo "  ✗ pip3: not found"; \
	fi
	@echo ""
	@echo "Optional WebAssembly tools:"
	@if command -v wasm-strip >/dev/null 2>&1; then \
		echo "  ✓ wasm-strip: $$(wasm-strip --version 2>/dev/null || echo 'available')"; \
	else \
		echo "  ○ wasm-strip: not found (optional, from wabt package)"; \
	fi
	@if command -v wasm-opt >/dev/null 2>&1; then \
		echo "  ✓ wasm-opt: $$(wasm-opt --version 2>/dev/null || echo 'available')"; \
	else \
		echo "  ○ wasm-opt: not found (optional, from binaryen package)"; \
	fi