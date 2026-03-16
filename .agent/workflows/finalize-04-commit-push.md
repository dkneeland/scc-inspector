---
description: Review uncommitted changes, create commit message, commit, and push to remote
---
1. Run `git status` to see uncommitted changes (staged and unstaged).
2. Run `git diff HEAD` to review all changes that will be included in the commit.
3. Run `git log -5 --oneline` to understand the commit message style used in this repository.
4. Draft a concise commit message that:
    - Uses imperative mood (e.g., "add feature" not "added feature")
    - Follows the existing commit style from the repo history
    - Focuses on the "why" rather than the "what"
    - Is 1-2 sentences max
5. Stage the relevant files with `git add` (or `git add -A` if appropriate).
6. Create the commit with the drafted message.
7. Run `git push` to push to the remote repository.
8. Confirm the commit was pushed successfully.