# Migration Guide: Monolithic to Modular Routes

## Current Status
- ✅ Shared utilities created (`lib/`)
- ✅ Route structure created (`routes/`)
- ✅ Health and Admin routes extracted
- ⏳ Remaining 265 routes to extract

## Quick Migration Steps

### Option 1: Gradual Migration (Recommended)
1. Keep `index.tsx` as-is (working)
2. Create route modules incrementally
3. Mount new routes in `index.new.tsx`
4. Test each module
5. Once all routes migrated, replace `index.tsx` with `index.new.tsx`

### Option 2: Automated Extraction
1. Run the extraction script:
   ```bash
   deno run --allow-read --allow-write scripts/extract-routes.ts
   ```
2. Review `routes-map.json` for route grouping
3. Create route modules based on the grouping
4. Extract route handlers from `index.tsx`

## Route Module Template

```typescript
/**
 * [Domain] Routes
 */

import { Hono } from "npm:hono";
import { getSupabaseAdmin } from "../lib/supabase.tsx";
// Import other dependencies

const [domain] = new Hono();
const supabaseAdmin = getSupabaseAdmin();

// Route handlers
[domain].get("/path", async (c) => {
  // Handler code
});

export default [domain];
```

## Import Pattern

In `index.new.tsx`:
```typescript
import [domain] from "./routes/[domain].tsx";
app.route(`${BASE_PATH}/[prefix]`, [domain]);
```

## Testing

After creating each route module:
1. Test endpoints manually
2. Verify all imports work
3. Check for missing dependencies
4. Ensure API compatibility

## Notes

- All routes must maintain the `/make-server-0bdba248` prefix
- Keep all existing functionality intact
- Use shared utilities from `lib/`
- Maintain error handling patterns

