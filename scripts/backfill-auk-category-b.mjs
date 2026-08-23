// One-off migration: backfills AUK's real Category B business-plan content (SWOT, Pillars,
// Focus/Avoid, Business Models, Ansoff, Partners, Vision, GP/unit, Portfolio meta) into their
// existing tenant_data row. These fields were previously read from hardcoded module-level
// consts in src/App.jsx with NO per-tenant override at all — every tenant saw AUK's real
// content. That's now fixed (AppShell reads `_saved.x || X_SEED`, generic X_SEED for new
// tenants), but it means AUK's own row needs these real values written in explicitly, or
// AUK would silently start seeing the new generic placeholder content instead.
//
// Usage:
//   node scripts/backfill-auk-category-b.mjs --list                       (read-only, default)
//   node scripts/backfill-auk-category-b.mjs --tenant-id=<id> --write     (writes)
//
// Safe by design:
// - Defaults to --list: just prints every row in `tenants` (id, name, which of the target
//   keys are already present in tenant_data) and exits. No writes happen without --write.
// - Never overwrites a key that's already present in the tenant's data — only fills in keys
//   that are currently missing. Existing data (svcs, budget, portfolioItems, etc.) untouched.
// - Requires an exact --tenant-id to write, no "just pick the only row" auto-detection, so a
//   second tenant existing by the time this runs can't cause a silent wrong-target write.

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envLocal = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^DATABASE_URL="?(.*?)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error('DATABASE_URL not found in environment or .env.local');
}

const sql = neon(loadDatabaseUrl());

