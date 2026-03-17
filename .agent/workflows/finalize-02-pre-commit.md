---
description: Mechanical quality gate — lint, slop check, compile, and test before committing
---

## 1. Discover available scripts

Read root `package.json` to find which scripts exist (e.g., `lint`, `compile`, `build`, `test`, `typecheck`). Only run scripts that are actually defined. Do NOT assume any script name.

## 2. Lint

If a lint script exists, run it. Fix any errors found.

## 3. Check for AI-generated slop

Run `git diff` (or `git diff main...HEAD` if on a branch) and scan the changed lines for:

- **Unnecessary comments** — comments restating what the code does, or inconsistent with the commenting density/style in the surrounding unchanged code
- **Defensive over-engineering** — try/catch, null checks, or fallback values not needed given the function's contract and callers
- **Type assertion hacks** — `as any`, `as unknown as X`, `!` non-null assertions papering over type issues
- **Inconsistent style** — naming, braces, import ordering, or patterns that don't match the surrounding code in the same file
- **Dead code** — commented-out code, unused imports, unreachable branches
- **Leftover debugging** — `console.log`, `debugger`, unresolved TODO/FIXME comments

Remove any slop found.

## 4. Compile

If a compile/build script exists, run it. Fix any type errors or build failures.

## 5. Test

Run the test script. Fix any failures.

## 6. Re-check if changes were made

If steps 2-5 required code fixes:
- Re-run lint (if it exists)
- Re-run tests
- Repeat until clean

## 7. Report

Tell the user:
- All checks passed (or what's still failing)
- What was fixed, if anything
- Any non-blocking warnings worth noting
