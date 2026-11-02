#!/usr/bin/env node
// Builds content/seed.json from content/source.json by resolving each card's Wikipedia lead image on
// Wikimedia Commons, with full attribution (FR-12). Re-run when source.json changes:
//   node apps/api/scripts/fetch-content.mjs
// A card may set "file" to pick a specific Commons file instead of the article's lead image.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const UA = 'OpenBookContentBot/0.1 (https://github.com/openbook; content seeding)';
const ALLOWED = /^(public domain|pd|cc0|cc[- ]by(?:[- ]sa)?(?:[- ]\d\.\d)?)/i;
// Wikimedia only serves standard thumbnail widths; map them onto our rendition classes (NFR-3).
const BUCKETS = [
  { size: 1024, px: 1280 },
  { size: 2048, px: 1920 },
  { size: 3072, px: 3840 },
];

async function api(host, params) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function leadImages(titles) {
  const out = new Map();
  for (const batch of chunk(titles, 40)) {
    const data = await api('en.wikipedia.org', {
      action: 'query', prop: 'pageimages', piprop: 'name', titles: batch.join('|'), redirects: '1',
    });
    const alias = new Map();
    for (const n of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) alias.set(n.to, n.from);
    for (const p of data.query.pages) {
      let t = p.title;
      while (alias.has(t)) t = alias.get(t);
      if (p.pageimage) out.set(t, p.pageimage);
    }
  }
  return out;
}

async function fileInfo(files) {
  const out = new Map();
  for (const batch of chunk(files, 40)) {
    const data = await api('commons.wikimedia.org', {
      action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|Credit',
      titles: batch.map((f) => `File:${f}`).join('|'),
    });
    const alias = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of data.query.pages) {
      const key = (alias.get(p.title) ?? p.title).replace(/^File:/, '');
      if (p.imageinfo?.[0]) out.set(key.replace(/ /g, '_'), { ...p.imageinfo[0], descriptionurl: p.imageinfo[0].descriptionurl });
    }
  }
  return out;
}

function renditions(info) {
  const m = info.url.split('?')[0].match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/(.+)$/);
  if (!m) return [];
  const [, base, hash, name] = m;
  // Thumbnails are requested by width and must use a standard bucket; widths at or above the original
  // fall back to the original file.
  return BUCKETS.map(({ size, px }) => ({
    size,
    url: px >= info.width ? info.url.split('?')[0] : `${base}/thumb/${hash}/${name}/${px}px-${name}`,
    format: 'jpeg',
  }));
}

const source = JSON.parse(await readFile(path.join(root, 'content/source.json'), 'utf8'));
const allCards = source.packs.flatMap((p) => p.cards);
const leads = await leadImages(allCards.filter((c) => !c.file).map((c) => c.wiki));
const fileFor = (c) => (c.file ?? leads.get(c.wiki) ?? '').replace(/ /g, '_');
const infos = await fileInfo([...new Set(allCards.map(fileFor).filter(Boolean))]);

const problems = [];
const packs = source.packs.map((pack) => ({
  ...pack,
  cards: pack.cards.map((c) => {
    const file = fileFor(c);
    const info = infos.get(file);
    const label = `${pack.key}/${c.name}`;
    if (!file || !info) {
      problems.push(`${label}: no Commons image (file=${file || 'none'})`);
      return null;
    }
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value);
    const attribution = {
      author: stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'Unknown',
      sourceUrl: info.descriptionurl,
      license,
      licenseUrl: meta.LicenseUrl?.value || (/public domain|pd/i.test(license) ? 'https://creativecommons.org/publicdomain/mark/1.0/' : ''),
    };
    if (!ALLOWED.test(license)) problems.push(`${label}: license "${license}" not allowed (${file})`);
    if (!/jpeg/.test(info.mime)) problems.push(`${label}: not a JPEG (${info.mime}, ${file})`);
    if (Math.max(info.width, info.height) < 1600) problems.push(`${label}: too small ${info.width}x${info.height} (${file})`);
    return {
      key: `${pack.key}/${slug(c.name)}`,
      name: { en: c.name },
      facts: c.facts.map((t, i) => ({ level: i + 1, text: { en: t } })),
      image: { width: info.width, height: info.height, renditions: renditions(info) },
      attribution,
    };
  }),
}));

await writeFile(path.join(root, 'content/seed.json'), JSON.stringify({ categories: source.categories, packs, books: source.books }, null, 2) + '\n');
console.log(`wrote content/seed.json (${allCards.length} cards)`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exitCode = 1;
}