// Real AUK content, exactly as it read in src/App.jsx before this session's edits.
const AUK_CATEGORY_B = {
  vision: "Africa's Leading Digital & Green Training, Maritime, Mining, Metallurgy & Logistics Solutions Partner",
  gpPerUnit: { 1: 10000, 2: 20000, 3: 25000, 4: 25000, 5: 20000, 6: 12000 },
  swot: {
    strengths: [
      "Multi-sector experience: maritime, mining, logistics, consulting, training, automation, smelter development",
      "Strong Africa–Middle East footprint with India–Africa–China trade exposure",
      "Established credibility in ship inspections, audits, ESG compliance and port optimisation",
      "Training academy with potential for scalable digital delivery",
      "35 years of experience in port, shipping and logistics; well-networked locally",
      "BEE Level 4 local company with a sound balance sheet; DoT accreditation",
      "Board strength: Harbour Master & Harbour Pilot experience (Richards Bay)",
      "Own research team, consulting division and shipping & logistics operations",
    ],
    constraints: [
      "Automation margins near zero — commoditised market",
      "Smelting suspended — low alloy prices, investor hesitation",
      "Trading paused — losses from volatility and thin spreads",
      "Capital constraints — need low-capex, high-margin pivots",
    ],
    opportunities: [
      "Global decarbonisation & ESG compliance in maritime (CII, EEXI, EU ETS)",
      "Digital transformation in ports, logistics and mining",
      "AI-driven predictive maintenance, remote inspections and digital twins",
      "Africa's growing need for skills development and compliance training",
      "Reshoring of mineral processing and critical-minerals demand",
      "Corridor optimisation across Africa (North–South, Maputo, Walvis Bay)",
    ],
  },
  pillars: [
    { title: "High-Margin Maritime Services", tag: "Core strength", clr: "var(--brass)",
      items: ["Digital ship inspections & remote audits — drones, ROVs, AI defect detection; subscription inspection packages",
        "ESG & emissions compliance — CII/EEXI advisory, carbon footprint reporting, EU ETS support, green-port consulting",
        "Port optimisation & digitalisation — IoT berth management, turnaround optimisation, digital twins for ports"] },
    { title: "Mining Consulting & Digital Transformation", tag: "Asset-light pivot", clr: "var(--teal)",
      items: ["Critical minerals consulting — feasibility studies, mineral audits, ESG compliance, investor-readiness",
        "Digital mine solutions — IoT sensors, predictive maintenance, remote monitoring, digital twins",
        "Smelter development advisory — design, feasibility & project development without capex exposure; partner with EPC firms"] },
    { title: "Training & Skills Development", tag: "The scalable goldmine", clr: "var(--green)",
      items: ["Pan-African digital skills platform — maritime & logistics, mining & industrial, corporate leadership tracks",
        "ESG, digital port operations, remote inspection, safety & regulatory, AI literacy for executives",
        "Hybrid delivery: online + virtual + onsite; subscriptions, corporate contracts, micro-credentials"] },
    { title: "AI, Digitalisation & Automation", tag: "Reinvented as integrator", clr: "#b98acb",
      items: ["AI-driven solutions — predictive maintenance, cargo visibility, corridor risk analytics, compliance monitoring",
        "Digital twins for ports, mines, smelters and logistics hubs — offered as subscriptions",
        "IoT & remote monitoring; custom AI tools — document automation, incident prediction, training simulators"] },
  ],
  focusAvoid: {
    focus: ["Consulting", "Training", "Digital services", "Remote inspections", "ESG compliance", "IoT & AI solutions"],
    avoid: ["Trading (high risk, low margin)", "Smelting (capital intensive, price-sensitive)", "Commodity automation (low margin)"],
  },
  bizModels: {
    1: { model: "OUTSOURCED network", csf: "Track record + marketing; accreditation for freight forwarding", prospects: "High",
         action: "Aggressive marketing; brand on AI and last-mile delivery; participate across the value chain through collaboration" },
    2: { model: "INTERNAL + CONTRACT", csf: "Marketing + track record + competitive cost", prospects: "High",
         action: "Expand geographically; related diversification (H&M, claims); commence cargo & landside inspections — volume based" },
    3: { model: "INTERNAL + CONTRACT", csf: "Consulting track record, capacity, marketing", prospects: "High",
         action: "Build global skillset; integrate AI; focus on value delivery; more tenders with outsourced expert capacity" },
    4: { model: "INTERNAL + CONTRACT", csf: "Consulting track record, capacity, marketing, research", prospects: "High",
         action: "More tenders and marketing; develop expert capacity; business plans & market research as entry products" },
    5: { model: "INTERNAL + CONTRACT", csf: "Marketing + track record + cost; DoT/insurer relationships", prospects: "High",
         action: "Priority line — expand claims & loss adjusting alongside surveys; build insurer & P&I relationships" },
    6: { model: "INTERNAL + CONTRACT", csf: "Marketing, capacity, domain expertise, accreditation, practical brand", prospects: "High",
         action: "Digital & AI integration; subscription-based learning; start flagship courses — BP ready; expand overseas" },
  },
  ansoff: [
    { cell: "Current market × Current services", code: "1A", steps: "Add features (remote & technical support) · price discrimination & credit · differentiated branding · out-deliver competitors · CRM & networking with current stakeholders" },
    { cell: "New market × Current services", code: "1B", steps: "New geographies · global marketing · align services to international requirements" },
    { cell: "Current market × New services", code: "2A", steps: "Aggressive awareness marketing for newly launched services" },
    { cell: "New market × New services", code: "2B", steps: "Enter only with a partner or proven demand — highest risk quadrant" },
  ],
  partners: [
    { name: "3CIoT SA", stake: "35% shareholding (12 years)", scope: "Automation & IoT; renewables collaboration",
      csf: "Track record + marketing + technical expertise", note: "Marketing not yet started — motivate team training" },
    { name: "Sankh Metal SA", stake: "50% shareholding", scope: "Ferroalloy plant production & other metallurgical processes",
      csf: "Track record + funding", note: "Projects have long lead times; affiliate-driven revenue" },
    { name: "3C Engineering", stake: "26% shareholding (13 years)", scope: "Consortium partner — project development & engineering",
      csf: "Consortium strength + engineering capability", note: "Pipeline of development projects" },
  ],
  portfolioMeta: {
    1: { note: "Delivered through the AUK agent & provider network (Imperial, CWT, transporters, stevedores) — a referral-led channel rather than paid ads.",
         segsCust: ["Exporters", "Importers", "Traders"], segsCargo: ["Container & Air", "Breakbulk", "Bulk (Export/Import)"], landingPrice: true },
    2: { note: "Sold to ship managers & technical superintendents worldwide, primarily via LinkedIn." },
    3: { note: "What clients expect: expert, tailored advice & strategy; quality delivered on time, on budget and to scope; clear communication on progress; problems solved as they arise; immersive AI/ML-enabled experiences; personalisation; and strong data protection & ethics." },
    4: { note: "What clients expect: expert, tailored advice & strategy; quality delivered on time, on budget and to scope; clear communication on progress; problems solved as they arise; immersive AI/ML-enabled experiences; personalisation; and strong data protection & ethics." },
    5: { note: "Sold to insurers, cargo owners, traders and P&I clubs across SA and the wider region. AUK has a track record since 2012 — 154 vessel inspections, 21 consulting mandates and 2,219 logistics engagements on file." },
    6: { note: "AUK's live course catalogue. Seafarer maritime courses feed the shore-inspector pipeline; SMME courses cross-sell business & AI services." },
  },
};

