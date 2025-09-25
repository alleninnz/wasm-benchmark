# WebAssembly Benchmark Makefile
# Automation targets for the complete experiment pipeline

# Declare all phony targets (targets that don't create files)
.PHONY: help help-setup init build build-rust build-tinygo build-all run run-headed run-quick \
        qc qc-quick analyze analyze-quick validate validate-quick validate-tasks all all-quick clean clean-results clean-all clean-cache cache-file-discovery \
        lint lint-python lint-rust lint-go lint-js format format-python format-rust format-go \
        test status info check-deps build-config build-config-quick

.DEFAULT_GOAL := help

# Configuration
PROJECT_ROOT := $(shell pwd)
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
	$(if $(filter shell,$(2)),echo,@echo) -e "$(BLUE)$(BOLD)[INFO]$(NC) $(1)"
endef

define log_success
	$(if $(filter shell,$(2)),echo,@echo) -e "$(GREEN)$(BOLD)[SUCCESS]$(NC) $(1)"
endef

define log_warning
	$(if $(filter shell,$(2)),echo,@echo) -e "$(YELLOW)$(BOLD)[WARNING]$(NC) $(1)"
endef

define log_error
	$(if $(filter shell,$(2)),echo,@echo) -e "$(RED)$(BOLD)[ERROR]$(NC) $(1)"
endef

define log_step
	$(if $(filter shell,$(2)),echo,@echo) -e "$(CYAN)$(BOLD)[STEP]$(NC) $(1)"
endef



# File discovery functions (DRY improvement)
define find_python_files
$(shell find . -name "*.py" $(COMMON_EXCLUDES) 2>/dev/null)
endef

define find_rust_projects
$(shell find $(TASKS_DIR) -name 'Cargo.toml' -exec dirname {} \; 2>/dev/null)
endef

define find_go_modules
$(shell find $(TASKS_DIR) -name '*.go' -exec dirname {} \; 2>/dev/null | sort -u)
endef

define find_js_files
$(shell find . -name "*.js" $(BUILD_EXCLUDES) 2>/dev/null)
endef

# Error handling function (consistency improvement)
define handle_command_error
	@if ! $(1); then \
		$(call log_error,$(2)); \
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

# Smart cleanup function with statistics
define smart_clean
	$(call log_step,🧹 Cleaning $(1)...)
	@BEFORE_SIZE=$$(du -sk $(2) 2>/dev/null | cut -f1 || echo "0"); \
	FILE_COUNT=$$(find $(2) $(3) 2>/dev/null | wc -l | tr -d ' '); \
	if [ "$$FILE_COUNT" -gt 0 ]; then \
		find $(2) $(3) -print0 2>/dev/null | xargs -0 -P4 rm -f 2>/dev/null || true; \
		AFTER_SIZE=$$(du -sk $(2) 2>/dev/null | cut -f1 || echo "0"); \
		FREED_KB=$$((BEFORE_SIZE - AFTER_SIZE)); \
		if [ "$$FREED_KB" -gt 0 ]; then \
			$(call log_success,✓ Cleaned $$FILE_COUNT files, freed $$(numfmt --to=iec --suffix=B $$((FREED_KB * 1024)) 2>/dev/null || echo "$${FREED_KB}KB"),shell); \
		else \
			$(call log_warning,○ No files found to clean,shell); \
		fi; \
	else \
		$(call log_warning,○ Directory clean or not found,shell); \
	fi
endef

# Utility function to find latest result directory
define find_latest_result
$(shell ls -td $(RESULTS_DIR)/20* 2>/dev/null | head -n1)
endef

# Utility function to check if command exists
define check_command
$(shell command -v $(1) >/dev/null 2>&1 && echo "$(1)" || echo "")
endef

