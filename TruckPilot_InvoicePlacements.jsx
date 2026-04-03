import { useState } from "react";

// ─── TruckPilot Invoice Placement Previewer ───────────────────────────────────
// Shows 5 placement options with full sample previews. Pick the one(s) you want.

const PLACEMENTS = [
  {
    id: "load_detail",
    icon: "🚛",
    title: "Option A — Load Detail Card",
    where: "On each individual load card / load detail view",
    who: "Owner only (to invoice the client per load)",
    badge: "Per Load",
    badgeColor: "#1C2B4A",
    desc: "A '📄 Invoice' button appears on every completed load. One click generates a clean invoice for that single delivery — pre-filled with the customer, route, date, and earnings. Perfect for sending to the broker/shipper right after delivery.",
    pros: ["Instant single-load invoicing", "Auto-fills all load data", "Trigger right after completing a load"],
    cons: ["Can't batch multiple loads into one invoice"],
  },
  {
    id: "paystub",
    icon: "🧾",
    title: "Option B — Pay Stub / Pay History",
    where: "In the Pay Stub History screen (drivers) or Payment History (owners)",
    who: "Drivers: proof-of-income invoice  |  Owners: subcontractor payment receipt",
    badge: "Per Period",
    badgeColor: "#7C3AED",
    desc: "Generates a formal payment statement styled like an invoice — with employer/driver details, pay period, itemized line items (Route Pay, Wait Pay), and a 'Total Earned' footer. Drivers use it for loan applications and rentals. Owners use it as a subcontractor pay record.",
    pros: ["Covers a full pay period at once", "Official proof-of-income format", "Includes YTD totals"],
    cons: ["Slightly different from a client-facing invoice"],
  },
  {
    id: "reports_tab",
    icon: "📊",
    title: "Option C — Reports Screen (Report Tab)",
    where: "In the existing Report tab, as a new section after the earnings summary",
    who: "Both drivers and owners",
    badge: "Period Invoice",
    badgeColor: "#E8962E",
    desc: "Adds an '📄 Invoice' action button inside the Reports tab, below the income summary. Generates a period invoice covering all loads in the selected range. Owners bill the client; drivers generate a self-invoice for their corporation. Uses the same date range as the rest of the report.",
    pros: ["Lives alongside existing financial data", "One-click from the existing workflow", "Consistent period selection"],
    cons: ["Report tab is already dense with info"],
  },
  {
    id: "financial_reports",
    icon: "📋",
    title: "Option D — Financial Reports Screen",
    where: "As an 8th report card inside Financial Reports",
    who: "Owner: client invoice  |  Driver: self-invoice for their corporation",
    badge: "Dedicated Card",
    badgeColor: "#059669",
    desc: "Adds an 'Invoice Generator' card (with a customer selector) to the Financial Reports download list — right below the other PDF cards. Owner picks a customer, picks a period, and generates a professional invoice for that client. Driver uses it to bill their fleet owner corporation.",
    pros: ["All PDF exports in one place", "Customer/period selector built-in", "Cleanest UX for invoicing workflow"],
    cons: ["Requires navigating to Financial Reports screen"],
  },
  {
    id: "tax_report",
    icon: "🗂",
    title: "Option E — Tax Report Screen",
    where: "In the Tax Report / CRA screen, as a 'Formal Income Statement' download",
    who: "Both drivers and owners (different content per role)",
    badge: "CRA-Ready",
    badgeColor: "#166534",
    desc: "Generates a formal 'Statement of Business Income' styled like a letterhead invoice — company name, fiscal year, revenue breakdown, deductible expenses, net income. Not a client invoice, but a CRA-compliant income summary in professional invoice format for your accountant.",
    pros: ["CRA-ready format", "Includes expense deductions", "Matches T2125 line items"],
    cons: ["Not a client-facing invoice — more of an internal document"],
  },
];

