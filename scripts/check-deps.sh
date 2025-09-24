#!/bin/bash
# Dependency checker for WASM benchmark project
# Checks if all required tools are installed with minimum versions

set -euo pipefail

# Colors (only if terminal supports them)
TERM_COLORS=$(tput colors 2>/dev/null || echo 0)
if [ "${TERM_COLORS}" -ge 8 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# Logging functions
log_info() { echo -e "${BLUE}${BOLD}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}${BOLD}[ERROR]${NC} $1"; }

# Version comparison: returns 0 if version >= min_version
version_compare() {
    local version=$1
    local min_version=$2

    # Convert versions to comparable numbers (e.g., "1.89.0" -> "1089000")
    local version_num=$(echo "$version" | sed 's/\./ /g' | awk '{printf "%d%03d%03d", $1, $2, $3}')
    local min_version_num=$(echo "$min_version" | sed 's/\./ /g' | awk '{printf "%d%03d%03d", $1, $2, $3}')

    [ "$version_num" -ge "$min_version_num" ]
}

# Check single dependency with version requirement
check_dependency() {
    local tool=$1
    local emoji=$2
    local min_version=$3
    local version_cmd=$4
    local version_regex=$5

    if command -v "$tool" >/dev/null 2>&1; then
        local version
        version=$(eval "$version_cmd" 2>/dev/null | grep -oE "$version_regex" | head -n1)

        if [ -n "$version" ]; then
            if version_compare "$version" "$min_version"; then
                log_success "  ✓ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') $version (≥$min_version)"
                return 0
            else
                log_error "  ✗ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') $version (<$min_version required)"
                return 1
            fi
        else
            log_error "  ✗ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') version unknown"
            return 1
        fi
    else
        log_error "  ✗ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') not found"
        return 1
    fi
}

# Check optional tool (no version requirement)
check_optional() {
    local tool=$1
    local emoji=$2
    local desc=$3

    if command -v "$tool" >/dev/null 2>&1; then
        local version
        version=$($tool --version 2>/dev/null | head -n1 || echo "available")
        log_success "  ✓ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') $version"
    else
        log_warning "  ○ $emoji $tool:$(printf '%*s' $((12-${#tool})) '') not found ($desc)"
    fi
}

# Main dependency check
main() {
    log_info "🔍 Dependency Check 🔍"
    echo "================"
    echo ""
    log_info "🛠️  Required Tools (with minimum versions):"

    local all_deps_ok=true

    # Required tools with version checks
    check_dependency "rustc"   "🦀" "1.89.0"  "rustc --version"    '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false
    check_dependency "cargo"   "📦" "0.0.0"   "cargo --version"    '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false

    # Special handling for go version
    if command -v go >/dev/null 2>&1; then
        local go_version=$(go version 2>/dev/null | grep -oE 'go[0-9]+\.[0-9]+\.[0-9]+' | sed 's/go//' | head -n1)
        if [ -n "$go_version" ]; then
            if version_compare "$go_version" "1.25.0"; then
                log_success "  ✓ 🐹 go:$(printf '%*s' $((12-2)) '') $go_version (≥1.25.0)"
            else
                log_error "  ✗ 🐹 go:$(printf '%*s' $((12-2)) '') $go_version (<1.25.0 required)"
                all_deps_ok=false
            fi
        else
            log_error "  ✗ 🐹 go:$(printf '%*s' $((12-2)) '') version unknown"
            all_deps_ok=false
        fi
    else
        log_error "  ✗ 🐹 go:$(printf '%*s' $((12-2)) '') not found"
        all_deps_ok=false
    fi

    check_dependency "tinygo"  "🐹" "0.39.0"  "tinygo version"     '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false
    check_dependency "node"    "📜" "22.18.0" "node --version"     '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false
    check_dependency "python3" "🐍" "3.13.0"  "python3 --version"  '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false

    # Special handling for pip3 which has different output format
    if command -v pip3 >/dev/null 2>&1; then
        local pip_version=$(pip3 --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1)
        if [ -n "$pip_version" ]; then
            log_success "  ✓ 📦 pip3:$(printf '%*s' $((12-4)) '') $pip_version"
        else
            log_error "  ✗ 📦 pip3:$(printf '%*s' $((12-4)) '') version unknown"
            all_deps_ok=false
        fi
    else
        log_error "  ✗ 📦 pip3:$(printf '%*s' $((12-4)) '') not found"
        all_deps_ok=false
    fi

    check_dependency "poetry"  "📦" "0.0.0"   "poetry --version"   '[0-9]+\.[0-9]+\.[0-9]+' || all_deps_ok=false

    echo ""
    log_info "🔧 Optional WebAssembly Tools:"
    check_optional "wasm-strip" "🏗️ " "from wabt package"
    check_optional "wasm-opt"   "⚡" "from binaryen package"

    echo ""
    if [ "$all_deps_ok" = "true" ]; then
        log_success "🎉 All required dependencies are available and meet minimum version requirements!"
        return 0
    else
        log_error "❌ Some required dependencies are missing or below minimum version requirements."
        log_info "Install missing tools with:"
        log_info "  🍺 brew install rust go tinygo node python wabt binaryen"
        return 1
    fi
}

# Run main function
main "$@"