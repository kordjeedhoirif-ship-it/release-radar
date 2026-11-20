// =====================================================================
// Release Radar — robot de mise à jour
// Récupère les vraies sorties (Deezer, Apple Music, MusicBrainz), trouve
// une vraie pochette pour chacune et écrit data/releases.json.
// Lancé automatiquement par GitHub Actions (gratuit). Aucune clé d'API.
// Utilisation locale : node scripts/update.mjs   (Node 18 ou plus)
// =====================================================================
import { writeFile, mkdir } from 'node:fs/promises';

const UA = 'ReleaseRadar/1.0 (https://github.com/kordjeedhoirif-ship-it/release-radar)'; // MusicBrainz demande un User-Agent identifiable
const PAST_DAYS = 180;   // on garde les sorties des 6 derniers mois
const FUTURE_DAYS = 120; // et celles annoncées dans les 4 prochains mois

const GENRES = [
  { key: null, deezer: 0 },
  { key: 'Afro', deezer: 2, match: /afro|african|africa|amapiano|highlife|coupé|ndombolo|zouk/i },
  { key: 'R&B', deezer: 165, match: /r&b|rnb|soul/i },
  { key: 'Rap', deezer: 116, match: /rap|hip.?hop|drill|trap/i },
  { key: 'Pop', deezer: 132, match: /pop/i },
  { key: 'Latino', deezer: 197, match: /latin|reggaeton|urbano/i },
];
const REGIONS = {
  FR: { apple: ['fr'], mb: ['FR'] },
  US: { apple: ['us'], mb: ['US'] },
  GB: { apple: ['gb'], mb: ['GB'] },
  AF: { apple: ['ng', 'za'], mb: ['NG', 'ZA', 'GH', 'CI', 'SN', 'CM', 'KE'] },
};

