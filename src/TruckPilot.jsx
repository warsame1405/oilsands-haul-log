import { useState } from "react";


function SLTLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="44" y="10" width="28" height="44" rx="5" fill="#00E5FF" opacity="0.15" stroke="#00E5FF" strokeWidth="2"/>
      <rect x="47" y="15" width="22" height="30" rx="2.5" fill="#00BCD4"/>
      <rect x="50" y="18" width="14" height="2" rx="1" fill="#fff" opacity="0.9"/>
      <rect x="50" y="22" width="16" height="1.5" rx="1" fill="#fff" opacity="0.6"/>
      <rect x="50" y="26" width="11" height="1.5" rx="1" fill="#fff" opacity="0.5"/>
      <rect x="50" y="30" width="13" height="1.5" rx="1" fill="#fff" opacity="0.4"/>
      <circle cx="58" cy="50" r="2.5" fill="#00E5FF" opacity="0.9"/>
      <rect x="4" y="34" width="32" height="22" rx="4" fill="#FF6D00"/>
      <path d="M26 34 L36 34 L36 46 Q36 50 32 50 L26 50 Z" fill="#FFD600"/>
      <rect x="27.5" y="36.5" width="7" height="6" rx="1.5" fill="#0A1628" opacity="0.8"/>
      <circle cx="13" cy="57" r="5.5" fill="#1A237E" stroke="#FFD600" strokeWidth="2"/>
      <circle cx="13" cy="57" r="2.2" fill="#FFD600"/>
      <circle cx="29" cy="57" r="5.5" fill="#1A237E" stroke="#FFD600" strokeWidth="2"/>
      <circle cx="29" cy="57" r="2.2" fill="#FFD600"/>
      <line x1="1" y1="40" x2="9" y2="40" stroke="#FFD600" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
      <line x1="1" y1="45" x2="7" y2="45" stroke="#FF6D00" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      <line x1="1" y1="50" x2="5" y2="50" stroke="#FFD600" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <path d="M37 28 Q32 18 24 26" stroke="#00E5FF" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9" strokeDasharray="3 2"/>
      <path d="M37 33 Q28 20 20 30" stroke="#00E5FF" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" strokeDasharray="2 2"/>
      <circle cx="37" cy="28" r="2" fill="#00E5FF"/>
    </svg>
  );
}

const ORANGE = "#FF6A00";
const DARK = "#1A1A1A";

const styles = {
  app: { fontFamily: "'Barlow', sans-serif", maxWidth: 390, margin: "0 auto", position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" },
  screen: { flex: 1, overflowY: "auto", paddingBottom: 80 },
  tabBar: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: 390, display: "flex", borderTop: "1px solid", zIndex: 100, padding: "10px 8px 16px" },
};

const tabs = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "addload", label: "Add Load", icon: "➕" },
  { id: "history", label: "History", icon: "📋" },
  { id: "earnings", label: "Earnings", icon: "💰" },
  { id: "profile", label: "Profile", icon: "👤" },
];

// ─── SHARED COMPONENTS ───────────────────────────────────────────

function StatusBar({ dark }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 20px 0", fontSize: 11, fontWeight: 600, color: dark ? "#ccc" : "#333" }}>
      <span>9:41</span><span>100%</span>
    </div>
  );
}

function Header({ title, highlight, dark, right }) {
  const showLogo = title === "TRUCK" && highlight === "PILOT";
  return (
    <div style={{ padding: "14px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {showLogo && <SLTLogo size={32} />}
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: 1, color: dark ? "#fff" : DARK }}>
          {title}<span style={{ color: ORANGE }}>{highlight}</span>
        </div>
      </div>
      {right}
    </div>
  );
}

