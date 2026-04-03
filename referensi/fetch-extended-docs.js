// fetch-extended-docs.js
// Fetch Extended exchange documentation dari berbagai sumber resmi.
// Output: ./extended-docs/
//
// Cara pakai: node referensi/fetch-extended-docs.js
//
// Sumber:
//  1. OpenAPI JSON spec  — api.docs.extended.exchange/openapi.json
//  2. GitBook pages       — docs.extended.exchange (extract __NEXT_DATA__ JSON)
//  3. API Reference HTML  — api.docs.extended.exchange (fallback HTML scraping)

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const ROOT = path.join(__dirname, 'extended-docs');

// ─── DAFTAR HALAMAN GITBOOK ────────────────────────────────────────────────────
const GITBOOK_PAGES = [
  ['',                                                        'overview'],
  ['extended-resources/trading/order-types',                  'trading/order-types'],
  ['extended-resources/trading/trading-rules',                'trading/trading-rules'],
  ['extended-resources/trading/order-cost',                   'trading/order-cost'],
  ['extended-resources/trading/margin-schedule',              'trading/margin-schedule'],
  ['extended-resources/trading/funding-payments',             'trading/funding-payments'],
  ['extended-resources/trading/liquidation-logic',            'trading/liquidation-logic'],
  ['extended-resources/trading/trading-fees-and-rebates',     'trading/fees-and-rebates'],
  ['starknet-migration/rationale-and-vision',                 'migration/rationale-and-vision'],
  ['starknet-migration/migration-guide',                      'migration/migration-guide'],
  ['extended-resources/more/smart-contract-audits',           'more/smart-contract-audits'],
];

// URL kandidat untuk OpenAPI JSON spec
const OPENAPI_CANDIDATES = [
  'https://api.starknet.extended.exchange/openapi.json',
  'https://api.starknet.extended.exchange/api-docs',
  'https://api.starknet.extended.exchange/docs/openapi.json',
  'https://api.docs.extended.exchange/openapi.json',
  'https://api.docs.extended.exchange/openapi.yaml',
];

