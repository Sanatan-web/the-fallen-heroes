(async () => {
"use strict";

/* ---------------------------------------------------------------- data */
// Researched records stay in /data as delivered. This file only normalises them for
// display: it never rewrites names, dates, facts, coordinates or source links.
const DATA_DIR = "../data/";
async function loadJSON(name) {
  const res = await fetch(DATA_DIR + name);
  if (!res.ok) throw new Error(`${name} (${res.status})`);
  return res.json();
}
async function loadData() {
  const [research, enrich, portraits, states, india, labels] = await Promise.all([
    loadJSON("soldiers.json"), loadJSON("enrichments.json"), loadJSON("portraits.json"),
    loadJSON("geo/india-state-lines.json"), loadJSON("geo/india-outline.json"), loadJSON("geo/india-state-labels.json"),
  ]);
  return { RESEARCH: research, ENRICH: enrich, PORTRAITS: portraits, GEO: { states, india, labels } };
}
const { RESEARCH, ENRICH, PORTRAITS, GEO } = await loadData();

const RANK_SHORT = {
  "Lieutenant General": "Lt Gen", "Major General": "Maj Gen", Brigadier: "Brig", Colonel: "Col",
  "Lieutenant Colonel": "Lt Col", Major: "Maj.", Captain: "Capt.", Lieutenant: "Lt", "Second Lieutenant": "2/Lt",
  "Subedar Major": "Sub Maj", Subedar: "Sub.", "Naib Subedar": "Nb Sub", "Company Havildar Major": "CHM",
  "Company Quartermaster Havildar": "CQMH", Havildar: "Hav", Naik: "Nk", "Lance Naik": "L/Nk", Sepoy: "Sep",
  Rifleman: "Rfn", Grenadier: "Gdr", "Company Quarter Master Havildar": "CQMH", "Company Quartermaster Havildar": "CQMH", Colonel: "Col", "Flying Officer": "Fg Offr", "Flight Lieutenant": "Flt Lt",
  "Squadron Leader": "Sqn Ldr", "Wing Commander": "Wg Cdr",
};
const PRECISION = { exact_birthplace: "village", exact: "exact", village_birthplace: "village", town_birthplace: "town", district_headquarters: "district", unknown: "unknown" };
const clean = (v) => (v === null || v === undefined || v === "" ? undefined : v);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const key = String(i.url ?? i.src ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
// Sources may be plain URLs or objects; both keep the researched link untouched.
const asSource = (s) => (typeof s === "string" ? { title: hostOf(s), url: s } : { title: s.title ?? hostOf(s.url), url: s.url, publisher: clean(s.publisher ?? s.source_name) });
const asMedia = (v) => {
  const url = typeof v === "string" ? v : v.url;
  return { type: /youtu\.?be/.test(url ?? "") ? "youtube" : "other", title: (typeof v === "object" && clean(v.title)) || "Watch", url, publisher: typeof v === "object" ? clean(v.source_name ?? v.publisher) : undefined };
};

function fromResearch(r, e = {}, portraits = {}) {
  const bp = r.birthplace ?? {}, m = r.mapping ?? {};
  const rank = clean(r.rank_at_death) ?? clean(r.rank);
  const precision = e.precision ?? PRECISION[m.type] ?? "town";
  const imageUrl = clean(r.image_source?.url);
  const localFile = clean(portraits[r.id]);
  const imageCredit = clean(r.image_source?.source_name) ? { text: r.image_source.source_name, url: imageUrl } : undefined;
  const conflict = clean(r.conflict) ?? clean(r.conflict_or_operation);
  const operation = clean(r.operation);
  return {
    id: r.id,
    name: r.full_name ?? r.name,
    rank,
    rankShort: rank ? RANK_SHORT[rank] : undefined,
    posthumousRank: clean(r.posthumous_rank),
    pronoun: e.pronoun,
    // The record's own image first, then any verified fallback. Nothing is substituted.
    portraits: dedupe([
      ...(localFile ? [{ src: "../" + localFile, caption: clean(r.image_source?.title), credit: imageCredit }] : []),
      ...(imageUrl ? [{ src: imageUrl, caption: clean(r.image_source?.title), credit: imageCredit }] : []),
      ...(e.portraits ?? []),
    ]),
    dates: { birth: clean(r.date_of_birth), death: clean(r.date_of_death) },
    posthumous: r.posthumous ?? r.died_in_service ?? e.posthumous ?? Boolean(r.date_of_death),
    birthplace: {
      village: clean(bp.village), town: clean(bp.town), district: clean(bp.district),
      state: bp.state, country: bp.country,
      latitude: m.mapped_latitude, longitude: m.mapped_longitude, precision,
    },
    // Kept apart from the documented birthplace above, so the map location is never
    // presented as the exact birthplace.
    mapNote: precision === "district"
      ? `Shown on the map at ${clean(m.mapped_name) ?? (clean(bp.district) ? bp.district + " district headquarters" : "the district headquarters")}.`
      : undefined,
    service: { branch: clean(r.service), regiment: clean(r.regiment), unit: clean(r.unit), operation, conflict, year: r.date_of_death ? Number(r.date_of_death.slice(0, 4)) : undefined },
    awards: clean(r.award) ? [r.award] : clean(r.awards),
    biography: clean(r.short_biography) ?? clean(r.biography),
    actOfValor: clean(r.act_of_valor) ?? clean(r.act_of_decision),
    media: dedupe([...(r.video_sources ?? []).map(asMedia), ...(e.media ?? [])]),
    sources: dedupe([...(r.sources ?? []).map(asSource), ...(e.sources ?? [])]),
    recordNotes: e.recordNotes,
  };
}
// Records without usable coordinates stay in the data file but cannot be mapped.
const SOLDIERS = (Array.isArray(RESEARCH) ? RESEARCH : (RESEARCH.soldiers ?? []))
  .map((r) => (r.full_name || r.name ? fromResearch(r, ENRICH[r.id] ?? {}, PORTRAITS) : r))
  .filter((s) => s.posthumous !== false && Number.isFinite(s.birthplace?.latitude) && Number.isFinite(s.birthplace?.longitude));

/* ------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileQuery = matchMedia("(max-width: 767px)");
const isMobile = () => mobileQuery.matches;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ICONS = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
};
const icon = (name, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = icon(el.dataset.icon, el.dataset.icon === "scan" ? 14 : 15)));

const parseDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return y ? { y, m, d } : null; };
const formatDate = (iso) => { const p = parseDate(iso); if (!p) return null; if (p.m && p.d) return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`; if (p.m) return `${MONTHS[p.m - 1]} ${p.y}`; return String(p.y); };
const yearOf = (iso) => parseDate(iso)?.y ?? null;
const ageAtDeath = (s) => {
  const b = parseDate(s.dates?.birth), d = parseDate(s.dates?.death);
  if (!b?.m || !b.d || !d?.m || !d.d) return null;
  let a = d.y - b.y; if (d.m < b.m || (d.m === b.m && d.d < b.d)) a -= 1; return a;
};
const lifeSpan = (s) => { const b = yearOf(s.dates?.birth), d = yearOf(s.dates?.death); if (b && d) return `${b} \u2013 ${d}`; if (d) return `Died ${d}`; return b ? `Born ${b}` : null; };
const actionYear = (s) => s.service?.year ?? yearOf(s.dates?.death);
const nameWithRank = (s) => (s.rankShort ? `${s.rankShort} ${s.name}` : s.name);
const initials = (n) => { const p = n.split(/\s+/).filter(Boolean); return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
const settlement = (bp) => bp.village ?? bp.town ?? (bp.district ? `${bp.district} district` : bp.state);
const abroad = (bp) => (bp.country && bp.country !== "India" ? `, ${bp.country}` : "");
const shortPlace = (bp) => `${settlement(bp)}, ${bp.state}${abroad(bp)}`;
const fullPlace = (bp) => {
  const parts = [bp.historicalName ? `${settlement(bp)} (then ${bp.historicalName})` : settlement(bp)];
  if (bp.district && (bp.village || bp.town) && bp.district !== settlement(bp)) parts.push(`${bp.district} district`);
  parts.push(bp.state); return parts.join(", ") + abroad(bp);
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const storyHeading = (s) => ({ he: "His story", she: "Her story", they: "Their story" })[s.pronoun] ?? "Life";
const hostname = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/* ------------------------------------------------------------- places */
const placeLabel = (bp) => ((bp.precision ?? "town") === "district" && bp.district ? `${bp.district} district` : bp.village ?? bp.town ?? `${bp.district} district`);
const slug = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const soldierById = new Map(SOLDIERS.map((s) => [s.id, s]));
const placeById = new Map();
const placeIdBySoldier = new Map();
for (const s of SOLDIERS) {
  const bp = s.birthplace, label = placeLabel(bp), id = slug(`${label}-${bp.state}`);
  if (!placeById.has(id)) placeById.set(id, { id, label, state: bp.state, sum: [0, 0], soldierIds: [] });
  const p = placeById.get(id); p.soldierIds.push(s.id); p.sum[0] += bp.longitude; p.sum[1] += bp.latitude;
  placeIdBySoldier.set(s.id, id);
}
const places = [...placeById.values()].map((p) => ((p.lngLat = [p.sum[0] / p.soldierIds.length, p.sum[1] / p.soldierIds.length]), p));
const countFor = (ids) => ids.reduce((n, id) => n + (placeById.get(id)?.soldierIds.length ?? 0), 0);
const sortByAction = (a, b) => (actionYear(a) ?? 0) - (actionYear(b) ?? 0) || a.name.localeCompare(b.name);
const groupsFor = (ids) => ids.map((id) => placeById.get(id)).filter(Boolean)
  .sort((a, b) => b.lngLat[1] - a.lngLat[1])
  .map((place) => ({ place, soldiers: place.soldierIds.map((id) => soldierById.get(id)).sort(sortByAction) }));
function describe(ids) {
  const ps = ids.map((id) => placeById.get(id)).filter(Boolean);
  const count = countFor(ids), countLabel = plural(count, "fallen hero", "fallen heroes");
  if (ps.length === 1) return { title: ps[0].label, subtitle: ps[0].state, count, countLabel };
  const states = [...new Set(ps.map((p) => p.state))];
  const title = states.length === 1 ? states[0] : states.length === 2 ? `${states[0]} and ${states[1]}` : `${states[0]}, ${states[1]} and ${plural(states.length - 2, "more state", "more states")}`;
  return { title, subtitle: plural(ps.length, "place", "places"), count, countLabel };
}
function labelFor(ids) {
  if (countFor(ids) === 1) { const s = soldierById.get(placeById.get(ids[0]).soldierIds[0]); return `${nameWithRank(s)}, ${shortPlace(s.birthplace)}. Open profile.`; }
  const d = describe(ids); return `${d.title}, ${d.subtitle}: ${d.countLabel}. Open list.`;
}

/* The About panel describes the archive from the data itself, never a fixed number. */
(() => {
  const el = $("#about-scope");
  if (!el) return;
  const awards = [...new Set(SOLDIERS.flatMap((s) => s.awards ?? []))];
  const list = awards.length > 1 ? `${awards.slice(0, -1).join(", ")} and ${awards[awards.length - 1]}` : awards[0];
  const who = `${SOLDIERS.length} ${SOLDIERS.length === 1 ? "person is" : "people are"} recorded so far`;
  el.textContent = awards.length ? `${who}, honoured with the ${list}.` : `${who}.`;
})();

/* ---------------------------------------------------------------- map */
// Leaflet draws imagery as plain images and boundaries as SVG, so it needs no
// graphics acceleration. Coordinates in the data are [lng, lat]; Leaflet wants [lat, lng].
const INDIA_BOUNDS = [[68.1, 6.6], [97.4, 37.1]];
// ---- Satellite basemap: the base layer of the whole experience ------------
// Esri World Imagery is publicly reachable and fine for development and testing.
// For a public launch, swap in a licensed provider (see README): only these lines change.
const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  name: "Esri World Imagery",
  maxNativeZoom: 18,
};
const ll = ([lng, lat]) => L.latLng(lat, lng);
const llBounds = (pts) => L.latLngBounds(pts.map(ll));
// Leaflet counts zoom with 256px tiles, one level above the 512px scale used elsewhere in the app.
const toLeafletZoom = (z) => z + 1;
let W = innerWidth, H = innerHeight, map = null, mapReady = false;
let stateCasing, stateLines, indiaCasing, indiaLine, labels = [], boundariesOn = true;

function launchPad() { return isMobile() ? { top: 120, bottom: 64, left: 16, right: 16 } : { top: 110, bottom: 90, left: 48, right: 48 }; }
function safePadding(p) {
  const sx = Math.min(1, (W - 80) / Math.max(1, p.left + p.right)), sy = Math.min(1, (H - 80) / Math.max(1, p.top + p.bottom));
  return { top: p.top * sy, bottom: p.bottom * sy, left: p.left * sx, right: p.right * sx };
}
const padOpts = (p) => ({ paddingTopLeft: [p.left, p.top], paddingBottomRight: [p.right, p.bottom] });
const notice = $("#notice");
function showNotice(text) { notice.textContent = text; notice.hidden = false; setTimeout(() => (notice.hidden = true), 8000); }
function failMap(title, detail) {
  const el = document.createElement("div");
  el.className = "map-failed";
  el.innerHTML = `<div><p>${esc(title)}</p><p>${esc(detail)}</p><button type="button" class="nav-btn" style="margin:16px auto 0;border:1px solid var(--rule)">Search the archive</button></div>`;
  el.querySelector("button").addEventListener("click", () => openSearch());
  document.body.append(el);
}

if (typeof L === "undefined") {
  failMap("The map library could not be downloaded.", "Check your internet connection, or whether this network blocks unpkg.com. Every record is still available through search.");
} else {
  try {
    map = L.map("map", {
      zoomControl: false, attributionControl: false,
      zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 100,
      minZoom: 3, maxZoom: 17,
      maxBounds: L.latLngBounds([[-12, 38], [50, 127]]), maxBoundsViscosity: 0.9,
    });
    // Real satellite photography is the base layer. Nothing is drawn underneath it.
    const imagery = L.tileLayer(SATELLITE.url, { maxNativeZoom: SATELLITE.maxNativeZoom, maxZoom: 17, className: "imagery" });
    watchImagery(imagery);
    imagery.addTo(map);

    // Drawn on top of the photograph: thin state lines (switchable), then India's border.
    const quiet = { interactive: false };
    stateCasing = L.geoJSON(GEO.states, { ...quiet, style: { color: "#000", opacity: 0.35, lineJoin: "round", lineCap: "round" } }).addTo(map);
    stateLines = L.geoJSON(GEO.states, { ...quiet, style: { color: "#f4f0e7", lineJoin: "round", lineCap: "round" } }).addTo(map);
    // India's national border, following the official Survey of India boundary with the
    // complete Jammu and Kashmir and Ladakh. Always shown, never a filled shape.
    indiaCasing = L.geoJSON(GEO.india, { ...quiet, style: { color: "#000", opacity: 0.55, fill: false, lineJoin: "round" } }).addTo(map);
    indiaLine = L.geoJSON(GEO.india, { ...quiet, style: { color: "#f7f3eb", opacity: 0.95, fill: false, lineJoin: "round" } }).addTo(map);

    map.fitBounds(llBounds(INDIA_BOUNDS), { ...padOpts(launchPad()), animate: false });
    map.getContainer().setAttribute("aria-label", "Map of India. Use arrow keys to pan and plus or minus to zoom.");

    /* State names: italic serif, the cartographic convention for regions. */
    labels = GEO.labels.features.map((f) => {
      const m = L.marker(ll(f.geometry.coordinates), {
        icon: L.divIcon({ className: "state-label", html: `<span>${esc(f.properties.name)}</span>`, iconSize: [0, 0] }),
        interactive: false, keyboard: false, zIndexOffset: -1000,
      }).addTo(map);
      return { el: m.getElement(), minzoom: f.properties.minzoom };
    });

    map.on("zoomstart movestart", () => hideTooltip());
    map.on("zoomstart", () => (leader.style.visibility = "hidden"));
    map.on("zoomend", () => { leader.style.visibility = ""; styleLines(); renderMap(); });
    map.on("move", () => { updateLeader(); renderEdgeHints(); });
    mapReady = true;
  } catch (err) {
    console.error(err);
    map = null;
    failMap("The map could not load on this device.", "Every record is still available through search.");
  }
}

function styleLines() {
  const t = Math.max(0, Math.min(1, (zoomLevel() - 3) / 5));
  stateCasing.setStyle({ weight: 2 + 1.2 * t });
  stateLines.setStyle({ weight: 0.8 + 0.5 * t, opacity: 0.55 + 0.2 * t });
  indiaCasing.setStyle({ weight: 3.6 + 2 * t });
  indiaLine.setStyle({ weight: 1.6 + 1 * t });
}

/* If the imagery provider cannot be reached, say so plainly. */
function watchImagery(layer) {
  let loaded = 0, failed = 0;
  layer.on("tileload", () => { loaded += 1; });
  layer.on("tileerror", () => {
    failed += 1;
    if (loaded === 0 && failed >= 4) {
      notice.textContent = "Satellite imagery is not loading. Please check your internet connection.";
      notice.hidden = false;
    }
  });
}

function setBoundaries(on) {
  boundariesOn = on;
  for (const layer of [stateCasing, stateLines]) on ? layer.addTo(map) : layer.remove();
  indiaCasing.bringToFront(); indiaLine.bringToFront(); // the national border stays on top
  const btn = $("#toggle-boundaries");
  btn.setAttribute("aria-pressed", String(on));
  btn.title = on ? "Hide state boundaries" : "Show state boundaries";
  renderLabels();
}

const toScreen = (lngLat) => { const p = map.latLngToContainerPoint(ll(lngLat)); return [p.x, p.y]; };
const zoomLevel = () => map.getZoom() - 1;

function renderLabels() {
  const z = zoomLevel();
  for (const l of labels) l.el.classList.toggle("is-visible", boundariesOn && z >= l.minzoom);
}

/* Clustering in screen space; a cluster keeps its key while its members stay the same. */
const RADIUS = 38;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function computeClusters() {
  const pts = places.map((p) => { const [x, y] = toScreen(p.lngLat); return { p, x, y }; })
    .sort((a, b) => b.p.soldierIds.length - a.p.soldierIds.length || a.p.id.localeCompare(b.p.id));
  const used = new Set(), out = [];
  for (const a of pts) {
    if (used.has(a.p.id)) continue;
    const members = pts.filter((b) => !used.has(b.p.id) && Math.hypot(a.x - b.x, a.y - b.y) <= RADIUS);
    members.forEach((m) => used.add(m.p.id));
    const placeIds = members.map((m) => m.p.id).sort();
    const lngLat = [mean(members.map((m) => m.p.lngLat[0])), mean(members.map((m) => m.p.lngLat[1]))];
    out.push({ key: placeIds.join("|"), placeIds, count: countFor(placeIds), lngLat });
  }
  return out;
}

const entries = new Map();
let revealed = false, selected = null;
const ringSize = (n) => (n <= 1 ? 16 : Math.round(Math.min(40, 16 + Math.sqrt(n) * 6)));
function renderMarkers() {
  const seen = new Set(), created = [];
  for (const c of computeClusters()) {
    seen.add(c.key);
    let e = entries.get(c.key);
    if (!e) { e = createMarker(c); entries.set(c.key, e); created.push(e); }
    e.c = c;
    e.marker.setLatLng(ll(c.lngLat));
  }
  for (const [k, e] of entries) if (!seen.has(k)) { e.marker.remove(); entries.delete(k); }
  if (!revealed && created.length) {
    revealed = true;
    if (!reduced) created.sort((a, b) => b.c.lngLat[1] - a.c.lngLat[1]).forEach((e, i) => (e.button.style.animationDelay = `${250 + i * 70}ms`));
  }
}
function createMarker(c) {
  const html = `<button type="button" class="mm" style="--ring:${ringSize(c.count)}px" aria-label="${esc(labelFor(c.placeIds))}"><span class="mm-ring"></span><span class="mm-core"></span>${c.count > 1 ? `<span class="mm-count" aria-hidden="true">${c.count}</span>` : ""}</button>`;
  const marker = L.marker(ll(c.lngLat), {
    icon: L.divIcon({ className: "mm-wrap", html, iconSize: [30, 30], iconAnchor: [15, 15] }),
    keyboard: false,
  }).addTo(map);
  const wrap = marker.getElement(), b = wrap.querySelector("button");
  L.DomEvent.disableClickPropagation(wrap);
  const e = { marker, wrap, button: b, c };
  const show = () => showTooltip(e.c), hide = () => hideTooltip();
  b.addEventListener("mouseenter", show); b.addEventListener("focus", show);
  b.addEventListener("mouseleave", hide); b.addEventListener("blur", hide);
  b.addEventListener("click", (ev) => { ev.stopPropagation(); hide(); activate(e.c.placeIds, e.c.lngLat); });
  applySelection(e);
  return e;
}
function applySelection(e) {
  const hit = selected ? e.c.placeIds.some((id) => selected.has(id)) : false;
  e.button.classList.toggle("is-selected", hit);
  e.wrap.classList.toggle("is-dimmed", Boolean(selected) && !hit);
  e.marker.setZIndexOffset(hit ? 1000 : 0);
}
function renderMap() { if (!map) return; renderMarkers(); renderLabels(); updateLeader(); renderEdgeHints(); }

/* ----------------------------------------------------------- edge hints */
const hintsEl = $("#edge-hints");
const CHEVRON = { top: "m18 15-6-6-6 6", bottom: "m6 9 6 6 6-6", left: "m15 18-6-6 6-6", right: "m9 18 6-6-6-6" };
const DIRECTION = { top: "north", bottom: "south", left: "west", right: "east" };
let hintGroups = {};
function visibleArea() {
  let right = W, bottom = H;
  if (isOpen() && drawer.classList.contains("is-open")) {
    if (isMobile()) bottom = H * (1 - (state.expanded ? SHEET_FULL : SHEET_PEEK));
    else right = drawer.getBoundingClientRect().left;
  }
  return { left: 0, top: 96, right, bottom };
}
function renderEdgeHints() {
  if (!map) return;
  const a = visibleArea(), cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
  const hw = Math.max(1, (a.right - a.left) / 2), hh = Math.max(1, (a.bottom - a.top) / 2);
  const groups = {};
  for (const p of places) {
    const [x, y] = toScreen(p.lngLat);
    if (x >= a.left + 12 && x <= a.right - 12 && y >= a.top && y <= a.bottom - 12) continue;
    const dx = (x - cx) / hw, dy = (y - cy) / hh;
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
    (groups[side] ??= []).push({ p, x, y });
  }
  hintGroups = groups;
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  hintsEl.innerHTML = Object.entries(groups).map(([side, items]) => {
    const n = items.reduce((k, i) => k + i.p.soldierIds.length, 0);
    const mx = mean(items.map((i) => i.x)), my = mean(items.map((i) => i.y));
    const x = side === "left" ? a.left + 40 : side === "right" ? a.right - 40 : clampTo(mx, a.left + 160, a.right - 160);
    const y = side === "top" ? a.top + 22 : side === "bottom" ? a.bottom - 40 : clampTo(my, a.top + 60, a.bottom - 120);
    const label = `${plural(n, "more person", "more people")} to the ${DIRECTION[side]}`;
    return `<button type="button" class="edge-hint" data-side="${side}" style="left:${x}px;top:${y}px" title="${label}" aria-label="${label}. Show on map.">` +
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CHEVRON[side]}"/></svg><span>${n}</span></button>`;
  }).join("");
}
// Widen the view just enough to bring those people in, keeping where the reader already is.
hintsEl.addEventListener("click", (e) => {
  const b = e.target.closest(".edge-hint");
  const items = b && hintGroups[b.dataset.side];
  if (!map || !items?.length) return;
  const bounds = map.getBounds();
  items.forEach((i) => bounds.extend(ll(i.p.lngLat)));
  const pad = safePadding(isOpen() ? fitPadding() : launchPad());
  if (reduced) map.fitBounds(bounds, { ...padOpts(pad), animate: false });
  else map.flyToBounds(bounds, { ...padOpts(pad), duration: 0.8 });
});

/* ------------------------------------------------------------ tooltip */
const tip = $("#tooltip");
function showTooltip(c) {
  let title, lines;
  if (c.count === 1) { const s = soldierById.get(placeById.get(c.placeIds[0]).soldierIds[0]); title = nameWithRank(s); lines = [shortPlace(s.birthplace)]; }
  else { const d = describe(c.placeIds); title = d.title; lines = [d.subtitle, d.countLabel]; }
  tip.innerHTML = `<p class="t">${esc(title)}</p>${lines.map((l) => `<p class="l">${esc(l)}</p>`).join("")}`;
  const [x, y] = toScreen(c.lngLat), flip = x > W - 260;
  tip.style.left = flip ? "auto" : `${x + 18}px`;
  tip.style.right = flip ? `${W - x + 18}px` : "auto";
  tip.style.top = `${y}px`;
  tip.hidden = false;
}
function hideTooltip() { tip.hidden = true; }

/* ------------------------------------------------------------- camera */
const SHEET_PEEK = 0.56, SHEET_FULL = 0.92, HEADER_H = 96;
const ms = (n) => (reduced ? 0 : n);
const drawerWidth = () => Math.min(432, Math.max(340, W * 0.3));
const cameraOffset = () => (isMobile() ? [0, (HEADER_H - H * SHEET_PEEK) / 2] : [-(drawerWidth() + 32) / 2, 34]);
const fitPadding = () => (isMobile()
  ? { top: HEADER_H + 24, bottom: H * SHEET_PEEK + 32, left: 40, right: 40 }
  : { top: 120, bottom: 90, left: 90, right: drawerWidth() + 96 });
function focusCamera(lngLat, { minZoom = 6, fly = false } = {}) {
  if (!map) return;
  // Put the place at the centre of the map area the drawer leaves uncovered.
  const z = Math.max(map.getZoom(), toLeafletZoom(minZoom));
  const [ox, oy] = cameraOffset();
  const center = map.unproject(map.project(ll(lngLat), z).subtract(L.point(ox, oy)), z);
  if (reduced) map.setView(center, z, { animate: false });
  else map.flyTo(center, z, { duration: fly ? 1.2 : 0.6 });
}
function fitCamera(lngLats) {
  if (!map) return;
  // Zoom far enough that the chosen marks separate, but never past what fits.
  const pts = lngLats.map((l) => map.latLngToContainerPoint(ll(l)));
  let gap = Infinity;
  pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => (gap = Math.min(gap, a.distanceTo(b)))));
  const separate = Number.isFinite(gap) ? map.getZoom() + Math.log2((RADIUS + 10) / Math.max(gap, 0.01)) : 0;
  const opts = { ...padOpts(safePadding(fitPadding())), maxZoom: Math.min(toLeafletZoom(9), Math.max(toLeafletZoom(6.2), separate)) };
  if (reduced) map.fitBounds(llBounds(lngLats), { ...opts, animate: false });
  else map.flyToBounds(llBounds(lngLats), { ...opts, duration: 0.75 });
}

