---
description: Stage changes, create a well-formed commit, and optionally push
---

## 1. Review what's changed

- Run `git status` to see staged, unstaged, and untracked files
- Run `git diff HEAD` to review the content of all changes
- Run `git log -5 --oneline` to understand the existing commit message style

## 2. Stage files

- Stage files individually with `git add <file>` — only files that are part of the intentional change
- Do NOT use `git add -A` or `git add .`
- Do NOT stage files that may contain secrets (`.env`, `credentials.*`, `*.pem`, `*.key`)
- Do NOT stage generated output directories (`out/`, `dist/`, `node_modules/`)
- If untracked files exist that aren't part of the change, leave them unstaged and mention them to the user

## 3. Draft the commit message

- Use imperative mood ("add feature" not "added feature")
- Match the style from `git log` — if the repo uses conventional commits (`feat:`, `fix:`, `chore:`), follow that; if plain descriptions, follow that
- Focus on WHY the change was made, not WHAT files were touched
- 1-2 sentences unless the change warrants a body paragraph

## 4. Commit

- Create the commit with the drafted message
- Run `git status` after to verify success

## 5. Push (only if requested)

- Do NOT push unless the user explicitly asks
- If pushing: `git push` (or `git push -u origin <branch>` if no upstream is set)
- Confirm success
