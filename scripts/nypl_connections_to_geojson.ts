// Transforms scripts/data/NYPL Connections Resources.csv into a GeoJSON that uses OSM's
// address-tagging convention (addr:housenumber, addr:street, addr:city, addr:state,
// addr:postcode, addr:country — see https://wiki.openstreetmap.org/wiki/Key:addr). Every
// original column is kept on each feature's properties; only the location fields are added.
//
// Coordinates come from the Census Bureau's free batch geocoder (no API key, one request for
// the whole file). Rows with no usable address, or that the geocoder can't match, are kept with
// geometry: null rather than dropped, since the PRD wants hotlines and address-less resources
// surfaced too.
//
//   node scripts/nypl_connections_to_geojson.ts [out.geojson]      (Node >= 22.18, no dependencies)
//   node --test scripts/nypl_connections_to_geojson.test.ts        (runs the tests)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const GEOCODE_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
export const BENCHMARK = 'Public_AR_Current'
const INPUT_CSV = join(import.meta.dirname, 'data', 'NYPL Connections Resources.csv')

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
}

export function isGeocodable(r: Record_): boolean {
  return !!r['Street'].trim() && !!(r['City'].trim() || r['Zip Code'].trim())
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

  return {
    type: 'Feature',
    geometry: result?.matched ? { type: 'Point', coordinates: [result.lon, result.lat] } : null,
    properties: { ...r, ...addr, geocode_match },
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

async function main(): Promise<void> {
  const out = process.argv[2] ?? join(import.meta.dirname, 'data', 'nypl_connections_resources.geojson')

  const [header, ...dataRows] = parseCsv(readFileSync(INPUT_CSV, 'utf8'))
  const records = dataRows.map((cols) => Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ''])))

  const geocodable = records.map((r, i) => ({ i, r })).filter(({ r }) => isGeocodable(r))

  const results = geocodable.length
    ? await geocode(
        geocodable.map(({ i }) => i),
        geocodable.map(({ r }) => ({
          street: [r['Street Number'], r['Street']].filter(Boolean).join(' '),
          city: r['City'],
          state: r['State'],
          zip: r['Zip Code'],
        })),
      )
    : new Map<number, MatchResult>()

  const features = records.map((r, i) => toFeature(r, results.get(i)))
  const matched = features.filter((f) => f.properties.geocode_match === 'matched').length
  const unmatched = features.filter((f) => f.properties.geocode_match === 'unmatched').length

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }))
  console.log(`${records.length} resources (${matched} matched, ${unmatched} unmatched, ${records.length - matched - unmatched} not attempted) -> ${out}`)
}

if (process.argv[1] === import.meta.filename) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
