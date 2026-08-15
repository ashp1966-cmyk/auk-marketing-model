# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page React app: a 3-year marketing/sales planning model for AUK Marine & Mining (maritime/mining training & logistics). It models service revenue, marketing funnels, budget allocation, a CRM/MIS activity tracker, and AI-generated campaign/business-plan content — all client-side, persisted to `localStorage`, deployed as a static site + two Vercel serverless functions.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build (outputs to `dist/`)
- `npm run preview` — preview the production build locally
- No test suite, linter, or type checker is configured.

## Architecture

- **`src/App.jsx`** (~2700 lines) is the entire application. There is no router and no component-file split — every tab/section is a function component defined in this one file, rendered conditionally by the `tab` state in the top-level `App()` component (search `const NAV = [...]` around line 756 for the tab list, and the `tab === "..."` block right after it for what renders each one). When asked to work on a specific tab (e.g. "Funnel Plan", "Budget Optimizer"), grep this file for the matching function name (e.g. `function Funnel(`, `function BudgetOptimizer(`) rather than trying to read the whole file.
- **State lives entirely in `App()`** as individual `useState` hooks (services, budget, actuals, CRM rows, calendar, goals, roadmap, etc.), each seeded from `loadSaved()` (which reads `localStorage["auk-marketing-v1"]`) falling back to `*_SEED` constants defined near the top of the file. All state is passed down to tab components as props — there is no context or external state library.
- **Derived data** (`calc`, `funnelCalc`, `mktCost`) is computed with `useMemo`/plain expressions in `App()` from the raw service/budget state and passed down; tab components generally don't recompute business logic themselves.
- **Persistence**: auto-saves to `localStorage` on a 1200ms debounce (`useEffect` watching most state), plus an immediate flush on `beforeunload`/`pagehide`/tab-hidden via a ref (`saveDataRef`) so no changes are lost on close. `buildSaveData()` is the single source of truth for what gets persisted — add any new piece of state to both the `useState` seed (`_saved.xxx`) and `buildSaveData()`'s returned object, or it won't survive a refresh. A manual "Save" button and a "Download backup JSON" (`exportJSON`) also exist.
- **Auth**: a simple username/password gate (`Login` component) that posts to `/api/login`, which checks credentials against `APP_USERNAME`/`APP_PASSWORD` Vercel env vars. This is app-level access control, not per-user auth — there's a single shared login.
- **AI features** (in the `Campaign` and `BizPlan` components): the browser calls `/api/generate`, a Vercel function that proxies to the Anthropic Messages API (`https://api.anthropic.com/v1/messages`) using the `ANTHROPIC_API_KEY` env var, so the key never reaches the client. Any new AI-assisted feature should go through this same proxy pattern rather than calling Anthropic directly from the browser.
- **Styling**: a single template-literal CSS string (`const CSS`, near the top of `App.jsx`) injected via a `<style>` tag — no CSS modules, no Tailwind, no styled-components. Color tokens are CSS custom properties (`--navy-900`, `--brass`, `--teal`, etc.) reused across inline styles throughout the file.
- **`ErrorBoundary`** wraps the active tab's content (keyed by `tab`), so a crash in one tab doesn't take down the whole app — it resets when the user switches tabs.
- **Charts** use `recharts`; icons use `lucide-react`.
- **Deployment**: Vercel. `vercel.json` rewrites `/api/*` to the serverless functions in `api/` and everything else to `index.html` (SPA fallback). No backend database — all business data is local to the browser (`localStorage`) plus manual JSON export/import for backup/transfer between machines.
