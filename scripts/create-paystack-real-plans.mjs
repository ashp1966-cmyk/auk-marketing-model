// One-off: creates the three real Starter/Growth/Agency Paystack plans (Checkpoint 3,
// CLAUDE-CODE-BRIEF-paystack-billing.md), in TEST MODE for now (same account used for
// Checkpoint 2's daily-cycle test plan, which this does not touch or replace). Separate
// from scripts/create-paystack-test-plan.mjs, which creates a throwaway daily-interval
// plan for dunning verification only, not meant for any real tenant to subscribe to.
//
// Usage:
//   node scripts/create-paystack-real-plans.mjs --secret-key=<paystack test secret key>
//   node scripts/create-paystack-real-plans.mjs --secret-key=<paystack test secret key> --write
//
// Defaults to a dry run (prints the requests it would make, touches nothing). Pass
// --write to actually call Paystack's API. --secret-key required explicitly, no default,
// no env var read here -- keeps this script's blast radius obvious from the invocation
// alone (same reasoning as --target-db-url elsewhere in scripts/).

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (arg.startsWith('--')) args[arg.slice(2)] = true;
  }
  return args;
}

const args = parseArgs();
if (!args['secret-key']) {
  console.error('Usage: node scripts/create-paystack-real-plans.mjs --secret-key=<paystack test secret key> [--write]');
  process.exit(1);
}
if (!args['secret-key'].startsWith('sk_test_')) {
  console.error('Refusing to run: --secret-key does not look like a Paystack TEST secret key (expected sk_test_ prefix).');
  process.exit(1);
}

const PLANS = [
  { id: 'starter', name: 'Starter', amount: 95000 },   // R950.00 in cents (ZAR)
  { id: 'growth', name: 'Growth', amount: 240000 },     // R2,400.00
  { id: 'agency', name: 'Agency', amount: 650000 },     // R6,500.00
].map((p) => ({
  name: `AUK Marketing Model — ${p.name}`,
  amount: p.amount,
  interval: 'monthly',
  currency: 'ZAR',
  _id: p.id,
}));

if (!args.write) {
  console.log('DRY RUN -- would POST to https://api.paystack.co/plan for each of:\n');
  for (const p of PLANS) {
    const { _id, ...body } = p;
    console.log(`[${_id}]`, JSON.stringify(body));
  }
  console.log('\nRe-run with --write to actually create these plans in Paystack test mode.');
  process.exit(0);
}

async function createPlan(p) {
  const { _id, ...body } = p;
  const resp = await fetch('https://api.paystack.co/plan', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args['secret-key']}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok || !json.status) {
    throw new Error(`[${_id}] FAILED: ${json.message || `HTTP ${resp.status}`}`);
  }
  return { id: _id, plan_code: json.data.plan_code, paystack_id: json.data.id };
}

async function run() {
  const results = [];
  for (const p of PLANS) {
    const r = await createPlan(p);
    results.push(r);
    console.log(`OK — ${r.id}: plan_code=${r.plan_code} (id=${r.paystack_id})`);
  }
  console.log('\nAll three created. Use these plan_codes in the Billing component.');
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
