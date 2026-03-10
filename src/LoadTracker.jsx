import { useState, useEffect, useRef } from "react";

// ── Storage Keys ────────────────────────────────────────────────────────────
const USERS_KEY   = "truck-users-v2";
const SESSION_KEY = "truck-session-v2";
const ownerLoadsKey       = (uid) => `truck-loads-owner-${uid}`;
const ownerRatesKey       = (uid) => `truck-rates-owner-${uid}`;
const ownerCustomRoutesKey= (uid) => `truck-custom-routes-${uid}`;
const expensesKey         = (uid) => `truck-expenses-${uid}`;
const truckExpensesKey    = (uid) => `truck-truck-expenses-${uid}`;
const trucksKey           = (uid) => `truck-trucks-${uid}`;
const pendingDriversKey   = (uid) => `truck-pending-drivers-${uid}`;

// ── Auth Helpers ─────────────────────────────────────────────────────────────
const hashPass    = (s)   => { let h=0; for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0; return h.toString(36); };
const getUsers    = ()    => { try { return JSON.parse(localStorage.getItem(USERS_KEY)||"{}"); } catch(e) { return {}; } };
const saveUsers   = (u)   => localStorage.setItem(USERS_KEY, JSON.stringify(u));
const getSession  = ()    => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); } catch(e) { return null; } };
const saveSession = (s)   => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession= ()    => localStorage.removeItem(SESSION_KEY);
const genInviteCode = ()  => { const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c=""; for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)]; return c; };
const getStoredExpenses = (uid) => { try { return JSON.parse(localStorage.getItem(expensesKey(uid))||"[]"); } catch(e) { return []; } };
const getStoredTruckExpenses = (uid) => { try { return JSON.parse(localStorage.getItem(truckExpensesKey(uid))||"[]"); } catch(e) { return []; } };
const getStoredCustomRoutes = (key) => { try { return JSON.parse(localStorage.getItem(key)||"[]"); } catch(e) { return []; } };

// ── Default Data ─────────────────────────────────────────────────────────────
const DEFAULT_RATES = {
  companyWaitRate: 85,
  driverWaitRate:  40,
  billingMethod:   "per_load",
  perLoadRate:     0,
  perCubicRate:    0,
  perHourRate:     0,
};

