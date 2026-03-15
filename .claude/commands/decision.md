---
name: decision
description: Record an architectural or project decision (ADR-lite). Use when the team has made a choice that future contributors need to understand.
---

# Record a Decision

The user wants to document a decision that was made. This creates an ADR-lite record in `docs/decisions/`.

The decision topic is: `$ARGUMENTS`
(If blank, ask the user what decision they want to record.)

## Gather Context

Ask the user (if not already clear from conversation):
1. **What** was decided?
2. **Why** this option over alternatives?
3. **What alternatives** were considered?

## Create the Document

Create a file in `docs/decisions/` with the naming convention:
`YYYY-MM-DD-short-kebab-description.md`

Use this template:

```markdown
# [Decision Title]

**Date:** YYYY-MM-DD
**Status:** accepted

## Context

[What problem or question prompted this decision? 2-3 sentences.]

## Decision

[What was decided. Be specific and concrete.]

## Alternatives Considered

- **[Alternative 1]**: [Why it was rejected]
- **[Alternative 2]**: [Why it was rejected]

## Consequences

- [What changes as a result of this decision]
- [Any trade-offs or risks accepted]
```

## After Creating

1. Confirm the document contents with the user
2. Note: do NOT update any index files — the directory is the index
