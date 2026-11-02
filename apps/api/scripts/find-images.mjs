#!/usr/bin/env node
// Suggests compliant Commons files (JPEG, ≥2000 px long edge, PD/CC license) for cards, preferring
// Commons "Quality images". Usage: node apps/api/scripts/find-images.mjs "Emperor penguin" "Cello" ...
const UA = 'OpenBookContentBot/0.1 (content seeding)';
const ALLOWED = /^(public domain|pd|cc0|cc[- ]by(?:[- ]sa)?(?:[- ]\d\.\d)?)/i;

async function api(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const text = await res.text();
    if (text.startsWith('{')) return JSON.parse(text);
    if (attempt > 4) throw new Error(text.slice(0, 200));
  }
}

async function candidates(term, extra) {
  const data = await api({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${term} filetype:bitmap ${extra}`.trim(),
    prop: 'imageinfo', iiprop: 'size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName',
  });
  return (data.query?.pages ?? [])
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title.replace(/^File:/, ''), ...p.imageinfo?.[0] }))
    .filter((p) => /jpeg/.test(p.mime) && Math.max(p.width, p.height) >= 2000 && p.width >= p.height * 0.9
      && ALLOWED.test(p.extmetadata?.LicenseShortName?.value ?? ''));
}

// An argument of the form "Category:Violins" searches that category (direct members) instead.
for (const term of process.argv.slice(2)) {
  let found = [];
  const cat = term.match(/^Category:(.+)$/)?.[1];
  const tries = cat
    ? [['', `incategory:"${cat.replace(/ /g, '_')}"`]]
    : ['incategory:"Quality_images"', 'incategory:"Featured_pictures_on_Wikimedia_Commons"', ''].map((e) => [term, e]);
  for (const [t, extra] of tries) {
    found = await candidates(t, extra);
    if (found.length) break;
  }
  console.log(JSON.stringify({ term, files: found.slice(0, 4).map((f) => `${f.title} (${f.width}x${f.height}, ${f.extmetadata.LicenseShortName.value})`) }));
}
