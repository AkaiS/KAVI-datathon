# Human review: resources with no service type

`new_service_types_review.csv` lists the 25 resources whose `service_types_all` is blank in
`data/cleaned/resources_extended.csv` (PR #16, listed there under "Remaining work"). They offer services
outside the 10 existing service types, so the finder's "What kind of help?" question can't find them.

The goal is a **proposal** for the team, not a final change: which new service types to add, and which
rows fit an existing type after all. Nothing here is read by a script yet.

## Columns

| Column | Filled by | Meaning |
|---|---|---|
| `resource_id` … `description` | copied from `resources_extended.csv` | What the resource is. Don't edit these. |
| `proposed_service_type` | reviewer | A new type for this row, e.g. `Disability Services`. Use the same spelling for every row in that group. |
| `fits_existing_type` | reviewer | One of the 10 existing types that fits, if any. A row can have both a new and an existing type. |
| `human_notes` | reviewer | Short reason, or `team decision needed`. |

Separate several types in one cell with `; `, e.g. `Disability Services; Violence & Safety Support`.

The 10 existing types are Housing, Food, Health & Mental Health, Addiction & Recovery, Legal & Rights,
Education, Employment, Financial Assistance, Family & Childcare and Reentry Support.

## Starting points

PR #16 groups these rows roughly as disability services and independent living centers, domestic and dating
violence hotlines, LGBTQ+ crisis lines, and library services for blind readers.

## Result of the first review (Franziska Meyndt, 2026-10-25)

Two new service types are proposed. The 10 existing types stay unchanged.

| Proposed type | Rows | What it covers |
|---|---|---|
| `Disability Services` | 13 | Independent living centers, accessible library services, disability hotlines, parking permits |
| `Violence & Safety Support` | 5 | Domestic violence and dating abuse hotlines, self-defense and upstander workshops, police surveillance protection |

Row 518 (The Deaf Hotline) gets both. Seven rows fit only an existing type; most had none because the guide
lists them only in an audience chapter (Youth, LGBTQI+). Row 593 is a cross-reference and gets the types of its
full listing. Rows 593 and 657 still contain notes from the PDF extraction in `description`, which should be cleaned
up in the source data.

## Human check of Claude's service type review

`reviewed_service_types_human_check.csv` is a copy of the 123 rows in `scripts/pdf/reviewed_service_types.csv`
(PR #16), whose service types Claude reviewed but no person has checked yet. It adds each row's `description`
from `resources_extended.csv` and three columns for the reviewer. PR #16's file itself is not changed.

The 82 rows where Claude changed the keyword tags (`claude_changed = True`) come first, because that is where
mistakes are most likely.

| Column | Filled by | Meaning |
|---|---|---|
| `keyword_service_types` | PR #16 | Types the keyword patterns found. |
| `reviewed_service_types` | PR #16 | Types after Claude's review. This is what the finder uses. |
| `changes` | PR #16 | Tags Claude removed (`-Type: why`) or added (`+Type: quote`). |
| `human_verdict` | reviewer | `agree`, `change`, or `unsure`. |
| `human_service_types` | reviewer | Only for `change`: the full corrected list, separated by `; `. |
| `human_notes` | reviewer | Short reason. |

For each tag, ask: would someone who picks this type in the finder get that help here? Common mistakes listed
in PR #16: a type taken from who is served ("homeless youth" is not Housing), from a topic the advice mentions
("denied jobs" in legal text is not Employment), or from an ambiguous word (career or benefits "counseling" is not
Health & Mental Health); and Financial Assistance missed for benefits help, stipends, bail or reduced fares. Also
check whether one of the two proposed new types above fits.

## Editing the files

Open them in Google Sheets, Numbers or Excel. Save it back as CSV in UTF-8: in Excel use "CSV UTF-8",
in Google Sheets use File → Download → CSV. Other encodings break characters such as "—" and "’".
