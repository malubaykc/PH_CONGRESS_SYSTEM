const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const SOURCES = {
  houseRepresentatives: path.join(DATA_DIR, "source-house-representatives.csv"),
  houseTerms: path.join(DATA_DIR, "source-house-terms.csv"),
  partylistResults: path.join(DATA_DIR, "source-partylist-results.csv"),
  partylistRepresentatives: path.join(DATA_DIR, "source-partylist-representatives.csv"),
  partylistNotes: path.join(DATA_DIR, "source-partylist-notes.csv")
};

const CONFIG_PATH = path.join(DATA_DIR, "google-sheets-config.json");
const DATABASE_JSON = path.join(DATA_DIR, "congress_database.json");
const SUMMARY_JSON = path.join(DATA_DIR, "congress_summary.json");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (cell || row.length) {
        row.push(cell.trim());
        rows.push(row);
      }
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter(row => row.some(cell => String(cell || "").trim()));
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(cleanKey);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((key, i) => obj[key || `column_${i + 1}`] = row[i] || "");
    return obj;
  });
}

function makeId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function numberOrZero(value) {
  const n = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function splitAliases(value) {
  return String(value || "")
    .split(/\s*;\s*|\n+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function getSurname(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  if (value.includes(",")) return value.split(",")[0].trim();
  const parts = value.replace(/\".*?\"/g, "").trim().split(/\s+/);
  return parts[parts.length - 1] || value;
}

async function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    console.warn("Could not read google-sheets-config.json. Local CSV files will be used.");
    return {};
  }
}

async function readSource(key, required = true) {
  const config = await loadConfig();
  const url = String(config[key] || "").trim();
  const localPath = SOURCES[key];

  if (url && /^https?:\/\//i.test(url)) {
    console.log(`Fetching ${key} from Google Sheets CSV URL...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not fetch ${key}: ${response.status} ${response.statusText}`);
    const text = await response.text();
    fs.writeFileSync(localPath, text, "utf8");
    return rowsToObjects(parseCSV(text));
  }

  if (!fs.existsSync(localPath)) {
    if (required) throw new Error(`Missing CSV file: ${localPath}`);
    return [];
  }

  return rowsToObjects(parseCSV(fs.readFileSync(localPath, "utf8")));
}

function ensureRep(reps, row) {
  const id = row.rep_id || makeId(row.full_name || row.representative_name || row.name);
  if (!id) return null;

  if (!reps.has(id)) {
    const name = row.full_name || row.representative_name || row.name || id;
    reps.set(id, {
      id,
      name,
      surname: row.surname || getSurname(name),
      sex: row.sex || "",
      clan: row.clan || "",
      notes: row.notes || "",
      terms: []
    });
  }

  const rep = reps.get(id);
  if (row.full_name && row.full_name !== rep.name) rep.name = row.full_name;
  if (row.sex) rep.sex = row.sex;
  if (row.clan) rep.clan = row.clan;
  if (row.notes && !rep.notes) rep.notes = row.notes;
  if (!rep.surname) rep.surname = getSurname(rep.name);
  return rep;
}

function ensureParty(parties, row) {
  const id = row.partylist_id || makeId(row.partylist_name);
  if (!id) return null;

  if (!parties.has(id)) {
    parties.set(id, {
      id,
      name: row.partylist_name || id,
      aliases: [],
      history: [],
      representatives: [],
      notes: []
    });
  }

  const party = parties.get(id);
  if (row.partylist_name && row.partylist_name !== party.name && !party.aliases.includes(row.partylist_name)) {
    party.aliases.push(row.partylist_name);
  }
  splitAliases(row.aka_names || row.aliases).forEach(alias => {
    if (alias !== party.name && !party.aliases.includes(alias)) party.aliases.push(alias);
  });
  return party;
}

function buildDistricts(terms) {
  const map = new Map();

  terms.filter(t => String(t.seat_type || "").toLowerCase() === "district").forEach(term => {
    const id = makeId([term.province, term.district].filter(Boolean).join("-"));
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, {
        id,
        region: term.region || "",
        province: term.province || "",
        district: term.district || "",
        history: []
      });
    }
    map.get(id).history.push({
      congress: term.congress || "",
      election_year: numberOrZero(term.election_year),
      rep_id: term.rep_id || "",
      representative_name: term.representative_name || "",
      surname: getSurname(term.representative_name || "")
    });
  });

  return Array.from(map.values()).map(district => {
    district.history.sort((a, b) => numberOrZero(a.election_year) - numberOrZero(b.election_year));
    const names = district.history.map(h => h.representative_name).filter(Boolean);
    district.unique_representatives = [...new Set(names)];
    district.is_stable = district.history.length > 1 && district.unique_representatives.length === 1;
    return district;
  }).sort((a, b) => `${a.region} ${a.province} ${a.district}`.localeCompare(`${b.region} ${b.province} ${b.district}`));
}

