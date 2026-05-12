# PH Congress Database — Simple GitHub Pages System

A simple static web app for Philippine House Representatives and Partylist data.

It follows the same simple pattern as the uploaded partylist system:

```txt
Google Sheets CSV export links OR local CSV files
        ↓
tools/convert-csv-to-json.js
        ↓
data/congress_database.json
data/congress_summary.json
        ↓
index.html
```

## Files

```txt
index.html

data/
  google-sheets-config.json
  source-house-representatives.csv
  source-house-terms.csv
  source-partylist-results.csv
  source-partylist-representatives.csv
  source-partylist-notes.csv
  congress_database.json
  congress_summary.json
  README-data-schema.md

tools/
  convert-csv-to-json.js

.github/
  workflows/
    convert-csv-to-json.yml
```

## How to use with Google Sheets

1. Make one Google Sheets workbook with these tabs:
   - `source-house-representatives`
   - `source-house-terms`
   - `source-partylist-results`
   - `source-partylist-representatives`
   - `source-partylist-notes`

2. Publish each tab as CSV or use its CSV export URL.

3. Put the CSV export links inside:

```txt
data/google-sheets-config.json
```

4. Commit the file to GitHub.

5. Run GitHub Actions manually, or edit any CSV/config file and push.

6. The script fetches the CSV, converts it into JSON, and the dashboard updates.

## Manual/local option

If you do not want live Google Sheets links yet:

1. Download each Google Sheets tab as CSV.
2. Replace the matching `data/source-*.csv` file.
3. Run:

```bash
node tools/convert-csv-to-json.js
```

4. Commit the updated JSON files.

## Why this stays simple

- One HTML file for the app.
- One converter script.
- One main JSON database file.
- CSV stays easy to edit in Google Sheets.
- JSON is used only for accurate and faster display in the system.

## Important data rule

Use stable IDs instead of relying on names.

Examples:

```txt
rep_id: romualdez-martin
partylist_id: tingog
```

This allows the system to count name changes and AKA labels as one continuous record.