function Card({ dark, children, style = {} }) {
  return (
    <div style={{ borderRadius: 14, padding: 14, marginBottom: 10, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}`, ...style }}>
      {children}
    </div>
  );
}

function Badge({ type }) {
  const map = {
    active: { bg: ORANGE, color: "#fff", label: "Active" },
    done: { bg: "#4CAF50", color: "#fff", label: "Done" },
    cancelled: { bg: "#ef5350", color: "#fff", label: "Cancelled" },
  };
  const s = map[type] || map.active;
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color }}>{s.label}</span>;
}

function SectionTitle({ dark, children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", margin: "0 16px 8px", color: dark ? "#555" : "#aaa" }}>{children}</div>;
}

function LoadCard({ load, dark }) {
  return (
    <Card dark={dark}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fff" : DARK }}>{load.id} · {load.truck} · {load.trailer}</div>
        <Badge type={load.status} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: dark ? "#888" : "#555", marginBottom: 5 }}>
        <span>{load.from}</span><span style={{ color: ORANGE }}>→</span><span>{load.to}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[["👤", load.driver], ["⚖️", load.weight], ["📅", load.date], ["🛣️", load.miles]].map(([icon, val]) => (
          <span key={icon} style={{ fontSize: 10, color: dark ? "#666" : "#aaa" }}>{icon} <span style={{ fontWeight: 600, color: dark ? "#999" : "#555" }}>{val}</span></span>
        ))}
      </div>
    </Card>
  );
}

// ─── SAMPLE DATA ─────────────────────────────────────────────────

const sampleLoads = [
  { id: "LD-2048", truck: "TRK-441", trailer: "TRL-88", from: "Calgary", to: "Edmonton", driver: "John D.", weight: "32,000 lbs", date: "Mar 16", miles: "186 mi", status: "active", amount: 920, cargo: "general" },
  { id: "LD-2047", truck: "TRK-441", trailer: "TRL-91", from: "Red Deer", to: "Calgary", driver: "John D.", weight: "28,500 lbs", date: "Mar 14", miles: "97 mi", status: "done", amount: 740, cargo: "refrigerated" },
  { id: "LD-2046", truck: "TRK-228", trailer: "TRL-104", from: "Calgary", to: "Lethbridge", driver: "Mike R.", weight: "41,000 lbs", date: "Mar 11", miles: "130 mi", status: "done", amount: 1100, cargo: "oversized" },
  { id: "LD-2045", truck: "TRK-315", trailer: "TRL-77", from: "Edmonton", to: "Grande Prairie", driver: "Sara T.", weight: "19,200 lbs", date: "Feb 28", miles: "304 mi", status: "cancelled", amount: 0, cargo: "hazardous" },
];

// ─── SCREEN: HOME ─────────────────────────────────────────────────

function HomeScreen({ dark, setTab }) {
  return (
    <div>
      <StatusBar dark={dark} />
      <Header title="TRUCK" highlight="PILOT" dark={dark} right={
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>JD</div>
      } />
      <div style={{ padding: "0 16px 8px" }}>
        {/* Weather Card */}
        <div style={{ borderRadius: 16, padding: 16, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: dark ? "#1e1e1e" : ORANGE, border: dark ? `1px solid ${ORANGE}` : "none" }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: dark ? ORANGE : "#fff" }}>+14°</div>
            <div style={{ fontSize: 12, color: dark ? "#888" : "rgba(255,255,255,0.8)", marginTop: 2 }}>Calgary, AB — Sunny</div>
            <div style={{ fontSize: 11, color: dark ? "#555" : "rgba(255,255,255,0.7)", marginTop: 4 }}>Good visibility today</div>
          </div>
          <div style={{ fontSize: 48 }}>☀️</div>
        </div>

        {/* Quick Actions */}
        <SectionTitle dark={dark}>Quick Actions</SectionTitle>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {[{ label: "Add Load", icon: "➕", primary: true, tab: "addload" }, { label: "Load History", icon: "📋", primary: false, tab: "history" }, { label: "Earnings", icon: "💰", primary: false, tab: "earnings" }].map(btn => (
            <div key={btn.label} onClick={() => setTab(btn.tab)} style={{ flex: 1, borderRadius: 14, padding: "14px 10px", textAlign: "center", cursor: "pointer", background: btn.primary ? ORANGE : dark ? "#1e1e1e" : "#fff", border: btn.primary ? "none" : `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{btn.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: btn.primary ? "#fff" : dark ? "#ccc" : "#222" }}>{btn.label}</div>
            </div>
          ))}
        </div>

        {/* Recent Loads */}
        <SectionTitle dark={dark}>Recent Loads</SectionTitle>
        {sampleLoads.slice(0, 2).map(load => <LoadCard key={load.id} load={load} dark={dark} />)}
      </div>
    </div>
  );
}

// ─── SCREEN: ADD LOAD ─────────────────────────────────────────────

