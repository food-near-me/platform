# AI Agent Registry Submission Guide

This guide covers submitting foodnear.me to major AI agent registries and platforms.

## Overview

foodnear.me is now AI-agent-ready with the following discovery endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/llms.txt` | LLM-readable project overview |
| `/openapi.json` | OpenAPI 3.1 API specification |
| `/SKILL.md` | Agent skill file with usage instructions |
| `/mcp` | MCP server endpoint (JSON-RPC) |
| `/.well-known/agent.json` | Custom agent metadata |
| `/.well-known/ai-plugin.json` | OpenAI GPT Actions manifest |
| `/.well-known/agentroot.json` | Doma AgentRoot format |
| `/.well-known/gemini-extension.json` | Google Gemini extension |
| `/.well-known/mcp-server.json` | MCP server metadata |
| `/.well-known/services.json` | Schema.org Service ItemList |

---

## Tier 1: MCP Registries

### 1. Official Anthropic MCP Registry

**Status**: Planned (registry not yet public)

When Anthropic launches their official MCP registry:

1. Visit the MCP registry portal
2. Submit the following:
   - **Server Name**: `foodnear.me`
   - **MCP Endpoint**: `https://foodnear.me/mcp`
   - **Transport**: HTTP (POST JSON-RPC)
   - **Protocol Version**: `2024-11-05`
   - **Description**: AI-native restaurant discovery API. Search restaurants, retrieve Menu Protocol formatted menus with dietary flags and allergens.
   - **Categories**: Food & Dining, Local Services, APIs

**Preparation**:
- Ensure MCP endpoint returns valid `initialize` response
- Test all four tools work correctly
- Have logo.png ready at `https://foodnear.me/logo.png`

### 2. mcp.so (Community Registry)

**URL**: https://mcp.so

**Submission Steps**:
1. Go to https://mcp.so/submit
2. Fill in server details:
   - **Name**: foodnear.me
   - **URL**: https://foodnear.me/mcp
   - **Description**: AI-native restaurant discovery. Search by location, get Menu Protocol menus with dietary info.
   - **Categories**: Food, Local, API
   - **GitHub**: https://github.com/foodnearme/menu-protocol
3. Provide contact email: api@foodnear.me
4. Submit for review

### 3. smithery.ai

**URL**: https://smithery.ai

**Submission Steps**:
1. Create account at smithery.ai
2. Go to "Add Server" or "Submit MCP Server"
3. Provide:
   - **Server URL**: https://foodnear.me/mcp
   - **Name**: foodnear.me
   - **Description**: Restaurant discovery API with Menu Protocol data
   - **Tools**: search_restaurants, get_restaurant, get_menu, get_ado_score_breakdown
   - **Documentation**: https://foodnear.me/SKILL.md
4. Include OpenAPI spec link for additional context

### 4. glama.ai

**URL**: https://glama.ai

**Submission Steps**:
1. Visit https://glama.ai/mcp/servers (or similar listing page)
2. Click "Submit Server" or equivalent
3. Enter details:
   - **MCP Endpoint**: https://foodnear.me/mcp
   - **OpenAPI Spec**: https://foodnear.me/openapi.json
   - **Categories**: Food & Drink, Location-Based Services
   - **Features**: Dietary filtering, allergen detection, verified data

---

## Tier 2: AI Assistant Platforms

### 5. OpenAI GPT Store (Custom GPT)

**URL**: https://chat.openai.com/gpts/editor

**Prerequisites**:
- OpenAI Plus or Team subscription
- Logo image (512x512 recommended)

**Steps to Create Custom GPT**:

1. Go to https://chat.openai.com/gpts/editor
2. Click "Create a GPT"
3. Configure:
   
   **Name**: Food Near Me
   
   **Description**: Find restaurants near you with AI-optimized menus, dietary filters, and verified data.
   
   **Instructions**:
   ```
   You help users find restaurants and explore menus. Always ask for the user's location (or use coordinates if provided). 
   
   When searching:
   - Use the search_restaurants action with lat/lng
   - Apply dietary filters when users mention restrictions
   - Prefer restaurants with ADO scores above 4.0
   
   When presenting results:
   - Show restaurant name, distance, and cuisine type
   - Retrieve full menu with get_menu for detailed dietary/allergen info
   - Always warn about allergens if user mentioned any
   
   Only verified restaurants appear in results.
   ```