/* --------------------------------------------------------- leader line */
const leader = $("#leader");
let leaderKey = null;
function leaderAnchor() {
  if (state.soldierId) return placeById.get(placeIdBySoldier.get(state.soldierId)).lngLat;
  if (state.location?.placeIds.length === 1) return state.location.anchor;
  return null; // multi-place selections rely on the lit marks instead
}
function clearLeader() { leader.innerHTML = ""; leaderKey = null; }
function updateLeader() {
  const a = leaderAnchor();
  if (!map || !a || isMobile() || !isOpen() || !drawer.classList.contains("is-open")) return clearLeader();
  const [x1, y1] = toScreen(a);
  const rect = drawer.getBoundingClientRect();
  const head = currentView?.querySelector("[data-leader-anchor]")?.getBoundingClientRect();
  const x2 = rect.left, y2 = head ? head.top + Math.min(head.height / 2, 22) : rect.top + 80;
  if (!(x1 > 0 && y1 > 0 && x1 < W && y1 < H && x1 < x2 - 24)) return clearLeader();
  const key = a.join(",");
  if (key !== leaderKey || !leader.firstChild) {
    leader.innerHTML = '<path class="leader-draw" pathLength="1" fill="none"/><circle r="2.5"/>';
    leaderKey = key;
  }
  leader.firstChild.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
  leader.lastChild.setAttribute("cx", x2); leader.lastChild.setAttribute("cy", y2);
}

