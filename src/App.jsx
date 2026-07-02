import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  Anchor, Compass, LayoutDashboard, SlidersHorizontal, TrendingUp,
  Users, Megaphone, Radar, Sparkles, Plus, Trash2, Calendar, Clock,
  Repeat, Hash, Loader2, ChevronRight, Filter, Package, Map, Gauge,
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

const CLIENT_EXPECT = "What clients expect: expert, tailored advice & strategy; quality delivered on time, on budget and to scope; clear communication on progress; problems solved as they arise; immersive AI/ML-enabled experiences; personalisation; and strong data protection & ethics.";

/* Product/service portfolio — from AUK's course catalogue and consulting service map */
const PORTFOLIO = {
  "Training & skills development": {
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
  "Maritime consulting services": {
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
  "Business consulting (SA)": {
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
  "Ship inspection services": {
    note: "Sold to ship managers & technical superintendents worldwide, primarily via LinkedIn.",
    groups: [ { title: "Survey types", items: [
      { name: "Condition & pre-purchase surveys", seg: "Ship managers" },
      { name: "Bunker & draft surveys", seg: "Owners & charterers" },
      { name: "Class / flag-related inspections", seg: "Owners" },
      { name: "P&I condition surveys", seg: "P&I clubs" },
      { name: "PSC / RightShip readiness", seg: "Managers" },
    ] } ],
  },
  "Cargo inspection & loss adjusting": {
    note: "Sold to insurers, cargo owners, traders and P&I clubs.",
    groups: [ { title: "Services", items: [
      { name: "Draft & quantity surveys", seg: "Traders & owners" },
      { name: "Sampling & quality inspection", seg: "Cargo owners" },
      { name: "Loss & claims adjustment", seg: "Insurers · P&I" },
      { name: "Marine casualty & damage survey", seg: "Insurers" },
    ] } ],
  },
  "Logistics": {
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

/* ---------------------------------------------------------------- app */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [svcs, setSvcs] = useState(SEED);
  const [budget, setBudget] = useState({
    salesMgr: 1, salesMgrPay: 780000,
    campMgr: 2, campMgrPay: 540000,
    socialAds: 1300000, otherPromo: 900000,
  });

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
  ];

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
        {tab === "portfolio" && <Portfolio svcs={svcs} setSvcs={setSvcs} />}
        {tab === "rev" && <Revenue calc={calc} />}
        {tab === "funnel" && <Funnel svcs={svcs} setSvcs={setSvcs} fc={funnelCalc} budget={budget} />}
        {tab === "res" && <Resources budget={budget} setBudget={setBudget} calc={calc} mktCost={mktCost} fc={funnelCalc} />}
        {tab === "camp" && <Campaign svcs={svcs} />}
        {tab === "play" && <Playbook />}
        {tab === "crm" && <CRM />}
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
function Portfolio({ svcs, setSvcs }) {
  const [sel, setSel] = useState(svcs[0]?.name || "");
  const s = svcs.find((x) => x.name === sel) || svcs[0];
  const p = PORTFOLIO[s?.name];
  const isConsult = p?.note === CLIENT_EXPECT;
  const setOrder = (idx, val) => {
    const n = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
    setSvcs((prev) => prev.map((x) => {
      if (x.id !== s.id) return x;
      const o = [...x.orders]; o[idx] = n; return { ...x, orders: o };
    }));
  };
  const [lp, setLp] = useState({ invoice: 612066, duties: 0, freight: 29000, markup: 15 });
  const setL = (k, v) => setLp((o) => ({ ...o, [k]: isNaN(parseFloat(v)) ? 0 : parseFloat(v) }));
  const landing = (lp.invoice + lp.duties + lp.freight) * (1 + lp.markup / 100);

  return (
    <>
      <div className="sechead">
        <div><div className="eyebrow">What we sell &amp; to whom</div><h2>Portfolio</h2></div>
        <div className="sub">The offerings behind each revenue line, and the segments they serve.</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {svcs.map((x) => (
          <button key={x.id} className={"navb" + (sel === x.name ? " on" : "")} onClick={() => setSel(x.name)} style={{ fontSize: 13, padding: "8px 12px" }}>{x.name}</button>
        ))}
      </div>

      {p ? (
        <>
          <div className={isConsult ? "note" : "note"} style={{ marginBottom: 16 }}>
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
                <span className="hint" style={{ fontSize: 11 }}>Edit on the Inputs tab</span>
              </div>
            </div>
            <div className="hint" style={{ marginTop: 10 }}>These orders flow straight into Inputs &amp; Assumptions (share auto-computed), Revenue &amp; Margins, and the Funnel Plan — which converts them into the campaign activity and budget required.</div>
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

          {p.groups.map((g) => (
            <div key={g.title}>
              <div className="divh"><h3>{g.title}</h3><div className="ln" /></div>
              <div className="card" style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Offering</th>{g.items[0]?.code !== undefined && <th>Code</th>}
                      <th>Segment</th>{g.items[0]?.out !== undefined && <th>Outcome</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it, i) => (
                      <tr key={i}>
                        <td className="svc" style={{ whiteSpace: "normal" }}>{it.name}</td>
                        {g.items[0]?.code !== undefined && <td style={{ textAlign: "left" }}><span className="tag">{it.code || "—"}</span></td>}
                        <td style={{ textAlign: "left", color: "var(--slate)" }}>{it.seg}</td>
                        {g.items[0]?.out !== undefined && <td style={{ textAlign: "left", color: "var(--teal)" }}>{it.out}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {p.landingPrice && (
            <>
              <div className="divh"><h3>Landing-price calculator</h3><div className="ln" /></div>
              <div className="card">
                <div className="hint" style={{ marginBottom: 14 }}>Landing price = (commercial invoice + duties excl. VAT + freight &amp; transport) &times; (1 + markup). This is the "value outcome" the customer cares about.</div>
                <div className="grid g4">
                  <div className="field"><label>Commercial invoice / CFR (R)</label><input className="inp num" value={lp.invoice} onChange={(e) => setL("invoice", e.target.value)} /></div>
                  <div className="field"><label>Duties excl. VAT (R)</label><input className="inp num" value={lp.duties} onChange={(e) => setL("duties", e.target.value)} /></div>
                  <div className="field"><label>Freight & transport (R)</label><input className="inp num" value={lp.freight} onChange={(e) => setL("freight", e.target.value)} /></div>
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