# Function to start development server if not already running
define start_dev_server
	$(call log_info,🔍 Checking development server status...)
	@if ! pgrep -f "dev-server.js" > /dev/null 2>&1; then \
		$(call log_info,🚀 Starting development server in background...,shell); \
		npm run dev || { $(call log_error,Failed to start development server,shell); exit 1; }; \
		sleep 2; \
		$(call log_success,✅ Development server started successfully,shell); \
	else \
		$(call log_success,✅ Development server already running,shell); \
	fi
endef


help: ## Show complete list of all available targets
	$(call log_info,📋 Complete Command Reference)
	@echo "============================"
	@echo ""
	$(call log_info,🏗️  Setup & Build Targets:)
	$(call log_info,  init                   🔧 Initialize environment and install dependencies)
	$(call log_info,  build                  📦 Build all WebAssembly modules)
	$(call log_info,  build-rust             🦀 Build Rust WebAssembly modules)
	$(call log_info,  build-tinygo           🐹 Build TinyGo WebAssembly modules)
	$(call log_info,  build-all              🚀 Build all modules with optimization and size reporting)
	$(call log_info,  build-config           ⚙️  Build configuration file (bench.json))
	$(call log_info,  build-config-quick     ⚡ Build quick configuration file (bench-quick.json))
	@echo ""
	$(call log_info,🚀 Execution Targets:)
	$(call log_info,  run                    🏃 Run browser benchmark suite)
	$(call log_info,  run-headed             👁️  Run benchmarks with visible browser)
	$(call log_info,  run-quick              ⚡ Run quick benchmarks for development (~2-3 min))
	$(call log_info,  qc                     🔍 Run quality control on benchmark data)
	$(call log_info,  qc-quick               ⚡ Run quality control with quick configuration)
	$(call log_info,  analyze                📊 Run statistical analysis and generate plots)
	$(call log_info,  analyze-quick          ⚡ Run analysis with quick configuration)
	$(call log_info,  validate               🔬 Run benchmark validation analysis)
	$(call log_info,  validate-quick         ⚡ Run validation analysis with quick configuration)
	$(call log_info,  all                    🎯 Run complete experiment pipeline)
	$(call log_info,  all-quick              ⚡ Run quick experiment for development/testing)
	@echo ""
	$(call log_info,🧹 Cleanup Targets:)
	$(call log_info,  clean                  🧹 Clean build artifacts and temporary files)
	$(call log_info,  clean-results          🗑️  Clean all benchmark results (with confirmation))
	$(call log_info,  clean-all              💥 Clean everything including dependencies and caches)
	$(call log_info,  clean-cache            🗄️  Clean discovery cache files)
	@echo ""
	$(call log_info,🛠️  Development Targets:)
	$(call log_info,  lint                   ✨ Run all code quality checks)
	$(call log_info,  lint-python            🐍 Run Python code quality checks with ruff)
	$(call log_info,  lint-rust              🦀 Run Rust code quality checks)
	$(call log_info,  lint-go                🐹 Run Go code quality checks)
	$(call log_info,  lint-js                📜 Run JavaScript code quality checks)
	$(call log_info,  format                 💄 Format all code)
	$(call log_info,  format-python          🐍 Format Python code with black)
	$(call log_info,  format-rust            🦀 Format Rust code)
	$(call log_info,  format-go              🐹 Format Go code)
	$(call log_info,  test                   🧪 Run tests (JavaScript and Python))
	$(call log_info,  validate-tasks         ✅ Run WASM task validation suite)
	@echo ""
	$(call log_info,ℹ️  Information Targets:)
	$(call log_info,  help                   📋 Show complete list of all available targets)
	$(call log_info,  help-setup             🔧 Show setup and installation help)
	$(call log_info,  status                 📈 Show current project status)
	$(call log_info,  info                   💻 Show system information)
	$(call log_info,  check-deps             🔍 Check if all required dependencies are available)
	@echo ""
	$(call log_info,⚡ Performance Targets:)
	$(call log_info,  cache-file-discovery   🗄️  Cache file discovery results for performance)

