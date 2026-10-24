// Transforms data/NYPL Connections Resources.csv into a GeoJSON that uses OSM's
// address-tagging convention (addr:housenumber, addr:street, addr:city, addr:state,
// addr:postcode, addr:country — see https://wiki.openstreetmap.org/wiki/Key:addr). Every
// original column is kept on each feature's properties; only the location fields are added.
//
// Coordinates try NYC's own GeoSearch geocoder first (building-level, no API key), falling back
// to the Census Bureau's free batch geocoder for whatever GeoSearch can't confidently place.
// GeoSearch has no real concept of "outside NYC" — for an address it can't find, it silently
// returns the nearest same-named NYC street instead of nothing, so a GeoSearch result is only
// trusted when the zip code it returns matches the input's. Anything that fails that check
// (including every address genuinely outside NYC) falls through to Census, same as before. Rows
// with no usable address, or that neither geocoder can match, are kept with geometry: null rather
// than dropped, since the PRD wants hotlines and address-less resources surfaced too.
//
//   node scripts/nypl_connections_to_geojson.ts [out.geojson]      (Node >= 22.18, no dependencies)
//   node --test scripts/tests/nypl_connections_to_geojson.test.ts  (runs the tests)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const GEOCODE_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
export const BENCHMARK = 'Public_AR_Current'
const INPUT_CSV = join(import.meta.dirname, '..', 'data', 'NYPL Connections Resources.csv')

export type Record_ = Record<string, string>

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r') continue
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim()))
}

export function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

export interface MatchResult {
  matched: boolean
  lon?: number
  lat?: number
  source?: 'geosearch' | 'census'
}

export function isGeocodable(r: Record_): boolean {
  return !!r['Street'].trim() && !!(r['City'].trim() || r['Zip Code'].trim())
}

// Two zip-code typos in the source CSV, confirmed against the published ArcGIS layer
// (NYPL_Connections_merge) during PR review. Keyed by Organization Name — stable and unique for
// both rows — rather than rewriting the raw CSV, so the delivered file stays byte-for-byte as
// received and this fix stays visible/testable in code.
const ZIP_FIXES: Record<string, string> = {
  'THE BEDFORD-STUYVESANT FAMILY HEALTH CENTER - 4 (Wellness Center Program)': '11216', // was 12116
  'CENTER FOR JUSTICE INNOVATION (CJI)—THE STATEN ISLAND JUSTICE CENTER': '10301', // was 10304
}

export function cleanZip(r: Record_): Record_ {
  const fix = ZIP_FIXES[r['Organization Name']]
  return fix ? { ...r, 'Zip Code': fix } : r
}

export function buildBatchCsv(ids: number[], rows: { street: string; city: string; state: string; zip: string }[]): string {
  return ids.map((id, i) => {
    const r = rows[i]
    return [id, r.street, r.city, r.state, r.zip].map((v) => csvCell(String(v))).join(',')
  }).join('\n')
}

export function parseGeocodeResponse(csvText: string): Map<number, MatchResult> {
  const results = new Map<number, MatchResult>()
  for (const cols of parseCsv(csvText)) {
    const id = Number(cols[0])
    if (cols[2] !== 'Match') { results.set(id, { matched: false }); continue }
    const [lon, lat] = cols[5].split(',').map(Number)
    results.set(id, { matched: true, lon, lat })
  }
  return results
}

export function toFeature(r: Record_, result: MatchResult | undefined) {
  const addr: Record_ = {}
  if (r['Street Number']) addr['addr:housenumber'] = r['Street Number']
  if (r['Street']) addr['addr:street'] = r['Street']
  if (r['City']) addr['addr:city'] = r['City']
  if (r['State']) addr['addr:state'] = r['State']
  if (r['Zip Code']) addr['addr:postcode'] = r['Zip Code']
  if (Object.keys(addr).length) addr['addr:country'] = 'US'

  const geocode_match = !result ? 'not_attempted' : result.matched ? 'matched' : 'unmatched'
  const geocode_source = result?.matched ? (result.source ?? '') : ''

  return {
    type: 'Feature',
    geometry: result?.matched ? { type: 'Point', coordinates: [result.lon, result.lat] } : null,
    properties: { ...r, ...addr, geocode_match, geocode_source },
  }
}

export async function geocode(ids: number[], rows: { street: string; city: string; state: string; zip: string }[]): Promise<Map<number, MatchResult>> {
  const form = new FormData()
  form.append('addressFile', new Blob([buildBatchCsv(ids, rows)], { type: 'text/csv' }), 'addresses.csv')
  form.append('benchmark', BENCHMARK)

  let resp: Response | undefined
  for (let attempt = 0, waitS = 10; attempt < 4; attempt++, waitS *= 2) {
    resp = await fetch(GEOCODE_ENDPOINT, { method: 'POST', body: form })
    if (![429, 502, 503, 504].includes(resp.status)) break
    await resp.body?.cancel()
    console.error(`Census geocoder busy (HTTP ${resp.status}), retrying in ${waitS}s`)
    await new Promise((r) => setTimeout(r, waitS * 1000))
  }
  if (resp!.status !== 200) throw new Error(`Census geocoder HTTP ${resp!.status}: ${(await resp!.text()).slice(0, 500)}`)
  return parseGeocodeResponse(await resp!.text())
}

