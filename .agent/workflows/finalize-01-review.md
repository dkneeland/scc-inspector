---
description: Comprehensive review of changed code — quality, abstractions, test coverage, refactoring
---

## 1. Determine the diff

Pick the right diff command based on current state:
- If on a feature branch: `git diff main...HEAD` combined with `git diff` for uncommitted changes
- If all changes are uncommitted: `git diff`
- The goal is to see everything that's changed relative to the last clean baseline

## 2. Discover project structure

- Read root `package.json` for workspace names, script names, and source directories
- For each workspace with changes, read its `package.json` and `tsconfig.json` to find source roots and output directories
- Find test directories by checking the test script config and looking for existing test files
- Read 1-2 existing test files to learn: framework/style, import patterns, assertion library, fixture conventions
- Do NOT assume any paths, script names, or conventions — derive them from the project

## 3. Review each changed source file

For every changed source file (excluding generated output like `out/`, `dist/`):

### Hardcoded values
- Flag magic numbers, strings, or repeated literals that should be constants
- Check if a matching constant already exists elsewhere that could be reused
- Watch for repeated format strings or template patterns across functions — these indicate a formatting helper is needed

### Abstraction placement
- Is this logic in the right module?
- Is there duplicated logic across files that should be a shared function?
- Are functions doing too many things? (>40 lines is a smell, not a rule)
- Could a switch/case block be replaced with a lookup or function map?

### Spaghetti indicators
- Functions reaching into another module's internals instead of using its public API
- Circular dependency risk
- Mixed concerns in a single function (parsing AND formatting AND state mutation)
- Changes spanning unrelated files without a unifying purpose

### Maintainability
- Is the code self-documenting through naming?
- Are interfaces between components clear?
- Is error handling consistent with the rest of the codebase?
- Do new patterns match existing patterns?

## 4. Review test coverage for changed code

For each changed function or method:

### Map changes to tests
- Find corresponding test files by convention or by grepping for imports of the changed module
- If no test file exists for a changed module, flag it

### Identify gaps
- New functions/methods without any tests
- New branches (if/else, switch cases) without test cases that exercise them
- Changed behavior where tests still assert the old behavior
- Boundary conditions: empty inputs, null/undefined, zero-length, max values
- Error paths: what happens with bad input?

### Skip testing
- Trivial getters/setters or pass-through functions
- Third-party library behavior
- Private implementation details — test through the public API

## 5. Apply corrections

- Move hardcoded values to constants or config
- Extract shared logic into utility functions in the right module
- Split large functions into focused helpers
- Improve naming where intent is unclear
- Remove dead code left behind during refactoring
- Add missing tests following the exact patterns found in step 2 (framework, style, imports, assertions)
- Update stale tests that assert old behavior
- One concept per test, clear names describing what's validated
- If a refactor touches core logic (not just moving or renaming code), run tests before continuing to the next file to catch compounding mistakes early

## 6. Summarize

Provide:
- Issues found and how each was addressed
- Tests added or updated, with file locations
- Any remaining concerns that need human review
- Do NOT run lint/compile/test here — that's the next workflow's job