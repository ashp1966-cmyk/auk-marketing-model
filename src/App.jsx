import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  Anchor, Compass, LayoutDashboard, SlidersHorizontal, TrendingUp,
  Users, Megaphone, Radar, Sparkles, Plus, Trash2, Calendar, Clock,
  Repeat, Hash, Loader2, ChevronRight, Filter, Package, Map, Gauge, LogOut, BarChart2, TrendingDown, Save, Download, Target, Shield, Rocket, ListChecks,
} from "lucide-react";

/* ---------------------------------------------------------------- theme */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root{
  --navy-900:#071523; --navy-850:#0a1c2e; --navy-800:#0d2338; --navy-700:#123049;
  --navy-600:#1b405e; --line:#1f4867;
  --brass:#c9a24b; --brass-hi:#e7c877;
  --ink:#eaf1f8; --slate:#8ba3bd; --slate-dim:#5f7793;
  --teal:#4ba9a3; --green:#46b98a; --amber:#e0a83e; --red:#d97b7b;
}
*{box-sizing:border-box}
.aukm{font-family:'Inter',system-ui,sans-serif;background:var(--navy-900);color:var(--ink);min-height:100vh;line-height:1.5;}
.aukm h1,.aukm h2,.aukm h3,.aukm .disp{font-family:'Barlow Condensed',sans-serif;letter-spacing:.02em;}
.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}
.eyebrow{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:var(--brass);font-weight:600;}
.aukm ::-webkit-scrollbar{height:8px;width:8px}.aukm ::-webkit-scrollbar-thumb{background:var(--navy-600);border-radius:4px}

/* header / plimsoll rule */
.topbar{display:flex;align-items:center;gap:14px;padding:16px 24px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--navy-850),var(--navy-900));position:sticky;top:0;z-index:20;flex-wrap:wrap;}
.mark{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--brass);display:flex;align-items:center;justify-content:center;color:var(--brass);flex:none;}
.brandT{font-size:24px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.06em;}
.brandS{font-size:11.5px;color:var(--slate);letter-spacing:.14em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
.plimsoll{height:1px;background:var(--line);position:relative;margin:0;}
.plimsoll::before{content:"";position:absolute;left:50%;top:-4px;width:9px;height:9px;border-radius:50%;border:1.5px solid var(--brass);background:var(--navy-900);transform:translateX(-50%);}

/* nav */
.nav{display:flex;gap:2px;padding:8px 16px;overflow-x:auto;border-bottom:1px solid var(--line);background:var(--navy-850);}
.navb{display:flex;align-items:center;gap:8px;padding:9px 14px;border:0;background:transparent;color:var(--slate);font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.08em;font-size:15px;font-weight:600;cursor:pointer;border-radius:8px;white-space:nowrap;transition:.15s;}
.navb:hover{color:var(--ink);background:var(--navy-800);}
.navb.on{color:var(--navy-900);background:var(--brass);}

.wrap{max-width:1200px;margin:0 auto;padding:26px 24px 80px;}
.sechead{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin:6px 0 18px;flex-wrap:wrap;}
.sechead h2{font-size:30px;font-weight:700;text-transform:uppercase;}
.sub{color:var(--slate);font-size:14px;max-width:60ch;}

.card{background:var(--navy-800);border:1px solid var(--line);border-radius:14px;padding:18px 20px;}
.grid{display:grid;gap:16px;}
.g4{grid-template-columns:repeat(4,1fr);}.g3{grid-template-columns:repeat(3,1fr);}.g2{grid-template-columns:repeat(2,1fr);}
@media(max-width:860px){.g4,.g3,.g2{grid-template-columns:1fr 1fr;}}
@media(max-width:560px){.g4,.g3,.g2{grid-template-columns:1fr;}}

/* KPI gauge card */
.kpi{position:relative;overflow:hidden;}
.kpi .lab{font-size:12px;color:var(--slate);text-transform:uppercase;letter-spacing:.1em;font-family:'Barlow Condensed',sans-serif;font-weight:600;}
.kpi .val{font-size:32px;font-weight:600;margin-top:6px;letter-spacing:-.01em;}
.kpi .foot{font-size:12.5px;color:var(--slate-dim);margin-top:4px;}
.gauge{height:5px;background:var(--navy-600);border-radius:3px;margin-top:14px;overflow:hidden;}
.gauge>i{display:block;height:100%;background:linear-gradient(90deg,var(--brass),var(--brass-hi));border-radius:3px;}

/* table */
.tbl{width:100%;border-collapse:collapse;font-size:13.5px;}
.tbl th{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.06em;font-size:13px;color:var(--slate);text-align:right;padding:10px 10px;border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap;}
.tbl th:first-child,.tbl td:first-child{text-align:left;}
.tbl td{padding:10px 10px;border-bottom:1px solid var(--navy-700);text-align:right;}
.tbl tr:hover td{background:var(--navy-850);}
.tbl tfoot td{border-top:2px solid var(--line);border-bottom:0;font-weight:600;color:var(--ink);}
.svc{font-weight:600;color:var(--ink);}

/* inputs */
.field{display:flex;flex-direction:column;gap:5px;}
.field label{font-size:11.5px;color:var(--slate);text-transform:uppercase;letter-spacing:.08em;font-family:'Barlow Condensed',sans-serif;font-weight:600;}
.inp,.sel,.ta{background:var(--navy-900);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:9px 11px;font-size:14px;font-family:inherit;width:100%;}
.inp.num{font-family:'JetBrains Mono',monospace;text-align:right;}
.inp:focus,.sel:focus,.ta:focus{outline:none;border-color:var(--brass);}
.ta{resize:vertical;min-height:70px;line-height:1.55;}
.cellinp{background:transparent;border:1px solid transparent;color:var(--ink);border-radius:6px;padding:5px 6px;font-family:'JetBrains Mono',monospace;text-align:right;width:88px;font-size:13px;}
.cellinp:hover{border-color:var(--navy-600);}
.cellinp:focus{outline:none;border-color:var(--brass);background:var(--navy-900);}

.btn{display:inline-flex;align-items:center;gap:8px;background:var(--brass);color:var(--navy-900);border:0;border-radius:9px;padding:10px 16px;font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:15px;cursor:pointer;transition:.15s;}
.btn:hover{background:var(--brass-hi);}
.btn:disabled{opacity:.5;cursor:not-allowed;}
.btn.ghost{background:transparent;color:var(--brass);border:1px solid var(--brass);}
.btn.ghost:hover{background:rgba(201,162,75,.12);}
.btn.sm{padding:7px 12px;font-size:13px;}
.iconbtn{background:transparent;border:0;color:var(--slate-dim);cursor:pointer;padding:4px;border-radius:6px;}
.iconbtn:hover{color:var(--red);background:var(--navy-700);}

.tag{display:inline-block;font-size:11px;font-family:'JetBrains Mono',monospace;padding:2px 8px;border-radius:20px;border:1px solid var(--line);color:var(--slate);}
.pill{display:inline-flex;align-items:center;gap:6px;font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.05em;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:20px;}

.hint{font-size:12.5px;color:var(--slate-dim);}
.note{background:var(--navy-850);border:1px dashed var(--line);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--slate);}
.divh{display:flex;align-items:center;gap:10px;margin:26px 0 14px;}
.divh h3{font-size:20px;text-transform:uppercase;font-weight:700;}
.divh .ln{flex:1;height:1px;background:var(--line);}

