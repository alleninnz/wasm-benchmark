#!/bin/bash

# Install commit-msg hook to enforce .claude/CLAUDE.md guidelines
# This script copies the commit-msg hook to .git/hooks and makes it executable

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${PROJECT_ROOT}/.git/hooks"
COMMIT_MSG_HOOK="${HOOKS_DIR}/commit-msg"

echo -e "${BLUE}${BOLD}📋 Installing Git Commit Message Hook${NC}"
echo "=================================================="

# Check if we're in a git repository
if [[ ! -d "${PROJECT_ROOT}/.git" ]]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}" >&2
    echo -e "${RED}   Run this script from the project root${NC}" >&2
    exit 1
fi

# Check if .claude/CLAUDE.md exists (project-local or global)
if [[ -f "${PROJECT_ROOT}/.claude/CLAUDE.md" ]]; then
    echo -e "${GREEN}✓ Found project-local .claude/CLAUDE.md${NC}"
elif [[ -f "${HOME}/.claude/CLAUDE.md" ]]; then
    echo -e "${GREEN}✓ Found global .claude/CLAUDE.md${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: .claude/CLAUDE.md not found${NC}"
    echo -e "${YELLOW}   This hook enforces guidelines from that file${NC}"
    echo -e "${YELLOW}   Expected locations:${NC}"
    echo -e "${YELLOW}   - ${PROJECT_ROOT}/.claude/CLAUDE.md${NC}"
    echo -e "${YELLOW}   - ${HOME}/.claude/CLAUDE.md${NC}"
fi

# Create hooks directory if it doesn't exist
mkdir -p "${HOOKS_DIR}"

# Check if hook already exists
if [[ -f "${COMMIT_MSG_HOOK}" ]]; then
    echo -e "${YELLOW}⚠️  Existing commit-msg hook found${NC}"
    echo -e "${BLUE}   Creating backup: commit-msg.backup${NC}"
    cp "${COMMIT_MSG_HOOK}" "${COMMIT_MSG_HOOK}.backup"
fi

# Create the commit-msg hook
echo -e "${BLUE}ℹ️  Creating commit-msg hook...${NC}"

cat > "${COMMIT_MSG_HOOK}" << 'EOF'
#!/bin/bash

# Git commit-msg hook to enforce commit message guidelines from .claude/CLAUDE.md
# This hook validates commit messages against the specified format and types

set -euo pipefail

commit_msg_file="$1"
commit_msg=$(cat "$commit_msg_file")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Valid commit types from .claude/CLAUDE.md
valid_types=(
    "feat"      # New feature
    "fix"       # Bug fix
    "docs"      # Documentation changes
    "style"     # Code formatting (no logic change)
    "refactor"  # Code restructure (no behavior change)
    "test"      # Add/update tests
    "chore"     # Build, dependencies, tooling
)

# Function to print error messages
print_error() {
    echo -e "${RED}${BOLD}❌ COMMIT REJECTED${NC}" >&2
    echo -e "${RED}$1${NC}" >&2
}

# Function to print guidelines
print_guidelines() {
    echo -e "\n${BLUE}${BOLD}📋 Commit Message Guidelines:${NC}" >&2
    echo -e "${BLUE}Format:${NC} ${BOLD}type: short summary (≤50 chars)${NC}" >&2
    echo -e "\n${BLUE}Valid types:${NC}" >&2
    for type in "${valid_types[@]}"; do
        case $type in
            "feat")     desc="New feature" ;;
            "fix")      desc="Bug fix" ;;
            "docs")     desc="Documentation changes" ;;
            "style")    desc="Code formatting (no logic change)" ;;
            "refactor") desc="Code restructure (no behavior change)" ;;
            "test")     desc="Add/update tests" ;;
            "chore")    desc="Build, dependencies, tooling" ;;
        esac
        echo -e "  ${GREEN}${type}${NC}: ${desc}" >&2
    done
    echo -e "\n${BLUE}Rules:${NC}" >&2
    echo -e "  • Summary: ≤50 chars, imperative mood, lowercase, no period" >&2
    echo -e "  • Focus: What changed, not why" >&2
    echo -e "  • Never: Add AI attribution or 'Generated with' tags" >&2
    echo -e "\n${YELLOW}Examples:${NC}" >&2
    echo -e "  ${GREEN}✓${NC} feat: add user search functionality" >&2
    echo -e "  ${GREEN}✓${NC} fix: resolve memory leak in worker pool" >&2
    echo -e "  ${GREEN}✓${NC} docs: update api installation guide" >&2
    echo -e "  ${GREEN}✓${NC} refactor: extract validation logic" >&2
}

