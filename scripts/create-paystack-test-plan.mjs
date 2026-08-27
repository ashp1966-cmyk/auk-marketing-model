// One-off: creates a throwaway TEST-MODE Paystack plan with a 'daily' billing interval,
// used only to verify the webhook handler (CLAUDE-CODE-BRIEF-paystack-billing.md,
// Checkpoint 2) against real subscription.disable / invoice.payment_failed events within
// ~24h instead of waiting a real month. Deliberately separate from the real Starter/
// Growth/Agency plans (Checkpoint 3) -- this plan is not meant to be subscribed to by any
// real tenant and should be deactivated once verification is done.
//
// Usage:
//   node scripts/create-paystack-test-plan.mjs --secret-key=<paystack test secret key>
//   node scripts/create-paystack-test-plan.mjs --secret-key=<paystack test secret key> --write
//
// Defaults to a dry run (prints the request it would make, touches nothing). Pass --write
// to actually call Paystack's API. --secret-key required explicitly, no default, no env
// var read here -- keeps this script's blast radius obvious from the invocation alone
// (same reasoning as --target-db-url elsewhere in scripts/).
//
// Amount matches the real Starter tier (R950) purely so the test plan's price is
// representative -- this plan itself is never meant to be a real subscription option.

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
  console.error('Usage: node scripts/create-paystack-test-plan.mjs --secret-key=<paystack test secret key> [--write]');
  process.exit(1);
}
if (!args['secret-key'].startsWith('sk_test_')) {
  console.error('Refusing to run: --secret-key does not look like a Paystack TEST secret key (expected sk_test_ prefix).');
  process.exit(1);
}

const body = {
  name: 'Billing Checkpoint 2 — Daily Test Cycle (throwaway, not a real tier)',
  amount: 95000, // R950 in cents (ZAR), matching Starter for a representative price only
  interval: 'daily',
  currency: 'ZAR',
};

if (!args.write) {
  console.log('DRY RUN -- would POST to https://api.paystack.co/plan with body:\n');
  console.log(JSON.stringify(body, null, 2));
  console.log('\nRe-run with --write to actually create this plan in Paystack test mode.');
  process.exit(0);
}

async function run() {
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
    console.error('FAILED:', json.message || `HTTP ${resp.status}`);
    process.exit(1);
  }
  console.log('OK — plan created:');
  console.log('  plan_code:', json.data.plan_code);
  console.log('  id:', json.data.id);
  console.log('\nUse this plan_code as the `planCode` in a checkout-init call.');
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
