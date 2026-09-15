# Campaign & AI — Strategic Mode (Additive Only)

## Hard constraint
Zero changes to the existing Quick Post generator — its code path, prompt,
data, and behavior stay byte-identical. This feature is purely additive:
a new toggle, a new data structure, a new prompt, a new output renderer.
Nothing existing gets modified or removed.

## Why this exists
A more sophisticated content-strategy framework (evaluating every post
against organic growth, non-follower reach, positioning, authority,
retention, conversion) is worth offering as an option — but the source
prompt was written first-person ("my profile," "my niche") for a single
chatbot user. It must become genuinely tenant-aware: every client's own
niche, audience, and goals, never one baked-in persona.

## Design — reuse existing data, add only what's missing

| Strategy framework needs | Source |
|---|---|
| Niche/topic | Already exists — the selected service's description |
| Ideal audience | Already exists — `service.mkt.audience` |
| Main platform | Already exists — the existing platform dropdown |
| Primary goal (growth/authority/sales, priority order) | **New** |
| Profile level (beginner <1K / medium 1K-20K / established 20K+) | **New** |
| Monetization status (existing offer, or pre-monetization) | **New** |
| Content style (educational/story/opinion/documentary/mixed) | **New** |

The four new fields are **tenant-level, not per-service** (one company
profile per platform, not different follower counts per service line).
Store them under a new top-level key (e.g. `campaignStrategy`) in the
existing tenant-data JSON blob — flows through the already-existing
autosave endpoint automatically, no new backend infrastructure needed.

## Plan

### Step 1 — Toggle + one-time strategy profile
In the existing Campaign & AI card, add a "Quick post / Strategic mode"
toggle. Selecting Strategic Mode for the first time (no `campaignStrategy`
saved yet) shows a small inline form for the 4 new fields — "Save &
Continue." Once saved, it's reused automatically on every future
Strategic Mode generation, with a small "Edit strategy profile" link to
update it later. This replaces the source prompt's "ask every time"
pattern with "ask once, remember" — the right translation from a chatbot
persona into an actual app feature.

### Step 2 — Strategic generation prompt
A new prompt (separate function, not modifying the existing one), used
only when Strategic Mode is selected. Folds in:
- Tenant context: service niche/description, `mkt.audience`, platform,
  the 4 saved strategy fields.
- The evaluation framework as always-on guiding principles: optimize for
  saves/shares/follows over raw views, reach beyond existing followers,
  consistent positioning, real authority (original insight/proof, not
  generic claims), retention, conversion, current platform-native formats.
- Required output: **Hook options (3) → Body → CTA → Strategic rationale
  (2-3 lines)** — a genuinely different structure from Quick Post's
  post+hashtags+timing format.
- Voice: always speaks as the tenant's own company/brand (same "we"
  voice already used in Quick Post's output) — never first-person "I,"
  never any reference to AUK specifically regardless of which tenant is
  generating.

### Step 3 — Output UI
New rendering for Strategic Mode's output (hooks/body/CTA/rationale) —
distinct from Quick Post's existing card, shown only when Strategic Mode
is active. Design the concrete layout as you see fit, consistent with
this app's existing visual patterns.

### Step 4 — Usage tracking
Strategic Mode generations count toward the **same existing
`campaign_drafts` trial-gating counter** — it's still a campaign draft,
just a different mode. Do not create a new counter or new schema for
this; reuse what's already built and proven.

## Testing discipline
Same as every feature in this build: test on `rls-test` with Test Client
Co. Specifically confirm — Quick Post still works completely unchanged
(a real regression check, not assumed); Strategic Mode's one-time setup
form appears only once, then reuses the saved profile; the output never
leaks a hardcoded identity; trial cap counts correctly against the
existing counter. Production only after a clean pass.
