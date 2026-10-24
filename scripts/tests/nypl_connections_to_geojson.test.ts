// Tests for scripts/nypl_connections_to_geojson.ts.
// Run with: node --test scripts/tests/nypl_connections_to_geojson.test.ts
import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBatchCsv,
  csvCell,
  geocode,
  isGeocodable,
  parseCsv,
  parseGeocodeResponse,
  toFeature,
  BENCHMARK,
  type Record_,
} from '../nypl_connections_to_geojson.ts'

describe('parseCsv', () => {
  // A plain grid with no quoting should split cleanly on commas/newlines.
  test('splits a simple grid', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']])
  })

  // The NYPL CSV has ~39 rows like "C/O Family of Woodstock, Inc." in Address Line 2 —
  // a comma inside a quoted field must not be treated as a column separator.
  test('keeps commas inside quoted fields', () => {
    assert.deepEqual(parseCsv('name,note\nAcme,"C/O Smith, Inc."\n'), [
      ['name', 'note'],
      ['Acme', 'C/O Smith, Inc.'],
    ])
  })

  // RFC4180 escapes a literal quote as two quotes in a row; that should collapse to one.
  test('unescapes doubled quotes inside quoted fields', () => {
    assert.deepEqual(parseCsv('a\n"she said ""hi"""\n'), [['a'], ['she said "hi"']])
  })

  // A quoted field is allowed to contain the row separator itself.
  test('keeps newlines inside quoted fields', () => {
    assert.deepEqual(parseCsv('a,b\n1,"line one\nline two"\n'), [['a', 'b'], ['1', 'line one\nline two']])
  })

  // Trailing/stray blank lines in the source file shouldn't become empty rows.
  test('drops blank lines', () => {
    assert.deepEqual(parseCsv('a,b\n1,2\n\n3,4\n'), [['a', 'b'], ['1', '2'], ['3', '4']])
  })

  // The source file and the Census response may use CRLF rather than LF.
  test('handles CRLF line endings', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']])
  })
})

describe('csvCell', () => {
  // Most fields need no escaping at all.
  test('leaves plain values alone', () => {
    assert.equal(csvCell('Kingston'), 'Kingston')
  })

  // A value containing a comma must be wrapped in quotes or it would split into two columns.
  test('quotes values containing commas', () => {
    assert.equal(csvCell('Kingston, NY'), '"Kingston, NY"')
  })

  // A literal quote inside a quoted value must be doubled per RFC4180.
  test('escapes embedded quotes', () => {
    assert.equal(csvCell('12 "Main" St'), '"12 ""Main"" St"')
  })
})

// A full NYPL CSV row with every column blank unless overridden, so each test only has to
// spell out the fields it cares about.
function record(fields: Partial<Record_>): Record_ {
  const base: Record_ = {
    'Organization Name': '', 'Street Number': '', 'Address Line 2': '', Street: '', City: '',
    State: '', 'Zip Code': '', 'Phone Number': '', Website: '', Description: '', Category: '',
    Subcategory: '', 'Spanish-speaking (Y/N)': '', 'Works w/ Currently Incarcerated/Pre-release (Y/N)': '',
    'ATI Program (Y/N)': '', 'Know Your Rights Content (Y/N)': '', Notes: '',
  }
  return { ...base, ...fields }
}

describe('isGeocodable', () => {
  // The Census geocoder needs a street plus either a city or a zip to have a shot at matching.
  test('needs a street plus a city or zip', () => {
    assert.equal(isGeocodable(record({ Street: 'Albany Avenue', City: 'Kingston' })), true)
    assert.equal(isGeocodable(record({ Street: 'Albany Avenue', 'Zip Code': '12401' })), true)
  })

  // A street name alone (no city, no zip) isn't enough to send to the geocoder.
  test('rejects a street with neither city nor zip', () => {
    assert.equal(isGeocodable(record({ Street: 'Albany Avenue' })), false)
  })

  // ~291 rows are hotlines or online-only resources with no address at all; they should
  // never be sent to the geocoder.
  test('rejects a row with no street at all (hotlines, online-only resources)', () => {
    assert.equal(isGeocodable(record({ City: 'Kingston', 'Zip Code': '12401' })), false)
    assert.equal(isGeocodable(record({})), false)
  })
})

describe('buildBatchCsv', () => {
  // Each row must carry the caller's id (so results can be matched back up) and quote any
  // field that itself contains a comma (e.g. "Troy, Rensselaer").
  test('pairs each id with its address row, quoting where needed', () => {
    const csv = buildBatchCsv(
      [5, 9],
      [
        { street: '31 Albany Avenue', city: 'Kingston', state: 'NY', zip: '12401' },
        { street: '1 Main St', city: 'Troy, Rensselaer', state: 'NY', zip: '12180' },
      ],
    )
    assert.equal(csv, '5,31 Albany Avenue,Kingston,NY,12401\n9,1 Main St,"Troy, Rensselaer",NY,12180')
  })
})

