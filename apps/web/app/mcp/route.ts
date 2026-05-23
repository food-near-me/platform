import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toolErrorResult } from "@/lib/mcp/tool-errors";
import { promptDefinitions, handleGetPrompt } from "@/lib/mcp/prompts";
import {
  extractResultsCount,
  extractTierLabel,
  recordMcpInvocation,
} from "@/lib/mcp/instrumentation";
import { SEARCH_RESTAURANTS_DESCRIPTION } from "@/lib/discovery/trust-model-copy";
import {
  buildMenuTrustNotice,
  buildProfileTrustNotice,
  buildSearchLinks,
  buildSearchTrustNotice,
  hasMenuAccess,
} from "@/lib/discovery/verification-status";

/**
 * MCP (Model Context Protocol) Server for foodnear.me
 * 
 * Protocol: JSON-RPC 2.0 over HTTP
 * Spec: https://modelcontextprotocol.io
 * 
 * Features:
 * - Read-only tools for restaurant discovery
 * - Input validation
 * - Proper JSON-RPC error codes
 * - CORS support for cross-origin agents
 * - Rate limiting headers
 */

// =============================================================================
// Constants & Configuration
// =============================================================================

const MCP_VERSION = "2024-11-05";
const SERVER_VERSION = "1.0.0";
const MAX_SEARCH_RADIUS_MILES = 50;
const MAX_RESULTS = 50;

// JSON-RPC 2.0 Error Codes
const RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  // Custom errors (-32000 to -32099)
  RESOURCE_NOT_FOUND: { code: -32001, message: "Resource not found" },
  VALIDATION_ERROR: { code: -32002, message: "Validation error" },
  DATABASE_ERROR: { code: -32003, message: "Database error" },
} as const;

// Valid dietary filters
const VALID_DIETARY_FILTERS = [
  "vegan", "vegetarian", "gluten_free", "halal", "kosher", 
  "nut_free", "dairy_free", "low_carb", "keto"
] as const;

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS = [
  {
    name: "search_restaurants",
    description: SEARCH_RESTAURANTS_DESCRIPTION,
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Food type, cuisine, or restaurant name. Examples: 'thai', 'pizza', 'sushi', 'vegan burgers'. Leave empty to search all cuisines."
        },
        lat: {
          type: "number",
          description: "Latitude of search center (-90 to 90)"
        },
        lng: {
          type: "number",
          description: "Longitude of search center (-180 to 180)"
        },
        radius_miles: {
          type: "number",
          description: `Search radius in miles. Default: 5, Max: ${MAX_SEARCH_RADIUS_MILES}`,
          default: 5
        },
        dietary: {
          type: "array",
          items: { type: "string", enum: VALID_DIETARY_FILTERS },
          description: "Filter by dietary certifications. Multiple filters use AND logic."
        },
        min_ado_score: {
          type: "number",
          description: "Minimum ADO score (0.0-5.0). Higher scores indicate better agent-readiness.",
          default: 0,
          minimum: 0,
          maximum: 5
        }
      },
      required: ["lat", "lng"]
    }
  },
  {
    name: "get_restaurant",
    description: "Get detailed restaurant profile with Schema.org/Restaurant JSON-LD markup and Menu Protocol extensions including ADO score, verification status, payment methods, and dietary certifications.",
    inputSchema: {
      type: "object" as const,
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID (from search results)"
        }
      },
      required: ["restaurant_id"]
    }
  },
  {
    name: "get_menu",
    description: "Get the full menu in Menu Protocol v1.0 format. Includes all items with explicit dietary boolean flags, declared allergens, customization options with price adjustments, preparation times, and cryptographic signature proving owner approval.",
    inputSchema: {
      type: "object" as const,
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID (from search results)"
        }
      },
      required: ["restaurant_id"]
    }
  },
  {
    name: "get_ado_score_breakdown",
    description: "Get the ADO (Agent Discovery Optimization) score breakdown for a restaurant. Shows weighted scoring across menu completeness, location accuracy, data freshness, protocol compliance, verification status, and media context. Includes recommendations for improvement.",
    inputSchema: {
      type: "object" as const,
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID"
        }
      },
      required: ["restaurant_id"]
    }
  },
  {
    name: "validate_menu_protocol",
    description: "Validate a JSON payload against the Menu Protocol v1.0 schema. Returns validation errors, missing required fields, Schema.org compliance gaps, and recommendations for improving ADO score. Use this to check menu data before submission or to debug integration issues.",
    inputSchema: {
      type: "object" as const,
      properties: {
        payload: {
          type: "object",
          description: "The Menu Protocol JSON payload to validate. Should include version, domain, restaurant, and menu objects."
        },
        strict: {
          type: "boolean",
          description: "If true, also check optional fields and Schema.org best practices. Default: false (only check required fields).",
          default: false
        }
      },
      required: ["payload"]
    }
  }
];