/* -------------------------------------------------------------- state */
const state = { location: null, soldierId: null, dir: 1, expanded: false };
const drawer = $("#drawer"), body = $("#drawer-body");
const isOpen = () => Boolean(state.location || state.soldierId);
let currentView = null, currentKey = "none";

function activate(ids, at) {
  if (countFor(ids) === 1) {
    state.location = { placeIds: ids, anchor: at };
    state.soldierId = placeById.get(ids[0]).soldierIds[0];
    state.dir = 1; render();
    focusCamera(at, { minZoom: isMobile() ? 5 : 5.5 });
    return;
  }
  state.location = { placeIds: ids, anchor: at }; state.soldierId = null; state.dir = -1; state.expanded = false;
  render();
  if (ids.length === 1) focusCamera(at, { minZoom: 6 });
  else fitCamera(ids.map((id) => placeById.get(id).lngLat));
}
function openSoldier(id, camera) {
  const pid = placeIdBySoldier.get(id), place = placeById.get(pid);
  if (!state.location?.placeIds.includes(pid)) state.location = { placeIds: [pid], anchor: place.lngLat };
  state.soldierId = id; state.dir = 1; render();
  if (camera !== "none") focusCamera(place.lngLat, { minZoom: isMobile() ? 5 : 5.8, fly: camera === "fly" });
}
function back() {
  if (state.soldierId && state.location && countFor(state.location.placeIds) > 1) { state.soldierId = null; state.dir = -1; render(); }
  else close();
}
function close() { state.location = null; state.soldierId = null; state.expanded = false; render(); }