describe('parseGeocodeResponse', () => {
  // A "Match" row carries coordinates as a single "lon,lat" column that needs splitting.
  test('reads coordinates out of a matched row', () => {
    const csv = '"1","350 Fifth Avenue, New York, NY, 10118","Match","Exact","350 5TH AVE, NEW YORK, NY, 10118","-73.985075577551,40.747850846857","59653473","L"'
    const results = parseGeocodeResponse(csv)
    assert.deepEqual(results.get(1), { matched: true, lon: -73.985075577551, lat: 40.747850846857 })
  })

  // A "No_Match" row (e.g. a PO box like "Box 188") has only 3 columns and no coordinates.
  test('marks a No_Match row as unmatched with no coordinates', () => {
    const results = parseGeocodeResponse('"2","1 Police Plaza, New York, NY, 10038","No_Match"')
    assert.deepEqual(results.get(2), { matched: false })
  })

  // The real response is one row per input address; both outcomes can appear in the same batch.
  test('handles multiple rows', () => {
    const csv = [
      '"1","a","Match","Exact","a","-1,2","id","L"',
      '"2","b","No_Match"',
    ].join('\n')
    const results = parseGeocodeResponse(csv)
    assert.equal(results.size, 2)
    assert.equal(results.get(1)?.matched, true)
    assert.equal(results.get(2)?.matched, false)
  })
})

describe('toFeature', () => {
  // When every address column is present and the geocoder matched, the feature should carry
  // the full set of OSM addr:* tags plus a Point geometry.
  test('builds addr:* tags from the present address columns', () => {
    const f = toFeature(
      record({ 'Street Number': '31', Street: 'Albany Avenue', City: 'Kingston', State: 'NY', 'Zip Code': '12401' }),
      { matched: true, lon: -74.0, lat: 41.9 },
    )
    assert.equal(f.properties['addr:housenumber'], '31')
    assert.equal(f.properties['addr:street'], 'Albany Avenue')
    assert.equal(f.properties['addr:city'], 'Kingston')
    assert.equal(f.properties['addr:state'], 'NY')
    assert.equal(f.properties['addr:postcode'], '12401')
    assert.equal(f.properties['addr:country'], 'US')
    assert.equal(f.properties.geocode_match, 'matched')
    assert.deepEqual(f.geometry, { type: 'Point', coordinates: [-74.0, 41.9] })
  })

  // A hotline/online-only row (no address columns, never sent to the geocoder) must not
  // gain any addr:* tags, and should be flagged "not_attempted" rather than dropped.
  test('omits addr:* tags entirely for a row with no address fields', () => {
    const f = toFeature(record({}), undefined)
    for (const key of Object.keys(f.properties)) assert.ok(!key.startsWith('addr:'))
    assert.equal(f.properties.geocode_match, 'not_attempted')
    assert.equal(f.geometry, null)
  })

  // A row that had an address but the geocoder couldn't place (e.g. a PO box) keeps its
  // addr:* tags but gets null geometry and is flagged "unmatched", not dropped.
  test('marks an address that failed to geocode as unmatched with null geometry', () => {
    const f = toFeature(record({ Street: 'Box 188', City: 'Yaphank' }), { matched: false })
    assert.equal(f.properties.geocode_match, 'unmatched')
    assert.equal(f.geometry, null)
  })

  // Every original CSV column (Organization Name, Notes, the Y/N flags, etc.) must survive
  // untouched on the feature's properties — this script only adds fields, never removes any.
  test('keeps every original column on properties, unchanged', () => {
    const r = record({ 'Organization Name': 'Acme', Notes: 'see page 12' })
    const f = toFeature(r, undefined)
    assert.equal(f.properties['Organization Name'], 'Acme')
    assert.equal(f.properties['Notes'], 'see page 12')
  })
})

describe('geocode', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  // Verifies the actual HTTP contract with the Census batch endpoint: POST, the right URL,
  // a multipart body carrying "benchmark" and an "addressFile" blob — and that a successful
  // response gets parsed into the result map.
  test('posts the address batch as multipart form data and parses the response', async () => {
    let seenUrl: string | URL | undefined
    let seenInit: RequestInit | undefined
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = url
      seenInit = init
      return new Response('"0","a","Match","Exact","a","-73.9,40.7","1","L"')
    }) as typeof fetch

    const results = await geocode([0], [{ street: '1 Main St', city: 'Troy', state: 'NY', zip: '12180' }])

    assert.equal(results.get(0)?.matched, true)
    assert.equal(String(seenUrl), 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch')
    assert.equal(seenInit?.method, 'POST')
    const body = seenInit?.body as FormData
    assert.ok(body instanceof FormData)
    assert.equal(body.get('benchmark'), BENCHMARK)
    assert.ok(body.get('addressFile') instanceof Blob)
  })

  // The Census server answers 429/502/503/504 when it's busy; the script is supposed to
  // back off and retry rather than fail on the first bad response. The real backoff waits
  // real seconds, so stub the timer too or this test would take ~10s.
  test('retries on a busy response and succeeds once the server recovers', async () => {
    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((fn: () => void) => { fn(); return 0 }) as typeof setTimeout

    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1) return new Response('busy', { status: 503 })
      return new Response('"0","a","Match","Exact","a","-73.9,40.7","1","L"')
    }) as typeof fetch

    try {
      const results = await geocode([0], [{ street: '1 Main St', city: 'Troy', state: 'NY', zip: '12180' }])
      assert.equal(calls, 2)
      assert.equal(results.get(0)?.matched, true)
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
  })

  // A non-retryable status (anything other than 429/502/503/504) should fail fast with a
  // useful error instead of being silently swallowed or retried forever.
  test('throws with the status and body when the server returns a non-retryable error', async () => {
    globalThis.fetch = (async () => new Response('bad request', { status: 400 })) as typeof fetch

    await assert.rejects(
      geocode([0], [{ street: '1 Main St', city: 'Troy', state: 'NY', zip: '12180' }]),
      /HTTP 400.*bad request/s,
    )
  })
})