// ─── Shared invoice sample data ───────────────────────────────────────────────
const SAMPLE = {
  company: "Northstar Hauling Inc.",
  ownerName: "Mo Warsame",
  address: "123 Portage Ave, Winnipeg, MB  R3B 2E9",
  phone: "(204) 555-0182",
  email: "mo@northstarhauling.ca",
  gst: "GST# 123 456 789 RT0001",
  billTo: "Trident Logistics Ltd.",
  billToAddr: "456 Transport Way, Calgary, AB  T2E 8N4",
  invoiceNo: "INV-2026-0043",
  date: "Apr 2, 2026",
  poNo: "PO-7781",
  dueDate: "Apr 16, 2026",
  period: "Mar 1 – Mar 31, 2026",
};

// ─── Invoice preview components ────────────────────────────────────────────────
function InvoicePreview({ placementId }) {
  const style = {
    wrap: { background:"#fff", borderRadius:12, padding:"20px 22px", border:"1px solid #e5e7eb", fontSize:13, color:"#111", maxWidth:480, margin:"0 auto" },
    header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, paddingBottom:12, borderBottom:"2px solid #1C2B4A" },
    logo: { fontWeight:900, fontSize:18, color:"#1C2B4A", fontFamily:"sans-serif" },
    logoSub: { fontSize:10, color:"#6B7280", marginTop:2 },
    invoiceMeta: { textAlign:"right", fontSize:11 },
    invoiceNum: { fontWeight:900, fontSize:15, color:"#E8962E" },
    section2col: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 },
    sectionLabel: { fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 },
    sectionVal: { fontWeight:700, fontSize:12, color:"#1C2B4A", lineHeight:1.6 },
    table: { width:"100%", borderCollapse:"collapse", marginBottom:14 },
    th: { background:"#1C2B4A", color:"#fff", padding:"6px 8px", fontSize:11, fontWeight:700, textAlign:"left" },
    thR: { background:"#1C2B4A", color:"#fff", padding:"6px 8px", fontSize:11, fontWeight:700, textAlign:"right" },
    td: { padding:"6px 8px", fontSize:12, borderBottom:"1px solid #F3F4F6" },
    tdR: { padding:"6px 8px", fontSize:12, borderBottom:"1px solid #F3F4F6", textAlign:"right" },
    tdAlt: { padding:"6px 8px", fontSize:12, borderBottom:"1px solid #F3F4F6", background:"#F9FAFB" },
    tdAltR: { padding:"6px 8px", fontSize:12, borderBottom:"1px solid #F3F4F6", background:"#F9FAFB", textAlign:"right" },
    totalsRow: { display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:12 },
    totalsWrap: { borderTop:"1.5px solid #E5E7EB", paddingTop:10, marginTop:4 },
    totalFinal: { display:"flex", justifyContent:"space-between", padding:"8px 10px", background:"#1C2B4A", borderRadius:8, marginTop:6, color:"#fff", fontWeight:900, fontSize:14 },
    gstNote: { fontSize:10, color:"#6B7280", marginTop:4, textAlign:"center" },
    footer: { marginTop:14, paddingTop:10, borderTop:"1px solid #E5E7EB", fontSize:10, color:"#9CA3AF", textAlign:"center" },
    chip: (color) => ({ display:"inline-block", background:color+"18", color:color, fontWeight:700, fontSize:10, padding:"2px 8px", borderRadius:20, marginLeft:6 }),
    tag: { display:"inline-block", background:"#F0FDF4", color:"#16A34A", fontWeight:700, fontSize:10, padding:"2px 8px", borderRadius:20 },
  };

  if (placementId === "load_detail") return (
    <div style={style.wrap}>
      {/* Mini load card at top */}
      <div style={{background:"#1C2B4A",borderRadius:8,padding:"10px 14px",marginBottom:14,color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginBottom:3}}>✓ COMPLETED LOAD · TMW #43</div>
        <div style={{fontWeight:900,fontSize:16}}>Driver1 → Driver2</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:2}}>Apr 1, 2026 · $1,200.00 gross</div>
        <div style={{marginTop:8,display:"flex",gap:6}}>
          <div style={{flex:1,background:"rgba(255,255,255,0.1)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>📄 Invoice</div>
            <div style={{fontSize:11,fontWeight:800,color:"#E8962E",marginTop:1}}>Generate →</div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,0.1)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>✏️ Edit</div>
            <div style={{fontSize:11,fontWeight:800,marginTop:1}}>Load</div>
          </div>
          <div style={{flex:1,background:"rgba(255,255,255,0.1)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>💬 Notes</div>
            <div style={{fontSize:11,fontWeight:800,marginTop:1}}>2 notes</div>
          </div>
        </div>
      </div>
      {/* Invoice output */}
      <div style={{...style.header}}>
        <div><div style={style.logo}>🚛 Northstar Hauling Inc.</div><div style={style.logoSub}>123 Portage Ave, Winnipeg MB · (204) 555-0182</div><div style={style.logoSub}>GST# 123 456 789 RT0001</div></div>
        <div style={style.invoiceMeta}><div style={style.invoiceNum}>INV-2026-0043</div><div style={{fontSize:10,color:"#6B7280"}}>Date: Apr 2, 2026</div><div style={{fontSize:10,color:"#6B7280"}}>PO: PO-7781</div><div style={{fontSize:10,color:"#6B7280"}}>Due: Apr 16, 2026</div></div>
      </div>
      <div style={style.section2col}>
        <div><div style={style.sectionLabel}>Bill From</div><div style={style.sectionVal}>Mo Warsame<br/>mo@northstarhauling.ca</div></div>
        <div><div style={style.sectionLabel}>Bill To</div><div style={style.sectionVal}>Trident Logistics Ltd.<br/>456 Transport Way, Calgary AB</div></div>
      </div>
      <table style={style.table}><thead><tr><th style={style.th}>Qty</th><th style={style.th}>Description</th><th style={style.thR}>Price</th><th style={style.thR}>Amount</th></tr></thead>
        <tbody>
          <tr><td style={style.td}>1</td><td style={style.td}>Freight — Driver1 → Driver2<br/><span style={{fontSize:10,color:"#6B7280"}}>Hauling · Apr 1, 2026 · TMW #43</span></td><td style={style.tdR}>$1,200.00</td><td style={style.tdR}>$1,200.00</td></tr>
          <tr><td style={style.tdAlt}>1</td><td style={style.tdAlt}>Wait Time (2h @ $30/h)<br/><span style={{fontSize:10,color:"#6B7280"}}>Load + Offload wait</span></td><td style={style.tdAltR}>$60.00</td><td style={style.tdAltR}>$60.00</td></tr>
        </tbody>
      </table>
      <div style={style.totalsWrap}>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Subtotal</span><span>$1,260.00</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Discount</span><span>— $0.00</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>GST/HST (0% — Zero-Rated)</span><span>$0.00</span></div>
        <div style={style.totalFinal}><span>TOTAL DUE</span><span style={{color:"#E8962E"}}>$1,260.00 CAD</span></div>
      </div>
      <div style={style.gstNote}>✓ Trucking supply is zero-rated under ETA Sched. VI, Part VII. No GST collected.</div>
      <div style={style.footer}>TruckPilot · truckpilot.ca · Generated Apr 2, 2026</div>
    </div>
  );

  if (placementId === "paystub") return (
    <div style={style.wrap}>
      <div style={{background:"#7C3AED",borderRadius:8,padding:"10px 14px",marginBottom:14,color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>PAY PERIOD · Mar 1 – Mar 31, 2026</div>
        <div style={{fontWeight:900,fontSize:16,marginTop:2}}>🧾 Driver Pay Statement</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:1}}>Issued to: Alex Kowalski · 3 loads paid</div>
      </div>
      <div style={style.section2col}>
        <div><div style={style.sectionLabel}>Employer / Fleet Owner</div><div style={style.sectionVal}>Northstar Hauling Inc.<br/>Mo Warsame · GST# 123 456 789</div></div>
        <div><div style={style.sectionLabel}>Driver / Contractor</div><div style={style.sectionVal}>Alex Kowalski<br/>alex@email.com</div></div>
      </div>
      <table style={style.table}><thead><tr><th style={style.th}>Date</th><th style={style.th}>Route</th><th style={style.thR}>Route Pay</th><th style={style.thR}>Wait Pay</th></tr></thead>
        <tbody>
          <tr><td style={style.td}>Mar 5</td><td style={style.td}>Winnipeg → Regina</td><td style={style.tdR}>$500.00</td><td style={style.tdR}>$30.00</td></tr>
          <tr><td style={style.tdAlt}>Mar 12</td><td style={style.tdAlt}>Regina → Saskatoon</td><td style={style.tdAltR}>$420.00</td><td style={style.tdAltR}>$0.00</td></tr>
          <tr><td style={style.td}>Mar 19</td><td style={style.td}>Saskatoon → Calgary</td><td style={style.tdR}>$580.00</td><td style={style.tdR}>$60.00</td></tr>
        </tbody>
      </table>
      <div style={style.totalsWrap}>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Total Route Pay</span><span style={{fontWeight:700}}>$1,500.00</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Total Wait Pay</span><span style={{fontWeight:700,color:"#E8962E"}}>$90.00</span></div>
        <div style={{...style.totalsRow,color:"#6B7280",fontSize:11,marginTop:2}}><span>YTD Earned (Jan 1 – Mar 31)</span><span>$4,830.00</span></div>
        <div style={style.totalFinal}><span>TOTAL EARNED</span><span style={{color:"#A78BFA"}}>$1,590.00 CAD</span></div>
      </div>
      <div style={{marginTop:10,borderTop:"1px dashed #E5E7EB",paddingTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><div style={style.sectionLabel}>Employer Signature</div><div style={{height:28,borderBottom:"1px solid #d1d5db",marginTop:4}}></div></div>
        <div><div style={style.sectionLabel}>Date Issued</div><div style={{fontSize:12,fontWeight:700,marginTop:8}}>Apr 2, 2026</div></div>
      </div>
      <div style={style.footer}>TruckPilot · truckpilot.ca · Proof of income — keep for your records</div>
    </div>
  );

  if (placementId === "reports_tab") return (
    <div style={style.wrap}>
      {/* Existing reports section (mini) */}
      <div style={{background:"#1C2B4A",borderRadius:8,padding:"10px 14px",marginBottom:12,color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginBottom:4}}>📊 REPORTS — Mar 2026</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[["Gross","$4,200"],["Driver Pay","$1,590"],["Net","$2,610"]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center",background:"rgba(255,255,255,0.08)",borderRadius:6,padding:"6px 4px"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.5)"}}>{l}</div>
              <div style={{fontSize:13,fontWeight:900,color:"#E8962E"}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Invoice action row */}
      <div style={{border:"2px dashed #E8962E",borderRadius:10,padding:"12px 14px",marginBottom:14,background:"#FFFBF5"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#1C2B4A",marginBottom:4}}>📄 Generate Invoice for This Period</div>
        <div style={{fontSize:11,color:"#6B7280",marginBottom:8}}>Turn this report into a client-ready invoice for Mar 2026 — pre-filled with your loads and earnings.</div>
        <button style={{background:"#E8962E",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12,padding:"8px 16px",cursor:"pointer"}}>⬇️ Download Invoice PDF</button>
      </div>
      {/* Invoice output */}
      <div style={style.header}>
        <div><div style={style.logo}>🚛 Northstar Hauling Inc.</div><div style={style.logoSub}>{SAMPLE.address}</div><div style={style.logoSub}>{SAMPLE.gst}</div></div>
        <div style={style.invoiceMeta}><div style={style.invoiceNum}>{SAMPLE.invoiceNo}</div><div style={{fontSize:10,color:"#6B7280"}}>Period: {SAMPLE.period}</div></div>
      </div>
      <table style={style.table}><thead><tr><th style={style.th}>Date</th><th style={style.th}>Route</th><th style={style.thR}>Amount</th></tr></thead>
        <tbody>
          <tr><td style={style.td}>Mar 5</td><td style={style.td}>Winnipeg → Regina</td><td style={style.tdR}>$1,400.00</td></tr>
          <tr><td style={style.tdAlt}>Mar 12</td><td style={style.tdAlt}>Regina → Saskatoon</td><td style={style.tdAltR}>$1,200.00</td></tr>
          <tr><td style={style.td}>Mar 19</td><td style={style.td}>Saskatoon → Calgary</td><td style={style.tdR}>$1,600.00</td></tr>
        </tbody>
      </table>
      <div style={style.totalsWrap}>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Subtotal</span><span>$4,200.00</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>GST/HST (0% — Zero-Rated)</span><span>$0.00</span></div>
        <div style={style.totalFinal}><span>TOTAL DUE</span><span style={{color:"#E8962E"}}>$4,200.00 CAD</span></div>
      </div>
      <div style={style.footer}>TruckPilot · truckpilot.ca</div>
    </div>
  );

  if (placementId === "financial_reports") return (
    <div style={style.wrap}>
      {/* Existing report cards (mini) */}
      <div style={{marginBottom:12}}>
        {[{icon:"📊",title:"Income & Expense Statement",color:"#E8962E"},{icon:"🗂",title:"CRA T2125 Tax Report",color:"#166534"},{icon:"💵",title:"Payroll Summary",color:"#E8962E"}].map(r=>(
          <div key={r.title} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F9FAFB",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:`4px solid ${r.color}`}}>
            <span style={{fontSize:12,fontWeight:700}}>{r.icon} {r.title}</span>
            <span style={{fontSize:11,color:"#9CA3AF",background:"#E5E7EB",padding:"2px 8px",borderRadius:20}}>⬇️ PDF</span>
          </div>
        ))}
        {/* NEW invoice card */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F0FDF4",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:"4px solid #059669",border:"1.5px solid #059669"}}>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"#059669"}}>📄 Invoice Generator</div>
            <div style={{fontSize:10,color:"#6B7280",marginTop:1}}>Pick a customer + period → generate client invoice</div>
          </div>
          <span style={{fontSize:11,color:"#fff",background:"#059669",padding:"4px 10px",borderRadius:20,fontWeight:700}}>⬇️ PDF</span>
        </div>
      </div>
      {/* Invoice output */}
      <div style={style.header}>
        <div><div style={style.logo}>🚛 Northstar Hauling Inc.</div><div style={style.logoSub}>{SAMPLE.address} · {SAMPLE.gst}</div></div>
        <div style={style.invoiceMeta}><div style={style.invoiceNum}>{SAMPLE.invoiceNo}</div><div style={{fontSize:10,color:"#6B7280"}}>Date: {SAMPLE.date}</div><div style={{fontSize:10,color:"#6B7280"}}>Due: {SAMPLE.dueDate}</div></div>
      </div>
      <div style={style.section2col}>
        <div><div style={style.sectionLabel}>Bill From</div><div style={style.sectionVal}>{SAMPLE.ownerName}<br/>{SAMPLE.email}</div></div>
        <div><div style={style.sectionLabel}>Bill To</div><div style={style.sectionVal}>{SAMPLE.billTo}<br/>{SAMPLE.billToAddr}</div></div>
      </div>
      <table style={style.table}><thead><tr><th style={style.th}>Qty</th><th style={style.th}>Description</th><th style={style.thR}>Price</th><th style={style.thR}>Amount</th></tr></thead>
        <tbody>
          <tr><td style={style.td}>1</td><td style={style.td}>Freight — Winnipeg → Regina<br/><span style={{fontSize:10,color:"#6B7280"}}>Mar 5, 2026</span></td><td style={style.tdR}>$1,400.00</td><td style={style.tdR}>$1,400.00</td></tr>
          <tr><td style={style.tdAlt}>1</td><td style={style.tdAlt}>Freight — Regina → Saskatoon<br/><span style={{fontSize:10,color:"#6B7280"}}>Mar 12, 2026</span></td><td style={style.tdAltR}>$1,200.00</td><td style={style.tdAltR}>$1,200.00</td></tr>
          <tr><td style={style.td}>1</td><td style={style.td}>Freight — Saskatoon → Calgary<br/><span style={{fontSize:10,color:"#6B7280"}}>Mar 19, 2026</span></td><td style={style.tdR}>$1,600.00</td><td style={style.tdR}>$1,600.00</td></tr>
        </tbody>
      </table>
      <div style={style.totalsWrap}>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Subtotal</span><span>$4,200.00</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Discount</span><span>—</span></div>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>GST/HST (0% — Zero-Rated Trucking)</span><span>$0.00</span></div>
        <div style={style.totalFinal}><span>TOTAL DUE</span><span style={{color:"#E8962E"}}>$4,200.00 CAD</span></div>
      </div>
      <div style={style.gstNote}>✓ Zero-rated per ETA Sched. VI, Part VII — no GST collected on trucking supply.</div>
      <div style={style.footer}>TruckPilot · truckpilot.ca · {SAMPLE.invoiceNo}</div>
    </div>
  );

  // tax_report
  return (
    <div style={style.wrap}>
      <div style={{background:"#166534",borderRadius:8,padding:"10px 14px",marginBottom:14,color:"#fff"}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>TAX SCREEN — CRA T2125</div>
        <div style={{fontWeight:900,fontSize:16,marginTop:2}}>🗂 Statement of Business Income</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:1}}>Fiscal Year 2026 · GST# 123 456 789 RT0001</div>
      </div>
      <div style={style.section2col}>
        <div><div style={style.sectionLabel}>Business Name</div><div style={style.sectionVal}>Northstar Hauling Inc.<br/>Mo Warsame</div></div>
        <div><div style={style.sectionLabel}>Fiscal Period</div><div style={style.sectionVal}>Jan 1 – Dec 31, 2026<br/>T2125 — Business Income</div></div>
      </div>
      <table style={style.table}><thead><tr><th style={style.th}>Line</th><th style={style.th}>Description</th><th style={style.thR}>Amount</th></tr></thead>
        <tbody>
          <tr><td style={style.td} colSpan={3}><strong>Revenue</strong></td></tr>
          <tr><td style={style.td}>8000</td><td style={style.td}>Gross Freight Revenue</td><td style={style.tdR}>$52,800.00</td></tr>
          <tr><td style={style.tdAlt}>8299</td><td style={style.tdAlt}>Total Business Income</td><td style={style.tdAltR}><strong>$52,800.00</strong></td></tr>
          <tr><td style={style.td} colSpan={3}><strong>Expenses</strong></td></tr>
          <tr><td style={style.td}>9220</td><td style={style.td}>Fuel & Oil</td><td style={style.tdR}>($8,400.00)</td></tr>
          <tr><td style={style.tdAlt}>9281</td><td style={style.tdAlt}>Repairs & Maintenance</td><td style={style.tdAltR}>($3,200.00)</td></tr>
          <tr><td style={style.td}>9200</td><td style={style.td}>Insurance Premiums</td><td style={style.tdR}>($6,100.00)</td></tr>
          <tr><td style={style.tdAlt}>9270</td><td style={style.tdAlt}>Subcontractor (Driver Pay T4A)</td><td style={style.tdAltR}>($18,900.00)</td></tr>
        </tbody>
      </table>
      <div style={style.totalsWrap}>
        <div style={style.totalsRow}><span style={{color:"#6B7280"}}>Total Expenses</span><span style={{color:"#DC2626"}}>($36,600.00)</span></div>
        <div style={style.totalFinal}><span>NET BUSINESS INCOME</span><span style={{color:"#86EFAC"}}>$16,200.00 CAD</span></div>
      </div>
      <div style={{marginTop:10,fontSize:10,color:"#6B7280",borderTop:"1px solid #E5E7EB",paddingTop:8}}>For CRA filing only. Consult a certified accountant before submission.</div>
      <div style={style.footer}>TruckPilot · truckpilot.ca · Statement of Business Income 2026</div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function InvoicePlacements() {
  const [selected, setSelected] = useState("load_detail");
  const active = PLACEMENTS.find(p => p.id === selected);

  return (
    <div style={{minHeight:"100vh",background:"#0F172A",color:"#F1F5F9",fontFamily:"'Inter',sans-serif",padding:"24px 16px"}}>
      {/* Header */}
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:28,marginBottom:6}}>📄</div>
        <h1 style={{margin:0,fontWeight:900,fontSize:22,letterSpacing:-0.5}}>Invoice Placement Options</h1>
        <p style={{margin:"6px 0 0",fontSize:13,color:"#94A3B8"}}>
          Pick where the invoice feature should live in TruckPilot — tap each option to preview
        </p>
      </div>

      {/* Option pills */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:24}}>
        {PLACEMENTS.map(p => (
          <button key={p.id} onClick={() => setSelected(p.id)} style={{
            padding:"8px 14px", borderRadius:24, border:"none", cursor:"pointer",
            fontWeight:700, fontSize:12, transition:"all 0.15s",
            background: selected === p.id ? p.badgeColor : "rgba(255,255,255,0.07)",
            color: selected === p.id ? "#fff" : "#94A3B8",
            boxShadow: selected === p.id ? `0 0 0 3px ${p.badgeColor}44` : "none",
          }}>
            {p.icon} {p.title.split("—")[0].trim()}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:20,maxWidth:900,margin:"0 auto"}}>
        {/* Left: description */}
        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:16,padding:"20px 22px",border:`1.5px solid ${active.badgeColor}44`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <span style={{fontSize:28}}>{active.icon}</span>
            <div>
              <div style={{fontWeight:900,fontSize:17}}>{active.title}</div>
              <div style={{display:"inline-block",background:active.badgeColor+"22",color:active.badgeColor,fontWeight:700,fontSize:11,padding:"2px 10px",borderRadius:20,marginTop:4}}>{active.badge}</div>
            </div>
          </div>
          <div style={{fontSize:12,color:"#CBD5E1",marginBottom:10}}>
            <strong style={{color:"#94A3B8"}}>Where:</strong> {active.where}
          </div>
          <div style={{fontSize:12,color:"#CBD5E1",marginBottom:12}}>
            <strong style={{color:"#94A3B8"}}>Who uses it:</strong> {active.who}
          </div>
          <p style={{fontSize:13,color:"#E2E8F0",lineHeight:1.6,margin:"0 0 14px"}}>{active.desc}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{background:"rgba(34,197,94,0.07)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontWeight:800,fontSize:11,color:"#4ADE80",marginBottom:6}}>✅ PROS</div>
              {active.pros.map(p => <div key={p} style={{fontSize:12,color:"#86EFAC",marginBottom:3}}>• {p}</div>)}
            </div>
            <div style={{background:"rgba(239,68,68,0.07)",borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontWeight:800,fontSize:11,color:"#F87171",marginBottom:6}}>⚠️ CONS</div>
              {active.cons.map(c => <div key={c} style={{fontSize:12,color:"#FCA5A5",marginBottom:3}}>• {c}</div>)}
            </div>
          </div>
        </div>

        {/* Right: Invoice preview */}
        <div>
          <div style={{fontWeight:700,fontSize:12,color:"#64748B",textTransform:"uppercase",letterSpacing:1,marginBottom:10,textAlign:"center"}}>
            📋 Sample Invoice Output
          </div>
          <InvoicePreview placementId={selected} />
        </div>
      </div>

      {/* All options summary */}
      <div style={{maxWidth:900,margin:"32px auto 0",background:"rgba(255,255,255,0.03)",borderRadius:16,padding:"20px 22px"}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:14,color:"#E8962E"}}>📌 Quick Comparison — All 5 Options</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
          {PLACEMENTS.map(p => (
            <div key={p.id} onClick={() => setSelected(p.id)} style={{
              borderRadius:12,padding:"12px 14px",cursor:"pointer",
              background: selected === p.id ? `${p.badgeColor}22` : "rgba(255,255,255,0.04)",
              border:`1.5px solid ${selected === p.id ? p.badgeColor : "rgba(255,255,255,0.07)"}`,
              transition:"all 0.15s"
            }}>
              <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
              <div style={{fontWeight:800,fontSize:11,color: selected === p.id ? "#fff" : "#94A3B8"}}>{p.title.split("—")[1]?.trim() || p.title}</div>
              <div style={{display:"inline-block",background:p.badgeColor+"22",color:p.badgeColor,fontWeight:700,fontSize:9,padding:"1px 6px",borderRadius:20,marginTop:4}}>{p.badge}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:16,padding:"10px 14px",background:"rgba(232,150,46,0.08)",borderRadius:10,fontSize:12,color:"#D97706"}}>
          💡 <strong>Tip:</strong> You can combine multiple options — e.g. Option A (per-load button) + Option D (Financial Reports card) to cover both quick per-load invoicing and end-of-period billing.
        </div>
      </div>
    </div>
  );
}