help-setup: ## Show setup and installation help
	$(call log_info,🔧 Setup & Installation Guide)
	@echo "============================="
	@echo ""
	$(call log_info,📋 Prerequisites:)
	$(call log_info,  🦀 Rust + Cargo (for WebAssembly modules))
	$(call log_info,  🐹 Go + TinyGo (for WebAssembly modules))
	$(call log_info,  📜 Node.js + npm (for test runner and build tools))
	$(call log_info,  🐍 Python 3.8+ (for analysis and plotting))
	@echo ""
	$(call log_info,🍺 Quick Install (macOS with Homebrew):)
	$(call log_info,  brew install rust go tinygo node python)
	@echo ""
	$(call log_info,🐧 Ubuntu/Debian Install:)
	$(call log_info,  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh)
	$(call log_info,  sudo apt update && sudo apt install golang-go nodejs npm python3 python3-pip)
	$(call log_info,  wget https://github.com/tinygo-org/tinygo/releases/download/v0.30.0/tinygo_0.30.0_amd64.deb)
	$(call log_info,  sudo dpkg -i tinygo_0.30.0_amd64.deb)
	@echo ""
	$(call log_info,🏁 After Installing Tools:)
	$(call log_success,  1️⃣  make check-deps   - Verify all tools are installed)
	$(call log_success,  2️⃣  make init         - Initialize environment and dependencies)
	$(call log_success,  3️⃣  make status       - Check project status)
	$(call log_success,  4️⃣  make all-quick    - Run a quick test to verify everything works)
	@echo ""
	$(call log_info,🔍 Troubleshooting:)
	$(call log_error,  🚨 Permission denied:     Add source ~/.bashrc or restart terminal)
	$(call log_error,  🚨 Command not found:     Check echo $$PATH includes tool binaries)
	$(call log_error,  🚨 TinyGo build fails:    Update to TinyGo 0.30.0+ for WASM target support)
	$(call log_error,  🚨 Python module missing: Run pip install -e .)

# ============================================================================
# Environment Setup Targets
# ============================================================================

init: $(NODE_MODULES) versions.lock check-deps ## Initialize environment and install dependencies
	$(call log_step,Installing Python dependencies...)
	@if [ ! -f pyproject.toml ]; then \
		$(call log_error,pyproject.toml not found); \
		exit 1; \
	fi
	poetry install
	$(call log_success,🐍 Python dependencies installed)
	$(call log_success,🎉 Environment initialized successfully)
	$(call log_info,Ready to run: make build)

$(NODE_MODULES): package.json
	$(call log_step,Installing Node.js dependencies...)
	@if [ ! -f package.json ]; then \
		$(call log_error,package.json not found); \
		exit 1; \
	fi
	@if [ -f package-lock.json ]; then \
		echo -e "$(BLUE)$(BOLD)[INFO]$(NC) Using npm ci for clean install..."; \
		npm ci; \
	else \
		echo -e "$(BLUE)$(BOLD)[INFO]$(NC) No package-lock.json found, using npm install..."; \
		npm install; \
	fi
	$(call log_success,📦 Node.js dependencies installed)

versions.lock: scripts/fingerprint.sh
	$(call log_step,Generating environment fingerprint...)
	@if [ ! -f scripts/fingerprint.sh ]; then \
		$(call log_error,scripts/fingerprint.sh not found); \
		exit 1; \
	fi
	chmod +x scripts/fingerprint.sh
	scripts/fingerprint.sh
	$(call log_success,🔐 Environment fingerprint generated)

# ============================================================================
# Configuration Targets
# ============================================================================

build-config: ## Build configuration file (bench.json)
	$(call log_step,Building configuration file...)
	node scripts/build_config.js
	$(call log_success,⚙️ Configuration files built successfully)

build-config-quick: ## Build quick configuration file (bench-quick.json)
	$(call log_step,Building quick configuration file...)
	node scripts/build_config.js --quick
	$(call log_success,⚡ Quick configuration file built successfully)

# ============================================================================
# Build Targets
# ============================================================================

build: build-rust build-tinygo ## Build all WebAssembly modules
	$(call log_success,🎯 All modules built successfully)

build-rust: ## Build Rust WebAssembly modules
	$(call log_step,Building Rust modules...)
	$(call check_script_exists,scripts/build_rust.sh)
	scripts/build_rust.sh
	$(call log_success,🦀 Rust modules built)

build-tinygo: ## Build TinyGo WebAssembly modules
	$(call log_step,Building TinyGo modules...)
	$(call check_script_exists,scripts/build_tinygo.sh)
	scripts/build_tinygo.sh
	$(call log_success,🐹 TinyGo modules built)

build-all: ## Build all modules with optimization and size reporting
	$(call log_step,Building all modules with full pipeline...)
	$(call check_script_exists,scripts/build_all.sh)
	scripts/build_all.sh
	$(call log_success,🚀 Complete build pipeline finished)

# ============================================================================
# Execution Targets
# ============================================================================

run: $(NODE_MODULES) build-config ## Run browser benchmark suite
	$(call log_step,Running browser benchmarks...)
	$(call start_dev_server)
	$(call check_script_exists,scripts/run_bench.js)
	node scripts/run_bench.js
	$(call log_success,🏁 Benchmarks completed)

run-headed: $(NODE_MODULES) build-config ## Run benchmarks with visible browser
	$(call log_step,Running benchmarks with headed browser...)
	$(call start_dev_server)
	$(call check_script_exists,scripts/run_bench.js)
	node scripts/run_bench.js --headed
	$(call log_success,👁️ Headed benchmarks completed)

run-quick: $(NODE_MODULES) build-config-quick ## Run quick benchmarks for development (fast feedback ~2-3 min vs 30+ min full suite)
	$(call log_step,Running quick benchmark suite for development feedback...)
	$(call start_dev_server)
	$(call check_script_exists,scripts/run_bench.js)
	node scripts/run_bench.js --quick
	$(call log_success,⚡ Quick benchmarks completed - results saved with timestamp)

# ============================================================================
# Analysis Targets
# ============================================================================

qc: ## Run quality control on benchmark data
	$(call log_step,Running quality control analysis...)
	@if [ -f analysis/qc.py ]; then \
		python3 -m analysis.qc; \
	else \
		$(call log_error,analysis/qc.py not found); \
		exit 1; \
	fi

qc-quick: ## Run quality control with quick configuration and data
	$(call log_step,Running quick quality control analysis...)
	@if [ -f analysis/qc.py ]; then \
		python3 -m analysis.qc --quick; \
	else \
		$(call log_error,analysis/qc.py not found); \
		exit 1; \
	fi

analyze: ## Run statistical analysis and generate plots
	$(call log_step,Running statistical analysis and visualization...)
	@if [ -f analysis/statistics.py ]; then \
		python3 -m analysis.statistics; \
	else \
		$(call log_warning,analysis/statistics.py not found, skipping statistics); \
	fi
	@if [ -f analysis/plots.py ]; then \
		python3 -m analysis.plots; \
	else \
		$(call log_warning,analysis/plots.py not found, skipping plots); \
	fi

analyze-quick: ## Run statistical analysis and plots with quick configuration and data
	$(call log_step,Running quick statistical analysis and visualization...)
	@if [ -f analysis/statistics.py ]; then \
		python3 -m analysis.statistics --quick; \
	else \
		$(call log_warning,analysis/statistics.py not found, skipping statistics); \
	fi
	@if [ -f analysis/plots.py ]; then \
		python3 -m analysis.plots --quick; \
	else \
		$(call log_warning,analysis/plots.py not found, skipping plots); \
	fi

validate: ## Run benchmark validation analysis
	$(call log_step,Running benchmark validation analysis...)
	@if [ -f analysis/validation.py ]; then \
		python3 -m analysis.validation; \
	else \
		$(call log_error,analysis/validation.py not found); \
		exit 1; \
	fi

validate-quick: ## Run benchmark validation analysis with quick configuration
	$(call log_step,Running quick benchmark validation analysis...)
	@if [ -f analysis/validation.py ]; then \
		python3 -m analysis.validation --quick; \
	else \
		$(call log_error,analysis/validation.py not found); \
		exit 1; \
	fi

# ============================================================================
# Complete Pipeline Targets
# ============================================================================

all: init build run qc analyze ## Run complete experiment pipeline
	$(call log_success,🎉 Complete experiment pipeline finished!)
	@echo ""
	@LATEST_RESULT=$(call find_latest_result); \
	if [ -n "$$LATEST_RESULT" ]; then \
		$(call log_info,Results available in: $$LATEST_RESULT,shell); \
	fi

all-quick: init build run-quick qc analyze ## Run quick experiment for development/testing
	$(call log_success,⚡ Quick experiment pipeline completed!)

# ============================================================================
# Cleanup Targets
# ============================================================================

clean: ## Clean build artifacts and temporary files
	$(call log_step,Cleaning build artifacts...)
	@find $(BUILDS_RUST_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true
	@find $(BUILDS_TINYGO_DIR) -type f ! -name '.gitkeep' -delete 2>/dev/null || true
	@rm -f $(BUILDS_DIR)/checksums.txt $(BUILDS_DIR)/sizes.csv 2>/dev/null || true
	@find . -name "*.tmp" -delete 2>/dev/null || true
	@find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -name "*.pyc" -delete 2>/dev/null || true
	@$(MAKE) clean-cache
	$(call log_success,🧹 Build artifacts cleaned)

clean-results: ## Clean all benchmark results
	$(call log_warning,Cleaning all benchmark results...)
	@read -p "Are you sure? This will delete all results [y/N]: " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf $(RESULTS_DIR)/* 2>/dev/null || true; \
		$(call log_success,🗑️ Results cleaned,shell); \
	else \
		$(call log_info,Operation cancelled,shell); \
	fi

clean-all: clean clean-results ## Clean everything including dependencies and caches
	$(call log_warning,Cleaning everything including dependencies and caches...)
	@read -p "Are you sure? This will delete node_modules, caches, and logs [y/N]: " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		rm -rf $(NODE_MODULES) 2>/dev/null || true; \
		rm -f versions.lock 2>/dev/null || true; \
		rm -f package-lock.json 2>/dev/null || true; \
		rm -f *.log 2>/dev/null || true; \
		rm -f test-results.json 2>/dev/null || true; \
		rm -f dev-server.log 2>/dev/null || true; \
		find $(TASKS_DIR) -name 'target' -type d -exec rm -rf {} + 2>/dev/null || true; \
		find $(TASKS_DIR) -name 'Cargo.lock' -delete 2>/dev/null || true; \
		$(call log_success,🧹 Complete cleanup finished,shell); \
		$(call log_info,Run 'make init' to reinitialize,shell); \
	else \
		$(call log_info,Operation cancelled,shell); \
	fi

# ============================================================================
# Development Targets
# ============================================================================

lint: lint-python lint-rust lint-go lint-js ## Run all code quality checks
	$(call log_success,✨ All linting completed successfully! ✨)

lint-python: ## Run Python code quality checks with ruff
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
			$(call log_info,  ruff check --fix . && make format-python,shell); \
			exit 1; \
		fi; \
	else \
		$(call log_warning,No Python files found, skipping Python lint,shell); \
	fi

lint-rust: ## Run Rust code quality checks
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

lint-go: ## Run Go code quality checks
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

lint-js: ## Run JavaScript code quality checks
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
			$(call log_info,Then run: make lint-js,shell); \
		fi; \
	else \
		$(call log_warning,No JavaScript files found to lint,shell); \
		$(call log_info,Searched in: $(SCRIPTS_DIR)/, $(HARNESS_DIR)/, $(TESTS_DIR)/,shell); \
	fi

format: format-python format-rust format-go ## Format all code
	$(call log_success,✨ All code formatting completed successfully! ✨)

format-python: ## Format Python code with black
	$(call log_step,Formatting Python code with black...)
	@python_files="$(call find_python_files)"; \
	if [ -n "$$python_files" ]; then \
		$(call log_info,Using black for Python formatting...,shell); \
		python3 -m black . --exclude="$(NODE_MODULES)|__pycache__"; \
		$(call log_success,🐍 Python code formatted with black,shell); \
	else \
		$(call log_warning,No Python files found, skipping Python format,shell); \
	fi

format-rust: ## Format Rust code
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

format-go: ## Format Go code
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

test: ## Run tests (JavaScript and Python)
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

validate-tasks: ## Run WASM task validation suite
	$(call log_step,Running WASM task validation...)
	$(call check_script_exists,scripts/validate-tasks.sh)
	@scripts/validate-tasks.sh
	$(call log_success,✅ Task validation completed)

# ============================================================================
# Information and Status Targets
# ============================================================================

status: ## Show current project status
	$(call log_info,📊 Project Status 📊)
	@echo "=============="
	@echo ""
	$(call log_info,🔧 Environment:)
	@if python3 -c "import sys; print('Python', sys.version.split()[0])" 2>/dev/null; then \
		$(call log_success,  ✓ Python ready,shell); \
	else \
		$(call log_error,  ✗ Python missing,shell); \
	fi
	@if [ -d "$(NODE_MODULES)" ]; then \
		$(call log_success,  ✓ Node.js deps ready,shell); \
	else \
		$(call log_error,  ✗ Node.js deps missing (run 'make init'),shell); \
	fi
	@if [ -f "versions.lock" ]; then \
		$(call log_success,  ✓ Environment fingerprinted,shell); \
	else \
		$(call log_error,  ✗ Environment not fingerprinted (run 'make init'),shell); \
	fi
	@echo ""
	$(call log_info,📦 Build Artifacts:)
	@RUST_COUNT=$$(find $(BUILDS_RUST_DIR) -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	echo "  🦀 Rust modules: $$RUST_COUNT"
	@TINYGO_COUNT=$$(find $(BUILDS_TINYGO_DIR) -name "*.wasm" 2>/dev/null | wc -l | tr -d ' '); \
	echo "  🐹 TinyGo modules: $$TINYGO_COUNT"
	@echo ""
	$(call log_info,📈 Results:)
	@RESULT_COUNT=$$(ls -d $(RESULTS_DIR)/20* 2>/dev/null | wc -l | tr -d ' '); \
	echo "  Experiment runs: $$RESULT_COUNT"; \
	if [ "$$RESULT_COUNT" -gt 0 ] 2>/dev/null; then \
		LATEST=$(call find_latest_result); \
		$(call log_success,  ✓ Latest: $$LATEST,shell); \
	fi

info: ## Show system information
	$(call log_info,💻 System Information 💻)
	@echo "=================="
	@echo "🖥️  OS: $$(uname -s) $$(uname -r)"
	@echo "🏗️  Architecture: $$(uname -m)"
	@CPU_CORES=$$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 'unknown'); \
	echo "⚡ CPU cores: $$CPU_CORES"
	@echo ""
	$(call log_info,🛠️  Tool Versions:)
	@printf "  Make: %s\n" "$$(make --version 2>/dev/null | head -n1 || echo 'unknown')"
	@printf "  Node.js: %s\n" "$$(node --version 2>/dev/null || echo 'not found')"
	@printf "  Python: %s\n" "$$(python3 --version 2>/dev/null || echo 'not found')"
	@printf "  Rust: %s\n" "$$(rustc --version 2>/dev/null || echo 'not found')"
	@printf "  Go: %s\n" "$$(go version 2>/dev/null || echo 'not found')"
	@printf "  TinyGo: %s\n" "$$(tinygo version 2>/dev/null || echo 'not found')"

check-deps: ## Check if all required dependencies are available
	$(call check_script_exists,scripts/check-deps.sh)
	@scripts/check-deps.sh