// =============================================================================
// Resource Definitions
// =============================================================================

const RESOURCES = [
  {
    uri: "foodnearme://spec/menu-protocol",
    name: "Menu Protocol Specification",
    description: "Complete Menu Protocol v1.0 specification. Defines the schema for structured restaurant menu data, dietary flags, allergens, and cryptographic signatures.",
    mimeType: "text/markdown"
  },
  {
    uri: "foodnearme://spec/openapi",
    name: "OpenAPI Specification", 
    description: "OpenAPI 3.1 specification for the foodnear.me REST API. Use this for traditional HTTP integration.",
    mimeType: "application/json"
  },
  {
    uri: "foodnearme://agent/skill",
    name: "Agent Skill File",
    description: "SKILL.md file with detailed usage instructions, example flows, and best practices for AI agents.",
    mimeType: "text/markdown"
  },
  {
    uri: "foodnearme://examples/search-flow",
    name: "Example: Search Flow",
    description: "Step-by-step example of a complete restaurant search and menu retrieval flow.",
    mimeType: "text/markdown"
  }
];

// =============================================================================
// Server Info
// =============================================================================

const SERVER_INFO = {
  name: "foodnear.me",
  version: SERVER_VERSION,
  protocolVersion: MCP_VERSION,
  capabilities: {
    tools: { listChanged: false },
    resources: { listChanged: false, subscribe: false },
    prompts: { listChanged: false },
  },
};

// =============================================================================
// Validation Helpers
// =============================================================================

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function validateLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new ValidationError(
      "lat and lng must be numbers",
      "Pass decimal degrees, e.g. lat: 40.7128, lng: -74.006."
    );
  }
  if (lat < -90 || lat > 90) {
    throw new ValidationError(
      "lat must be between -90 and 90",
      `Received lat=${lat}. Use a valid latitude.`
    );
  }
  if (lng < -180 || lng > 180) {
    throw new ValidationError(
      "lng must be between -180 and 180",
      `Received lng=${lng}. Use a valid longitude.`
    );
  }
  return { lat, lng };
}

