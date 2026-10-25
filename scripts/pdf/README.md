# Connections Guide PDF

These scripts read the printed guide, `data/NYPL_JPS_Connections_2026.pdf`, and use it to extend the team's cleaned
data without replacing any of it. The PDF is not in git; put a copy at that path first.

```sh
uv run scripts/pdf/extract_listings.py         # PDF -> data/extracted/connections_pdf_listings.csv
uv run scripts/pdf/compare_to_csv.py           # team CSV vs PDF -> data/extracted/connections_pdf_vs_csv.csv
uv run scripts/pdf/extend_clean_resources.py   # resources_clean.csv + PDF -> data/cleaned/resources_extended.csv
```

`extend_clean_resources.py` reads `data/cleaned/resources_clean.csv`, which `scripts/cleaning/` writes. Each script
gives the same output on every run.

## What the PDF can and cannot tell us

- **Chapter and section are reliable.** The PDF sets each level in one fixed font size, and every section the
  extractor assigns matches one of the PDF's own bookmarks.
- **There is no third level.** Every 11.5pt subheading in the guide is followed by 5 to 63 lines of explanation
  before the next listing, e.g. "Discovery Law" above the public defenders. `preceding_subheading` records it
  but nothing uses it.
- **Audience chapters don't name a service.** Youth, Immigrants, LGBTQI+, Women, Veterans, Older People, and
  People with Disabilities list their resources under "Organizations" or "Organizations & Resources". The PDF can
  only give these rows a service type when the same organization is also listed in a service chapter.

## `section_service_types.csv`

One row per PDF section: the `service_type` and `service_subtype` its listings get, and the `audience` for
audience chapters. This table is the only place where a person decides anything; the script stops if the PDF has a
section the table lacks. `basis` says where each row came from:

| `basis` | Meaning |
|---|---|
| `pr_subcategory` | The section is in `by_sub` in `scripts/cleaning/data_cleaning_added_features.ipynb`. |
| `pr_chapter` | The section's chapter is in `by_cat` in the notebook. |
| `new` | Not decided by the notebook. Added here; review these rows. |
| blank | The section gets no service type. |

The `new` rows map Formerly Incarcerated People to Reentry Support, most of Parents & Caregivers to Family &
Childcare, and the few topical sections inside audience chapters (e.g. Older People > Housing).

## Columns `extend_clean_resources.py` adds

All columns of `resources_clean.csv` come first, unchanged.

| Column | Meaning |
|---|---|
| `pdf_match_method` | How the row was matched to a PDF listing; see the header of `compare_to_csv.py`. `no_match` means the PDF does not print that name. |
| `pdf_listing_id` | `listing_id` in `connections_pdf_listings.csv`. |
| `pdf_chapter`, `pdf_section`, `pdf_guide_page` | Where the PDF prints this listing. |
| `pdf_preceding_subheading` | The explanation heading above the listing, if any. Not a category. |
| `pdf_is_cross_reference` | The PDF listing only says "See the full listing for X on page N". |
| `pdf_section_service_type` | The service type `section_service_types.csv` gives `pdf_section`. Differs from `service_type` in 19 rows, all where the notebook guessed from the description or from other rows. |
| `pdf_appearances` | Every place the PDF lists this organization, as `Chapter > Section (p. N)`. |
| `pdf_org_service_types` | The service types of all those places. |
| `pdf_audiences` | The audience chapters the organization is listed in. |
| `service_type_extended` | `service_type` if the notebook set it, otherwise filled from the PDF. Never overrides. |
| `service_type_extended_source` | `pr:<service_type_source>`, `pdf_section`, `pdf_other_listings` (every other listing agrees), `pdf_candidates` (they disagree; left blank), or `unassigned`. |
| `service_subtype_extended` | `service_subtype` of the row's own PDF section, when that section's type is `service_type_extended`. |
| `description_service_types` | Every service type whose pattern in `SERVICE_PATTERNS` matches the row's description (plus the PDF's listing text). Multi-label. **Only filled where `service_type_extended` is blank**; see Remaining work. |
| `description_service_types_source` | `description_keywords`, or `pointer:<resource_id>` when the description only says "See X listing for full description" and the types were taken from X. |
| `service_types_all` | `service_type_extended`, `pdf_org_service_types`, and `description_service_types` together, for map filters that show an organization under every service it offers. |
| `pdf_contradiction` | Set only where the PDF clearly disagrees: the notebook's own rules applied to the PDF section give another type, the PDF chapter differs from `guide_category`, or "Not found in PDF". |
| `needs_review_extended`, `review_notes_extended` | `review_notes` without "service_type to assign" where the PDF filled it, plus `pdf_contradiction`. |

## Description tagging

`SERVICE_PATTERNS` in `extend_clean_resources.py` starts from the notebook's `hints` and drops words that say who a
resource serves rather than what it offers ("formerly incarcerated", "parole", "advocacy", "court-involved",
"employment authorization", ...). Unlike the notebook, it keeps every type that matches instead of only rows with
exactly one match: 102 of the 146 rows left blank above matched two or more types, which is why the notebook left
them blank.

Results on those 146 rows: 93 tagged from their description, 23 from the listing they point to, 29 with no match.

Precision was checked by hand on 18 tagged rows: 51 of 58 tags were right. Three of the misses are fixed by
exclusions now in the patterns. The remaining kind can't be fixed with keywords: a description that names who a
program serves ("young people who are unhoused or living in the shelter system") gets Housing even for an arts
program (Artistic Noise, `resource_id` 615).

## Remaining work

- **Tag the other 613 rows.** `description_service_types` is only filled where `service_type_extended` is blank.
  Rows that already have one `service_type` (from the notebook or the PDF) are often multi-service organizations
  too, and `service_types_all` should get their description types as well. The code change is removing the
  `if r["service_type_extended"]: continue` check; the work is checking precision on those rows, since many are
  long multi-program listings, and deciding whether description types may sit next to a type the guide assigned.
- **The 29 rows with no match** offer services outside the 10 types: disability services and independent living
  centers, domestic and dating violence hotlines, LGBTQ+ crisis lines, library services for blind readers,
  transportation discounts. They need new service types or a person's decision.
- **Spot-check the tags** in `description_service_types` before using them on the map; the 18-row check is a sample,
  not a review.