function render() {
  const ids = state.soldierId ? [placeIdBySoldier.get(state.soldierId)] : state.location?.placeIds ?? null;
  selected = ids ? new Set(ids) : null;
  entries.forEach(applySelection);

  const key = state.soldierId ? `s:${state.soldierId}` : state.location ? `l:${state.location.placeIds.join(",")}` : "none";
  if (key === currentKey) { syncSheet(); updateLeader(); return; }
  currentKey = key;
  if (key === "none") return closeDrawer();

  openDrawer();
  const view = document.createElement("div");
  view.className = `view enter-${state.dir > 0 ? "fwd" : "back"}`;
  view.innerHTML = state.soldierId ? profileHTML(soldierById.get(state.soldierId)) : locationHTML();
  if (currentView) { const old = currentView; old.classList.add("is-leaving"); setTimeout(() => old.remove(), reduced ? 0 : 180); }
  body.append(view); currentView = view;
  setTimeout(() => view.querySelector("[data-leader-anchor]")?.focus({ preventScroll: true }), 80);
  clearLeader(); updateLeader(); renderEdgeHints();
  setTimeout(() => { updateLeader(); renderEdgeHints(); }, 380); setTimeout(updateLeader, 900);
}

function openDrawer() {
  if (drawer.classList.contains("is-open")) return;
  drawer.hidden = false;
  drawer.classList.toggle("is-sheet", isMobile());
  syncSheet(); void drawer.offsetWidth;
  drawer.classList.add("is-open"); syncSheet();
}
function closeDrawer() {
  drawer.classList.remove("is-open"); syncSheet(); clearLeader(); setTimeout(renderEdgeHints, 340);
  const v = currentView; currentView = null;
  v?.classList.add("is-leaving");
  setTimeout(() => { v?.remove(); if (!isOpen()) drawer.hidden = true; }, reduced ? 0 : 320);
}
function sheetMetrics() { const h = Math.round(H * SHEET_FULL); return { h, peek: Math.round(h - H * SHEET_PEEK) }; }
function syncSheet() {
  if (!isMobile()) { drawer.style.transform = ""; drawer.style.height = ""; drawer.style.removeProperty("--sheet-hidden"); return; }
  const { h, peek } = sheetMetrics();
  drawer.style.height = `${h}px`;
  const y = drawer.classList.contains("is-open") ? (state.expanded ? 0 : peek) : h;
  drawer.style.transform = `translateY(${y}px)`;
  drawer.style.setProperty("--sheet-hidden", `${state.expanded ? 0 : peek}px`);
}

