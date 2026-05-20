/**
 * MCP prompt definitions and handlers for foodnear.me.
 */

export type PromptDefinition = {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
};

export const promptDefinitions: PromptDefinition[] = [
  {
    name: "find_dinner_near_me",
    description:
      "Find verified restaurants near a location and retrieve a Menu Protocol menu for the best match.",
    arguments: [
      {
        name: "location",
        description:
          "Place name, neighborhood, or address (e.g. 'Williamsburg Brooklyn'). Geocode to lat/lng before calling search_restaurants.",
        required: true,
      },
      {
        name: "cuisine",
        description: "Optional cuisine or food type (e.g. 'thai', 'pizza', 'sushi').",
        required: false,
      },
      {
        name: "dietary",
        description:
          "Optional dietary needs, comma-separated (vegan, vegetarian, gluten_free, halal, kosher, nut_free, dairy_free, low_carb, keto).",
        required: false,
      },
    ],
  },
  {
    name: "dietary_constrained_menu",
    description:
      "Load a restaurant menu and filter items using explicit Menu Protocol dietary flags and allergen arrays — never guess from dish names.",
    arguments: [
      {
        name: "restaurant_id",
        description: "Restaurant UUID from search_restaurants.",
        required: true,
      },
      {
        name: "restrictions",
        description:
          "Dietary requirements and allergens to avoid, described clearly (e.g. 'vegan, nut allergy, gluten free').",
        required: true,
      },
    ],
  },
  {
    name: "validate_my_menu",
    description:
      "Validate a Menu Protocol v1.0 JSON payload before publish and summarize fixes to improve ADO score.",
    arguments: [
      {
        name: "strict",
        description: "Set to 'true' to check optional fields and Schema.org best practices.",
        required: false,
      },
    ],
  },
];

export const EXPECTED_MCP_PROMPTS = promptDefinitions.map((p) => p.name);

export type PromptMessage = {
  role: string;
  content: { type: string; text: string };
};

export type GetPromptResult = {
  messages: PromptMessage[];
};

function parseDietaryList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export function handleGetPrompt(
  name: string,
  args?: Record<string, string>
): GetPromptResult {
  if (name === "find_dinner_near_me") {
    const location = args?.location?.trim() || "near me";
    const cuisine = args?.cuisine?.trim();
    const dietary = parseDietaryList(args?.dietary);
    const dietaryLine =
      dietary.length > 0
        ? ` Dietary filters: ${dietary.join(", ")}.`
        : "";
    const cuisineLine = cuisine ? ` Cuisine preference: ${cuisine}.` : "";

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me find dinner near ${location}.${cuisineLine}${dietaryLine}

Use foodnear.me MCP tools only — do not invent menus.

1. Resolve ${location} to latitude and longitude if I did not provide coordinates.
2. Call search_restaurants with lat, lng${cuisine ? `, query "${cuisine}"` : ""}${dietary.length > 0 ? `, dietary: ${JSON.stringify(dietary)}` : ""}.
3. Pick the best verified result (prefer higher agent_score / ADO).
4. Call get_menu for that restaurant_id.
5. Summarize options with prices; cite dietary.* booleans and allergens[] for each item — do not infer from dish titles.

Beta note: seed data is strongest around NYC (e.g. 40.7128, -74.006).`,
          },
        },
      ],
    };
  }

  if (name === "dietary_constrained_menu") {
    const restaurantId = args?.restaurant_id?.trim();
    const restrictions = args?.restrictions?.trim() || "my dietary restrictions";

    if (!restaurantId) {
      throw new Error("restaurant_id is required for dietary_constrained_menu");
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I need a menu filtered for: ${restrictions}.

Restaurant id: ${restaurantId}

1. Call get_menu with this restaurant_id.
2. For each item, use only explicit Menu Protocol fields:
   - dietary.vegetarian, dietary.vegan, dietary.gluten_free, dietary.halal, dietary.kosher, dietary.nut_free, etc.
   - allergens[] array
3. Do NOT guess dietary suitability from the dish name.
4. List safe items with price and preparation time; call out items that are unclear or missing allergen data.
5. If the menu is empty or missing flags, say so and suggest get_ado_score_breakdown for improvement ideas.`,
          },
        },
      ],
    };
  }

  if (name === "validate_my_menu") {
    const strict = args?.strict === "true" || args?.strict === "1";

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I have a Menu Protocol JSON payload to validate before publishing on foodnear.me.

1. Ask me for the payload if I have not provided it yet.
2. Call validate_menu_protocol with payload and strict: ${strict}.
3. If valid is false, list each error and recommendation in plain language.
4. If valid is true, summarize remaining warnings and ADO improvement tips.
5. Remind me that only owner-verified, published menus appear in search_restaurants results.`,
          },
        },
      ],
    };
  }

  throw new Error(`Prompt not found: ${name}`);
}
