import { z } from "zod";

// Base Schema.org types
export const SchemaOrgContext = z.literal("https://schema.org");

export const SchemaOrgRestaurant = z.object({
  "@context": SchemaOrgContext.optional(),
  "@type": z.literal("Restaurant"),
  name: z.string(),
  address: z.object({
    "@type": z.literal("PostalAddress"),
    streetAddress: z.string(),
    addressLocality: z.string(),
    addressRegion: z.string(),
    postalCode: z.string(),
    addressCountry: z.string(),
  }).optional(),
  geo: z.object({
    "@type": z.literal("GeoCoordinates"),
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  telephone: z.string().optional(),
  url: z.string().url().optional(),
  servesCuisine: z.union([z.string(), z.array(z.string())]).optional(),
  priceRange: z.string().optional(),
});

export const SchemaOrgMenuItem = z.object({
  "@type": z.literal("MenuItem"),
  name: z.string(),
  description: z.string().optional(),
  offers: z.object({
    "@type": z.literal("Offer"),
    price: z.number(),
    priceCurrency: z.string(),
    availability: z.enum([
      "https://schema.org/InStock",
      "https://schema.org/OutOfStock",
      "https://schema.org/PreOrder"
    ]).optional(),
  }).optional(),
  suitableForDiet: z.array(z.string()).optional(),
});

// Menu Protocol Extensions
export const DietaryFlagsSchema = z.object({
  vegetarian: z.boolean().default(false),
  vegan: z.boolean().default(false),
  gluten_free: z.boolean().default(false),
  nut_free: z.boolean().default(false),
  dairy_free: z.boolean().default(false),
  low_carb: z.boolean().default(false),
  keto: z.boolean().default(false),
  halal: z.boolean().default(false),
  kosher: z.boolean().default(false),
});

export const CustomizationOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  price_adjustment: z.number(),
  dietary_change: DietaryFlagsSchema.partial().optional(),
});

// Extended MenuItem for Menu Protocol
export const MPMenuItemSchema = SchemaOrgMenuItem.extend({
  id: z.string(),
  category_id: z.string(),
  available: z.boolean().default(true),
  preparation_time: z.number().optional(), // in minutes
  dietary: DietaryFlagsSchema,
  allergens: z.array(z.string()).default([]),
  customization_options: z.array(CustomizationOptionSchema).default([]),
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional()
  })).default([]),
  popularity_score: z.number().min(0).max(5).optional(),
  spice_level: z.number().min(0).max(5).optional(),
  calories: z.number().optional(),
  serving_size: z.string().optional(),
});

export const MPCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sort_order: z.number().default(0),
});

export const MPRestaurantSchema = SchemaOrgRestaurant.extend({
  id: z.string(),
  slug: z.string(),
  delivery_radius: z.number().optional(), // in miles
  payment_methods: z.array(z.string()).default([]),
  agent_score: z.number().min(0).max(5).optional(),
  dietary_certifications: z.array(z.string()).default([]),
  
  // Cryptographic signature for liability mitigation
  signature: z.object({
    signer: z.string(), // Wallet address or user ID
    timestamp: z.string().datetime(),
    hash: z.string(), // Hash of the menu payload
  }).optional(),
});

export const MenuProtocolSchema = z.object({
  version: z.literal("1.0"),
  domain: z.literal("foodnear.me"),
  restaurant: MPRestaurantSchema,
  menu: z.object({
    id: z.string(),
    restaurant_id: z.string(),
    last_updated: z.string().datetime(),
    language: z.string().default("en"),
    currency: z.string().default("USD"),
    categories: z.array(MPCategorySchema),
    items: z.array(MPMenuItemSchema),
  })
});

export type MPMenuItem = z.infer<typeof MPMenuItemSchema>;
export type MPRestaurant = z.infer<typeof MPRestaurantSchema>;
export type MenuProtocol = z.infer<typeof MenuProtocolSchema>;