// ─── HTTP FETCH ────────────────────────────────────────────────────────────────
function fetchRaw(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const tryFetch = (u, redirectsLeft) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ExtendedDocsFetcher/2.0)',
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.9',
        },
        timeout: 15000,
      }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
          if (redirectsLeft <= 0) { reject(new Error(`Too many redirects: ${u}`)); return; }
          const loc = res.headers.location;
          const next = loc.startsWith('http') ? loc : new URL(loc, u).href;
          res.resume();
          tryFetch(next, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}: ${u}`));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), finalUrl: u, contentType: res.headers['content-type'] ?? '' }));
        res.on('error', reject);
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error(`Timeout: ${u}`)); });
    };
    tryFetch(urlStr, maxRedirects);
  });
}

// ─── EXTRACT KONTEN DARI GITBOOK (Next.js) ────────────────────────────────────
// GitBook modern menggunakan Next.js SSR — konten ada di script tag __NEXT_DATA__
// sebagai JSON. Kita extract dari sana, bukan parse HTML biasa.
function extractGitbookContent(html, pageTitle) {
  // Coba __NEXT_DATA__ JSON dulu (Next.js SSR)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // GitBook menyimpan markdown/document di berbagai path tergantung versi
      const content = extractFromNextData(nextData);
      if (content && content.length > 100) {
        return content;
      }
    } catch (e) {
      // fallback ke HTML scraping
    }
  }

  // Fallback: cari konten di dalam <article> atau <main>
  return extractFromHtml(html, pageTitle);
}

function extractFromNextData(data) {
  // Coba berbagai path data yang digunakan GitBook
  const candidates = [
    data?.props?.pageProps?.page?.document?.nodes,
    data?.props?.pageProps?.page?.markdown,
    data?.props?.pageProps?.page?.description,
    data?.props?.pageProps?.spaceContent,
    data?.props?.pageProps?.initialProps?.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 50) {
      return candidate;
    }
    if (Array.isArray(candidate) && candidate.length > 0) {
      return nodestoText(candidate);
    }
  }

  // Cari secara rekursif di seluruh data
  return findStringContent(data, 0);
}

function nodestoText(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return '';
  return nodes.map(node => {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    const type = node.type || node.object || '';
    const text = node.text || node.data?.text || '';
    const children = node.nodes || node.children || node.leaves || [];
    const childText = nodestoText(children, depth + 1);
    const fullText = (text + ' ' + childText).trim();

    if (type.includes('heading-1') || type === 'h1') return `\n# ${fullText}\n`;
    if (type.includes('heading-2') || type === 'h2') return `\n## ${fullText}\n`;
    if (type.includes('heading-3') || type === 'h3') return `\n### ${fullText}\n`;
    if (type.includes('heading-4') || type === 'h4') return `\n#### ${fullText}\n`;
    if (type.includes('code')) return `\`${fullText}\``;
    if (type.includes('paragraph') || type === 'p') return `\n${fullText}\n`;
    if (type.includes('list-item') || type === 'li') return `\n- ${fullText}`;
    return fullText;
  }).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function findStringContent(obj, depth) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  for (const key of ['markdown', 'content', 'body', 'text', 'description', 'html']) {
    if (typeof obj[key] === 'string' && obj[key].length > 100) {
      return obj[key];
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = findStringContent(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractFromHtml(html, pageTitle) {
  // Hapus script, style, dan tag non-konten
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Coba ambil dari <article> atau <main> — blok konten utama
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
                    ?? content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
                    ?? content.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (articleMatch) content = articleMatch[1];

  return htmlToMd(content, pageTitle);
}

function htmlToMd(html, pageTitle = '') {
  return html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<pre[^>]*><code[^>]*class="language-(\w+)"[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```$1\n$2\n```\n')
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '_$2_')
    .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, '| $1 ')
    .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, '| $1 ')
    .replace(/<\/tr>/gi, '|\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec)))
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

// ─── SIMPAN FILE ──────────────────────────────────────────────────────────────
function save(filepath, content) {
  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, content, 'utf8');
  return filepath;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  let ok = 0, fail = 0;
  const failList = [];

  console.log('\nExtended Docs Fetcher v2');
  console.log('========================\n');

  fs.mkdirSync(ROOT, { recursive: true });

  // ── 1. Coba ambil OpenAPI JSON spec ─────────────────────────────────────────
  console.log('── OPENAPI JSON SPEC ──');
  let openApiSaved = false;
  for (const url of OPENAPI_CANDIDATES) {
    try {
      const { body, contentType } = await fetchRaw(url);
      // Validasi bahwa ini benar-benar JSON yang bisa diparsing
      const parsed = JSON.parse(body);
      if (parsed.openapi || parsed.swagger || parsed.info) {
        const outFile = path.join(ROOT, 'openapi.json');
        save(outFile, JSON.stringify(parsed, null, 2));
        console.log(`  [OK] openapi.json ← ${url}`);
        ok++;
        openApiSaved = true;

        // Buat juga ringkasan endpoint dari spec ini
        const summary = buildApiSummaryFromSpec(parsed);
        save(path.join(ROOT, 'api-endpoints-summary.md'), summary);
        console.log(`  [OK] api-endpoints-summary.md (dari OpenAPI spec)`);
        ok++;
        break;
      }
    } catch (e) {
      // Coba URL berikutnya
    }
  }
  if (!openApiSaved) {
    console.log('  [SKIP] OpenAPI JSON tidak tersedia di endpoint yang dicoba');
    console.log('         Akan fallback ke HTML scraping untuk api-reference.md');
  }

  // ── 2. API Reference HTML (Stoplight/ReDoc) ──────────────────────────────────
  console.log('\n── API REFERENCE HTML (api.docs.extended.exchange) ──');
  try {
    const { body } = await fetchRaw('https://api.docs.extended.exchange/');
    // Coba extract API spec dari JSON yang biasa tertanam di halaman Stoplight/ReDoc
    let specContent = null;

    // Stoplight elements sering embed spec di window.__spectral atau sebagai JSON script
    const specMatch = body.match(/window\.__REDOC_STATE\s*=\s*({[\s\S]*?});\s*<\/script>/i)
                   ?? body.match(/<script[^>]*>[\s\S]*?spec['"]\s*:\s*({[\s\S]*?})\s*[,}]/i);
    if (specMatch) {
      try {
        const parsed = JSON.parse(specMatch[1]);
        specContent = JSON.stringify(parsed, null, 2);
      } catch (e) {}
    }

    const md = specContent
      ? `# Extended API Reference\n\n> Source: https://api.docs.extended.exchange/\n> Fetched: ${new Date().toISOString()}\n\n\`\`\`json\n${specContent.slice(0, 50000)}\n\`\`\``
      : `# Extended API Reference\n\n> Source: https://api.docs.extended.exchange/\n> Fetched: ${new Date().toISOString()}\n> Catatan: Halaman ini menggunakan JavaScript rendering (Stoplight/ReDoc).\n> Untuk spec lengkap, gunakan openapi.json jika tersedia.\n\n` + htmlToMd(body);

    save(path.join(ROOT, 'api-reference.md'), md);
    console.log(`  [OK] api-reference.md`);
    ok++;
  } catch (err) {
    fail++;
    failList.push({ section: 'api-reference', err: err.message });
    console.log(`  [FAIL] api-reference.md — ${err.message}`);
  }

  // ── 3. GitBook pages (docs.extended.exchange) ─────────────────────────────
  console.log('\n── GITBOOK DOCS (docs.extended.exchange) ──');
  for (const [urlPath, filename] of GITBOOK_PAGES) {
    const url     = `https://docs.extended.exchange/${urlPath}`;
    const outFile = path.join(ROOT, 'gitbook', filename + '.md');
    const title   = filename.split('/').pop().replace(/-/g, ' ');
    try {
      const { body } = await fetchRaw(url);
      const content  = extractGitbookContent(body, title);

      const hasRealContent = content.length > 100 && !/^[\s\n]*$/.test(content);
      const header = `# ${title}\n\n> Source: ${url}\n> Fetched: ${new Date().toISOString()}\n`;
      const warning = hasRealContent ? '' :
        `\n> ⚠️ Konten tidak berhasil diekstrak (GitBook gunakan JS rendering).\n> Buka ${url} di browser untuk membaca dokumentasi ini.\n`;

      save(outFile, header + warning + '\n\n' + content);
      console.log(`  [${hasRealContent ? 'OK' : 'PARTIAL'}] gitbook/${filename}.md${hasRealContent ? '' : ' (konten minimal — JS rendering)'}`);
      if (hasRealContent) ok++; else fail++;
      if (!hasRealContent) failList.push({ section: 'gitbook', filename, err: 'JS rendering — content not available via plain HTTP GET' });
    } catch (err) {
      fail++;
      failList.push({ section: 'gitbook', filename, err: err.message });
      console.log(`  [FAIL] gitbook/${filename}.md — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const total = 2 + GITBOOK_PAGES.length + (openApiSaved ? 1 : 0);
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Berhasil : ${ok}`);
  console.log(`Gagal    : ${fail}`);
  console.log(`Folder   : ${ROOT}/`);
  console.log(`           ├── openapi.json              (OpenAPI spec, jika tersedia)`);
  console.log(`           ├── api-endpoints-summary.md  (ringkasan endpoint, jika ada spec)`);
  console.log(`           ├── api-reference.md          (HTML scrape dari api.docs.extended.exchange)`);
  console.log(`           └── gitbook/                  (${GITBOOK_PAGES.length} halaman docs)`);
  console.log('');
  console.log('Tips: Untuk konten GitBook yang tidak bisa di-scrape, buka langsung di browser:');
  console.log('      https://docs.extended.exchange/');
  console.log('');

  if (failList.length > 0) {
    console.log('Detail gagal:');
    failList.forEach(f => console.log(`  - ${f.section}/${f.filename ?? ''}: ${f.err}`));
    console.log('');
  }

  // Index
  const index = {
    generated:  new Date().toISOString(),
    successful: ok,
    failed:     fail,
    sources: {
      openApiSpec:  OPENAPI_CANDIDATES,
      apiReference: 'https://api.docs.extended.exchange/',
      gitbook:      'https://docs.extended.exchange/',
    },
    files: {
      openApi:      openApiSaved ? path.join(ROOT, 'openapi.json') : null,
      apiReference: path.join(ROOT, 'api-reference.md'),
      gitbook: GITBOOK_PAGES.map(([p, f]) => ({
        url:  `https://docs.extended.exchange/${p}`,
        file: path.join(ROOT, 'gitbook', f + '.md'),
      })),
    },
  };
  save(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Index    : ${ROOT}/index.json\n`);
}

// ─── BUAT RINGKASAN API DARI OPENAPI SPEC ────────────────────────────────────
function buildApiSummaryFromSpec(spec) {
  const title   = spec.info?.title   ?? 'API Reference';
  const version = spec.info?.version ?? '?';
  const desc    = spec.info?.description ?? '';
  const baseUrl = spec.servers?.[0]?.url ?? '';

  const lines = [
    `# ${title} — Ringkasan Endpoint`,
    ``,
    `> Versi: ${version}`,
    `> Base URL: ${baseUrl}`,
    `> Digenerate dari OpenAPI spec`,
    ``,
    desc,
    ``,
    `## Daftar Endpoint`,
    ``,
  ];

  const paths = spec.paths ?? {};
  for (const [pathStr, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op || typeof op !== 'object') continue;
      const summary = op.summary ?? op.operationId ?? '';
      const tags    = (op.tags ?? []).join(', ');
      lines.push(`### \`${method.toUpperCase()} ${pathStr}\``);
      if (tags) lines.push(`**Tags**: ${tags}`);
      if (summary) lines.push(`**Summary**: ${summary}`);
      if (op.description) lines.push(``, op.description);

      // Parameter
      const params = op.parameters ?? [];
      if (params.length > 0) {
        lines.push(``, `**Parameter:**`);
        for (const p of params) {
          const req = p.required ? ' *(required)*' : '';
          const type = p.schema?.type ?? p.type ?? 'any';
          lines.push(`- \`${p.name}\` (${p.in}, ${type})${req} — ${p.description ?? ''}`);
        }
      }

      // Request body
      const reqBody = op.requestBody;
      if (reqBody) {
        const schema = reqBody.content?.['application/json']?.schema;
        if (schema) {
          lines.push(``, `**Request Body:**`);
          lines.push(`\`\`\`json`);
          lines.push(JSON.stringify(schema, null, 2).slice(0, 1000));
          lines.push(`\`\`\``);
        }
      }

      lines.push(``);
    }
  }

  return lines.join('\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