// ---------- outils ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MIN = addDays(TODAY, -PAST_DAYS), MAX = addDays(TODAY, FUTURE_DAYS);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]|- ?(deluxe|edition|remaster|single|ep).*$/g, '').replace(/[^a-z0-9]/g, '');
const genreFrom = txt => { for (const g of GENRES) if (g.match && g.match.test(txt || '')) return g.key; return null; };
const kindOf = t => { t = String(t || '').toLowerCase(); if (t.includes('single')) return 'Single'; if (t === 'ep' || / ep\b|- ep/.test(t)) return 'EP'; return 'Album'; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status === 503) { await sleep(3000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
// MusicBrainz : 1 requête par seconde maximum
let mbLast = 0;
async function mb(url) { const w = mbLast + 1100 - Date.now(); if (w > 0) await sleep(w); mbLast = Date.now(); return getJSON(url); }
// iTunes : ~20 requêtes par minute
let itLast = 0;
async function itunes(url) { const w = itLast + 3100 - Date.now(); if (w > 0) await sleep(w); itLast = Date.now(); return getJSON(url); }

const big = u => (u || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');

// ---------- sources ----------
async function deezer() {
  const out = [];
  for (const g of GENRES) {
    try {
      const r = await getJSON(`https://api.deezer.com/editorial/${g.deezer}/releases?limit=100`);
      for (const a of r.data || []) out.push({
        id: 'dz' + a.id, title: a.title, artist: a.artist?.name, genre: g.key, date: a.release_date,
        kind: kindOf(a.record_type), cover: a.cover_xl || a.cover_big, url: a.link || `https://www.deezer.com/album/${a.id}`,
        source: 'Deezer', region: null,
      });
      log('Deezer', g.key || 'Tous', (r.data || []).length);
    } catch (e) { log('Deezer', g.key, 'ÉCHEC', e.message); }
  }
  return out;
}

async function appleTop() {
  const out = [];
  for (const [R, cfg] of Object.entries(REGIONS)) for (const cc of cfg.apple) {
    try {
      const r = await getJSON(`https://rss.applemarketingtools.com/api/v2/${cc}/music/most-played/100/albums.json`);
      for (const a of r.feed?.results || []) out.push({
        id: 'ap' + a.id, title: a.name, artist: a.artistName, genre: genreFrom((a.genres || []).map(x => x.name).join(' ')),
        date: (a.releaseDate || '').slice(0, 10), kind: 'Album', cover: big(a.artworkUrl100), url: a.url, source: 'Apple Music', region: R, top: true,
      });
      log('Apple', cc, (r.feed?.results || []).length);
    } catch (e) { log('Apple', cc, 'ÉCHEC', e.message); }
  }
  return out;
}

async function musicbrainzRange(from, to, countries) {
  let q = `date:[${from} TO ${to}] AND status:official AND (primarytype:album OR primarytype:ep)`;
  if (countries?.length) q += ' AND (' + countries.map(c => 'country:' + c).join(' OR ') + ')';
  const out = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const r = await mb('https://musicbrainz.org/ws/2/release?fmt=json&limit=100&offset=' + offset + '&query=' + encodeURIComponent(q));
    for (const a of r.releases || []) {
      const rg = a['release-group'] || {};
      if ((rg['secondary-types'] || []).some(t => /compilation|live|soundtrack|spokenword|audiobook|interview|dj-mix|mixtape\/street/i.test(t))) continue;
      const artist = (a['artist-credit'] || []).map(c => (c.name || c.artist?.name) + (c.joinphrase || '')).join('');
      if (!artist || /various artists|\[unknown\]/i.test(artist)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) continue; // date complète obligatoire
      out.push({
        id: 'mb' + rg.id, rg: rg.id, title: a.title, artist, genre: genreFrom((a.tags || []).map(t => t.name).join(' ')), date: a.date,
        kind: kindOf(rg['primary-type']), cover: null, url: 'https://musicbrainz.org/release-group/' + rg.id, source: 'MusicBrainz',
        region: Object.keys(REGIONS).find(R => REGIONS[R].mb.includes(a.country)) || null,
      });
    }
    if ((r.releases || []).length < 100) break;
  }
  return out;
}

async function musicbrainz() {
  const out = [];
  const jobs = [[TODAY, MAX, null], [addDays(TODAY, -45), addDays(TODAY, -1), null]];
  for (const [R, cfg] of Object.entries(REGIONS)) jobs.push([TODAY, MAX, cfg.mb], [addDays(TODAY, -45), addDays(TODAY, -1), cfg.mb]);
  for (const [f, t, c] of jobs) {
    try { const l = await musicbrainzRange(f, t, c); out.push(...l); log('MusicBrainz', f, '→', t, c ? c.join(',') : 'monde', l.length); }
    catch (e) { log('MusicBrainz', f, t, 'ÉCHEC', e.message); }
  }
  return out;
}

// ---------- pochettes ----------
// 1) Cover Art Archive (pour MusicBrainz)   2) sinon recherche iTunes (trouve aussi les précommandes)
async function caaCover(rg) {
  try {
    const r = await fetch(`https://coverartarchive.org/release-group/${rg}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const d = await r.json();
    const img = (d.images || []).find(i => i.front) || d.images?.[0];
    return img ? (img.thumbnails?.['500'] || img.thumbnails?.large || img.image).replace(/^http:/, 'https:') : null;
  } catch { return null; }
}
async function itunesMatch(a) {
  try {
    const r = await itunes('https://itunes.apple.com/search?entity=album&limit=10&term=' + encodeURIComponent(a.artist + ' ' + a.title));
    const t = norm(a.title), ar = norm(a.artist);
    const hit = (r.results || []).find(x => norm(x.collectionName) === t && (norm(x.artistName).includes(ar) || ar.includes(norm(x.artistName))))
      || (r.results || []).find(x => norm(x.collectionName).startsWith(t) && norm(x.artistName) === ar);
    return hit ? { cover: big(hit.artworkUrl100), url: hit.collectionViewUrl, genre: genreFrom(hit.primaryGenreName) } : null;
  } catch { return null; }
}

// ---------- assemblage ----------
const store = new Map();
function add(list) {
  for (const a of list) {
    if (!a?.title || !a.artist || !a.date || a.date < MIN || a.date > MAX) continue;
    const k = norm(a.artist) + '|' + norm(a.title);
    const old = store.get(k);
    if (!old) { store.set(k, { ...a }); continue; }
    if (!old.genre && a.genre) old.genre = a.genre;
    if (!old.region && a.region) old.region = a.region;
    if (!old.cover && a.cover) { old.cover = a.cover; old.url = a.url; old.source = a.source; }
  }
}

const t0 = Date.now();
add(await deezer());          // Deezer en premier : genres + pochettes HD
add(await appleTop());
add(await musicbrainz());

// pochettes manquantes
const missing = [...store.values()].filter(a => !a.cover);
log('Pochettes à trouver :', missing.length);
let found = 0, itCalls = 0;
for (const a of missing) {
  if (a.rg) { a.cover = await caaCover(a.rg); await sleep(300); }
  if (!a.cover && itCalls < 120) { itCalls++; const m = await itunesMatch(a); if (m) { a.cover = m.cover; a.genre ||= m.genre; a.url = m.url; a.source = 'Apple Music'; } }
  if (a.cover) found++;
}
log('Pochettes trouvées :', found, '/', missing.length);

// on ne publie que les sorties qui ont une vraie pochette
const items = [...store.values()].filter(a => a.cover)
  .map(({ rg, top, ...a }) => a)
  .sort((a, b) => b.date.localeCompare(a.date));

if (items.length < 20) { console.error('Trop peu de sorties (' + items.length + '), fichier non remplacé.'); process.exit(1); }

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/releases.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString(), count: items.length, items }, null, 0).replace(/\},\{/g, '},\n{'));
log('OK :', items.length, 'sorties écrites en', Math.round((Date.now() - t0) / 1000), 's');
