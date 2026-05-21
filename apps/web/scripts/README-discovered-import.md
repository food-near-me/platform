# Discovered layer import

Populate `verification_status = discovered` restaurants from public data.

**Regions config:** `scripts/data/import-regions.json` (55 regions: tiers 1–3 + NYC boroughs; `status` + optional `importedAt` when `--update-status` succeeds)

## Prerequisites

1. Supabase env in `apps/web/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (recommended for import)

2. Apply migrations:

```bash
# From repo root — SQL Editor or:
npm run db:migrate:discovered-layer
npm run db:migrate:import-dedup   # M3 spatial dedup RPC + import_runs
```

## Commands

```bash
cd apps/web

# List all regions (bbox, tier, data sources)
npm run db:import:discovered:list

# Batch: remaining NYC boroughs (Bronx + Staten Island; skips already imported)
npm run db:import:discovered:nyc-boroughs

# Batch: custom list
npm run db:import:discovered:batch -- --regions=bronx,staten_island --update-status
npm run db:import:discovered:batch -- --preset=nyc-boroughs --dry-run
npm run db:import:discovered:batch -- --preset=tier1-osm --pending-only
npm run db:import:discovered:batch -- --preset=tier2-osm --pending-only --dry-run
npm run db:import:discovered:tier2
npm run db:import:discovered:batch -- --preset=tier3-osm --pending-only --dry-run
npm run db:import:discovered:tier3

# Default: Williamsburg
npm run db:import:discovered

# Brooklyn borough (already run ~12k rows)
npm run db:import:discovered:brooklyn

# Other NYC boroughs
npm run db:import:discovered:manhattan
npx tsx scripts/import-discovered.ts --region=queens
npx tsx scripts/import-discovered.ts --region=bronx --dry-run

# Tier 1 metros (OSM only until local open-data connectors exist)
npx tsx scripts/import-discovered.ts --region=la --dry-run
npx tsx scripts/import-discovered.ts --region=chicago

# Flags
npx tsx scripts/import-discovered.ts --region=manhattan --dry-run   # no writes
npx tsx scripts/import-discovered.ts --region=manhattan --batch-size=250
npx tsx scripts/import-discovered.ts --region=brooklyn --osm-only
npx tsx scripts/import-discovered.ts --region=manhattan --nyc-only
npx tsx scripts/import-discovered.ts --help
```

## Data sources by region

| Source | `dataSources` in JSON | Notes |
|--------|----------------------|--------|
| OpenStreetMap (Overpass) | `osm` | All regions |
| NYC restaurant inspections | `nyc_open_data` | NYC boroughs + `nyc` only |

Non-NYC metros import **OSM only** until municipal feeds are added per region.

## Behavior

- Never overwrites `verified` or `menu_indexed` rows
- Idempotent on `(source, source_record_id)`
- **M3 dedup:** source-id map in memory; spatial match via PostGIS `find_nearby_for_import` (80 m + name similarity)
- **M5 extended OSM pass** (default): second Overpass query for `restaurant=yes` and hotel restaurants; skip with `--no-osm-extended`
- Overpass **retries with backoff** on 429/502/504
- Cross-source **enrich:** NYC inspection grade on OSM rows; OSM website/phone on NYC rows
- Progress every 100 rows; real imports logged to `import_runs`
- NYC Open Data filtered by region **bbox** (not Brooklyn-only)

## Performance

Inserts run in **batches of 200** rows (configurable via `--batch-size=250`). Idempotency relies on unique `(source, source_record_id)`; on conflict the batch splits and retries.

Large regions (Brooklyn, Manhattan, `nyc`) should complete in **under ~30 minutes** vs hours with row-by-row inserts. See [`data-us-expansion-roadmap.md`](../../../../docs/Food%20Near%20Me/data-us-expansion-roadmap.md).

## Agent search

`search_restaurants_for_agents` returns **verified first**, then **discovered**. `menu_available` is true only for verified + published menu.

Claim: `https://foodnear.me/claim/{restaurant_id}`

## Attribution

© OpenStreetMap contributors ([ODbL](https://www.openstreetmap.org/copyright)); NYC Open Data where applicable.
