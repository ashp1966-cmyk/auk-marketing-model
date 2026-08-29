# Usage Visibility & Abuse Alert — Build Brief

## Why this exists
Trial caps (2 research runs, 2 campaign drafts, 2 outreach drafts, 1
Trend Radar scan) are designed but not yet enforced. Until real
enforcement ships, the actual safety net is: invite-only access +
manual revocation if someone abuses it. That safety net only works if
abuse is actually *noticed* — right now nothing surfaces `tenant_usage`
numbers anywhere. This closes that specific gap, quickly and low-risk,
ahead of full enforcement.

## Part 1 — Admin usage view (manual check, anytime)
A new page/section, visible only when the signed-in tenant is AUK's own
org (`plan_code = 'internal'` — reuse the same check already used
elsewhere). Shows a simple table: every tenant, their current-month
`research_runs` / `campaign_drafts` / `outreach_drafts` /
`trend_radar_scans` / `emails_sent`, with any number exceeding the
trial caps highlighted (e.g. red) if that tenant's `billing_status` is
still `trialing`.

Read-only. No new tables needed — this only reads `tenant_usage` and
`tenants`, both already populated.

## Part 2 — Automated daily alert (the real fix)
Extend the existing Vercel Cron job (already running daily for outreach
follow-ups) with one more check:

```
For every tenant where billing_status = 'trialing':
  if research_runs > 2 OR campaign_drafts > 2 OR outreach_drafts > 2
     OR trend_radar_scans > 1:
    flag it
If any flagged tenants found:
  send ONE email via Resend to AUK's own address, listing each flagged
  tenant by name and exactly which number(s) are over cap
```

Send only when there's something to report — no daily "all clear" noise
mail. Reuse the exact same Resend sending pattern already proven for
outreach emails.

## Testing
- Test on `rls-test` first, same as always.
- Manually push a test tenant's counter over cap (e.g. Test Client Co,
  clearly-labeled test action) to confirm the alert actually fires and
  reads correctly, rather than trusting the logic without seeing it
  trigger for real.
- Confirm Part 1's admin view correctly shows AUK's own account as
  exempt (no highlighting, since `plan_code = 'internal'` means caps
  don't apply) while still showing accurate numbers for other tenants.
- Reset the test tenant's counters back to normal after, same cleanup
  discipline as every other test.

## Explicitly out of scope for this brief
No blocking, no 402s, no changes to any write path — this is reporting
and notification only. Real enforcement (the pre-flight-check design
decision, then Step 2/3's actual cap logic) remains separate, larger,
still-pending work.
