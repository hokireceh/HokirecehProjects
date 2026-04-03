// fetch-ethereal-docs.js
// Fetch Ethereal Trade API documentation dari sumber resmi.
// Output: ./ethereal-docs/
//
// Cara pakai: node referensi/fetch-ethereal-docs.js
//
// Sumber:
//  1. OpenAPI JSON spec  — api.ethereal.trade/openapi.json
//  2. Archive API spec   — archive.ethereal.trade/openapi.json
//  3. Docs pages         — docs.ethereal.trade (GitBook HTML scraping)

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const ROOT = path.join(__dirname, 'ethereal-docs');

// ─── DAFTAR HALAMAN DOCS (GitBook) ────────────────────────────────────────────
const GITBOOK_PAGES = [
  ['',                                               'overview'],
  ['developer-guides/trading-api',                   'developer-guides/trading-api'],
  ['developer-guides/sdk/python-sdk',                'developer-guides/python-sdk'],
  ['protocol-reference/api-hosts',                   'protocol-reference/api-hosts'],
  ['protocol-reference/eip-712',                     'protocol-reference/eip-712'],
  ['protocol-reference/linked-signers',              'protocol-reference/linked-signers'],
  ['protocol-reference/subaccounts',                 'protocol-reference/subaccounts'],
  ['protocol-reference/websockets',                  'protocol-reference/websockets'],
  ['protocol-reference/products',                    'protocol-reference/products'],
  ['protocol-reference/orders',                      'protocol-reference/orders'],
  ['protocol-reference/positions',                   'protocol-reference/positions'],
  ['protocol-reference/fills',                       'protocol-reference/fills'],
  ['protocol-reference/funding',                     'protocol-reference/funding'],
  ['protocol-reference/balances',                    'protocol-reference/balances'],
  ['protocol-reference/withdrawals',                 'protocol-reference/withdrawals'],
];

// URL kandidat OpenAPI spec
const OPENAPI_CANDIDATES = [
  { url: 'https://api.ethereal.trade/openapi.json',     label: 'Trading API (mainnet)'  },
  { url: 'https://api.etherealtest.net/openapi.json',   label: 'Trading API (testnet)'  },
  { url: 'https://archive.ethereal.trade/openapi.json', label: 'Archive API'            },
];

// ─── HTTP FETCH ────────────────────────────────────────────────────────────────
function fetchRaw(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const tryFetch = (u, redirectsLeft) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EtherealDocsFetcher/1.0)',
          'Accept': 'application/json, text/html, */*;q=0.9',
        },
        timeout: 15000,
      }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
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
        res.on('end', () => resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          finalUrl: u,
          contentType: res.headers['content-type'] ?? '',
        }));
        res.on('error', reject);
      }).on('error', reject).on('timeout', function() {
        this.destroy();
        reject(new Error(`Timeout: ${u}`));
      });
    };
    tryFetch(urlStr, maxRedirects);
  });
}

// ─── EXTRACT GITBOOK CONTENT ───────────────────────────────────────────────────
function extractGitbookContent(html, pageTitle) {
  // Coba __NEXT_DATA__ JSON dulu (Next.js SSR — cara GitBook modern)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const content = extractFromNextData(nextData);
      if (content && content.length > 100) return content;
    } catch (e) { /* fallback */ }
  }
  return extractFromHtml(html);
}

function extractFromNextData(data) {
  const candidates = [
    data?.props?.pageProps?.page?.document?.nodes,
    data?.props?.pageProps?.page?.markdown,
    data?.props?.pageProps?.page?.description,
    data?.props?.pageProps?.spaceContent,
    data?.props?.pageProps?.initialProps?.content,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 50) return candidate;
    if (Array.isArray(candidate) && candidate.length > 0) return nodesToText(candidate);
  }
  return findStringContent(data, 0);
}