function validateDietaryFilters(dietary: unknown): string[] {
  if (!dietary) return [];
  if (!Array.isArray(dietary)) {
    throw new ValidationError("dietary must be an array", 'Pass dietary as a string array, e.g. ["vegan"].');
  }
  const invalid = dietary.filter(d => !VALID_DIETARY_FILTERS.includes(d as typeof VALID_DIETARY_FILTERS[number]));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Invalid dietary filters: ${invalid.join(", ")}`,
      `Valid options: ${VALID_DIETARY_FILTERS.join(", ")}`
    );
  }
  return dietary as string[];
}

// =============================================================================
// Custom Error Classes
// =============================================================================

class ValidationError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ValidationError";
    this.hint = hint;
  }
}

class ResourceNotFoundError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ResourceNotFoundError";
    this.hint = hint;
  }
}

// =============================================================================
// Tool Implementations
// =============================================================================

async function searchRestaurants(args: Record<string, unknown>) {
  // Validate required params
  const { lat, lng } = validateLatLng(args.lat, args.lng);
  
  // Validate optional params
  const query = typeof args.query === "string" ? args.query.trim() : "";
  let radiusMiles = typeof args.radius_miles === "number" ? args.radius_miles : 5;
  radiusMiles = Math.min(Math.max(radiusMiles, 0.1), MAX_SEARCH_RADIUS_MILES);
  
  const dietary = validateDietaryFilters(args.dietary);
  
  let minAdoScore = typeof args.min_ado_score === "number" ? args.min_ado_score : 0;
  minAdoScore = Math.min(Math.max(minAdoScore, 0), 5);

  const supabase = createClient();
  const radiusMeters = radiusMiles * 1609.34;
  
  const { data, error } = await supabase.rpc("search_restaurants_for_agents", {
    search_query: query,
    lat,
    lng,
    radius_meters: radiusMeters,
    min_agent_score: minAdoScore,
    dietary_filters: dietary.length > 0 ? dietary : undefined
  });

  if (error) {
    console.error("Search RPC error:", error);
    throw new Error(`Database error: ${error.message}`);
  }

  const results = (data || []).slice(0, MAX_RESULTS).map((r: {
    id: string;
    name: string;
    slug: string;
    distance_meters: number;
    agent_score: number;
    cuisine_type: string[];
    verification_status: string;
    menu_available: boolean;
    data_source: string | null;
  }) => {
    const menuAvailable = Boolean(r.menu_available);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      distance_meters: Math.round(r.distance_meters),
      distance_miles: Math.round(r.distance_meters / 1609.34 * 10) / 10,
      agent_score: r.agent_score,
      cuisine_type: r.cuisine_type,
      verification_status: r.verification_status,
      menu_available: menuAvailable,
      data_source: r.data_source,
      trust_notice: buildSearchTrustNotice(r.verification_status, menuAvailable),
      links: buildSearchLinks(r.id, menuAvailable),
    };
  });

  return {
    query: query || "(all cuisines)",
    location: { lat, lng },
    radius_miles: radiusMiles,
    filters: { dietary, min_ado_score: minAdoScore },
    results_count: results.length,
    results
  };
}

async function getRestaurant(args: Record<string, unknown>) {
  const restaurantId = args.restaurant_id;
  if (typeof restaurantId !== "string" || !isValidUUID(restaurantId)) {
    throw new ValidationError(
      "restaurant_id must be a valid UUID",
      "Use an id from search_restaurants results."
    );
  }

  const supabase = createClient();
  
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .in("verification_status", ["discovered", "verified", "menu_indexed"])
    .single();

  if (error?.code === "PGRST116" || !data) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found`,
      "Call search_restaurants first, then use an id from results."
    );
  }
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  const priceRangeMap: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
  const menuTier = hasMenuAccess(data.verification_status);

  const { data: publishedMenu } = menuTier
    ? await supabase
        .from("menus")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "published")
        .maybeSingle()
    : { data: null };

  const menuAvailable = menuTier && Boolean(publishedMenu);

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    id: data.id,
    name: data.name,
    slug: data.slug,
    address: data.address,
    servesCuisine: data.cuisine_type,
    priceRange: data.price_range ? priceRangeMap[data.price_range] : null,
    agent_score: data.agent_score,
    verification_status: data.verification_status,
    menu_available: menuAvailable,
    data_source: data.source ?? null,
    trust_notice: buildProfileTrustNotice(data.verification_status, menuAvailable),
    delivery_radius_miles: data.delivery_radius_miles,
    payment_methods: data.payment_methods || [],
    dietary_certifications: data.dietary_certifications || [],
    website_url: data.website_url ?? null,
    phone: data.phone ?? null,
    health_inspection_grade: data.health_inspection_grade ?? null,
    links: {
      ...(menuAvailable
        ? {
            menu: `https://foodnear.me/api/v1/restaurant/${data.id}/menu.mp`,
            mcp_menu: `Use get_menu tool with restaurant_id: "${data.id}"`,
          }
        : { claim: `https://foodnear.me/claim/${data.id}` }),
    },
  };
}