// Real AUK portfolio groups/items — only used as a fallback if a tenant's row is somehow
// missing `portfolioItems` entirely (it's been tenant-scoped since before this session, so
// this should normally already be populated with real data and untouched by this script).
const AUK_PORTFOLIO_ITEMS_FALLBACK = null; // intentionally not backfilled — see --list output below

const TARGET_KEYS = ['vision', 'gpPerUnit', 'swot', 'pillars', 'focusAvoid', 'bizModels', 'ansoff', 'partners', 'portfolioMeta'];

const args = process.argv.slice(2);
const write = args.includes('--write');
const force = args.includes('--force');
const tenantIdArg = args.find((a) => a.startsWith('--tenant-id='));
const tenantId = tenantIdArg ? tenantIdArg.split('=')[1] : null;

async function list() {
  const rows = await sql`select id, name, data from tenants left join tenant_data on tenant_data.tenant_id = tenants.id`;
  console.log(`${rows.length} tenant(s):\n`);
  for (const row of rows) {
    const data = row.data || {};
    const present = TARGET_KEYS.filter((k) => data[k] !== undefined);
    const missing = TARGET_KEYS.filter((k) => data[k] === undefined);
    console.log(`- id: ${row.id}`);
    console.log(`  name: ${row.name}`);
    console.log(`  has portfolioItems: ${data.portfolioItems !== undefined}`);
    console.log(`  Category B keys present: [${present.join(', ') || 'none'}]`);
    console.log(`  Category B keys missing: [${missing.join(', ') || 'none'}]`);
    console.log('');
  }
  console.log('Re-run with --tenant-id=<id> --write to backfill the missing keys for one specific tenant.');
}

async function backfill(id) {
  const [row] = await sql`select data from tenant_data where tenant_id = ${id}`;
  if (!row) {
    console.error(`No tenant_data row found for tenant_id ${id}. Nothing to backfill onto — has this tenant loaded the app at least once?`);
    process.exit(1);
  }
  const data = row.data || {};
  const next = { ...data };
  const filled = [];
  const skipped = [];
  for (const key of TARGET_KEYS) {
    // --force: overwrite unconditionally, e.g. recovering from a key that exists but holds
    // the wrong (stale-fallback) value rather than being genuinely absent — the default
    // undefined-only check can't tell those two cases apart, so --force skips it deliberately.
    if (force || data[key] === undefined) {
      next[key] = AUK_CATEGORY_B[key];
      filled.push(key);
    } else {
      skipped.push(key);
    }
  }
  console.log(`Tenant ${id}: ${force ? 'force-overwriting' : 'filling'} [${filled.join(', ') || 'none'}], leaving existing [${skipped.join(', ') || 'none'}] untouched.`);
  if (filled.length === 0) {
    console.log('Nothing to do — every Category B key already present. Not writing.');
    return;
  }
  await sql`update tenant_data set data = ${JSON.stringify(next)}::jsonb, updated_at = now() where tenant_id = ${id}`;
  console.log('Done.');
}

if (write) {
  if (!tenantId) {
    console.error('--write requires --tenant-id=<id>');
    process.exit(1);
  }
  await backfill(tenantId);
} else {
  await list();
}
