# OpenStreetMap resources layer

A supplementary layer for the resource map: service locations in NYC that volunteers have mapped in
[OpenStreetMap](https://www.openstreetmap.org) (OSM). It complements the published ArcGIS layers
(NYPL Connections, public libraries, health facilities, cooling centers), so libraries and general
clinics and hospitals are left out on purpose.

```sh
node scripts/osm_resources_nyc.ts                # writes scripts/data/nyc_osm_resources.{csv,geojson}
python3 -m http.server -d scripts 8000           # then open http://localhost:8000/map.html
```

The script needs Node 22.18 or later and has no dependencies. It runs one query against the free public
[Overpass API](https://overpass-api.de) and retries with backoff when the server is busy. The map is a
single HTML file (MapLibre GL + OpenFreeMap tiles). It has to be served over HTTP, not opened as
a file, because it fetches the GeoJSON.

## What OSM offers

The query covers every named feature with one of these tags inside each of the five boroughs. Each row gets
one of the PRD's service categories (first match wins) and its borough. Counts are from a run on 2026-10-24.

| Category | OSM tags | Count | Notes |
|---|---|---|---|
| Childcare | `amenity=childcare`, `amenity=kindergarten` | 442 | Daycares and pre-K. Best-covered category. |
| Community centres | `amenity=community_centre` (incl. youth/cultural centres), `amenity=social_centre` | 175 | Local places to hand off to. |
| Mental health | `healthcare=counselling`, `healthcare=psychotherapist` | 76 | `healthcare:counselling=*` sometimes says addiction, family, etc. |
| Housing | `social_facility=shelter`, `group_home`, `transitional_housing` | 48 | `social_facility:for=homeless` / `migrant` marks shelters. Group homes are mostly for seniors. |
| Food | `social_facility=food_bank`, `soup_kitchen`, `amenity=food_bank` | 29 | Far below the real number of NYC pantries. |
| Employment | `office=employment_agency` | 26 | Staffing agencies and job-support programmes are mixed together. |
| Other social services | the rest of `amenity=social_facility` | 308 | Outreach (54) is the useful part. Nursing homes, assisted living and senior day care are mostly noise for CVI referrals. |

Total: 1,104 places.

### Fields

`category, subtype, borough, name, lat, lon, address, phone, website, opening_hours, operator, osm_url`

`subtype` is the raw OSM tag, e.g. `social_facility:shelter (for homeless)`. About half the rows have
a phone number or website, and about 10% have opening hours.

## Limits

- **No eligibility or referral information.** OSM records what a place is and where it is. It doesn't
  record who a place serves or how to get referred. Use this as a "what's nearby" layer next to the Connections
  Guide, not as resource cards.
- **Uneven coverage.** Results depend on where volunteers have mapped. The Bronx has very few
  rows in every category, which shows a gap in the mapping, not a lack of services. Don't use this
  layer for service-gap analysis.
- **No reentry category.** OSM has no tag that is used for reentry support.
- **Better sources exist for some categories.** NYC Open Data has fuller lists for childcare (DOHMH
  licensed child care centers) and food (city food pantry and community food program locations).
  They are worth using in place of OSM for those two categories.
- **Licence.** OSM data is under [ODbL](https://opendatacommons.org/licenses/odbl/): credit
  "© OpenStreetMap contributors" wherever the data is shown. Fixes made on openstreetmap.org
  (every row links to its OSM page) show up the next time the script runs.

## NYPL Connections → GeoJSON

```sh
node scripts/nypl_connections_to_geojson.ts              # writes scripts/data/nypl_connections_resources.geojson
node --test scripts/tests/nypl_connections_to_geojson.test.ts   # runs the tests (no network calls)
```

`scripts/data/NYPL Connections Resources.csv` is the raw Connections Guide export: one row per
resource, with location split across `Street Number`, `Address Line 2`, `Street`, `City`, `State`,
`Zip Code`, and no coordinates. This script (issue
[#4](https://github.com/dssg-nyc/KAVI-datathon/issues/4)) turns those columns into the location
format OSM itself uses, so the output can sit next to `nyc_osm_resources.geojson` or be loaded into
OSM-based tooling.

- **Address tags.** OSM addresses are a flat set of `addr:*` tags (see the
  [OSM wiki](https://wiki.openstreetmap.org/wiki/Key:addr)), not a single string. The script maps
  `Street Number → addr:housenumber`, `Street → addr:street`, `City → addr:city`,
  `State → addr:state`, `Zip Code → addr:postcode`, and sets `addr:country = US` whenever any of
  those are present. Every original CSV column is kept as-is on the feature's properties alongside
  the new tags — nothing is renamed or dropped.
- **Coordinates.** Comes from the Census Bureau's free
  [batch geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) (no API
  key, one request for the whole file, benchmark `Public_AR_Current`). Only the 469 rows with a
  street plus a city or zip are sent; the other 291 are hotlines or resources with no physical
  address. On the 2026-10-24 run, 424 of those 469 matched.
- **Nothing is dropped.** Every row from the CSV becomes a feature. `geocode_match` on each
  feature's properties is `matched`, `unmatched` (had an address, geocoder couldn't place it — e.g.
  a PO box), or `not_attempted` (no usable address). Unmatched/not-attempted features get
  `geometry: null` instead of being removed, since hotlines and address-less resources still belong
  in the directory.
- **Not wired into map.html.** This is the data-transformation step only; no category mapping to
  the OSM layer's taxonomy and no map UI changes.