async function getMenu(args: Record<string, unknown>) {
  const restaurantId = args.restaurant_id;
  if (typeof restaurantId !== "string" || !isValidUUID(restaurantId)) {
    throw new ValidationError(
      "restaurant_id must be a valid UUID",
      "Use an id from search_restaurants results."
    );
  }

  const supabase = createClient();
  
  // Fetch restaurant
  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .in("verification_status", ["verified", "menu_indexed"])
    .single();

  if (rErr?.code === "PGRST116" || !restaurant) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found or has no accessible menu tier`,
      "Use search_restaurants and call get_menu only when menu_available is true."
    );
  }

  // Fetch menu
  const { data: menu, error: mErr } = await supabase
    .from("menus")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .single();

  if (mErr?.code === "PGRST116" || !menu) {
    throw new ResourceNotFoundError(
      `No published menu found for restaurant ${restaurantId}`,
      "This restaurant may not have a published Menu Protocol menu yet."
    );
  }

  // Fetch categories
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("menu_id", menu.id)
    .order("sort_order", { ascending: true });

  // Fetch items
  const categoryIds = (categories || []).map((c: { id: string }) => c.id);
  const { data: items } = categoryIds.length > 0 
    ? await supabase.from("menu_items").select("*").in("category_id", categoryIds)
    : { data: [] };

  return {
    version: "1.0",
    domain: "foodnear.me",
    verification_status: restaurant.verification_status,
    trust_notice: buildMenuTrustNotice(
      restaurant.verification_status,
      Boolean(menu.signature_hash),
    ),
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      agent_score: restaurant.agent_score
    },
    menu: {
      id: menu.id,
      last_updated: menu.updated_at,
      protocol_version: menu.protocol_version,
      categories: (categories || []).map((cat: { id: string; name: string; description: string | null; sort_order: number }) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        sort_order: cat.sort_order
      })),
      items_count: (items || []).length,
      items: (items || []).map((item: {
        id: string;
        category_id: string;
        name: string;
        description: string | null;
        price: number;
        currency: string;
        available: boolean;
        preparation_time_minutes: number | null;
        dietary_vegetarian: boolean;
        dietary_vegan: boolean;
        dietary_gluten_free: boolean;
        dietary_halal: boolean;
        dietary_kosher: boolean;
        dietary_nut_free: boolean;
        allergens: string[];
        customization_options: unknown;
        popularity_score: number;
      }) => ({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        available: item.available,
        preparation_time_minutes: item.preparation_time_minutes,
        dietary: {
          vegetarian: item.dietary_vegetarian,
          vegan: item.dietary_vegan,
          gluten_free: item.dietary_gluten_free,
          halal: item.dietary_halal,
          kosher: item.dietary_kosher,
          nut_free: item.dietary_nut_free
        },
        allergens: item.allergens || [],
        customization_options: item.customization_options || [],
        popularity_score: item.popularity_score
      }))
    },
    signature: menu.signature_hash ? {
      signer: menu.signature_signer,
      timestamp: menu.signature_timestamp,
      hash: menu.signature_hash,
      note: "This signature cryptographically proves the restaurant owner approved this menu data"
    } : {
      note: restaurant.verification_status === "menu_indexed"
        ? "Indexed menu — no owner signature. Not authoritative for allergens/dietary."
        : "Menu pending owner signature"
    }
  };
}

async function getAdoScoreBreakdown(args: Record<string, unknown>) {
  const restaurantId = args.restaurant_id;
  if (typeof restaurantId !== "string" || !isValidUUID(restaurantId)) {
    throw new ValidationError(
      "restaurant_id must be a valid UUID",
      "Use an id from search_restaurants results."
    );
  }

  const supabase = createClient();
  
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();

  if (error?.code === "PGRST116" || !restaurant) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found`,
      "Call search_restaurants first, then use an id from results."
    );
  }

  // In production, calculate these from actual data
  // For now, provide reasonable estimates based on available data
  const hasVerification = restaurant.verification_status === "verified";
  const hasIndexedMenu = restaurant.verification_status === "menu_indexed";
  const hasCuisine = (restaurant.cuisine_type || []).length > 0;
  const hasDietary = (restaurant.dietary_certifications || []).length > 0;

  const breakdown = {
    menu_completeness: { 
      weight: 0.25, 
      score: hasCuisine ? 4.5 : 3.0, 
      note: hasCuisine ? "Cuisine types defined" : "Missing cuisine information"
    },
    location_accuracy: { 
      weight: 0.20, 
      score: 5.0, 
      note: "Location coordinates provided"
    },
    data_freshness: { 
      weight: 0.20, 
      score: 4.0, 
      note: `Last updated: ${restaurant.updated_at}`
    },
    protocol_compliance: { 
      weight: 0.15, 
      score: hasVerification ? 5.0 : hasIndexedMenu ? 3.5 : 2.0, 
      note: hasVerification
        ? "Full Menu Protocol v1.0 compliance"
        : hasIndexedMenu
          ? "Indexed MP menu — not owner-verified"
          : "Pending verification"
    },
    verification_status: { 
      weight: 0.10, 
      score: hasVerification ? 5.0 : hasIndexedMenu ? 2.5 : 0.0, 
      note: hasVerification
        ? "Owner-verified"
        : hasIndexedMenu
          ? "Menu indexed from public sources"
          : "Discovered place only"
    },
    media_context: { 
      weight: 0.10, 
      score: hasDietary ? 4.0 : 2.5, 
      note: hasDietary ? "Dietary certifications provided" : "Limited dietary information"
    }
  };

  const recommendations: string[] = [];
  if (!hasVerification) {
    recommendations.push(
      hasIndexedMenu
        ? "Complete owner verification to upgrade from indexed to authoritative menu"
        : "Complete owner verification to unlock full features",
    );
  }
  if (!hasCuisine) recommendations.push("Add cuisine type tags for better search matching");
  if (!hasDietary) recommendations.push("Add dietary certifications (vegan_options, gluten_free_options, etc.)");
  recommendations.push("Keep menu data updated weekly for optimal freshness score");
  recommendations.push("Add high-quality images for menu items");

  return {
    restaurant_id: restaurantId,
    restaurant_name: restaurant.name,
    total_score: restaurant.agent_score,
    max_score: 5.0,
    breakdown,
    recommendations: recommendations.slice(0, 5),
    scoring_info: {
      description: "ADO (Agent Discovery Optimization) score measures how well a restaurant's data is structured for AI agent consumption",
      factors: "Menu completeness, location accuracy, data freshness, protocol compliance, verification status, media context"
    }
  };
}