function nodesToText(nodes) {
  if (!Array.isArray(nodes)) return '';
  return nodes.map(node => {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    const type     = node.type || node.object || '';
    const text     = node.text || node.data?.text || '';
    const children = node.nodes || node.children || node.leaves || [];
    const childText = nodesToText(children);
    const full = (text + ' ' + childText).trim();

    if (type.includes('heading-1') || type === 'h1') return `\n# ${full}\n`;
    if (type.includes('heading-2') || type === 'h2') return `\n## ${full}\n`;
    if (type.includes('heading-3') || type === 'h3') return `\n### ${full}\n`;
    if (type.includes('code')) return `\`${full}\``;
    if (type.includes('paragraph') || type === 'p') return `\n${full}\n`;
    if (type.includes('list-item') || type === 'li') return `\n- ${full}`;
    return full;
  }).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function findStringContent(obj, depth) {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  for (const key of ['markdown', 'content', 'body', 'text', 'description', 'html']) {
    if (typeof obj[key] === 'string' && obj[key].length > 100) return obj[key];
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = findStringContent(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function extractFromHtml(html) {
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const match = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
             ?? content.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
             ?? content.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (match) content = match[1];
  return htmlToMd(content);
}

function htmlToMd(html) {
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

// ─── BUAT RINGKASAN DARI OPENAPI SPEC ─────────────────────────────────────────
function buildApiSummary(spec, label) {
  const title   = spec.info?.title   ?? label;
  const version = spec.info?.version ?? '?';
  const desc    = spec.info?.description ?? '';
  const baseUrl = spec.servers?.[0]?.url ?? '';

  const lines = [
    `# ${title} — Ringkasan Endpoint`,
    ``,
    `> Label   : ${label}`,
    `> Versi   : ${version}`,
    `> Base URL: ${baseUrl}`,
    `> Dibuat  : ${new Date().toISOString()}`,
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
      if (tags)    lines.push(`**Tags**: ${tags}`);
      if (summary) lines.push(`**Summary**: ${summary}`);
      if (op.description) lines.push(``, op.description);

      const params = op.parameters ?? [];
      if (params.length > 0) {
        lines.push(``, `**Parameter:**`);
        for (const p of params) {
          const req  = p.required ? ' *(required)*' : '';
          const type = p.schema?.type ?? p.type ?? 'any';
          lines.push(`- \`${p.name}\` (${p.in}, ${type})${req} — ${p.description ?? ''}`);
        }
      }

      const reqBody = op.requestBody;
      if (reqBody) {
        const schema = reqBody.content?.['application/json']?.schema;
        if (schema) {
          lines.push(``, `**Request Body:**`);
          lines.push(`\`\`\`json`);
          lines.push(JSON.stringify(schema, null, 2).slice(0, 1500));
          lines.push(`\`\`\``);
        }
      }

      lines.push(``);
    }
  }

  return lines.join('\n');
}

// ─── SIMPAN FILE ──────────────────────────────────────────────────────────────
function save(filepath, content) {
  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, content, 'utf8');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  let ok = 0, fail = 0;
  const failList = [];

  console.log('\nEthereal Trade Docs Fetcher v1');
  console.log('==============================\n');

  fs.mkdirSync(ROOT, { recursive: true });

  // ── 1. OpenAPI JSON Specs ────────────────────────────────────────────────────
  console.log('── OPENAPI JSON SPECS ──');
  for (const { url, label } of OPENAPI_CANDIDATES) {
    const slug     = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outJson  = path.join(ROOT, `openapi-${slug}.json`);
    const outMd    = path.join(ROOT, `api-summary-${slug}.md`);
    try {
      const { body } = await fetchRaw(url);
      const parsed = JSON.parse(body);
      if (!parsed.openapi && !parsed.swagger && !parsed.info) throw new Error('Bukan OpenAPI spec valid');

      save(outJson, JSON.stringify(parsed, null, 2));
      console.log(`  [OK] openapi-${slug}.json ← ${url}`);
      ok++;

      const summary = buildApiSummary(parsed, label);
      save(outMd, summary);
      console.log(`  [OK] api-summary-${slug}.md`);
      ok++;
    } catch (e) {
      fail++;
      failList.push({ section: `openapi/${label}`, err: e.message });
      console.log(`  [FAIL] ${label} — ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 2. GitBook Docs Pages ────────────────────────────────────────────────────
  console.log('\n── GITBOOK DOCS (docs.ethereal.trade) ──');
  for (const [urlPath, filename] of GITBOOK_PAGES) {
    const url     = `https://docs.ethereal.trade/${urlPath}`;
    const outFile = path.join(ROOT, 'gitbook', filename + '.md');
    const title   = filename.split('/').pop().replace(/-/g, ' ');
    try {
      const { body } = await fetchRaw(url);
      const content  = extractGitbookContent(body, title);
      const hasContent = content.length > 100;
      const header  = `# ${title}\n\n> Source: ${url}\n> Fetched: ${new Date().toISOString()}\n`;
      const warning = hasContent ? '' :
        `\n> ⚠️ Konten tidak bisa diekstrak (GitBook gunakan JS rendering).\n> Buka ${url} langsung di browser.\n`;

      save(outFile, header + warning + '\n\n' + content);
      console.log(`  [${hasContent ? 'OK' : 'PARTIAL'}] gitbook/${filename}.md`);
      if (hasContent) ok++; else fail++;
      if (!hasContent) failList.push({ section: 'gitbook', filename, err: 'JS rendering' });
    } catch (err) {
      fail++;
      failList.push({ section: 'gitbook', filename, err: err.message });
      console.log(`  [FAIL] gitbook/${filename}.md — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Berhasil : ${ok}`);
  console.log(`Gagal    : ${fail}`);
  console.log(`Folder   : ${ROOT}/`);
  console.log(`           ├── openapi-*.json          (OpenAPI specs)`);
  console.log(`           ├── api-summary-*.md        (ringkasan endpoint per spec)`);
  console.log(`           └── gitbook/                (${GITBOOK_PAGES.length} halaman docs)`);
  console.log('');

  if (failList.length > 0) {
    console.log('Detail gagal:');
    failList.forEach(f => console.log(`  - ${f.section}: ${f.err}`));
    console.log('');
  }

  // ── Index ────────────────────────────────────────────────────────────────────
  const index = {
    generated: new Date().toISOString(),
    successful: ok,
    failed: fail,
    sources: {
      openApiSpecs: OPENAPI_CANDIDATES.map(c => c.url),
      gitbook: 'https://docs.ethereal.trade/',
    },
    files: {
      openApi: OPENAPI_CANDIDATES.map(({ url, label }) => {
        const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return { label, url, file: path.join(ROOT, `openapi-${slug}.json`) };
      }),
      gitbook: GITBOOK_PAGES.map(([p, f]) => ({
        url: `https://docs.ethereal.trade/${p}`,
        file: path.join(ROOT, 'gitbook', f + '.md'),
      })),
    },
  };
  save(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`Index    : ${ROOT}/index.json\n`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
