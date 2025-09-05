# Git Commit Message Hook

This repository includes a `commit-msg` git hook that enforces the commit message guidelines defined in `.claude/CLAUDE.md`.

## Features

✅ **Format Validation**: Ensures `type: short summary (≤50 chars)` format  
✅ **Type Validation**: Only allows valid commit types (feat, fix, docs, style, refactor, test, chore)  
✅ **Length Validation**: Enforces 50 character maximum limit  
✅ **Style Validation**: Requires lowercase start, no trailing period  
✅ **Content Validation**: Blocks AI attribution and forbidden patterns  
✅ **Helpful Errors**: Provides clear feedback with examples when validation fails  

## Installation

The hook is automatically installed in this repository. For new clones:

```bash
# Hook should already be present and executable
ls -la .git/hooks/commit-msg

# If missing, you can reinstall with:
scripts/install-commit-hook.sh
```

## Usage Examples

### ✅ Valid Commit Messages
```bash
git commit -m "feat: add user search functionality"
git commit -m "fix: resolve memory leak in worker pool"  
git commit -m "docs: update api installation guide"
git commit -m "refactor: extract validation logic"
git commit -m "test: add integration test for auth"
git commit -m "chore: update dependencies to latest"
```

### ❌ Invalid Commit Messages
```bash
git commit -m "Add new feature"              # Missing type
git commit -m "feat: Add new feature"        # Uppercase start  
git commit -m "feat: add new feature."       # Trailing period
git commit -m "feature: add search"          # Invalid type
git commit -m "feat: this commit message is way too long and exceeds limit"  # >50 chars
git commit -m "feat: generated with AI"      # Forbidden pattern
```

## Commit Types

| Type | Purpose | Example |
|------|---------|---------|
| **feat** | New feature | `feat: add user authentication` |
| **fix** | Bug fix | `fix: resolve login timeout issue` |
| **docs** | Documentation changes | `docs: update installation guide` |
| **style** | Code formatting (no logic change) | `style: fix indentation in utils` |
| **refactor** | Code restructure (no behavior change) | `refactor: extract helper functions` |
| **test** | Add/update tests | `test: add unit tests for parser` |
| **chore** | Build, dependencies, tooling | `chore: update webpack config` |

## Validation Rules

1. **Format**: Must match `type: description` pattern
2. **Length**: Total message ≤ 50 characters  
3. **Type**: Must be one of the valid types listed above
4. **Description**: Cannot be empty
5. **Style**: Must start with lowercase letter, no trailing period
6. **Content**: No AI attribution, co-author tags, or "generated with" patterns

## Error Messages

When validation fails, you'll see:

```bash
❌ COMMIT REJECTED
Commit message validation failed:
  • Total length 78 chars exceeds 50 char limit

Your message: 'feat: this message is way too long and should exceed the fifty character limit'

📋 Commit Message Guidelines:
Format: type: short summary (≤50 chars)

Valid types:
  ✓ feat: New feature
  ✓ fix: Bug fix  
  ✓ docs: Documentation changes
  # ... (full guidelines)

Examples:
  ✓ feat: add user search functionality
  ✓ fix: resolve memory leak in worker pool
  # ... (more examples)
```

## Bypassing the Hook (Not Recommended)

If you absolutely need to bypass validation (emergency commits):

```bash
git commit --no-verify -m "emergency: bypass validation"
```

**⚠️ Warning**: Only use `--no-verify` in true emergencies. The hook helps maintain consistent commit history.

## Customization

To modify the hook behavior, edit `.git/hooks/commit-msg`:

- **Add new types**: Extend the `valid_types` array
- **Change length limit**: Modify the 50 character check
- **Add forbidden patterns**: Extend the `forbidden_patterns` array
- **Customize messages**: Update the error message functions

## Troubleshooting

### Hook not running?
```bash
# Check if hook exists and is executable
ls -la .git/hooks/commit-msg
# Should show: -rwxr-xr-x ... commit-msg

# Make executable if needed
chmod +x .git/hooks/commit-msg
```

### Hook errors on valid messages?
```bash
# Check bash version (hook requires bash 4+)
bash --version

# Test hook manually
echo "feat: test message" | .git/hooks/commit-msg /dev/stdin
```

### Want to disable temporarily?
```bash
# Rename to disable
mv .git/hooks/commit-msg .git/hooks/commit-msg.disabled

# Rename to re-enable  
mv .git/hooks/commit-msg.disabled .git/hooks/commit-msg
```

## Integration with IDEs

Most Git-enabled IDEs respect commit hooks:

- **VS Code**: Hook runs when committing through Source Control panel
- **IntelliJ/WebStorm**: Hook runs with VCS commit dialog
- **GitHub Desktop**: Hook runs with commit button
- **Terminal**: Always runs with `git commit`

The hook provides the same validation regardless of how you commit!