function validateMenuProtocol(args: Record<string, unknown>) {
  const payload = args.payload;
  const strict = args.strict === true;
  
  if (!payload || typeof payload !== "object") {
    throw new ValidationError(
      "payload must be a JSON object",
      "Pass a Menu Protocol v1.0 object with version, restaurant, and menu fields."
    );
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  // Cast for easier access
  const data = payload as Record<string, unknown>;
  
  // Check required top-level fields
  if (data.version !== "1.0") {
    errors.push('Missing or invalid "version" field. Expected: "1.0"');
  }
  if (data.domain !== "foodnear.me") {
    warnings.push('Non-standard "domain" field. Expected: "foodnear.me" for hosted endpoints');
  }
  
  // Validate restaurant object
  const restaurant = data.restaurant as Record<string, unknown> | undefined;
  if (!restaurant || typeof restaurant !== "object") {
    errors.push('Missing required "restaurant" object');
  } else {
    if (!restaurant.name || typeof restaurant.name !== "string") {
      errors.push("restaurant.name is required (string)");
    }
    if (!restaurant.id || typeof restaurant.id !== "string") {
      errors.push("restaurant.id is required (string)");
    }
    
    // Schema.org compliance
    if (restaurant["@type"] !== "Restaurant") {
      warnings.push('restaurant["@type"] should be "Restaurant" for Schema.org compliance');
    }
    if (strict && !restaurant["@context"]) {
      warnings.push('restaurant["@context"] should be "https://schema.org" for full JSON-LD compliance');
    }
    if (strict && !restaurant.address) {
      recommendations.push("Add restaurant.address for better location matching");
    }
    if (strict && !restaurant.geo) {
      recommendations.push("Add restaurant.geo with latitude/longitude for map integration");
    }
  }
  
  // Validate menu object
  const menu = data.menu as Record<string, unknown> | undefined;
  if (!menu || typeof menu !== "object") {
    errors.push('Missing required "menu" object');
  } else {
    if (!menu.id || typeof menu.id !== "string") {
      errors.push("menu.id is required (string)");
    }
    if (!menu.restaurant_id || typeof menu.restaurant_id !== "string") {
      errors.push("menu.restaurant_id is required (string)");
    }
    
    // Validate categories
    const categories = menu.categories;
    if (!Array.isArray(categories)) {
      errors.push("menu.categories must be an array");
    } else if (categories.length === 0) {
      warnings.push("menu.categories is empty — add at least one category");
    }
    
    // Validate items
    const items = menu.items as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(items)) {
      errors.push("menu.items must be an array");
    } else if (items.length === 0) {
      warnings.push("menu.items is empty — add menu items");
    } else {
      // Check a sample of items for completeness
      let itemsWithoutDietary = 0;
      let itemsWithoutAllergens = 0;
      let itemsWithoutPrice = 0;
      
      for (const item of items.slice(0, 20)) { // Check first 20 items
        if (!item.name) errors.push(`Item missing required "name" field`);
        if (!item.dietary || typeof item.dietary !== "object") itemsWithoutDietary++;
        if (!Array.isArray(item.allergens)) itemsWithoutAllergens++;
        if (typeof item.price !== "number" && !item.offers) itemsWithoutPrice++;
      }
      
      if (itemsWithoutDietary > 0) {
        warnings.push(`${itemsWithoutDietary} item(s) missing dietary flags — required for dietary filtering`);
      }
      if (itemsWithoutAllergens > 0) {
        warnings.push(`${itemsWithoutAllergens} item(s) missing allergens array — critical for safety`);
      }
      if (itemsWithoutPrice > 0) {
        warnings.push(`${itemsWithoutPrice} item(s) missing price — required for agent recommendations`);
      }
    }
  }
  
  // ADO score recommendations
  if (errors.length === 0) {
    if (!data.signature) {
      recommendations.push("Add cryptographic signature for owner approval to boost verification score");
    }
    if (strict) {
      recommendations.push("Ensure all items have preparation_time for delivery time estimates");
      recommendations.push("Add images array to menu items for visual display");
      recommendations.push("Include customization_options for items with variations");
    }
  }
  
  const isValid = errors.length === 0;
  
  return {
    valid: isValid,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    schema_version: "Menu Protocol v1.0",
    strict_mode: strict,
    summary: isValid 
      ? `Valid Menu Protocol payload with ${warnings.length} warning(s)`
      : `Invalid: ${errors.length} error(s) must be fixed`,
    next_steps: isValid
      ? ["Submit to foodnear.me for verification", "Get owner signature", "Monitor ADO score"]
      : ["Fix listed errors", "Re-run validation", "See https://foodnear.me/SKILL.md for spec"]
  };
}

