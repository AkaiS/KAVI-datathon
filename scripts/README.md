# Scripts

Scripts are grouped by what they work on. Run them from the repo root. All of them need Node 22.18 or later and have no npm dependencies.

| Folder | Script | What it does | Run with |
|---|---|---|---|
| `database/` | `import-csv.mjs` | Loads `data/NYPL Connections Resources.csv` into the Supabase `resources` table. Needs `SUPABASE_SECRET_KEY` in `.env`. `--dry-run` checks the file without inserting; `--replace` deletes the existing rows first. | `npm run import -- --dry-run` |
| `web/` | `dev.mjs` | Writes `config.js` from `.env` and serves the repo on http://localhost:5173, so `index.html` can reach Supabase. | `npm run dev` |
| `osm/` | `osm_resources_nyc.ts` | Downloads NYC service locations from OpenStreetMap into `data/nyc_osm_resources.csv` and `.geojson`. | `npm run osm` |
| `osm/` | `map.html` | Map preview of the OSM layer. | see [`osm/README.md`](osm/README.md) |

Every script reads from and writes to the top-level [`data/`](../data) folder. Database schema changes go in [`supabase/migrations/`](../supabase/migrations), not here.

When you add a script, put it in the folder for what it works on (or a new folder if none fits) and add a row to this table.