/* login */
.loginwrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at 50% -20%,#123049 0%,#071523 60%);}
.loginbox{width:100%;max-width:400px;background:var(--navy-800);border:1px solid var(--line);border-radius:16px;padding:34px 30px;}
.loginbox .mark{width:52px;height:52px;margin:0 auto 14px;}
.loginT{text-align:center;font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.loginS{text-align:center;color:var(--slate);font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;margin-bottom:24px;}
.loginerr{color:var(--red);font-size:13px;text-align:center;margin-top:12px;}

/* AI post card */
.postbox{background:var(--navy-850);border:1px solid var(--line);border-radius:12px;padding:16px 18px;white-space:pre-wrap;font-size:14px;line-height:1.6;}
.metarow{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;}
.meta{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--slate);}
.meta b{color:var(--ink);font-weight:600;}
.hashes{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;}
.hashes span{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--teal);}
`;

/* ---------------------------------------------------------------- helpers */
const YEARS = ["Year 1", "Year 2", "Year 3"];
const R = (n) => "R\u00A0" + Math.round(n || 0).toLocaleString("en-ZA");
const Rk = (n) => {
  n = n || 0;
  if (Math.abs(n) >= 1e6) return "R\u00A0" + (n / 1e6).toFixed(2) + "m";
  if (Math.abs(n) >= 1e3) return "R\u00A0" + (n / 1e3).toFixed(0) + "k";
  return R(n);
};
const pct = (n) => (n * 100).toFixed(1) + "%";
const marginColor = (m) => (m >= 0.4 ? "var(--green)" : m >= 0.25 ? "var(--amber)" : "var(--red)");
const BARCLR = ["#c9a24b", "#4ba9a3", "#e7c877", "#6f9bd1", "#46b98a", "#b98acb"];

/* seed inputs — grounded in real SA data + AUK's own targeting notes, all editable.
   Market anchors: TNPA ~8,630 vessel arrivals FY2025/26 (+9% y/y); ~304m tonnes throughput (SAnews, May 2026).
   Per-service funnel economics reflect real channels: LinkedIn for global ship managers (higher CPM/CPC),
   Meta/Google for mass SA training (cheaper). Rates from 2025/26 B2B benchmarks. Prices = calibrate w/ AUK actuals. */
const SEED = [
  { id: 1, name: "Logistics", market: 4000, price: 40000, cost: 0.72, orders: [60, 120, 200],
    mkt: { audience: "Exporters, importers, freight forwarders & traders", channel: "LinkedIn", geo: "SA + cross-border",
      aw: 0.020, it: 0.05, cl: 0.12, cpm: 150, cpc: 15, touches: 4, cpt: 250,
      segments: ["Container & Air · Breakbulk · Bulk (Export/Import)", "Modes: Road · Rail · Water · Air", "Transportation · Warehousing · Value-added"] } },
  { id: 2, name: "Ship inspection services", market: 4000, price: 55000, cost: 0.45, orders: [80, 160, 240],
    mkt: { audience: "Ship managers & technical superintendents", channel: "LinkedIn", geo: "Global",
      aw: 0.012, it: 0.08, cl: 0.12, cpm: 800, cpc: 40, touches: 4, cpt: 350,
      segments: ["Condition & pre-purchase surveys", "Bunker & draft surveys", "Class / flag-related", "P&I condition surveys"] } },
  { id: 3, name: "Maritime consulting services", market: 250, price: 220000, cost: 0.40, orders: [10, 18, 28],
    mkt: { audience: "Ship owners, operators & port authorities", channel: "LinkedIn", geo: "Regional / global",
      aw: 0.012, it: 0.07, cl: 0.15, cpm: 700, cpc: 40, touches: 5, cpt: 400,
      segments: ["Ports & shipping strategy", "Operations & efficiency", "Regulatory / compliance"] } },
  { id: 4, name: "Business consulting (SA)", market: 600, price: 140000, cost: 0.42, orders: [12, 24, 36],
    mkt: { audience: "SA corporates & SMMEs (BEE)", channel: "LinkedIn", geo: "South Africa",
      aw: 0.020, it: 0.06, cl: 0.12, cpm: 250, cpc: 25, touches: 4, cpt: 300,
      segments: ["Strategy & growth", "BEE & transformation", "Industry-specific advisory"] } },
  { id: 5, name: "Cargo inspection & loss adjusting", market: 3500, price: 48000, cost: 0.48, orders: [105, 175, 280],
    mkt: { audience: "Insurers, cargo owners, traders & P&I clubs", channel: "LinkedIn", geo: "SA + regional",
      aw: 0.018, it: 0.06, cl: 0.14, cpm: 400, cpc: 30, touches: 3, cpt: 300,
      segments: ["Draft & quantity surveys", "Sampling & quality", "Loss & claims adjustment"] } },
  { id: 6, name: "Training & skills development", market: 2500, price: 14000, cost: 0.38, orders: [100, 175, 250],
    mkt: { audience: "Seafarers, SMMEs, entrepreneurs & employers", channel: "Meta", geo: "South Africa",
      aw: 0.025, it: 0.05, cl: 0.15, cpm: 90, cpc: 8, touches: 2, cpt: 150,
      segments: ["IMO / DoT courses", "Skills programmes", "Corporate & in-house training"] } },
];
const CHANNELS = ["LinkedIn", "Meta", "Google", "Email", "Referral"];

/* MIS constants — from AUK's own MIS (average gross profit per unit per service) */
const MIS_MONTHS = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
const GP_PER_UNIT = { 1:10000, 2:20000, 3:25000, 4:25000, 5:20000, 6:12000 };

/* Prospective customers from AUK MIS — pre-loaded as pipeline anchors */
const PROSPECTS = [
  { co:"Transnet",          svc:"Training & skills development",          stage:"Lead", val:36000 },
  { co:"DTI",               svc:"Training & skills development",          stage:"Lead", val:36000 },
  { co:"Hanseatic/FMC",     svc:"Ship inspection services",               stage:"Contacted", val:360000 },
  { co:"Safe Lane",         svc:"Ship inspection services",               stage:"Lead", val:110000 },
  { co:"Shipping companies",svc:"Logistics",                              stage:"Contacted", val:480000 },
  { co:"Songatech",         svc:"Logistics",                              stage:"Lead", val:40000 },
  { co:"AMSOL",             svc:"Training & skills development",          stage:"Lead", val:72000 },
  { co:"DoT",               svc:"Maritime consulting services",           stage:"Lead", val:140000 },
  { co:"Amava",             svc:"Logistics",                              stage:"Contacted", val:120000 },
  { co:"Mining Company 1",  svc:"Cargo inspection & loss adjusting",      stage:"Lead", val:288000 },
  { co:"Mining Company 2",  svc:"Cargo inspection & loss adjusting",      stage:"Lead", val:288000 },
  { co:"Mining Company 3",  svc:"Business consulting (SA)",               stage:"Lead", val:420000 },
  { co:"HYA Matla",         svc:"Business consulting (SA)",               stage:"Lead", val:280000 },
  { co:"Asal Freight",      svc:"Logistics",                              stage:"Lead", val:120000 },
  { co:"Government Agency", svc:"Maritime consulting services",           stage:"Lead", val:140000 },
];

const CLIENT_EXPECT = "What clients expect: expert, tailored advice & strategy; quality delivered on time, on budget and to scope; clear communication on progress; problems solved as they arise; immersive AI/ML-enabled experiences; personalisation; and strong data protection & ethics.";

/* ---- Business Plan & Strategy data — from AUK strategy workbook (2025) ---- */
const VISION = "Africa's Leading Digital & Green Training, Maritime, Mining, Metallurgy & Logistics Solutions Partner";

const GOALS5_SEED = {
  1: { turnover: 15000000, profit: 2250000, clients: 25 },
  2: { turnover: 25000000, profit: 3750000, clients: 5 },
  3: { turnover: 7500000,  profit: 1125000, clients: 8 },
  4: { turnover: 7500000,  profit: 1125000, clients: 7 },
  5: { turnover: 25000000, profit: 3750000, clients: 5 },
  6: { turnover: 15000000, profit: 2250000, clients: 15 },
};

const SWOT = {
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
};

const PILLARS = [
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
];

const FOCUS_AVOID = {
  focus: ["Consulting", "Training", "Digital services", "Remote inspections", "ESG compliance", "IoT & AI solutions"],
  avoid: ["Trading (high risk, low margin)", "Smelting (capital intensive, price-sensitive)", "Commodity automation (low margin)"],
};

const BIZ_MODELS = {
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
};

const ANSOFF = [
  { cell: "Current market × Current services", code: "1A", steps: "Add features (remote & technical support) · price discrimination & credit · differentiated branding · out-deliver competitors · CRM & networking with current stakeholders" },
  { cell: "New market × Current services", code: "1B", steps: "New geographies · global marketing · align services to international requirements" },
  { cell: "Current market × New services", code: "2A", steps: "Aggressive awareness marketing for newly launched services" },
  { cell: "New market × New services", code: "2B", steps: "Enter only with a partner or proven demand — highest risk quadrant" },
];

const COMPETITORS = [
  ["Kuehne + Nagel", "No. 1 ocean freight forwarder in the world"],
  ["DAMCO (Maersk)", "AP Moller division; 10th largest globally"],
  ["Agility", "Offices in 100 countries; complex assignments in challenging conditions"],
  ["DSV Panalpina", "Very big and vast network"],
  ["JM Baxi", "100 years of establishment (India)"],
  ["Jeena & Company", "Bonded terminals; own state-of-the-art ERP"],
  ["LCL Logistics", "Own CFS and warehouses"],
];

const ROADMAP_SEED = [
  { id: 1,  phase: "90-Day",  item: "Rebrand & reposition — update website messaging", status: "Done" },
  { id: 2,  phase: "90-Day",  item: "Launch new service pages", status: "Pending" },
  { id: 3,  phase: "90-Day",  item: "Publish a strategic whitepaper", status: "Pending" },
  { id: 4,  phase: "90-Day",  item: "Digital training platform — start with 10 flagship courses + corporate packages", status: "Pending" },
  { id: 5,  phase: "90-Day",  item: "Digital inspection pilot — drones + AI defect detection; discounted pilot to 3 clients", status: "Pending" },
  { id: 6,  phase: "90-Day",  item: "Create ESG compliance service line — templates, tools, dashboards", status: "Pending" },
  { id: 7,  phase: "90-Day",  item: "Develop partnerships — IoT vendors, drone companies, universities, port authorities", status: "Pending" },
  { id: 8,  phase: "Phase 1 (0–6 mo)",   item: "Implement CRM; build digital training platform; AI-assisted inspection templates; digitise SOPs", status: "In progress" },
  { id: 9,  phase: "Phase 2 (6–18 mo)",  item: "Launch digital inspection platform; IoT pilots; digital twin prototypes; AI analytics dashboards", status: "Pending" },
  { id: 10, phase: "Phase 3 (18–36 mo)", item: "Subscription digital services; training academy across Africa; tech partnerships; AUK AI Lab", status: "Pending" },
];

/* Product/service portfolio — from AUK's course catalogue and consulting service map */
const PORTFOLIO = {
  6: /* Training & skills development */ {
    note: "AUK's live course catalogue. Seafarer maritime courses feed the shore-inspector pipeline; SMME courses cross-sell business & AI services.",
    groups: [
      { title: "Logistics & shipping", items: [
        { name: "Forwarding & Customs Compliance L3", code: "", seg: "Shipping & maritime cos", out: "Employability" },
        { name: "Shipping, Port & Ships' Agency", code: "SPM001", seg: "Transport & logistics", out: "Enhance performance" },
      ] },
      { title: "Business & entrepreneurship", items: [
        { name: "Entrepreneurship, Incubation & Innovation", code: "BO7", seg: "Entrepreneurs", out: "Start your own business" },
      ] },
      { title: "Personal development", items: [
        { name: "Stress Management & Motivation", code: "SK03", seg: "General public", out: "Personal wellbeing" },
      ] },
      { title: "Marketing", items: [
        { name: "Market Research, Branding & Sales Strategy", code: "BO8", seg: "SMMEs", out: "Sell your product / solutions" },
      ] },
      { title: "Information & AI", items: [
        { name: "Social Media Marketing & AI", code: "B02", seg: "SMMEs", out: "Sell your product / solutions" },
      ] },
      { title: "Maritime · seafarer to shore inspector", items: [
        { name: "Internal Audit on a Ship", code: "SPM015", seg: "Seafarers", out: "Shore job as ship inspector" },
        { name: "PSC Preparation", code: "SPM017", seg: "Seafarers", out: "Shore job as ship inspector" },
        { name: "RightShip Inspection Readiness", code: "SPM016", seg: "Seafarers", out: "Shore job as ship inspector" },
        { name: "Pre-Purchase Inspection on a Ship", code: "SPM018", seg: "Seafarers", out: "Shore job as ship inspector" },
        { name: "Condition Inspection on a Ship", code: "SPM019", seg: "Seafarers", out: "Shore job as ship inspector" },
      ] },
      { title: "Port & maritime", items: [
        { name: "Port Development, Operations & Marketing", code: "SPM009", seg: "Private companies", out: "For port developers" },
        { name: "Maritime Risk Assessment", code: "SPM011", seg: "Ports & DoTs", out: "Understand maritime risk" },
        { name: "Pilotage (with simulator)", code: "S08", seg: "Captains & navigators", out: "On-the-job + shore roles" },
      ] },
    ],
  },
  3: /* Maritime consulting services */ {
    note: CLIENT_EXPECT,
    groups: [
      { title: "Maritime, port & shipping", items: [
        { name: "Non-financial risk assessment — Shipping, Port & Maritime", seg: "Shipping & maritime · Port" },
        { name: "Port optimisation & cargo projections", seg: "Port" },
        { name: "Shipping & maritime advisory", seg: "Shipping & maritime" },
        { name: "Funding model & tariff setting for state-owned entities", seg: "Maritime · Government" },
        { name: "Supply chain & transport corridor optimisation", seg: "Manufacturing · Government" },
      ] },
      { title: "Feasibility & project development", items: [
        { name: "Conduct of feasibility studies", seg: "Metallurgy · Shipping · Port · Mining · Logistics · SMME" },
        { name: "Project case to project development studies", seg: "Metallurgy · Shipping · Port · Mining · Logistics · SMME" },
      ] },
      { title: "Market & access", items: [
        { name: "Market access research", seg: "Mining · Automotive · SMME" },
      ] },
    ],
  },
  4: /* Business consulting (SA) */ {
    note: CLIENT_EXPECT,
    groups: [
      { title: "Strategy & growth (any industry)", items: [
        { name: "Business diagnostics & improvement", seg: "Any industry" },
        { name: "Business plans & models development", seg: "Any industry" },
        { name: "Growth strategy development & implementation", seg: "Any industry" },
      ] },
      { title: "Marketing & digital", items: [
        { name: "Marketing strategy development & implementation", seg: "Any industry" },
        { name: "Social media strategy development & implementation", seg: "Any industry" },
      ] },
      { title: "Skills & technology", items: [
        { name: "Skill development strategy", seg: "Education · Any industry" },
        { name: "Automation, AI & ML", seg: "Any industry" },
      ] },
    ],
  },
  2: /* Ship inspection services */ {
    note: "Sold to ship managers & technical superintendents worldwide, primarily via LinkedIn.",
    groups: [ { title: "Survey types", items: [
      { name: "Condition & pre-purchase surveys", seg: "Ship managers" },
      { name: "Bunker & draft surveys", seg: "Owners & charterers" },
      { name: "Class / flag-related inspections", seg: "Owners" },
      { name: "P&I condition surveys", seg: "P&I clubs" },
      { name: "PSC / RightShip readiness", seg: "Managers" },
    ] } ],
  },
  5: /* Cargo inspection & loss adjusting */ {
    note: "Sold to insurers, cargo owners, traders and P&I clubs across SA and the wider region. AUK has a track record since 2012 — 154 vessel inspections, 21 consulting mandates and 2,219 logistics engagements on file.",
    groups: [
      { title: "Quantity & condition surveys", items: [
        { name: "Draft surveys", seg: "Traders · charterers · owners", out: "Verified cargo quantity at load/discharge" },
        { name: "Quantity / tally surveys", seg: "Cargo owners · traders", out: "Independent count & measurement" },
        { name: "Condition inspection on arrival / departure", seg: "Owners · insurers", out: "Documented cargo state" },
        { name: "Sampling & quality inspection", seg: "Cargo owners · buyers", out: "Quality certification" },
      ] },
      { title: "Loss adjustment & claims", items: [
        { name: "Loss & claims adjustment", seg: "Insurers · P&I clubs", out: "Quantified loss settlement" },
        { name: "Marine casualty & damage survey", seg: "Insurers · owners", out: "Cause & extent of damage" },
        { name: "Accident investigation", seg: "P&I clubs · insurers", out: "Root cause & liability report" },
        { name: "Damage assessment", seg: "Owners · underwriters", out: "Repair cost estimate" },
      ] },
      { title: "Risk & warranty", items: [
        { name: "Marine warranty survey", seg: "Underwriters · banks", out: "Independent risk sign-off" },
        { name: "Loss prevention survey", seg: "P&I clubs", out: "Prevent future claims" },
        { name: "Seaworthiness investigation", seg: "Owners · P&I", out: "Fitness-for-purpose certification" },
        { name: "Failure investigations", seg: "Owners · insurers", out: "Technical root cause analysis" },
      ] },
      { title: "Specialist & advisory", items: [
        { name: "Advice on repair solutions & costs", seg: "Owners · underwriters", out: "Cost-optimised repair path" },
        { name: "Loss of hire surveys", seg: "Owners · charterers", out: "Revenue-loss quantification" },
        { name: "Port & maritime risk assessment", seg: "Port authorities · operators", out: "Risk register & mitigation plan" },
      ] },
    ],
  },
  1: /* Logistics */ {
    note: "Delivered through the AUK agent & provider network (Imperial, CWT, transporters, stevedores) — a referral-led channel rather than paid ads.",
    segsCust: ["Exporters", "Importers", "Freight forwarders", "Traders"],
    segsCargo: ["Container & Air", "Breakbulk", "Bulk (Export/Import)"],
    landingPrice: true,
    groups: [
      { title: "Transportation", items: [
        { name: "Trucking", seg: "Road" },
        { name: "Rail", seg: "Rail" },
        { name: "Air", seg: "Air" },
        { name: "Courier", seg: "Express" },
      ] },
      { title: "Warehousing", items: [
        { name: "Stuffing", seg: "Container" },
        { name: "Storage", seg: "Warehouse" },
        { name: "Handling", seg: "Warehouse" },
      ] },
    ],
  },
};

/* ---------------------------------------------------------------- persistence */
function loadSaved() {
  try {
    const s = localStorage.getItem("auk-marketing-v1");
    return s ? JSON.parse(s) : {};
  } catch (e) { return {}; }
}
function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "auk-marketing-" + new Date().toISOString().slice(0,10) + ".json"; a.click();
}

/* ---------------------------------------------------------------- portfolio item state */
function initPortfolioItems(saved) {
  if (saved) return saved;
  const result = {};
  Object.entries(PORTFOLIO).forEach(([id, pd]) => {
    if (pd && pd.groups) {
      result[id] = pd.groups.map((g) => ({
        title: g.title,
        items: g.items.map((it) => ({ ...it, usp: it.usp || "" })),
      }));
    }
  });
  return result;
}

/* ---------------------------------------------------------------- login gate */
function Login({ onOk }) {
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!u || !pw) { setErr("Enter username and password"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: pw }),
      });
      if (res.ok) { onOk(); }
      else { setErr("Invalid username or password"); }
    } catch (e) {
      setErr("Could not reach the login service");
    } finally { setBusy(false); }
  };

  return (
    <div className="aukm">
      <style>{CSS}</style>
      <div className="loginwrap">
        <div className="loginbox">
          <div className="mark"><Anchor size={26} /></div>
          <div className="loginT">AUK Marine <span style={{ color: "var(--brass)" }}>&amp; Mining</span></div>
          <div className="loginS">Linked Marketing Model · Restricted access</div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Username</label>
            <input className="inp" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>Password</label>
            <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          {err && <div className="loginerr">{err}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- app */
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState("dash");
  const [saveMsg, setSaveMsg] = useState("");
  const _saved = loadSaved();
  const [portfolioItems, setPortfolioItems] = useState(() => initPortfolioItems(_saved.portfolioItems));
  const [goals5, setGoals5] = useState(() => _saved.goals5 || GOALS5_SEED);
  const [roadmap, setRoadmap] = useState(() => _saved.roadmap || ROADMAP_SEED);
  const [svcs, setSvcs] = useState(() => _saved.svcs || SEED);
  const [budget, setBudget] = useState(() => _saved.budget || {
    salesMgr: 1, salesMgrPay: 780000,
    campMgr: 2, campMgrPay: 540000,
    socialAds: 1300000, otherPromo: 900000,
  });
  // MIS actuals state: svcId -> 12 monthly actual unit values
  const [actuals, setActuals] = useState(() =>
    _saved.actuals || Object.fromEntries(SEED.map((s) => [s.id, Array(12).fill(0)]))
  );
  const [misIndirect, setMisIndirect] = useState(() => _saved.misIndirect || { hr: 24000, other: 62500 });

  const calc = useMemo(() => {
    const rows = svcs.map((s) => {
      const yrs = s.orders.map((ord) => {
        const customers = ord;
        const sh = s.market ? ord / s.market : 0;
        const turnover = customers * s.price;
        const cost = turnover * s.cost;
        const gp = turnover - cost;
        return { sh, orders: ord, customers, turnover, cost, gp, margin: turnover ? gp / turnover : 0 };
      });
      return { ...s, yrs };
    });
    const totals = YEARS.map((_, i) => {
      const turnover = rows.reduce((a, r) => a + r.yrs[i].turnover, 0);
      const gp = rows.reduce((a, r) => a + r.yrs[i].gp, 0);
      const cust = rows.reduce((a, r) => a + r.yrs[i].customers, 0);
      return { turnover, gp, cust, margin: turnover ? gp / turnover : 0 };
    });
    return { rows, totals };
  }, [svcs]);

  const mktCost =
    budget.salesMgr * budget.salesMgrPay +
    budget.campMgr * budget.campMgrPay +
    budget.socialAds + budget.otherPromo;

  // Auto-save to localStorage whenever key data changes
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const data = { svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap, savedAt: new Date().toISOString() };
        localStorage.setItem("auk-marketing-v1", JSON.stringify(data));
      } catch (e) {}
    }, 1200); // 1.2s debounce
    return () => clearTimeout(timer);
  }, [svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap]);

  const saveNow = useCallback(() => {
    try {
      const data = { svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap, savedAt: new Date().toISOString() };
      localStorage.setItem("auk-marketing-v1", JSON.stringify(data));
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e) { setSaveMsg("Save failed"); }
  }, [svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap]);

  const downloadBackup = useCallback(() => {
    exportJSON({ svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap, savedAt: new Date().toISOString() });
  }, [svcs, budget, actuals, misIndirect, portfolioItems, goals5, roadmap]);

  const funnelCalc = useMemo(() => {
    const rows = calc.rows.map((r) => {
      const m = r.mkt || {};
      const fyrs = r.yrs.map((y) => {
        const customers = y.customers;
        const leads = m.cl ? customers / m.cl : 0;
        const engaged = m.it ? leads / m.it : 0;
        const reach = m.aw ? engaged / m.aw : 0;
        const cAware = (reach * (m.cpm || 0)) / 1000;
        const cInterest = engaged * (m.cpc || 0);
        const cDecision = leads * (m.touches || 0) * (m.cpt || 0);
        const total = cAware + cInterest + cDecision;
        return { customers, leads, engaged, reach, cAware, cInterest, cDecision, total, cpa: customers ? total / customers : 0 };
      });
      return { ...r, fyrs };
    });
    const totals = YEARS.map((_, i) => {
      const sum = (k) => rows.reduce((a, r) => a + r.fyrs[i][k], 0);
      const customers = sum("customers"), total = sum("total");
      return { customers, leads: sum("leads"), engaged: sum("engaged"), reach: sum("reach"),
        cAware: sum("cAware"), cInterest: sum("cInterest"), cDecision: sum("cDecision"),
        total, cpa: customers ? total / customers : 0 };
    });
    return { rows, totals };
  }, [calc]);

  const NAV = [
    ["dash", "Dashboard", LayoutDashboard],
    ["inputs", "Inputs", SlidersHorizontal],
    ["portfolio", "Portfolio", Package],
    ["rev", "Revenue & Margins", TrendingUp],
    ["funnel", "Funnel Plan", Filter],
    ["res", "Resources & Budget", Users],
    ["camp", "Campaign & AI", Sparkles],
    ["play", "Playbook", Map],
    ["crm", "Feedback & CRM", Radar],
    ["mis", "MIS · Activity", BarChart2],
    ["plan", "Business Plan", Target],
  ];

  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <div className="aukm">
      <style>{CSS}</style>

      <div className="topbar">
        <div className="mark"><Anchor size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="brandT">AUK Marine <span style={{ color: "var(--brass)" }}>&amp; Mining</span></div>
          <div className="brandS">Linked Marketing Model · auk-maritime.com</div>
        </div>
        <div className="pill" style={{ background: "var(--navy-700)", color: "var(--slate)" }}>
          <Compass size={14} /> v1 · ZAR · 3-year plan
        </div>
        <button className="btn sm" onClick={saveNow}
          style={{ background: saveMsg ? "var(--green)" : "var(--brass)", color: "var(--navy-900)", minWidth: 90 }}>
          <Save size={14} /> {saveMsg || "Save"}
        </button>
        <button className="btn ghost sm" onClick={downloadBackup} title="Download backup JSON">
          <Download size={14} />
        </button>
        <button className="btn ghost sm" onClick={() => setAuthed(false)} title="Sign out">
          <LogOut size={15} /> Sign out
        </button>
      </div>
      <div className="plimsoll" />

      <div className="nav">
        {NAV.map(([id, label, Icon]) => (
          <button key={id} className={"navb" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="wrap">
        {tab === "dash" && <Dashboard calc={calc} mktCost={mktCost} />}
        {tab === "inputs" && <Inputs svcs={svcs} setSvcs={setSvcs} />}
        {tab === "portfolio" && <Portfolio svcs={svcs} setSvcs={setSvcs} portfolioItems={portfolioItems} setPortfolioItems={setPortfolioItems} />}
        {tab === "rev" && <Revenue calc={calc} />}
        {tab === "funnel" && <Funnel svcs={svcs} setSvcs={setSvcs} fc={funnelCalc} budget={budget} />}
        {tab === "res" && <Resources budget={budget} setBudget={setBudget} calc={calc} mktCost={mktCost} fc={funnelCalc} />}
        {tab === "camp" && <Campaign svcs={svcs} />}
        {tab === "play" && <Playbook />}
        {tab === "crm" && <CRM />}
        {tab === "mis" && <MIS svcs={svcs} actuals={actuals} setActuals={setActuals} misIndirect={misIndirect} setMisIndirect={setMisIndirect} />}
        {tab === "plan" && <BizPlan svcs={svcs} goals5={goals5} setGoals5={setGoals5} roadmap={roadmap} setRoadmap={setRoadmap} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dashboard */
function Dashboard({ calc, mktCost }) {
  const y3 = calc.totals[2];
  const roi = mktCost ? (y3.gp - mktCost) / mktCost : 0;
  const revData = YEARS.map((y, i) => {
    const row = { year: y };
    calc.rows.forEach((r) => (row[r.name] = Math.round(r.yrs[i].turnover)));
    return row;
  });
  const marginData = calc.rows.map((r) => ({ name: r.name, margin: +(r.yrs[2].margin * 100).toFixed(1) }));

  return (
    <>
      <div className="sechead">
        <div>
          <div className="eyebrow">Command view</div>
          <h2>Where the plan is headed</h2>
        </div>
        <div className="sub">Top-line targets across the three-year horizon. Every figure flows from the Inputs tab.</div>
      </div>

      <div className="grid g4">
        <Kpi label="Turnover · Year 3" val={Rk(y3.turnover)} foot={`${Rk(calc.totals[0].turnover)} in Year 1`} fill={0.85} />
        <Kpi label="Gross profit · Year 3" val={Rk(y3.gp)} foot="After delivery cost" fill={0.7} />
        <Kpi label="Blended margin · Year 3" val={pct(y3.margin)} foot="Weighted across services" fill={y3.margin} accent={marginColor(y3.margin)} />
        <Kpi label="Marketing ROI · Year 3" val={roi.toFixed(1) + "x"} foot={`On ${Rk(mktCost)} spend`} fill={Math.min(roi / 10, 1)} />
      </div>

      <div className="divh"><h3>Turnover by service</h3><div className="ln" /></div>
      <div className="card">
        <ResponsiveContainer width="100%" height={330}>
          <BarChart data={revData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f4867" vertical={false} />
            <XAxis dataKey="year" stroke="#8ba3bd" fontSize={13} />
            <YAxis stroke="#8ba3bd" fontSize={12} tickFormatter={(v) => "R" + (v / 1e6).toFixed(1) + "m"} />
            <Tooltip contentStyle={ttStyle} formatter={(v) => R(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {calc.rows.map((r, i) => (
              <Bar key={r.id} dataKey={r.name} stackId="a" fill={BARCLR[i % BARCLR.length]} radius={i === calc.rows.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="divh"><h3>Gross margin by service · Year 3</h3><div className="ln" /></div>
      <div className="card">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={marginData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f4867" horizontal={false} />
            <XAxis type="number" stroke="#8ba3bd" fontSize={12} domain={[0, 100]} tickFormatter={(v) => v + "%"} />
            <YAxis type="category" dataKey="name" stroke="#8ba3bd" fontSize={12} width={150} />
            <Tooltip contentStyle={ttStyle} formatter={(v) => v + "%"} />
            <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
              {marginData.map((d, i) => <Cell key={i} fill={marginColor(d.margin / 100)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="hint" style={{ marginTop: 10 }}>
          Bars turn <b style={{ color: "var(--green)" }}>green</b> above 40%, <b style={{ color: "var(--amber)" }}>amber</b> 25–40%, <b style={{ color: "var(--red)" }}>red</b> below 25% — a fast read on where margins are healthy.
        </div>
      </div>
    </>
  );
}
const ttStyle = { background: "#0d2338", border: "1px solid #1f4867", borderRadius: 8, color: "#eaf1f8", fontSize: 13 };

function Select({ label, val, set, opts }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="sel" value={val} onChange={(e) => set(e.target.value)}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Kpi({ label, val, foot, fill = 0.5, accent }) {
  return (
    <div className="card kpi">
      <div className="lab">{label}</div>
      <div className="val mono" style={{ color: accent || "var(--ink)" }}>{val}</div>
      <div className="foot">{foot}</div>
      <div className="gauge"><i style={{ width: Math.max(4, Math.min(1, fill) * 100) + "%", background: accent ? accent : undefined }} /></div>
    </div>
  );
}

/* ---------------------------------------------------------------- inputs */
function Inputs({ svcs, setSvcs }) {
  const upd = (id, key, val, idx) => {
    setSvcs((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (key === "orders") { const o = [...s.orders]; o[idx] = val; return { ...s, orders: o }; }
        return { ...s, [key]: val };
      })
    );
  };
  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Control panel</div><h2>Inputs &amp; assumptions</h2></div>
        <div className="sub">These are the only numbers you edit. Everything else in the model recalculates from here. Seeded with placeholder estimates — replace with your figures.</div>
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <b>How each line works:</b> you set the <b style={{ color: "var(--brass)" }}>order targets</b> — the number of orders/jobs/seats to win each year. Market share is then <b>calculated automatically</b> (orders ÷ addressable market). Those orders are what the campaigns and promotions must deliver — see the Funnel Plan. Orders × avg price = turnover; delivery cost % sets the margin. Order targets can also be set per service on the Portfolio tab.
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Service line</th>
              <th>Addressable market /yr</th>
              <th>Avg price (R)</th>
              <th>Delivery cost %</th>
              <th>Orders Y1</th><th>Orders Y2</th><th>Orders Y3</th>
              <th>Share Y1</th><th>Share Y2</th><th>Share Y3</th>
            </tr>
          </thead>
          <tbody>
            {svcs.map((s) => (
              <tr key={s.id}>
                <td><input className="cellinp" style={{ width: 210, textAlign: "left" }} value={s.name} onChange={(e) => upd(s.id, "name", e.target.value)} /></td>
                <td><input className="cellinp" value={s.market} onChange={(e) => upd(s.id, "market", num(e.target.value))} /></td>
                <td><input className="cellinp" value={s.price} onChange={(e) => upd(s.id, "price", num(e.target.value))} /></td>
                <td><input className="cellinp" style={{ width: 66 }} value={(s.cost * 100).toFixed(0)} onChange={(e) => upd(s.id, "cost", num(e.target.value) / 100)} /></td>
                {s.orders.map((o, i) => (
                  <td key={"o" + i}><input className="cellinp" style={{ width: 62 }} value={o} onChange={(e) => upd(s.id, "orders", num(e.target.value), i)} /></td>
                ))}
                {s.orders.map((o, i) => (
                  <td key={"s" + i} className="mono" style={{ color: "var(--teal)" }}>{s.market ? ((o / s.market) * 100).toFixed(1) + "%" : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 12 }}>Type order targets — the <b style={{ color: "var(--teal)" }}>teal share %</b> columns compute themselves (orders ÷ market). Everything recalculates instantly.</div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- portfolio */
function Portfolio({ svcs, setSvcs, portfolioItems, setPortfolioItems }) {
  const [sel, setSel] = useState(svcs[0]?.id);
  const s = svcs.find((x) => x.id === sel) || svcs[0];
  const p = PORTFOLIO[s?.id];
  const isConsult = s?.id === 3 || s?.id === 4;
  const groups = portfolioItems[s?.id] || p?.groups || [];

  const setOrder = (idx, val) => {
    const n = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
    setSvcs((prev) => prev.map((x) => {
      if (x.id !== s.id) return x;
      const o = [...x.orders]; o[idx] = n; return { ...x, orders: o };
    }));
  };

  const updItem = (gi, ii, key, val) => {
    setPortfolioItems((prev) => {
      const cur = prev[s.id] || groups.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, usp: it.usp || "" })) }));
      const next = cur.map((g, gIdx) => gIdx !== gi ? g : {
        ...g, items: g.items.map((it, iIdx) => iIdx !== ii ? it : { ...it, [key]: val }),
      });
      return { ...prev, [s.id]: next };
    });
  };

  const addItem = (gi) => {
    setPortfolioItems((prev) => {
      const cur = prev[s.id] || groups;
      const next = cur.map((g, gIdx) => gIdx !== gi ? g : {
        ...g, items: [...g.items, { name: "", seg: "", out: "", usp: "" }],
      });
      return { ...prev, [s.id]: next };
    });
  };

  const [lp, setLp] = useState({ invoice: 612066, duties: 0, freight: 29000, markup: 15 });
  const setL = (k, v) => setLp((o) => ({ ...o, [k]: isNaN(parseFloat(v)) ? 0 : parseFloat(v) }));
  const landing = (lp.invoice + lp.duties + lp.freight) * (1 + lp.markup / 100);
  const hasOut = groups.some((g) => g.items.some((it) => it.out !== undefined));
  const hasCode = groups.some((g) => g.items.some((it) => it.code !== undefined));

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">What we sell &amp; to whom</div><h2>Portfolio</h2></div>
        <div className="sub">Edit any field inline — Offering, Segment, Outcome and USP. Changes are saved automatically.</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {svcs.map((x) => (
          <button key={x.id} className={"navb" + (sel === x.id ? " on" : "")} onClick={() => setSel(x.id)} style={{ fontSize: 13, padding: "8px 12px" }}>{x.name}</button>
        ))}
      </div>

      {p ? (
        <>
          <div className="note" style={{ marginBottom: 16 }}>
            {isConsult ? <><b>Client expectations.</b> {p.note.replace("What clients expect: ", "")}</> : p.note}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Order targets · what marketing must deliver</div>
            <div className="grid g4">
              {YEARS.map((y, i) => (
                <div className="field" key={y}>
                  <label>Orders {y}</label>
                  <input className="inp num" value={s.orders[i]} onChange={(e) => setOrder(i, e.target.value)} />
                  <span className="hint" style={{ fontSize: 11 }}>= {s.market ? ((s.orders[i] / s.market) * 100).toFixed(1) : "0"}% market share</span>
                </div>
              ))}
              <div className="field">
                <label>Addressable market /yr</label>
                <div className="mono" style={{ padding: "9px 0", fontSize: 18 }}>{s.market.toLocaleString()}</div>
                <span className="hint" style={{ fontSize: 11 }}>Edit on Inputs tab</span>
              </div>
            </div>
          </div>

          {p.segsCust && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Freight-forwarding segments</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
                {p.segsCust.map((c) => <span key={c} className="pill" style={{ background: "var(--navy-700)", color: "var(--brass)" }}>{c}</span>)}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {p.segsCargo.map((c) => <span key={c} className="tag">{c}</span>)}
              </div>
            </div>
          )}

          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="divh"><h3>{g.title}</h3><div className="ln" /></div>
              <div className="card" style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 200 }}>Offering</th>
                      {hasCode && <th>Code</th>}
                      <th style={{ minWidth: 160, textAlign: "left" }}>Segment</th>
                      {hasOut && <th style={{ minWidth: 160, textAlign: "left" }}>Outcome</th>}
                      <th style={{ minWidth: 200, color: "var(--brass)", textAlign: "left" }}>USP &amp; Target Audience</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it, ii) => (
                      <tr key={ii}>
                        <td>
                          <input className="cellinp" style={{ width: "100%", minWidth: 190, textAlign: "left", fontWeight: 600, color: "var(--ink)" }}
                            value={it.name} placeholder="Offering name"
                            onChange={(e) => updItem(gi, ii, "name", e.target.value)} />
                        </td>
                        {hasCode && <td style={{ textAlign: "left" }}><span className="tag">{it.code || "—"}</span></td>}
                        <td>
                          <input className="cellinp" style={{ width: "100%", minWidth: 150, textAlign: "left", color: "var(--slate)" }}
                            value={it.seg} placeholder="Target segment"
                            onChange={(e) => updItem(gi, ii, "seg", e.target.value)} />
                        </td>
                        {hasOut && (
                          <td>
                            <input className="cellinp" style={{ width: "100%", minWidth: 150, textAlign: "left", color: "var(--teal)" }}
                              value={it.out || ""} placeholder="Value outcome"
                              onChange={(e) => updItem(gi, ii, "out", e.target.value)} />
                          </td>
                        )}
                        <td>
                          <input className="cellinp" style={{ width: "100%", minWidth: 190, textAlign: "left", color: "var(--brass)" }}
                            value={it.usp || ""} placeholder="USP + who specifically to target…"
                            onChange={(e) => updItem(gi, ii, "usp", e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => addItem(gi)}>
                  <Plus size={14} /> Add offering
                </button>
              </div>
            </div>
          ))}

          {p.landingPrice && (
            <>
              <div className="divh"><h3>Landing-price calculator</h3><div className="ln" /></div>
              <div className="card">
                <div className="hint" style={{ marginBottom: 14 }}>Landing price = (commercial invoice + duties excl. VAT + freight &amp; transport) &times; (1 + markup).</div>
                <div className="grid g4">
                  <div className="field"><label>Commercial invoice / CFR (R)</label><input className="inp num" value={lp.invoice} onChange={(e) => setL("invoice", e.target.value)} /></div>
                  <div className="field"><label>Duties excl. VAT (R)</label><input className="inp num" value={lp.duties} onChange={(e) => setL("duties", e.target.value)} /></div>
                  <div className="field"><label>Freight &amp; transport (R)</label><input className="inp num" value={lp.freight} onChange={(e) => setL("freight", e.target.value)} /></div>
                  <div className="field"><label>Markup %</label><input className="inp num" value={lp.markup} onChange={(e) => setL("markup", e.target.value)} /></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Kpi label="Landing price to the customer" val={R(landing)} foot={`${R(lp.invoice + lp.duties + lp.freight)} base + ${lp.markup}% markup`} fill={0.8} accent="var(--brass)" />
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="note">No portfolio detail captured for this line yet.</div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- revenue */
function Revenue({ calc }) {
  const [yr, setYr] = useState(2);
  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Financial output</div><h2>Revenue &amp; margins</h2></div>
        <div style={{ display: "flex", gap: 6 }}>
          {YEARS.map((y, i) => (
            <button key={i} className={"navb" + (yr === i ? " on" : "")} onClick={() => setYr(i)} style={{ fontSize: 13, padding: "7px 12px" }}>{y}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Service line</th><th>Share</th><th>Customers won</th><th>Avg price</th>
              <th>Turnover</th><th>Delivery cost</th><th>Gross profit</th><th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((r) => {
              const d = r.yrs[yr];
              return (
                <tr key={r.id}>
                  <td className="svc">{r.name}</td>
                  <td className="mono">{pct(d.sh)}</td>
                  <td className="mono">{Math.round(d.customers).toLocaleString()}</td>
                  <td className="mono">{Rk(r.price)}</td>
                  <td className="mono">{Rk(d.turnover)}</td>
                  <td className="mono" style={{ color: "var(--slate)" }}>{Rk(d.cost)}</td>
                  <td className="mono">{Rk(d.gp)}</td>
                  <td className="mono" style={{ color: marginColor(d.margin), fontWeight: 600 }}>{pct(d.margin)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · {YEARS[yr]}</td><td></td>
              <td className="mono">{Math.round(calc.totals[yr].cust).toLocaleString()}</td><td></td>
              <td className="mono">{Rk(calc.totals[yr].turnover)}</td>
              <td className="mono">{Rk(calc.totals[yr].turnover - calc.totals[yr].gp)}</td>
              <td className="mono">{Rk(calc.totals[yr].gp)}</td>
              <td className="mono" style={{ color: marginColor(calc.totals[yr].margin) }}>{pct(calc.totals[yr].margin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="divh"><h3>Turnover vs gross profit</h3><div className="ln" /></div>
      <div className="card">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={YEARS.map((y, i) => ({ year: y, Turnover: Math.round(calc.totals[i].turnover), "Gross profit": Math.round(calc.totals[i].gp) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f4867" vertical={false} />
            <XAxis dataKey="year" stroke="#8ba3bd" fontSize={13} />
            <YAxis stroke="#8ba3bd" fontSize={12} tickFormatter={(v) => "R" + (v / 1e6).toFixed(1) + "m"} />
            <Tooltip contentStyle={ttStyle} formatter={(v) => R(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Turnover" stroke="#c9a24b" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Gross profit" stroke="#46b98a" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- funnel plan */
function Funnel({ svcs, setSvcs, fc, budget }) {
  const [yr, setYr] = useState(0);
  const [sel, setSel] = useState(svcs[0]?.id);
  const s = svcs.find((x) => x.id === sel) || svcs[0];
  const fr = fc.rows.find((x) => x.id === s.id) || fc.rows[0];
  const d = fr.fyrs[yr];
  const t = fc.totals[yr];
  const budgeted = budget.socialAds + budget.otherPromo;
  const gap = budgeted - t.total;
  const gpPerCust = s.price * (1 - s.cost);
  const pays = d.cpa <= gpPerCust;

  const updMkt = (key, val) => setSvcs((prev) => prev.map((x) => (x.id === sel ? { ...x, mkt: { ...x.mkt, [key]: val } } : x)));
  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

  const rateFields = [
    ["Awareness \u2192 Interest", "aw", "% of reach that engages"],
    ["Interest \u2192 Decision", "it", "% of engaged that become leads"],
    ["Decision \u2192 Close", "cl", "% of leads that become customers"],
  ];
  const costFields = [
    ["Cost per 1,000 impressions", "cpm", "Channel CPM"],
    ["Nurture cost per engaged", "cpc", "Retargeting + content"],
    ["Sales touches per lead", "touches", "Calls + visits to close"],
    ["Cost per sales touch", "cpt", "Blended call / visit cost"],
  ];
  const stages = [
    ["Reach", d.reach, "var(--slate)"],
    ["Engaged", d.engaged, "var(--teal)"],
    ["Leads", d.leads, "var(--brass)"],
    ["Customers", d.customers, "var(--green)"],
  ];
  const maxStage = Math.max(...stages.map((x) => x[1]), 1);

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">The linked engine</div><h2>Funnel plan</h2></div>
        <div style={{ display: "flex", gap: 6 }}>
          {YEARS.map((y, i) => (
            <button key={i} className={"navb" + (yr === i ? " on" : "")} onClick={() => setYr(i)} style={{ fontSize: 13, padding: "7px 12px" }}>{y}</button>
          ))}
        </div>
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <b>Each service has its own funnel.</b> The customer target from Inputs is read backwards — customers ÷ close rate = leads, ÷ interest = engaged, ÷ awareness = reach — using this line's own channel, audience and costs. That's why a global ship-manager line on LinkedIn and a mass SA training line on Meta cost very different amounts per customer.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {svcs.map((x) => (
          <button key={x.id} className={"navb" + (sel === x.id ? " on" : "")} onClick={() => setSel(x.id)} style={{ fontSize: 13, padding: "8px 12px" }}>{x.name}</button>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Who &amp; where</div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Target audience</label>
            <input className="inp" value={s.mkt.audience} onChange={(e) => updMkt("audience", e.target.value)} />
          </div>
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Primary channel</label>
              <select className="sel" value={s.mkt.channel} onChange={(e) => updMkt("channel", e.target.value)}>
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Geography</label><input className="inp" value={s.mkt.geo} onChange={(e) => updMkt("geo", e.target.value)} /></div>
          </div>
          <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600 }}>Segments served</label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
            {(s.mkt.segments || []).map((seg, i) => <span key={i} className="tag">{seg}</span>)}
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>{s.name} · funnel economics</div>
          <div className="grid g3" style={{ marginBottom: 12 }}>
            {rateFields.map(([label, k, hint]) => (
              <div className="field" key={k}>
                <label>{label}</label>
                <input className="inp num" value={((s.mkt[k] || 0) * 100).toFixed(1)} onChange={(e) => updMkt(k, num(e.target.value) / 100)} />
                <span className="hint" style={{ fontSize: 10.5 }}>{hint}</span>
              </div>
            ))}
          </div>
          <div className="grid g2">
            {costFields.map(([label, k, hint]) => (
              <div className="field" key={k}>
                <label>{label}</label>
                <input className="inp num" value={s.mkt[k]} onChange={(e) => updMkt(k, num(e.target.value))} />
                <span className="hint" style={{ fontSize: 10.5 }}>{hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="divh"><h3>{s.name} · funnel {YEARS[yr]}</h3><div className="ln" /></div>
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stages.map(([label, val, clr]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="disp" style={{ width: 96, textTransform: "uppercase", fontSize: 15, fontWeight: 600, color: "var(--slate)" }}>{label}</div>
              <div style={{ flex: 1, background: "var(--navy-900)", borderRadius: 8, height: 34, overflow: "hidden" }}>
                <div style={{ width: Math.max(6, (val / maxStage) * 100) + "%", height: "100%", background: clr, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 12, transition: ".3s" }}>
                  <span className="mono" style={{ color: "var(--navy-900)", fontWeight: 600, fontSize: 13 }}>{Math.round(val).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Kpi label={`Spend to win ${Math.round(d.customers).toLocaleString()} customers`} val={Rk(d.total)} foot={`${s.mkt.channel} · ${s.mkt.geo}`} fill={0.7} accent="var(--brass)" />
        <Kpi label="Cost to acquire one" val={Rk(d.cpa)} foot={`Gross profit each: ${Rk(gpPerCust)}`} fill={0.5} />
        <Kpi label={pays ? "Acquisition pays off" : "Acquisition underwater"} val={pays ? "Yes" : "No"} foot={pays ? "CPA is below the margin" : "CPA exceeds the margin per sale"} fill={0.5} accent={pays ? "var(--green)" : "var(--red)"} />
      </div>

      <div className="divh"><h3>All services · {YEARS[yr]}</h3><div className="ln" /></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Service line</th><th>Channel</th><th>Customers</th><th>Leads</th><th>Reach</th>
              <th>Total spend</th><th>Cost / cust</th><th>GP / cust</th>
            </tr>
          </thead>
          <tbody>
            {fc.rows.map((r) => {
              const rd = r.fyrs[yr];
              const gpc = r.price * (1 - r.cost);
              return (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setSel(r.id)}>
                  <td className="svc">{r.name}</td>
                  <td style={{ textAlign: "left", color: "var(--slate)" }}>{r.mkt.channel}</td>
                  <td className="mono">{Math.round(rd.customers).toLocaleString()}</td>
                  <td className="mono">{Math.round(rd.leads).toLocaleString()}</td>
                  <td className="mono">{Math.round(rd.reach).toLocaleString()}</td>
                  <td className="mono">{Rk(rd.total)}</td>
                  <td className="mono" style={{ color: rd.cpa <= gpc ? "var(--green)" : "var(--red)" }}>{Rk(rd.cpa)}</td>
                  <td className="mono" style={{ color: "var(--slate)" }}>{Rk(gpc)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td></td>
              <td className="mono">{Math.round(t.customers).toLocaleString()}</td>
              <td className="mono">{Math.round(t.leads).toLocaleString()}</td>
              <td className="mono">{Math.round(t.reach).toLocaleString()}</td>
              <td className="mono">{Rk(t.total)}</td>
              <td className="mono" style={{ color: "var(--brass)" }}>{Rk(t.cpa)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div className="hint" style={{ marginTop: 10 }}>Tap any row to edit that line's funnel above. <b style={{ color: "var(--green)" }}>Green</b> cost-per-customer means acquisition sits below the margin on the sale; <b style={{ color: "var(--red)" }}>red</b> means it doesn't pay at these settings.</div>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Kpi label="Total required spend" val={Rk(t.total)} foot={`${YEARS[yr]} · all services`} fill={0.8} accent="var(--brass)" />
        <Kpi label="Budgeted activity spend" val={Rk(budgeted)} foot="Ads + other promotion" fill={0.6} accent="var(--teal)" />
        <Kpi label={gap >= 0 ? "Budget surplus" : "Budget shortfall"} val={Rk(Math.abs(gap))} foot={gap >= 0 ? "Budget covers the plan" : "Raise budget or ease targets"} fill={0.5} accent={gap >= 0 ? "var(--green)" : "var(--red)"} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- resources */
function Resources({ budget, setBudget, calc, mktCost, fc }) {
  const set = (k, v) => setBudget((b) => ({ ...b, [k]: isNaN(parseFloat(v)) ? 0 : parseFloat(v) }));
  const [cap, setCap] = useState({ hoursPerMonth: 140, touchesPerHour: 2, contentHrsMonth: 40 });
  const setC = (k, v) => setCap((c) => ({ ...c, [k]: isNaN(parseFloat(v)) ? 0 : parseFloat(v) }));
  const y1 = calc.totals[0], y3 = calc.totals[2];
  // Capacity: total sales touches the Y1 funnel demands vs hours the team has
  const touchesY1 = fc.rows.reduce((a, r) => a + r.fyrs[0].leads * (r.mkt?.touches || 0), 0);
  const reqHours = (cap.touchesPerHour ? touchesY1 / cap.touchesPerHour : 0) + cap.contentHrsMonth * 12;
  const heads = budget.salesMgr + budget.campMgr;
  const availHours = heads * cap.hoursPerMonth * 12;
  const util = availHours ? reqHours / availHours : 0;
  const cac = y1.cust ? mktCost / y1.cust : 0;
  const spendRatio = y1.turnover ? mktCost / y1.turnover : 0;

  const team = [
    ["Sales manager", "salesMgr", "salesMgrPay"],
    ["Campaign managers", "campMgr", "campMgrPay"],
  ];

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">People &amp; money</div><h2>Marketing resources &amp; budget</h2></div>
        <div className="sub">The team and spend that deliver the campaign — sized against the revenue targets so you can see if the plan pays for itself.</div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>The team &amp; the spend</div>
          {team.map(([label, k, kn]) => (
            <div className="grid g2" style={{ marginBottom: 12 }} key={k}>
              <div className="field"><label>{label} — headcount</label><input className="inp num" value={budget[k]} onChange={(e) => set(k, e.target.value)} /></div>
              <div className="field"><label>Annual pay each (R)</label><input className="inp num" value={budget[kn]} onChange={(e) => set(kn, e.target.value)} /></div>
            </div>
          ))}
          <div className="grid g2">
            <div className="field"><label>Social / paid ads budget (R/yr)</label><input className="inp num" value={budget.socialAds} onChange={(e) => set("socialAds", e.target.value)} /></div>
            <div className="field"><label>Other promotion (R/yr)</label><input className="inp num" value={budget.otherPromo} onChange={(e) => set("otherPromo", e.target.value)} /></div>
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Does it pay off?</div>
          <div className="grid g2">
            <Kpi label="Total marketing cost" val={Rk(mktCost)} foot="Salaries + budgets, per year" fill={0.6} />
            <Kpi label="Spend as % of Y1 turnover" val={pct(spendRatio)} foot="Keep an eye on this" fill={spendRatio * 4} accent={spendRatio > 0.3 ? "var(--amber)" : "var(--green)"} />
            <Kpi label="Cost to acquire a customer" val={Rk(cac)} foot="Year 1 marketing ÷ customers" fill={0.5} />
            <Kpi label="ROI by Year 3" val={(mktCost ? (y3.gp - mktCost) / mktCost : 0).toFixed(1) + "x"} foot="Gross profit vs spend" fill={0.7} accent="var(--green)" />
          </div>
        </div>
      </div>

      <div className="divh"><h3>Capacity check · can the team execute Year 1?</h3><div className="ln" /></div>
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Working assumptions</div>
          <div className="grid g3">
            <div className="field"><label>Productive hours / head / month</label><input className="inp num" value={cap.hoursPerMonth} onChange={(e) => setC("hoursPerMonth", e.target.value)} /></div>
            <div className="field"><label>Sales touches per hour</label><input className="inp num" value={cap.touchesPerHour} onChange={(e) => setC("touchesPerHour", e.target.value)} /><span className="hint" style={{ fontSize: 10.5 }}>Blend: ~7 calls or 3 emails/hr, meetings longer</span></div>
            <div className="field"><label>Content & prep hours / month</label><input className="inp num" value={cap.contentHrsMonth} onChange={(e) => setC("contentHrsMonth", e.target.value)} /><span className="hint" style={{ fontSize: 10.5 }}>Posts, SEO, ads, events prep</span></div>
          </div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>The verdict</div>
          <div className="grid g3">
            <Kpi label="Touches the funnel demands" val={Math.round(touchesY1).toLocaleString()} foot="Leads × touches per lead, Y1" fill={0.6} />
            <Kpi label="Hours required" val={Math.round(reqHours).toLocaleString()} foot={`vs ${Math.round(availHours).toLocaleString()} available (${heads} heads)`} fill={Math.min(util, 1)} />
            <Kpi label="Team utilisation" val={pct(util)} foot={util > 1 ? "Over capacity — add heads or ease targets" : util > 0.85 ? "Tight but feasible" : "Comfortable"} fill={Math.min(util, 1)} accent={util > 1 ? "var(--red)" : util > 0.85 ? "var(--amber)" : "var(--green)"} />
          </div>
        </div>
      </div>

      <div className="note" style={{ marginTop: 16 }}>
        <b>Linked to the funnel:</b> to hit Year 1 targets the funnel needs <b style={{ color: "var(--brass)" }}>{Rk(fc.totals[0].total)}</b> of activity spend; you've budgeted <b>{Rk(budget.socialAds + budget.otherPromo)}</b> in ads + other promotion. {budget.socialAds + budget.otherPromo >= fc.totals[0].total ? "The budget covers it." : "Raise the budget or ease the targets on the Funnel Plan tab."} The sales manager owns pipeline; the campaign managers own the content calendar and paid channels.
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- campaign + AI */
const PLATFORMS = ["LinkedIn", "Facebook", "Instagram", "YouTube", "X (Twitter)"];
const OBJECTIVES = ["Awareness", "Interest", "Decision", "Retention"];
const TONES = ["Authoritative", "Helpful / educational", "Bold", "Warm / relationship"];

const PROMO_METHODS = [
  ["Direct sales calls", "Sales manager works a qualified list from directories and inbound leads — phone + email to book meetings."],
  ["Email & catalogue", "Sequenced emails with service one-pagers to subscribers captured via the site pop-up."],
  ["Search (SEO + PPC)", "Google presence: organic SEO on service pages plus paid search for high-intent terms like ‘cargo loss adjuster’."],
  ["Conferences & PR", "Maritime and mining industry events, speaking slots, and press coverage to build authority."],
  ["Referrals & word of mouth", "Structured asks from delivered clients; the cheapest channel with the highest trust."],
];

function Campaign({ svcs }) {
  const [service, setService] = useState(svcs[0]?.name || "");
  const svcObj = svcs.find((x) => x.name === service) || svcs[0];
  const chanToPlatform = { LinkedIn: "LinkedIn", Meta: "Facebook", Google: "LinkedIn", Email: "LinkedIn", Referral: "LinkedIn" };
  const [platform, setPlatform] = useState(chanToPlatform[svcs[0]?.mkt?.channel] || "LinkedIn");
  const [objective, setObjective] = useState("Awareness");
  const [tone, setTone] = useState("Authoritative");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [calendar, setCalendar] = useState([]);

  const pickService = (name) => {
    setService(name);
    const o = svcs.find((x) => x.name === name);
    if (o?.mkt?.channel) setPlatform(chanToPlatform[o.mkt.channel] || "LinkedIn");
  };

  const generate = async () => {
    setLoading(true); setErr("");
    const prompt = `You are a senior B2B marketing strategist for AUK Marine & Mining, a South African maritime and mining services company (auk-maritime.com). Write ONE social media post to promote this service.

