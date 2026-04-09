---
name: recall
description: Search past conversation exchanges using qmd to pull relevant context into the current session. Use when the user asks to recall past discussions or when you need context from previous conversations.
---

# Recall

Search past conversation exchanges stored as markdown files and pull relevant context into the current session.

## Prerequisites

A qmd collection named `exchanges` must exist pointing at the exchanges directory. If not set up:

```bash
qmd collection add /path/to/exchanges --name exchanges --mask "**/*.md"
qmd embed
```

## Instructions

1. Determine what context is needed from the user's query.
2. Search using qmd with appropriate query types:
   - For specific terms or code: `qmd query 'lex: keyword1 keyword2' --collections exchanges`
   - For natural language questions: `qmd query 'vec: how did we handle X' --collections exchanges`
   - For broad recall: `qmd query 'question text' --collections exchanges` (auto-expand)
3. Review the results and extract the relevant context.
4. Present a concise summary of what was found, with key details from the past exchanges.

## Query Examples

```bash
# Find discussions about a specific topic
qmd query 'lex: authentication redis session' --collections exchanges

# Semantic search for past decisions
qmd query 'vec: why did we choose postgres over mysql' --collections exchanges

# Get a specific exchange by date
qmd multi-get "exchanges/2026-03-*.md" -l 20

# Find the exchanges directory for grep fallback
qmd collection list | grep exchanges
# or check exchangesDir in config
cat ~/.config/opencode/clawcode.json | jq -r '.exchangesDir // empty'
```
