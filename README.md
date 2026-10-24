# KAVI-datathon

Code and data for the KAVI datathon (October 23–25): a searchable map and directory of community resources for KAVI Brooklyn and other NYC community violence intervention (CVI) organizations.

**What we're building and why:** see the product requirements document, [PRD.md](PRD.md).
**This README:** where the data lives and how to get to it.

## Repository layout

```
PRD.md          product requirements (what to build and why)
data/           every dataset, in one place
supabase/       database schema (migrations) for the Supabase project
scripts/        scripts grouped by function; see scripts/README.md
  database/       load data into Supabase
  web/            local server for index.html
  osm/            OpenStreetMap layer and its map preview
index.html      resource directory page (search + category filter)
```

## Accessing the resources

### 1. Data files: `data/`

| File | What it is | Rows | Source |
|---|---|---|---|
| `NYPL Connections Resources.csv` | The Connections Guide extracted from the PDF, one row per resource. This is what the Supabase `resources` table is loaded from. | 760 | Project Google Drive |
| `NYPLConnections_NoMatch.csv` | Connections Guide rows that could not be geocoded (no usable address, or hotlines). Encoded as Windows-1252, not UTF-8. | 45 | Project Google Drive |
| `nyc_osm_resources.csv` / `.geojson` | NYC service locations from OpenStreetMap, with category, borough and coordinates. Credit "© OpenStreetMap contributors" wherever it is shown. | 1,104 | `npm run osm`; see [scripts/osm/README.md](scripts/osm/README.md) |

The originals, including the Connections Guide PDF, are in the [project Google Drive folder](https://drive.google.com/drive/folders/1f5QhMlY8pYgyomWSzPgYTBdnUUcBbUJS).

### 2. ArcGIS layers

The geocoded layers are published on ArcGIS Online as hosted feature layers. Shapefiles can be downloaded from each layer's service page.

- [NYPL Connections Geocoded](https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/NYPL_Connections_merge/FeatureServer) (primary layer, with coordinates)
- [Public Libraries](https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/public_libraries_points/FeatureServer)
- [Health Facilities](https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/health_facilities_points/FeatureServer)
- [Cooling Centers](https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/Cooling_Sites_points/FeatureServer)

### 3. Supabase database

The Connections Guide is loaded into the `resources` table of a Supabase project in the **KAVI** Supabase organization. Its columns match `NYPL Connections Resources.csv` (see [supabase/migrations/](supabase/migrations)).

**Getting access.** Ask a teammate who is in the KAVI Supabase organization for:

| What | Where they find it | Who gets it |
|---|---|---|
| Project URL | Supabase dashboard → Project Settings → API Keys | anyone on the team |
| Publishable key (`sb_publishable_…`) | same page | anyone on the team; it can only read `resources` |
| Secret key (`sb_secret_…`) | same page | only whoever imports data; share it through a password manager, never in chat or in code |
| Dashboard access | Organization settings → Team → Invite | anyone who needs to edit rows or run SQL |

**Reading the data without running any code:** with the URL and publishable key you can query the REST API directly, for example:

```bash
curl "$SUPABASE_URL/rest/v1/resources?category=eq.Housing&select=organization_name,phone_number" -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

**Loading data into a new project:** `supabase link --project-ref <ref>`, `supabase db push`, then `npm run import` (uses `data/NYPL Connections Resources.csv` and `SUPABASE_SECRET_KEY`; add `-- --dry-run` to check the file first, `-- --replace` to re-import).

## Running the resource directory page

You need Node.js 22.18 or newer.

1. Get the Project URL and publishable key (see "Getting access" above).
2. Create your `.env` and paste the two values into `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`:
   ```bash
   cp .env.example .env
   ```
3. Start the page:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173. Opening `index.html` straight from your file browser does not work, because `config.js` is only created by `npm run dev`.

If the page says **"Can't load resources"**, it names the problem: missing `.env`, placeholder values, a wrong URL, a wrong key, or a missing table.

## Scripts

See [scripts/README.md](scripts/README.md) for what each script does and how to run it.