4. Go to "Configure" tab
5. Under "Actions", click "Create new action"
6. Import from URL: `https://foodnear.me/openapi.json`
7. Set authentication to "None"
8. Save and publish

**GPT Store Submission**:
1. After creating, click "..." menu → "Publish"
2. Choose "Public" for GPT Store listing
3. Select category: "Lifestyle" or "Productivity"
4. Add sample prompts:
   - "Find vegan restaurants near Times Square"
   - "What Thai places have gluten-free options in Brooklyn?"
   - "Show me highly-rated Italian restaurants within 2 miles"

### 6. Google Gemini Extensions

**Status**: Limited availability (requires Google partnership or waitlist)

**Preparation**:
- Extension manifest ready at `/.well-known/gemini-extension.json`
- OpenAPI spec compliant at `/openapi.json`

**When Available**:
1. Apply through Google AI Studio or partner portal
2. Submit extension manifest URL: `https://foodnear.me/.well-known/gemini-extension.json`
3. Provide OAuth config if required (currently using no-auth)

---

## Tier 3: Developer Directories

### 7. RapidAPI

**URL**: https://rapidapi.com/add-api

**Steps**:
1. Create RapidAPI provider account
2. Add new API
3. Import OpenAPI spec: `https://foodnear.me/openapi.json`
4. Configure:
   - **API Name**: Food Near Me
   - **Category**: Food & Drink
   - **Pricing**: Free tier (100 req/min), paid tiers available
5. Add documentation from SKILL.md
6. Publish

### 8. ProgrammableWeb (API Directory)

**URL**: https://www.programmableweb.com/add/api

**Steps**:
1. Create account
2. Submit API:
   - **Name**: foodnear.me
   - **Category**: Food, Location, Restaurant
   - **API Type**: REST
   - **Formats**: JSON
   - **Documentation**: https://foodnear.me/openapi.json
3. Add description from llms.txt

### 9. APIs.guru (OpenAPI Directory)

**URL**: https://apis.guru

**Steps**:
1. Fork the apis.guru GitHub repository
2. Add spec to `APIs/foodnear.me/1.0.0/openapi.json`
3. Submit pull request with:
   - OpenAPI spec file
   - Logo
   - x-logo extension in spec

---

## Post-Submission Checklist

- [ ] Monitor all endpoint uptime (MCP, REST API)
- [ ] Set up alerting for 5xx errors
- [ ] Track API usage per registry source
- [ ] Respond to registry review feedback within 48 hours
- [ ] Update specs when adding new endpoints
- [ ] Maintain logo.png at correct URL

## Required Assets

Ensure these are available and accessible:

| Asset | URL | Status |
|-------|-----|--------|
| Logo (PNG) | https://foodnear.me/logo.png | ⬜ Create |
| Terms of Service | https://foodnear.me/terms | ⬜ Create |
| Privacy Policy | https://foodnear.me/privacy | ⬜ Create |
| Support Page | https://foodnear.me/support | ⬜ Create |

## DNS Records (Optional)

For advanced agent discovery, consider these DNS TXT records:

```
_mcp.foodnear.me TXT "v=mcp1 endpoint=https://foodnear.me/mcp transport=http"
_agent.foodnear.me TXT "v=1 openapi=https://foodnear.me/openapi.json mcp=https://foodnear.me/mcp"
```

## Testing Before Submission

Run these checks before submitting to any registry:

```bash
# Test MCP endpoint
curl -X POST https://foodnear.me/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# Test OpenAPI spec is valid
npx @apidevtools/swagger-cli validate https://foodnear.me/openapi.json

# Test search endpoint
curl "https://foodnear.me/api/v1/search?lat=40.7128&lng=-74.006&query=thai"

# Verify discovery endpoints
curl https://foodnear.me/llms.txt
curl https://foodnear.me/.well-known/ai-plugin.json
curl https://foodnear.me/.well-known/agentroot.json
```

---

## Contact

For submission assistance or registry partnership inquiries:
- Email: api@foodnear.me
- GitHub: https://github.com/foodnearme
