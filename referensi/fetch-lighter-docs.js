const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── OUTPUT FOLDER ────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, 'lighter-docs');

// ─── DOCS PAGES ───────────────────────────────────────────────────────────────
// Format: [url-slug, saved-filename]
// Filename = display title from the sidebar (kebab-case)
const DOCS = [
  ['get-started',                         'get-started'],
  ['repos',                               'sdk'],
  ['api-keys',                            'api-keys'],
  ['rate-limits',                         'rate-limits'],
  ['account-types',                       'account-types'],
  ['volume-quota-program',                'volume-quota'],
  ['trading',                             'signing-transactions'],
  ['websocket-reference',                 'websocket'],
  ['partner-integration',                 'partner-integration'],
  ['referrals',                           'manage-referrals'],
  ['priority-transactions',               'priority-transactions'],
  ['multi-signature-wallets',             'multi-signature-and-smart-wallets'],
  ['create-accounts-programmatically',    'create-accounts-programmatically'],
  ['deposits-transfers-and-withdrawals',  'deposits-transfers-and-withdrawals'],
  ['data-structures-constants-and-errors','data-structures-constants-and-errors'],
];

// ─── REFERENCE PAGES ──────────────────────────────────────────────────────────
// Format: [url-slug] (filename = slug)
const REFERENCE = [
  // System & Status
  'systemconfig', 'status', 'info-1',

  // Layer 1
  'layer1basicinfo', 'l1metadata',

  // Account
  'account-1', 'accountsbyl1address', 'accountlimits', 'accountmetadata',
  'accountactiveorders', 'accountinactiveorders', 'changeaccounttier',

  // P&L / Funding / Liquidations
  'pnl', 'positionfunding', 'liquidations', 'fundings', 'funding-rates',

  // Orders & Trades
  'orderbookdetails', 'orderbookorders', 'orderbooks', 'recenttrades', 'trades',
  'export', 'assetdetails',

  // Transactions
  'sendtx', 'sendtxbatch', 'tx', 'txfroml1txhash', 'nextnonce',

  // Exchange
  'exchangestats', 'exchangemetrics', 'executestats', 'announcement-1',

  // Deposits / Withdrawals / Transfers
  'deposit_history', 'deposit_latest', 'deposit_networks',
  'transfer_history', 'withdraw_history',
  'transferfeeinfo', 'withdrawaldelay', 'fastwithdraw', 'fastwithdraw_info',
  'fastbridge_info',

  // Auth & API Keys
  'apikeys', 'tokens', 'tokens_create', 'tokens_revoke',

  // Referrals
  'userreferrals', 'referral_create', 'referral_get',
  'referral_kickback_update', 'referral_update', 'referral_use', 'referral_points',

  // Notifications & Candles
  'notification_ack', 'candles',

  // Tokens
  'tokenlist-1',

  // Public Pools & Leases
  'publicpoolsmetadata', 'leaseoptions', 'leases', 'litlease',

  // Create Intent / Fast Bridge
  'createintentaddress',

  // Misc
  'transferfeeinfo',

  // API Explorer
  'get_accounts-param-logs', 'get_accounts-param-positions', 'get_accounts-param-assets',
  'get_batches', 'get_batches-batchid',
  'get_blocks', 'get_blocks-blockid',
  'get_logs-hash',
  'get_markets', 'get_markets-symbol-logs',
  'get_search', 'get_stats-tx', 'get_total',
];

// ─── DEDUPE REFERENCE ─────────────────────────────────────────────────────────
const REFERENCE_DEDUPED = [...new Set(REFERENCE)];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fetchMd(urlSlug, section) {
  return new Promise((resolve, reject) => {
    const mdUrl = `https://apidocs.lighter.xyz/${section}/${urlSlug}.md`;
    const tryFetch = (u) => {
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          tryFetch(loc.startsWith('http') ? loc : 'https://apidocs.lighter.xyz' + loc);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (data.startsWith('<!DOCTYPE')) {
            reject(new Error('Returned HTML (page not found)'));
          } else {
            resolve(data);
          }
        });
      }).on('error', reject);
    };
    tryFetch(mdUrl);
  });
}

function save(dir, filename, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename + '.md'), content, 'utf8');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function run() {
  const docsDir = path.join(ROOT, 'docs');
  const refDir  = path.join(ROOT, 'reference');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(refDir,  { recursive: true });

  let ok = 0, fail = 0;
  const failList = [];
  const total = DOCS.length + REFERENCE_DEDUPED.length;

  console.log(`\nLighter API Docs Fetcher`);
  console.log(`========================`);
  console.log(`Total pages: ${total} (${DOCS.length} docs + ${REFERENCE_DEDUPED.length} reference)\n`);

  // ── Docs ──
  console.log('── DOCUMENTATION ──');
  for (const [slug, filename] of DOCS) {
    try {
      const content = await fetchMd(slug, 'docs');
      save(docsDir, filename, content);
      ok++;
      console.log(`  [OK] docs/${filename}.md`);
    } catch (err) {
      fail++;
      failList.push({ section: 'docs', slug, filename, err: err.message });
      console.log(`  [FAIL] docs/${filename}.md — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // ── Reference ──
  console.log('\n── API REFERENCE ──');
  for (const slug of REFERENCE_DEDUPED) {
    try {
      const content = await fetchMd(slug, 'reference');
      save(refDir, slug, content);
      ok++;
      console.log(`  [OK] reference/${slug}.md`);
    } catch (err) {
      fail++;
      failList.push({ section: 'reference', slug, err: err.message });
      console.log(`  [FAIL] reference/${slug}.md — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // ── Summary ──
  console.log(`\n═══════════════════════════`);
  console.log(`Berhasil : ${ok} / ${total}`);
  console.log(`Gagal    : ${fail}`);
  console.log(`Folder   : ${ROOT}/`);
  console.log(`           ├── docs/       (${DOCS.length} halaman)`);
  console.log(`           └── reference/  (${REFERENCE_DEDUPED.length} halaman)\n`);

  if (failList.length > 0) {
    console.log('Gagal:');
    failList.forEach(f => console.log(`  - ${f.section}/${f.slug}: ${f.err}`));
  }

  // ── Index file ──
  const index = {
    generated: new Date().toISOString(),
    total: { docs: DOCS.length, reference: REFERENCE_DEDUPED.length },
    docs: DOCS.map(([slug, file]) => ({ url: `https://apidocs.lighter.xyz/docs/${slug}`, file: `docs/${file}.md` })),
    reference: REFERENCE_DEDUPED.map(slug => ({ url: `https://apidocs.lighter.xyz/reference/${slug}`, file: `reference/${slug}.md` })),
  };
  fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  console.log(`Index    : ${ROOT}/index.json\n`);
}

run().catch(console.error);