/* Mobile sheet: drag the handle, or tap it to expand and collapse. */
(() => {
  const handle = $("#handle");
  let startY = 0, baseY = 0, y = 0, moved = false, dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    if (!isMobile()) return;
    const { peek } = sheetMetrics();
    dragging = true; moved = false; startY = e.clientY; baseY = state.expanded ? 0 : peek; y = baseY;
    drawer.classList.add("is-dragging"); handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY; if (Math.abs(dy) > 4) moved = true;
    y = Math.max(0, Math.min(sheetMetrics().h, baseY + dy));
    drawer.style.transform = `translateY(${y}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; drawer.classList.remove("is-dragging");
    const { peek } = sheetMetrics();
    if (!moved) state.expanded = !state.expanded;
    else if (y > peek + 110) return close();
    else state.expanded = y < peek / 2;
    syncSheet();
  };
  handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
})();

/* -------------------------------------------------------------- views */
let secId = 0;
const section = (title, html) => { const id = `sec-${++secId}`; return `<section class="sec" aria-labelledby="${id}"><h3 id="${id}">${esc(title)}</h3>${html}</section>`; };
const prose = (text) => `<div class="prose">${text.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;

/* One image per person. Candidates are tried in order; a failed image is skipped
   everywhere, so the list and the profile always settle on the same file. */
const failedImages = new Set();
function candidatesOf(s) {
  const list = [...(s.portraits ?? [])];
  if (s.portrait && !list.some((c) => c.src === s.portrait)) list.unshift({ src: s.portrait, caption: s.portraitCaption, credit: s.portraitCredit, position: s.portraitPosition });
  return list;
}
const currentImage = (s) => candidatesOf(s).find((c) => !failedImages.has(c.src)) ?? null;
const monoHTML = (s) => `<span class="mono" aria-hidden="true">${esc(initials(s.name))}</span>`;
function thumbHTML(s) {
  const c = currentImage(s);
  return c ? `<img class="thumb" src="${esc(c.src)}" alt="" loading="lazy" decoding="async" data-sid="${esc(s.id)}" style="--pos:${esc(c.position ?? "50% 25%")}">` : monoHTML(s);
}
function portraitHTML(s) {
  const c = currentImage(s);
  if (!c) return "";
  const alt = c.caption && !/portrait/i.test(c.caption) ? `${c.caption}, ${s.name}` : `Portrait of ${s.rank ? s.rank + " " : ""}${s.name}`;
  const cr = c.credit;
  const credit = cr ? (cr.url ? `<a href="${esc(cr.url)}" target="_blank" rel="noopener noreferrer">${esc(cr.text)}</a>` : esc(cr.text)) : "";
  return `<figure class="portrait" data-sid="${esc(s.id)}"><img src="${esc(c.src)}" alt="${esc(alt)}" decoding="async" style="--pos:${esc(c.position ?? "50% 25%")}">
    ${c.caption || cr ? `<figcaption>${c.caption ? esc(c.caption) + ". " : ""}${credit}</figcaption>` : ""}</figure>`;
}
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const fig = img.closest("figure.portrait");
  const sid = img.dataset.sid ?? fig?.dataset.sid;
  const s = sid && soldierById.get(sid);
  if (!s) return;
  failedImages.add(img.getAttribute("src"));
  if (img.classList.contains("thumb")) img.outerHTML = thumbHTML(s);
  else if (fig) { const next = portraitHTML(s); if (next) fig.outerHTML = next; else fig.remove(); }
}, true);

function locationHTML() {
  const d = describe(state.location.placeIds), groups = groupsFor(state.location.placeIds), showPlaces = groups.length > 1;
  const rows = groups.map(({ place, soldiers }) => `
    <section${showPlaces ? ` aria-label="${esc(place.label)}, ${esc(place.state)}"` : ""}>
      ${showPlaces ? `<h3 class="group-h">${esc(place.label)}, ${esc(place.state)}</h3>` : ""}
      <ul>${soldiers.map((s) => `
        <li><button class="row" data-action="open-soldier" data-id="${esc(s.id)}">
          ${thumbHTML(s)}
          <span class="who"><span class="nm">${s.rankShort ? `<span class="rk">${esc(s.rankShort)} </span>` : ""}${esc(s.name)}</span>
          ${s.service?.operation ? `<span class="ctx">${esc(s.service.operation)}</span>` : ""}</span>
          ${actionYear(s) ? `<span class="yr">${actionYear(s)}</span>` : ""}
        </button></li>`).join("")}</ul>
    </section>`).join("");
  return `
    <div class="loc-head">
      <button class="icon-btn" data-action="close" aria-label="Close" title="Close">${icon("x")}</button>
      <h2 tabindex="-1" data-leader-anchor>${esc(d.title)}</h2>
      <p class="sub">${esc(d.subtitle)}</p>
      <p class="count">${esc(d.countLabel)}</p>
    </div>
    <div class="scroll list">${rows}</div>`;
}

function mediaHTML(media) {
  if (!media?.length) return '<p class="empty">Media unavailable.</p>';
  return `<ul class="links">${media.map((m) => {
    const kind = m.type === "youtube" ? "Video" : m.type === "article" ? "Article" : null;
    return `<li><a class="lnk" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">
      <span class="ic">${icon(m.type === "youtube" ? "play" : "file", m.type === "youtube" ? 12 : 13)}</span>
      <span class="tx"><span class="t">${esc(m.title)}</span><span class="m">${esc([m.publisher ?? hostname(m.url), kind].filter(Boolean).join(", "))}</span></span>
      ${icon("external", 13)}<span class="sr-only">(opens in a new tab)</span></a></li>`;
  }).join("")}</ul>`;
}
function sourcesHTML(sources) {
  if (!sources?.length) return '<p class="empty">Sources not yet recorded.</p>';
  return `<ol class="links">${sources.map((s) => `<li><a class="lnk" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
    <span class="tx"><span class="t">${esc(s.title)}</span><span class="m">${esc(s.publisher ?? hostname(s.url))}</span></span>
    ${icon("external", 13)}<span class="sr-only">(opens in a new tab)</span></a></li>`).join("")}</ol>`;
}
function locationNotes(s) {
  const bp = s.birthplace, n = [];
  if (bp.kind === "native-place") n.push(bp.bornAt ? `Family home in India. Born in ${bp.bornAt}.` : "Family home in India.");
  if (s.mapNote) n.push(s.mapNote);
  else if ((bp.precision ?? "town") === "district") n.push("Shown on the map at the district headquarters.");
  return n;
}
function profileHTML(s) {
  const svc = s.service ?? {}, span = lifeSpan(s), age = ageAtDeath(s);
  const loc = state.location, multi = loc && countFor(loc.placeIds) > 1;
  const backLabel = multi ? `Back to ${describe(loc.placeIds).title}` : null;
  const rows = [["Born", formatDate(s.dates?.birth)], ["Died", formatDate(s.dates?.death)], ["Service", svc.branch], ["Regiment", svc.regiment], ["Unit", svc.unit], ["Action", svc.operation], ["Conflict", svc.conflict]].filter((r) => r[1]);
  return `
    <div class="view-bar">
      ${backLabel ? `<button class="back" data-action="back">${icon("arrowLeft", 15)}<span>${esc(backLabel)}</span></button>` : "<span></span>"}
      <button class="icon-btn" data-action="close" aria-label="Close" title="Close">${icon("x")}</button>
    </div>
    <div class="scroll">
      <header class="profile-head">
        ${portraitHTML(s)}
        ${s.rank ? `<p class="rank">${esc(s.rank)}</p>` : ""}
        <h2 class="name" tabindex="-1" data-leader-anchor>${esc(s.name)}</h2>
        ${s.awards?.length ? `<p class="award">${esc(s.awards.join(", "))}${s.posthumous ? "<span>, posthumous</span>" : ""}</p>` : ""}
        ${span ? `<p class="span-line"><span class="years">${esc(span)}</span>${age !== null ? `<span class="age">Aged ${age}</span>` : ""}</p>` : ""}
        ${svc.unit ? `<p class="unit">${esc(svc.unit)}</p>` : ""}
        <div class="place-line">${icon("pin", 15)}<div>
          <p>${esc(fullPlace(s.birthplace))}</p>
          ${locationNotes(s).map((n) => `<p class="note">${esc(n)}</p>`).join("")}
          <button class="link" data-action="show-on-map">Show on map</button>
        </div></div>
      </header>
      ${s.biography ? section(storyHeading(s), prose(s.biography)) : ""}
      ${s.actOfValor ? section("Act of valour", prose(s.actOfValor)) : ""}
      ${rows.length ? section("Service record", `<dl class="record">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`) : ""}
      ${section("Media", mediaHTML(s.media))}
      ${section("Sources", sourcesHTML(s.sources))}
      ${s.recordNotes?.length ? section("Notes on this record", `<ul class="notes">${s.recordNotes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`) : ""}
    </div>`;
}

body.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]"); if (!t) return;
  const a = t.dataset.action;
  if (a === "close") close();
  else if (a === "back") back();
  else if (a === "open-soldier") openSoldier(t.dataset.id, "none");
  else if (a === "show-on-map" && state.soldierId) focusCamera(placeById.get(placeIdBySoldier.get(state.soldierId)).lngLat, { minZoom: 9.5 });
});

