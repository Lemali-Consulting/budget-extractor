# Playwright MCP: Require --no-sandbox in Devcontainer

**Date:** 2026-03-15
**Status:** accepted

## Context

The Playwright MCP server launches Chrome to enable browser automation (screenshots, testing, UI verification). In the devcontainer, Chrome crashes on startup with:

```
Failed to move to new namespace: PID namespaces supported, Network namespace supported,
but failed: errno = Operation not permitted
FATAL: Check failed: . : Operation not permitted (1)
```

This happens because the devcontainer doesn't grant the `SYS_ADMIN` capability needed for Chrome's sandbox (PID and network namespace isolation).

## Decision

Configure the Playwright MCP server with `--no-sandbox` in `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless", "--no-sandbox"]
    }
  }
}
```

## Operational Notes

- **Changes to `.mcp.json` require an MCP server restart** (`/mcp` in Claude Code). The server caches its launch args at startup. Without a restart, config changes have no effect — Chrome will keep crashing, and retrying the same action won't help.
- This is the most common failure mode when debugging MCP issues: the config looks correct but the server is running with stale args.

## Alternatives Considered

- **Grant `SYS_ADMIN` to the devcontainer**: Would allow Chrome's sandbox, but adds unnecessary privileges and may not be possible in all environments (e.g., Codespaces).
- **Use Chromium from Playwright instead of Chrome**: Same sandbox issue — all Chromium-based browsers need the same namespace permissions.

## Consequences

- Chrome runs without process sandboxing inside the devcontainer. This is acceptable for development/testing but should not be used in production environments.
- The `--no-sandbox` flag is a Playwright MCP server option that passes through to Chrome's launch args.