async function main() {
  const repRows = await readSource("houseRepresentatives", false);
  const termRows = await readSource("houseTerms", false);
  const partyResultRows = await readSource("partylistResults", false);
  const partyRepRows = await readSource("partylistRepresentatives", false);
  const partyNoteRows = await readSource("partylistNotes", false);

  const reps = new Map();
  repRows.forEach(row => ensureRep(reps, row));

  termRows.forEach(row => {
    const rep = ensureRep(reps, row);
    if (!rep) return;
    const term = {
      rep_id: rep.id,
      representative_name: rep.name,
      congress: row.congress || "",
      election_year: numberOrZero(row.election_year),
      region: row.region || "",
      province: row.province || "",
      district: row.district || "",
      seat_type: row.seat_type || "District",
      party: row.party || "",
      leadership: row.leadership || "",
      source_url: row.source_url || ""
    };
    rep.terms.push(term);
  });

  const repList = Array.from(reps.values()).map(rep => {
    rep.terms.sort((a, b) => numberOrZero(a.election_year) - numberOrZero(b.election_year));
    rep.term_count = rep.terms.length;
    rep.first_congress = rep.terms[0]?.congress || "";
    rep.latest_congress = rep.terms[rep.terms.length - 1]?.congress || "";
    rep.latest_district = rep.terms[rep.terms.length - 1]?.district || "";
    rep.latest_region = rep.terms[rep.terms.length - 1]?.region || "";
    rep.latest_seat_type = rep.terms[rep.terms.length - 1]?.seat_type || "";
    rep.leadership = rep.terms.find(t => t.leadership)?.leadership || "";
    return rep;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const allTerms = repList.flatMap(rep => rep.terms);
  const districts = buildDistricts(allTerms);

  const parties = new Map();
  partyResultRows.forEach(row => {
    const party = ensureParty(parties, row);
    if (!party) return;
    party.history.push({
      election_year: numberOrZero(row.election_year),
      congress: row.congress || "",
      seats_won: numberOrZero(row.seats_won),
      votes: row.votes || "",
      vote_share: row.vote_share || "",
      status: row.status || "",
      general_notes: row.general_notes || row.notes || ""
    });
  });

  partyRepRows.forEach(row => {
    const party = ensureParty(parties, row);
    if (!party) return;
    party.representatives.push({
      congress: row.congress || "",
      name: row.representative_name || row.rep_name || row.name || "",
      seat_no: row.seat_no || "",
      term_start: row.term_start || "",
      term_end: row.term_end || "",
      role: row.role || "Representative",
      notes: row.notes || ""
    });
  });

  partyNoteRows.forEach(row => {
    const party = ensureParty(parties, row);
    if (!party) return;
    party.notes.push({
      date: row.date || "",
      type: row.note_type || row.type || "Note",
      title: row.title || "",
      description: row.description || row.notes || "",
      source: row.source || ""
    });
  });

  const partylists = Array.from(parties.values()).map(party => {
    party.history.sort((a, b) => numberOrZero(a.election_year) - numberOrZero(b.election_year));
    party.total_seat_terms = party.history.reduce((sum, row) => sum + numberOrZero(row.seats_won), 0);
    party.active_congresses = party.history.filter(row => numberOrZero(row.seats_won) > 0).map(row => row.congress);
    party.latest_congress = party.history[party.history.length - 1]?.congress || "";
    party.latest_seats = numberOrZero(party.history[party.history.length - 1]?.seats_won);
    party.first_seats = numberOrZero(party.history[0]?.seats_won);
    party.election_count = party.history.length;
    party.one_time_winner = party.history.filter(h => numberOrZero(h.seats_won) > 0).length === 1;

    const statusText = [
      ...party.history.map(row => `${row.status} ${row.general_notes}`),
      ...party.notes.map(note => `${note.type} ${note.title} ${note.description}`)
    ].join(" ").toLowerCase();

    party.has_adverse_note = [
      "disqualified", "cancelled", "canceled", "delisted", "denied", "pending", "case", "cancellation", "registration"
    ].some(term => statusText.includes(term));

    return party;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const congresses = [...new Set([
    ...allTerms.map(t => t.congress),
    ...partylists.flatMap(p => p.history.map(h => h.congress))
  ].filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b));

  const summary = congresses.map(congress => {
    const repTerms = allTerms.filter(t => t.congress === congress);
    const partyRows = partylists.map(p => ({ party: p, row: p.history.find(h => h.congress === congress) })).filter(x => x.row);
    return {
      congress,
      election_year: numberOrZero(repTerms[0]?.election_year || partyRows[0]?.row?.election_year),
      district_reps: repTerms.filter(t => String(t.seat_type).toLowerCase() === "district").length,
      partylist_reps_in_house_terms: repTerms.filter(t => String(t.seat_type).toLowerCase() === "partylist").length,
      partylists: partyRows.filter(x => numberOrZero(x.row.seats_won) > 0).length,
      partylist_seats: partyRows.reduce((sum, x) => sum + numberOrZero(x.row.seats_won), 0),
      flagged_partylists: partyRows.filter(x => x.party.has_adverse_note).length
    };
  });

  const database = {
    generated_at: new Date().toISOString(),
    reps: repList,
    terms: allTerms,
    districts,
    partylists,
    congresses,
    summary
  };

  fs.writeFileSync(DATABASE_JSON, JSON.stringify(database, null, 2), "utf8");
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2), "utf8");

  console.log("Converted Congress CSV files to JSON.");
  console.log(`Representatives: ${repList.length}`);
  console.log(`Districts: ${districts.length}`);
  console.log(`Partylists: ${partylists.length}`);
  console.log(`Congresses: ${congresses.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
