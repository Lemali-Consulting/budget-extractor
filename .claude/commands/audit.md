---
name: audit
description: Create a state-of-the-world audit snapshot in docs/audits/. Use when assessing current project state before a major change.
---

# Create a Project Audit

The user wants to assess the current state of part or all of the project. This goes in `docs/audits/`.

The audit focus is: `$ARGUMENTS`
(If blank, ask the user what aspect of the project they want to audit.)

## Gather Information

Thoroughly explore the relevant parts of the codebase:
- Read directory structures, key files, and configuration
- Check what's actually used vs. what exists but is unused
- Look for inconsistencies, tech debt, or organizational issues
- Note dependencies between components

## Create the Document

Create a file in `docs/audits/` with the naming convention:
`YYYY-MM-DD-short-kebab-description.md`

Use this template:

```markdown
# [Audit Title]

**Date:** YYYY-MM-DD
**Purpose:** [Why this audit was done. 1 sentence.]

## [Section per area audited]

[Use tables for inventories, prose for analysis, and clear status labels (Active, Unused, Support, Deprecated).]

## Decisions Needed

[List open questions that came out of the audit. These may become /decision records.]

## Recommendations

[Actionable next steps based on findings.]
```

## After Creating

1. Review findings with the user
2. Flag any decisions that should be recorded with `/decision`
3. Note any plans that should be created with `/plan`
