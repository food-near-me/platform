#!/usr/bin/env npx tsx
/**
 * Food Near Me — Beta Seed Data
 * 
 * Seeds 5-10 verified restaurants in the beachhead neighborhood (Williamsburg, Brooklyn).
 * These are fictional but realistic restaurants for beta testing the MCP tools.
 * 
 * Usage:
 *   npx tsx scripts/seed-beta-data.ts
 * 
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type SeedRestaurant = {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  address: string;
  cuisine_type: string[];
  price_range: number;
  payment_methods: string[];
  dietary_certifications: string[];
  categories: {
    name: string;
    items: {
      name: string;
      description: string;
      price: number;
      dietary_vegetarian?: boolean;
      dietary_vegan?: boolean;
      dietary_gluten_free?: boolean;
      allergens?: string[];
      prep_time?: number;
    }[];
  }[];
};

const SEED_RESTAURANTS: SeedRestaurant[] = [
  {
    name: "Wythe Ramen",
    slug: "wythe-ramen-williamsburg",
    lat: 40.7178,
    lng: -73.9571,
    address: "123 Wythe Ave, Brooklyn, NY 11249",
    cuisine_type: ["japanese", "ramen", "noodles"],
    price_range: 2,
    payment_methods: ["credit_card", "apple_pay", "cash"],
    dietary_certifications: [],
    categories: [
      {
        name: "Ramen",
        items: [
          { name: "Tonkotsu Ramen", description: "Rich pork broth with chashu, soft-boiled egg, nori, scallions", price: 17.00, prep_time: 15, allergens: ["soy", "wheat", "egg"] },
          { name: "Spicy Miso Ramen", description: "Miso broth with chili oil, ground pork, corn, bean sprouts", price: 18.00, prep_time: 15, allergens: ["soy", "wheat", "sesame"] },
          { name: "Veggie Shio Ramen", description: "Light vegetable broth with tofu, bok choy, mushrooms", price: 16.00, dietary_vegetarian: true, dietary_vegan: true, prep_time: 12, allergens: ["soy", "wheat"] },
        ],
      },
      {
        name: "Appetizers",
        items: [
          { name: "Pork Gyoza (6pc)", description: "Pan-fried dumplings with dipping sauce", price: 9.00, prep_time: 10, allergens: ["wheat", "soy"] },
          { name: "Edamame", description: "Steamed soybeans with sea salt", price: 6.00, dietary_vegan: true, dietary_gluten_free: true, prep_time: 5, allergens: ["soy"] },
        ],
      },
    ],
  },
  {
    name: "Bedford Pizza Co.",
    slug: "bedford-pizza-williamsburg",
    lat: 40.7143,
    lng: -73.9625,
    address: "456 Bedford Ave, Brooklyn, NY 11211",
    cuisine_type: ["italian", "pizza", "american"],
    price_range: 2,
    payment_methods: ["credit_card", "cash", "venmo"],
    dietary_certifications: [],
    categories: [
      {
        name: "Pizzas",
        items: [
          { name: "Margherita", description: "San Marzano tomatoes, fresh mozzarella, basil, olive oil", price: 18.00, dietary_vegetarian: true, prep_time: 18, allergens: ["wheat", "dairy"] },
          { name: "Pepperoni", description: "Cup & char pepperoni, mozzarella, tomato sauce", price: 22.00, prep_time: 18, allergens: ["wheat", "dairy"] },
          { name: "Funghi", description: "Mixed wild mushrooms, truffle oil, fontina, arugula", price: 24.00, dietary_vegetarian: true, prep_time: 20, allergens: ["wheat", "dairy"] },
          { name: "Vegan Garden", description: "Cashew ricotta, seasonal vegetables, tomato sauce, gluten-free crust available", price: 21.00, dietary_vegan: true, prep_time: 20, allergens: ["tree_nuts"] },
        ],
      },
      {
        name: "Salads",
        items: [
          { name: "Caesar", description: "Romaine, parmesan, croutons, house caesar dressing", price: 12.00, dietary_vegetarian: true, prep_time: 8, allergens: ["dairy", "wheat", "egg", "fish"] },
          { name: "Arugula & Pear", description: "Baby arugula, sliced pear, gorgonzola, candied walnuts", price: 14.00, dietary_vegetarian: true, dietary_gluten_free: true, prep_time: 8, allergens: ["dairy", "tree_nuts"] },
        ],
      },
    ],
  },
  {
    name: "Havana Nights",
    slug: "havana-nights-williamsburg",
    lat: 40.7102,
    lng: -73.9578,
    address: "789 Grand St, Brooklyn, NY 11211",
    cuisine_type: ["cuban", "caribbean", "latin"],
    price_range: 3,
    payment_methods: ["credit_card", "apple_pay"],
    dietary_certifications: [],
    categories: [
      {
        name: "Entrees",
        items: [
          { name: "Ropa Vieja", description: "Slow-braised shredded beef in tomato sofrito, served with rice & beans", price: 24.00, dietary_gluten_free: true, prep_time: 25 },
          { name: "Lechón Asado", description: "Citrus-marinated roast pork, mojo sauce, yuca, plantains", price: 26.00, dietary_gluten_free: true, prep_time: 25 },
          { name: "Camarones al Ajillo", description: "Garlic shrimp sautéed in white wine, served over yellow rice", price: 28.00, dietary_gluten_free: true, prep_time: 20, allergens: ["shellfish"] },
        ],
      },
      {
        name: "Appetizers",
        items: [
          { name: "Tostones con Mojo", description: "Crispy fried plantains with garlic mojo dipping sauce", price: 9.00, dietary_vegan: true, dietary_gluten_free: true, prep_time: 10 },
          { name: "Empanadas (3pc)", description: "Choice of beef, chicken, or black bean & cheese", price: 12.00, prep_time: 12, allergens: ["wheat"] },
        ],
      },
    ],
  },
  {
    name: "Green Machine Bowls",
    slug: "green-machine-bowls-williamsburg",
    lat: 40.7159,
    lng: -73.9548,
    address: "234 N 6th St, Brooklyn, NY 11249",
    cuisine_type: ["healthy", "vegan", "bowls", "salads"],
    price_range: 2,
    payment_methods: ["credit_card", "apple_pay", "google_pay"],
    dietary_certifications: ["vegan_friendly", "gluten_free_options"],
    categories: [
      {
        name: "Bowls",
        items: [
          { name: "Buddha Bowl", description: "Quinoa, roasted chickpeas, sweet potato, tahini dressing", price: 15.00, dietary_vegan: true, dietary_gluten_free: true, prep_time: 10 },
          { name: "Protein Power", description: "Brown rice, grilled chicken, avocado, black beans, cilantro lime", price: 17.00, dietary_gluten_free: true, prep_time: 12 },
          { name: "Mediterranean", description: "Farro, falafel, hummus, cucumber, tomato, za'atar", price: 16.00, dietary_vegan: true, prep_time: 10, allergens: ["wheat", "sesame"] },
        ],
      },
      {
        name: "Smoothies",
        items: [
          { name: "Green Goddess", description: "Spinach, banana, mango, almond milk, chia seeds", price: 9.00, dietary_vegan: true, dietary_gluten_free: true, prep_time: 5, allergens: ["tree_nuts"] },
          { name: "Berry Blast", description: "Mixed berries, oat milk, hemp seeds, honey", price: 9.00, dietary_vegetarian: true, dietary_gluten_free: true, prep_time: 5 },
        ],
      },
    ],
  },
  {
    name: "Samosa House",
    slug: "samosa-house-williamsburg",
    lat: 40.7121,
    lng: -73.9612,
    address: "567 Driggs Ave, Brooklyn, NY 11211",
    cuisine_type: ["indian", "vegetarian", "south_asian"],
    price_range: 1,
    payment_methods: ["credit_card", "cash"],
    dietary_certifications: ["vegetarian"],
    categories: [
      {
        name: "Samosas & Snacks",
        items: [
          { name: "Vegetable Samosa (2pc)", description: "Crispy pastry filled with spiced potatoes and peas", price: 5.00, dietary_vegetarian: true, dietary_vegan: true, prep_time: 8, allergens: ["wheat"] },
          { name: "Paneer Samosa (2pc)", description: "Filled with spiced paneer cheese and spinach", price: 6.00, dietary_vegetarian: true, prep_time: 8, allergens: ["wheat", "dairy"] },
          { name: "Samosa Chaat", description: "Crushed samosas with chickpeas, yogurt, tamarind, mint chutney", price: 8.00, dietary_vegetarian: true, prep_time: 10, allergens: ["wheat", "dairy"] },
        ],
      },
      {
        name: "Thali Plates",
        items: [
          { name: "Vegetarian Thali", description: "Dal, sabzi, rice, raita, papad, pickle", price: 14.00, dietary_vegetarian: true, dietary_gluten_free: true, prep_time: 15, allergens: ["dairy"] },
          { name: "Vegan Thali", description: "Chana masala, aloo gobi, rice, salad, pickle", price: 14.00, dietary_vegan: true, dietary_gluten_free: true, prep_time: 15 },
        ],
      },
    ],
  },
  {
    name: "Brisket & Co.",
    slug: "brisket-and-co-williamsburg",
    lat: 40.7088,
    lng: -73.9592,
    address: "890 Metropolitan Ave, Brooklyn, NY 11211",
    cuisine_type: ["bbq", "american", "smokehouse"],
    price_range: 3,
    payment_methods: ["credit_card", "apple_pay"],
    dietary_certifications: [],
    categories: [
      {
        name: "Smoked Meats",
        items: [
          { name: "Brisket Plate", description: "12-hour smoked brisket, two sides, pickles, white bread", price: 28.00, dietary_gluten_free: false, prep_time: 10, allergens: ["wheat"] },
          { name: "Pulled Pork Plate", description: "Slow-smoked pork shoulder, carolina vinegar sauce, two sides", price: 22.00, prep_time: 10, allergens: ["wheat"] },
          { name: "Half Rack Ribs", description: "St. Louis style ribs, dry rub, house BBQ sauce", price: 26.00, dietary_gluten_free: true, prep_time: 10 },
        ],
      },
      {
        name: "Sides",
        items: [
          { name: "Mac & Cheese", description: "Creamy three-cheese blend, bread crumb topping", price: 7.00, dietary_vegetarian: true, prep_time: 5, allergens: ["dairy", "wheat"] },
          { name: "Collard Greens", description: "Slow-cooked with smoked ham hock", price: 6.00, dietary_gluten_free: true, prep_time: 5 },
          { name: "Coleslaw", description: "Classic creamy slaw", price: 5.00, dietary_vegetarian: true, dietary_gluten_free: true, prep_time: 2, allergens: ["egg"] },
        ],
      },
    ],
  },
];

function createPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function seed() {
  console.log("🌱 Seeding beta restaurants for Williamsburg, Brooklyn...\n");

  let totalRestaurants = 0;
  let totalItems = 0;

  for (const r of SEED_RESTAURANTS) {
    console.log(`  → ${r.name}`);

    const { data: existingRestaurant } = await supabase
      .from("restaurants")
      .select("id")
      .eq("slug", r.slug)
      .single();

    if (existingRestaurant) {
      console.log(`    ⏭  Already exists, skipping`);
      continue;
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .insert({
        name: r.name,
        slug: r.slug,
        location: createPoint(r.lng, r.lat),
        address: r.address,
        cuisine_type: r.cuisine_type,
        price_range: r.price_range,
        payment_methods: r.payment_methods,
        dietary_certifications: r.dietary_certifications,
        agent_score: 4.0 + Math.random() * 0.8,
        verification_status: "verified",
      })
      .select()
      .single();

    if (restaurantError) {
      console.error(`    ✗ Error inserting restaurant: ${restaurantError.message}`);
      continue;
    }

    const { data: menu, error: menuError } = await supabase
      .from("menus")
      .insert({
        restaurant_id: restaurant.id,
        protocol_version: "1.0",
        status: "published",
      })
      .select()
      .single();

    if (menuError) {
      console.error(`    ✗ Error creating menu: ${menuError.message}`);
      continue;
    }

    for (let catIdx = 0; catIdx < r.categories.length; catIdx++) {
      const cat = r.categories[catIdx];

      const { data: category, error: categoryError } = await supabase
        .from("menu_categories")
        .insert({
          menu_id: menu.id,
          name: cat.name,
          sort_order: catIdx,
        })
        .select()
        .single();

      if (categoryError) {
        console.error(`    ✗ Error creating category: ${categoryError.message}`);
        continue;
      }

      for (const item of cat.items) {
        const { error: itemError } = await supabase.from("menu_items").insert({
          category_id: category.id,
          name: item.name,
          description: item.description,
          price: item.price,
          currency: "USD",
          available: true,
          preparation_time_minutes: item.prep_time ?? 15,
          dietary_vegetarian: item.dietary_vegetarian ?? false,
          dietary_vegan: item.dietary_vegan ?? false,
          dietary_gluten_free: item.dietary_gluten_free ?? false,
          dietary_halal: false,
          dietary_kosher: false,
          dietary_nut_free: !(item.allergens?.includes("tree_nuts") || item.allergens?.includes("peanuts")),
          allergens: item.allergens ?? [],
          popularity_score: 3.0 + Math.random() * 2.0,
        });

        if (itemError) {
          console.error(`    ✗ Error creating item ${item.name}: ${itemError.message}`);
        } else {
          totalItems++;
        }
      }
    }

    totalRestaurants++;
    console.log(`    ✓ Created with ${r.categories.reduce((acc, c) => acc + c.items.length, 0)} menu items`);
  }

  console.log(`\n✅ Seeding complete: ${totalRestaurants} restaurants, ${totalItems} menu items`);
  console.log(`\n📍 Beachhead: Williamsburg, Brooklyn (40.7143, -73.9625)`);
  console.log(`\n🧪 Test with: npx tsx scripts/mcp-flow-test.ts`);
}

seed().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