function AddLoadScreen({ dark }) {
  const [cargo, setCargo] = useState("general");
  const [form, setForm] = useState({ pickup: "", dropoff: "", weight: "", date: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);

  const cargoTypes = [{ id: "general", icon: "📦", label: "General" }, { id: "refrigerated", icon: "🥶", label: "Refrigerated" }, { id: "hazardous", icon: "⚠️", label: "Hazardous" }, { id: "oversized", icon: "🏗️", label: "Oversized" }];

  const inputStyle = { width: "100%", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontFamily: "'Barlow', sans-serif", fontWeight: 500, border: `1px solid ${dark ? "#2a2a2a" : "#eee"}`, background: dark ? "#1e1e1e" : "#fff", color: dark ? "#fff" : DARK, boxSizing: "border-box", outline: "none" };

  if (submitted) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16, padding: 32 }}>
      <div style={{ fontSize: 64 }}>🚛</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: ORANGE }}>Load Logged!</div>
      <div style={{ fontSize: 14, color: dark ? "#888" : "#aaa", textAlign: "center" }}>Your load has been saved successfully.</div>
      <button onClick={() => { setSubmitted(false); setForm({ pickup: "", dropoff: "", weight: "", date: "", notes: "" }); }} style={{ padding: "12px 32px", borderRadius: 12, background: ORANGE, border: "none", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>ADD ANOTHER LOAD</button>
    </div>
  );

  return (
    <div>
      <StatusBar dark={dark} />
      <Header title="ADD " highlight="LOAD" dark={dark} />
      <div style={{ padding: "0 16px 8px" }}>
        {/* Route */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, color: dark ? "#666" : "#888" }}>Route</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE }} />
              <div style={{ width: 2, height: 12, background: dark ? "#444" : "#ddd" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4CAF50" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={{ ...inputStyle, borderLeft: `2px solid ${ORANGE}` }} placeholder="Pickup city / address" value={form.pickup} onChange={e => setForm({ ...form, pickup: e.target.value })} />
              <input style={{ ...inputStyle, borderLeft: "2px solid #4CAF50" }} placeholder="Drop-off city / address" value={form.dropoff} onChange={e => setForm({ ...form, dropoff: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Weight & Date */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {[{ label: "Weight (lbs)", key: "weight", placeholder: "e.g. 32,000" }, { label: "Date", key: "date", placeholder: "Mar 16" }].map(f => (
            <div key={f.key} style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, color: dark ? "#666" : "#888" }}>{f.label}</div>
              <input style={inputStyle} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>

        {/* Cargo Type */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, color: dark ? "#666" : "#888" }}>Cargo Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {cargoTypes.map(ct => (
              <div key={ct.id} onClick={() => setCargo(ct.id)} style={{ borderRadius: 10, padding: "10px 8px", textAlign: "center", cursor: "pointer", background: cargo === ct.id ? ORANGE : dark ? "#1e1e1e" : "#fff", border: `1px solid ${cargo === ct.id ? ORANGE : dark ? "#2a2a2a" : "#eee"}` }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{ct.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: cargo === ct.id ? "#fff" : dark ? "#888" : "#555" }}>{ct.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, color: dark ? "#666" : "#888" }}>Notes (optional)</div>
          <input style={inputStyle} placeholder="Special instructions..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <button onClick={() => setSubmitted(true)} style={{ width: "100%", padding: 16, borderRadius: 16, background: ORANGE, border: "none", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}>
          LOG THIS LOAD 🚛
        </button>
      </div>
    </div>
  );
}

// ─── SCREEN: LOAD HISTORY ─────────────────────────────────────────

function HistoryScreen({ dark }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [filters, setFilters] = useState({ truck: "all", trailer: "all", driver: "all", cargo: "all", date: "any", status: "all" });

  const chips = [{ id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "done", label: "Done" }, { id: "cancelled", label: "Cancelled" }];

  const filtered = sampleLoads.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.id.toLowerCase().includes(q) || l.from.toLowerCase().includes(q) || l.to.toLowerCase().includes(q) || l.driver.toLowerCase().includes(q) || l.truck.toLowerCase().includes(q);
    const matchChip = filter === "all" || l.status === filter;
    const matchStatus = filters.status === "all" || l.status === filters.status;
    const matchDriver = filters.driver === "all" || l.driver === filters.driver;
    const matchTruck = filters.truck === "all" || l.truck === filters.truck;
    const matchCargo = filters.cargo === "all" || l.cargo === filters.cargo;
    return matchSearch && matchChip && matchStatus && matchDriver && matchTruck && matchCargo;
  });

  const selectStyle = { borderRadius: 10, padding: "9px 10px", fontSize: 12, fontFamily: "'Barlow', sans-serif", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}`, background: dark ? "#121212" : "#f5f5f0", color: dark ? "#aaa" : "#555", width: "100%", boxSizing: "border-box", outline: "none" };

  return (
    <div>
      <StatusBar dark={dark} />
      <Header title="LOAD " highlight="HISTORY" dark={dark} />

      {/* Search Row */}
      <div style={{ padding: "0 16px 10px", position: "relative" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search loads..." style={{ flex: 1, borderRadius: 12, padding: "11px 14px", fontSize: 13, fontFamily: "'Barlow', sans-serif", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}`, background: dark ? "#1e1e1e" : "#fff", color: dark ? "#fff" : DARK, outline: "none" }} />
          <button onClick={() => setDropOpen(!dropOpen)} style={{ width: 42, height: 42, borderRadius: 12, background: ORANGE, border: "none", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>⚙️</button>
        </div>

        {/* Dropdown */}
        {dropOpen && (
          <div style={{ borderRadius: 16, padding: 14, marginTop: 10, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#333" : "#eee"}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, color: dark ? "#555" : "#aaa" }}>Filter by</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { label: "🚛 Truck No.", key: "truck", opts: [["all", "All Trucks"], ["TRK-441", "TRK-441"], ["TRK-228", "TRK-228"], ["TRK-315", "TRK-315"]] },
                { label: "🔗 Trailer No.", key: "trailer", opts: [["all", "All Trailers"], ["TRL-88", "TRL-88"], ["TRL-91", "TRL-91"], ["TRL-104", "TRL-104"]] },
                { label: "👤 Driver", key: "driver", opts: [["all", "All Drivers"], ["John D.", "John D."], ["Mike R.", "Mike R."], ["Sara T.", "Sara T."]] },
                { label: "📦 Cargo", key: "cargo", opts: [["all", "All Types"], ["general", "General"], ["refrigerated", "Refrigerated"], ["hazardous", "Hazardous"], ["oversized", "Oversized"]] },
                { label: "📅 Date", key: "date", opts: [["any", "Any Time"], ["week", "This Week"], ["month", "This Month"], ["3months", "Last 3 Months"]] },
                { label: "🏁 Status", key: "status", opts: [["all", "All"], ["active", "Active"], ["done", "Done"], ["cancelled", "Cancelled"]] },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4, color: dark ? "#444" : "#bbb" }}>{f.label}</div>
                  <select style={selectStyle} value={filters[f.key]} onChange={e => setFilters({ ...filters, [f.key]: e.target.value })}>
                    {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={() => setDropOpen(false)} style={{ width: "100%", padding: 10, borderRadius: 10, background: ORANGE, border: "none", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}>APPLY FILTERS</button>
            <button onClick={() => { setFilters({ truck: "all", trailer: "all", driver: "all", cargo: "all", date: "any", status: "all" }); setDropOpen(false); }} style={{ width: "100%", padding: 8, borderRadius: 10, border: "none", cursor: "pointer", marginTop: 6, fontSize: 12, fontWeight: 600, fontFamily: "'Barlow', sans-serif", background: dark ? "#121212" : "#f5f5f0", color: dark ? "#555" : "#aaa" }}>Clear all</button>
          </div>
        )}
      </div>

      {/* Chips */}
      <div style={{ display: "flex", gap: 7, padding: "0 16px 10px", overflowX: "auto" }}>
        {chips.map(c => (
          <div key={c.id} onClick={() => setFilter(c.id)} style={{ borderRadius: 20, padding: "6px 14px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0, background: filter === c.id ? ORANGE : dark ? "#1e1e1e" : "#fff", color: filter === c.id ? "#fff" : dark ? "#666" : "#888", border: filter === c.id ? "none" : `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>{c.label}</div>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, padding: "0 16px 6px", color: dark ? "#555" : "#aaa" }}>
        <span style={{ color: ORANGE }}>{filtered.length}</span> loads found
      </div>

      <div style={{ padding: "0 16px 8px" }}>
        {filtered.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: dark ? "#555" : "#aaa", fontSize: 14 }}>No loads found</div>
          : filtered.map(load => <LoadCard key={load.id} load={load} dark={dark} />)
        }
      </div>
    </div>
  );
}

// ─── SCREEN: EARNINGS ─────────────────────────────────────────────

function EarningsScreen({ dark }) {
  const [period, setPeriod] = useState("week");
  const periods = [{ id: "week", label: "This Week" }, { id: "month", label: "This Month" }, { id: "year", label: "This Year" }];
  const data = { week: { total: "$4,820", loads: 6, avg: "$803", miles: 942, trend: "↑ 12% vs last week", bars: [30, 50, 40, 65, 55, 20, 10] }, month: { total: "$18,340", loads: 24, avg: "$764", miles: 3820, trend: "↑ 8% vs last month", bars: [55, 70, 45, 80, 60, 50, 65] }, year: { total: "$142,600", loads: 148, avg: "$963", miles: 52000, trend: "↑ 22% vs last year", bars: [40, 55, 60, 50, 70, 65, 80] } };
  const d = data[period];

  return (
    <div>
      <StatusBar dark={dark} />
      <Header title="MY " highlight="EARNINGS" dark={dark} />

      {/* Period Chips */}
      <div style={{ display: "flex", gap: 7, padding: "0 16px 12px" }}>
        {periods.map(p => (
          <div key={p.id} onClick={() => setPeriod(p.id)} style={{ borderRadius: 20, padding: "6px 14px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", background: period === p.id ? ORANGE : dark ? "#1e1e1e" : "#fff", color: period === p.id ? "#fff" : dark ? "#666" : "#888", border: period === p.id ? "none" : `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>{p.label}</div>
        ))}
      </div>

      {/* Hero Card */}
      <div style={{ margin: "0 16px 12px", borderRadius: 18, padding: 20, background: dark ? "#1e1e1e" : ORANGE, border: dark ? `1px solid ${ORANGE}` : "none", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: dark ? "#555" : "rgba(255,255,255,0.7)", marginBottom: 4 }}>Total Earned</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 700, color: dark ? ORANGE : "#fff", lineHeight: 1, marginBottom: 4 }}>{d.total}</div>
        <div style={{ fontSize: 12, color: dark ? "#555" : "rgba(255,255,255,0.8)" }}>{d.trend}</div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, margin: "0 16px 12px" }}>
        {[{ val: d.loads, label: "Loads" }, { val: d.avg, label: "Avg / Load" }, { val: d.miles.toLocaleString(), label: "Miles" }].map(s => (
          <div key={s.label} style={{ flex: 1, borderRadius: 14, padding: 12, textAlign: "center", background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: ORANGE }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2, color: dark ? "#555" : "#aaa" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      <div style={{ margin: "0 16px 12px", borderRadius: 14, padding: 14, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, color: dark ? "#555" : "#aaa" }}>Daily Earnings</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
            const isMax = d.bars[i] === Math.max(...d.bars);
            return (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", height: d.bars[i], background: isMax ? ORANGE : dark ? "#2a2a2a" : "#eee" }} />
                <div style={{ fontSize: 9, fontWeight: 600, color: dark ? "#444" : "#bbb" }}>{day}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per Load Breakdown */}
      <SectionTitle dark={dark}>Per Load Breakdown</SectionTitle>
      <div style={{ padding: "0 16px 8px" }}>
        {sampleLoads.filter(l => l.status !== "cancelled").map(load => (
          <div key={load.id} style={{ borderRadius: 12, padding: "11px 13px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fff" : DARK }}>{load.id} · {load.truck}</div>
              <div style={{ fontSize: 11, color: dark ? "#555" : "#aaa" }}>{load.from} → {load.to}</div>
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: ORANGE }}>${load.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SCREEN: PROFILE ─────────────────────────────────────────────

function ProfileScreen({ dark, setDark }) {
  const menuItems = [
    { icon: "📄", label: "Documents", sub: "License, insurance, permits", color: "rgba(255,106,0,0.15)" },
    { icon: "🔔", label: "Notifications", sub: "Alerts & reminders", color: "rgba(76,175,80,0.12)" },
    { icon: "🆘", label: "Support / Help", sub: "Contact us anytime", color: "rgba(33,150,243,0.12)" },
    { icon: "🔒", label: "Privacy & Security", sub: "Password, data settings", color: "rgba(255,106,0,0.15)" },
  ];

  return (
    <div>
      <StatusBar dark={dark} />
      <Header title="MY " highlight="PROFILE" dark={dark} right={
        <button style={{ fontSize: 11, fontWeight: 600, padding: "6px 14px", borderRadius: 20, cursor: "pointer", border: "none", background: ORANGE, color: "#fff", fontFamily: "'Barlow', sans-serif" }}>✏️ Edit</button>
      } />

      <div style={{ padding: "0 16px 80px" }}>
        {/* Avatar & Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" }}>JD</div>
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#4CAF50", border: `2px solid ${dark ? "#121212" : "#f5f5f0"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>✓</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: dark ? "#fff" : DARK }}>John Doe</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: ORANGE, margin: "2px 0" }}>DRV-00441</div>
            <div style={{ fontSize: 11, color: dark ? "#555" : "#aaa" }}>Member since Jan 2023</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ val: "148", label: "Loads Done" }, { val: "4.9★", label: "Rating" }, { val: "52K", label: "Miles" }].map(s => (
            <div key={s.label} style={{ flex: 1, borderRadius: 12, padding: 10, textAlign: "center", background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: ORANGE }}>{s.val}</div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2, color: dark ? "#555" : "#aaa" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Truck Info */}
        <SectionTitle dark={dark}>Truck & Trailer</SectionTitle>
        <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 14, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
          {[["🚛", "Truck No.", "TRK-441"], ["🔗", "Trailer No.", "TRL-88"], ["📋", "License Plate", "ABJ 4421"], ["📱", "Phone", "+1 403-555-0192"]].map(([icon, label, val], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i > 0 ? `0.5px solid ${dark ? "#2a2a2a" : "#f0f0f0"}` : "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: dark ? "#aaa" : "#555" }}>{label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fff" : DARK }}>{val}</span>
                <span style={{ color: ORANGE, fontSize: 12 }}>›</span>
              </div>
            </div>
          ))}
        </div>

        {/* Settings */}
        <SectionTitle dark={dark}>Settings & More</SectionTitle>
        <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 14, background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#2a2a2a" : "#eee"}` }}>
          {/* Dark Mode Toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", cursor: "pointer" }} onClick={() => setDark(!dark)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(33,150,243,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🌙</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: dark ? "#fff" : DARK }}>Dark Mode</div>
                <div style={{ fontSize: 10, color: dark ? "#555" : "#aaa", marginTop: 1 }}>Switch display theme</div>
              </div>
            </div>
            <div onClick={() => setDark(!dark)} style={{ width: 36, height: 20, borderRadius: 20, background: dark ? ORANGE : "#ddd", display: "flex", alignItems: "center", justifyContent: dark ? "flex-end" : "flex-start", padding: "0 3px", boxSizing: "border-box", cursor: "pointer", transition: "background 0.2s" }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
            </div>
          </div>
          {menuItems.map((item, i) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", borderTop: `0.5px solid ${dark ? "#2a2a2a" : "#f0f0f0"}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: item.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: dark ? "#fff" : DARK }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: dark ? "#555" : "#aaa", marginTop: 1 }}>{item.sub}</div>
                </div>
              </div>
              <span style={{ color: ORANGE, fontSize: 12 }}>›</span>
            </div>
          ))}
        </div>

        {/* Logout */}
        <button style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: 1, background: dark ? "#3a1a1a" : "#fce4e4", color: dark ? "#ef5350" : "#c62828" }}>
          🚪 LOG OUT
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────

export default function TruckPilot() {
  const [tab, setTab] = useState("home");
  const [dark, setDark] = useState(false);

  const bg = dark ? "#121212" : "#f5f5f0";
  const tabBg = dark ? "#1a1a1a" : "#fff";
  const tabBorder = dark ? "#2a2a2a" : "#eee";

  const renderScreen = () => {
    switch (tab) {
      case "home": return <HomeScreen dark={dark} setTab={setTab} />;
      case "addload": return <AddLoadScreen dark={dark} />;
      case "history": return <HistoryScreen dark={dark} />;
      case "earnings": return <EarningsScreen dark={dark} />;
      case "profile": return <ProfileScreen dark={dark} setDark={setDark} />;
      default: return <HomeScreen dark={dark} setTab={setTab} />;
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet" />
      <div style={{ ...styles.app, background: bg }}>
        <div style={styles.screen}>{renderScreen()}</div>
        <div style={{ ...styles.tabBar, background: tabBg, borderColor: tabBorder }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
              <div style={{ fontSize: 20 }}>{t.icon}</div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: tab === t.id ? ORANGE : dark ? "#555" : "#999" }}>{t.label}</div>
              {tab === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: ORANGE }} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
