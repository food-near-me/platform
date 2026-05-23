/**
 * MCP resource catalogue and inline content.
 *
 * Served via `resources/list` and `resources/read`. Resource URIs use the
 * `foodnearme://` scheme so agents can dereference them through the MCP
 * server even when network access is restricted.
 */

export type ResourceDefinition = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
};

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "foodnearme://spec/menu-protocol",
    name: "Menu Protocol Specification",
    description:
      "Complete Menu Protocol v1.0 specification. Defines the schema for structured restaurant menu data, dietary flags, allergens, and cryptographic signatures.",
    mimeType: "text/markdown",
  },
  {
    uri: "foodnearme://spec/openapi",
    name: "OpenAPI Specification",
    description:
      "OpenAPI 3.1 specification for the foodnear.me REST API. Use this for traditional HTTP integration.",
    mimeType: "application/json",
  },
  {
    uri: "foodnearme://agent/skill",
    name: "Agent Skill File",
    description:
      "SKILL.md file with detailed usage instructions, example flows, and best practices for AI agents.",
    mimeType: "text/markdown",
  },
  {
    uri: "foodnearme://examples/search-flow",
    name: "Example: Search Flow",
    description: "Step-by-step example of a complete restaurant search and menu retrieval flow.",
    mimeType: "text/markdown",
  },
];

export const RESOURCE_CONTENT: Record<string, string> = {
  "foodnearme://spec/menu-protocol": `# Menu Protocol v1.0 Specification

Menu Protocol is a strict superset of Schema.org/Restaurant and Schema.org/MenuItem.

## Key Features
- Explicit boolean dietary flags (vegetarian, vegan, gluten_free, etc.)
- Declared allergens array per item
- Customization options with price adjustments and dietary changes
- Cryptographic signatures for owner approval
- ADO (Agent Discovery Optimization) scoring

## Full Specification
See: https://foodnear.me/SKILL.md
See: https://foodnear.me/openapi.json

## Example Menu Item
\`\`\`json
{
  "@type": "MenuItem",
  "name": "Margherita Pizza",
  "price": 14.99,
  "dietary": {
    "vegetarian": true,
    "vegan": false,
    "gluten_free": false
  },
  "allergens": ["dairy", "gluten"]
}
\`\`\`
`,
  "foodnearme://spec/openapi": "Fetch from: https://foodnear.me/openapi.json",
  "foodnearme://agent/skill": `# foodnear.me Agent Skill

Find restaurants and retrieve Menu Protocol formatted menus.

## Quick Start
1. Call search_restaurants with lat/lng
2. Pick a restaurant from results
3. Call get_menu with the restaurant_id
4. Filter items by dietary flags and allergens

## Full Documentation
See: https://foodnear.me/SKILL.md
`,
  "foodnearme://examples/search-flow": `# Example: Restaurant Search Flow

## Step 1: Search
Tool: search_restaurants
Args: { "lat": 40.7128, "lng": -74.006, "query": "thai", "dietary": ["vegan"] }

## Step 2: Get Menu
Tool: get_menu  
Args: { "restaurant_id": "<id from search results>" }

## Step 3: Filter Items
Filter menu.items where dietary.vegan = true
Check allergens array for user restrictions

## Step 4: Present to User
Show filtered items with prices, descriptions, and preparation times
`,
};