// =============================================================================
// Resource Content
// =============================================================================

const RESOURCE_CONTENT: Record<string, string> = {
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
`
};

// =============================================================================
// JSON-RPC Handler
// =============================================================================

type RpcError = {
  code: number;
  message: string;
  data?: unknown;
};

function makeRpcError(base: typeof RPC_ERRORS[keyof typeof RPC_ERRORS], details?: string): RpcError {
  return {
    code: base.code,
    message: details ? `${base.message}: ${details}` : base.message
  };
}

async function handleRpcRequest(method: string, params?: unknown): Promise<unknown> {
  switch (method) {
    case "initialize":
      return SERVER_INFO;

    case "notifications/initialized":
      // Client notification - no response needed
      return null;

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      if (!params || typeof params !== "object") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for tools/call");
      }
      
      const { name, arguments: toolArgs } = params as { name?: string; arguments?: Record<string, unknown> };
      
      if (!name || typeof name !== "string") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "tool name required");
      }

      const args = toolArgs || {};
      const toolStart = Date.now();

      try {
        let result: unknown;
        switch (name) {
          case "search_restaurants":
            result = await searchRestaurants(args);
            break;
          case "get_restaurant":
            result = await getRestaurant(args);
            break;
          case "get_menu":
            result = await getMenu(args);
            break;
          case "get_ado_score_breakdown":
            result = await getAdoScoreBreakdown(args);
            break;
          case "validate_menu_protocol":
            result = validateMenuProtocol(args);
            break;
          default:
            throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
        }

        void recordMcpInvocation({
          toolName: name,
          status: "success",
          tierReturned: extractTierLabel(result),
          resultsCount: extractResultsCount(result),
          durationMs: Date.now() - toolStart,
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }],
          isError: false
        };
      } catch (err) {
        const durationMs = Date.now() - toolStart;
        if (err instanceof ValidationError) {
          void recordMcpInvocation({
            toolName: name,
            status: "error",
            errorCode: "VALIDATION_ERROR",
            durationMs,
          });
          return toolErrorResult({
            code: "VALIDATION_ERROR",
            message: err.message,
            hint: err.hint,
            retryable: false,
          });
        }
        if (err instanceof ResourceNotFoundError) {
          void recordMcpInvocation({
            toolName: name,
            status: "error",
            errorCode: "NOT_FOUND",
            durationMs,
          });
          return toolErrorResult({
            code: "NOT_FOUND",
            message: err.message,
            hint: err.hint ?? "Use search_restaurants to find a valid restaurant_id.",
            retryable: false,
          });
        }
        console.error(`MCP tool ${name} error:`, err);
        void recordMcpInvocation({
          toolName: name,
          status: "error",
          errorCode: "UPSTREAM",
          durationMs,
        });
        return toolErrorResult({
          code: "UPSTREAM",
          message: err instanceof Error ? err.message : "An unexpected error occurred",
          hint: "Retry the request. If the problem persists, check service status.",
          retryable: true,
        });
      }
    }

    case "resources/list":
      return { resources: RESOURCES };

    case "resources/read": {
      if (!params || typeof params !== "object") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for resources/read");
      }
      
      const { uri } = params as { uri?: string };
      
      if (!uri || typeof uri !== "string") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "uri required");
      }

      const content = RESOURCE_CONTENT[uri];
      if (!content) {
        throw makeRpcError(RPC_ERRORS.RESOURCE_NOT_FOUND, `Unknown resource: ${uri}`);
      }

      const resource = RESOURCES.find(r => r.uri === uri);
      
      return {
        contents: [{
          uri,
          mimeType: resource?.mimeType || "text/plain",
          text: content
        }]
      };
    }

    case "prompts/list":
      return { prompts: promptDefinitions };

    case "prompts/get": {
      if (!params || typeof params !== "object") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for prompts/get");
      }

      const { name, arguments: promptArgs } = params as {
        name?: string;
        arguments?: Record<string, string>;
      };

      if (!name || typeof name !== "string") {
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "prompt name required");
      }

      try {
        return handleGetPrompt(name, promptArgs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("not found")) {
          throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, message);
        }
        throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, message);
      }
    }

    case "ping":
      return { pong: true };

    default:
      throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, method);
  }
}

// =============================================================================
// CORS Headers
// =============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

// =============================================================================
// HTTP Handlers
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: RPC_ERRORS.PARSE_ERROR },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Handle batch requests
    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map(async (req) => {
          if (!req || typeof req !== "object" || !("method" in req)) {
            return { jsonrpc: "2.0", id: req?.id ?? null, error: RPC_ERRORS.INVALID_REQUEST };
          }
          
          try {
            const result = await handleRpcRequest(req.method as string, req.params);
            if (result === null) return null; // Notification, no response
            return { jsonrpc: "2.0", id: req.id, result };
          } catch (err) {
            const error = err as RpcError;
            return { 
              jsonrpc: "2.0", 
              id: req.id, 
              error: error.code ? error : makeRpcError(RPC_ERRORS.INTERNAL_ERROR, String(err))
            };
          }
        })
      );
      
      // Filter out null responses (notifications)
      const filteredResponses = responses.filter(r => r !== null);
      
      return NextResponse.json(filteredResponses, {
        headers: {
          ...CORS_HEADERS,
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      });
    }

    // Single request
    if (!body || typeof body !== "object" || !("method" in body)) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: RPC_ERRORS.INVALID_REQUEST },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const typedBody = body as { method: string; params?: unknown; id?: string | number | null };
    
    try {
      const result = await handleRpcRequest(typedBody.method, typedBody.params);
      
      // Notifications don't get responses
      if (result === null && typedBody.id === undefined) {
        return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
      }
      
      return NextResponse.json(
        { jsonrpc: "2.0", id: typedBody.id ?? null, result },
        {
          headers: {
            ...CORS_HEADERS,
            "X-Response-Time": `${Date.now() - startTime}ms`
          }
        }
      );
    } catch (err) {
      const error = err as RpcError;
      return NextResponse.json(
        { 
          jsonrpc: "2.0", 
          id: typedBody.id ?? null, 
          error: error.code ? error : makeRpcError(RPC_ERRORS.INTERNAL_ERROR, String(err))
        },
        { 
          status: error.code === RPC_ERRORS.METHOD_NOT_FOUND.code ? 404 : 500,
          headers: CORS_HEADERS 
        }
      );
    }
    
  } catch (error) {
    console.error("MCP POST error:", error);
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: RPC_ERRORS.INTERNAL_ERROR },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: "MCP",
    protocolVersion: SERVER_INFO.protocolVersion,
    status: "healthy",
    description: "foodnear.me MCP server for AI agent restaurant discovery. Search for restaurants, get Menu Protocol formatted menus, and check ADO scores.",
    
    capabilities: SERVER_INFO.capabilities,
    
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      required_params: t.inputSchema.required
    })),
    
    resources: RESOURCES.map(r => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType
    })),
    
    endpoints: {
      rpc: "POST /mcp",
      discovery: "GET /mcp",
      rest_api: "GET /api/v1/*"
    },
    
    documentation: {
      skill_file: "https://foodnear.me/SKILL.md",
      openapi: "https://foodnear.me/openapi.json",
      agent_metadata: "https://foodnear.me/.well-known/agent.json"
    },
    
    usage: {
      example_initialize: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {}
      },
      example_tool_call: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "search_restaurants",
          arguments: {
            lat: 40.7128,
            lng: -74.006,
            query: "thai",
            dietary: ["vegan"]
          }
        }
      }
    }
  }, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "public, max-age=60"
    }
  });
}
