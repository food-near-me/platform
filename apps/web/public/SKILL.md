# foodnear.me Agent Skill — Index

The full agent skill, parameter reference, and worked recipes now live under [`/skills/foodnearme/`](./skills/foodnearme/SKILL.md). This page is a thin hub; bookmark or fetch the canonical files below for anything beyond a redirect.

| What | URL |
|------|-----|
| Canonical agent skill | [`/skills/foodnearme/SKILL.md`](./skills/foodnearme/SKILL.md) |
| Full MCP tool parameter reference (8 tools) | [`/skills/foodnearme/references/tools-api.md`](./skills/foodnearme/references/tools-api.md) |
| Recipe — verified dietary search | [`/skills/foodnearme/references/dietary-search.md`](./skills/foodnearme/references/dietary-search.md) |
| Recipe — validate your own menu | [`/skills/foodnearme/references/menu-verification-flow.md`](./skills/foodnearme/references/menu-verification-flow.md) |
| Signature verification spec | [`/skills/foodnearme/SKILL.md#verifying-signatures`](./skills/foodnearme/SKILL.md#verifying-signatures) |

## Trust model at a glance

Search returns **verified** → **menu_indexed** → **discovered**. Every result includes `verification_status` and `menu_available`; call `get_menu` only when `menu_available` is true. See the canonical skill above for the full three-tier model, agent rules, and signature verification loop.
