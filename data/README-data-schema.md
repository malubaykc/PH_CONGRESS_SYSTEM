# Data Schema

This system is intentionally simple. Edit CSV data through Google Sheets, then let the converter produce JSON for the website.

## 1. `source-house-representatives.csv`

One row per person.

Columns:

- `rep_id`
- `full_name`
- `surname`
- `sex`
- `clan`
- `notes`

## 2. `source-house-terms.csv`

One row per representative per Congress/term.

Columns:

- `rep_id`
- `congress`
- `election_year`
- `region`
- `province`
- `district`
- `seat_type`
- `party`
- `leadership`
- `source_url`

Use `seat_type` as either:

- `District`
- `Partylist`

## 3. `source-partylist-results.csv`

One row per partylist per election/Congress.

Columns:

- `election_year`
- `congress`
- `partylist_id`
- `partylist_name`
- `aka_names`
- `seats_won`
- `votes`
- `vote_share`
- `status`
- `general_notes`

Use semicolons for aliases:

```txt
Tingog Sinirangan; Tingog; Tingog Party List
```

## 4. `source-partylist-representatives.csv`

One row per partylist representative/nominee per Congress.

Columns:

- `congress`
- `partylist_id`
- `partylist_name`
- `representative_name`
- `seat_no`
- `term_start`
- `term_end`
- `role`
- `notes`

## 5. `source-partylist-notes.csv`

One row per note, legal issue, name variation, cancellation, or status flag.

Columns:

- `partylist_id`
- `partylist_name`
- `date`
- `note_type`
- `title`
- `description`
- `source`

## Generated files

The website reads:

- `data/congress_database.json`
- `data/congress_summary.json`

Do not manually edit these unless necessary. They are generated from the CSV source files.