// ── Expense Categories ────────────────────────────────────────────────────────
const DRIVER_EXPENSE_CATEGORIES = [
  { id:"meals",    label:"Meals & Per Diem",    icon:"🍽️", color:"#22C55E" },
  { id:"tolls",    label:"Tolls & Parking",      icon:"🛣️", color:"#3B82F6" },
  { id:"lodging",  label:"Lodging",              icon:"🏨", color:"#8B5CF6" },
  { id:"supplies", label:"Supplies",             icon:"🧰", color:"#F59E0B" },
  { id:"medical",  label:"Medical / DOT",        icon:"🏥", color:"#EF4444" },
  { id:"other",    label:"Other",                icon:"📋", color:"#6B7280" },
];
const OWNER_EXPENSE_CATEGORIES = [
  { id:"fuel",        label:"Fuel",                   icon:"⛽", color:"#F97316" },
  { id:"maintenance", label:"Maintenance & Repairs",   icon:"🔧", color:"#EF4444" },
  { id:"insurance",   label:"Insurance",               icon:"🛡️", color:"#3B82F6" },
  { id:"permits",     label:"Permits & Licenses",      icon:"📄", color:"#8B5CF6" },
  { id:"tires",       label:"Tires",                   icon:"🔘", color:"#6B7280" },
  { id:"scales",      label:"Scales / Weigh Stations", icon:"⚖️", color:"#0EA5E9" },
  { id:"other",       label:"Other",                   icon:"📋", color:"#A78BFA" },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const lbl  = { display:"block", fontSize:11, color:"#5a4d40", letterSpacing:2, marginBottom:6, fontWeight:"bold" };
const iSt  = { width:"100%", padding:"10px 12px", border:"1px solid #ddd", borderLeft:"3px solid #f5a623",
                borderRadius:6, fontSize:14, color:"#2c2416", background:"#fff", outline:"none", boxSizing:"border-box" };
const card = { background:"#fff", borderRadius:12, padding:16, marginBottom:12, boxShadow:"0 2px 8px #0001", border:"1px solid #f0e8dc" };
const tBtn = (bg="#f5a623", color="#fff") => ({
  background:bg, color, border:"none", borderRadius:6, padding:"10px 16px",
  fontSize:13, fontWeight:"bold", cursor:"pointer", letterSpacing:1
});

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtC    = (v) => `$${Number(v||0).toFixed(2)}`;
const fmt     = (m) => { const h=Math.floor(m/60), mn=m%60; return `${h}h ${mn}m`; };
const secsToHMS=(s) => { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; };
const timeToMins=(t) => { if(!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; };
const todayStr= () => new Date().toISOString().slice(0,10);

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode]     = useState("login");
  const [role, setRole]     = useState("owner");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [pass, setPass]     = useState("");
  const [invite, setInvite] = useState("");
  const [msg,  setMsg]      = useState("");
  const [ownerDrivers, setOwnerDrivers] = useState([]);

  const checkInviteCode = (code) => {
    const users = getUsers();
    const owner = Object.values(users).find(u=>u.role==="owner" && u.inviteCode===code.trim().toUpperCase());
    if (owner) {
      const existing = Object.values(users).filter(u=>u.role==="driver" && u.ownerUid===owner.uid);
      setOwnerDrivers(existing.map(d=>d.fullName||d.name));
    } else {
      setOwnerDrivers([]);
    }
  };

  const submit = () => {
    const users = getUsers();
    if (mode === "login") {
      const u = Object.values(users).find(u => u.name === username && u.passHash === hashPass(pass));
      if (!u) return setMsg("❌ Wrong username or password");
      const sess = { uid:u.uid, name:u.name, fullName:u.fullName||u.name, role:u.role, ownerUid:u.ownerUid||u.uid };
      saveSession(sess); onLogin(sess);
    } else {
      if (!username.trim() || !pass.trim()) return setMsg("❌ Username and password required");
      if (!fullName.trim()) return setMsg("❌ Full name required");
      if (Object.values(users).find(u => u.name === username)) return setMsg("❌ Username taken");
      let ownerUid = null;
      if (role === "driver") {
        const owner = Object.values(users).find(u=>u.role==="owner" && u.inviteCode===invite.trim().toUpperCase());
        if (!owner) return setMsg("❌ Invalid invite code");
        ownerUid = owner.uid;
      }
      const uid = username + Date.now();
      const displayName = fullName.trim();
      const newUser = { uid, name:username, fullName:displayName, role, passHash:hashPass(pass),
        ownerUid:ownerUid||uid, inviteCode:role==="owner"?genInviteCode():null, drivers:[] };
      users[uid] = newUser;
      saveUsers(users);
      const sess = { uid, name:username, fullName:displayName, role, ownerUid:newUser.ownerUid };
      saveSession(sess); onLogin(sess);
    }
  };

  const accent = role === "driver" ? "#3498db" : "#f5a623";
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#1a1208 0%,#2c2010 60%,#1a2010 100%)", overflowY:"auto" }}>
      <div style={{ background:"#0004", padding:"28px 20px 20px", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:8 }}>🚛</div>
        <div style={{ fontSize:26, fontWeight:"bold", color:"#fff", letterSpacing:3 }}>LOAD TRACKER</div>
        <div style={{ fontSize:11, color:"#f5a623", letterSpacing:4, marginTop:4 }}>OILSANDS HAUL LOG</div>
      </div>

      <div style={{ padding:"20px 16px 40px", maxWidth:420, margin:"0 auto" }}>
        <div style={{ background:"#fff", borderRadius:20, padding:24, boxShadow:"0 20px 60px #0008" }}>

        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={()=>{setMode(m);setMsg("");}}
              style={{ ...tBtn(mode===m?"#2c2416":"#f5f0eb", mode===m?"#fff":"#6a5e50"), flex:1, fontSize:12 }}>
              {m==="login"?"SIGN IN":"CREATE ACCOUNT"}
            </button>
          ))}
        </div>

        {mode === "register" && (
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[["owner","🔑 Owner Operator"],["driver","🚛 Driver"]].map(([r,label]) => (
              <button key={r} onClick={()=>setRole(r)}
                style={{ ...tBtn(role===r?accent:"#f5f0eb", role===r?"#fff":"#6a5e50"), flex:1, fontSize:11 }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "register" && (
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>✏️ FULL NAME</label>
            <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your full name (shown on loads)"
              style={{ ...iSt, borderLeftColor:accent, background:accent==="#f5a623"?"#fff9ed":"#f0f7ff" }} />
          </div>
        )}

        <div style={{ marginBottom:14 }}>
          <label style={lbl}>👤 USERNAME</label>
          <input value={username} onChange={e=>setUsername(e.target.value)} placeholder={mode==="login"?"Your username":"Choose a username"}
            style={{ ...iSt, borderLeftColor:accent }} />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>🔒 PASSWORD</label>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password"
            style={{ ...iSt, borderLeftColor:accent }} />
        </div>

        {mode === "register" && role === "driver" && (
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>📋 OWNER INVITE CODE</label>
            <input value={invite} onChange={e=>{ setInvite(e.target.value.toUpperCase()); if(e.target.value.length>=6) checkInviteCode(e.target.value); }}
              placeholder="6-letter code"
              style={{ ...iSt, borderLeftColor:"#9b59b6", textTransform:"uppercase", letterSpacing:4, textAlign:"center" }} />
            {invite.length>=6 && ownerDrivers.length>0 && (
              <div style={{ marginTop:8, background:"#f8f0ff", borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:"#9b59b6", letterSpacing:2, fontWeight:"bold", marginBottom:6 }}>EXISTING DRIVERS ON THIS ACCOUNT</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {ownerDrivers.map(n=>(
                    <button key={n} onClick={()=>setFullName(n)}
                      style={{ ...tBtn(fullName===n?"#9b59b6":"#f0e8ff",fullName===n?"#fff":"#9b59b6"), fontSize:11, padding:"6px 10px" }}>{n}</button>
                  ))}
                </div>
                <div style={{ fontSize:10, color:"#9a8e80", marginTop:6 }}>Select your name or type a new one above</div>
              </div>
            )}
          </div>
        )}

        {msg && <div style={{ color:"#e74c3c", fontSize:12, marginBottom:12, textAlign:"center" }}>{msg}</div>}
        <button onClick={submit} style={{ ...tBtn(accent), width:"100%", padding:14, fontSize:15 }}>
          {mode==="login" ? "🔓 SIGN IN" : "✅ CREATE ACCOUNT"}
        </button>
        </div>

        {mode==="login" && (
          <div style={{ marginTop:20, textAlign:"center" }}>
            <button onClick={()=>{
              if(window.confirm("⚠️ This will DELETE all users, loads, and data permanently. Are you sure?")) {
                Object.keys(localStorage).filter(k=>k.startsWith("truck-")).forEach(k=>localStorage.removeItem(k));
                setMsg("✅ All data cleared. You can create a new account.");
              }
            }} style={{ background:"transparent", border:"1px solid #e74c3c55", color:"#e74c3c99", borderRadius:8, padding:"10px 20px", fontSize:11, cursor:"pointer", letterSpacing:1 }}>
              🗑 RESET ALL DATA
            </button>
            <div style={{ fontSize:10, color:"#ffffff44", marginTop:6 }}>Clears all accounts, loads and settings</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Receipt Scan Modal ────────────────────────────────────────────────────────
function ReceiptScanModal({ onClose, onSave, categories }) {
  const [phase,    setPhase]   = useState("capture");
  const [imgData,  setImgData] = useState(null);
  const [loading,  setLoading] = useState(false);
  const [result,   setResult]  = useState(null);
  const [err,      setErr]     = useState("");
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImgData(ev.target.result); setPhase("preview"); };
    reader.readAsDataURL(file);
  };

  const scan = async () => {
    if (!imgData) return;
    setLoading(true); setErr("");
    try {
      const base64 = imgData.split(",")[1];
      const mediaType = imgData.split(";")[0].split(":")[1];
      const catList = categories.map(c=>c.id).join(", ");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:mediaType, data:base64 }},
            { type:"text", text:`Extract receipt info. Return ONLY JSON (no markdown): {"amount":0.00,"category":"one of: ${catList}","merchant":"name","note":"brief description","date":"YYYY-MM-DD or empty"}` }
          ]}]
        })
      });
      const data = await resp.json();
      const txt = data.content?.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(txt);
      setResult(parsed); setPhase("confirm");
    } catch(e) { setErr("Could not parse receipt. Try again."); }
    setLoading(false);
  };

  const save = () => {
    if (!result) return;
    onSave({ amount: parseFloat(result.amount)||0, category: result.category||"other",
      merchant: result.merchant||"", note: result.note||"", date: result.date||todayStr() });
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:"bold", color:"#2c2416" }}>📸 SCAN RECEIPT</div>
          <button onClick={onClose} style={{ ...tBtn("#f5f0eb","#6a5e50"), padding:"6px 12px" }}>✕</button>
        </div>
        {phase==="capture" && (
          <div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <button onClick={()=>{fileRef.current.setAttribute("capture","environment"); fileRef.current.click();}}
                style={{ ...tBtn("#2c2416"), padding:20, fontSize:13 }}>📷 CAMERA</button>
              <button onClick={()=>{fileRef.current.removeAttribute("capture"); fileRef.current.click();}}
                style={{ ...tBtn("#f5a623"), padding:20, fontSize:13 }}>🖼️ GALLERY</button>
            </div>
          </div>
        )}
        {phase==="preview" && (
          <div>
            <img src={imgData} alt="receipt" style={{ width:"100%", borderRadius:8, marginBottom:16 }}/>
            {err && <div style={{ color:"#e74c3c", fontSize:12, marginBottom:12 }}>⚠️ {err}</div>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={scan} disabled={loading} style={{ ...tBtn("#f5a623"), flex:1, padding:14 }}>
                {loading ? "🔄 Scanning..." : "🤖 SCAN WITH AI"}
              </button>
              <button onClick={()=>setPhase("capture")} style={{ ...tBtn("#b5a898"), padding:"14px 16px" }}>↩</button>
            </div>
          </div>
        )}
        {phase==="confirm" && result && (
          <div>
            <div style={{ background:"#f5fff8", border:"2px solid #27ae6033", borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#27ae60", letterSpacing:2, fontWeight:"bold", marginBottom:12 }}>✅ RECEIPT DETECTED</div>
              {[["Amount","amount","number"],["Merchant","merchant","text"],["Note","note","text"],["Date","date","date"]].map(([label,key,type])=>(
                <div key={key} style={{ marginBottom:10 }}>
                  <label style={{ ...lbl, color:"#27ae60" }}>{label.toUpperCase()}</label>
                  <input type={type} value={result[key]||""} onChange={e=>setResult(r=>({...r,[key]:e.target.value}))}
                    style={{ ...iSt, borderLeftColor:"#27ae60" }}/>
                </div>
              ))}
              <div>
                <label style={{ ...lbl, color:"#27ae60" }}>CATEGORY</label>
                <select value={result.category||"other"} onChange={e=>setResult(r=>({...r,category:e.target.value}))}
                  style={{ ...iSt, borderLeftColor:"#27ae60" }}>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={save} style={{ ...tBtn("#27ae60"), flex:1, padding:14 }}>💾 SAVE EXPENSE</button>
              <button onClick={()=>setPhase("preview")} style={{ ...tBtn("#b5a898"), padding:"14px 16px" }}>↩</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────
function ExpensesTab({ session, isOwner }) {
  const [expTab, setExpTab]   = useState("personal");
  const [expenses, setExpenses]           = useState([]);
  const [truckExpenses, setTruckExpenses] = useState([]);
  const [showScan, setShowScan]   = useState(false);
  const [addMode, setAddMode]     = useState(null);
  const blankForm = (cat) => ({ amount:"", category:cat, merchant:"", note:"", date:todayStr() });
  const [manualForm, setManualForm] = useState(blankForm(isOwner?"fuel":"meals"));

  useEffect(()=>{
    try { const e=localStorage.getItem(expensesKey(session.uid)); setExpenses(e?JSON.parse(e):[]); } catch(e){}
    try { const e=localStorage.getItem(truckExpensesKey(session.uid)); setTruckExpenses(e?JSON.parse(e):[]); } catch(e){}
  },[session.uid]);

  const isTruck   = !isOwner && expTab==="truck";
  const activeCats = isOwner
    ? OWNER_EXPENSE_CATEGORIES
    : isTruck ? OWNER_EXPENSE_CATEGORIES : DRIVER_EXPENSE_CATEGORIES;
  const activeList = isTruck ? truckExpenses : expenses;

  const saveList = (arr, isTrk) => {
    if (isTrk) { setTruckExpenses(arr); localStorage.setItem(truckExpensesKey(session.uid), JSON.stringify(arr)); }
    else        { setExpenses(arr);      localStorage.setItem(expensesKey(session.uid),      JSON.stringify(arr)); }
  };
  const addExpense = (exp) => { const arr=[{...exp,id:Date.now().toString()},...activeList]; saveList(arr,isTruck); };
  const delExpense = (id)  => saveList(activeList.filter(e=>e.id!==id), isTruck);

  const submitManual = () => {
    if (!manualForm.amount || isNaN(parseFloat(manualForm.amount))) return;
    addExpense({ ...manualForm, amount:parseFloat(manualForm.amount) });
    setManualForm(blankForm(activeCats[0].id));
    setAddMode(null);
  };

  const total  = activeList.reduce((s,e)=>s+Number(e.amount||0),0);
  const byCat  = activeCats.map(c=>({ ...c, total:activeList.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount||0),0) })).filter(c=>c.total>0);
  const accent = isOwner ? "#f5a623" : isTruck ? "#e67e22" : "#3498db";

  return (
    <div style={{ padding:"0 16px 40px" }}>
      {!isOwner && (
        <div style={{ display:"flex", gap:8, marginTop:16, marginBottom:4 }}>
          <button onClick={()=>{setExpTab("personal");setAddMode(null);setManualForm(blankForm("meals"));}}
            style={{ ...tBtn(expTab==="personal"?"#3498db":"#f5f0eb", expTab==="personal"?"#fff":"#6a5e50"), flex:1, fontSize:12 }}>
            👤 My Expenses
          </button>
          <button onClick={()=>{setExpTab("truck");setAddMode(null);setManualForm(blankForm("fuel"));}}
            style={{ ...tBtn(expTab==="truck"?"#e67e22":"#f5f0eb", expTab==="truck"?"#fff":"#6a5e50"), flex:1, fontSize:12 }}>
            🚛 Truck Expenses
          </button>
        </div>
      )}
      {!isOwner && expTab==="truck" && (
        <div style={{ fontSize:11, color:"#e67e22", background:"#fff8f0", borderRadius:6, padding:"8px 12px", marginBottom:10, textAlign:"center" }}>
          Truck expenses are visible to your Owner Operator
        </div>
      )}

      <div style={{ ...card, background:`${accent}11`, border:`2px solid ${accent}33`, marginTop:isOwner?16:0 }}>
        <div style={{ fontSize:11, color:accent, letterSpacing:2, fontWeight:"bold", marginBottom:4 }}>
          {isOwner ? "TOTAL EXPENSES" : isTruck ? "TRUCK EXPENSES" : "MY EXPENSES"}
        </div>
        <div style={{ fontSize:32, fontWeight:"bold", color:accent }}>{fmtC(total)}</div>
        {byCat.length>0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
            {byCat.map(c=>(
              <div key={c.id} style={{ background:"#fff", borderRadius:6, padding:"6px 10px", fontSize:11, color:c.color, fontWeight:"bold", border:`1px solid ${c.color}33` }}>
                {c.icon} {c.label}: {fmtC(c.total)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <button onClick={()=>setAddMode(addMode==="manual"?null:"manual")} style={{ ...tBtn(accent), flex:1, fontSize:12 }}>✏️ ADD MANUAL</button>
        <button onClick={()=>setShowScan(true)} style={{ ...tBtn("#2c2416"), flex:1, fontSize:12 }}>📸 SCAN RECEIPT</button>
      </div>

      {addMode === "manual" && (
        <div style={{ ...card, border:`2px solid ${accent}33` }}>
          <div style={{ fontSize:12, color:accent, letterSpacing:2, fontWeight:"bold", marginBottom:12 }}>➕ ADD EXPENSE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div><label style={{ ...lbl, color:accent }}>AMOUNT ($)</label>
              <input type="number" step="0.01" value={manualForm.amount} onChange={e=>setManualForm(f=>({...f,amount:e.target.value}))}
                placeholder="0.00" style={{ ...iSt, borderLeftColor:accent }}/></div>
            <div><label style={{ ...lbl, color:accent }}>DATE</label>
              <input type="date" value={manualForm.date} onChange={e=>setManualForm(f=>({...f,date:e.target.value}))}
                style={{ ...iSt, borderLeftColor:accent }}/></div>
          </div>
          <div style={{ marginBottom:10 }}><label style={{ ...lbl, color:accent }}>CATEGORY</label>
            <select value={manualForm.category} onChange={e=>setManualForm(f=>({...f,category:e.target.value}))}
              style={{ ...iSt, borderLeftColor:accent }}>
              {activeCats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select></div>
          <div style={{ marginBottom:10 }}><label style={{ ...lbl, color:accent }}>MERCHANT</label>
            <input value={manualForm.merchant} onChange={e=>setManualForm(f=>({...f,merchant:e.target.value}))}
              placeholder="Gas station, shop..." style={{ ...iSt, borderLeftColor:accent }}/></div>
          <div style={{ marginBottom:12 }}><label style={{ ...lbl, color:accent }}>NOTE</label>
            <input value={manualForm.note} onChange={e=>setManualForm(f=>({...f,note:e.target.value}))}
              placeholder="Details..." style={{ ...iSt, borderLeftColor:accent }}/></div>
          <button onClick={submitManual} style={{ ...tBtn(accent), width:"100%" }}>✅ SAVE</button>
        </div>
      )}

      {activeList.length === 0 ? (
        <div style={{ textAlign:"center", color:"#b5a898", padding:40 }}>No expenses yet</div>
      ) : (
        activeList.map(e=>{
          const cat = activeCats.find(c=>c.id===e.category)||activeCats[activeCats.length-1];
          return (
            <div key={e.id} style={{ ...card, borderLeft:`4px solid ${cat.color}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:"bold", color:cat.color }}>{fmtC(e.amount)}</div>
                  <div style={{ fontSize:12, color:"#6a5e50", marginTop:2 }}>{cat.icon} {cat.label}</div>
                  {e.merchant && <div style={{ fontSize:11, color:"#9a8e80" }}>{e.merchant}</div>}
                  {e.note && <div style={{ fontSize:11, color:"#9a8e80" }}>{e.note}</div>}
                  <div style={{ fontSize:10, color:"#b5a898", marginTop:4 }}>{e.date}</div>
                </div>
                <button onClick={()=>delExpense(e.id)} style={{ ...tBtn("#e74c3c11","#e74c3c"), padding:"6px 10px", fontSize:11 }}>🗑</button>
              </div>
            </div>
          );
        })
      )}
      {showScan && <ReceiptScanModal onClose={()=>setShowScan(false)} onSave={addExpense} categories={activeCats}/>}
    </div>
  );
}

// ── Load Detail Modal ─────────────────────────────────────────────────────────
function LoadDetailModal({ load, onClose, rates, isOwner, trucks }) {
  const waitMins = (Number(load.loadWaitMins)||0)+(Number(load.offloadWaitMins)||0);
  const waitHrs  = waitMins/60;
  const cRate = Number(rates.companyWaitRate)||0;
  const dRate = Number(rates.driverWaitRate)||0;
  const wComp = parseFloat((waitHrs*cRate).toFixed(2));
  const wDrv  = parseFloat((waitHrs*dRate).toFixed(2));
  const gross = parseFloat(((Number(load.earnings)||0)+wComp).toFixed(2));
  const dPay  = parseFloat(((Number(load.driverBasePay)||0)+wDrv).toFixed(2));
  const net   = parseFloat((gross-dPay).toFixed(2));
  const truck = trucks?.find(t=>t.id===load.truckId);

  const Row = ({label, value, color="#2c2416", bold=false}) => (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0e8dc" }}>
      <span style={{ fontSize:12, color:"#8a7e70" }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:bold?"bold":"normal", color }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:"bold", color:"#2c2416" }}>📋 LOAD DETAILS</div>
          <button onClick={onClose} style={{ ...tBtn("#f5f0eb","#6a5e50"), padding:"6px 12px" }}>✕</button>
        </div>
        <div style={{ ...card, background:"#fffcf7", border:"2px solid #f5a62333" }}>
          <div style={{ fontSize:15, fontWeight:"bold", color:"#f5a623", marginBottom:8 }}>{load.location}</div>
          {truck && <div style={{ fontSize:12, color:"#6a5e50", marginBottom:4 }}>🚛 TMW#{truck.tmwNumber} — Truck #{truck.truckNumber}{load.trailerNumber?` | Trailer: ${load.trailerNumber}`:""}</div>}
          <Row label="📅 Date" value={load.date}/>
          <Row label="🕐 Arrival" value={load.time||"—"}/>
          <Row label="🗓 Appointment" value={load.appointmentTime||"—"}/>
          <Row label="📞 Called In" value={load.calledInTime||"—"}/>
          <Row label="✅ Completed" value={load.loadCompletedDate ? `${load.loadCompletedDate} ${load.loadCompletedTime||""}` : "—"}/>
          {waitMins > 0 && <Row label="⏱ Total Wait" value={fmt(waitMins)} color="#f5a623"/>}
          {load.fuelTotal>0 && <Row label="⛽ Fuel" value={fmtC(load.fuelTotal)} color="#e67e22"/>}
          {load.note && <div style={{ marginTop:8, fontSize:12, color:"#6a5e50", fontStyle:"italic" }}>📝 {load.note}</div>}
        </div>
        {isOwner && (
          <div style={{ ...card, background:"#fffcf7", border:"2px solid #27ae6033" }}>
            <div style={{ fontSize:11, color:"#27ae60", letterSpacing:2, fontWeight:"bold", marginBottom:8 }}>💰 FINANCIALS</div>
            {load.billingMethod==="per_cubic" && load.cubicYards && <Row label="📐 Cubic Yards" value={`${load.cubicYards} yd³`}/>}
            {load.billingMethod==="per_hour" && load.hoursWorked && <Row label="⏱ Hours Worked" value={`${load.hoursWorked} hrs`}/>}
            <Row label="💵 Load Earnings" value={fmtC(load.earnings||0)}/>
            {wComp>0 && <Row label="⏳ Wait Pay (Co.)" value={fmtC(wComp)} color="#27ae60"/>}
            <Row label="📊 Gross Income" value={fmtC(gross)} color="#27ae60" bold/>
            <Row label="👤 Driver Route Pay" value={fmtC(load.driverBasePay||0)} color="#3498db"/>
            {wDrv>0 && <Row label="⏳ Driver Wait Pay" value={fmtC(wDrv)} color="#3498db"/>}
            <Row label="👤 Total Driver Pay" value={fmtC(dPay)} color="#3498db" bold/>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", background:"#27ae6011", borderRadius:6, paddingLeft:12, paddingRight:12, marginTop:8 }}>
              <span style={{ fontSize:13, fontWeight:"bold", color:"#8a7e70" }}>💰 NET</span>
              <span style={{ fontSize:20, fontWeight:"bold", color:net>=0?"#2ecc71":"#e74c3c" }}>{fmtC(net)}</span>
            </div>
          </div>
        )}
        {!isOwner && (
          <div style={{ ...card, background:"#f0f7ff", border:"2px solid #3498db33" }}>
            <div style={{ fontSize:11, color:"#3498db", letterSpacing:2, fontWeight:"bold", marginBottom:8 }}>💰 YOUR PAY</div>
            <Row label="🚛 Route Pay" value={fmtC(load.driverBasePay||0)} color="#3498db"/>
            {wDrv>0 && <Row label="⏳ Wait Pay" value={fmtC(wDrv)} color="#3498db"/>}
            <Row label="💰 Total Pay" value={fmtC(dPay)} color="#3498db" bold/>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Report View ───────────────────────────────────────────────────────────────
function ReportView({ loads, session, rates, isOwner, onClose, allDrivers }) {
  const [range, setRange]             = useState("week");
  const [driverFilter, setDriverFilter] = useState("all");
  const [view, setView]               = useState("summary");
  const [expRange, setExpRange]       = useState("month");

  const filterDate = (dateStr) => {
    if (!dateStr) return false;
    const d=new Date(dateStr), now=new Date();
    if (range==="today") return d.toDateString()===now.toDateString();
    if (range==="week")  { const w=new Date(now); w.setDate(w.getDate()-7); return d>=w; }
    if (range==="month") { const m=new Date(now); m.setDate(m.getDate()-30); return d>=m; }
    return true;
  };
  const filterExpDate = (dateStr) => {
    if (!dateStr) return false;
    const d=new Date(dateStr), now=new Date();
    if (expRange==="today") return d.toDateString()===now.toDateString();
    if (expRange==="week")  { const w=new Date(now); w.setDate(w.getDate()-7); return d>=w; }
    if (expRange==="month") { const m=new Date(now); m.setDate(m.getDate()-30); return d>=m; }
    return true;
  };

  const myLoads = isOwner
    ? loads.filter(l=>filterDate(l.date) && (driverFilter==="all" || l.assignedDriverUid===driverFilter || (!l.assignedDriverUid && driverFilter==="owner")))
    : loads.filter(l=>filterDate(l.date));

  const totalWait     = myLoads.reduce((s,l)=>s+(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0),0);
  const totalEarn     = myLoads.reduce((s,l)=>s+Number(l.earnings||0),0);
  const waitPayCo     = myLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
  const grossIncome   = totalEarn + waitPayCo;
  const totalDriverPay= myLoads.reduce((s,l)=>{ const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0); },0);
  const netIncome     = grossIncome - totalDriverPay;
  const driverRoutePay= myLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
  const driverWaitPay = myLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);
  const driverTotalPay= driverRoutePay + driverWaitPay;
  const fuelFromLoads = myLoads.reduce((s,l)=>s+Number(l.fuelTotal||0),0);

  const ownerExpRaw      = isOwner ? getStoredExpenses(session.uid).filter(e=>filterExpDate(e.date)) : [];
  const ownerExpTotal    = ownerExpRaw.reduce((s,e)=>s+Number(e.amount||0),0);
  const ownerExpByCat    = OWNER_EXPENSE_CATEGORIES.map(c=>({ ...c, total:ownerExpRaw.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount||0),0) })).filter(c=>c.total>0);

  const driverPersonalExp= !isOwner ? getStoredExpenses(session.uid).filter(e=>filterExpDate(e.date)) : [];
  const driverTruckExp   = !isOwner ? getStoredTruckExpenses(session.uid).filter(e=>filterExpDate(e.date)) : [];
  const driverPersonalTotal = driverPersonalExp.reduce((s,e)=>s+Number(e.amount||0),0);
  const driverTruckTotal    = driverTruckExp.reduce((s,e)=>s+Number(e.amount||0),0);

  const allDriverTruckExp = isOwner ? allDrivers.map(d=>({
    driver: d,
    expenses: getStoredTruckExpenses(d.uid).filter(e=>filterExpDate(e.date)),
    total: getStoredTruckExpenses(d.uid).filter(e=>filterExpDate(e.date)).reduce((s,e)=>s+Number(e.amount||0),0)
  })).filter(d=>d.total>0) : [];
  const allDriverTruckTotal = allDriverTruckExp.reduce((s,d)=>s+d.total,0);

  const takeHome = netIncome - ownerExpTotal - allDriverTruckTotal;

  const byDay = {};
  myLoads.forEach(l=>{ if(l.date){ byDay[l.date]=byDay[l.date]||[]; byDay[l.date].push(l); }});
  const days = Object.keys(byDay).sort().reverse();
  const accent = isOwner ? "#f5a623" : "#3498db";

  const ExpRow = ({label, value, color="#2c2416", bold=false, indent=false}) => (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f0e8dc" }}>
      <span style={{ fontSize:12, color:"#8a7e70", paddingLeft:indent?16:0 }}>{label}</span>
      <span style={{ fontSize:bold?14:13, fontWeight:bold?"bold":"normal", color }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"#f5f0eb", zIndex:50, overflowY:"auto" }}>
      <div style={{ background:isOwner?"#2c2010":"#1a2535", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:51 }}>
        <button onClick={onClose} style={{ ...tBtn("#ffffff33","#fff"), padding:"8px 16px", fontSize:13, display:"flex", alignItems:"center", gap:6 }}>← Back</button>
        <div style={{ flex:1, textAlign:"center", color:"#fff", fontWeight:"bold", letterSpacing:2 }}>REPORT</div>
      </div>

      <div style={{ padding:"16px 16px 100px", maxWidth:820, margin:"0 auto" }}>
        <div style={{ ...card }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {[["today","Today"],["week","7 Days"],["month","30 Days"],["all","All Time"]].map(([v,l])=>(
              <button key={v} onClick={()=>setRange(v)}
                style={{ ...tBtn(range===v?accent:"#f5f0eb",range===v?"#fff":"#6a5e50"), fontSize:11, padding:"8px 12px" }}>{l}</button>
            ))}
          </div>
          {isOwner && allDrivers.length>0 && (
            <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
              <button onClick={()=>setDriverFilter("all")} style={{ ...tBtn(driverFilter==="all"?accent:"#f5f0eb",driverFilter==="all"?"#fff":"#6a5e50"), fontSize:11, padding:"6px 10px" }}>All</button>
              <button onClick={()=>setDriverFilter("owner")} style={{ ...tBtn(driverFilter==="owner"?accent:"#f5f0eb",driverFilter==="owner"?"#fff":"#6a5e50"), fontSize:11, padding:"6px 10px" }}>Me</button>
              {allDrivers.map(d=>(
                <button key={d.uid} onClick={()=>setDriverFilter(d.uid)}
                  style={{ ...tBtn(driverFilter===d.uid?accent:"#f5f0eb",driverFilter===d.uid?"#fff":"#6a5e50"), fontSize:11, padding:"6px 10px" }}>{d.name}</button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
          {[["LOADS",myLoads.length,"#2c2416"],["TOTAL WAIT",fmt(totalWait),"#f5a623"],
            isOwner?["GROSS",fmtC(grossIncome),"#27ae60"]:["MY PAY",fmtC(driverTotalPay),"#3498db"]
          ].map(([l,v,c])=>(
            <div key={l} style={{ ...card, textAlign:"center", padding:12 }}>
              <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:2 }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:"bold", color:c, marginTop:4 }}>{v}</div>
            </div>
          ))}
        </div>

        {isOwner && (
          <div style={{ ...card, background:"#fffcf7", border:"2px solid #f5a62333", marginBottom:12 }}>
            <div style={{ fontSize:11, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>FINANCIAL SUMMARY</div>
            <ExpRow label="Gross Income (loads)" value={fmtC(grossIncome)} color="#27ae60" bold/>
            <ExpRow label="  Load earnings" value={fmtC(totalEarn)} color="#27ae60" indent/>
            <ExpRow label="  Wait pay (company)" value={fmtC(waitPayCo)} color="#27ae60" indent/>
            <ExpRow label="Driver Pay" value={"-"+fmtC(totalDriverPay)} color="#e74c3c" bold/>
            <ExpRow label="Net (before expenses)" value={fmtC(netIncome)} color="#2c2416" bold/>

            {myLoads.length>0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:6 }}>LOAD DETAIL</div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
                    <thead>
                      <tr style={{ background:"#f5a62322" }}>
                        {["Date","Route","Driver","Billing","Earnings","Drv Pay","Wait"].map(h=>(
                          <th key={h} style={{ padding:"5px 7px", textAlign:"left", color:"#8a7e70", letterSpacing:1, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...myLoads].sort((a,b)=>b.date>a.date?1:-1).map((l,i)=>{
                        const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                        const lWaitPay=wm/60*(Number(rates.companyWaitRate)||0);
                        const billingLabel={per_load:"Load",per_cubic:"Cubic",per_hour:"Hour"}[l.billingMethod]||"Load";
                        return (
                          <tr key={l.id} style={{ background:i%2===0?"#fff":"#faf7f2" }}>
                            <td style={{ padding:"5px 7px", color:"#6a5e50", whiteSpace:"nowrap" }}>{l.date}</td>
                            <td style={{ padding:"5px 7px", color:"#2c2416", fontWeight:"bold", whiteSpace:"nowrap" }}>{l.location}</td>
                            <td style={{ padding:"5px 7px", color:"#3498db", whiteSpace:"nowrap" }}>{l.driverFullName||"—"}</td>
                            <td style={{ padding:"5px 7px", color:"#9b59b6", whiteSpace:"nowrap" }}>{billingLabel}</td>
                            <td style={{ padding:"5px 7px", color:"#27ae60", fontWeight:"bold" }}>{fmtC((Number(l.earnings)||0)+lWaitPay)}</td>
                            <td style={{ padding:"5px 7px", color:"#e74c3c" }}>{fmtC(l.driverBasePay||0)}</td>
                            <td style={{ padding:"5px 7px", color:"#f5a623" }}>{wm>0?fmt(wm):"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ marginTop:14, paddingTop:8, borderTop:"1px solid #f0e8dc" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:10, color:"#e74c3c", letterSpacing:2, fontWeight:"bold" }}>EXPENSES</div>
                <div style={{ display:"flex", gap:4 }}>
                  {[["today","Today"],["week","7d"],["month","30d"],["all","All"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setExpRange(v)}
                      style={{ ...tBtn(expRange===v?"#e74c3c":"#f0e8dc",expRange===v?"#fff":"#6a5e50"), fontSize:9, padding:"4px 7px" }}>{l}</button>
                  ))}
                </div>
              </div>
              {ownerExpRaw.length>0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, color:"#e74c3c", fontWeight:"bold", marginBottom:4 }}>MY EXPENSES</div>
                  {ownerExpRaw.map(e=>{
                    const cat=OWNER_EXPENSE_CATEGORIES.find(c=>c.id===e.category)||OWNER_EXPENSE_CATEGORIES[OWNER_EXPENSE_CATEGORIES.length-1];
                    return (
                      <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"4px 8px", background:"#fff5f5", borderRadius:4, marginBottom:3 }}>
                        <span style={{ fontSize:10, color:"#6a5e50" }}>{cat.icon} {e.merchant||cat.label} <span style={{ color:"#b5a898" }}>{e.date}</span></span>
                        <span style={{ fontSize:10, fontWeight:"bold", color:"#e74c3c" }}>{fmtC(e.amount)}</span>
                      </div>
                    );
                  })}
                  <ExpRow label="Owner Expenses Total" value={"-"+fmtC(ownerExpTotal)} color="#e74c3c" bold/>
                </div>
              )}
              {fuelFromLoads>0 && <ExpRow label="Fuel (from loads)" value={fmtC(fuelFromLoads)} color="#e67e22"/>}
              {allDriverTruckExp.map(d=>(
                <div key={d.driver.uid} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, color:"#e67e22", fontWeight:"bold", marginBottom:4 }}>🚛 {d.driver.fullName||d.driver.name} TRUCK EXPENSES</div>
                  {d.expenses.map(e=>{
                    const cat=OWNER_EXPENSE_CATEGORIES.find(c=>c.id===e.category)||OWNER_EXPENSE_CATEGORIES[OWNER_EXPENSE_CATEGORIES.length-1];
                    return (
                      <div key={e.id} style={{ display:"flex", justifyContent:"space-between", padding:"4px 8px", background:"#fff8f0", borderRadius:4, marginBottom:3 }}>
                        <span style={{ fontSize:10, color:"#6a5e50" }}>{cat.icon} {e.merchant||cat.label} <span style={{ color:"#b5a898" }}>{e.date}</span></span>
                        <span style={{ fontSize:10, fontWeight:"bold", color:"#e67e22" }}>{fmtC(e.amount)}</span>
                      </div>
                    );
                  })}
                  <ExpRow label={`${d.driver.fullName||d.driver.name} subtotal`} value={"-"+fmtC(d.total)} color="#e67e22" indent/>
                </div>
              ))}
              {allDriverTruckTotal>0 && <ExpRow label="Driver Truck Expenses Total" value={"-"+fmtC(allDriverTruckTotal)} color="#e67e22" bold/>}
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 16px", background:takeHome>=0?"#27ae6022":"#e74c3c22", borderRadius:8, marginTop:12 }}>
              <span style={{ fontSize:14, fontWeight:"bold", color:"#8a7e70" }}>TAKE-HOME</span>
              <span style={{ fontSize:24, fontWeight:"bold", color:takeHome>=0?"#2ecc71":"#e74c3c" }}>{fmtC(takeHome)}</span>
            </div>
          </div>
        )}

        {!isOwner && (
          <div style={{ ...card, background:"#f0f7ff", border:"2px solid #3498db33", marginBottom:12 }}>
            <div style={{ fontSize:11, color:"#3498db", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>MY PAY SUMMARY</div>
            <ExpRow label="Route Pay" value={fmtC(driverRoutePay)} color="#3498db"/>
            <ExpRow label="Wait Time Pay" value={fmtC(driverWaitPay)} color="#3498db"/>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px", background:"#3498db22", borderRadius:8, marginTop:10, marginBottom:14 }}>
              <span style={{ fontSize:13, fontWeight:"bold", color:"#8a7e70" }}>GROSS PAY</span>
              <span style={{ fontSize:22, fontWeight:"bold", color:"#3498db" }}>{fmtC(driverTotalPay)}</span>
            </div>
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:11, color:"#e74c3c", letterSpacing:2, fontWeight:"bold" }}>MY EXPENSES</div>
                <div style={{ display:"flex", gap:4 }}>
                  {[["today","Today"],["week","7d"],["month","30d"],["all","All"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setExpRange(v)}
                      style={{ ...tBtn(expRange===v?"#e74c3c":"#f0e8dc",expRange===v?"#fff":"#6a5e50"), fontSize:9, padding:"4px 7px" }}>{l}</button>
                  ))}
                </div>
              </div>
              {DRIVER_EXPENSE_CATEGORIES.map(c=>{ const t=driverPersonalExp.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount||0),0); return t>0?<ExpRow key={c.id} label={c.icon+" "+c.label} value={fmtC(t)} color="#e74c3c" indent/>:null; })}
              <ExpRow label="Total Expenses" value={"-"+fmtC(driverPersonalTotal)} color="#e74c3c" bold/>
            </div>
            {/* NET GOES HOME — prominent banner */}
            <div style={{ marginTop:12, borderRadius:10, overflow:"hidden" }}>
              <div style={{ background:"linear-gradient(135deg,#27ae60,#2ecc71)", padding:"10px 16px" }}>
                <div style={{ fontSize:10, color:"#fff9", letterSpacing:3, fontWeight:"bold" }}>💰 NET GOES HOME</div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px",
                background:(driverTotalPay-driverPersonalTotal)>=0?"#f0fff4":"#fff5f5",
                border:`2px solid ${(driverTotalPay-driverPersonalTotal)>=0?"#27ae6044":"#e74c3c44"}`,
                borderTop:"none" }}>
                <div style={{ fontSize:12, color:"#8a7e70" }}>After all expenses</div>
                <span style={{ fontSize:28, fontWeight:"bold", color:(driverTotalPay-driverPersonalTotal)>=0?"#2ecc71":"#e74c3c" }}>{fmtC(driverTotalPay-driverPersonalTotal)}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {[["summary","Summary"],["daily","By Day"],["table","Table"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{ ...tBtn(view===v?accent:"#f5f0eb",view===v?"#fff":"#6a5e50"), flex:1, fontSize:12 }}>{l}</button>
          ))}
        </div>

        {view==="daily" && days.map(day=>{
          const dayLoads=byDay[day];
          const dayFuel=isOwner?dayLoads.reduce((s,l)=>s+Number(l.fuelTotal||0),0):0;
          const dayVal=isOwner
            ? dayLoads.reduce((s,l)=>s+Number(l.earnings||0),0)
            : dayLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0)+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);
          return (
            <div key={day} style={{ ...card }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:"bold", color:"#2c2416" }}>{day}</div>
                <div style={{ display:"flex", gap:10 }}>
                  {dayFuel>0 && <div style={{ fontSize:11, color:"#e67e22" }}>fuel {fmtC(dayFuel)}</div>}
                  <div style={{ fontSize:13, color:accent, fontWeight:"bold" }}>{fmtC(dayVal)}</div>
                </div>
              </div>
              {dayLoads.map(l=>{
                const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                const waitEarnOwner  = wm/60*(Number(rates.companyWaitRate)||0);
                const waitEarnDriver = wm/60*(Number(rates.driverWaitRate)||0);
                return (
                  <div key={l.id} style={{ padding:"6px 0", borderBottom:"1px solid #f0e8dc", fontSize:12, color:"#6a5e50" }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span>{l.location}{isOwner&&l.driverFullName?` · ${l.driverFullName}`:""}</span>
                      <span style={{ color:accent, fontWeight:"bold" }}>
                        {isOwner ? fmtC((Number(l.earnings)||0)+waitEarnOwner) : fmtC((Number(l.driverBasePay)||0)+waitEarnDriver)}
                      </span>
                    </div>
                    <div style={{ fontSize:10, color:"#b5a898", marginTop:2 }}>
                      {isOwner
                        ? `Load ${fmtC(l.earnings||0)}${waitEarnOwner>0?` + Wait ${fmtC(waitEarnOwner)}`:""}`
                        : `Route ${fmtC(l.driverBasePay||0)}${waitEarnDriver>0?` + Wait ${fmtC(waitEarnDriver)}`:""}`
                      }
                      {isOwner && l.fuelTotal>0 ? `  ⛽ ${fmtC(l.fuelTotal)}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {view==="table" && (
          <div style={{ overflowX:"auto" }}>
            {isOwner ? (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:"#2c2010", color:"#fff" }}>
                    {["Date","Route","Driver","Billing","Load Earn","Wait Earn","Gross","Drv Pay","Fuel"].map(h=>(
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", letterSpacing:1, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...myLoads].sort((a,b)=>b.date>a.date?1:-1).map((l,i)=>{
                    const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                    const waitEarnOwner = wm/60*(Number(rates.companyWaitRate)||0);
                    const grossLoad = (Number(l.earnings)||0) + waitEarnOwner;
                    const billingShort = {per_load:"Load",per_cubic:"Cubic",per_hour:"Hour"}[l.billingMethod]||"Load";
                    return (
                      <tr key={l.id} style={{ background:i%2===0?"#fff":"#faf7f2" }}>
                        <td style={{ padding:"7px 10px", color:"#6a5e50", whiteSpace:"nowrap" }}>{l.date}</td>
                        <td style={{ padding:"7px 10px", color:"#2c2416", fontWeight:"bold", whiteSpace:"nowrap" }}>{l.location}</td>
                        <td style={{ padding:"7px 10px", color:"#3498db", whiteSpace:"nowrap" }}>{l.driverFullName||"—"}</td>
                        <td style={{ padding:"7px 10px", color:"#9b59b6" }}>{billingShort}</td>
                        <td style={{ padding:"7px 10px", color:"#27ae60", fontWeight:"bold" }}>{fmtC(l.earnings||0)}</td>
                        <td style={{ padding:"7px 10px", color:"#27ae60" }}>{waitEarnOwner>0?fmtC(waitEarnOwner):"—"}</td>
                        <td style={{ padding:"7px 10px", color:"#27ae60", fontWeight:"bold", borderLeft:"2px solid #f5a62333" }}>{fmtC(grossLoad)}</td>
                        <td style={{ padding:"7px 10px", color:"#e74c3c" }}>{fmtC(l.driverBasePay||0)}</td>
                        <td style={{ padding:"7px 10px", color:"#e67e22" }}>{l.fuelTotal?fmtC(l.fuelTotal):"—"}</td>
                      </tr>
                    );
                  })}
                  {myLoads.length>0 && (()=>{
                    const totLoadEarn = myLoads.reduce((s,l)=>s+Number(l.earnings||0),0);
                    const totWaitEarn = myLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
                    const totDrvPay   = myLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
                    const totFuel     = myLoads.reduce((s,l)=>s+Number(l.fuelTotal||0),0);
                    return (
                      <tr style={{ background:"#2c201022", fontWeight:"bold" }}>
                        <td colSpan={4} style={{ padding:"8px 10px", color:"#8a7e70", fontSize:10, letterSpacing:1 }}>TOTALS</td>
                        <td style={{ padding:"8px 10px", color:"#27ae60" }}>{fmtC(totLoadEarn)}</td>
                        <td style={{ padding:"8px 10px", color:"#27ae60" }}>{fmtC(totWaitEarn)}</td>
                        <td style={{ padding:"8px 10px", color:"#27ae60", borderLeft:"2px solid #f5a62333" }}>{fmtC(totLoadEarn+totWaitEarn)}</td>
                        <td style={{ padding:"8px 10px", color:"#e74c3c" }}>{fmtC(totDrvPay)}</td>
                        <td style={{ padding:"8px 10px", color:"#e67e22" }}>{totFuel>0?fmtC(totFuel):"—"}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:"#1a2535", color:"#fff" }}>
                    {["Date","Route","Per Load Pay","Wait Pay","Total Pay"].map(h=>(
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", letterSpacing:1, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...myLoads].sort((a,b)=>b.date>a.date?1:-1).map((l,i)=>{
                    const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                    const waitPay = wm/60*(Number(rates.driverWaitRate)||0);
                    const totalPay = (Number(l.driverBasePay)||0) + waitPay;
                    return (
                      <tr key={l.id} style={{ background:i%2===0?"#fff":"#f0f7ff" }}>
                        <td style={{ padding:"7px 10px", color:"#6a5e50", whiteSpace:"nowrap" }}>{l.date}</td>
                        <td style={{ padding:"7px 10px", color:"#2c2416", fontWeight:"bold", whiteSpace:"nowrap" }}>{l.location}</td>
                        <td style={{ padding:"7px 10px", color:"#3498db", fontWeight:"bold" }}>{fmtC(l.driverBasePay||0)}</td>
                        <td style={{ padding:"7px 10px", color:"#f5a623" }}>{waitPay>0?fmtC(waitPay):"—"}</td>
                        <td style={{ padding:"7px 10px", color:"#3498db", fontWeight:"bold", borderLeft:"2px solid #3498db33" }}>{fmtC(totalPay)}</td>
                      </tr>
                    );
                  })}
                  {myLoads.length>0 && (()=>{
                    const totRoute = myLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
                    const totWait  = myLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);
                    return (
                      <tr style={{ background:"#1a253522", fontWeight:"bold" }}>
                        <td colSpan={2} style={{ padding:"8px 10px", color:"#8a7e70", fontSize:10, letterSpacing:1 }}>TOTALS</td>
                        <td style={{ padding:"8px 10px", color:"#3498db" }}>{fmtC(totRoute)}</td>
                        <td style={{ padding:"8px 10px", color:"#f5a623" }}>{fmtC(totWait)}</td>
                        <td style={{ padding:"8px 10px", color:"#3498db", borderLeft:"2px solid #3498db33" }}>{fmtC(totRoute+totWait)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view==="summary" && (
          <div>
            {myLoads.length===0 ? (
              <div style={{ textAlign:"center", color:"#b5a898", padding:40 }}>No loads in this period</div>
            ) : [...myLoads].sort((a,b)=>b.date>a.date?1:-1).map(l=>{
              const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
              const loadWaitPayOwner = wm/60*(Number(rates.companyWaitRate)||0);
              const loadWaitPayDriver = wm/60*(Number(rates.driverWaitRate)||0);
              const loadDriverTotal = (Number(l.driverBasePay)||0) + loadWaitPayDriver;
              return (
                <div key={l.id} style={{ ...card }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <div style={{ fontWeight:"bold", color:"#2c2416" }}>{l.location}</div>
                    <div style={{ color:accent, fontWeight:"bold" }}>{isOwner?fmtC((Number(l.earnings)||0)+loadWaitPayOwner):fmtC(loadDriverTotal)}</div>
                  </div>
                  <div style={{ fontSize:11, color:"#9a8e80", marginTop:4 }}>{l.date}{l.driverFullName&&isOwner?` · ${l.driverFullName}`:""}</div>
                  <div style={{ display:"flex", gap:10, marginTop:4, flexWrap:"wrap" }}>
                    {isOwner && (
                      <>
                        <div style={{ fontSize:11, color:"#27ae60" }}>Load: {fmtC(l.earnings||0)}</div>
                        {loadWaitPayOwner>0 && <div style={{ fontSize:11, color:"#f5a623" }}>Wait: {fmtC(loadWaitPayOwner)}</div>}
                        {l.driverBasePay>0 && <div style={{ fontSize:11, color:"#3498db" }}>Driver: {fmtC(l.driverBasePay)}</div>}
                        {l.fuelTotal>0 && <div style={{ fontSize:11, color:"#e67e22" }}>Fuel: {fmtC(l.fuelTotal)}</div>}
                      </>
                    )}
                    {!isOwner && (
                      <>
                        <div style={{ fontSize:11, color:"#3498db" }}>Route: {fmtC(l.driverBasePay||0)}</div>
                        {loadWaitPayDriver>0 && <div style={{ fontSize:11, color:"#f5a623" }}>Wait: +{fmtC(loadWaitPayDriver)}</div>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drivers Panel ─────────────────────────────────────────────────────────────
function DriversPanel({ session, loads, rates }) {
  const [usersState, setUsersState] = useState(getUsers());
  const owner = usersState[session.uid];
  const drivers = Object.values(usersState).filter(u=>u.role==="driver" && u.ownerUid===session.uid);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (owner?.inviteCode) { navigator.clipboard.writeText(owner.inviteCode).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); }); }
  };

  const regenCode = () => {
    const users2 = getUsers();
    users2[session.uid].inviteCode = genInviteCode();
    saveUsers(users2);
    setUsersState({...users2});
  };

  return (
    <div style={{ padding:"16px 16px 20px" }}>
      <div style={{ ...card, background:"#fffcf7", border:"2px solid #f5a62333" }}>
        <div style={{ fontSize:11, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:12 }}>📋 YOUR INVITE CODE</div>
        <div style={{ fontSize:36, fontWeight:"bold", color:"#2c2416", textAlign:"center", letterSpacing:8, padding:"16px 0", background:"#f5a62311", borderRadius:8, marginBottom:12 }}>
          {owner?.inviteCode || "——"}
        </div>
        <div style={{ fontSize:11, color:"#9a8e80", textAlign:"center", marginBottom:12 }}>Share this code with your drivers when they register</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={copyCode} style={{ ...tBtn(copied?"#27ae60":"#f5a623"), flex:1, fontSize:12 }}>{copied?"✅ COPIED!":"📋 COPY CODE"}</button>
          <button onClick={regenCode} style={{ ...tBtn("#b5a898"), padding:"10px 14px", fontSize:12 }}>🔄</button>
        </div>
      </div>

      {drivers.length === 0 ? (
        <div style={{ textAlign:"center", color:"#b5a898", padding:40 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
          No drivers yet
        </div>
      ) : drivers.map(d=>{
        const dLoads = loads.filter(l=>l.assignedDriverUid===d.uid || l.addedBy===d.uid);
        const dRoutePay = dLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
        const dWaitPay  = dLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates?.driverWaitRate)||0),0);
        const dTotalPay = dRoutePay + dWaitPay;
        const dTruckExp = getStoredTruckExpenses(d.uid);
        const dTruckTotal = dTruckExp.reduce((s,e)=>s+Number(e.amount||0),0);
        return (
          <div key={d.uid} style={{ ...card }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:"bold", color:"#2c2416", fontSize:15 }}>👤 {d.fullName||d.name}</div>
                <div style={{ fontSize:11, color:"#9a8e80", marginTop:4 }}>{dLoads.length} load{dLoads.length!==1?"s":""}</div>
                <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                  <div style={{ background:"#3498db11", borderRadius:6, padding:"6px 10px" }}>
                    <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:1 }}>ROUTE PAY</div>
                    <div style={{ fontSize:14, fontWeight:"bold", color:"#3498db" }}>{fmtC(dRoutePay)}</div>
                  </div>
                  {dWaitPay>0 && (
                    <div style={{ background:"#f5a62311", borderRadius:6, padding:"6px 10px" }}>
                      <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:1 }}>WAIT PAY</div>
                      <div style={{ fontSize:14, fontWeight:"bold", color:"#f5a623" }}>{fmtC(dWaitPay)}</div>
                    </div>
                  )}
                  <div style={{ background:"#27ae6011", borderRadius:6, padding:"6px 10px" }}>
                    <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:1 }}>TOTAL PAY</div>
                    <div style={{ fontSize:14, fontWeight:"bold", color:"#27ae60" }}>{fmtC(dTotalPay)}</div>
                  </div>
                </div>
                {dTruckTotal>0 && (
                  <div style={{ marginTop:8, background:"#e67e2211", borderRadius:6, padding:"6px 10px", display:"inline-flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:9, color:"#9a8e80", letterSpacing:1 }}>🚛 TRUCK EXPENSES</span>
                    <span style={{ fontSize:13, fontWeight:"bold", color:"#e67e22" }}>{fmtC(dTruckTotal)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ session, rates, setRates, customRoutes, setCustomRoutes, trucks, setTrucks, onClose }) {
  const [localRates, setLocalRates] = useState({ ...DEFAULT_RATES, ...rates });
  const [localRoutes, setLocalRoutes] = useState(customRoutes.map(r=>({
    ...r, billingMethod: r.billingMethod||"per_load", rate: r.rate||0
  })));
  const [localTrucks, setLocalTrucks] = useState([...trucks]);
  const [section, setSection] = useState("billing");

  const [editRouteIdx, setEditRouteIdx] = useState(null);
  const [newRoute, setNewRoute] = useState({ from:"", to:"", pay:"", billingMethod:"per_load", rate:"" });
  const [addingRoute, setAddingRoute] = useState(false);

  const [newTruck, setNewTruck] = useState({ tmwNumber:"", truckNumber:"", trailerNumber:"", notes:"" });
  const [addingTruck, setAddingTruck] = useState(false);

  const lr = (key, val) => setLocalRates(r=>({...r,[key]:val}));

  const saveAll = () => {
    const r = { ...localRates };
    localStorage.setItem(ownerRatesKey(session.uid), JSON.stringify(r));
    setRates(r);
    localStorage.setItem(ownerCustomRoutesKey(session.uid), JSON.stringify(localRoutes));
    setCustomRoutes(localRoutes);
    localStorage.setItem(trucksKey(session.ownerUid), JSON.stringify(localTrucks));
    setTrucks(localTrucks);
    onClose();
  };

  const addRoute = () => {
    if (!newRoute.from.trim() || !newRoute.to.trim()) return;
    const route = { from:newRoute.from.trim(), to:newRoute.to.trim(), pay:Number(newRoute.pay)||0,
      billingMethod:newRoute.billingMethod||"per_load", rate:Number(newRoute.rate)||0 };
    setLocalRoutes(r=>[...r, route]);
    setNewRoute({ from:"", to:"", pay:"", billingMethod:"per_load", rate:"" });
    setAddingRoute(false);
  };

  const updateRoute = (idx, field, val) => {
    setLocalRoutes(rs => rs.map((r,i)=> i===idx ? {...r, [field]:val} : r));
  };

  const delRoute = (idx) => setLocalRoutes(rs=>rs.filter((_,i)=>i!==idx));

  const genTmwNumber = () => {
    const existing = localTrucks.map(t=>parseInt(t.tmwNumber)||0);
    const max = existing.length > 0 ? Math.max(...existing) : 1000;
    return (max + 1).toString();
  };

  const addTruck = () => {
    if (!newTruck.truckNumber.trim()) return;
    const tmw = newTruck.tmwNumber.trim() || genTmwNumber();
    setLocalTrucks(t=>[...t, { ...newTruck, tmwNumber: tmw, id: Date.now().toString() }]);
    setNewTruck({ tmwNumber:"", truckNumber:"", trailerNumber:"", notes:"" });
    setAddingTruck(false);
  };

  const delTruck = (id) => setLocalTrucks(ts=>ts.filter(t=>t.id!==id));

  const billingLabel = { per_load:"📦 Per Load", per_cubic:"📐 Per Cubic Yard", per_hour:"⏱ Per Hour" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:520, maxHeight:"93vh", overflowY:"auto", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"20px 20px 0", position:"sticky", top:0, background:"#fff", zIndex:2 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:16, fontWeight:"bold", color:"#2c2416" }}>⚙️ RATE SETTINGS</div>
            <button onClick={onClose} style={{ ...tBtn("#f5f0eb","#6a5e50"), padding:"6px 12px" }}>✕</button>
          </div>
          <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8 }}>
            {[["billing","💰 Billing"],["routes","🗺 Routes"],["wait","⏳ Wait Rates"],["trucks","🚛 Fleet"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSection(v)}
                style={{ ...tBtn(section===v?"#f5a623":"#f5f0eb", section===v?"#fff":"#6a5e50"), fontSize:11, padding:"8px 12px", whiteSpace:"nowrap", flexShrink:0 }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:"16px 20px", flex:1 }}>

          {section==="billing" && (
            <div>
              <div style={{ fontSize:12, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:12 }}>💰 DEFAULT BILLING METHOD</div>
              <div style={{ fontSize:11, color:"#9a8e80", marginBottom:12 }}>Used as fallback when a route has no specific billing set</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:8, marginBottom:16 }}>
                {[["per_load","📦 Per Load","Fixed rate per load"],["per_cubic","📐 Per Cubic Yard","Rate × cubic yards hauled"],["per_hour","⏱ Per Hour","Rate × hours worked"]].map(([v,l,d])=>(
                  <button key={v} onClick={()=>lr("billingMethod",v)}
                    style={{ ...tBtn(localRates.billingMethod===v?"#f5a623":"#f5f0eb", localRates.billingMethod===v?"#fff":"#6a5e50"),
                      textAlign:"left", padding:"12px 16px", borderRadius:8 }}>
                    <div style={{ fontSize:13 }}>{l}</div>
                    <div style={{ fontSize:10, opacity:0.8, marginTop:2 }}>{d}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginBottom:12 }}><label style={{ ...lbl, color:"#f5a623" }}>
                {billingLabel[localRates.billingMethod]} RATE ($)
              </label>
              <input type="number" step="0.01" value={localRates.billingMethod==="per_load"?localRates.perLoadRate:localRates.billingMethod==="per_cubic"?localRates.perCubicRate:localRates.perHourRate}
                onChange={e=>lr(localRates.billingMethod==="per_load"?"perLoadRate":localRates.billingMethod==="per_cubic"?"perCubicRate":"perHourRate", e.target.value)}
                placeholder="0.00" style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed" }}/>
              </div>
            </div>
          )}

          {section==="routes" && (
            <div>
              <div style={{ fontSize:12, color:"#9b59b6", letterSpacing:2, fontWeight:"bold", marginBottom:4 }}>🗺 ROUTE SETUP</div>
              <div style={{ fontSize:11, color:"#9a8e80", marginBottom:14 }}>Each route can have its own billing method and load rate. Driver pay is always separate.</div>

              {localRoutes.length===0 && (
                <div style={{ textAlign:"center", color:"#b5a898", padding:24, fontSize:12 }}>No custom routes yet. Add one below.</div>
              )}

              {localRoutes.map((r,idx)=>(
                <div key={idx} style={{ ...card, border:"1px solid #9b59b633", marginBottom:8 }}>
                  {editRouteIdx===idx ? (
                    <div>
                      <div style={{ fontSize:11, color:"#9b59b6", fontWeight:"bold", letterSpacing:2, marginBottom:10 }}>✏️ EDIT ROUTE</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>FROM</label>
                          <input value={r.from} onChange={e=>updateRoute(idx,"from",e.target.value)}
                            style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
                        <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>TO</label>
                          <input value={r.to} onChange={e=>updateRoute(idx,"to",e.target.value)}
                            style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>BILLING METHOD</label>
                        <select value={r.billingMethod||"per_load"} onChange={e=>updateRoute(idx,"billingMethod",e.target.value)}
                          style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed", fontSize:13 }}>
                          <option value="per_load">📦 Per Load</option>
                          <option value="per_cubic">📐 Per Cubic Yard</option>
                          <option value="per_hour">⏱ Per Hour</option>
                        </select>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                        <div><label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>
                          {r.billingMethod==="per_load"?"LOAD RATE ($)":r.billingMethod==="per_cubic"?"RATE PER YD³ ($)":"RATE PER HOUR ($)"}
                        </label>
                          <input type="number" step="0.01" value={r.rate||""} onChange={e=>updateRoute(idx,"rate",e.target.value)}
                            placeholder="0.00" style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed", fontSize:13 }}/></div>
                        <div><label style={{ ...lbl, color:"#27ae60", fontSize:10 }}>DRIVER PAY ($)</label>
                          <input type="number" step="0.01" value={r.pay||""} onChange={e=>updateRoute(idx,"pay",Number(e.target.value))}
                            placeholder="450" style={{ ...iSt, borderLeftColor:"#27ae60", background:"#f0fff4", fontSize:13 }}/></div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>setEditRouteIdx(null)} style={{ ...tBtn("#9b59b6"), flex:1, fontSize:12 }}>✅ SAVE</button>
                        <button onClick={()=>delRoute(idx)} style={{ ...tBtn("#e74c3c"), padding:"10px 14px", fontSize:12 }}>🗑</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontWeight:"bold", color:"#2c2416", fontSize:13 }}>{r.from} → {r.to}</div>
                        <div style={{ fontSize:11, color:"#9b59b6", marginTop:2 }}>{billingLabel[r.billingMethod||"per_load"]} · Rate: {fmtC(r.rate||0)}</div>
                        <div style={{ fontSize:11, color:"#27ae60" }}>Driver Pay: {fmtC(r.pay)}</div>
                      </div>
                      <button onClick={()=>setEditRouteIdx(idx)} style={{ ...tBtn("#f5f0eb","#6a5e50"), padding:"8px 12px", fontSize:12 }}>✏️</button>
                    </div>
                  )}
                </div>
              ))}

              {addingRoute ? (
                <div style={{ ...card, border:"2px solid #9b59b633" }}>
                  <div style={{ fontSize:11, color:"#9b59b6", fontWeight:"bold", letterSpacing:2, marginBottom:10 }}>➕ NEW ROUTE</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                    <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>FROM</label>
                      <input value={newRoute.from} onChange={e=>setNewRoute(r=>({...r,from:e.target.value}))}
                        placeholder="e.g. CNRL" style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
                    <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>TO</label>
                      <input value={newRoute.to} onChange={e=>setNewRoute(r=>({...r,to:e.target.value}))}
                        placeholder="e.g. Heartland" style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>BILLING METHOD</label>
                    <select value={newRoute.billingMethod} onChange={e=>setNewRoute(r=>({...r,billingMethod:e.target.value}))}
                      style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed", fontSize:13 }}>
                      <option value="per_load">📦 Per Load</option>
                      <option value="per_cubic">📐 Per Cubic Yard</option>
                      <option value="per_hour">⏱ Per Hour</option>
                    </select>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                    <div><label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>
                      {newRoute.billingMethod==="per_load"?"LOAD RATE ($)":newRoute.billingMethod==="per_cubic"?"RATE PER YD³ ($)":"RATE PER HOUR ($)"}
                    </label>
                      <input type="number" step="0.01" value={newRoute.rate} onChange={e=>setNewRoute(r=>({...r,rate:e.target.value}))}
                        placeholder="0.00" style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed", fontSize:13 }}/></div>
                    <div><label style={{ ...lbl, color:"#27ae60", fontSize:10 }}>DRIVER PAY ($)</label>
                      <input type="number" step="0.01" value={newRoute.pay} onChange={e=>setNewRoute(r=>({...r,pay:e.target.value}))}
                        placeholder="450" style={{ ...iSt, borderLeftColor:"#27ae60", background:"#f0fff4", fontSize:13 }}/></div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addRoute} style={{ ...tBtn("#9b59b6"), flex:1, fontSize:12 }}>✅ ADD ROUTE</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setAddingRoute(true)} style={{ ...tBtn("#9b59b6"), width:"100%", marginTop:4 }}>➕ ADD NEW ROUTE</button>
              )}
            </div>
          )}

          {section==="wait" && (
            <div>
              <div style={{ fontSize:12, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:16 }}>⏳ WAIT TIME RATES</div>
              <div style={{ marginBottom:14 }}>
                <label style={{ ...lbl, color:"#f5a623" }}>🏢 COMPANY WAIT RATE ($/hr)</label>
                <input type="number" step="0.5" value={localRates.companyWaitRate} onChange={e=>lr("companyWaitRate",e.target.value)}
                  style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed" }}/>
                <div style={{ fontSize:10, color:"#9a8e80", marginTop:4 }}>What you charge the company per hour of waiting</div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ ...lbl, color:"#3498db" }}>👤 DRIVER WAIT RATE ($/hr)</label>
                <input type="number" step="0.5" value={localRates.driverWaitRate} onChange={e=>lr("driverWaitRate",e.target.value)}
                  style={{ ...iSt, borderLeftColor:"#3498db", background:"#f0f7ff" }}/>
                <div style={{ fontSize:10, color:"#9a8e80", marginTop:4 }}>What you pay the driver per hour of waiting</div>
              </div>
            </div>
          )}

          {section==="trucks" && (
            <div>
              <div style={{ fontSize:12, color:"#e67e22", letterSpacing:2, fontWeight:"bold", marginBottom:4 }}>🚛 FLEET MANAGEMENT</div>
              <div style={{ fontSize:11, color:"#9a8e80", marginBottom:14 }}>Drivers will select from this list when logging loads.</div>

              {localTrucks.length===0 && (
                <div style={{ textAlign:"center", color:"#b5a898", padding:24, fontSize:12 }}>No trucks added yet.</div>
              )}

              {localTrucks.map((t)=>(
                <div key={t.id} style={{ ...card, border:"1px solid #e67e2233", marginBottom:10 }}>
                  <div style={{ fontSize:11, color:"#e67e22", fontWeight:"bold", letterSpacing:2, marginBottom:10 }}>🚛 TRUCK</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                    <div>
                      <label style={{ ...lbl, color:"#e67e22", fontSize:10 }}>TMW # (DISPATCH)</label>
                      <input value={t.tmwNumber} onChange={e=>setLocalTrucks(ts=>ts.map(x=>x.id===t.id?{...x,tmwNumber:e.target.value}:x))}
                        placeholder="e.g. 1042" style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff8f0", fontSize:13 }}/>
                    </div>
                    <div>
                      <label style={{ ...lbl, color:"#e67e22", fontSize:10 }}>TRUCK NUMBER</label>
                      <input value={t.truckNumber} onChange={e=>setLocalTrucks(ts=>ts.map(x=>x.id===t.id?{...x,truckNumber:e.target.value}:x))}
                        placeholder="e.g. T-17" style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff8f0", fontSize:13 }}/>
                    </div>
                    <div>
                      <label style={{ ...lbl, color:"#9a8e80", fontSize:10 }}>DEFAULT TRAILER #</label>
                      <input value={t.trailerNumber} onChange={e=>setLocalTrucks(ts=>ts.map(x=>x.id===t.id?{...x,trailerNumber:e.target.value}:x))}
                        placeholder="Optional" style={{ ...iSt, borderLeftColor:"#9a8e80", fontSize:13 }}/>
                    </div>
                    <div>
                      <label style={{ ...lbl, color:"#9a8e80", fontSize:10 }}>NOTES</label>
                      <input value={t.notes} onChange={e=>setLocalTrucks(ts=>ts.map(x=>x.id===t.id?{...x,notes:e.target.value}:x))}
                        placeholder="Optional" style={{ ...iSt, borderLeftColor:"#9a8e80", fontSize:13 }}/>
                    </div>
                  </div>
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <button onClick={()=>delTruck(t.id)} style={{ ...tBtn("#e74c3c11","#e74c3c"), padding:"6px 12px", fontSize:11 }}>🗑 Remove</button>
                  </div>
                </div>
              ))}

              {addingTruck ? (
                <div style={{ ...card, border:"2px solid #e67e2233" }}>
                  <div style={{ fontSize:11, color:"#e67e22", fontWeight:"bold", letterSpacing:2, marginBottom:12 }}>➕ NEW TRUCK</div>
                  <div style={{ background:"#fff8f0", border:"1px solid #e67e2244", borderRadius:8, padding:"10px 14px", marginBottom:10 }}>
                    <div style={{ fontSize:10, color:"#9a8e80", letterSpacing:2, marginBottom:4 }}>TMW # (AUTO-GENERATED)</div>
                    <div style={{ fontSize:20, fontWeight:"bold", color:"#e67e22", letterSpacing:3 }}>{genTmwNumber()}</div>
                    <div style={{ fontSize:10, color:"#9a8e80", marginTop:4 }}>Or enter a custom TMW # below (optional)</div>
                    <input value={newTruck.tmwNumber} onChange={e=>setNewTruck(t=>({...t,tmwNumber:e.target.value}))}
                      placeholder="Custom TMW # (leave blank for auto)" style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff", fontSize:13, marginTop:8 }}/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                    <div>
                      <label style={{ ...lbl, color:"#e67e22", fontSize:10 }}>TRUCK NUMBER *</label>
                      <input value={newTruck.truckNumber} onChange={e=>setNewTruck(t=>({...t,truckNumber:e.target.value}))}
                        placeholder="e.g. T-17" style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff8f0", fontSize:13 }}/>
                    </div>
                    <div>
                      <label style={{ ...lbl, color:"#9a8e80", fontSize:10 }}>DEFAULT TRAILER #</label>
                      <input value={newTruck.trailerNumber} onChange={e=>setNewTruck(t=>({...t,trailerNumber:e.target.value}))}
                        placeholder="Optional" style={{ ...iSt, borderLeftColor:"#9a8e80", fontSize:13 }}/>
                    </div>
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <label style={{ ...lbl, color:"#9a8e80", fontSize:10 }}>NOTES</label>
                    <input value={newTruck.notes} onChange={e=>setNewTruck(t=>({...t,notes:e.target.value}))}
                      placeholder="Optional" style={{ ...iSt, borderLeftColor:"#9a8e80", fontSize:13 }}/>
                  </div>
                  <button onClick={addTruck} style={{ ...tBtn("#e67e22"), width:"100%", fontSize:12 }}>✅ ADD TRUCK</button>
                </div>
              ) : (
                <button onClick={()=>setAddingTruck(true)} style={{ ...tBtn("#e67e22"), width:"100%", marginTop:4 }}>➕ ADD TRUCK</button>
              )}
            </div>
          )}
        </div>

        <div style={{ padding:"16px 20px", borderTop:"1px solid #f0e8dc", background:"#fff", position:"sticky", bottom:0 }}>
          <button onClick={saveAll} style={{ ...tBtn("#f5a623"), width:"100%", padding:14, fontSize:15 }}>💾 SAVE ALL SETTINGS</button>
          <DangerZone onClose={onClose}/>
        </div>
      </div>
    </div>
  );
}

// ── Danger Zone ───────────────────────────────────────────────────────────────
function DangerZone({ onClose }) {
  const [step, setStep] = useState(0); // 0=hidden, 1=confirm, 2=type confirm

  const deleteAll = () => {
    Object.keys(localStorage).filter(k => k.startsWith("truck-")).forEach(k => localStorage.removeItem(k));
    onClose();
    window.location.reload();
  };

  return (
    <div style={{ marginTop:12 }}>
      {step === 0 && (
        <button onClick={()=>setStep(1)}
          style={{ ...tBtn("#e74c3c11","#e74c3c"), width:"100%", padding:"10px", fontSize:12, border:"1px solid #e74c3c44" }}>
          🗑 Delete All Accounts & Data
        </button>
      )}

      {step === 1 && (
        <div style={{ background:"#fff5f5", border:"2px solid #e74c3c44", borderRadius:10, padding:14 }}>
          <div style={{ fontSize:13, fontWeight:"bold", color:"#e74c3c", marginBottom:6 }}>⚠️ Delete Everything?</div>
          <div style={{ fontSize:12, color:"#6a5e50", marginBottom:12 }}>
            This will permanently delete <strong>all accounts</strong> (owners + drivers), all loads, routes, trucks, and expenses. This cannot be undone.
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setStep(2)} style={{ ...tBtn("#e74c3c"), flex:1, fontSize:12 }}>Yes, delete all</button>
            <button onClick={()=>setStep(0)} style={{ ...tBtn("#b5a898"), flex:1, fontSize:12 }}>Cancel</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ background:"#fff0f0", border:"2px solid #e74c3c", borderRadius:10, padding:14 }}>
          <div style={{ fontSize:13, fontWeight:"bold", color:"#e74c3c", marginBottom:8 }}>Type DELETE to confirm</div>
          <input
            autoFocus
            placeholder="Type DELETE"
            style={{ ...iSt, borderLeftColor:"#e74c3c", background:"#fff", marginBottom:10, textTransform:"uppercase" }}
            onChange={e => { if (e.target.value.trim().toUpperCase() === "DELETE") deleteAll(); }}
          />
          <button onClick={()=>setStep(0)} style={{ ...tBtn("#b5a898"), width:"100%", fontSize:12 }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Receipt Scanner ───────────────────────────────────────────────────────────
function ReceiptScanner({ onResult }) {
  const [scanning, setScanning] = useState(false);
  const [preview,  setPreview]  = useState(null);
  const [status,   setStatus]   = useState(""); // "scanning" | "done" | "error"
  const [extracted, setExtracted] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);
      setScanning(true);
      setStatus("scanning");
      setExtracted(null);
      try {
        const base64 = dataUrl.split(",")[1];
        const mediaType = file.type || "image/jpeg";
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({
            model:"claude-sonnet-4-20250514",
            max_tokens:400,
            messages:[{
              role:"user",
              content:[
                { type:"image", source:{ type:"base64", media_type:mediaType, data:base64 } },
                { type:"text", text:`This is a fuel receipt. Extract ONLY these values in JSON format with no extra text or markdown:
{"litres": <number or null>, "pricePerLitre": <number or null>, "total": <number or null>}
Look for: litres/liters/L filled, price per litre/liter, and total amount paid. Return null for any value you cannot find.` }
              ]
            }]
          })
        });
        const data = await response.json();
        const raw = (data.content||[]).map(b=>b.text||"").join("").trim();
        const clean = raw.replace(/```json|```/g,"").trim();
        const parsed = JSON.parse(clean);
        setExtracted(parsed);
        setStatus("done");
      } catch(e) {
        setStatus("error");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const apply = () => {
    if (extracted) { onResult(extracted); setExtracted(null); setPreview(null); setStatus(""); }
  };

  const reset = () => { setPreview(null); setStatus(""); setExtracted(null); };

  return (
    <div style={{ marginBottom:16 }}>
      {/* Scan button */}
      {!preview && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
          <button onClick={()=>fileRef.current?.click()}
            style={{ ...tBtn("#e67e22"), width:"100%", padding:"12px 16px", borderRadius:10,
              fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              boxShadow:"0 4px 14px #e67e2233" }}>
            <span style={{ fontSize:20 }}>📷</span>
            <span style={{ letterSpacing:1 }}>SCAN FUEL RECEIPT</span>
          </button>
          <div style={{ fontSize:10, color:"#9a8e80", textAlign:"center", marginTop:6 }}>
            AI reads litres, price/L and total automatically
          </div>
        </div>
      )}

      {/* Preview + status */}
      {preview && (
        <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"2px solid #e67e2244", marginBottom:2 }}>
          <img src={preview} alt="receipt" style={{ width:"100%", maxHeight:200, objectFit:"contain", background:"#f5f5f5" }}/>

          {status==="scanning" && (
            <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:20, height:20, border:"2px solid #e67e22", borderTopColor:"transparent",
                borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
              <span style={{ fontSize:12, color:"#e67e22", fontWeight:"bold" }}>Reading receipt…</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {status==="done" && extracted && (
            <div style={{ padding:"14px 16px" }}>
              <div style={{ fontSize:11, color:"#27ae60", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>✅ EXTRACTED FROM RECEIPT</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                {[["Litres", extracted.litres, "L"],["Price/L", extracted.pricePerLitre, "$"],["Total", extracted.total, "$"]].map(([label,val,unit])=>(
                  <div key={label} style={{ background:"#f0fff4", borderRadius:8, padding:"8px 10px", border:"1px solid #27ae6033", textAlign:"center" }}>
                    <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:1, marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:"bold", color:"#27ae60" }}>
                      {val!=null ? (unit==="$" ? `$${Number(val).toFixed(3==="Price/L"?3:2)}` : `${val}${unit}`) : "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={apply} style={{ ...tBtn("#27ae60"), flex:1, fontSize:12 }}>✅ USE THESE VALUES</button>
                <button onClick={reset} style={{ ...tBtn("#b5a898"), padding:"10px 14px", fontSize:12 }}>✕</button>
              </div>
            </div>
          )}

          {status==="error" && (
            <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:"#e74c3c" }}>❌ Could not read receipt. Enter manually.</span>
              <button onClick={reset} style={{ ...tBtn("#b5a898"), padding:"6px 10px", fontSize:11 }}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Load Form ─────────────────────────────────────────────────────────────────
function LoadForm({ session, isOwner, rates, allRoutes, customRoutes, setCustomRoutes, trucks, onSave, editLoad, onCancel }) {
  const blank = { date:todayStr(), time:"", appointmentTime:"", calledInTime:"", loadCompletedDate:"", loadCompletedTime:"",
    location:"", loadWaitMins:"", offloadWaitMins:"", earnings:"", driverBasePay:"", assignedDriverUid:"",
    cubicYards:"", hoursWorked:"", billingMethod:rates.billingMethod||"per_load", fuelLitres:"", fuelPricePerLitre:"", fuelTotal:"",
    note:"", truckId:"", trailerNumber:"", driverFullName:"", tmwLoadNumber:"" };

  const [form, setForm]           = useState(editLoad ? { ...blank, ...editLoad } : blank);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [newFrom, setNewFrom]     = useState("");
  const [newTo, setNewTo]         = useState("");
  const [newPay, setNewPay]       = useState("");
  const [routeMsg, setRouteMsg]   = useState("");

  // Timer state
  const [loadStatus,  setLoadStatus]  = useState(null);
  const [offStatus,   setOffStatus]   = useState(null);
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [offElapsed,  setOffElapsed]  = useState(0);
  const loadRef = useRef(null), loadStart = useRef(0);
  const offRef  = useRef(null), offStart  = useRef(0);

  const startTimer=(key)=>{ if(key==="load"){ loadStart.current=Date.now()-loadElapsed*1000; setLoadStatus("running"); loadRef.current=setInterval(()=>setLoadElapsed(Math.floor((Date.now()-loadStart.current)/1000)),1000); } else { offStart.current=Date.now()-offElapsed*1000; setOffStatus("running"); offRef.current=setInterval(()=>setOffElapsed(Math.floor((Date.now()-offStart.current)/1000)),1000); }};
  const stopTimer=(key)=>{ if(key==="load"){ clearInterval(loadRef.current); setLoadStatus("stopped"); setForm(f=>({...f,loadWaitMins:Math.floor(loadElapsed/60).toString()})); } else { clearInterval(offRef.current); setOffStatus("stopped"); setForm(f=>({...f,offloadWaitMins:Math.floor(offElapsed/60).toString()})); }};
  const resetTimer=(key)=>{ if(key==="load"){ clearInterval(loadRef.current); setLoadStatus(null); setLoadElapsed(0); } else { clearInterval(offRef.current); setOffStatus(null); setOffElapsed(0); }};
  useEffect(()=>()=>{ clearInterval(loadRef.current); clearInterval(offRef.current); },[]);

  const users  = getUsers();
  const ownerUid = session.ownerUid || session.uid;
  const drivers  = Object.values(users).filter(u=>u.role==="driver" && u.ownerUid===ownerUid);

  // Auto-select first truck if only one exists and none selected
  useEffect(()=>{
    if (!form.truckId && trucks.length === 1) {
      handleTruckSelect(trucks[0].id);
    }
  // eslint-disable-next-line
  }, [trucks.length]);

  const hc = (e) => setForm(f=>({...f, [e.target.name]:e.target.value}));

  const getRouteData = (locationStr) => allRoutes.find(r=>`${r.from} → ${r.to}`===locationStr);

  const handleRouteSelect = (val) => {
    if (val==="__custom__") { setShowAddRoute(true); return; }
    if (val==="") { setForm(f=>({...f, location:"", driverBasePay:"", earnings:"", billingMethod:"per_load"})); return; }
    const routeData = getRouteData(val);
    if (routeData) {
      const method = routeData.billingMethod || rates.billingMethod || "per_load";
      const routeRate = Number(routeData.rate)||0;
      let autoEarnings = "";
      if (method === "per_load" && routeRate > 0) autoEarnings = routeRate.toString();
      setForm(f=>({...f, location:val, driverBasePay:routeData.pay.toString(), earnings:autoEarnings, billingMethod:method, cubicYards:"", hoursWorked:""}));
    } else {
      setForm(f=>({...f, location:val}));
    }
  };

  const handleAddCustomRoute = () => {
    if (!newFrom.trim()||!newTo.trim()) return setRouteMsg("Enter both From and To");
    const key = ownerCustomRoutesKey(ownerUid);
    const existing = getStoredCustomRoutes(key);
    const route = { from:newFrom.trim(), to:newTo.trim(), pay:Number(newPay)||0, billingMethod:"per_load", rate:0 };
    const updated = [...existing, route];
    localStorage.setItem(key, JSON.stringify(updated));
    setCustomRoutes(updated);
    setForm(f=>({...f, location:`${route.from} → ${route.to}`, driverBasePay:route.pay.toString()}));
    setShowAddRoute(false); setNewFrom(""); setNewTo(""); setNewPay(""); setRouteMsg("");
  };

  const handleTruckSelect = (truckId) => {
    const truck = trucks.find(t=>t.id===truckId);
    setForm(f=>({...f, truckId, trailerNumber: truck?.trailerNumber||f.trailerNumber}));
  };

  const submit = () => {
    if (!form.location) return;
    const method = form.billingMethod || rates.billingMethod || "per_load";
    let finalEarnings = Number(form.earnings)||0;
    if (method==="per_cubic" && form.cubicYards) {
      const routeData = getRouteData(form.location);
      const rate = routeData?.rate ? Number(routeData.rate) : Number(rates.perCubicRate)||0;
      finalEarnings = (Number(form.cubicYards)||0)*rate;
    } else if (method==="per_hour" && form.hoursWorked) {
      const routeData = getRouteData(form.location);
      const rate = routeData?.rate ? Number(routeData.rate) : Number(rates.perHourRate)||0;
      finalEarnings = (Number(form.hoursWorked)||0)*rate;
    } else if (method==="per_load" && !finalEarnings) {
      const routeData = getRouteData(form.location);
      finalEarnings = routeData?.rate ? Number(routeData.rate) : Number(rates.perLoadRate)||0;
    }
    let driverFullName = form.driverFullName || "";
    if (!isOwner) {
      driverFullName = session.fullName || session.name;
    } else if (form.assignedDriverUid) {
      const allU = getUsers();
      const drv = allU[form.assignedDriverUid];
      driverFullName = drv ? (drv.fullName||drv.name) : "";
    }
    const load = { ...form, earnings:finalEarnings, billingMethod:method, driverFullName,
      id: editLoad?.id || Date.now().toString(), addedBy: session.uid };
    onSave(load);
  };

  const routeData  = getRouteData(form.location);
  const method     = form.billingMethod || rates.billingMethod || "per_load";
  const routeRate  = routeData?.rate ? Number(routeData.rate) : (method==="per_load"?Number(rates.perLoadRate):method==="per_cubic"?Number(rates.perCubicRate):Number(rates.perHourRate))||0;
  const waitMins   = (Number(form.loadWaitMins)||0)+(Number(form.offloadWaitMins)||0);
  const waitHrs    = waitMins/60;
  const cRate      = Number(rates.companyWaitRate)||0;
  const dRate      = Number(rates.driverWaitRate)||0;
  const wComp      = parseFloat((waitHrs*cRate).toFixed(2));
  const wDrv       = parseFloat((waitHrs*dRate).toFixed(2));
  const basePay    = Number(form.driverBasePay)||0;
  const curEarnings= Number(form.earnings)||0;
  const gross      = parseFloat((curEarnings+wComp).toFixed(2));
  const dPay       = parseFloat((basePay+wDrv).toFixed(2));
  const net        = parseFloat((gross-dPay).toFixed(2));

  const selectedTruck = trucks.find(t=>t.id===form.truckId);

  const [formTab, setFormTab] = useState("load");

  // Auto-generate TMW load number if new load
  useEffect(()=>{
    if (!editLoad) {
      const seqKey = `truck-load-seq-${ownerUid}`;
      const last = parseInt(localStorage.getItem(seqKey)||"1000", 10);
      const next = last + 1;
      localStorage.setItem(seqKey, next.toString());
      setForm(f=>({...f, tmwLoadNumber: next.toString()}));
    }
  // eslint-disable-next-line
  }, []);

  return (
    <div style={{ padding:"0 0 20px" }}>

      {/* Sub-tab switcher */}
      <div style={{ display:"flex", background: isOwner?"#3a2c18":"#1e2d40", borderBottom:`2px solid ${isOwner?"#f5a623":"#3498db"}33` }}>
        {[["load","📋","LOAD INFO"],["fuel","⛽","FUEL LOG"]].map(([t,icon,label])=>(
          <button key={t} onClick={()=>setFormTab(t)}
            style={{ flex:1, padding:"11px 4px 9px", border:"none",
              background:formTab===t?(isOwner?"#f5a62322":"#3498db22"):"transparent",
              color:formTab===t?(isOwner?"#f5a623":"#3498db"):"#9a8e80",
              fontWeight:formTab===t?"bold":"normal", fontSize:11, cursor:"pointer",
              borderBottom:formTab===t?`2px solid ${isOwner?"#f5a623":"#3498db"}`:"2px solid transparent" }}>
            <span style={{ fontSize:17 }}>{icon}</span>
            <span style={{ marginLeft:6, letterSpacing:1 }}>{label}</span>
          </button>
        ))}
      </div>

      {formTab === "load" && (
      <div style={{ padding:"16px 16px 20px" }}>
      <div>

        {/* ── TMW / LOAD NUMBER — auto-generated ── */}
        <div style={{ background:"linear-gradient(135deg,#1a2535,#2c3e50)", borderRadius:12, padding:"14px 16px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:10, color:"#f5a62388", letterSpacing:3, fontWeight:"bold", marginBottom:4 }}>📋 LOAD / TMW NUMBER</div>
            <div style={{ fontSize:28, fontWeight:"bold", color:"#f5a623", letterSpacing:4 }}>
              {form.tmwLoadNumber || "—"}
            </div>
          </div>
          <div style={{ background:"#f5a62322", borderRadius:8, padding:"6px 12px", textAlign:"right" }}>
            <div style={{ fontSize:9, color:"#f5a62388", letterSpacing:2 }}>AUTO</div>
            <div style={{ fontSize:10, color:"#f5a623", fontWeight:"bold" }}>GENERATED</div>
          </div>
        </div>

        {/* Driver assignment (owner only) */}
        {isOwner && drivers.length>0 && (
          <div style={{ marginBottom:14, background:"#fffcf7", border:"2px solid #f5a62333", borderRadius:8, padding:"12px 16px" }}>
            <label style={{ ...lbl, color:"#f5a623", fontSize:12 }}>👤 ASSIGN TO DRIVER</label>
            <select name="assignedDriverUid" value={form.assignedDriverUid} onChange={hc}
              style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed" }}>
              <option value="">— Owner Operator (self) —</option>
              {drivers.map(d=><option key={d.uid} value={d.uid}>{d.fullName||d.name}</option>)}
            </select>
          </div>
        )}

        {/* Date & Times */}
        <div style={{ background:"#fff", border:"1px solid #e0d8d0", borderRadius:10, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:11, color:"#9a8e80", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>📅 DATE & TIMES</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div><label style={{ ...lbl, color:"#3498db", fontSize:10 }}>DATE</label>
              <input name="date" type="date" value={form.date} onChange={hc} style={{ ...iSt, borderLeftColor:"#3498db", background:"#f0f7ff", fontSize:13 }}/></div>
            <div><label style={{ ...lbl, color:"#3498db", fontSize:10 }}>ARRIVAL TIME</label>
              <input name="time" type="time" value={form.time} onChange={hc} style={{ ...iSt, borderLeftColor:"#3498db", background:"#f0f7ff", fontSize:13 }}/></div>
            <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>APPT TIME</label>
              <input name="appointmentTime" type="time" value={form.appointmentTime} onChange={hc} style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
            <div><label style={{ ...lbl, color:"#9b59b6", fontSize:10 }}>CALLED IN</label>
              <input name="calledInTime" type="time" value={form.calledInTime} onChange={hc} style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", fontSize:13 }}/></div>
          </div>
        </div>

        {/* ── ROUTE SELECT ── */}
        <div style={{ background:"#fffcf7", border:"1px solid #9b59b644", borderRadius:8, padding:16, marginBottom:12 }}>
          <label style={{ ...lbl, color:"#9b59b6", fontSize:12 }}>📍 SELECT ROUTE</label>
          {allRoutes.length===0 ? (
            <div style={{ background:"#f8f0ff", borderRadius:6, padding:"12px 14px", fontSize:12, color:"#9b59b6", textAlign:"center" }}>
              {isOwner
                ? "No routes set yet. Go to ⚙️ Settings → 🗺 Routes to add your routes."
                : "No routes available. Your owner operator needs to add routes in Settings."}
            </div>
          ) : (
            <div>
              <select
                value={allRoutes.find(r=>`${r.from} → ${r.to}`===form.location) ? form.location : (form.location?"__manual__":"")}
                onChange={e=>handleRouteSelect(e.target.value)}
                style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff", color:form.location?"#9b59b6":"#a09488", marginBottom:10 }}>
                <option value="">— Select a route —</option>
                {/* ── FIX: drivers only see route names, owners see full detail including driver pay ── */}
                {allRoutes.map((r,i)=>(
                  <option key={i} value={`${r.from} → ${r.to}`}>
                    {isOwner
                      ? `${r.from} → ${r.to}  (Driver Pay ${fmtC(r.pay)})`
                      : `${r.from} → ${r.to}`}
                  </option>
                ))}
                {isOwner && <option value="__custom__">➕ Add New Route...</option>}
              </select>

              {/* Route detail card — drivers see only their pay, owners see billing info */}
              {form.location && routeData && (
                <div style={{ background:"#f8f0ff", borderRadius:6, padding:"10px 14px", fontSize:12 }}>
                  <div style={{ color:"#9b59b6", fontWeight:"bold", marginBottom:4 }}>Route Details</div>
                  {/* Owner sees billing method; driver does NOT */}
                  {isOwner && (
                    <div style={{ color:"#6a5e50" }}>
                      Billing: <strong>{ {per_load:"Per Load", per_cubic:"Per Cubic Yard", per_hour:"Per Hour"}[routeData.billingMethod] || routeData.billingMethod }</strong>
                    </div>
                  )}
                  {/* Driver sees only their pay */}
                  {!isOwner && (
                    <div style={{ color:"#27ae60", marginTop:4 }}>✔ Your Pay: <strong>{fmtC(routeData.pay)}</strong></div>
                  )}
                </div>
              )}

              {showAddRoute && isOwner && (
                <div style={{ marginTop:12, background:"#faf7f2", border:"2px solid #9b59b633", borderRadius:8, padding:14 }}>
                  <div style={{ fontSize:12, color:"#9b59b6", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>➕ ADD NEW ROUTE</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <div><label style={{ ...lbl, color:"#9b59b6" }}>FROM</label>
                      <input value={newFrom} onChange={e=>setNewFrom(e.target.value)} placeholder="e.g. Suncor"
                        style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff" }}/></div>
                    <div><label style={{ ...lbl, color:"#9b59b6" }}>TO</label>
                      <input value={newTo} onChange={e=>setNewTo(e.target.value)} placeholder="e.g. Heartland"
                        style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#f8f0ff" }}/></div>
                  </div>
                  <div style={{ marginBottom:10 }}><label style={{ ...lbl, color:"#27ae60" }}>💵 DRIVER PAY ($)</label>
                    <input type="number" value={newPay} onChange={e=>setNewPay(e.target.value)} placeholder="450"
                      style={{ ...iSt, borderLeftColor:"#27ae60", background:"#f0fff4" }}/></div>
                  {routeMsg && <div style={{ fontSize:12, color:"#e74c3c", marginBottom:8 }}>⚠ {routeMsg}</div>}
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={handleAddCustomRoute} style={{ ...tBtn("#9b59b6","#fff"), flex:1, padding:"8px" }}>✔ ADD ROUTE</button>
                    <button onClick={()=>{setShowAddRoute(false);setRouteMsg("");}} style={{ ...tBtn("#b5a898"), padding:"8px 12px" }}>CANCEL</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Truck Selector */}
        {trucks.length > 0 && (
          <div style={{ background:"#fffcf7", border:"1px solid #e67e2244", borderRadius:8, padding:16, marginBottom:12 }}>
            <label style={{ ...lbl, color:"#e67e22", fontSize:12 }}>🚛 SELECT TRUCK</label>
            <select value={form.truckId} onChange={e=>handleTruckSelect(e.target.value)}
              style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff8f0", color:form.truckId?"#e67e22":"#a09488", marginBottom:10 }}>
              <option value="">— Select a truck —</option>
              {trucks.map(t=><option key={t.id} value={t.id}>TMW# {t.tmwNumber}  |  Truck {t.truckNumber}</option>)}
            </select>
            {selectedTruck && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <div style={{ background:"#fff8f0", borderRadius:6, padding:"6px 12px", fontSize:12, color:"#e67e22", border:"1px solid #e67e2233" }}>
                  <span style={{ fontSize:10, color:"#9a8e80", display:"block" }}>TMW #</span>
                  <span style={{ fontWeight:"bold" }}>{selectedTruck.tmwNumber}</span>
                </div>
                <div style={{ background:"#fff8f0", borderRadius:6, padding:"6px 12px", fontSize:12, color:"#e67e22", border:"1px solid #e67e2233" }}>
                  <span style={{ fontSize:10, color:"#9a8e80", display:"block" }}>TRUCK</span>
                  <span style={{ fontWeight:"bold" }}>{selectedTruck.truckNumber}</span>
                </div>
              </div>
            )}
            <div>
              <label style={{ ...lbl, color:"#9a8e80", fontSize:11 }}>TRAILER NUMBER (override)</label>
              <input name="trailerNumber" value={form.trailerNumber} onChange={hc} placeholder="e.g. TR-42"
                style={{ ...iSt, borderLeftColor:"#9a8e80", fontSize:13 }}/>
            </div>
          </div>
        )}

        {/* ── BILLING METHOD — visible to all, earnings owner-only ── */}
        {form.location && (
          <div style={{ marginBottom:14, borderRadius:14, overflow:"hidden", boxShadow:"0 4px 20px #f5a62322" }}>
            <div style={{ background:"linear-gradient(135deg,#f5a623,#e67e22)", padding:"12px 16px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>📦</span>
              <div>
                <div style={{ fontSize:13, fontWeight:"bold", color:"#fff", letterSpacing:2 }}>BILLING METHOD</div>
                <div style={{ fontSize:10, color:"#fff9", marginTop:1 }}>{isOwner ? "Set how this load is charged" : "Select billing type for this load"}</div>
              </div>
            </div>
            <div style={{ background:"#fffdf7", padding:14 }}>

              {/* Billing type selector — everyone sees this */}
              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", gap:6 }}>
                  {[["per_load","📦","Per Load"],["per_cubic","📐","Per Cubic"],["per_hour","⏱","Per Hour"]].map(([m,icon,label])=>(
                    <button key={m} onClick={()=>setForm(f=>({...f, billingMethod:m, cubicYards:"", hoursWorked:"", earnings:""}))}
                      style={{ ...tBtn(form.billingMethod===m?"#f5a623":"#fff", form.billingMethod===m?"#fff":"#9a8e80"),
                        flex:1, fontSize:10, padding:"10px 4px",
                        border:form.billingMethod===m?"none":"2px solid #f5a62333",
                        borderRadius:8, boxShadow:form.billingMethod===m?"0 2px 8px #f5a62344":"none" }}>
                      <div style={{ fontSize:18, marginBottom:3 }}>{icon}</div>
                      {label}
                    </button>
                  ))}
                </div>
                {!form.billingMethod && (
                  <div style={{ fontSize:11, color:"#e74c3c", marginTop:6, textAlign:"center" }}>⚠ Please select a billing method</div>
                )}
              </div>

              {/* Per Cubic — DRIVER enters cubic yards, sees no dollar amounts */}
              {method==="per_cubic" && (
                <div style={{ marginBottom:12 }}>
                  <label style={{ ...lbl, color:"#9b59b6", fontSize:12 }}>
                    📐 CUBIC YARDS LOADED {!form.cubicYards && <span style={{ fontSize:10, color:"#e74c3c" }}>— required</span>}
                  </label>
                  <input
                    name="cubicYards" type="number" step="0.1" placeholder="0.0" value={form.cubicYards}
                    onChange={e=>{
                      const cy = e.target.value;
                      const auto = (Number(cy)||0) * routeRate;
                      setForm(f=>({...f, cubicYards:cy, earnings: auto>0 ? auto.toFixed(2) : ""}));
                    }}
                    style={{ ...iSt, borderLeftColor:!form.cubicYards?"#e74c3c":"#9b59b6",
                      background:!form.cubicYards?"#fff8ff":"#f8f0ff",
                      fontSize:22, fontWeight:"bold", textAlign:"center", letterSpacing:2 }}
                  />
                  {/* Driver sees ONLY the quantity confirmation — no rate or dollar total */}
                  {!isOwner && form.cubicYards && (
                    <div style={{ marginTop:8, background:"#f0f7ff", borderRadius:8, padding:"10px 14px",
                      border:"1px solid #3498db22", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:18 }}>✅</span>
                      <div style={{ fontSize:12, color:"#3498db", fontWeight:"bold" }}>
                        {form.cubicYards} yd³ recorded
                      </div>
                    </div>
                  )}
                  {/* Owner sees full calculation */}
                  {isOwner && form.cubicYards && routeRate>0 && (
                    <div style={{ marginTop:8, background:"#fff9ed", borderRadius:8, padding:"10px 14px",
                      border:"1px solid #f5a62333", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:11, color:"#8a7e70" }}>{form.cubicYards} yd³ × ${routeRate.toFixed(2)}</div>
                      <div style={{ fontSize:18, fontWeight:"bold", color:"#f5a623" }}>{fmtC((Number(form.cubicYards)||0)*routeRate)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Per Load / Per Hour — driver just sees method selected */}
              {!isOwner && method !== "per_cubic" && form.billingMethod && (
                <div style={{ background:"#f0f7ff", borderRadius:8, padding:"10px 14px",
                  border:"1px solid #3498db22", marginBottom:10,
                  display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>✅</span>
                  <div style={{ fontSize:12, color:"#3498db", fontWeight:"bold" }}>
                    {method==="per_load" ? "Per Load — rate applied automatically"
                      : "Per Hour — rate applied automatically"}
                  </div>
                </div>
              )}

              {/* Owner-only: hours worked + all earnings */}
              {isOwner && (
                <>
                {method==="per_hour" && (
                  <div style={{ marginBottom:10 }}>
                    <label style={{ ...lbl, color:"#f5a623" }}>⏱ HOURS WORKED</label>
                    <input name="hoursWorked" type="number" step="0.25" placeholder="0.00" value={form.hoursWorked}
                      onChange={e=>{ const hw=e.target.value; const auto=(Number(hw)||0)*routeRate; setForm(f=>({...f,hoursWorked:hw,earnings:auto>0?auto.toFixed(2):""})); }}
                      style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed" }}/>
                  </div>
                )}
                <div>
                  <div style={{ fontSize:11, color:"#f5a623", letterSpacing:2, fontWeight:"bold", marginBottom:8 }}>LOAD EARNINGS</div>
                  {method==="per_load" && (
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", background:"linear-gradient(135deg,#fff9ed,#fff3d6)", borderRadius:8, padding:"10px 14px", marginBottom:10, border:"1px solid #f5a62333" }}>
                        <span style={{ fontSize:12, color:"#8a7e70" }}>Rate per load:</span>
                        <span style={{ fontSize:18, fontWeight:"bold", color:"#f5a623" }}>{fmtC(routeRate)}</span>
                      </div>
                      <label style={{ ...lbl, color:"#f5a623", fontSize:11 }}>💵 OVERRIDE EARNINGS ($) <span style={{ color:"#9a8e80", fontSize:9 }}>optional</span></label>
                      <input name="earnings" type="number" placeholder={routeRate||"auto"} value={form.earnings}
                        onChange={e=>setForm(f=>({...f,earnings:e.target.value}))}
                        style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff9ed" }}/>
                      {!form.earnings && routeRate>0 && <div style={{ fontSize:11, color:"#27ae60", marginTop:6 }}>✔ Auto: {fmtC(routeRate)}</div>}
                    </div>
                  )}
                  {method==="per_cubic" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                      <div style={{ background:"linear-gradient(135deg,#fff9ed,#fff3d6)", borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", justifyContent:"center", border:"1px solid #f5a62333" }}>
                        <div style={{ fontSize:10, color:"#8a7e70" }}>× ${routeRate.toFixed(2)}/yd³</div>
                        <div style={{ fontSize:20, fontWeight:"bold", color:"#f5a623", marginTop:4 }}>{fmtC((Number(form.cubicYards)||0)*routeRate)}</div>
                      </div>
                      <div style={{ background:"#fff9ed", borderRadius:8, padding:"10px 12px", border:"1px solid #f5a62333" }}>
                        <label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>💵 EARNINGS ($)</label>
                        <input name="earnings" type="number" step="0.01" placeholder="0.00" value={form.earnings}
                          onChange={e=>setForm(f=>({...f,earnings:e.target.value}))}
                          style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff", padding:"6px 8px" }}/>
                      </div>
                    </div>
                  )}
                  {method==="per_hour" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                      <div style={{ background:"linear-gradient(135deg,#fff9ed,#fff3d6)", borderRadius:8, padding:"10px 12px", display:"flex", flexDirection:"column", justifyContent:"center", border:"1px solid #f5a62333" }}>
                        <div style={{ fontSize:10, color:"#8a7e70" }}>× ${routeRate.toFixed(2)}/hr</div>
                        <div style={{ fontSize:20, fontWeight:"bold", color:"#f5a623", marginTop:4 }}>{fmtC((Number(form.hoursWorked)||0)*routeRate)}</div>
                      </div>
                      <div style={{ background:"#fff9ed", borderRadius:8, padding:"10px 12px", border:"1px solid #f5a62333" }}>
                        <label style={{ ...lbl, color:"#f5a623", fontSize:10 }}>💵 EARNINGS ($)</label>
                        <input name="earnings" type="number" step="0.01" placeholder="0.00" value={form.earnings}
                          onChange={e=>setForm(f=>({...f,earnings:e.target.value}))}
                          style={{ ...iSt, borderLeftColor:"#f5a623", background:"#fff", padding:"6px 8px" }}/>
                      </div>
                    </div>
                  )}
                </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Owner Pay Breakdown */}
        {isOwner && (
          <div style={{ marginBottom:14, borderRadius:14, overflow:"hidden", boxShadow:"0 4px 20px #27ae6022" }}>
            <div style={{ background:"linear-gradient(135deg,#27ae60,#2ecc71)", padding:"12px 16px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>📊</span>
              <div>
                <div style={{ fontSize:13, fontWeight:"bold", color:"#fff", letterSpacing:2 }}>PAY BREAKDOWN</div>
                <div style={{ fontSize:10, color:"#fff9", marginTop:1 }}>Live calculation for this load</div>
              </div>
            </div>
            <div style={{ background:"#f6fff9", padding:14 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              {[["⏳ WAIT",fmt(waitMins),"#9a8e80","#f5f5f5"],["⏳ WAIT PAY",fmtC(wComp),"#27ae60","#f0fff4"],["💵 GROSS",fmtC(gross),"#27ae60","#f0fff4"],["👤 DRV ROUTE",fmtC(basePay),"#3498db","#f0f7ff"],["👤 DRV WAIT",fmtC(wDrv),"#3498db","#f0f7ff"],["👤 DRV TOTAL",fmtC(dPay),"#3498db","#e8f4fd"]].map(([l,v,c,bg])=>(
                <div key={l} style={{ background:bg, borderRadius:8, padding:"8px 12px", border:`1px solid ${c}22` }}>
                  <div style={{ fontSize:10, color:"#8a7e70" }}>{l}</div>
                  <div style={{ fontSize:15, fontWeight:"bold", color:c, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", background:"linear-gradient(135deg,#27ae6022,#2ecc7122)", borderRadius:8, padding:"12px 16px", border:"1px solid #27ae6033" }}>
              <span style={{ fontSize:13, fontWeight:"bold", color:"#27ae60" }}>💰 NET THIS LOAD</span>
              <span style={{ fontSize:22, fontWeight:"bold", color:net>=0?"#2ecc71":"#e74c3c" }}>{fmtC(net)}</span>
            </div>
            </div>
          </div>
        )}

        {/* Wait Timers */}
        <div style={{ background:"#fff", border:"1px solid #e0d8d0", borderRadius:10, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:11, color:"#9a8e80", letterSpacing:2, fontWeight:"bold", marginBottom:10 }}>⏱ WAIT TIMERS</div>
          {[{label:"LOAD WAIT",color:"#27ae60",key:"load",elapsed:loadElapsed,status:loadStatus,manualKey:"loadWaitMins"},
            {label:"OFFLOAD WAIT",color:"#e74c3c",key:"off",elapsed:offElapsed,status:offStatus,manualKey:"offloadWaitMins"}].map(t=>(
            <div key={t.key} style={{ marginBottom:10, padding:"10px 12px", background:t.color+"11", borderRadius:8, border:`1px solid ${t.color}33` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:"bold", color:t.color }}>{t.label}</span>
                <span style={{ fontFamily:"'Courier New',monospace", fontSize:16, color:t.status==="running"?t.color:"#aaa", fontWeight:"bold" }}>{secsToHMS(t.elapsed)}</span>
                <div style={{ display:"flex", gap:5 }}>
                  {t.status!=="running" && <button onClick={()=>startTimer(t.key)} style={{ ...tBtn(t.color), fontSize:10, padding:"5px 10px" }}>▶</button>}
                  {t.status==="running" && <button onClick={()=>stopTimer(t.key)} style={{ ...tBtn("#e74c3c"), fontSize:10, padding:"5px 10px" }}>⏹</button>}
                  {t.status && <button onClick={()=>resetTimer(t.key)} style={{ ...tBtn("#b5a898"), fontSize:10, padding:"5px 8px" }}>↺</button>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, color:t.color, fontWeight:"bold", whiteSpace:"nowrap" }}>MINS:</span>
                <input type="number" name={t.manualKey} placeholder="0" value={form[t.manualKey]} onChange={hc}
                  style={{ ...iSt, flex:1, borderLeftColor:t.color, fontSize:13, padding:"7px 10px" }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div style={{ marginBottom:16, borderRadius:12, overflow:"hidden", boxShadow:"0 2px 10px #9b59b622" }}>
          <div style={{ background:"linear-gradient(135deg,#9b59b6,#8e44ad)", padding:"10px 16px", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:18 }}>📝</span>
            <div style={{ fontSize:12, fontWeight:"bold", color:"#fff", letterSpacing:2 }}>NOTE</div>
          </div>
          <div style={{ background:"#faf5ff", padding:12 }}>
            <input name="note" value={form.note} onChange={hc} placeholder="Optional note..."
              style={{ ...iSt, borderLeftColor:"#9b59b6", background:"#fff" }}/>
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={submit} style={{ ...tBtn(isOwner?"#f5a623":"#3498db"), flex:1, padding:14, fontSize:15, borderRadius:12, boxShadow:`0 4px 15px ${isOwner?"#f5a62344":"#3498db44"}` }}>
            {editLoad ? "💾 UPDATE LOAD" : "✅ SAVE LOAD"}
          </button>
          {onCancel && <button onClick={onCancel} style={{ ...tBtn("#b5a898"), padding:"14px 18px", borderRadius:12 }}>✕</button>}
        </div>
      </div>
      </div>
      )} {/* end formTab === load */}

      {formTab === "fuel" && (
        <div style={{ padding:"16px 16px 20px" }}>
          <div style={{ marginBottom:14, borderRadius:14, overflow:"hidden", boxShadow:"0 4px 20px #e67e2222" }}>
            <div style={{ background:"linear-gradient(135deg,#e67e22,#d35400)", padding:"14px 16px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:24 }}>⛽</span>
              <div>
                <div style={{ fontSize:14, fontWeight:"bold", color:"#fff", letterSpacing:2 }}>FUEL LOG</div>
                <div style={{ fontSize:10, color:"#fff9", marginTop:1 }}>Auto-calculates total from litres × price</div>
              </div>
            </div>
            <div style={{ background:"#fff8f0", padding:16 }}>

              {/* Receipt scanner */}
              <ReceiptScanner onResult={({litres,pricePerLitre,total})=>{
                setForm(f=>({...f,
                  fuelLitres: litres||f.fuelLitres,
                  fuelPricePerLitre: pricePerLitre||f.fuelPricePerLitre,
                  fuelTotal: total||f.fuelTotal
                }));
              }}/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <div>
                  <label style={{ ...lbl, color:"#e67e22" }}>LITRES FILLED</label>
                  <input name="fuelLitres" type="number" placeholder="0" value={form.fuelLitres}
                    onChange={e=>{
                      const l=e.target.value;
                      const auto=(Number(l)||0)*(Number(form.fuelPricePerLitre)||0);
                      setForm(f=>({...f, fuelLitres:l, fuelTotal:auto>0?auto.toFixed(2):f.fuelTotal}));
                    }}
                    style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff", fontSize:16 }}/>
                </div>
                <div>
                  <label style={{ ...lbl, color:"#e67e22" }}>PRICE / LITRE ($)</label>
                  <input name="fuelPricePerLitre" type="number" placeholder="1.85" step="0.001" value={form.fuelPricePerLitre}
                    onChange={e=>{
                      const p=e.target.value;
                      const auto=(Number(form.fuelLitres)||0)*(Number(p)||0);
                      setForm(f=>({...f, fuelPricePerLitre:p, fuelTotal:auto>0?auto.toFixed(2):f.fuelTotal}));
                    }}
                    style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff", fontSize:16 }}/>
                </div>
              </div>

              {/* Auto-calculated total display */}
              <div style={{ background:"linear-gradient(135deg,#fff3e0,#ffe0b2)", border:"2px solid #e67e2244", borderRadius:12, padding:"16px 18px", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#e67e22", letterSpacing:2, fontWeight:"bold" }}>⛽ FUEL TOTAL</div>
                    {form.fuelLitres && form.fuelPricePerLitre && (
                      <div style={{ fontSize:11, color:"#9a8e80", marginTop:3 }}>
                        {form.fuelLitres}L × ${Number(form.fuelPricePerLitre).toFixed(3)} = {fmtC((Number(form.fuelLitres)||0)*(Number(form.fuelPricePerLitre)||0))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:32, fontWeight:"bold", color:"#e67e22" }}>{fmtC(form.fuelTotal||0)}</div>
                </div>
                <div>
                  <label style={{ ...lbl, color:"#9a8e80", fontSize:10 }}>OVERRIDE TOTAL ($) <span style={{ fontWeight:"normal" }}>optional</span></label>
                  <input name="fuelTotal" type="number" placeholder="auto-calculated above" step="0.01" value={form.fuelTotal}
                    onChange={hc} style={{ ...iSt, borderLeftColor:"#e67e22", background:"#fff" }}/>
                </div>
              </div>

              {!form.tmwLoadNumber && (
                <div style={{ background:"#fff3cd", border:"1px solid #f5a62344", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#856404", marginBottom:14 }}>
                  ⚠ Go to the LOAD INFO tab first — load number auto-generated there.
                </div>
              )}

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={submit} style={{ ...tBtn(isOwner?"#e67e22":"#3498db"), flex:1, padding:14, fontSize:15, borderRadius:12, boxShadow:"0 4px 15px #e67e2244" }}>
                  {editLoad ? "💾 UPDATE LOAD" : "✅ SAVE LOAD"}
                </button>
                {onCancel && <button onClick={onCancel} style={{ ...tBtn("#b5a898"), padding:"14px 18px", borderRadius:12 }}>✕</button>}
              </div>
            </div>
          </div>
        </div>
      )} {/* end formTab === fuel */}

    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function LoadTracker() {
  const [session, setSession]           = useState(null);
  const [loads,   setLoads]             = useState([]);
  const [rates,   setRates]             = useState(DEFAULT_RATES);
  const [customRoutes, setCustomRoutes] = useState([]);
  const [trucks,  setTrucks]            = useState([]);
  const [tab,     setTab]               = useState("log");
  const [showSettings, setShowSettings] = useState(false);
  const [showReport,   setShowReport]   = useState(false);
  const [detailLoad,   setDetailLoad]   = useState(null);
  const [editLoad,     setEditLoad]     = useState(null);

  useEffect(()=>{
    const s = getSession();
    if (s) loadSession(s);
  },[]);

  const loadSession = (s) => {
    setSession(s);
    const ownerUid = s.ownerUid || s.uid;
    try { const ld=localStorage.getItem(ownerLoadsKey(ownerUid)); setLoads(ld?JSON.parse(ld):[]); } catch(e){}
    try { const rd=localStorage.getItem(ownerRatesKey(ownerUid)); setRates(rd?{...DEFAULT_RATES,...JSON.parse(rd)}:DEFAULT_RATES); } catch(e){}
    try { const cr=localStorage.getItem(ownerCustomRoutesKey(ownerUid)); setCustomRoutes(cr?JSON.parse(cr):[]); } catch(e){}
    try { const tk=localStorage.getItem(trucksKey(ownerUid)); setTrucks(tk?JSON.parse(tk):[]); } catch(e){}
  };

  const handleLogin = (s) => { saveSession(s); loadSession(s); };
  const handleLogout = () => { clearSession(); setSession(null); setLoads([]); setRates(DEFAULT_RATES); setCustomRoutes([]); setTrucks([]); };

  const saveLoad = (load) => {
    const ownerUid = session.ownerUid || session.uid;
    const existing = loads.find(l=>l.id===load.id);
    const updated  = existing ? loads.map(l=>l.id===load.id?load:l) : [load, ...loads];
    setLoads(updated);
    localStorage.setItem(ownerLoadsKey(ownerUid), JSON.stringify(updated));
    setTab("log"); setEditLoad(null);
  };

  const deleteLoad = (id) => {
    const ownerUid = session.ownerUid || session.uid;
    const updated  = loads.filter(l=>l.id!==id);
    setLoads(updated);
    localStorage.setItem(ownerLoadsKey(ownerUid), JSON.stringify(updated));
  };

  if (!session) return <AuthScreen onLogin={handleLogin}/>;

  const isOwner   = session.role === "owner";
  const ownerUid  = session.ownerUid || session.uid;
  const ownerColor= isOwner ? "#f5a623" : "#3498db";
  const users     = getUsers();
  const allDrivers= Object.values(users).filter(u=>u.role==="driver"&&u.ownerUid===ownerUid);

  const mergedRoutes = customRoutes.map(r=>({ ...r, billingMethod:r.billingMethod||"per_load", rate:r.rate||0 }));

  const visibleLoads = isOwner ? loads : loads.filter(l=>l.assignedDriverUid===session.uid||l.addedBy===session.uid);

  const totalWait  = visibleLoads.reduce((s,l)=>(s+(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0)),0);
  const totalGross = visibleLoads.reduce((s,l)=>s+Number(l.earnings||0),0);
  const totalWaitPayCo = visibleLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
  const grossIncome= totalGross + totalWaitPayCo;
  const totalDriverPay = visibleLoads.reduce((s,l)=>{
    const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
    return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0);
  },0);
  const netIncome  = grossIncome - totalDriverPay;
  const driverRoutePay = visibleLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
  const driverWaitPay  = visibleLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);
  const driverTotalPay = driverRoutePay + driverWaitPay;
  const expRaw         = isOwner ? getStoredExpenses(session.uid) : [];
  const totalFuelLoads = isOwner ? visibleLoads.reduce((s,l)=>s+Number(l.fuelTotal||0),0) : 0;
  const totalOwnerExp  = isOwner ? expRaw.reduce((s,e)=>s+Number(e.amount||0),0) : 0;
  const allDrvTruckExp = isOwner ? allDrivers.reduce((s,d)=>s+getStoredTruckExpenses(d.uid).reduce((a,e)=>a+Number(e.amount||0),0),0) : 0;
  const takeHome       = netIncome - totalOwnerExp - allDrvTruckExp;
  const driverPersonalExpTotal = !isOwner ? getStoredExpenses(session.uid).reduce((s,e)=>s+Number(e.amount||0),0) : 0;
  const driverTruckExpTotal    = !isOwner ? getStoredTruckExpenses(session.uid).reduce((s,e)=>s+Number(e.amount||0),0) : 0;
  const driverTotalExpenses    = driverPersonalExpTotal + driverTruckExpTotal;
  const driverNetHome          = driverTotalPay - driverTotalExpenses;

  const tabs = isOwner
    ? [["log","📋","LOG"],["new","➕","NEW"],["expenses","🧾","EXPENSES"],["drivers","👥","DRIVERS"],["report","📊","REPORT"]]
    : [["log","📋","LOG"],["new","➕","NEW"],["expenses","🧾","EXPENSES"],["report","📊","REPORT"]];

  return (
    <div style={{ maxWidth:480, margin:"0 auto", background:"#f5f0eb", minHeight:"100vh", fontFamily:"system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ background:isOwner?"#2c2010":"#1a2535", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:30 }}>
        <div>
          <div style={{ color:"#fff", fontWeight:"bold", fontSize:15, letterSpacing:2 }}>🚛 LOAD TRACKER</div>
          <div style={{ color:isOwner?"#f5a623":"#3498db", fontSize:12, letterSpacing:0, marginTop:1 }}>
            <span style={{ fontWeight:"bold" }}>{session.fullName||session.name}</span>
            <span style={{ opacity:0.6, fontSize:10 }}> · {isOwner?"Owner Operator":"Driver"}</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {isOwner && <button onClick={()=>setShowSettings(true)} style={{ ...tBtn("#ffffff22","#fff"), padding:"8px 12px", fontSize:14 }}>🔧</button>}
          <button onClick={handleLogout} style={{ ...tBtn("#e74c3c33","#ff8a8a"), padding:"8px 10px", fontSize:11, letterSpacing:1 }}>OUT</button>
        </div>
      </div>

      {/* Top Nav Tabs */}
      <div style={{ background:isOwner?"#3a2c18":"#1e2d40", display:"flex", borderBottom:`2px solid ${ownerColor}33`, position:"sticky", top:52, zIndex:29 }}>
        {tabs.map(([t,icon,label])=>(
          <button key={t} onClick={()=>{
            setTab(t);
            if(t==="report") setShowReport(true);
            else { setShowReport(false); if(t!=="new") setEditLoad(null); }
          }}
            style={{ flex:1, padding:"10px 2px 8px", border:"none",
              background:tab===t?`${ownerColor}28`:"transparent",
              color:tab===t?ownerColor:"#9a8e80",
              fontWeight:tab===t?"bold":"normal", fontSize:9.5, cursor:"pointer", letterSpacing:0.5,
              borderBottom:tab===t?`2px solid ${ownerColor}`:"2px solid transparent",
              position:"relative" }}>
            <div style={{ fontSize:16 }}>{icon}</div>
            <div>{label}</div>
          </button>
        ))}
      </div>

      <div style={{ background:isOwner?"#3a2c18":"#1e2d40", padding:"10px 16px", overflowX:"auto" }}>
        <div style={{ display:"flex", gap:8, minWidth:"max-content" }}>
          {isOwner ? [
            ["LOADS",      visibleLoads.length,          "#fff",     false],
            ["GROSS",      fmtC(grossIncome),             "#f5a623",  false],
            ["DRIVER PAY", fmtC(totalDriverPay),          "#3498db",  false],
            ["NET",        fmtC(netIncome),               "#27ae60",  false],
            ["⛽ FUEL",    fmtC(totalFuelLoads),          "#e67e22",  false],
            ["EXPENSES",   fmtC(totalOwnerExp+allDrvTruckExp), "#e74c3c", false],
            ["🏆 TAKE-HOME",fmtC(takeHome),              takeHome>=0?"#2ecc71":"#e74c3c", true],
          ].map(([l,v,c,special])=>(
            <div key={l} style={{ background:special?"#0006":"#ffffff15", borderRadius:8, padding:"8px 12px", textAlign:"center", minWidth:72,
              border:special?"1px solid #f5a62344":"none" }}>
              <div style={{ fontSize:9, color:special?"#f5a623":"#9a8e80", letterSpacing:1, marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:"bold", color:c }}>{v}</div>
            </div>
          )) : (()=>{
            const driverStats = [
              ["LOADS",   visibleLoads.length,   "#fff",    false],
              ["WAIT",    fmt(totalWait),         "#f5a623", false],
              ["GROSS PAY", fmtC(driverTotalPay), "#3498db", false],
              ["EXPENSES",  fmtC(driverTotalExpenses), "#e74c3c", false],
            ];
            return (
              <>
                {driverStats.map(([l,v,c])=>(
                  <div key={l} style={{ background:"#ffffff15", borderRadius:8, padding:"8px 12px", textAlign:"center", minWidth:74 }}>
                    <div style={{ fontSize:9, color:"#9a8e80", letterSpacing:1, marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:"bold", color:c }}>{v}</div>
                  </div>
                ))}
                {/* NET GOES HOME — highlighted */}
                <div style={{ background:driverNetHome>=0?"#27ae6033":"#e74c3c33", borderRadius:8, padding:"8px 12px", textAlign:"center", minWidth:86, border:`1px solid ${driverNetHome>=0?"#27ae6066":"#e74c3c66"}` }}>
                  <div style={{ fontSize:9, color:driverNetHome>=0?"#27ae60":"#e74c3c", letterSpacing:1, marginBottom:2, fontWeight:"bold" }}>💰 NET HOME</div>
                  <div style={{ fontSize:14, fontWeight:"bold", color:driverNetHome>=0?"#2ecc71":"#e74c3c" }}>{fmtC(driverNetHome)}</div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {tab==="log" && (
        <div style={{ minHeight:"60vh", background: isOwner
          ? "linear-gradient(180deg,#2c1f0e 0%,#3d2b12 80px,#f5f0eb 80px)"
          : "linear-gradient(180deg,#0f1e30 0%,#1a2d45 80px,#eef4fb 80px)" }}>

          {/* Hero greeting bar */}
          {(()=>{
            const hr = new Date().getHours();
            const greet = hr < 12 ? "Good Morning" : hr < 17 ? "Good Afternoon" : "Good Evening";
            const greetIcon = hr < 12 ? "🌅" : hr < 17 ? "☀️" : "🌙";
            const tips = isOwner
              ? ["Tap ➕ NEW to log a load","Check 📊 REPORT for summaries","Manage routes in 🔧 Settings","Add trucks in Settings → Fleet"]
              : ["Tap ➕ NEW to log your load","Log fuel on the ⛽ FUEL tab","Track wait time with the timers","Check 📊 REPORT for your pay"];
            const tip = tips[new Date().getDay() % tips.length];
            return (
              <div style={{ padding:"16px 16px 0" }}>
                {/* Greeting card */}
                <div style={{ background: isOwner
                  ? "linear-gradient(135deg,#3d2b12,#2c1f0e)"
                  : "linear-gradient(135deg,#1a2d45,#0f1e30)",
                  borderRadius:16, padding:"20px 20px 14px", marginBottom:12,
                  border:`1px solid ${isOwner?"#f5a62333":"#3498db33"}`,
                  boxShadow:`0 8px 32px ${isOwner?"#f5a62318":"#3498db18"}` }}>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:13, color:isOwner?"#f5a62399":"#3498db99", letterSpacing:1, marginBottom:4 }}>
                      {greet},
                    </div>
                    <div style={{ fontSize:24, fontWeight:"bold", color:"#fff", marginBottom:2 }}>
                      {session.fullName||session.name}
                    </div>
                    <div style={{ fontSize:11, color:isOwner?"#f5a62366":"#3498db66", marginBottom:10 }}>
                      {new Date().toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
                    </div>
                    <div style={{ display:"inline-flex", alignItems:"center", gap:6,
                      background:isOwner?"#f5a62322":"#3498db22",
                      borderRadius:20, padding:"4px 12px",
                      border:`1px solid ${isOwner?"#f5a62344":"#3498db44"}` }}>
                      <span style={{ fontSize:11 }}>{isOwner?"🔑":"🚛"}</span>
                      <span style={{ fontSize:10, color:isOwner?"#f5a623":"#3498db", fontWeight:"bold", letterSpacing:1 }}>
                        {isOwner?"OWNER OPERATOR":"DRIVER"}
                      </span>
                    </div>
                  </div>
                  {/* Icon centered at bottom */}
                  <div style={{ textAlign:"center", fontSize:38, lineHeight:1, opacity:0.8 }}>{greetIcon}</div>
                </div>

                {/* Quick tip / info card */}
                <div style={{ background:"#fff", borderRadius:12, padding:"12px 16px", marginBottom:14,
                  border:`1px solid ${isOwner?"#f5a62322":"#3498db22"}`,
                  display:"flex", alignItems:"center", gap:12,
                  boxShadow:"0 2px 10px #0001" }}>
                  <div style={{ fontSize:22 }}>💡</div>
                  <div>
                    <div style={{ fontSize:10, color:"#9a8e80", letterSpacing:2, fontWeight:"bold", marginBottom:2 }}>QUICK TIP</div>
                    <div style={{ fontSize:12, color:"#4a3e30" }}>{tip}</div>
                  </div>
                </div>

                {/* App benefits / feature showcase */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:"#9a8e80", letterSpacing:3, fontWeight:"bold", marginBottom:10, paddingLeft:2 }}>
                    🚛 OILSANDS HAUL LOG — FEATURES
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {(isOwner ? [
                      ["📋","Auto Load #","Every load gets a unique auto-generated TMW number","new"],
                      ["💰","Real-Time P&L","Track gross, driver pay & net per load instantly","report"],
                      ["👥","Multi-Driver","Manage all your drivers from one dashboard","drivers"],
                      ["🗺","Route Rates","Set custom billing rates per route","settings"],
                      ["⛽","Fuel Tracking","Log fuel with receipt scan on every load","new"],
                      ["📊","Reports","Full financial summaries by day, week, month","report"],
                    ] : [
                      ["📋","Auto Load #","Each load assigned a unique tracking number","new"],
                      ["⛽","Fuel Receipt","Scan your fuel receipt directly from the app","new"],
                      ["⏱","Wait Timers","Live timers track load & offload wait time","new"],
                      ["💰","Pay Tracking","See your gross pay, expenses & net take-home","report"],
                      ["📐","Cubic Yards","Log your cubic yards — system calculates the rest","new"],
                      ["📊","Reports","View your pay summary by period","report"],
                    ]).map(([icon,title,desc,dest])=>(
                      <button key={title} onClick={()=>{
                        if(dest==="settings") setShowSettings(true);
                        else if(dest==="report"){ setTab("report"); setShowReport(true); }
                        else { setTab(dest); setShowReport(false); }
                      }}
                        style={{ background:"#fff", borderRadius:12, padding:"12px 14px",
                          border:`1px solid ${isOwner?"#f5a62322":"#3498db22"}`,
                          boxShadow:"0 2px 8px #0001", textAlign:"left", cursor:"pointer",
                          transition:"transform 0.1s, box-shadow 0.1s" }}
                        onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                        onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                        onTouchStart={e=>e.currentTarget.style.transform="scale(0.97)"}
                        onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                        <div style={{ fontSize:26, marginBottom:6 }}>{icon}</div>
                        <div style={{ fontSize:12, fontWeight:"bold", color:"#2c2416", marginBottom:3 }}>{title}</div>
                        <div style={{ fontSize:10, color:"#9a8e80", lineHeight:1.4 }}>{desc}</div>
                        <div style={{ marginTop:8, fontSize:10, color:isOwner?"#f5a623":"#3498db", fontWeight:"bold", letterSpacing:0.5 }}>
                          TAP TO OPEN →
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Today's stats mini bar */}
                {visibleLoads.length > 0 && (()=>{
                  const today = todayStr();
                  const todayLoads = visibleLoads.filter(l=>l.date===today);
                  if (todayLoads.length === 0) return null;
                  const todayEarnings = isOwner
                    ? todayLoads.reduce((s,l)=>s+Number(l.earnings||0),0)
                    : todayLoads.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
                  return (
                    <div style={{ background: isOwner?"#f5a62311":"#3498db11",
                      borderRadius:12, padding:"10px 16px", marginBottom:14,
                      border:`1px solid ${isOwner?"#f5a62322":"#3498db22"}`,
                      display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ fontSize:12, color:"#6a5e50" }}>
                        <span style={{ fontWeight:"bold", color:isOwner?"#f5a623":"#3498db" }}>{todayLoads.length}</span>
                        {" "}load{todayLoads.length!==1?"s":""} today
                      </div>
                      {isOwner && <div style={{ fontSize:14, fontWeight:"bold", color:"#27ae60" }}>{fmtC(todayEarnings)}</div>}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          <div style={{ padding:"0 16px 40px" }}>
          {visibleLoads.length===0 ? (
            <div style={{ textAlign:"center", color:"#b5a898", padding:"40px 20px", background:"#fff", borderRadius:16, boxShadow:"0 4px 20px #0001" }}>
              <div style={{ fontSize:56, marginBottom:12 }}>🚛</div>
              <div style={{ fontSize:17, fontWeight:"bold", color:"#6a5e50", marginBottom:6 }}>No loads logged yet</div>
              <div style={{ fontSize:12, color:"#b5a898", marginBottom:20 }}>Tap below to log your first load</div>
              <button onClick={()=>setTab("new")} style={{ ...tBtn(ownerColor), padding:"13px 32px", fontSize:14, borderRadius:12, boxShadow:`0 4px 16px ${ownerColor}44` }}>➕ LOG FIRST LOAD</button>
            </div>
          ) : [...visibleLoads].sort((a,b)=>(b.date>a.date?1:b.date<a.date?-1:0)).map(l=>{
            const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
            const truck=trucks.find(t=>t.id===l.truckId);
            const loadWaitPayOwner  = wm/60*(Number(rates.companyWaitRate)||0);
            const loadWaitPayDriver = wm/60*(Number(rates.driverWaitRate)||0);
            const loadDriverTotal   = (Number(l.driverBasePay)||0) + loadWaitPayDriver;
            const ownerLoadTotal    = (Number(l.earnings)||0) + loadWaitPayOwner;
            const displayAmt = isOwner ? ownerLoadTotal : loadDriverTotal;
            return (
              <div key={l.id} style={{ ...card, borderLeft:`4px solid ${ownerColor}`, cursor:"pointer" }} onClick={()=>setDetailLoad(l)}>
                {/* TMW Load Number + truck badges */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                  {l.tmwLoadNumber && (
                    <div style={{ fontSize:12, color:"#1a2535", background:"#e8f0fe", borderRadius:5, padding:"3px 10px", fontWeight:"bold", border:"1px solid #3498db44", letterSpacing:1 }}>
                      📋 Load# {l.tmwLoadNumber}
                    </div>
                  )}
                  {truck && (
                    <>
                      <div style={{ fontSize:11, color:"#e67e22", background:"#fff3e0", borderRadius:5, padding:"3px 8px", border:"1px solid #e67e2244" }}>
                        🚛 {truck.truckNumber}
                      </div>
                      {l.trailerNumber && (
                        <div style={{ fontSize:11, color:"#9a8e80", background:"#f5f0eb", borderRadius:5, padding:"3px 8px", border:"1px solid #e0d8d0" }}>
                          Trailer {l.trailerNumber}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:"bold", color:"#2c2416", fontSize:15 }}>{l.location}</div>
                    <div style={{ fontSize:11, color:"#9a8e80", marginTop:2 }}>{l.date}{l.time?` · ${l.time}`:""}</div>
                    {isOwner && l.driverFullName && (
                      <div style={{ fontSize:11, color:"#3498db", marginTop:3, fontWeight:"bold" }}>👤 {l.driverFullName}</div>
                    )}
                    {isOwner && (
                      <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                        <div style={{ fontSize:10, color:"#27ae60" }}>Load: {fmtC(l.earnings||0)}</div>
                        {loadWaitPayOwner>0 && <div style={{ fontSize:10, color:"#f5a623" }}>Wait: +{fmtC(loadWaitPayOwner)}</div>}
                      </div>
                    )}
                    {l.cubicYards && (
                      <div style={{ fontSize:10, color:"#9b59b6", marginTop:3 }}>📐 {l.cubicYards} yd³</div>
                    )}
                    {l.note && <div style={{ fontSize:11, color:"#9a8e80", fontStyle:"italic", marginTop:3 }}>{l.note}</div>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, marginLeft:8 }}>
                    {isOwner && <div style={{ fontSize:17, fontWeight:"bold", color:ownerColor }}>{fmtC(displayAmt)}</div>}
                    <div style={{ display:"flex", gap:5 }}>
                      <button onClick={e=>{e.stopPropagation();setEditLoad(l);setTab("new");}} style={{ ...tBtn("#f5f0eb","#6a5e50"), padding:"5px 8px", fontSize:11 }}>✏️</button>
                      <button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this load?"))deleteLoad(l.id);}} style={{ ...tBtn("#e74c3c11","#e74c3c"), padding:"5px 8px", fontSize:11 }}>🗑</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {tab==="new" && (
        <LoadForm session={session} isOwner={isOwner} rates={rates}
          allRoutes={mergedRoutes} customRoutes={customRoutes} setCustomRoutes={setCustomRoutes}
          trucks={trucks} onSave={saveLoad} editLoad={editLoad}
          onCancel={editLoad?()=>{setEditLoad(null);setTab("log");}:null}/>
      )}

      {tab==="expenses" && <ExpensesTab session={session} isOwner={isOwner}/>}

      {tab==="drivers" && isOwner && <DriversPanel session={session} loads={loads} rates={rates}/>}

      {detailLoad && <LoadDetailModal load={detailLoad} onClose={()=>setDetailLoad(null)} rates={rates} isOwner={isOwner} trucks={trucks}/>}
      {showReport && <ReportView loads={visibleLoads} session={session} rates={rates} isOwner={isOwner} onClose={()=>{setShowReport(false);setTab("log");}} allDrivers={allDrivers}/>}
      {showSettings && isOwner && (
        <SettingsModal session={session} rates={rates} setRates={setRates}
          customRoutes={customRoutes} setCustomRoutes={setCustomRoutes}
          trucks={trucks} setTrucks={setTrucks} onClose={()=>setShowSettings(false)}/>
      )}
    </div>
  );
}
