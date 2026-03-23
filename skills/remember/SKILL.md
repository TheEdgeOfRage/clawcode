---
name: remember
description: Save a memory to MEMORY.md in the workspace root. Use when the user asks to remember something for future sessions.
---

# Remember

Append a memory entry to `MEMORY.md` in the workspace root.

## Instructions

1. Read the user's message to understand what they want remembered.
2. If `MEMORY.md` does not exist, create it with a `# Memories` header.
3. Append the memory as a bullet under a date header (`## YYYY-MM-DD`). If today's date header already exists, append under it. Otherwise create a new one.
4. Keep the memory concise but complete. Preserve the user's intent exactly.
5. Confirm what was saved.

## Format

```markdown
# Memories

## 2026-03-23

- User prefers minimal approaches, UNIX philosophy
- Project X uses Redis for caching, not Memcached
```
