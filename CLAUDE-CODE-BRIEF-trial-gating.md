# Trial Gating & Usage Caps — Build Brief

## Goal
A 7-day full-access trial, with hard usage caps on the three metered AI
actions from day one (independent of the 7-day clock), followed by a
hard feature gate once the trial ends or caps are exhausted — whichever
comes first.

## Design, confirmed
- **Always open, regardless of billing_status**: Dashboard, Inputs,
  Portfolio, Revenue & Margins, Billing.
- **Open during trial, gated after**: Funnel Plan, Budget Optimizer,
  Resources & Budget, Campaign & AI, Playbook, Prospecting, Feedback &
  CRM, MIS · Activity, Business Plan.
- **Trial usage caps** (independent of the 7-day window — hit the cap,
  that specific action is blocked immediately even if days remain).
  Set tight, with aggregate cost across MANY trial signups in mind, not
  just one — but split by feature so a prospect can't exhaust one
  shared pool on a single feature and never see the other:
  - Prospecting research runs: 2
  - Campaign & AI social post drafts: 2 (separate counter from below)
  - Prospecting outreach email drafts: 2 (separate counter from above —
    confirm during Step 1 whether these two currently share one
    `ai_drafts` counter or are already distinct; split them into two
    counters if they're currently shared)
  - AI Trend Radar scans: 1
- **Trial length**: 7 days from `tenants.created_at` (no new column
  needed).
- **Gate trigger**: 7 days elapsed OR all three caps hit — whichever
  comes first.
- **After subscribing** (`billing_status = 'active'`): trial caps no
  longer apply; real plan limits (Starter 10 research runs/month, etc.)
  take over instead.
- **AUK's own tenant**: fully exempt from all of the above — same
  `plan_code = 'internal'` sentinel already planned for Checkpoint 4's
  access gate.

## First, a real check before building anything
Confirm whether AI Trend Radar scans are currently counted in
`tenant_usage` at all. If they're not (only `research_runs`, `ai_drafts`,
`emails_sent` may currently be tracked), that's a genuine, separate gap
— close it as part of this work, incrementing a `trend_radar_scans`
counter the same way the other three are incremented at their point of
use.

## Plan

### Step 1 — Schema check + gap close
Show me `tenant_usage`'s actual current columns before assuming. Add
`trend_radar_scans` if missing, increment it at Trend Radar's actual
usage point, same pattern as the other counters. Also confirm: does
`ai_drafts` currently cover BOTH Campaign & AI's social post generator
AND Prospecting's outreach email drafts as one shared counter, or are
they already separate? If shared, split into `campaign_drafts` and
`outreach_drafts` so each can be capped independently during trial (2
each, not one pool of 2 shared across both features).

### Step 2 — Trial cap enforcement (server-side, the real gate)
Before each metered action runs (research run, AI draft, Trend Radar
scan), check: if `billing_status = 'trialing'` AND the relevant
counter has reached its cap, return a clear 402 with a message
identifying which specific cap was hit ("You've used all 5 trial
research runs — subscribe to continue"), not a generic error.

### Step 3 — Trial expiry + hard gate (server-side)
Extend the existing auth-check pattern: if `billing_status = 'trialing'`
AND (`now() > created_at + 7 days` OR all three caps are hit), block
non-GET requests to the gated tabs' endpoints, same 402 pattern as
Checkpoint 4's `suspended` gate — reads still allowed, no data touched
or deleted.

### Step 4 — UI gating
Grey out the gated tabs in the nav once trial-expired-or-capped is true
(fetch this status once on load, same pattern as the Billing tab's
status fetch). Clicking a greyed tab shows a short message and a link to
Billing — this is UX guidance, not the real security boundary (Step 3
is).

### Step 5 — Distinguish trial-ended from payment-lapsed
Two different situations need two different messages: a trial that
expired without ever subscribing ("Your trial has ended — subscribe to
continue") versus a subscription that lapsed after paying (`suspended`,
from Checkpoint 4's dunning design — "Your payment didn't go through,
please update your billing details"). Don't collapse these into one
generic locked-out message.

### Step 6 — Real test
Using Test Client Co (reset to `trialing` if it's currently `active`
from earlier testing, or use a genuinely fresh test org if resetting
feels wrong): exhaust one of the three caps for real, confirm the
correct specific message shows and that action is blocked while others
still work. Separately, test the 7-day-elapsed path by temporarily
adjusting a test row's `created_at` (test-data manipulation, clearly
scoped, not touching real dates) rather than waiting a real week.

## Testing discipline
Same as every checkpoint: schema shown before running, test on
`rls-test` first, real UI check before calling this done, production
only touched after Test Client Co proves both the cap-exhaustion and
time-expiry paths correctly.