Service: ${service}
Platform: ${platform}
Funnel objective: ${objective}
Tone: ${tone}
Target audience: ${svcObj?.mkt?.audience || "maritime & mining decision-makers"}
Geography: ${svcObj?.mkt?.geo || "South Africa"}

Respond with ONLY valid JSON, no markdown, no code fences, using exactly these keys:
{"post":"the full caption/copy ready to publish","hashtags":["array","of","hashtags without the # symbol"],"bestTime":"best day + time to publish for this platform and audience","frequency":"recommended posting cadence for this objective","rationale":"1-2 sentences on why this timing and channel fit the objective"}`;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content.map((i) => (i.type === "text" ? i.text : "")).join("").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      setCalendar((c) => [{ id: Date.now(), service, platform, objective, ...parsed }, ...c]);
    } catch (e) {
      setErr("Couldn't generate this post. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const Sel = Select;

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Activation</div><h2>Campaign &amp; AI content</h2></div>
        <div className="sub">Pick a service, channel and funnel stage — Claude drafts the post, the best time to publish, and the cadence. Add the ones you like to the calendar.</div>
      </div>

      <div className="card">
        <div className="grid g4">
          <Sel label="Service" val={service} set={pickService} opts={svcs.map((s) => s.name)} />
          <Sel label="Platform" val={platform} set={setPlatform} opts={PLATFORMS} />
          <Sel label="Objective" val={objective} set={setObjective} opts={OBJECTIVES} />
          <Sel label="Tone" val={tone} set={setTone} opts={TONES} />
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={generate} disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} /> Drafting…</> : <><Sparkles size={16} /> Generate post</>}
          </button>
          <span className="hint">Targeting <b style={{ color: "var(--ink)" }}>{svcObj?.mkt?.audience}</b> · {svcObj?.mkt?.geo}</span>
          {err && <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {calendar.length > 0 && (
        <>
          <div className="divh"><h3><Calendar size={18} style={{ verticalAlign: -3 }} /> Content calendar</h3><div className="ln" /><span className="tag">{calendar.length} post{calendar.length > 1 ? "s" : ""}</span></div>
          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            {calendar.map((p) => (
              <div key={p.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="pill" style={{ background: "var(--navy-700)", color: "var(--brass)" }}>{p.platform}</span>
                    <span className="pill" style={{ background: "var(--navy-700)", color: "var(--teal)" }}>{p.objective}</span>
                    <span className="pill" style={{ background: "var(--navy-700)", color: "var(--slate)" }}>{p.service}</span>
                  </div>
                  <button className="iconbtn" onClick={() => setCalendar((c) => c.filter((x) => x.id !== p.id))}><Trash2 size={16} /></button>
                </div>
                <div className="postbox" style={{ marginTop: 12 }}>{p.post}</div>
                {p.hashtags?.length > 0 && <div className="hashes">{p.hashtags.map((h, i) => <span key={i}>#{h}</span>)}</div>}
                <div className="metarow">
                  <span className="meta"><Clock size={14} color="var(--brass)" /> Best time: <b>{p.bestTime}</b></span>
                  <span className="meta"><Repeat size={14} color="var(--brass)" /> Frequency: <b>{p.frequency}</b></span>
                </div>
                {p.rationale && <div className="hint" style={{ marginTop: 10 }}>{p.rationale}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="divh"><h3>Other promotion methods</h3><div className="ln" /></div>
      <div className="grid g2">
        {PROMO_METHODS.map(([t, d], i) => (
          <div className="card" key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Megaphone size={16} color="var(--brass)" />
              <div className="disp" style={{ fontSize: 18, fontWeight: 600 }}>{t}</div>
            </div>
            <div className="sub" style={{ fontSize: 13.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </>
  );
}



/* ---------------------------------------------------------------- business plan & strategy */
const RM_STATUS = ["Pending", "In progress", "Done"];
const RM_CLR = { "Pending": "var(--slate)", "In progress": "var(--amber)", "Done": "var(--green)" };

function BizPlan({ svcs, goals5, setGoals5, roadmap, setRoadmap }) {
  const [view, setView] = useState("goals");
  const setG = (id, k, v) => setGoals5((prev) => ({ ...prev, [id]: { ...prev[id], [k]: parseFloat(v) || 0 } }));
  const setRm = (id, status) => setRoadmap((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const totT = svcs.reduce((a, s) => a + (goals5[s.id]?.turnover || 0), 0);
  const totP = svcs.reduce((a, s) => a + (goals5[s.id]?.profit || 0), 0);
  const totC = svcs.reduce((a, s) => a + (goals5[s.id]?.clients || 0), 0);
  const done = roadmap.filter((r) => r.status === "Done").length;

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Strategy blueprint 2025–2035</div><h2>Business plan</h2></div>
        <div className="sub">Where AUK stands, where it's going, and how it gets there — excluding the marketing engine, which lives in the rest of this app.</div>
      </div>

      <div className="card" style={{ marginBottom: 16, borderColor: "var(--brass)", background: "linear-gradient(135deg, var(--navy-800), var(--navy-700))" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Positioning</div>
        <div className="disp" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>{VISION}</div>
        <div className="hint" style={{ marginTop: 8 }}>A roadmap for resilience, reinvention and exponential growth — low capex, high margin, digital-first.</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["goals","5-Year Goals"],["swot","Where We Stand"],["pivot","Pivot 2035"],["models","Business Models"],["comp","Competition"],["road","Roadmap"]].map(([v,l]) => (
          <button key={v} className={"navb" + (view === v ? " on" : "")} onClick={() => setView(v)} style={{ fontSize: 13, padding: "8px 12px" }}>{l}</button>
        ))}
      </div>

      {view === "goals" && (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <Kpi label="5-year turnover goal" val={Rk(totT)} foot="All six services" fill={0.8} accent="var(--brass)" />
            <Kpi label="5-year profit goal" val={Rk(totP)} foot={pct(totT ? totP / totT : 0) + " blended"} fill={0.6} accent="var(--green)" />
            <Kpi label="Client base goal" val={totC + " clients"} foot="Active client relationships" fill={0.6} accent="var(--teal)" />
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Service line</th><th>Turnover (R)</th><th>Profit (R)</th><th>Profit %</th><th>Clients</th></tr></thead>
              <tbody>
                {svcs.map((s) => {
                  const g = goals5[s.id] || { turnover: 0, profit: 0, clients: 0 };
                  return (
                    <tr key={s.id}>
                      <td className="svc">{s.name}</td>
                      <td><input className="cellinp" style={{ width: 110 }} value={g.turnover} onChange={(e) => setG(s.id, "turnover", e.target.value)} /></td>
                      <td><input className="cellinp" style={{ width: 100 }} value={g.profit} onChange={(e) => setG(s.id, "profit", e.target.value)} /></td>
                      <td className="mono" style={{ color: "var(--teal)" }}>{g.turnover ? ((g.profit / g.turnover) * 100).toFixed(0) + "%" : "—"}</td>
                      <td><input className="cellinp" style={{ width: 60 }} value={g.clients} onChange={(e) => setG(s.id, "clients", e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Total</td><td className="mono">{Rk(totT)}</td><td className="mono">{Rk(totP)}</td><td className="mono">{totT ? ((totP/totT)*100).toFixed(0) + "%" : ""}</td><td className="mono">{totC}</td></tr></tfoot>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>All targets editable — they auto-save. Year 1–3 stepping stones toward these live on the Inputs tab as order targets.</div>
          </div>
          <div className="note" style={{ marginTop: 16 }}>
            <b>Beyond the numbers, the 5-year scorecard also tracks:</b> client satisfaction (quality = 100%, delays = 0, errors = 0, pricing below comparable competitors) and 4IR readiness (value optimisation, platform presence, digital provision, technology infusion, value to society &amp; environment — each targeted at 95–100%).
          </div>
        </>
      )}

      {view === "swot" && (
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 12, color: "var(--green)" }}><Shield size={13} style={{ verticalAlign: -2 }} /> Strengths</div>
            {SWOT.strengths.map((x, i) => <div key={i} style={{ fontSize: 13.5, color: "var(--slate)", padding: "5px 0", borderBottom: i < SWOT.strengths.length - 1 ? "1px solid var(--navy-700)" : "none" }}>{x}</div>)}
          </div>
          <div className="grid g2">
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12, color: "var(--red)" }}>Current constraints</div>
              {SWOT.constraints.map((x, i) => <div key={i} style={{ fontSize: 13.5, color: "var(--slate)", padding: "5px 0" }}>{x}</div>)}
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12, color: "var(--brass)" }}>Opportunity landscape</div>
              {SWOT.opportunities.map((x, i) => <div key={i} style={{ fontSize: 13.5, color: "var(--slate)", padding: "5px 0" }}>{x}</div>)}
            </div>
          </div>
        </div>
      )}

      {view === "pivot" && (
        <>
          <div className="grid g2">
            {PILLARS.map((pl, i) => (
              <div className="card" key={i} style={{ borderTop: `3px solid ${pl.clr}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div className="disp mono" style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${pl.clr}`, color: pl.clr, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{i + 1}</div>
                  <div>
                    <div className="disp" style={{ fontSize: 18, fontWeight: 700 }}>{pl.title}</div>
                    <span className="tag" style={{ color: pl.clr, borderColor: pl.clr }}>{pl.tag}</span>
                  </div>
                </div>
                {pl.items.map((x, j) => <div key={j} style={{ fontSize: 13, color: "var(--slate)", padding: "5px 0" }}>{x}</div>)}
              </div>
            ))}
          </div>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 10, color: "var(--green)" }}>Focus · low capex, high margin</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {FOCUS_AVOID.focus.map((f) => <span key={f} className="pill" style={{ background: "rgba(70,185,138,.12)", color: "var(--green)" }}>{f}</span>)}
              </div>
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 10, color: "var(--red)" }}>Avoid / minimise</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {FOCUS_AVOID.avoid.map((f) => <span key={f} className="pill" style={{ background: "rgba(217,123,123,.12)", color: "var(--red)" }}>{f}</span>)}
              </div>
            </div>
          </div>
        </>
      )}

      {view === "models" && (
        <>
          <div className="card" style={{ overflowX: "auto", marginBottom: 16 }}>
            <table className="tbl">
              <thead><tr><th>Service line</th><th style={{ textAlign: "left" }}>Delivery model</th><th style={{ textAlign: "left" }}>Critical success factors</th><th>Prospects</th><th style={{ textAlign: "left", minWidth: 260 }}>Action plan</th></tr></thead>
              <tbody>
                {svcs.map((s) => {
                  const m = BIZ_MODELS[s.id] || {};
                  return (
                    <tr key={s.id}>
                      <td className="svc" style={{ whiteSpace: "normal" }}>{s.name}</td>
                      <td style={{ textAlign: "left" }}><span className="tag">{m.model}</span></td>
                      <td style={{ textAlign: "left", color: "var(--slate)", whiteSpace: "normal", fontSize: 13 }}>{m.csf}</td>
                      <td><span className="pill" style={{ background: "rgba(70,185,138,.12)", color: "var(--green)" }}>{m.prospects}</span></td>
                      <td style={{ textAlign: "left", color: "var(--slate)", whiteSpace: "normal", fontSize: 13 }}>{m.action}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divh"><h3>Growth strategy grid (Ansoff)</h3><div className="ln" /></div>
          <div className="grid g2">
            {ANSOFF.map((a) => (
              <div className="card" key={a.code}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span className="pill" style={{ background: "var(--navy-700)", color: "var(--brass)" }}>{a.code}</span>
                  <div className="disp" style={{ fontSize: 16, fontWeight: 600 }}>{a.cell}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--slate)" }}>{a.steps}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "comp" && (
        <>
          <div className="note" style={{ marginBottom: 16 }}>
            <b>AUK's competitive edge:</b> chartered ship-broker networks and vessel-owner access; own LCL/FF business contacts across India–Africa; cargo-owner networks; BEE Level 4 local advantage; mine ownership and own cargo support; 35 years across port, shipping and logistics; agreements with other service providers; own research and consulting divisions.
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Major competitor (logistics/FF)</th><th style={{ textAlign: "left" }}>Their advantage</th></tr></thead>
              <tbody>
                {COMPETITORS.map(([n, a]) => (
                  <tr key={n}><td className="svc">{n}</td><td style={{ textAlign: "left", color: "var(--slate)" }}>{a}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>AUK does not out-scale these players — it out-specialises them: niche maritime expertise, local accreditation, agility and relationships they cannot replicate at their size.</div>
          </div>
        </>
      )}

      {view === "road" && (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <Kpi label="Actions complete" val={`${done} / ${roadmap.length}`} foot="Across 90-day plan + 3 phases" fill={roadmap.length ? done / roadmap.length : 0} accent="var(--green)" />
            <Kpi label="In progress" val={roadmap.filter((r) => r.status === "In progress").length} foot="Active right now" fill={0.4} accent="var(--amber)" />
            <Kpi label="Pending" val={roadmap.filter((r) => r.status === "Pending").length} foot="Not yet started" fill={0.4} />
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Phase</th><th style={{ textAlign: "left", minWidth: 320 }}>Action</th><th>Status</th></tr></thead>
              <tbody>
                {roadmap.map((r) => (
                  <tr key={r.id}>
                    <td className="svc" style={{ whiteSpace: "nowrap" }}>{r.phase}</td>
                    <td style={{ textAlign: "left", color: "var(--slate)", whiteSpace: "normal", fontSize: 13 }}>{r.item}</td>
                    <td style={{ textAlign: "left" }}>
                      <select className="sel" style={{ padding: "5px 8px", fontSize: 12.5, color: RM_CLR[r.status], fontWeight: 600 }} value={r.status} onChange={(e) => setRm(r.id, e.target.value)}>
                        {RM_STATUS.map((st) => <option key={st} value={st} style={{ color: "var(--ink)" }}>{st}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 10 }}>Update statuses as work completes — they save automatically.</div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- playbook */
const PLAYBOOK = [
  { step: 0, what: "Transaction-ready website", media: "Website is the landing point for every campaign", prospect: "Finds a credible home for the brand", sales: "Foundation — everything below points here" },
  { step: 1, what: "Choose social media channels", media: "Match channel to audience (LinkedIn = professionals, Meta = consumers/SMMEs)", prospect: "—", sales: "Compile a target list from directories" },
  { step: 2, what: "SEO + link website to analytics", media: "Optimise pages + regular blog and posts with content", prospect: "Prospective client discovers the brand", sales: "Keep building the directory list" },
  { step: 3, what: "Register Google Ads (Search / Display)", media: "Google serves the ad to prospects searching, on a PPC basis", prospect: "Person searches for the need and sees the ad", sales: "Send emails with catalogues" },
  { step: 4, what: "Pop-up subscription form / free trial / web conference invite", media: "Ad shown — person may engage and reach the website in seconds", prospect: "Sees ad, may sign up on the pop-up form", sales: "Ask for a meeting on the web first" },
  { step: 5, what: "Daily presence on Facebook + LinkedIn", media: "Content stays available for reading + download; host an online conference and invite them", prospect: "Sees the content again + registers", sales: "Persuasive communication — master the message" },
  { step: 6, what: "Campaign 2: sales call — phone + email to subscribers + directory list", media: "A prepared call + email directs them to a meeting", prospect: "Asked for a meeting on the web first", sales: "Negotiation" },
  { step: 7, what: "Search + connect on LinkedIn", media: "Send a connection request", prospect: "Accepts — asked for a meeting", sales: "Sale" },
  { step: 8, what: "CRM with established clients", media: "CRM strategy runs", prospect: "Stays engaged, gives feedback", sales: "CRM & feedback — repeat business + referrals" },
];
const AIDA_OF_STEP = ["Foundation", "Awareness", "Awareness", "Awareness", "Interest", "Interest", "Decision", "Decision", "Retention"];
const STAGE_CLR = { Foundation: "var(--slate)", Awareness: "var(--slate)", Interest: "var(--teal)", Decision: "var(--brass)", Retention: "var(--green)" };

function Playbook() {
  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Use all touchpoints</div><h2>Campaign playbook</h2></div>
        <div className="sub">The step-by-step journey a prospect travels — what you do, what the channel does, what the prospect does, and the sales move at each step.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PLAYBOOK.map((s, i) => (
          <div className="card" key={s.step} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div className="disp mono" style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid var(--brass)", color: "var(--brass)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{s.step}</div>
              {i < PLAYBOOK.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--line)" }} />}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div className="disp" style={{ fontSize: 18, fontWeight: 600 }}>{s.what}</div>
                <span className="pill" style={{ background: "var(--navy-700)", color: STAGE_CLR[AIDA_OF_STEP[i]] }}>{AIDA_OF_STEP[i]}</span>
              </div>
              <div className="grid g3">
                <div><div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 4 }}>Action by the channel</div><div style={{ fontSize: 13, color: "var(--slate)" }}>{s.media}</div></div>
                <div><div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 4, color: "var(--teal)" }}>Action of the prospect</div><div style={{ fontSize: 13, color: "var(--slate)" }}>{s.prospect}</div></div>
                <div><div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 4, color: "var(--green)" }}>Sales strategy</div><div style={{ fontSize: 13, color: "var(--slate)" }}>{s.sales}</div></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="note" style={{ marginTop: 16 }}>
        <b>Message framework:</b> decide <i>what to say</i> (rational · emotional · moral), <i>how to say it</i> (a clear argument for why they must choose you, attention-catching words and graphics), and carry it through personal and non-personal channels alike — sales conversations, word of mouth and collected opinions included.
      </div>
    </>
  );
}


/* ---------------------------------------------------------------- MIS · Activity tracker */
function MIS({ svcs, actuals, setActuals, misIndirect, setMisIndirect }) {
  const [selSvc, setSelSvc] = useState(svcs[0]?.id);
  const [view, setView] = useState("service"); // "service" | "pl" | "pipeline"
  const s = svcs.find((x) => x.id === selSvc) || svcs[0];

  const setAct = (svcId, mi, val) =>
    setActuals((prev) => ({
      ...prev,
      [svcId]: prev[svcId].map((v, i) => (i === mi ? (parseFloat(val) || 0) : v)),
    }));

  const projPerMonth = (svc) => (svc.orders[0] || 0) / 12;
  const gpu = (svcId) => GP_PER_UNIT[svcId] || 0;
  const indirect = misIndirect.hr + misIndirect.other;

  // Per-month aggregate data (all services)
  const monthlyAgg = MIS_MONTHS.map((m, mi) => {
    let projGP = 0, actGP = 0;
    svcs.forEach((sv) => {
      projGP += projPerMonth(sv) * gpu(sv.id);
      actGP += (actuals[sv.id][mi] || 0) * gpu(sv.id);
    });
    return { month: m, projGP, actGP, projProfit: projGP - indirect, actProfit: actGP - indirect };
  });

  // YTD (months where actuals were entered)
  const activeMonths = MIS_MONTHS.filter((_, mi) => svcs.some((sv) => (actuals[sv.id][mi] || 0) > 0)).length;
  const ytdProjGP = monthlyAgg.slice(0, Math.max(activeMonths, 1)).reduce((a, m) => a + m.projGP, 0);
  const ytdActGP  = monthlyAgg.slice(0, Math.max(activeMonths, 1)).reduce((a, m) => a + m.actGP, 0);
  const ytdVar    = ytdActGP - ytdProjGP;

  // Per-service for selected line
  const svcRows = MIS_MONTHS.map((m, mi) => {
    const proj = projPerMonth(s);
    const act  = actuals[s.id][mi] || 0;
    return { month: m, proj, act, projGP: proj * gpu(s.id), actGP: act * gpu(s.id), var: act - proj };
  });

  // CRM prospects
  const [prospects, setProspects] = useState(() =>
    PROSPECTS.map((p, i) => ({ ...p, id: i + 1, name: "" }))
  );
  const updP = (id, k, v) => setProspects((prev) => prev.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const openVal = prospects.filter((p) => p.stage !== "Won").reduce((a, p) => a + (+p.val || 0), 0);
  const wonVal  = prospects.filter((p) => p.stage === "Won").reduce((a, p) => a + (+p.val || 0), 0);

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Operations · 2026</div><h2>MIS · Activity tracker</h2></div>
        <div className="sub">Projected units from the marketing model vs actuals you enter each month. The gap is what more marketing must close.</div>
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <b>How the link works:</b> the <b style={{ color: "var(--brass)" }}>Projected</b> column for each service = Year 1 order target from the marketing model ÷ 12. Enter actual units delivered each month. The model calculates GP (using AUK's own average GP per unit from the MIS), deducts indirect expenses, and shows operating profit projected vs actual — month by month and YTD.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["service","By service"],["pl","P&L summary"],["pipeline","Prospect pipeline"]].map(([v,l]) => (
          <button key={v} className={"navb" + (view === v ? " on" : "")} onClick={() => setView(v)} style={{ fontSize: 13, padding: "8px 12px" }}>{l}</button>
        ))}
      </div>

      {/* ---- SERVICE VIEW ---- */}
      {view === "service" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {svcs.map((x) => (
              <button key={x.id} className={"navb" + (selSvc === x.id ? " on" : "")} onClick={() => setSelSvc(x.id)} style={{ fontSize: 12.5, padding: "7px 11px" }}>{x.name}</button>
            ))}
          </div>

          <div className="grid g4" style={{ marginBottom: 16 }}>
            <Kpi label="Monthly target" val={Math.round(projPerMonth(s)).toLocaleString() + " units"} foot={`${Rk(projPerMonth(s) * gpu(s.id))} GP / month`} fill={0.6} accent="var(--brass)" />
            <Kpi label="Avg GP per unit" val={Rk(gpu(s.id))} foot="From AUK MIS data" fill={0.5} />
            <Kpi label="YTD actual units" val={svcs.find(x=>x.id===selSvc) ? MIS_MONTHS.reduce((a,_,mi)=>a+(actuals[selSvc][mi]||0),0).toFixed(1) : "0"} foot="Enter actuals below" fill={0.6} accent="var(--teal)" />
            <Kpi label="YTD actual GP" val={Rk(MIS_MONTHS.reduce((a,_,mi)=>a+(actuals[selSvc][mi]||0)*gpu(selSvc),0))} foot="vs target" fill={0.5} accent="var(--green)" />
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Projected units</th>
                  <th>Actual units</th>
                  <th>Variance</th>
                  <th>Proj GP</th>
                  <th>Actual GP</th>
                  <th>GP variance</th>
                </tr>
              </thead>
              <tbody>
                {svcRows.map((r, mi) => {
                  const vPct = r.proj ? (r.var / r.proj) * 100 : 0;
                  const clr = r.var >= 0 ? "var(--green)" : r.var > -r.proj * 0.3 ? "var(--amber)" : "var(--red)";
                  return (
                    <tr key={r.month}>
                      <td className="svc">{r.month}</td>
                      <td className="mono">{r.proj.toFixed(1)}</td>
                      <td>
                        <input className="cellinp" style={{ width: 70 }}
                          value={actuals[s.id][mi] || ""}
                          placeholder="0"
                          onChange={(e) => setAct(s.id, mi, e.target.value)} />
                      </td>
                      <td className="mono" style={{ color: clr }}>{r.var > 0 ? "+" : ""}{r.var.toFixed(1)} ({vPct > 0 ? "+" : ""}{vPct.toFixed(0)}%)</td>
                      <td className="mono" style={{ color: "var(--slate)" }}>{Rk(r.projGP)}</td>
                      <td className="mono">{Rk(r.actGP)}</td>
                      <td className="mono" style={{ color: clr }}>{r.actGP >= r.projGP ? "+" : ""}{Rk(r.actGP - r.projGP)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Annual</td>
                  <td className="mono">{(s.orders[0] || 0).toFixed(0)}</td>
                  <td className="mono">{MIS_MONTHS.reduce((a,_,mi)=>a+(actuals[s.id][mi]||0),0).toFixed(1)}</td>
                  <td></td>
                  <td className="mono">{Rk((s.orders[0]||0) * gpu(s.id))}</td>
                  <td className="mono">{Rk(MIS_MONTHS.reduce((a,_,mi)=>a+(actuals[s.id][mi]||0)*gpu(s.id),0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* ---- P&L VIEW ---- */}
      {view === "pl" && (
        <>
          <div className="grid g2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12 }}>Indirect expenses (from AUK MIS)</div>
              <div className="grid g2">
                <div className="field"><label>HR / salaries (R/month)</label>
                  <input className="inp num" value={misIndirect.hr} onChange={(e) => setMisIndirect((m) => ({ ...m, hr: parseFloat(e.target.value)||0 }))} />
                  <span className="hint" style={{ fontSize: 10.5 }}>CEO + admin + AI + accounts</span>
                </div>
                <div className="field"><label>Other (R/month)</label>
                  <input className="inp num" value={misIndirect.other} onChange={(e) => setMisIndirect((m) => ({ ...m, other: parseFloat(e.target.value)||0 }))} />
                  <span className="hint" style={{ fontSize: 10.5 }}>Rent, fuel, car, comms, levies…</span>
                </div>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>Total: <b style={{ color: "var(--ink)" }}>{Rk(indirect)}/month</b> = <b>{Rk(indirect * 12)}/year</b></div>
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 12 }}>YTD summary ({activeMonths || 1} month{activeMonths !== 1 ? "s" : ""})</div>
              <div className="grid g2">
                <Kpi label="Projected GP" val={Rk(ytdProjGP)} foot="From marketing model" fill={0.7} accent="var(--brass)" />
                <Kpi label="Actual GP" val={Rk(ytdActGP)} foot="Based on actuals entered" fill={0.6} accent="var(--teal)" />
                <Kpi label={ytdVar >= 0 ? "GP surplus" : "GP shortfall"} val={Rk(Math.abs(ytdVar))} foot={ytdVar >= 0 ? "Ahead of plan" : "Behind plan"} fill={0.5} accent={ytdVar >= 0 ? "var(--green)" : "var(--red)"} />
                <Kpi label="Operating profit (actual)" val={Rk(ytdActGP - indirect * Math.max(activeMonths,1))} foot="After indirect expenses" fill={0.5} accent={ytdActGP - indirect * Math.max(activeMonths,1) >= 0 ? "var(--green)" : "var(--red)"} />
              </div>
            </div>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>Month</th><th>Proj GP</th><th>Actual GP</th><th>GP Variance</th><th>Indirect</th><th>Proj Op Profit</th><th>Actual Op Profit</th></tr>
              </thead>
              <tbody>
                {monthlyAgg.map((m) => {
                  const gpV = m.actGP - m.projGP;
                  const opV = m.actProfit - m.projProfit;
                  const clr = gpV >= 0 ? "var(--green)" : "var(--red)";
                  return (
                    <tr key={m.month}>
                      <td className="svc">{m.month}</td>
                      <td className="mono" style={{ color: "var(--slate)" }}>{Rk(m.projGP)}</td>
                      <td className="mono">{Rk(m.actGP)}</td>
                      <td className="mono" style={{ color: clr }}>{gpV >= 0 ? "+" : ""}{Rk(gpV)}</td>
                      <td className="mono" style={{ color: "var(--slate)" }}>{Rk(indirect)}</td>
                      <td className="mono" style={{ color: m.projProfit >= 0 ? "var(--teal)" : "var(--red)" }}>{Rk(m.projProfit)}</td>
                      <td className="mono" style={{ color: m.actProfit >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{Rk(m.actProfit)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Annual</td>
                  <td className="mono">{Rk(monthlyAgg.reduce((a,m)=>a+m.projGP,0))}</td>
                  <td className="mono">{Rk(monthlyAgg.reduce((a,m)=>a+m.actGP,0))}</td>
                  <td></td>
                  <td className="mono">{Rk(indirect*12)}</td>
                  <td className="mono">{Rk(monthlyAgg.reduce((a,m)=>a+m.projProfit,0))}</td>
                  <td className="mono">{Rk(monthlyAgg.reduce((a,m)=>a+m.actProfit,0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="divh"><h3>Projected vs actual GP · all 12 months</h3><div className="ln" /></div>
          <div className="card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyAgg} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f4867" vertical={false} />
                <XAxis dataKey="month" stroke="#8ba3bd" fontSize={12} />
                <YAxis stroke="#8ba3bd" fontSize={11} tickFormatter={(v) => "R" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip contentStyle={ttStyle} formatter={(v) => R(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="projGP" name="Projected GP" fill="var(--brass)" opacity={0.7} radius={[3,3,0,0]} />
                <Bar dataKey="actGP" name="Actual GP" fill="var(--teal)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ---- PIPELINE VIEW ---- */}
      {view === "pipeline" && (
        <>
          <div className="note" style={{ marginBottom: 14 }}>
            These are AUK's real prospective customers from the MIS. Add contact names, update stages as deals move, and track deal values. This feeds the marketing effort — when a prospect converts, enter their actuals on the service tracker.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <Kpi label="Open pipeline" val={Rk(openVal)} foot={`${prospects.filter(p=>p.stage!=="Won").length} prospects`} fill={0.7} accent="var(--brass)" />
            <Kpi label="Won" val={Rk(wonVal)} foot={`${prospects.filter(p=>p.stage==="Won").length} deals closed`} fill={0.5} accent="var(--green)" />
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>Company</th><th>Contact name</th><th>Service</th><th>Stage</th><th>Deal value (R)</th></tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id}>
                    <td className="svc">{p.co}</td>
                    <td><input className="cellinp" style={{ width: 150, textAlign: "left" }} placeholder="Contact name" value={p.name} onChange={(e) => updP(p.id, "name", e.target.value)} /></td>
                    <td style={{ textAlign: "left" }}>
                      <select className="sel" style={{ padding: "5px 8px", fontSize: 12 }} value={p.svc} onChange={(e) => updP(p.id, "svc", e.target.value)}>
                        {SEED.map((sv) => <option key={sv.id} value={sv.name}>{sv.name}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: "left" }}>
                      <select className="sel" style={{ padding: "5px 8px", fontSize: 12, color: STAGECLR[p.stage], fontWeight: 600 }} value={p.stage} onChange={(e) => updP(p.id, "stage", e.target.value)}>
                        {STAGES.map((st) => <option key={st} value={st} style={{ color: "var(--ink)" }}>{st}</option>)}
                      </select>
                    </td>
                    <td><input className="cellinp" value={p.val} onChange={(e) => updP(p.id, "val", parseFloat(e.target.value)||0)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- CRM + feedback */
const STAGES = ["Lead", "Contacted", "Meeting", "Proposal", "Won"];
const STAGECLR = { Lead: "var(--slate)", Contacted: "var(--teal)", Meeting: "var(--brass)", Proposal: "var(--amber)", Won: "var(--green)" };

function CRM() {
  const [fb, setFb] = useState({ views: 42000, likes: 1850, clicks: 640, leads: 95 });
  // 5 blank contact slots per service — fill with your real pipeline
  const [rows, setRows] = useState(() =>
    SEED.flatMap((s, si) =>
      Array.from({ length: 5 }, (_, i) => ({
        id: si * 10 + i + 1, name: "", co: "", svc: s.name, stage: "Lead", val: 0,
      }))
    )
  );
  const [svcFilter, setSvcFilter] = useState("All services");
  const setF = (k, v) => setFb((f) => ({ ...f, [k]: isNaN(parseFloat(v)) ? 0 : parseFloat(v) }));
  const engage = fb.views ? fb.likes / fb.views : 0;
  const ctr = fb.views ? fb.clicks / fb.views : 0;
  const conv = fb.clicks ? fb.leads / fb.clicks : 0;

  const addRow = () => setRows((r) => [...r, { id: Date.now(), name: "", co: "", svc: "Logistics", stage: "Lead", val: 0 }]);
  const upd = (id, k, v) => setRows((r) => r.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const del = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const openPipe = rows.filter((r) => r.stage !== "Won").reduce((a, r) => a + (+r.val || 0), 0);
  const won = rows.filter((r) => r.stage === "Won").reduce((a, r) => a + (+r.val || 0), 0);

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">Listen &amp; convert</div><h2>Feedback &amp; CRM</h2></div>
        <div className="sub">Engagement from the channels, plus a light pipeline to track leads through to won work.</div>
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        In this prototype you enter the channel numbers by hand. In the deployed version these fill <b>automatically</b> from the platform APIs (likes, views, clicks) — that's the “automatic feedback” piece, and it needs the serverless backend on Vercel.
      </div>

      <div className="divh"><h3>Channel feedback</h3><div className="ln" /></div>
      <div className="grid g4">
        <div className="field"><label>Views / impressions</label><input className="inp num" value={fb.views} onChange={(e) => setF("views", e.target.value)} /></div>
        <div className="field"><label>Likes / reactions</label><input className="inp num" value={fb.likes} onChange={(e) => setF("likes", e.target.value)} /></div>
        <div className="field"><label>Clicks</label><input className="inp num" value={fb.clicks} onChange={(e) => setF("clicks", e.target.value)} /></div>
        <div className="field"><label>Leads captured</label><input className="inp num" value={fb.leads} onChange={(e) => setF("leads", e.target.value)} /></div>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Kpi label="Engagement rate" val={pct(engage)} foot="Likes ÷ views" fill={engage * 20} accent="var(--teal)" />
        <Kpi label="Click-through rate" val={pct(ctr)} foot="Clicks ÷ views" fill={ctr * 30} accent="var(--brass)" />
        <Kpi label="Lead conversion" val={pct(conv)} foot="Leads ÷ clicks" fill={conv * 4} accent="var(--green)" />
      </div>

<div className="divh"><h3>Pipeline</h3><div className="ln" /><span className="tag">Open {Rk(openPipe)} · Won {Rk(won)}</span></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {["All services", ...SEED.map((s) => s.name)].map((n) => (
          <button key={n} className={"navb" + (svcFilter === n ? " on" : "")} onClick={() => setSvcFilter(n)} style={{ fontSize: 12.5, padding: "7px 11px" }}>{n}</button>
        ))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr><th>Contact</th><th>Company</th><th>Service interest</th><th>Stage</th><th>Deal value (R)</th><th></th></tr>
          </thead>
          <tbody>
            {rows.filter((r) => svcFilter === "All services" || r.svc === svcFilter).map((r) => (
              <tr key={r.id}>
                <td><input className="cellinp" style={{ width: 150, textAlign: "left" }} placeholder="Contact name" value={r.name} onChange={(e) => upd(r.id, "name", e.target.value)} /></td>
                <td><input className="cellinp" style={{ width: 170, textAlign: "left" }} placeholder="Company" value={r.co} onChange={(e) => upd(r.id, "co", e.target.value)} /></td>
                <td style={{ textAlign: "left" }}>
                  <select className="sel" style={{ padding: "5px 8px", fontSize: 13 }} value={r.svc} onChange={(e) => upd(r.id, "svc", e.target.value)}>
                    {SEED.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "left" }}>
                  <select className="sel" style={{ padding: "5px 8px", fontSize: 13, color: STAGECLR[r.stage], fontWeight: 600 }} value={r.stage} onChange={(e) => upd(r.id, "stage", e.target.value)}>
                    {STAGES.map((s) => <option key={s} value={s} style={{ color: "var(--ink)" }}>{s}</option>)}
                  </select>
                </td>
                <td><input className="cellinp" value={r.val} onChange={(e) => upd(r.id, "val", parseFloat(e.target.value) || 0)} /></td>
                <td><button className="iconbtn" onClick={() => del(r.id)}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={addRow}><Plus size={15} /> Add contact</button>
      </div>
    </>
  );
}
