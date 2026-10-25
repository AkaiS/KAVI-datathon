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
| `fits_existing_type` | reviewer | If one of the 10 existing types fits after all, name it here instead. |
| `human_notes` | reviewer | Short reason, or `team decision needed`. |

The 10 existing types are Housing, Food, Health & Mental Health, Addiction & Recovery, Legal & Rights,
Education, Employment, Financial Assistance, Family & Childcare and Reentry Support.

## Starting points

PR #16 groups these rows roughly as disability services and independent living centers, domestic and dating
violence hotlines, LGBTQ+ crisis lines, and library services for blind readers.

## Editing the file

Open it in Google Sheets, Numbers or Excel. Save it back as CSV in UTF-8: in Excel use "CSV UTF-8",
in Google Sheets use File → Download → CSV. Other encodings break characters such as "—" and "’".
