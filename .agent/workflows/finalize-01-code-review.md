---
description: Review git diff for code quality, maintainability, and proper abstraction placement
---
1. Run `git diff main...HEAD` (or `git diff origin/main...HEAD` if main is remote, or `git diff` for uncommitted changes) to get all changes.
2. Analyze each changed file and evaluate:
    - **Hardcoded values**: Are there magic strings, numbers, or constants that should live in a constants file or configuration? Flag any hardcoded values that duplicate existing constants or should be centralized.
    - **Abstraction placement**: Is the change in the right location? Consider:
        - Should this logic be in a utility module instead of inline?
        - Should this be a new constant or field definition?
        - Is duplicated logic that could be extracted to a shared function?
        - Does this change belong in a more specific or more general module?
    - **Spaghetti indicators**:
        - Tight coupling to implementation details that should be abstracted
        - Circular dependency risks
        - Changes that span too many unrelated files without clear purpose
        - Mixed concerns in a single function or module
    - **Maintainability**:
        - Is the code self-documenting or does it need excessive comments?
        - Are there clear interfaces between components?
        - Is error handling consistent with the rest of the codebase?
        - Does it follow existing patterns in the codebase?
3. If issues are found, apply corrections:
    - Move hardcoded values to appropriate constants/config files
    - Refactor to proper abstraction layers
    - Extract shared logic to utilities
    - Improve naming and structure for clarity
4. If any tests need updates due to refactoring:
    - Update existing tests in `server/test/` or `client/test/` to reflect changes
    - Add new tests if new utilities or modules were created
5. Run `npm run test` to verify all tests pass after changes.
6. Run `npm run lint` to verify code style is consistent.
7. Provide a summary of:
    - Issues found and how they were addressed
    - Any remaining concerns that need human review
    - Files modified and tests updated