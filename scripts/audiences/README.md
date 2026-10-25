# Audience enrichment

`audience_enrichment.ipynb` answers the finder's question *"Who is it for?"* for every resource. It reads
`data/cleaned/resources_extended.csv` and writes `data/cleaned/resource_audiences.csv`, one row per `resource_id`,
to be joined onto the resource table. It doesn't change any existing file.

Run it from `scripts/audiences/`, top to bottom. It needs Python 3 and pandas.

## Why

`pdf_audiences` (from `scripts/pdf/extend_clean_resources.py`) only knows the PDF's audience chapters, so it is
blank for every organization listed only in a service chapter (Health, Legal, Housing, …). A blank can mean
"open to everyone" or "not stated", and the data can't tell these apart.

## Columns

| Column | Meaning |
|---|---|
| `pdf_audiences` | Unchanged from `resources_extended.csv`. |
| `description_audiences` | Audiences named in the description, by keyword pattern. Adds *Survivors of violence* and *People without homes*, which have no PDF chapter. |
| `audiences_all` | Both of the above, without duplicates. |
| `audience_restriction` | `restricted`, `open`, `mixed` (both, needs review) or `not_stated`. |
| `audience_source` | `pdf`, `description`, `pdf+description`, or blank. |
| `audience_needs_review` | `True` for `mixed` rows and rows whose audiences come from the description only. |

## Status

First version of the rules, not reviewed yet. `data/review/audience_review.csv` holds a random sample of 50 rows
for a manual check; sharpen the patterns from what it shows, then run again.
