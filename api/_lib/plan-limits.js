// Per-plan monthly AI limits (Phase 2 of CLAUDE-CODE-BRIEF-plan-limits.md). The ONLY place these numbers live:
// the client never duplicates them. Keyed by the live Paystack plan code (the same codes as PLANS in src/App.jsx).
// Month = calendar month in UTC, matching tenant_usage.month. It is NOT the customer's billing date.
const PLAN_LIMITS = {
  PLN_nxjgctcp3gxlct6: { name: 'Startup', research_runs: 4,   trend_radar_scans: 2,  campaign_drafts: 15,  outreach_drafts: 30   },
  PLN_ek4cmy74mxanywt: { name: 'Starter', research_runs: 10,  trend_radar_scans: 4,  campaign_drafts: 40,  outreach_drafts: 100  },
  PLN_qlsyv2l059kp4ra: { name: 'Growth',  research_runs: 30,  trend_radar_scans: 12, campaign_drafts: 120, outreach_drafts: 300  },
  PLN_sgi2vn2qnmhnysg: { name: 'Agency',  research_runs: 100, trend_radar_scans: 40, campaign_drafts: 400, outreach_drafts: 1000 },
};

// The limits for a plan code, or null when the code is not one of the live plans (never unlimited).
export function planLimits(code) {
  return typeof code === 'string' && Object.hasOwn(PLAN_LIMITS, code) ? PLAN_LIMITS[code] : null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "1 November": the first day of the next calendar month, UTC (when this month's allowance resets).
export function resetDateText(now = new Date()) {
  return `1 ${MONTHS[(now.getUTCMonth() + 1) % 12]}`;
}

// '2026-11-01': the first day of the next calendar month, UTC, as an ISO date (the machine-readable twin of resetDateText).
export function nextMonthStartISO(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
