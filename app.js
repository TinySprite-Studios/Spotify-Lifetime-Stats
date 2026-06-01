const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const downloadMdBtn = document.getElementById("downloadMdBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const jumpNav = document.getElementById("jumpNav");
const backToTopBtn = document.getElementById("backToTopBtn");

let latestMarkdown = "";
let latestYearCsv = "";

const stats = {
  totalMs: 0,
  totalPlays: 0,
  filesRead: 0,
  firstListen: null,
  lastListen: null,
  artists: new Map(),
  songs: new Map(),
  years: new Map(),
  days: new Map(),
  hours: new Map(),
  weekdays: new Map()
};

function resetStats() {
  stats.totalMs = 0;
  stats.totalPlays = 0;
  stats.filesRead = 0;
  stats.firstListen = null;
  stats.lastListen = null;
  stats.artists = new Map();
  stats.songs = new Map();
  stats.years = new Map();
  stats.days = new Map();
  stats.hours = new Map();
  stats.weekdays = new Map();
}

function addToMap(map, key, ms) {
  if (!map.has(key)) map.set(key, { ms: 0, plays: 0 });
  const entry = map.get(key);
  entry.ms += ms;
  entry.plays += 1;
}

function hours(ms) {
  return Math.round((ms / 1000 / 60 / 60) * 100) / 100;
}

function safeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sortByMs(map, limit = 25) {
  return [...map.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, limit);
}

function sortByPlays(map, limit = 25) {
  return [...map.entries()].sort((a, b) => b[1].plays - a[1].plays).slice(0, limit);
}

function getItemFields(item) {
  const ms = Number(item.ms_played ?? item.msPlayed ?? 0);
  const artist = item.master_metadata_album_artist_name || item.artistName || "Unknown Artist";
  const track = item.master_metadata_track_name || item.trackName || "Unknown Track";
  const time = item.ts || item.endTime || null;
  return { ms, artist, track, time };
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

async function processFiles() {
  const files = [...fileInput.files].filter(file =>
    file.name.toLowerCase().endsWith(".json") &&
    file.name.toLowerCase().includes("streaming_history_audio")
  );

  if (!files.length) {
    statusEl.textContent = "No audio JSON files selected. Select Streaming_History_Audio_*.json files.";
    return;
  }

  resetStats();
  resultsEl.classList.add("hidden");
  jumpNav.classList.add("hidden");
  downloadMdBtn.disabled = true;
  downloadCsvBtn.disabled = true;

  for (const file of files) {
    statusEl.textContent = `Reading ${file.name}...`;

    try {
      const json = await readJsonFile(file);
      stats.filesRead++;

      for (const item of json) {
        const { ms, artist, track, time } = getItemFields(item);
        if (!ms || ms <= 0) continue;

        stats.totalMs += ms;
        stats.totalPlays++;

        addToMap(stats.artists, artist, ms);
        addToMap(stats.songs, `${artist} - ${track}`, ms);

        if (time) {
          const date = new Date(time);
          if (!Number.isNaN(date.getTime())) {
            if (!stats.firstListen || date < stats.firstListen) stats.firstListen = date;
            if (!stats.lastListen || date > stats.lastListen) stats.lastListen = date;

            addToMap(stats.years, String(date.getFullYear()), ms);
            addToMap(stats.days, date.toISOString().slice(0, 10), ms);
            addToMap(stats.hours, String(date.getHours()).padStart(2, "0") + ":00", ms);
            addToMap(stats.weekdays, date.toLocaleDateString("en-GB", { weekday: "long" }), ms);
          }
        }
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Failed reading ${file.name}: ${err.message}`;
      return;
    }
  }

  statusEl.textContent = "Done. Stats generated.";
  renderResults();
}

function table(id, title, headers, rows) {
  return `
    <div class="section" id="${id}">
      <h2>${safeText(title)}</h2>
      <table>
        <thead><tr>${headers.map(h => `<th>${safeText(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${safeText(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderResults() {
  const totalHours = hours(stats.totalMs);
  const totalDays = Math.round((totalHours / 24) * 100) / 100;
  const totalYears = Math.round((totalDays / 365) * 100) / 100;
  const spanDays = stats.firstListen && stats.lastListen
    ? Math.max(1, Math.round((stats.lastListen - stats.firstListen) / 86400000))
    : 1;
  const avgHoursPerDay = Math.round((totalHours / spanDays) * 100) / 100;

  const topArtists = sortByMs(stats.artists).map(([name, v], i) => [i + 1, name, hours(v.ms), v.plays]);
  const topSongsHours = sortByMs(stats.songs).map(([name, v], i) => [i + 1, name, hours(v.ms), v.plays]);
  const topSongsPlays = sortByPlays(stats.songs).map(([name, v], i) => [i + 1, name, v.plays, hours(v.ms)]);
  const years = [...stats.years.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([year, v]) => [year, hours(v.ms), v.plays]);
  const topDay = sortByMs(stats.days, 1)[0];

  resultsEl.innerHTML = `
    <div id="summary" class="section">
      <h2>Summary</h2>
      <div class="grid">
        <div class="stat"><div class="label">Lifetime Hours</div><div class="value">${totalHours.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Lifetime Days</div><div class="value">${totalDays.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Years of Music</div><div class="value">${totalYears.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Plays Counted</div><div class="value">${stats.totalPlays.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Unique Artists</div><div class="value">${stats.artists.size.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Unique Songs</div><div class="value">${stats.songs.size.toLocaleString()}</div></div>
        <div class="stat"><div class="label">Average Hours Per Day</div><div class="value">${avgHoursPerDay}</div></div>
        <div class="stat"><div class="label">Files Read</div><div class="value">${stats.filesRead}</div></div>
      </div>
    </div>

    ${table("date-range", "Date Range", ["Stat", "Value"], [
      ["First recorded listen", stats.firstListen ? stats.firstListen.toLocaleString() : "Unknown"],
      ["Last recorded listen", stats.lastListen ? stats.lastListen.toLocaleString() : "Unknown"],
      ["Most listened day", topDay ? `${topDay[0]} - ${hours(topDay[1].ms)} hours, ${topDay[1].plays} plays` : "Unknown"]
    ])}

    ${table("top-artists", "Top 25 Artists by Hours", ["Rank", "Artist", "Hours", "Plays"], topArtists)}
    ${table("top-songs-hours", "Top 25 Songs by Hours", ["Rank", "Song", "Hours", "Plays"], topSongsHours)}
    ${table("top-songs-plays", "Top 25 Songs by Play Count", ["Rank", "Song", "Plays", "Hours"], topSongsPlays)}
    ${table("hours-per-year", "Hours Per Year", ["Year", "Hours", "Plays"], years)}
  `;

  latestMarkdown = buildMarkdown(totalHours, totalDays, totalYears, avgHoursPerDay, topArtists, topSongsHours, topSongsPlays, years, topDay);
  latestYearCsv = "Year,Hours,Plays\n" + years.map(row => row.join(",")).join("\n");

  resultsEl.classList.remove("hidden");
  jumpNav.classList.remove("hidden");
  downloadMdBtn.disabled = false;
  downloadCsvBtn.disabled = false;
}

function mdTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function buildMarkdown(totalHours, totalDays, totalYears, avgHoursPerDay, topArtists, topSongsHours, topSongsPlays, years, topDay) {
  return `# Spotify Lifetime Stats

Generated: ${new Date().toLocaleString()}

## Summary

${mdTable(["Stat", "Value"], [
  ["JSON audio files read", stats.filesRead],
  ["Listening entries counted", stats.totalPlays],
  ["Lifetime listened hours", totalHours],
  ["Lifetime listened days", totalDays],
  ["Equivalent years of music", totalYears],
  ["Unique artists", stats.artists.size],
  ["Unique songs", stats.songs.size],
  ["Average hours per day", avgHoursPerDay],
  ["First recorded listen", stats.firstListen ? stats.firstListen.toLocaleString() : "Unknown"],
  ["Last recorded listen", stats.lastListen ? stats.lastListen.toLocaleString() : "Unknown"],
  ["Most listened day", topDay ? `${topDay[0]} - ${hours(topDay[1].ms)} hours, ${topDay[1].plays} plays` : "Unknown"]
])}

## Top 25 Artists by Hours

${mdTable(["Rank", "Artist", "Hours", "Plays"], topArtists)}

## Top 25 Songs by Hours

${mdTable(["Rank", "Song", "Hours", "Plays"], topSongsHours)}

## Top 25 Songs by Play Count

${mdTable(["Rank", "Song", "Plays", "Hours"], topSongsPlays)}

## Hours Per Year

${mdTable(["Year", "Hours", "Plays"], years)}

## Notes

Video files were ignored. This only counted Streaming_History_Audio_*.json files.
Files were processed locally in your browser.
`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

processBtn.addEventListener("click", processFiles);
downloadMdBtn.addEventListener("click", () => downloadFile("Spotify_Full_Stats.md", latestMarkdown, "text/markdown"));
downloadCsvBtn.addEventListener("click", () => downloadFile("Spotify_Yearly_Stats.csv", latestYearCsv, "text/csv"));
backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
