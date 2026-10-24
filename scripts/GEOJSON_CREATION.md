# GeoJSON creation

How `scripts/data/nypl_connections_resources.geojson` is built from
`scripts/data/NYPL Connections Resources.csv`.

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