export const GEOSEARCH_ENDPOINT = 'https://geosearch.planninglabs.nyc/v2/search'
export const GEOSEARCH_CONCURRENCY = 5

export interface GeoSearchFeature {
  geometry: { coordinates: [number, number] }
  properties: { postalcode?: string }
}

// GeoSearch always returns something for a plausible-looking query, even for addresses nowhere
// near NYC — it falls back to the nearest same-named NYC street rather than no match (e.g.
// "Kingston, NY 12401" comes back as a Brooklyn street with zip 11213). The only reliable signal
// that a result is real is that the zip it returns matches the zip we asked for.
export function pickGeoSearchMatch(features: GeoSearchFeature[], zip: string): { lon: number; lat: number } | null {
  const zip5 = zip.trim().slice(0, 5)
  if (!zip5) return null
  const hit = features.find((f) => (f.properties.postalcode ?? '').trim().slice(0, 5) === zip5)
  if (!hit) return null
  const [lon, lat] = hit.geometry.coordinates
  return { lon, lat }
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function geocodeWithGeoSearch(rows: { id: number; street: string; city: string; state: string; zip: string }[]): Promise<Map<number, MatchResult>> {
  const results = new Map<number, MatchResult>()
  await mapWithConcurrency(rows, GEOSEARCH_CONCURRENCY, async (row) => {
    const text = [row.street, row.city, row.state, row.zip].filter(Boolean).join(', ')
    let data: { features?: GeoSearchFeature[] } | undefined
    try {
      const resp = await fetch(`${GEOSEARCH_ENDPOINT}?text=${encodeURIComponent(text)}&size=1`)
      if (resp.ok) data = await resp.json()
      else console.error(`GeoSearch HTTP ${resp.status} for row ${row.id}`)
    } catch (err) {
      console.error(`GeoSearch request failed for row ${row.id}: ${(err as Error).message}`)
    }
    const match = data?.features ? pickGeoSearchMatch(data.features, row.zip) : null
    if (match) results.set(row.id, { matched: true, lon: match.lon, lat: match.lat, source: 'geosearch' })
  })
  return results
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? join(import.meta.dirname, '..', 'data', 'nypl_connections_resources.geojson')

  const [header, ...dataRows] = parseCsv(readFileSync(INPUT_CSV, 'utf8'))
  const records = dataRows.map((cols) => cleanZip(Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']))))

  const geocodable = records.map((r, i) => ({ i, r })).filter(({ r }) => isGeocodable(r))
  const addressRows = geocodable.map(({ i, r }) => ({
    id: i,
    street: [r['Street Number'], r['Street']].filter(Boolean).join(' '),
    city: r['City'],
    state: r['State'],
    zip: r['Zip Code'],
  }))

  // Try NYC GeoSearch first (see pickGeoSearchMatch for why its result has to be zip-validated);
  // whatever it can't confidently place — including every address genuinely outside NYC — falls
  // through to the Census batch geocoder, as before.
  const geoSearchResults = addressRows.length ? await geocodeWithGeoSearch(addressRows) : new Map<number, MatchResult>()
  const remaining = addressRows.filter((row) => !geoSearchResults.get(row.id)?.matched)

  const censusResults = remaining.length
    ? await geocode(remaining.map((r) => r.id), remaining.map((r) => ({ street: r.street, city: r.city, state: r.state, zip: r.zip })))
    : new Map<number, MatchResult>()

  const results = new Map<number, MatchResult>(geoSearchResults)
  for (const [id, r] of censusResults) results.set(id, { ...r, source: 'census' })

  const features = records.map((r, i) => toFeature(r, results.get(i)))
  const matched = features.filter((f) => f.properties.geocode_match === 'matched')
  const unmatched = features.filter((f) => f.properties.geocode_match === 'unmatched').length
  const viaGeoSearch = matched.filter((f) => f.properties.geocode_source === 'geosearch').length
  const viaCensus = matched.filter((f) => f.properties.geocode_source === 'census').length

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }))
  console.log(`${records.length} resources (${matched.length} matched [${viaGeoSearch} via GeoSearch, ${viaCensus} via Census], ${unmatched} unmatched, ${records.length - matched.length - unmatched} not attempted) -> ${out}`)
}

if (process.argv[1] === import.meta.filename) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
