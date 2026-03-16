---
description: Perform final checks, formatting, and tests before committing code
---

1. Run `npm run lint` to lint the codebase. Fix any linting errors.
2. Run `git diff main...HEAD` (or `git diff origin/main...HEAD`) to get all changes in the current branch. Review for AI-generated slop:
    - Extra comments that a human wouldn't add or that are inconsistent with the rest of the file.
    - Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase.
    - Unnecessary type assertions to circumvent type issues.
    - Any stylistic choices that are obviously generated and inconsistent with surrounding code.
   Remove any slop found.
3. Run `npm run test` to execute all tests. Fix any failures.
4. Run `npm run compile` to perform TypeScript compilation. Fix any type errors.
5. Run `npm run lint` again to ensure no linting issues were introduced.
6. If any changes were made since the last test run, run `npm run test` one final time to ensure no regressions were introduced. Let the user know when all checks pass successfully.