/* ------------------------------------------------------------ overlays */
const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';
let returnFocus = null;
function openOverlay(el) {
  returnFocus = document.activeElement; el.hidden = false;
  setTimeout(() => (el.querySelector("input") ?? el.querySelector(FOCUSABLE))?.focus(), 20);
}
function closeOverlay(el) { el.hidden = true; returnFocus?.focus?.({ preventScroll: true }); }
for (const el of [$("#search"), $("#about")]) {
  el.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlay(el); });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = [...el.querySelectorAll(FOCUSABLE)]; if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* Search: every word must match a name, place or service detail. */
const norm = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const searchIndex = SOLDIERS.map((s) => {
  const bp = s.birthplace, sv = s.service ?? {};
  return {
    s,
    name: norm([s.name, s.rank, s.rankShort, ...(s.aliases ?? [])].filter(Boolean).join(" ")),
    place: norm([bp.village, bp.town, bp.historicalName, bp.district, bp.state, bp.bornAt].filter(Boolean).join(" ")),
    service: [sv.unit, sv.regiment, sv.operation, sv.conflict, sv.branch, ...(s.awards ?? [])].filter(Boolean).map((raw) => ({ raw, n: norm(raw) })),
  };
});
function runSearch(q) {
  const nq = norm(q);
  if (!nq) return [...SOLDIERS].sort(sortByAction).map((s) => ({ s, detail: shortPlace(s.birthplace) }));
  const toks = nq.split(" "), out = [];
  for (const e of searchIndex) {
    const all = `${e.name} ${e.place} ${e.service.map((f) => f.n).join(" ")}`;
    if (!toks.every((t) => all.includes(t))) continue;
    const nameHits = toks.filter((t) => e.name.includes(t)).length, placeHits = toks.filter((t) => e.place.includes(t)).length;
    let score = 3, detail = shortPlace(e.s.birthplace);
    if (nameHits === toks.length) score = e.name.startsWith(nq) || e.name.includes(` ${nq}`) ? 0 : 1;
    else if (placeHits > 0 && placeHits >= nameHits) score = 2;
    else if (nameHits > 0) score = 1.5;
    else detail = e.service.find((f) => toks.some((t) => f.n.includes(t)))?.raw ?? detail;
    out.push({ s: e.s, detail, score });
  }
  return out.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
}
const searchEl = $("#search"), input = $("#search-input"), out = $("#search-out");
let results = [], active = 0;
function renderResults() {
  const q = input.value.trim();
  results = runSearch(q);
  if (!results.length) { out.innerHTML = `<div class="no-results" role="status">No names or places match \u201c${esc(q)}\u201d. Try a surname, a district or a regiment.</div>`; input.removeAttribute("aria-activedescendant"); return; }
  out.innerHTML = `${q ? "" : `<p class="search-hint">All ${SOLDIERS.length} names, in order of their actions</p>`}
    <ul class="results" id="search-results" role="listbox" aria-label="Results">${results.map((r, i) => `
      <li role="option" id="opt-${esc(r.s.id)}" aria-selected="${i === active}">
        <button class="res${i === active ? " is-active" : ""}" tabindex="-1" data-id="${esc(r.s.id)}" data-i="${i}">
          <span class="who"><span class="nm">${r.s.rankShort ? `<span class="rk">${esc(r.s.rankShort)} </span>` : ""}${esc(r.s.name)}</span><span class="dt">${esc(r.detail)}</span></span>
          ${actionYear(r.s) ? `<span class="yr">${actionYear(r.s)}</span>` : ""}
        </button></li>`).join("")}</ul>`;
  input.setAttribute("aria-activedescendant", `opt-${results[active].s.id}`);
}
function setActive(i) {
  active = i;
  out.querySelectorAll(".res").forEach((b, j) => { b.classList.toggle("is-active", j === i); b.parentElement.setAttribute("aria-selected", String(j === i)); });
  if (results[i]) input.setAttribute("aria-activedescendant", `opt-${results[i].s.id}`);
  out.querySelectorAll(".res")[i]?.scrollIntoView({ block: "nearest" });
}
function pick(id) { closeOverlay(searchEl); state.location = null; openSoldier(id, "fly"); }
function openSearch() { input.value = ""; active = 0; renderResults(); openOverlay(searchEl); }
input.addEventListener("input", () => { active = 0; renderResults(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" && results.length) { e.preventDefault(); setActive((active + 1) % results.length); }
  else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); setActive((active - 1 + results.length) % results.length); }
  else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active].s.id); }
});
out.addEventListener("click", (e) => { const b = e.target.closest(".res"); if (b) pick(b.dataset.id); });
out.addEventListener("mousemove", (e) => { const b = e.target.closest(".res"); if (b && Number(b.dataset.i) !== active) setActive(Number(b.dataset.i)); });

$("#open-about").addEventListener("click", () => openOverlay($("#about")));
$("#zoom-in").addEventListener("click", () => map?.zoomIn(1));
$("#toggle-boundaries").addEventListener("click", () => map && setBoundaries(!boundariesOn));
$("#zoom-out").addEventListener("click", () => map?.zoomOut(1));
$("#zoom-reset").addEventListener("click", () => map?.flyToBounds(llBounds(INDIA_BOUNDS), { ...padOpts(launchPad()), duration: reduced ? 0 : 0.7 }));

/* ------------------------------------------------------------ keyboard */
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("#about").hidden) closeOverlay($("#about"));
    else if (!searchEl.hidden) closeOverlay(searchEl);
    else if (isOpen()) close();
    return;
  }
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.key === "/" || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openSearch(); }
});


/* -------------------------------------------------------------- start */
// First draw happens here, once every function above is defined.
if (map) { styleLines(); renderMap(); }
let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    W = innerWidth; H = innerHeight;
    drawer.classList.toggle("is-sheet", isMobile());
    syncSheet(); if (mapReady) renderMap();
  }, 120);
});
})();
