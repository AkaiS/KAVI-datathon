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
| `restricted_audiences` | The audiences the description limits the resource to ("for LGBTQIA+ youth", "open only to veterans"). |
| `audience_restriction` | `restricted`, `open`, `mixed` (both, needs review) or `not_stated`. |
| `restriction_evidence` | The words that triggered the restriction or the "open" wording, for checking. |
| `everyone_basis` | `stated` (the text says it serves anyone), `assumed` (no restriction found) or blank (restricted). |
| `audiences_all` | `pdf_audiences`, then `description_audiences`, then `Everyone` for every resource that isn't restricted. |
| `audience_source` | `pdf`, `description`, `pdf+description`, or blank. |
| `audience_needs_review` | `True` for `mixed` rows and rows whose audiences come from the description only. |

## Ranking in the finder

When a user picks an audience, e.g. *Youth*: first resources restricted to youth, then resources tagged *Youth* but
open to others, then resources tagged *Everyone*. Resources restricted to other groups are left out. `rank_for()` in
the notebook is the reference for the finder's filter.

## Status

Second version of the rules, not reviewed yet. Two files in `data/review/` support the manual check:
`audience_review.csv` (a random sample of 50 rows) and `audience_no_match.csv` (rows where the description matched
no audience pattern). Sharpen the patterns from what they show, then run again.