# Function to validate commit message format
validate_commit_message() {
    local msg="$1"
    local errors=()
    
    # Skip merge commits and revert commits
    if [[ $msg =~ ^Merge\ branch || $msg =~ ^Revert\ \" ]]; then
        return 0
    fi
    
    # Check if message matches basic format: "type: description"
    if ! [[ $msg =~ ^([a-z]+):\ (.+)$ ]]; then
        errors+=("Format must be: 'type: description'")
        return 1
    fi
    
    # Extract type and description
    local type="${BASH_REMATCH[1]}"
    local description="${BASH_REMATCH[2]}"
    
    # Validate commit type
    local valid_type=false
    for valid in "${valid_types[@]}"; do
        if [[ "$type" == "$valid" ]]; then
            valid_type=true
            break
        fi
    done
    
    if [[ "$valid_type" == "false" ]]; then
        errors+=("Invalid type '$type'. Valid types: ${valid_types[*]}")
    fi
    
    # Validate description length (≤50 chars total, so description is ~45 chars max)
    local total_length=${#msg}
    if [[ $total_length -gt 50 ]]; then
        errors+=("Total length $total_length chars exceeds 50 char limit")
    fi
    
    # Validate description format
    if [[ -z "$description" ]]; then
        errors+=("Description cannot be empty")
    elif [[ $description =~ \.$ ]]; then
        errors+=("Description should not end with period")
    elif [[ $description =~ ^[A-Z] ]]; then
        errors+=("Description should start with lowercase letter")
    fi
    
    # Check for forbidden patterns
    local forbidden_patterns=(
        "generated with"
        "co-authored-by"
        "created by ai"
        "built by"
        "made with"
    )
    
    for pattern in "${forbidden_patterns[@]}"; do
        if [[ $(echo "$msg" | tr '[:upper:]' '[:lower:]') =~ $pattern ]]; then
            errors+=("Forbidden pattern detected: '$pattern'")
        fi
    done
    
    # Report errors if any
    if [[ ${#errors[@]} -gt 0 ]]; then
        print_error "Commit message validation failed:"
        for error in "${errors[@]}"; do
            echo -e "${RED}  • $error${NC}" >&2
        done
        echo -e "\n${YELLOW}Your message:${NC} '$msg'" >&2
        print_guidelines
        return 1
    fi
    
    return 0
}

# Main validation
if validate_commit_message "$commit_msg"; then
    echo -e "${GREEN}✅ Commit message format is valid${NC}" >&2
    exit 0
else
    echo -e "\n${RED}Please fix your commit message and try again.${NC}" >&2
    exit 1
fi
EOF

# Make the hook executable
chmod +x "${COMMIT_MSG_HOOK}"

echo -e "${GREEN}✅ Commit message hook installed successfully${NC}"
echo
echo -e "${BLUE}${BOLD}Hook Features:${NC}"
echo -e "  • Enforces commit message format: ${BOLD}type: short summary (≤50 chars)${NC}"
echo -e "  • Validates commit types: feat, fix, docs, style, refactor, test, chore"
echo -e "  • Ensures lowercase start, no trailing period"
echo -e "  • Blocks AI attribution and forbidden patterns"
echo -e "  • Provides helpful error messages with examples"
echo
echo -e "${BLUE}${BOLD}Testing:${NC}"
echo -e "  Test with: ${YELLOW}git commit -m \"test: valid commit message\"${NC}"
echo -e "  Test fail: ${YELLOW}git commit -m \"Invalid: This message is too long\"${NC}"
echo
echo -e "${GREEN}✅ Installation complete! All commits will now be validated.${NC}"