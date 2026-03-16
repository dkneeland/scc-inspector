---
description: Analyze test coverage for changed code, identify missing edge cases, and ensure meaningful coverage
---

1. Run `git diff main...HEAD` (or `git diff origin/main...HEAD` if main is remote, or `git diff` for uncommitted changes) to get all changes.

2. Identify the changed source files and map them to their corresponding test files:
    - Source files in `server/src/` → tests in `server/test/`
    - Source files in `client/src/` → tests in `client/test/` (if applicable)

3. For each changed source file, analyze whether tests cover:
    - **Happy path**: Normal operation with valid inputs
    - **Error handling**: Invalid inputs, exceptions, edge cases
    - **Boundary conditions**: Empty inputs, maximum sizes, null/undefined values
    - **State transitions**: If stateful, are all transitions tested?

4. Identify missing test coverage by examining:
    - New functions/methods without corresponding test methods
    - New branches (if/else, try/catch) without test cases
    - New error handling paths without tests
    - New constants or configuration without validation tests

5. Check for edge cases that should be tested:
    - **Input validation**: Empty strings, null/undefined, wrong types, out-of-range values
    - **Concurrency**: Race conditions, concurrent access (if applicable)
    - **Resource limits**: Large inputs, many iterations, memory constraints
    - **Backward compatibility**: If changing existing behavior, are old use cases still supported?

6. Verify test quality:
    - Tests follow existing patterns in the test files
    - Unit tests mock external dependencies (API clients, filesystem, network)
    - Test names clearly describe what they validate
    - Each test has a clear focus on one assertion or concept

7. If gaps are found, add tests:
    - Follow existing test patterns in the corresponding test file
    - Keep tests focused on one assertion or concept per test method

8. Run `npm run test` to verify all tests pass.

9. Provide a summary of:
    - Test files analyzed and their corresponding source files
    - Missing coverage identified (functions, branches, edge cases)
    - New tests added with their file locations
    - Any edge cases that need human consideration for priority