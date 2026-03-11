import { useState, useEffect, useRef } from "react";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const USERS_KEY = "tp-users-v1";
const SESSION_KEY = "tp-session-v1";
const loadsKey = (uid) => `tp-loads-${uid}`;
const ratesKey = (uid) => `tp-rates-${uid}`;
const routesKey = (uid) => `tp-routes-${uid}`;
const expensesKey = (uid) => `tp-expenses-${uid}`;
const trucksKey = (uid) => `tp-trucks-${uid}`;
const maintenanceKey = (uid) => `tp-maint-${uid}`;

const hashPass = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h.toString(36); };
const getUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); } catch { return {}; } };
const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u));
const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = () => localStorage.removeItem(SESSION_KEY);
const genCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = ""; for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
const getStored = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };

const DEFAULT_RATES = { companyWaitRate: 85, driverWaitRate: 40, billingMethod: "per_load", perLoadRate: 0 };
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtC = (v) => `$${Number(v || 0).toFixed(2)}`;
const fmt = (m) => { const h = Math.floor(m / 60), mn = m % 60; return `${h}h ${mn}m`; };
const secsToHMS = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; };

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  navy:    "#0A1628",
  navyMid: "#112240",
  blue:    "#1E88E5",
  blueBright:"#42A5F5",
  blueLight:"#E3F2FD",
  teal:    "#00BCD4",
  white:   "#FFFFFF",
  offWhite:"#F7F9FC",
  border:  "#E1E8F0",
  textDark:"#0D1F35",
  textMed: "#4A6080",
  textLight:"#8CA0B8",
  green:   "#00897B",
  red:     "#E53935",
  orange:  "#F57C00",
  purple:  "#7B1FA2",
};

// ─── SVG Logo ─────────────────────────────────────────────────────────────────
function SLTLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* iPad body */}
      <rect x="38" y="12" width="34" height="46" rx="5" fill={C.navyMid} stroke={C.teal} strokeWidth="2.2"/>
      <rect x="41" y="16" width="28" height="34" rx="3" fill={C.navy}/>
      {/* iPad screen glow lines */}
      <rect x="44" y="19" width="16" height="2" rx="1" fill={C.teal} opacity="0.7"/>
      <rect x="44" y="23" width="22" height="1.5" rx="1" fill={C.blueBright} opacity="0.5"/>
      <rect x="44" y="27" width="18" height="1.5" rx="1" fill={C.blueBright} opacity="0.4"/>
      <rect x="44" y="31" width="12" height="1.5" rx="1" fill={C.teal} opacity="0.3"/>
      {/* iPad home button */}
      <circle cx="55" cy="53" r="2.5" fill={C.teal} opacity="0.8"/>
      {/* Truck body */}
      <rect x="6" y="34" width="30" height="22" rx="4" fill={C.blue}/>
      {/* Truck cab */}
      <path d="M26 34 L36 34 L36 44 Q36 48 32 48 L26 48 Z" fill={C.blueBright}/>
      {/* Windshield */}
      <rect x="27" y="36" width="7" height="6" rx="1.5" fill={C.navy} opacity="0.85"/>
      {/* Truck wheels */}
      <circle cx="14" cy="57" r="5" fill={C.navyMid} stroke={C.teal} strokeWidth="2"/>
      <circle cx="14" cy="57" r="2" fill={C.teal}/>
      <circle cx="30" cy="57" r="5" fill={C.navyMid} stroke={C.teal} strokeWidth="2"/>
      <circle cx="30" cy="57" r="2" fill={C.teal}/>
      {/* Speed lines */}
      <line x1="2" y1="40" x2="10" y2="40" stroke={C.teal} strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
      <line x1="2" y1="44" x2="8" y2="44" stroke={C.blueBright} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <line x1="2" y1="48" x2="6" y2="48" stroke={C.teal} strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
      {/* Signal arc from iPad to truck */}
      <path d="M38 30 Q30 20 22 30" stroke={C.teal} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6" strokeDasharray="3 2"/>
      <circle cx="38" cy="30" r="1.5" fill={C.teal} opacity="0.9"/>
    </svg>
  );
}

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalCSS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Mulish:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Mulish', sans-serif; background: ${C.offWhite}; color: ${C.textDark}; }

    /* NAV */
    .slt-nav {
      background: ${C.navy};
      height: 64px;
      display: flex;
      align-items: center;
      padding: 0 24px;
      position: sticky;
      top: 0;
      z-index: 200;
      box-shadow: 0 2px 20px rgba(0,0,0,0.35);
      gap: 16px;
    }
    .slt-logo-area {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      flex-shrink: 0;
    }
    .slt-brand {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .slt-brand-main {
      font-family: 'Sora', sans-serif;
      font-size: 15px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.3px;
    }
    .slt-brand-sub {
      font-family: 'Mulish', sans-serif;
      font-size: 10px;
      font-weight: 600;
      color: ${C.teal};
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    /* MENU TRIGGER */
    .slt-menu-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 8px 16px;
      cursor: pointer;
      color: rgba(255,255,255,0.9);
      font-family: 'Mulish', sans-serif;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.2px;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .slt-menu-trigger:hover {
      background: rgba(255,255,255,0.12);
      border-color: ${C.teal};
      color: #fff;
    }
    .slt-menu-trigger.open {
      background: ${C.teal}22;
      border-color: ${C.teal};
      color: ${C.teal};
    }
    .slt-menu-chevron {
      transition: transform 0.25s ease;
      opacity: 0.7;
    }
    .slt-menu-chevron.open { transform: rotate(180deg); }

    /* ACTIVE TAB PILL */
    .slt-active-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: ${C.teal}20;
      border: 1px solid ${C.teal}50;
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 12.5px;
      font-weight: 700;
      color: ${C.teal};
      font-family: 'Mulish', sans-serif;
    }

    /* DROPDOWN PANEL */
    .slt-dropdown-overlay {
      position: fixed;
      inset: 0;
      z-index: 190;
    }
    .slt-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 360px;
      background: ${C.navyMid};
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5);
      overflow: hidden;
      animation: dropIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards;
      z-index: 201;
    }
    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-10px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .slt-dropdown-header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-family: 'Sora', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: ${C.textLight};
    }
    .slt-dropdown-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 12px;
    }
    .slt-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      transition: all 0.16s;
      font-family: 'Mulish', sans-serif;
      color: rgba(255,255,255,0.75);
      font-size: 13.5px;
      font-weight: 600;
      position: relative;
    }
    .slt-menu-item:hover {
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.1);
      color: #fff;
    }
    .slt-menu-item.active {
      background: linear-gradient(135deg, ${C.teal}25, ${C.blue}20);
      border-color: ${C.teal}50;
      color: ${C.teal};
    }
    .slt-menu-item.active .slt-item-icon {
      filter: drop-shadow(0 0 6px ${C.teal}80);
    }
    .slt-item-icon { font-size: 18px; flex-shrink: 0; }
    .slt-item-label { font-size: 13px; font-weight: 600; }
    .slt-item-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      background: ${C.red};
      color: #fff;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      font-size: 9px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slt-dropdown-footer {
      padding: 10px 12px 12px;
      border-top: 1px solid rgba(255,255,255,0.07);
      display: flex;
      gap: 8px;
    }

    /* RIGHT SIDE NAV */
    .slt-nav-right {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }
    .slt-user-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 5px 14px 5px 8px;
    }
    .slt-user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${C.teal}, ${C.blue});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      color: #fff;
      font-family: 'Sora', sans-serif;
      flex-shrink: 0;
    }
    .slt-user-name { font-size: 13px; font-weight: 700; color: #fff; font-family: 'Mulish', sans-serif; }
    .slt-user-role { font-size: 10px; color: ${C.textLight}; font-family: 'Mulish', sans-serif; }
    .slt-settings-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 7px 12px;
      color: rgba(255,255,255,0.75);
      font-size: 13px;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
      font-weight: 600;
      transition: all 0.15s;
    }
    .slt-settings-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .slt-logout-btn {
      background: rgba(229,57,53,0.12);
      border: 1px solid rgba(229,57,53,0.3);
      border-radius: 8px;
      padding: 7px 12px;
      color: #ff8a80;
      font-size: 13px;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
      font-weight: 700;
      transition: all 0.15s;
    }
    .slt-logout-btn:hover { background: rgba(229,57,53,0.22); }

    /* PAGE SHELLS */
    .slt-page { min-height: 100vh; background: ${C.offWhite}; }
    .slt-hero {
      background: linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 60%, #1a3a5c 100%);
      padding: 48px 24px 44px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .slt-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 30% 50%, ${C.teal}12 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 20%, ${C.blue}15 0%, transparent 50%);
      pointer-events: none;
    }
    .slt-hero-title {
      font-family: 'Sora', sans-serif;
      font-size: 30px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
      position: relative;
    }
    .slt-hero-sub { font-size: 15px; color: rgba(255,255,255,0.72); position: relative; }
    .slt-container { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    .slt-container-sm { max-width: 600px; margin: 0 auto; padding: 32px 20px 64px; }

    /* CARDS */
    .slt-card {
      background: ${C.white};
      border-radius: 14px;
      padding: 26px;
      box-shadow: 0 1px 6px rgba(10,22,40,0.07);
      border: 1px solid ${C.border};
      margin-bottom: 18px;
    }
    .slt-card-sm {
      background: ${C.white};
      border-radius: 12px;
      padding: 18px;
      box-shadow: 0 1px 4px rgba(10,22,40,0.06);
      border: 1px solid ${C.border};
    }

    /* STAT CARDS */
    .slt-stat {
      background: ${C.white};
      border-radius: 14px;
      padding: 20px 22px;
      border: 1px solid ${C.border};
      box-shadow: 0 1px 6px rgba(10,22,40,0.06);
      transition: all 0.2s;
    }
    .slt-stat:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(30,136,229,0.12); }

    /* INPUTS */
    .slt-input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid ${C.border};
      border-radius: 9px;
      font-size: 14px;
      color: ${C.textDark};
      background: ${C.white};
      outline: none;
      font-family: 'Mulish', sans-serif;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .slt-input:focus { border-color: ${C.blue}; box-shadow: 0 0 0 3px ${C.blue}18; }

    /* BUTTONS */
    .slt-btn-primary {
      background: linear-gradient(135deg, ${C.blue}, ${C.teal});
      color: #fff;
      border: none;
      border-radius: 9px;
      padding: 12px 22px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
      transition: all 0.2s;
      letter-spacing: 0.2px;
    }
    .slt-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(30,136,229,0.35); }
    .slt-btn-secondary {
      background: ${C.white};
      color: ${C.blue};
      border: 1.5px solid ${C.blue};
      border-radius: 9px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
      transition: all 0.18s;
    }
    .slt-btn-secondary:hover { background: ${C.blueLight}; }
    .slt-btn-danger {
      background: ${C.white};
      color: ${C.red};
      border: 1.5px solid ${C.red};
      border-radius: 9px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
    }
    .slt-btn-ghost {
      background: transparent;
      color: ${C.textMed};
      border: 1.5px solid ${C.border};
      border-radius: 9px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
    }
    .slt-btn-complete {
      background: linear-gradient(135deg, ${C.green}, #00695C);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
      letter-spacing: 0.2px;
      transition: all 0.18s;
    }
    .slt-btn-complete:hover { opacity: 0.88; transform: scale(1.03); }
    .slt-btn-reopen {
      background: ${C.orange}18;
      color: ${C.orange};
      border: 1.5px solid ${C.orange}60;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Mulish', sans-serif;
    }

    /* LABEL */
    .slt-label { display: block; font-size: 12.5px; font-weight: 700; color: ${C.textMed}; margin-bottom: 5px; font-family: 'Mulish', sans-serif; letter-spacing: 0.2px; }

    /* BADGES */
    .slt-badge-green  { display:inline-block; background:${C.green}18;  color:${C.green};  border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Mulish',sans-serif; }
    .slt-badge-orange { display:inline-block; background:${C.orange}18; color:${C.orange}; border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Mulish',sans-serif; }
    .slt-badge-blue   { display:inline-block; background:${C.blue}18;   color:${C.blue};   border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Mulish',sans-serif; }
    .slt-badge-red    { display:inline-block; background:${C.red}18;    color:${C.red};    border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Mulish',sans-serif; }

    /* DIVIDER */
    .slt-divider { border: none; border-top: 1px solid ${C.border}; margin: 18px 0; }

    /* SECTION TITLE */
    .slt-section-title { font-family: 'Sora', sans-serif; font-size: 18px; font-weight: 800; color: ${C.textDark}; margin-bottom: 4px; }
    .slt-section-sub { font-size: 13.5px; color: ${C.textMed}; margin-bottom: 20px; }

    /* ACTIVE BANNER */
    .slt-active-banner {
      background: linear-gradient(90deg, #FFF8E1, #FFFBF0);
      border: 1.5px solid #FFB300;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    /* LOAD CARD */
    .slt-load-card {
      background: ${C.white};
      border-radius: 14px;
      padding: 18px 20px;
      box-shadow: 0 1px 6px rgba(10,22,40,0.07);
      border: 1px solid ${C.border};
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.18s;
    }
    .slt-load-card:hover { box-shadow: 0 5px 20px rgba(30,136,229,0.12); transform: translateY(-1px); }

    /* CHAT BUBBLES */
    .slt-bubble-me    { background: linear-gradient(135deg, ${C.blue}, ${C.teal}); color: #fff; border-radius: 14px 14px 4px 14px; padding: 10px 14px; font-size: 13px; line-height: 1.5; }
    .slt-bubble-other { background: ${C.offWhite}; color: ${C.textDark}; border: 1px solid ${C.border}; border-radius: 14px 14px 14px 4px; padding: 10px 14px; font-size: 13px; line-height: 1.5; }

    /* ANIMATIONS */
    @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .slt-fade-up { animation: fadeUp 0.28s ease forwards; }

    /* AUTH */
    .slt-auth-bg {
      min-height: 100vh;
      background: linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 50%, #1a3058 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: 'Mulish', sans-serif;
      position: relative;
      overflow: hidden;
    }
    .slt-auth-bg::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 20% 80%, ${C.teal}18 0%, transparent 50%),
                  radial-gradient(ellipse at 80% 20%, ${C.blue}20 0%, transparent 50%);
      pointer-events: none;
    }
    .slt-auth-card {
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 36px 32px;
      width: 100%;
      max-width: 440px;
      position: relative;
    }

    @media (max-width: 640px) {
      .slt-dropdown { width: calc(100vw - 32px); left: -16px; }
      .slt-dropdown-grid { grid-template-columns: 1fr; }
      .slt-hero-title { font-size: 22px; }
    }
  `}</style>
);

// ─── NAV BAR with Dropdown ────────────────────────────────────────────────────
function NavBar({ session, tab, setTab, setShowSettings, onLogout, isOwner, unreadMessages, navItems }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = navItems || [];
  const filtered = search.trim() ? items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())) : items;
  const activeItem = items.find(i => i.id === tab) || items[0];
  const initials = (session.fullName || session.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Group items into sections for owner
  const coreIds = ["dashboard","log","new","expenses","drivers","messages","fuel_finder","profit","maintenance","report"];
  const premiumIds = ["ifta","payroll","analytics","documents","loadboard","tax","emergency"];
  const coreItems = filtered.filter(i => coreIds.includes(i.id));
  const premiumItems = filtered.filter(i => premiumIds.includes(i.id));

  return (
    <nav className="slt-nav">
      <div className="slt-logo-area">
        <SLTLogo size={46} />
        <div className="slt-brand">
          <span className="slt-brand-main">Smart Load</span>
          <span className="slt-brand-sub">Tracking</span>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <button ref={triggerRef} className={`slt-menu-trigger${open ? " open" : ""}`} onClick={() => setOpen(o => !o)}>
          <span style={{ fontSize: 16 }}>☰</span>
          Menu
          <svg className={`slt-menu-chevron${open ? " open" : ""}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {unreadMessages > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>{unreadMessages}</span>}
        </button>

        {open && (
          <>
            <div className="slt-dropdown-overlay" onClick={() => setOpen(false)} />
            <div className="slt-dropdown" ref={dropRef} style={{ width: 400 }}>
              {/* Search */}
              <div style={{ padding: "12px 14px 8px" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, fontFamily: "'Mulish',sans-serif", outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Core */}
              {coreItems.length > 0 && (
                <>
                  <div className="slt-dropdown-header">Core Features</div>
                  <div className="slt-dropdown-grid">
                    {coreItems.map(item => (
                      <button key={item.id} className={`slt-menu-item${tab === item.id ? " active" : ""}`} onClick={() => { setTab(item.id); setOpen(false); setSearch(""); }}>
                        <span style={{ fontSize: 18 }}>{item.icon}</span>
                        <span style={{ fontSize: 12.5 }}>{item.label}</span>
                        {item.badge > 0 && <span className="slt-item-badge">{item.badge}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Premium */}
              {premiumItems.length > 0 && (
                <>
                  <div className="slt-dropdown-header" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 4 }}>
                    <span style={{ color: C.teal }}>★</span> Premium Features
                  </div>
                  <div className="slt-dropdown-grid">
                    {premiumItems.map(item => (
                      <button key={item.id} className={`slt-menu-item${tab === item.id ? " active" : ""}`} onClick={() => { setTab(item.id); setOpen(false); setSearch(""); }}
                        style={tab === item.id ? {} : { borderColor: `${C.teal}20` }}>
                        <span style={{ fontSize: 18 }}>{item.icon}</span>
                        <span style={{ fontSize: 12.5 }}>{item.label}</span>
                        {item.id === "emergency" && <span style={{ position: "absolute", top: 6, right: 6, background: C.red, borderRadius: 3, padding: "1px 4px", fontSize: 8, fontWeight: 800, color: "#fff" }}>🆘</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {isOwner && (
                <div className="slt-dropdown-footer">
                  <button className="slt-btn-secondary" style={{ flex: 1, fontSize: 12, padding: "8px" }} onClick={() => { setShowSettings(true); setOpen(false); setSearch(""); }}>⚙ Settings</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="slt-active-pill">
        <span>{activeItem?.icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{activeItem?.label}</span>
        {premiumIds.includes(tab) && <span style={{ background: C.teal, color: "#fff", borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 800, marginLeft: 2 }}>PRO</span>}
      </div>

      <div className="slt-nav-right">
        <div className="slt-user-chip">
          <div className="slt-user-avatar">{initials}</div>
          <div>
            <div className="slt-user-name">{(session.fullName || session.name)?.split(" ")[0]}</div>
            <div className="slt-user-role">{isOwner ? "Owner" : "Driver"}</div>
          </div>
        </div>
        <button className="slt-logout-btn" onClick={onLogout}>Sign Out</button>
      </div>
    </nav>
  );
}


// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("owner");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [pass, setPass] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState("");

  const submit = () => {
    const users = getUsers();
    if (mode === "login") {
      const u = Object.values(users).find(u => u.name === username && u.passHash === hashPass(pass));
      if (!u) return setMsg("Wrong username or password.");
      const sess = { uid: u.uid, name: u.name, fullName: u.fullName || u.name, role: u.role, ownerUid: u.ownerUid || u.uid };
      saveSession(sess); onLogin(sess);
    } else {
      if (!username.trim() || !pass.trim() || !fullName.trim()) return setMsg("All fields required.");
      if (Object.values(users).find(u => u.name === username)) return setMsg("Username already taken.");
      let ownerUid = null;
      if (role === "driver") {
        const owner = Object.values(users).find(u => u.role === "owner" && u.inviteCode === invite.trim().toUpperCase());
        if (!owner) return setMsg("Invalid invite code.");
        ownerUid = owner.uid;
      }
      const uid = username + Date.now();
      const newUser = { uid, name: username, fullName: fullName.trim(), role, passHash: hashPass(pass), ownerUid: ownerUid || uid, inviteCode: role === "owner" ? genCode() : null };
      users[uid] = newUser;
      saveUsers(users);
      const sess = { uid, name: username, fullName: fullName.trim(), role, ownerUid: newUser.ownerUid };
      saveSession(sess); onLogin(sess);
    }
  };

  const authInput = { width: "100%", padding: "12px 15px", border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.07)", outline: "none", fontFamily: "'Mulish',sans-serif", marginBottom: 14, boxSizing: "border-box" };
  const authLabel = { display: "block", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontFamily: "'Mulish',sans-serif", letterSpacing: 0.3 };

  return (
    <div className="slt-auth-bg">
      <div style={{ width: "100%", maxWidth: 440, position: "relative" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "14px 28px", marginBottom: 16 }}>
            <SLTLogo size={56} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Smart Load</div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Tracking</div>
              <div style={{ fontFamily: "'Mulish',sans-serif", fontSize: 10, fontWeight: 700, color: C.teal, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>Fleet Intelligence Platform</div>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "'Mulish',sans-serif" }}>Dispatch · Track · Deliver</p>
        </div>

        {/* Card */}
        <div className="slt-auth-card">
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
            {[["login","Sign In"],["register","Create Account"]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setMsg(""); }}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: mode === m ? "#fff" : "transparent", color: mode === m ? C.navy : "rgba(255,255,255,0.6)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Mulish',sans-serif", transition: "all 0.2s" }}>
                {l}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[["owner","🔑 Owner"],["driver","🚛 Driver"]].map(([r, l]) => (
                <button key={r} onClick={() => setRole(r)}
                  style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${role === r ? C.teal : "rgba(255,255,255,0.15)"}`, background: role === r ? `${C.teal}22` : "transparent", color: role === r ? C.teal : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Mulish',sans-serif" }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {mode === "register" && (
            <div><label style={authLabel}>Full Name</label><input className="slt-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={authInput} /></div>
          )}
          <div><label style={authLabel}>Username</label><input className="slt-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" style={authInput} /></div>
          <div><label style={authLabel}>Password</label><input className="slt-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter password" style={authInput} /></div>
          {mode === "register" && role === "driver" && (
            <div><label style={authLabel}>Owner Invite Code</label><input className="slt-input" value={invite} onChange={e => setInvite(e.target.value.toUpperCase())} placeholder="6-LETTER CODE" style={{ ...authInput, textTransform: "uppercase", letterSpacing: 6, textAlign: "center", fontSize: 16 }} /></div>
          )}

          {msg && <div style={{ background: "rgba(229,57,53,0.15)", border: "1px solid rgba(229,57,53,0.35)", borderRadius: 9, padding: "10px 14px", color: "#ff8a80", fontSize: 13, marginBottom: 14, fontFamily: "'Mulish',sans-serif" }}>{msg}</div>}

          <button className="slt-btn-primary" onClick={submit} style={{ width: "100%", padding: "13px", fontSize: 15, borderRadius: 10 }}>
            {mode === "login" ? "→ Sign In" : "→ Create Account"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button onClick={() => { if (window.confirm("Delete ALL data permanently?")) { Object.keys(localStorage).filter(k => k.startsWith("tp-")).forEach(k => localStorage.removeItem(k)); setMsg("Data cleared."); } }}
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: "'Mulish',sans-serif" }}>Reset All Data</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardTab({ session, loads, rates, isOwner, setTab, allDrivers, trucks }) {
  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid);
  const active = myLoads.filter(l => !l.completed);
  const done = myLoads.filter(l => l.completed);
  const gross = myLoads.reduce((s, l) => { const wm = (Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); return s+Number(l.earnings||0)+wm/60*(Number(rates.companyWaitRate)||0); }, 0);
  const drvPay = myLoads.reduce((s, l) => { const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0); }, 0);
  const totalExp = getStored(expensesKey(session.uid)).reduce((s,e) => s+Number(e.amount||0), 0);
  const recent = [...myLoads].sort((a,b)=>b.date>a.date?1:-1).slice(0,6);
  const today = todayStr();
  const todayLoads = myLoads.filter(l => l.date===today);

  const statColor = [C.orange, C.green, C.blue, C.purple];
  const stats = isOwner
    ? [["Active Loads", active.length, "⬤", "log"], ["Completed", done.length, "✓", "log"], ["Gross Income", fmtC(gross), "💰", "report"], ["Drivers", allDrivers.length, "👥", "drivers"]]
    : [["Active Loads", active.length, "⬤", "log"], ["Completed", done.length, "✓", "log"], ["Total Pay", fmtC(drvPay), "💰", "report"], ["My Expenses", fmtC(totalExp), "🧾", "expenses"]];

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">Welcome back, {(session.fullName||session.name).split(" ")[0]} 👋</div>
        <div className="slt-hero-sub">Smart Load Tracking — Fleet Intelligence Platform</div>
      </div>
      <div className="slt-container">
        {active.length > 0 && (
          <div className="slt-active-banner slt-fade-up">
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: C.orange, fontSize: 14, fontFamily: "'Sora',sans-serif" }}>{active.length} Active Load{active.length!==1?"s":""} In Progress</div>
              <div style={{ fontSize: 12, color: C.textMed }}>Don't forget to mark loads complete when delivered</div>
            </div>
            <button className="slt-btn-primary" style={{ width: "auto", padding: "8px 16px", fontSize: 12 }} onClick={() => setTab("log")}>View Active →</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 28 }}>
          {stats.map(([label, value, icon, goTab], i) => (
            <div key={label} className="slt-stat slt-fade-up" style={{ borderTop: `4px solid ${statColor[i]}`, animationDelay: `${i*0.06}s` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMed, marginBottom: 8, fontFamily: "'Mulish',sans-serif", letterSpacing: 0.3 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.textDark, marginBottom: 6, fontFamily: "'Sora',sans-serif" }}>{value}</div>
              <button className="slt-btn-secondary" style={{ width: "100%", padding: "7px", fontSize: 12 }} onClick={() => setTab(goTab)}>View →</button>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="slt-card">
            <div className="slt-section-title" style={{ marginBottom: 14 }}>📅 Today</div>
            {todayLoads.length === 0
              ? <div style={{ textAlign: "center", padding: "20px 0", color: C.textLight, fontSize: 13 }}>No loads today</div>
              : todayLoads.map(l => (
                <div key={l.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.location}</div>
                    <div style={{ fontSize: 11.5, color: C.textLight }}>{l.time||"—"}</div>
                  </div>
                  <span className={l.completed ? "slt-badge-green" : "slt-badge-orange"}>{l.completed ? "Done" : "Active"}</span>
                </div>
              ))
            }
            <button className="slt-btn-primary" style={{ width: "100%", marginTop: 14, padding: "10px" }} onClick={() => setTab("new")}>+ New Load</button>
          </div>
          <div className="slt-card">
            <div className="slt-section-title" style={{ marginBottom: 14 }}>🕐 Recent Loads</div>
            {recent.length === 0
              ? <div style={{ textAlign: "center", padding: "20px 0", color: C.textLight, fontSize: 13 }}>No loads yet</div>
              : recent.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{l.location}</div>
                    <div style={{ fontSize: 11, color: C.textLight }}>{l.date}</div>
                  </div>
                  <span className={l.completed ? "slt-badge-green" : "slt-badge-orange"}>{l.completed ? "Done" : "Active"}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Quick actions */}
        <div className="slt-card" style={{ marginTop: 18 }}>
          <div className="slt-section-title" style={{ marginBottom: 14 }}>⚡ Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
            {(isOwner
              ? [["Post Load","new","📋"],["Report","report","📊"],["Drivers","drivers","👥"],["Expenses","expenses","🧾"],["Messages","messages","💬"],["Fuel","fuel_finder","⛽"]]
              : [["Log Load","new","📋"],["Report","report","📊"],["Expenses","expenses","🧾"],["Messages","messages","💬"],["Fuel","fuel_finder","⛽"],["Pay Calc","profit","💰"]]
            ).map(([label,goTab,icon]) => (
              <button key={label} onClick={() => setTab(goTab)}
                style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 11, padding: "14px 8px", cursor: "pointer", textAlign: "center", fontFamily: "'Mulish',sans-serif", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.blueLight; e.currentTarget.style.borderColor = C.blue; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; e.currentTarget.style.borderColor = C.border; }}>
                <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textDark }}>{label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HAUL LOG ─────────────────────────────────────────────────────────────────
function HaulLogTab({ session, loads, rates, isOwner, trucks, setTab, setEditLoad, deleteLoad, setDetailLoad, toggleComplete }) {
  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid===session.uid||l.addedBy===session.uid);
  const [filter, setFilter] = useState("active");
  const filtered = myLoads.filter(l => filter==="active"?!l.completed:filter==="done"?l.completed:true).sort((a,b)=>b.date>a.date?1:-1);
  const activeCount = myLoads.filter(l=>!l.completed).length;

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">{isOwner?"Haul Log":"My Loads"}</div>
        <div className="slt-hero-sub">{myLoads.length} total · <span style={{color:"#FFD54F",fontWeight:700}}>{activeCount} active</span></div>
      </div>
      <div className="slt-container">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12 }}>
          <div style={{ display:"flex",gap:8 }}>
            {[["active","⬤ Active"],["done","✓ Done"],["all","All"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} className="slt-btn-secondary"
                style={{ background:filter===v?(v==="active"?C.orange:v==="done"?C.green:C.blue):"#fff", color:filter===v?"#fff":C.textMed, borderColor:filter===v?(v==="active"?C.orange:v==="done"?C.green:C.blue):C.border, padding:"8px 16px" }}>
                {l}{v==="active"&&activeCount>0?` (${activeCount})`:""}
              </button>
            ))}
          </div>
          <button className="slt-btn-primary" style={{ width:"auto",padding:"10px 22px" }} onClick={()=>{setEditLoad(null);setTab("new");}}>+ {isOwner?"Post Load":"Log Load"}</button>
        </div>

        {filtered.length===0
          ? <div className="slt-card" style={{ textAlign:"center",padding:"56px 24px" }}><div style={{fontSize:48,marginBottom:14}}>{filter==="active"?"✅":"🚛"}</div><div style={{color:C.textMed,fontWeight:600}}>{filter==="active"?"All clear — no active loads!":"No loads found"}</div></div>
          : filtered.map(l => {
            const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
            const truck=trucks.find(t=>t.id===l.truckId);
            const waitOwner=wm/60*(Number(rates.companyWaitRate)||0);
            const waitDrv=wm/60*(Number(rates.driverWaitRate)||0);
            const amt=isOwner?Number(l.earnings||0)+waitOwner:Number(l.driverBasePay||0)+waitDrv;
            return (
              <div key={l.id} className="slt-load-card slt-fade-up" style={{ borderLeft:`4px solid ${l.completed?C.green:C.orange}` }} onClick={()=>setDetailLoad(l)}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap" }}>
                      {l.tmwLoadNumber&&<span className="slt-badge-blue" style={{fontSize:10}}>Load #{l.tmwLoadNumber}</span>}
                      <span className={l.completed?"slt-badge-green":"slt-badge-orange"}>{l.completed?"✓ Done":"⬤ Active"}</span>
                    </div>
                    <div style={{ fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:16,marginBottom:4 }}>{l.location}</div>
                    <div style={{ fontSize:12.5,color:C.textLight }}>{l.date}{l.time?` · ${l.time}`:""}{truck?` · Truck ${truck.truckNumber}`:""}{isOwner&&l.driverFullName?` · ${l.driverFullName}`:""}</div>
                    {wm>0&&<div style={{fontSize:12,color:C.orange,marginTop:4}}>⏱ Wait: {fmt(wm)}</div>}
                    {l.messages&&l.messages.length>0&&<div style={{fontSize:11.5,color:C.blue,marginTop:4}}>💬 {l.messages.length} note{l.messages.length!==1?"s":""}</div>}
                  </div>
                  <div style={{ textAlign:"right",marginLeft:16,flexShrink:0 }}>
                    <div style={{ fontFamily:"'Sora',sans-serif",fontSize:20,fontWeight:800,color:C.blue }}>{fmtC(amt)}</div>
                    <div style={{ display:"flex",gap:6,marginTop:8,justifyContent:"flex-end",flexWrap:"wrap" }}>
                      {!l.completed
                        ? <button className="slt-btn-complete" onClick={e=>{e.stopPropagation();toggleComplete(l.id,true);}}>✓ Complete</button>
                        : <button className="slt-btn-reopen" onClick={e=>{e.stopPropagation();toggleComplete(l.id,false);}}>↩ Reopen</button>
                      }
                      <button className="slt-btn-secondary" style={{padding:"6px 11px",fontSize:11.5}} onClick={e=>{e.stopPropagation();setEditLoad(l);setTab("new");}}>Edit</button>
                      <button className="slt-btn-danger" style={{padding:"6px 11px",fontSize:11.5}} onClick={e=>{e.stopPropagation();if(window.confirm("Delete?"))deleteLoad(l.id);}}>Del</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ─── LOAD FORM ────────────────────────────────────────────────────────────────
function LoadFormTab({ session, isOwner, rates, allRoutes, trucks, onSave, editLoad, onCancel }) {
  const blank = { date:todayStr(),time:"",location:"",loadWaitMins:"",offloadWaitMins:"",earnings:"",driverBasePay:"",assignedDriverUid:"",fuelLitres:"",fuelPricePerLitre:"",fuelTotal:"",note:"",truckId:"",driverFullName:"",tmwLoadNumber:"",completed:false };
  const [form, setForm] = useState(editLoad?{...blank,...editLoad}:blank);
  const [section, setSection] = useState("details");
  const [loadStatus,setLoadStatus]=useState(null); const [offStatus,setOffStatus]=useState(null);
  const [loadElapsed,setLoadElapsed]=useState(0); const [offElapsed,setOffElapsed]=useState(0);
  const loadRef=useRef(null); const loadStart=useRef(0); const offRef=useRef(null); const offStart=useRef(0);

  const startTimer=(k)=>{ if(k==="load"){loadStart.current=Date.now()-loadElapsed*1000;setLoadStatus("running");loadRef.current=setInterval(()=>setLoadElapsed(Math.floor((Date.now()-loadStart.current)/1000)),1000);}else{offStart.current=Date.now()-offElapsed*1000;setOffStatus("running");offRef.current=setInterval(()=>setOffElapsed(Math.floor((Date.now()-offStart.current)/1000)),1000);}};
  const stopTimer=(k)=>{ if(k==="load"){clearInterval(loadRef.current);setLoadStatus("stopped");setForm(f=>({...f,loadWaitMins:Math.floor(loadElapsed/60).toString()}));}else{clearInterval(offRef.current);setOffStatus("stopped");setForm(f=>({...f,offloadWaitMins:Math.floor(offElapsed/60).toString()}));}};
  const resetTimer=(k)=>{ if(k==="load"){clearInterval(loadRef.current);setLoadStatus(null);setLoadElapsed(0);}else{clearInterval(offRef.current);setOffStatus(null);setOffElapsed(0);}};
  useEffect(()=>()=>{clearInterval(loadRef.current);clearInterval(offRef.current);},[]);

  const users=getUsers(); const ownerUid=session.ownerUid||session.uid;
  const drivers=Object.values(users).filter(u=>u.role==="driver"&&u.ownerUid===ownerUid);
  const hc=(e)=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const getRD=(loc)=>allRoutes.find(r=>`${r.from} → ${r.to}`===loc);

  const handleRoute=(val)=>{ if(!val){setForm(f=>({...f,location:"",driverBasePay:"",earnings:""}));return;} const rd=getRD(val); if(rd)setForm(f=>({...f,location:val,driverBasePay:rd.pay.toString(),earnings:rd.rate>0?rd.rate.toString():""})); else setForm(f=>({...f,location:val})); };
  useEffect(()=>{ if(!form.truckId&&trucks.length===1)setForm(f=>({...f,truckId:trucks[0].id})); },[trucks.length]);

  const wm=(Number(form.loadWaitMins)||0)+(Number(form.offloadWaitMins)||0);
  const wComp=parseFloat((wm/60*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const wDrv=parseFloat((wm/60*(Number(rates.driverWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(form.earnings)||0)+wComp).toFixed(2));
  const dPay=parseFloat(((Number(form.driverBasePay)||0)+wDrv).toFixed(2));
  const net=parseFloat((gross-dPay).toFixed(2));

  const submit=()=>{
    if(!form.location)return;
    const rd=getRD(form.location);
    let finalEarn=Number(form.earnings)||(rd?.rate?Number(rd.rate):Number(rates.perLoadRate)||0);
    let drvName=!isOwner?(session.fullName||session.name):form.driverFullName;
    if(isOwner&&form.assignedDriverUid){const d=users[form.assignedDriverUid];drvName=d?(d.fullName||d.name):"";}
    let num=form.tmwLoadNumber;
    if(!editLoad&&!num){const sk=`tp-seq-${ownerUid}`;const last=parseInt(localStorage.getItem(sk)||"1000",10);const next=last+1;localStorage.setItem(sk,next.toString());num=next.toString();}
    onSave({...form,earnings:finalEarn,driverFullName:drvName,tmwLoadNumber:num,id:editLoad?.id||Date.now().toString(),addedBy:session.uid});
  };

  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">{editLoad?"Edit Load":"Post New Load"}</div><div className="slt-hero-sub">Fill in load details below</div></div>
      <div className="slt-container-sm">
        <div style={{ display:"flex",gap:8,marginBottom:20 }}>
          {[["details","Load Details"],["wait","⏱ Wait"],["fuel","⛽ Fuel"]].map(([v,l])=>(
            <button key={v} onClick={()=>setSection(v)} className="slt-btn-secondary"
              style={{ flex:1,background:section===v?C.blue:"#fff",color:section===v?"#fff":C.textMed,borderColor:section===v?C.blue:C.border,padding:"9px 8px",fontSize:13 }}>{l}</button>
          ))}
        </div>

        {section==="details"&&(
          <div className="slt-card">
            {isOwner&&drivers.length>0&&(
              <div style={{marginBottom:16}}><label className="slt-label">Assign Driver</label>
                <select name="assignedDriverUid" value={form.assignedDriverUid} onChange={hc} className="slt-input">
                  <option value="">— Owner Operator —</option>
                  {drivers.map(d=><option key={d.uid} value={d.uid}>{d.fullName||d.name}</option>)}
                </select></div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              <div><label className="slt-label">Date</label><input name="date" type="date" value={form.date} onChange={hc} className="slt-input"/></div>
              <div><label className="slt-label">Arrival Time</label><input name="time" type="time" value={form.time} onChange={hc} className="slt-input"/></div>
            </div>
            <div style={{marginBottom:14}}><label className="slt-label">Route</label>
              {allRoutes.length===0
                ? <div style={{background:C.blueLight,borderRadius:9,padding:"12px 16px",fontSize:13,color:C.blue}}>{isOwner?"No routes yet. Add in ⚙ Settings.":"No routes available."}</div>
                : <select value={form.location} onChange={e=>handleRoute(e.target.value)} className="slt-input">
                    <option value="">— Select Route —</option>
                    {allRoutes.map((r,i)=><option key={i} value={`${r.from} → ${r.to}`}>{r.from} → {r.to}{isOwner?` (Driver: ${fmtC(r.pay)})`:""}</option>)}
                  </select>
              }
            </div>
            {trucks.length>0&&<div style={{marginBottom:14}}><label className="slt-label">Truck</label>
              <select value={form.truckId} onChange={e=>{const t=trucks.find(x=>x.id===e.target.value);setForm(f=>({...f,truckId:e.target.value,trailerNumber:t?.trailerNumber||f.trailerNumber}));}} className="slt-input">
                <option value="">— Select truck —</option>
                {trucks.map(t=><option key={t.id} value={t.id}>TMW #{t.tmwNumber} · Truck {t.truckNumber}</option>)}
              </select></div>
            }
            {isOwner&&form.location&&(
              <>
                <div style={{marginBottom:14}}><label className="slt-label">Load Earnings ($)</label><input name="earnings" type="number" step="0.01" placeholder="0.00" value={form.earnings} onChange={hc} className="slt-input"/></div>
                <div style={{background:C.offWhite,borderRadius:11,padding:16,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["Gross",fmtC(gross),C.green],["Driver Pay",fmtC(dPay),C.blue],["Wait Co.",fmtC(wComp),C.orange],["Net",fmtC(net),net>=0?C.green:C.red]].map(([l,v,color])=>(
                    <div key={l} style={{background:"#fff",borderRadius:9,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,color:C.textLight,fontFamily:"'Mulish',sans-serif"}}>{l}</div>
                      <div style={{fontSize:15,fontWeight:800,color,fontFamily:"'Sora',sans-serif",marginTop:2}}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Status toggle */}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,background:form.completed?"#E8F5E9":"#FFF8E1",borderRadius:11,padding:"12px 16px",border:`1.5px solid ${form.completed?C.green:C.orange}`}}>
              <span style={{fontSize:20}}>{form.completed?"✅":"⏳"}</span>
              <div style={{flex:1}}><div style={{fontWeight:800,color:form.completed?C.green:C.orange,fontSize:13.5,fontFamily:"'Sora',sans-serif"}}>{form.completed?"Completed":"Active / In Progress"}</div><div style={{fontSize:11.5,color:C.textMed}}>Click to toggle status</div></div>
              <button onClick={()=>setForm(f=>({...f,completed:!f.completed}))} className={form.completed?"slt-btn-reopen":"slt-btn-complete"}>{form.completed?"↩ Mark Active":"✓ Mark Complete"}</button>
            </div>
            <div style={{marginBottom:18}}><label className="slt-label">Notes</label><input name="note" value={form.note} onChange={hc} placeholder="Additional notes..." className="slt-input"/></div>
            <div style={{display:"flex",gap:10}}>
              <button className="slt-btn-primary" style={{flex:1}} onClick={submit}>{editLoad?"Update Load":"Post Load"}</button>
              <button className="slt-btn-ghost" style={{padding:"12px 18px"}} onClick={onCancel}>Cancel</button>
            </div>
          </div>
        )}

        {section==="wait"&&(
          <div className="slt-card">
            <div className="slt-section-title">Wait Time Timers</div>
            <div className="slt-section-sub">Track load & offload wait live</div>
            {[{label:"Load Site",color:C.green,k:"load",elapsed:loadElapsed,status:loadStatus,mk:"loadWaitMins"},{label:"Offload Site",color:C.red,k:"off",elapsed:offElapsed,status:offStatus,mk:"offloadWaitMins"}].map(t=>(
              <div key={t.k} style={{background:C.offWhite,borderRadius:11,padding:16,marginBottom:14,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontWeight:700,fontSize:14}}>{t.label}</span>
                  <span style={{fontFamily:"monospace",fontSize:22,fontWeight:700,color:t.status==="running"?t.color:C.textMed}}>{secsToHMS(t.elapsed)}</span>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {t.status!=="running"&&<button onClick={()=>startTimer(t.k)} className="slt-btn-secondary" style={{borderColor:t.color,color:t.color,flex:1,padding:"8px"}}>▶ Start</button>}
                  {t.status==="running"&&<button onClick={()=>stopTimer(t.k)} className="slt-btn-secondary" style={{borderColor:C.red,color:C.red,flex:1,padding:"8px"}}>⏹ Stop</button>}
                  {t.status&&<button onClick={()=>resetTimer(t.k)} className="slt-btn-ghost" style={{padding:"8px 12px"}}>↺</button>}
                </div>
                <label className="slt-label" style={{fontSize:11.5}}>Or enter minutes manually</label>
                <input type="number" name={t.mk} placeholder="0" value={form[t.mk]} onChange={hc} className="slt-input" style={{fontSize:16}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:10}}><button className="slt-btn-primary" style={{flex:1}} onClick={submit}>Save</button><button className="slt-btn-ghost" style={{padding:"12px 16px"}} onClick={onCancel}>Cancel</button></div>
          </div>
        )}

        {section==="fuel"&&(
          <div className="slt-card">
            <div className="slt-section-title">Fuel Log</div>
            <div className="slt-section-sub">Auto-calculates litres × price</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
              <div><label className="slt-label">Litres</label><input name="fuelLitres" type="number" placeholder="0" value={form.fuelLitres} onChange={e=>{const l=e.target.value;const a=(Number(l)||0)*(Number(form.fuelPricePerLitre)||0);setForm(f=>({...f,fuelLitres:l,fuelTotal:a>0?a.toFixed(2):f.fuelTotal}));}} className="slt-input"/></div>
              <div><label className="slt-label">Price/L ($)</label><input name="fuelPricePerLitre" type="number" step="0.001" placeholder="1.85" value={form.fuelPricePerLitre} onChange={e=>{const p=e.target.value;const a=(Number(form.fuelLitres)||0)*(Number(p)||0);setForm(f=>({...f,fuelPricePerLitre:p,fuelTotal:a>0?a.toFixed(2):f.fuelTotal}));}} className="slt-input"/></div>
            </div>
            {Number(form.fuelLitres)>0&&Number(form.fuelPricePerLitre)>0&&<div style={{background:C.blueLight,borderRadius:9,padding:"12px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:C.blue}}>{form.fuelLitres}L × ${Number(form.fuelPricePerLitre).toFixed(3)}</span><span style={{fontSize:20,fontWeight:800,color:C.blue,fontFamily:"'Sora',sans-serif"}}>{fmtC((Number(form.fuelLitres)||0)*(Number(form.fuelPricePerLitre)||0))}</span></div>}
            <div style={{marginBottom:18}}><label className="slt-label">Total Fuel Cost ($)</label><input name="fuelTotal" type="number" step="0.01" value={form.fuelTotal} onChange={hc} className="slt-input" style={{fontSize:18}}/></div>
            <div style={{display:"flex",gap:10}}><button className="slt-btn-primary" style={{flex:1}} onClick={submit}>Save</button><button className="slt-btn-ghost" style={{padding:"12px 16px"}} onClick={onCancel}>Cancel</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOAD DETAIL MODAL ────────────────────────────────────────────────────────
function LoadDetailModal({ load, onClose, rates, isOwner, trucks, session, onToggleComplete, onGenerateInvoice, onAddNote }) {
  const wm=(Number(load.loadWaitMins)||0)+(Number(load.offloadWaitMins)||0);
  const wComp=parseFloat((wm/60*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const wDrv=parseFloat((wm/60*(Number(rates.driverWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(load.earnings)||0)+wComp).toFixed(2));
  const dPay=parseFloat(((Number(load.driverBasePay)||0)+wDrv).toFixed(2));
  const net=parseFloat((gross-dPay).toFixed(2));
  const truck=trucks?.find(t=>t.id===load.truckId);
  const [note,setNote]=useState("");
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[load.messages?.length]);

  const handleSend=()=>{ if(!note.trim())return; onAddNote(load.id,note.trim(),session); setNote(""); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:500,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 28px 80px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,fontFamily:"'Sora',sans-serif"}}>Load Details</h2>
          <button className="slt-btn-ghost" style={{padding:"6px 12px"}} onClick={onClose}>✕</button>
        </div>

        <div style={{padding:24}}>
          {/* Status */}
          <div style={{background:load.completed?"#E8F5E9":"#FFF8E1",border:`1.5px solid ${load.completed?C.green:C.orange}`,borderRadius:12,padding:"12px 16px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,color:load.completed?C.green:C.orange,fontFamily:"'Sora',sans-serif",fontSize:14}}>{load.completed?"✅ Completed":"⏳ Active / In Progress"}</div>
              {truck&&<div style={{fontSize:12,color:C.textMed,marginTop:2}}>🚛 Truck {truck.truckNumber}</div>}
            </div>
            <button onClick={()=>onToggleComplete(load.id,!load.completed)} className={load.completed?"slt-btn-reopen":"slt-btn-complete"}>{load.completed?"↩ Reopen":"✓ Complete"}</button>
          </div>

          <div style={{background:C.blueLight,borderRadius:11,padding:14,marginBottom:18}}>
            <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:16,color:C.blue}}>{load.location}</div>
            {load.driverFullName&&<div style={{fontSize:12.5,color:C.textMed,marginTop:2}}>Driver: {load.driverFullName}</div>}
          </div>

          {[["Date",load.date],["Arrival",load.time||"—"],["Load #",load.tmwLoadNumber||"—"],["Wait",wm>0?fmt(wm):"—"],["Fuel",load.fuelTotal>0?fmtC(load.fuelTotal):"—"],["Note",load.note||"—"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.textMed}}>{l}</span>
              <span style={{fontSize:13,fontWeight:700}}>{v}</span>
            </div>
          ))}

          {isOwner&&(
            <div style={{background:C.offWhite,borderRadius:11,padding:14,marginTop:16}}>
              <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontFamily:"'Mulish',sans-serif"}}>Financials</div>
              {[["Earnings",fmtC(load.earnings||0),C.textDark],["Wait Co.",fmtC(wComp),C.orange],["Gross",fmtC(gross),C.green],["Driver Pay",fmtC(dPay),C.blue],["Net",fmtC(net),net>=0?C.green:C.red]].map(([l,v,color])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12.5,color:C.textMed}}>{l}</span>
                  <span style={{fontSize:13.5,fontWeight:800,color,fontFamily:"'Sora',sans-serif"}}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div style={{marginTop:20}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:10,fontFamily:"'Sora',sans-serif"}}>💬 Load Notes</div>
            {(!load.messages||load.messages.length===0)&&<div style={{color:C.textLight,fontSize:13,textAlign:"center",padding:"12px 0"}}>No notes yet</div>}
            {load.messages&&load.messages.map((m,i)=>{
              const isMe=m.authorUid===session.uid;
              return(
                <div key={i} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",marginBottom:8}}>
                  <div style={{maxWidth:"75%"}}>
                    <div style={{fontSize:10.5,color:C.textLight,marginBottom:3,textAlign:isMe?"right":"left"}}>{m.authorName} · {m.timestamp?.slice(0,10)}</div>
                    <div className={isMe?"slt-bubble-me":"slt-bubble-other"}>{m.text}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef}/>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <input className="slt-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note…" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter")handleSend();}}/>
              <button className="slt-btn-primary" style={{width:"auto",padding:"11px 16px"}} onClick={handleSend}>Send</button>
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginTop:20}}>
            {isOwner&&<button className="slt-btn-primary" style={{flex:1,background:`linear-gradient(135deg,${C.purple},#4A148C)`}} onClick={()=>onGenerateInvoice(load)}>📄 Invoice</button>}
            <button className="slt-btn-ghost" style={{flex:1,padding:"12px"}} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── INVOICE MODAL ────────────────────────────────────────────────────────────
function InvoiceModal({ load, onClose, rates, trucks, session }) {
  const wm=(Number(load.loadWaitMins)||0)+(Number(load.offloadWaitMins)||0);
  const wHrs=wm/60; const wComp=parseFloat((wHrs*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(load.earnings)||0)+wComp).toFixed(2));
  const truck=trucks?.find(t=>t.id===load.truckId);
  const users=getUsers(); const owner=users[session.ownerUid||session.uid];
  const invNum=`INV-${load.tmwLoadNumber||load.id?.slice(-4)||"0001"}`;

  const handlePrint=()=>{
    const content=document.getElementById("slt-invoice-content").innerHTML;
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>Invoice ${invNum}</title><style>body{font-family:Arial,sans-serif;color:#0D1F35;margin:0;padding:32px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:3px solid #1E88E5;padding-bottom:18px}.logo{font-size:22px;font-weight:900;color:#1E88E5}.num{font-size:26px;font-weight:700;text-align:right}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#F7F9FC;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#4A6080}td{padding:11px 12px;border-bottom:1px solid #E1E8F0;font-size:13.5px}.total td{font-weight:800;font-size:15px;background:#E3F2FD;color:#1565C0}.footer{text-align:center;color:#aaa;font-size:11px;margin-top:32px;border-top:1px solid #E1E8F0;padding-top:14px}</style></head><body>${content}</body></html>`);
    w.document.close(); w.focus(); setTimeout(()=>{w.print();w.close();},500);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 28px 80px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,fontFamily:"'Sora',sans-serif"}}>📄 Invoice Preview</h2>
          <div style={{display:"flex",gap:10}}>
            <button className="slt-btn-primary" style={{width:"auto",padding:"9px 18px"}} onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="slt-btn-ghost" style={{padding:"9px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div id="slt-invoice-content" style={{padding:28}}>
          <div className="header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,borderBottom:`3px solid ${C.blue}`,paddingBottom:18}}>
            <div>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,color:C.blue}}>🚛 Smart Load Tracking</div>
              <div style={{fontSize:13,color:C.textMed,marginTop:4}}>{owner?.fullName||"Owner Operator"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,color:C.textDark}}>{invNum}</div>
              <div style={{fontSize:12,color:C.textLight,marginTop:4}}>Issued: {todayStr()}</div>
              <div style={{marginTop:8}}><span className={load.completed?"slt-badge-green":"slt-badge-orange"}>{load.completed?"✓ Delivered":"⬤ In Progress"}</span></div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>
            <div>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:C.textLight,fontWeight:700,marginBottom:8}}>Load Info</div>
              <div style={{fontSize:13.5,color:C.textDark,lineHeight:1.9}}>
                <div><strong>Route:</strong> {load.location}</div><div><strong>Date:</strong> {load.date}</div>
                {load.time&&<div><strong>Arrival:</strong> {load.time}</div>}{load.tmwLoadNumber&&<div><strong>Load #:</strong> {load.tmwLoadNumber}</div>}
              </div>
            </div>
            <div>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:C.textLight,fontWeight:700,marginBottom:8}}>Equipment</div>
              <div style={{fontSize:13.5,color:C.textDark,lineHeight:1.9}}>
                {truck?<><div><strong>Truck:</strong> {truck.truckNumber}</div><div><strong>TMW #:</strong> {truck.tmwNumber}</div></>:<div>—</div>}
                {load.driverFullName&&<div><strong>Driver:</strong> {load.driverFullName}</div>}
              </div>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:20,fontSize:13.5}}>
            <thead><tr style={{background:C.offWhite}}>{["Description","Qty","Rate","Amount"].map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",letterSpacing:0.5,color:C.textMed,fontWeight:700}}>{h}</th>)}</tr></thead>
            <tbody>
              <tr style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:"11px 12px"}}>{load.location}</td><td>1 load</td><td>{fmtC(load.earnings||0)}</td><td style={{fontWeight:700}}>{fmtC(load.earnings||0)}</td></tr>
              {wComp>0&&<tr style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:"11px 12px"}}>Wait Time</td><td>{wHrs.toFixed(2)} hrs</td><td>{fmtC(rates.companyWaitRate)}/hr</td><td style={{fontWeight:700}}>{fmtC(wComp)}</td></tr>}
              {load.fuelTotal>0&&<tr style={{borderBottom:`1px solid ${C.border}`}}><td style={{padding:"11px 12px"}}>Fuel</td><td>{load.fuelLitres?`${load.fuelLitres}L`:"—"}</td><td>—</td><td style={{fontWeight:700}}>{fmtC(load.fuelTotal)}</td></tr>}
              <tr className="total" style={{background:C.blueLight}}><td colSpan={3} style={{padding:"11px 12px",fontWeight:800,fontSize:14}}>TOTAL</td><td style={{fontWeight:800,fontSize:17,color:C.blue,fontFamily:"'Sora',sans-serif"}}>{fmtC(gross)}</td></tr>
            </tbody>
          </table>
          {load.note&&<div style={{background:C.offWhite,borderRadius:9,padding:"11px 14px",marginBottom:20,fontSize:13,color:C.textMed,fontStyle:"italic"}}>📝 {load.note}</div>}
          <div style={{textAlign:"center",color:C.textLight,fontSize:11,marginTop:28,borderTop:`1px solid ${C.border}`,paddingTop:14}}>Generated by Smart Load Tracking · {todayStr()}</div>
        </div>
      </div>
    </div>
  );
}

// ─── MESSAGES TAB ─────────────────────────────────────────────────────────────
function MessagesTab({ session, loads, isOwner, onAddNote }) {
  const myLoads = isOwner?loads:loads.filter(l=>l.assignedDriverUid===session.uid||l.addedBy===session.uid);
  const threaded = myLoads.filter(l=>l.messages&&l.messages.length>0);
  const [selected,setSelected]=useState(null);
  const [note,setNote]=useState("");
  const [showPicker,setShowPicker]=useState(false);
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[selected?.messages?.length]);
  const current=selected?loads.find(l=>l.id===selected.id):null;
  const handleSend=()=>{ if(!note.trim()||!current)return; onAddNote(current.id,note.trim(),session); setNote(""); setSelected(loads.find(l=>l.id===current.id)); };

  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Messages & Notes</div><div className="slt-hero-sub">Load-level notes shared between owner and driver</div></div>
      <div className="slt-container">
        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:18,minHeight:520}}>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:14}}>Load Threads</span>
              <button className="slt-btn-secondary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setShowPicker(!showPicker)}>+ New</button>
            </div>
            {showPicker&&(
              <div className="slt-card" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:700,marginBottom:8}}>Pick a load:</div>
                {myLoads.slice(0,10).map(l=>(
                  <div key={l.id} onClick={()=>{setSelected(l);setShowPicker(false);}} style={{padding:"9px 10px",borderRadius:9,cursor:"pointer",fontSize:13,marginBottom:4,background:C.offWhite}} onMouseEnter={e=>e.currentTarget.style.background=C.blueLight} onMouseLeave={e=>e.currentTarget.style.background=C.offWhite}>
                    <div style={{fontWeight:700,fontSize:13}}>{l.location}</div>
                    <div style={{fontSize:11,color:C.textLight}}>#{l.tmwLoadNumber} · {l.date}</div>
                  </div>
                ))}
              </div>
            )}
            {threaded.length===0&&!showPicker&&<div className="slt-card" style={{textAlign:"center",padding:"28px 14px"}}><div style={{fontSize:32,marginBottom:8}}>💬</div><div style={{color:C.textLight,fontSize:13}}>No threads yet.</div></div>}
            {threaded.map(l=>{
              const last=l.messages[l.messages.length-1];
              const isSel=current?.id===l.id;
              return(
                <div key={l.id} onClick={()=>setSelected(l)} className="slt-card-sm" style={{marginBottom:8,cursor:"pointer",border:`1.5px solid ${isSel?C.blue:C.border}`,background:isSel?C.blueLight:C.white}}>
                  <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:13.5,marginBottom:2}}>{l.location}</div>
                  <div style={{fontSize:11,color:C.textLight,marginBottom:6}}>#{l.tmwLoadNumber} · {l.date}</div>
                  <div style={{fontSize:12,color:C.textMed,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><strong>{last?.authorName?.split(" ")[0]}:</strong> {last?.text}</div>
                  <div style={{fontSize:10.5,color:C.textLight,marginTop:3}}>{l.messages.length} note{l.messages.length!==1?"s":""}</div>
                </div>
              );
            })}
          </div>
          <div className="slt-card" style={{display:"flex",flexDirection:"column",padding:0,overflow:"hidden",minHeight:400}}>
            {!current?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.textLight,padding:40}}>
                <div style={{fontSize:44,marginBottom:14}}>💬</div>
                <div style={{fontWeight:700,marginBottom:6,fontFamily:"'Sora',sans-serif"}}>Select a load to view notes</div>
                <div style={{fontSize:13}}>Notes are shared between owner and driver</div>
              </div>
            ):(
              <>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,background:C.offWhite}}>
                  <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:15}}>{current.location}</div>
                  <div style={{fontSize:11.5,color:C.textLight}}>#{current.tmwLoadNumber} · {current.date} · <span style={{color:current.completed?C.green:C.orange,fontWeight:700}}>{current.completed?"Completed":"Active"}</span></div>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:18,display:"flex",flexDirection:"column",gap:10,minHeight:280}}>
                  {(!current.messages||current.messages.length===0)&&<div style={{textAlign:"center",color:C.textLight,padding:"28px 0",fontSize:13}}>No notes yet.</div>}
                  {current.messages&&current.messages.map((m,i)=>{
                    const isMe=m.authorUid===session.uid;
                    return(<div key={i} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                      <div style={{maxWidth:"72%"}}>
                        <div style={{fontSize:10.5,color:C.textLight,marginBottom:3,textAlign:isMe?"right":"left"}}>{m.authorName} · {m.timestamp?.slice(0,10)}</div>
                        <div className={isMe?"slt-bubble-me":"slt-bubble-other"}>{m.text}</div>
                      </div>
                    </div>);
                  })}
                  <div ref={endRef}/>
                </div>
                <div style={{padding:"12px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8}}>
                  <input className="slt-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Type a note…" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter")handleSend();}}/>
                  <button className="slt-btn-primary" style={{width:"auto",padding:"11px 18px"}} onClick={handleSend}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EXPENSES TAB ─────────────────────────────────────────────────────────────
function ExpensesTab({ session, isOwner }) {
  const CATS = isOwner
    ? [{id:"fuel",l:"Fuel",i:"⛽",c:C.orange},{id:"maintenance",l:"Maintenance",i:"🔧",c:C.red},{id:"insurance",l:"Insurance",i:"🛡",c:C.blue},{id:"permits",l:"Permits",i:"📄",c:C.purple},{id:"other",l:"Other",i:"📋",c:C.textMed}]
    : [{id:"meals",l:"Meals",i:"🍽",c:C.green},{id:"tolls",l:"Tolls",i:"🛣",c:C.blue},{id:"lodging",l:"Lodging",i:"🏨",c:C.purple},{id:"supplies",l:"Supplies",i:"🧰",c:C.orange},{id:"other",l:"Other",i:"📋",c:C.textMed}];
  const [expenses,setExpenses]=useState(getStored(expensesKey(session.uid)));
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({amount:"",category:CATS[0].id,merchant:"",note:"",date:todayStr()});
  const save=(arr)=>{setExpenses(arr);localStorage.setItem(expensesKey(session.uid),JSON.stringify(arr));};
  const add=()=>{ if(!form.amount||isNaN(parseFloat(form.amount)))return; save([{...form,amount:parseFloat(form.amount),id:Date.now().toString()},...expenses]); setForm({amount:"",category:CATS[0].id,merchant:"",note:"",date:todayStr()}); setShowAdd(false); };
  const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const byCat=CATS.map(c=>({...c,total:expenses.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount||0),0)})).filter(c=>c.total>0);
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Expenses</div><div className="slt-hero-sub">Total: {fmtC(total)}</div></div>
      <div className="slt-container">
        {byCat.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>{byCat.map(c=><div key={c.id} className="slt-card-sm" style={{borderTop:`4px solid ${c.c}`}}><div style={{fontSize:20,marginBottom:4}}>{c.i}</div><div style={{fontSize:12,color:C.textMed,fontWeight:700}}>{c.l}</div><div style={{fontSize:20,fontWeight:800,color:c.c,fontFamily:"'Sora',sans-serif",marginTop:4}}>{fmtC(c.total)}</div></div>)}</div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:17}}>All Expenses</span>
          <button className="slt-btn-primary" style={{width:"auto",padding:"10px 18px"}} onClick={()=>setShowAdd(!showAdd)}>{showAdd?"Cancel":"+ Add"}</button>
        </div>
        {showAdd&&<div className="slt-card" style={{border:`2px solid ${C.blue}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label className="slt-label">Amount ($)</label><input type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="slt-input" placeholder="0.00"/></div>
            <div><label className="slt-label">Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="slt-input"/></div>
          </div>
          <div style={{marginBottom:12}}><label className="slt-label">Category</label><select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="slt-input">{CATS.map(c=><option key={c.id} value={c.id}>{c.i} {c.l}</option>)}</select></div>
          <div style={{marginBottom:12}}><label className="slt-label">Merchant</label><input value={form.merchant} onChange={e=>setForm(f=>({...f,merchant:e.target.value}))} className="slt-input" placeholder="e.g. Shell"/></div>
          <div style={{marginBottom:16}}><label className="slt-label">Note</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="slt-input" placeholder="Details…"/></div>
          <button className="slt-btn-primary" style={{width:"100%"}} onClick={add}>Save</button>
        </div>}
        {expenses.length===0?<div className="slt-card" style={{textAlign:"center",padding:"44px"}}><div style={{fontSize:38,marginBottom:10}}>🧾</div><div style={{color:C.textMed}}>No expenses yet</div></div>
        :expenses.map(e=>{const cat=CATS.find(c=>c.id===e.category)||CATS[CATS.length-1];return(
          <div key={e.id} className="slt-card" style={{padding:"14px 18px",borderLeft:`4px solid ${cat.c}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:17,color:cat.c}}>{fmtC(e.amount)}</div><div style={{fontSize:13,color:C.textMed}}>{cat.i} {cat.l}{e.merchant?` · ${e.merchant}`:""}</div>{e.note&&<div style={{fontSize:12,color:C.textLight}}>{e.note}</div>}<div style={{fontSize:11,color:C.textLight,marginTop:2}}>{e.date}</div></div>
              <button className="slt-btn-danger" style={{padding:"6px 12px"}} onClick={()=>save(expenses.filter(x=>x.id!==e.id))}>Delete</button>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── DRIVERS TAB ──────────────────────────────────────────────────────────────
function DriversTab({ session, loads, rates }) {
  const [usersState,setUsersState]=useState(getUsers());
  const owner=usersState[session.uid];
  const drivers=Object.values(usersState).filter(u=>u.role==="driver"&&u.ownerUid===session.uid);
  const [copied,setCopied]=useState(false);
  const copyCode=()=>{if(owner?.inviteCode){navigator.clipboard.writeText(owner.inviteCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}};
  const regen=()=>{const u=getUsers();u[session.uid].inviteCode=genCode();saveUsers(u);setUsersState({...u});};
  const remove=(uid)=>{if(!window.confirm("Remove driver?"))return;const u=getUsers();delete u[uid];saveUsers(u);setUsersState({...u});};
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Fleet Drivers</div><div className="slt-hero-sub">{drivers.length} driver{drivers.length!==1?"s":""} registered</div></div>
      <div className="slt-container">
        <div className="slt-card" style={{border:`2px solid ${C.blue}`}}>
          <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:17,color:C.blue,marginBottom:6}}>Driver Invite Code</div>
          <div style={{fontSize:13,color:C.textMed,marginBottom:16}}>Share with drivers when they register</div>
          <div style={{background:C.blueLight,borderRadius:12,padding:"16px 20px",textAlign:"center",fontFamily:"'Sora',sans-serif",fontSize:30,fontWeight:800,color:C.blue,letterSpacing:10,marginBottom:16}}>{owner?.inviteCode||"——"}</div>
          <div style={{display:"flex",gap:10}}>
            <button className="slt-btn-primary" style={{background:copied?C.green:undefined}} onClick={copyCode}>{copied?"✓ Copied!":"Copy Code"}</button>
            <button className="slt-btn-secondary" style={{padding:"12px 16px"}} onClick={regen}>🔄 Regenerate</button>
          </div>
        </div>
        {drivers.length===0?<div className="slt-card" style={{textAlign:"center",padding:"44px"}}><div style={{fontSize:38,marginBottom:10}}>👥</div><div style={{color:C.textMed}}>No drivers yet.</div></div>
        :drivers.map(d=>{
          const dl=loads.filter(l=>l.assignedDriverUid===d.uid||l.addedBy===d.uid);
          const dp=dl.reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates?.driverWaitRate)||0);},0);
          return(<div key={d.uid} className="slt-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:17,marginBottom:4}}>{d.fullName||d.name}</div>
                <div style={{fontSize:13,color:C.textLight,marginBottom:12}}>@{d.name}</div>
                <div style={{display:"flex",gap:18}}>
                  <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>LOADS</div><div style={{fontSize:20,fontWeight:800,fontFamily:"'Sora',sans-serif"}}>{dl.length}</div></div>
                  <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>DONE</div><div style={{fontSize:20,fontWeight:800,color:C.green,fontFamily:"'Sora',sans-serif"}}>{dl.filter(l=>l.completed).length}</div></div>
                  <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>TOTAL PAY</div><div style={{fontSize:20,fontWeight:800,color:C.blue,fontFamily:"'Sora',sans-serif"}}>{fmtC(dp)}</div></div>
                </div>
              </div>
              <button className="slt-btn-danger" style={{padding:"8px 14px"}} onClick={()=>remove(d.uid)}>Remove</button>
            </div>
          </div>);
        })}
      </div>
    </div>
  );
}

// ─── REPORT TAB ───────────────────────────────────────────────────────────────
function ReportTab({ loads, session, rates, isOwner, allDrivers }) {
  const [range,setRange]=useState("month"); const [dFilter,setDFilter]=useState("all");
  const fd=(d)=>{ if(!d)return false; const dt=new Date(d),now=new Date(); if(range==="today")return dt.toDateString()===now.toDateString(); if(range==="week"){const w=new Date(now);w.setDate(w.getDate()-7);return dt>=w;} if(range==="month"){const m=new Date(now);m.setDate(m.getDate()-30);return dt>=m;} return true; };
  const ml=isOwner?loads.filter(l=>fd(l.date)&&(dFilter==="all"||l.assignedDriverUid===dFilter||(!l.assignedDriverUid&&dFilter==="owner"))):loads.filter(l=>fd(l.date));
  const tw=ml.reduce((s,l)=>s+(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0),0);
  const te=ml.reduce((s,l)=>s+Number(l.earnings||0),0);
  const wc=ml.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
  const gross=te+wc;
  const dp=ml.reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0);},0);
  const net=gross-dp;
  const drp=ml.reduce((s,l)=>s+(Number(l.driverBasePay)||0),0);
  const dwp=ml.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Reports</div><div className="slt-hero-sub">{isOwner?"Financial summaries & load history":"Pay summary & load history"}</div></div>
      <div className="slt-container">
        <div className="slt-card">
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["today","Today"],["week","7 Days"],["month","30 Days"],["all","All Time"]].map(([v,l])=>(
              <button key={v} onClick={()=>setRange(v)} className="slt-btn-secondary" style={{background:range===v?C.blue:"#fff",color:range===v?"#fff":C.textMed,borderColor:range===v?C.blue:C.border,padding:"8px 16px"}}>{l}</button>
            ))}
          </div>
          {isOwner&&allDrivers.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
            {[["all","All"],["owner","Me"],...allDrivers.map(d=>[d.uid,d.fullName||d.name])].map(([v,l])=>(
              <button key={v} onClick={()=>setDFilter(v)} className="slt-btn-secondary" style={{background:dFilter===v?C.blue:"#fff",color:dFilter===v?"#fff":C.textMed,borderColor:dFilter===v?C.blue:C.border,padding:"7px 12px",fontSize:12}}>{l}</button>
            ))}
          </div>}
        </div>
        <div style={{display:"flex",gap:12,marginBottom:18}}>
          <div className="slt-card-sm" style={{flex:1,borderTop:`4px solid ${C.green}`,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.textLight,fontWeight:700,letterSpacing:1,marginBottom:4}}>COMPLETED</div>
            <div style={{fontFamily:"'Sora',sans-serif",fontSize:26,fontWeight:800,color:C.green}}>{ml.filter(l=>l.completed).length}</div>
          </div>
          <div className="slt-card-sm" style={{flex:1,borderTop:`4px solid ${C.orange}`,textAlign:"center"}}>
            <div style={{fontSize:11,color:C.textLight,fontWeight:700,letterSpacing:1,marginBottom:4}}>ACTIVE</div>
            <div style={{fontFamily:"'Sora',sans-serif",fontSize:26,fontWeight:800,color:C.orange}}>{ml.filter(l=>!l.completed).length}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
          {(isOwner?[["Loads",ml.length,C.textDark,"#1565C0"],["Gross",fmtC(gross),C.green,C.green],["Driver Pay",fmtC(dp),C.blue,C.blue],["Net",fmtC(net),net>=0?C.green:C.red,net>=0?C.green:C.red],["Wait",fmt(tw),C.orange,C.orange]]
          :[["Loads",ml.length,C.textDark,"#1565C0"],["Route Pay",fmtC(drp),C.blue,C.blue],["Wait Pay",fmtC(dwp),C.orange,C.orange],["Total Pay",fmtC(drp+dwp),C.green,C.green],["Wait",fmt(tw),C.orange,C.orange]]
          ).map(([l,v,color,border])=>(
            <div key={l} className="slt-card-sm" style={{borderTop:`4px solid ${border}`}}>
              <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,letterSpacing:1,marginBottom:4}}>{l.toUpperCase()}</div>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:20,fontWeight:800,color}}>{v}</div>
            </div>
          ))}
        </div>
        <div className="slt-card">
          <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:16,marginBottom:14}}>Load History</div>
          {ml.length===0?<div style={{textAlign:"center",padding:"28px 0",color:C.textLight}}>No loads in this period</div>:(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{background:C.offWhite}}>{["Date","Route",isOwner?"Driver":null,"Status","Earnings",isOwner?"Drv Pay":null,"Wait"].filter(Boolean).map(h=><th key={h} style={{padding:"9px 12px",textAlign:"left",fontWeight:700,color:C.textMed,borderBottom:`2px solid ${C.border}`,whiteSpace:"nowrap",fontFamily:"'Mulish',sans-serif"}}>{h}</th>)}</tr></thead>
                <tbody>{[...ml].sort((a,b)=>b.date>a.date?1:-1).map((l,i)=>{
                  const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                  const wP=wm/60*(Number(rates.companyWaitRate)||0);
                  const drv=(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0);
                  return(<tr key={l.id} style={{background:i%2===0?C.white:C.offWhite}}>
                    <td style={{padding:"9px 12px",color:C.textLight,whiteSpace:"nowrap"}}>{l.date}</td>
                    <td style={{padding:"9px 12px",fontWeight:700,whiteSpace:"nowrap"}}>{l.location}</td>
                    {isOwner&&<td style={{padding:"9px 12px",color:C.blue}}>{l.driverFullName||"—"}</td>}
                    <td style={{padding:"9px 12px"}}><span className={l.completed?"slt-badge-green":"slt-badge-orange"}>{l.completed?"Done":"Active"}</span></td>
                    <td style={{padding:"9px 12px",fontWeight:700,color:C.green}}>{fmtC((Number(l.earnings)||0)+wP)}</td>
                    {isOwner&&<td style={{padding:"9px 12px",color:C.orange}}>{fmtC(drv)}</td>}
                    <td style={{padding:"9px 12px",color:C.textLight}}>{wm>0?fmt(wm):"—"}</td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FUEL FINDER ─────────────────────────────────────────────────────────────
function FuelFinderTab() {
  const [loc,setLoc]=useState(null); const [loading,setLoading]=useState(false);
  const [stations,setStations]=useState([]); const [error,setError]=useState(""); const [searched,setSearched]=useState(false);
  const find=()=>{
    setLoading(true);setError("");setStations([]);
    if(!navigator.geolocation){setError("Geolocation not supported.");setLoading(false);return;}
    navigator.geolocation.getCurrentPosition(async(pos)=>{
      const{latitude:lat,longitude:lng}=pos.coords;setLoc({lat,lng});
      try{const q=`[out:json][timeout:25];(node["amenity"="fuel"](around:10000,${lat},${lng}););out body 20;`;const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);const d=await r.json();const s=(d.elements||[]).filter(e=>e.lat&&e.lon).map(e=>({id:e.id,name:e.tags?.name||e.tags?.brand||"Fuel Station",diesel:e.tags?.["fuel:diesel"]==="yes",lat:e.lat,lng:e.lon,dist:Math.round(Math.sqrt(Math.pow((e.lat-lat)*111,2)+Math.pow((e.lon-lng)*111*Math.cos(lat*Math.PI/180),2))*10)/10})).sort((a,b)=>a.dist-b.dist).slice(0,12);setStations(s);setSearched(true);}catch{setError("Could not load stations.");}setLoading(false);
    },()=>{setError("Location unavailable. Enable GPS.");setLoading(false);});
  };
  return(
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Fuel Finder</div><div className="slt-hero-sub">Diesel truck stops near your location</div></div>
      <div className="slt-container">
        {!searched&&!loading&&<div className="slt-card" style={{textAlign:"center",padding:"52px 24px"}}><div style={{fontSize:48,marginBottom:14}}>⛽</div><div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18,marginBottom:8}}>Find Diesel Near You</div><div style={{color:C.textMed,fontSize:14,marginBottom:24}}>Uses GPS to locate nearby stations</div><button className="slt-btn-primary" style={{width:"auto",padding:"12px 36px"}} onClick={find}>📍 Find Diesel</button></div>}
        {loading&&<div className="slt-card" style={{textAlign:"center",padding:"40px",color:C.blue,fontWeight:700}}>🔍 Searching nearby…</div>}
        {error&&<div style={{background:"#FFEBEE",border:`1px solid #FFCDD2`,borderRadius:12,padding:18,marginBottom:14}}><div style={{color:C.red}}>{error}</div><button className="slt-btn-primary" style={{width:"auto",marginTop:10,padding:"9px 20px"}} onClick={find}>Try Again</button></div>}
        {stations.length>0&&<div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:700}}>{stations.length} stations found</span><button className="slt-btn-secondary" style={{padding:"7px 14px"}} onClick={find}>🔄 Refresh</button></div>}
        {stations.map((s,i)=>(
          <div key={s.id} className="slt-card" style={{padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div><div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:15,marginBottom:4}}>{i+1}. {s.name}</div>{s.diesel&&<span className="slt-badge-green">✓ Diesel</span>}</div>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:20,fontWeight:800,color:C.orange}}>{s.dist} km</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`} target="_blank" rel="noreferrer" className="slt-btn-primary" style={{flex:1,textAlign:"center",textDecoration:"none",padding:"9px 0",borderRadius:9,fontSize:13}}>🗺 Directions</a>
              <a href={`https://www.google.com/maps/search/diesel+price+near+${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="slt-btn-secondary" style={{flex:1,textAlign:"center",textDecoration:"none",padding:"9px 0",borderRadius:9,fontSize:13}}>💲 Price</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PROFIT TAB ───────────────────────────────────────────────────────────────
function ProfitTab({ isOwner }) {
  const [form,setForm]=useState({gross:"",fuel:"",driverPay:"",maintenance:"",tolls:"",other:"",routePay:"",waitPay:"",meals:"",lodging:""});
  const hc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const reset=()=>setForm({gross:"",fuel:"",driverPay:"",maintenance:"",tolls:"",other:"",routePay:"",waitPay:"",meals:"",lodging:""});
  if(isOwner){
    const g=Number(form.gross)||0;const costs=(Number(form.fuel)||0)+(Number(form.driverPay)||0)+(Number(form.maintenance)||0)+(Number(form.tolls)||0)+(Number(form.other)||0);const profit=g-costs;const margin=g>0?((profit/g)*100).toFixed(1):0;
    return(<div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">Profit Calculator</div><div className="slt-hero-sub">True take-home after all costs</div></div>
      <div className="slt-container-sm">
        {g>0&&<div style={{background:profit>=500?`linear-gradient(135deg,${C.green},#1B5E20)`:profit>=0?`linear-gradient(135deg,${C.orange},#BF360C)`:`linear-gradient(135deg,${C.red},#B71C1C)`,borderRadius:16,padding:"24px 28px",marginBottom:20,color:"#fff"}}>
          <div style={{fontSize:13,opacity:0.85,marginBottom:4}}>Owner Take-Home</div>
          <div style={{fontFamily:"'Sora',sans-serif",fontSize:40,fontWeight:800,marginBottom:8}}>{fmtC(profit)}</div>
          <div style={{fontSize:16,fontWeight:700}}>{profit>=500?"✅ Take It!":profit>=0?"⚠️ Marginal":"❌ Leave It!"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16}}>{[["Gross",fmtC(g)],["Costs",fmtC(costs)],["Margin",margin+"%"]].map(([l,v])=><div key={l} style={{background:"rgba(255,255,255,0.15)",borderRadius:9,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:10,opacity:0.8,marginBottom:2}}>{l}</div><div style={{fontSize:16,fontWeight:800}}>{v}</div></div>)}</div>
        </div>}
        <div className="slt-card">
          <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,color:C.green,marginBottom:14,fontSize:16}}>Revenue</div>
          <div style={{marginBottom:14}}><label className="slt-label">Gross Revenue ($)</label><input name="gross" type="number" placeholder="2500" value={form.gross} onChange={hc} className="slt-input" style={{fontSize:18}}/></div>
          <hr className="slt-divider"/>
          <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,color:C.red,marginBottom:14,fontSize:16}}>Costs</div>
          {[["fuel","⛽ Fuel"],["driverPay","👤 Driver Pay"],["maintenance","🔧 Maintenance"],["tolls","🛣 Tolls"],["other","📦 Other"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input"/></div>)}
          <button className="slt-btn-secondary" style={{width:"100%",marginTop:4}} onClick={reset}>Reset</button>
        </div>
      </div>
    </div>);
  }
  const gp=(Number(form.routePay)||0)+(Number(form.waitPay)||0);const te=(Number(form.meals)||0)+(Number(form.lodging)||0)+(Number(form.tolls)||0)+(Number(form.other)||0);const nh=gp-te;
  return(<div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">Pay Calculator</div><div className="slt-hero-sub">Take-home after trip expenses</div></div>
    <div className="slt-container-sm">
      {gp>0&&<div style={{background:nh>=300?`linear-gradient(135deg,${C.green},#1B5E20)`:`linear-gradient(135deg,${C.red},#B71C1C)`,borderRadius:16,padding:"24px 28px",marginBottom:20,color:"#fff"}}><div style={{fontSize:13,opacity:0.85}}>Your Take-Home</div><div style={{fontFamily:"'Sora',sans-serif",fontSize:40,fontWeight:800}}>{fmtC(nh)}</div></div>}
      <div className="slt-card">
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,color:C.blue,marginBottom:14,fontSize:16}}>Your Pay</div>
        {[["routePay","Route Pay"],["waitPay","Wait Pay"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input" style={{fontSize:18}}/></div>)}
        <hr className="slt-divider"/>
        <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,color:C.red,marginBottom:14,fontSize:16}}>Expenses</div>
        {[["meals","🍽 Meals"],["lodging","🏨 Lodging"],["tolls","🛣 Tolls"],["other","📦 Other"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input"/></div>)}
        <button className="slt-btn-secondary" style={{width:"100%",marginTop:4}} onClick={reset}>Reset</button>
      </div>
    </div>
  </div>);
}

// ─── MAINTENANCE TAB ──────────────────────────────────────────────────────────
function MaintenanceTab({ session, trucks }) {
  const key=maintenanceKey(session.ownerUid||session.uid);
  const [records,setRecords]=useState(getStored(key));
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({truckId:"",type:"oil_change",date:todayStr(),odometer:"",cost:"",notes:"",nextDueKm:""});
  const hc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const TYPES=[["oil_change","🛢","Oil Change",C.orange],["tires","🔄","Tires",C.blue],["brakes","🛑","Brakes",C.red],["repair","🔧","Repair",C.purple],["service","⚙","Service",C.green],["inspection","📋","Inspection",C.textMed]];
  const ti=t=>TYPES.find(([id])=>id===t)||["","🔧","Service",C.textMed];
  const saveR=()=>{ if(!form.type)return; const u=[{...form,id:Date.now().toString()},...records]; setRecords(u); localStorage.setItem(key,JSON.stringify(u)); setShowAdd(false); };
  return(
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">Maintenance</div><div className="slt-hero-sub">Oil changes, tires, brakes & service records</div></div>
      <div className="slt-container">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
          {TYPES.map(([id,icon,label,color])=><div key={id} className="slt-card-sm" style={{textAlign:"center",borderTop:`3px solid ${color}`,padding:"12px 8px"}}><div style={{fontSize:22}}>{icon}</div><div style={{fontSize:11,color:C.textMed,fontWeight:700,marginTop:4}}>{label}</div><div style={{fontFamily:"'Sora',sans-serif",fontSize:18,fontWeight:800,color,marginTop:2}}>{records.filter(r=>r.type===id).length}</div></div>)}
        </div>
        <button className="slt-btn-primary" style={{marginBottom:16}} onClick={()=>setShowAdd(!showAdd)}>{showAdd?"Cancel":"+ Add Record"}</button>
        {showAdd&&<div className="slt-card" style={{border:`2px solid ${C.blue}`}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
            {TYPES.map(([id,icon,label,color])=><button key={id} onClick={()=>setForm(f=>({...f,type:id}))} style={{padding:"10px 6px",borderRadius:9,border:`2px solid ${form.type===id?color:C.border}`,background:form.type===id?color+"18":C.white,cursor:"pointer",fontFamily:"'Mulish',sans-serif"}}><div style={{fontSize:20}}>{icon}</div><div style={{fontSize:11,fontWeight:700,color:form.type===id?color:C.textMed,marginTop:3}}>{label}</div></button>)}
          </div>
          {trucks.length>0&&<div style={{marginBottom:12}}><label className="slt-label">Truck</label><select name="truckId" value={form.truckId} onChange={hc} className="slt-input"><option value="">— Select —</option>{trucks.map(t=><option key={t.id} value={t.id}>Truck {t.truckNumber}</option>)}</select></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label className="slt-label">Date</label><input name="date" type="date" value={form.date} onChange={hc} className="slt-input"/></div>
            <div><label className="slt-label">Odometer (km)</label><input name="odometer" type="number" value={form.odometer} onChange={hc} className="slt-input"/></div>
            <div><label className="slt-label">Cost ($)</label><input name="cost" type="number" value={form.cost} onChange={hc} className="slt-input"/></div>
            <div><label className="slt-label">Next Due (km)</label><input name="nextDueKm" type="number" value={form.nextDueKm} onChange={hc} className="slt-input"/></div>
          </div>
          <div style={{marginBottom:14}}><label className="slt-label">Notes</label><input name="notes" value={form.notes} onChange={hc} className="slt-input" placeholder="e.g. Full synthetic 5W-30"/></div>
          <button className="slt-btn-primary" style={{width:"100%"}} onClick={saveR}>Save Record</button>
        </div>}
        {records.length===0&&!showAdd?<div className="slt-card" style={{textAlign:"center",padding:"44px"}}><div style={{fontSize:38,marginBottom:10}}>🔧</div><div style={{color:C.textMed}}>No records yet</div></div>
        :[...records].sort((a,b)=>b.date>a.date?1:-1).map(r=>{ const [,icon,label,color]=ti(r.type); const truck=trucks.find(t=>t.id===r.truckId); const kl=(Number(r.nextDueKm)>0)?Number(r.nextDueKm)-(Number(r.odometer)||0):null; return(
          <div key={r.id} className="slt-card" style={{borderLeft:`4px solid ${color}`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:20}}>{icon}</span><span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:15}}>{label}</span>{kl!==null&&kl<=2000&&<span className="slt-badge-red">⚠ Due Soon</span>}</div>
                {truck&&<div style={{fontSize:13,color:C.orange,marginBottom:2}}>🚛 Truck {truck.truckNumber}</div>}
                <div style={{fontSize:12.5,color:C.textLight}}>{r.date}{r.odometer?` · ${Number(r.odometer).toLocaleString()} km`:""}</div>
                {r.notes&&<div style={{fontSize:13,color:C.textMed,marginTop:4,fontStyle:"italic"}}>{r.notes}</div>}
                {kl!==null&&<div style={{fontSize:12,color:kl<=2000?C.red:C.green,marginTop:4}}>{kl<=2000?`⚠ Due in ${kl.toLocaleString()} km`:`✓ Next in ${kl.toLocaleString()} km`}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                {r.cost&&<div style={{fontFamily:"'Sora',sans-serif",fontSize:18,fontWeight:800,color:C.red}}>{fmtC(r.cost)}</div>}
                <button className="slt-btn-danger" style={{padding:"6px 12px",marginTop:8,fontSize:12}} onClick={()=>{const u=records.filter(x=>x.id!==r.id);setRecords(u);localStorage.setItem(key,JSON.stringify(u));}}>Delete</button>
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
function SettingsModal({ session, rates, setRates, customRoutes, setCustomRoutes, trucks, setTrucks, onClose }) {
  const [lr,setLr]=useState({...DEFAULT_RATES,...rates});
  const [lRoutes,setLRoutes]=useState([...customRoutes]);
  const [lTrucks,setLTrucks]=useState([...trucks]);
  const [sec,setSec]=useState("rates");
  const [nr,setNr]=useState({from:"",to:"",pay:"",rate:""});
  const [nt,setNt]=useState({truckNumber:"",trailerNumber:""});
  const save=()=>{ localStorage.setItem(ratesKey(session.uid),JSON.stringify(lr));setRates(lr); localStorage.setItem(routesKey(session.ownerUid||session.uid),JSON.stringify(lRoutes));setCustomRoutes(lRoutes); localStorage.setItem(trucksKey(session.ownerUid||session.uid),JSON.stringify(lTrucks));setTrucks(lTrucks); onClose(); };
  const addRoute=()=>{ if(!nr.from.trim()||!nr.to.trim())return; setLRoutes(r=>[...r,{from:nr.from.trim(),to:nr.to.trim(),pay:Number(nr.pay)||0,rate:Number(nr.rate)||0,billingMethod:"per_load",id:Date.now().toString()}]); setNr({from:"",to:"",pay:"",rate:""}); };
  const addTruck=()=>{ if(!nt.truckNumber.trim())return; const ex=lTrucks.map(t=>parseInt(t.tmwNumber)||0); const tmw=(Math.max(1000,...ex)+1).toString(); setLTrucks(t=>[...t,{...nt,tmwNumber:tmw,id:Date.now().toString()}]); setNt({truckNumber:"",trailerNumber:""}); };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.white,borderRadius:18,width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 28px 80px rgba(0,0,0,0.25)"}}>
        <div style={{padding:"20px 24px 0",position:"sticky",top:0,background:C.white,borderBottom:`1px solid ${C.border}`,paddingBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:18}}>⚙ Settings</div>
            <button className="slt-btn-ghost" style={{padding:"6px 12px"}} onClick={onClose}>✕</button>
          </div>
          <div style={{display:"flex",gap:8}}>
            {[["rates","Rates"],["routes","Routes"],["trucks","Fleet"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSec(v)} className="slt-btn-secondary" style={{background:sec===v?C.blue:C.white,color:sec===v?"#fff":C.textMed,borderColor:sec===v?C.blue:C.border,padding:"8px 14px",fontSize:13}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{padding:"20px 24px"}}>
          {sec==="rates"&&(<div>
            {[["companyWaitRate","Company Wait Rate ($/hr)"],["driverWaitRate","Driver Wait Rate ($/hr)"],["perLoadRate","Default Load Rate ($)"]].map(([k,l])=>(
              <div key={k} style={{marginBottom:14}}><label className="slt-label">{l}</label><input type="number" value={lr[k]} onChange={e=>setLr(r=>({...r,[k]:e.target.value}))} className="slt-input"/></div>
            ))}
          </div>)}
          {sec==="routes"&&(<div>
            {lRoutes.map((r,i)=><div key={i} className="slt-card-sm" style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700}}>{r.from} → {r.to}</div><div style={{fontSize:13,color:C.textMed}}>Driver: {fmtC(r.pay)} · Rate: {fmtC(r.rate)}</div></div><button className="slt-btn-danger" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setLRoutes(rs=>rs.filter((_,j)=>j!==i))}>Remove</button></div>)}
            <div className="slt-card-sm" style={{border:`2px dashed ${C.border}`,marginTop:10}}>
              <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,color:C.blue,marginBottom:12}}>Add Route</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="slt-label">From</label><input value={nr.from} onChange={e=>setNr(r=>({...r,from:e.target.value}))} className="slt-input" placeholder="e.g. CNRL"/></div>
                <div><label className="slt-label">To</label><input value={nr.to} onChange={e=>setNr(r=>({...r,to:e.target.value}))} className="slt-input" placeholder="e.g. Heartland"/></div>
                <div><label className="slt-label">Driver Pay ($)</label><input type="number" value={nr.pay} onChange={e=>setNr(r=>({...r,pay:e.target.value}))} className="slt-input" placeholder="450"/></div>
                <div><label className="slt-label">Load Rate ($)</label><input type="number" value={nr.rate} onChange={e=>setNr(r=>({...r,rate:e.target.value}))} className="slt-input" placeholder="0"/></div>
              </div>
              <button className="slt-btn-primary" style={{width:"100%"}} onClick={addRoute}>+ Add Route</button>
            </div>
          </div>)}
          {sec==="trucks"&&(<div>
            {lTrucks.map(t=><div key={t.id} className="slt-card-sm" style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700}}>Truck {t.truckNumber}</div><div style={{fontSize:13,color:C.textMed}}>TMW #{t.tmwNumber}{t.trailerNumber?` · Trailer ${t.trailerNumber}`:""}</div></div><button className="slt-btn-danger" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setLTrucks(ts=>ts.filter(x=>x.id!==t.id))}>Remove</button></div>)}
            <div className="slt-card-sm" style={{border:`2px dashed ${C.border}`,marginTop:10}}>
              <div style={{fontFamily:"'Sora',sans-serif",fontWeight:700,color:C.orange,marginBottom:12}}>Add Truck</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="slt-label">Truck # *</label><input value={nt.truckNumber} onChange={e=>setNt(t=>({...t,truckNumber:e.target.value}))} className="slt-input" placeholder="T-17"/></div>
                <div><label className="slt-label">Trailer # (opt)</label><input value={nt.trailerNumber} onChange={e=>setNt(t=>({...t,trailerNumber:e.target.value}))} className="slt-input" placeholder="Optional"/></div>
              </div>
              <button className="slt-btn-primary" style={{width:"100%"}} onClick={addTruck}>+ Add Truck</button>
            </div>
          </div>)}
        </div>
        <div style={{padding:"0 24px 22px"}}><button className="slt-btn-primary" style={{width:"100%",padding:"13px",fontSize:15}} onClick={save}>💾 Save All Settings</button></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// NEW FEATURE MODULES — Smart Load Tracking v3
// All 10 new features appended/integrated
// ═══════════════════════════════════════════════════════════════════

// ─── IFTA Tab ─────────────────────────────────────────────────────
// Feature 1: IFTA Tax Reporting
function IFTATab({ session, loads }) {
  const iftaKey = `tp-ifta-${session.ownerUid || session.uid}`;
  const [entries, setEntries] = useState(getStored(iftaKey));
  const [quarter, setQuarter] = useState(() => {
    const m = new Date().getMonth();
    return `Q${Math.floor(m / 3) + 1}-${new Date().getFullYear()}`;
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), jurisdiction: "AB", km: "", fuelLitres: "", fuelCost: "", truckId: "", note: "" });

  const CA_PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
  const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
  const ALL_JURISDICTIONS = [...CA_PROVINCES, ...US_STATES];

  // IFTA fuel tax rates (approx CAD cents/L for Canada, USD cents/gallon for US)
  const TAX_RATES = {
    AB:11.0, BC:15.0, MB:14.0, NB:15.2, NL:16.5, NS:15.5, NT:10.7, NU:10.7,
    ON:14.7, PE:14.2, QC:19.2, SK:15.0, YT:7.2,
    AL:19.0, AK:8.0, AZ:18.0, AR:21.5, CA:53.9, CO:22.0, CT:25.0, DE:22.0,
    FL:35.7, GA:31.2, ID:32.0, IL:38.2, IN:53.0, IA:30.5, KS:26.0, KY:21.6,
    LA:20.0, ME:31.2, MD:36.7, MA:24.0, MI:30.0, MN:28.5, MS:18.0, MO:17.0,
    MT:29.0, NE:24.9, NV:27.0, NH:22.2, NJ:41.4, NM:21.0, NY:40.5, NC:36.1,
    ND:23.0, OH:38.5, OK:16.0, OR:36.0, PA:74.1, RI:34.0, SC:26.0, SD:28.0,
    TN:27.4, TX:20.0, UT:31.9, VT:29.5, VA:27.2, WA:49.4, WV:35.7, WI:32.9, WY:24.0,
  };

  const save = (arr) => { setEntries(arr); localStorage.setItem(iftaKey, JSON.stringify(arr)); };
  const add = () => {
    if (!form.km || !form.jurisdiction) return;
    save([{ ...form, km: Number(form.km), fuelLitres: Number(form.fuelLitres) || 0, fuelCost: Number(form.fuelCost) || 0, id: Date.now().toString(), quarter }, ...entries]);
    setForm({ date: todayStr(), jurisdiction: "AB", km: "", fuelLitres: "", fuelCost: "", truckId: "", note: "" });
    setShowAdd(false);
  };

  const qEntries = entries.filter(e => e.quarter === quarter);
  const totalKm = qEntries.reduce((s, e) => s + Number(e.km || 0), 0);
  const totalFuel = qEntries.reduce((s, e) => s + Number(e.fuelLitres || 0), 0);
  const avgMpg = totalFuel > 0 ? (totalKm / totalFuel).toFixed(2) : "—";

  // Group by jurisdiction
  const byJur = {};
  qEntries.forEach(e => {
    if (!byJur[e.jurisdiction]) byJur[e.jurisdiction] = { km: 0, fuel: 0 };
    byJur[e.jurisdiction].km += Number(e.km || 0);
    byJur[e.jurisdiction].fuel += Number(e.fuelLitres || 0);
  });

  // IFTA calculation: tax owed = (km / total km * total fuel - fuel purchased in jur) * tax rate
  const iftaRows = Object.entries(byJur).map(([jur, data]) => {
    const allocated = totalFuel > 0 ? (data.km / totalKm) * totalFuel : 0;
    const diff = allocated - data.fuel; // positive = owe tax, negative = refund
    const rate = TAX_RATES[jur] || 0;
    const taxOwed = diff * rate / 100; // cents to dollars
    return { jur, km: data.km, fuel: data.fuel, allocated: allocated.toFixed(1), diff: diff.toFixed(1), taxOwed: taxOwed.toFixed(2), isRefund: diff < 0 };
  }).sort((a, b) => Math.abs(Number(b.taxOwed)) - Math.abs(Number(a.taxOwed)));

  const totalTax = iftaRows.reduce((s, r) => s + Number(r.taxOwed), 0);

  const printIFTA = () => {
    const rows = iftaRows.map(r => `<tr><td>${r.jur}</td><td>${r.km.toLocaleString()}</td><td>${r.allocated}</td><td>${r.fuel.toFixed(1)}</td><td>${Number(r.diff) > 0 ? "+" : ""}${r.diff}</td><td style="color:${r.isRefund ? "green" : "red"};font-weight:800">${r.isRefund ? "REFUND" : "OWED"} $${Math.abs(r.taxOwed)}</td></tr>`).join("");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>IFTA Report ${quarter}</title><style>body{font-family:Arial;padding:28px;color:#0D1F35}h1{color:#1E88E5}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#E3F2FD;padding:10px;text-align:left;font-size:12px;text-transform:uppercase}td{padding:10px;border-bottom:1px solid #E1E8F0;font-size:13px}.total{background:#F7F9FC;font-weight:800}</style></head><body><h1>🚛 IFTA Fuel Tax Report — ${quarter}</h1><p>Total KM: ${totalKm.toLocaleString()} | Total Fuel: ${totalFuel.toFixed(1)}L | Avg: ${avgMpg} km/L</p><table><thead><tr><th>Jurisdiction</th><th>KM Driven</th><th>Fuel Allocated (L)</th><th>Fuel Purchased (L)</th><th>Difference</th><th>Tax</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="5">NET TAX ${totalTax >= 0 ? "OWED" : "REFUND"}</td><td style="color:${totalTax >= 0 ? "red" : "green"}">$${Math.abs(totalTax).toFixed(2)}</td></tr></tbody></table><p style="margin-top:20px;font-size:11px;color:#888">Generated by Smart Load Tracking · ${todayStr()}</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 500);
  };

  const quarters = [];
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let q = 4; q >= 1; q--) quarters.push(`Q${q}-${y}`);
  }

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">📋 IFTA Tax Reporting</div>
        <div className="slt-hero-sub">Track fuel by jurisdiction · Auto-calculate tax owed or refund</div>
      </div>
      <div className="slt-container">
        {/* Quarter selector */}
        <div className="slt-card" style={{ marginBottom: 18, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <label className="slt-label">Quarter</label>
              <select value={quarter} onChange={e => setQuarter(e.target.value)} className="slt-input" style={{ maxWidth: 200 }}>
                {quarters.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="slt-btn-secondary" style={{ padding: "10px 18px" }} onClick={printIFTA}>🖨 Print IFTA Report</button>
              <button className="slt-btn-primary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => setShowAdd(!showAdd)}>+ Add Entry</button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            ["Total KM", totalKm.toLocaleString() + " km", C.blue],
            ["Total Fuel", totalFuel.toFixed(1) + " L", C.orange],
            ["Avg Efficiency", avgMpg + " km/L", C.green],
            ["Net Tax", `${totalTax >= 0 ? "Owed" : "Refund"} $${Math.abs(totalTax).toFixed(2)}`, totalTax > 0 ? C.red : C.green],
          ].map(([l, v, color]) => (
            <div key={l} className="slt-card-sm" style={{ borderTop: `4px solid ${color}`, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>{l}</div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 18, fontWeight: 800, color }}>{v}</div>
            </div>
          ))}
        </div>

        {showAdd && (
          <div className="slt-card" style={{ border: `2px solid ${C.blue}`, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, color: C.blue, fontSize: 16, marginBottom: 16 }}>Add Jurisdiction Entry</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label className="slt-label">Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="slt-input" /></div>
              <div>
                <label className="slt-label">Jurisdiction</label>
                <select value={form.jurisdiction} onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))} className="slt-input">
                  <optgroup label="🇨🇦 Canada">{CA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>
                  <optgroup label="🇺🇸 United States">{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                </select>
              </div>
              <div><label className="slt-label">KM Driven in {form.jurisdiction}</label><input type="number" placeholder="0" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} className="slt-input" /></div>
              <div><label className="slt-label">Fuel Purchased (L)</label><input type="number" step="0.1" placeholder="0" value={form.fuelLitres} onChange={e => setForm(f => ({ ...f, fuelLitres: e.target.value }))} className="slt-input" /></div>
              <div><label className="slt-label">Fuel Cost ($)</label><input type="number" step="0.01" placeholder="0.00" value={form.fuelCost} onChange={e => setForm(f => ({ ...f, fuelCost: e.target.value }))} className="slt-input" /></div>
              <div><label className="slt-label">Note</label><input placeholder="Optional…" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="slt-input" /></div>
            </div>
            <div style={{ background: C.blueLight, borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.blue }}>
              💡 Estimated tax rate for {form.jurisdiction}: <strong>{TAX_RATES[form.jurisdiction] || 0}¢/L</strong>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="slt-btn-primary" style={{ flex: 1 }} onClick={add}>Save Entry</button>
              <button className="slt-btn-ghost" style={{ padding: "12px 18px" }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* IFTA calculation table */}
        {iftaRows.length > 0 ? (
          <div className="slt-card">
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>IFTA Summary — {quarter}</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.offWhite }}>
                    {["Jurisdiction", "KM", "Fuel Alloc. (L)", "Fuel Purch. (L)", "Diff (L)", "Est. Tax"].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: C.textMed, borderBottom: `2px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {iftaRows.map((r, i) => (
                    <tr key={r.jur} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
                      <td style={{ padding: "9px 12px", fontWeight: 700 }}>{CA_PROVINCES.includes(r.jur) ? "🇨🇦" : "🇺🇸"} {r.jur}</td>
                      <td style={{ padding: "9px 12px" }}>{r.km.toLocaleString()}</td>
                      <td style={{ padding: "9px 12px" }}>{r.allocated}L</td>
                      <td style={{ padding: "9px 12px" }}>{r.fuel.toFixed(1)}L</td>
                      <td style={{ padding: "9px 12px", color: Number(r.diff) > 0 ? C.red : C.green, fontWeight: 700 }}>{Number(r.diff) > 0 ? "+" : ""}{r.diff}L</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, color: r.isRefund ? C.green : C.red }}>
                        {r.isRefund ? "↩ " : "→ "}{r.isRefund ? "Refund" : "Owed"} ${Math.abs(Number(r.taxOwed)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: C.blueLight }}>
                    <td colSpan={5} style={{ padding: "11px 12px", fontWeight: 800, fontFamily: "'Sora',sans-serif" }}>NET IFTA {totalTax >= 0 ? "TAX OWED" : "REFUND"}</td>
                    <td style={{ padding: "11px 12px", fontWeight: 800, fontFamily: "'Sora',sans-serif", fontSize: 16, color: totalTax > 0 ? C.red : C.green }}>${Math.abs(totalTax).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: C.textLight, marginTop: 10 }}>
              ⚠️ Rates are approximate. Always verify with official IFTA jurisdictional rates before filing.
            </div>
          </div>
        ) : (
          <div className="slt-card" style={{ textAlign: "center", padding: "52px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, marginBottom: 8 }}>No entries for {quarter}</div>
            <div style={{ color: C.textMed, fontSize: 13 }}>Add your KM by jurisdiction and fuel purchases to generate your IFTA report</div>
          </div>
        )}

        {/* Raw entries */}
        {qEntries.length > 0 && (
          <div className="slt-card" style={{ marginTop: 18 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Trip Entries</div>
            {[...qEntries].sort((a, b) => b.date > a.date ? 1 : -1).map(e => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{CA_PROVINCES.includes(e.jurisdiction) ? "🇨🇦" : "🇺🇸"} {e.jurisdiction} · {e.km} km</div>
                  <div style={{ fontSize: 11.5, color: C.textLight }}>{e.date}{e.note ? ` · ${e.note}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {e.fuelLitres > 0 && <div style={{ fontSize: 12.5, color: C.orange, fontWeight: 700 }}>{e.fuelLitres}L fuel</div>}
                  <button onClick={() => save(entries.filter(x => x.id !== e.id))} style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>✕ Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payroll Tab ──────────────────────────────────────────────────
// Feature 2: Driver Payroll Automation
function PayrollTab({ session, loads, rates, allDrivers }) {
  const payrollKey = `tp-payroll-${session.ownerUid || session.uid}`;
  const [payPeriod, setPayPeriod] = useState("biweekly");
  const [bonuses, setBonuses] = useState(getStored(payrollKey));
  const [showBonus, setShowBonus] = useState(false);
  const [bonusForm, setBonusForm] = useState({ driverUid: "", amount: "", reason: "", date: todayStr() });
  const [expandDriver, setExpandDriver] = useState(null);

  const now = new Date();
  const periodStart = new Date(now);
  if (payPeriod === "weekly") periodStart.setDate(now.getDate() - 7);
  else if (payPeriod === "biweekly") periodStart.setDate(now.getDate() - 14);
  else periodStart.setDate(1); // monthly

  const inPeriod = (dateStr) => dateStr && new Date(dateStr) >= periodStart;

  const saveBonus = (arr) => { setBonuses(arr); localStorage.setItem(payrollKey, JSON.stringify(arr)); };
  const addBonus = () => {
    if (!bonusForm.driverUid || !bonusForm.amount) return;
    saveBonus([{ ...bonusForm, amount: Number(bonusForm.amount), id: Date.now().toString() }, ...bonuses]);
    setBonusForm({ driverUid: "", amount: "", reason: "", date: todayStr() });
    setShowBonus(false);
  };

  const getDriverPayroll = (driver) => {
    const dLoads = loads.filter(l => (l.assignedDriverUid === driver.uid || l.addedBy === driver.uid) && inPeriod(l.date));
    const routePay = dLoads.reduce((s, l) => s + Number(l.driverBasePay || 0), 0);
    const waitPay = dLoads.reduce((s, l) => {
      const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
      return s + wm / 60 * (Number(rates.driverWaitRate) || 0);
    }, 0);
    const driverBonuses = bonuses.filter(b => b.driverUid === driver.uid && inPeriod(b.date));
    const bonusTotal = driverBonuses.reduce((s, b) => s + Number(b.amount || 0), 0);
    const total = routePay + waitPay + bonusTotal;
    return { dLoads, routePay, waitPay, bonusTotal, total, driverBonuses };
  };

  const exportPayroll = () => {
    const rows = allDrivers.map(d => {
      const p = getDriverPayroll(d);
      return `<tr><td>${d.fullName || d.name}</td><td>${p.dLoads.length}</td><td>$${p.routePay.toFixed(2)}</td><td>$${p.waitPay.toFixed(2)}</td><td>$${p.bonusTotal.toFixed(2)}</td><td style="font-weight:800">$${p.total.toFixed(2)}</td></tr>`;
    }).join("");
    const grandTotal = allDrivers.reduce((s, d) => s + getDriverPayroll(d).total, 0);
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Payroll Report</title><style>body{font-family:Arial;padding:28px}h1{color:#1E88E5}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#E3F2FD;padding:9px 12px;text-align:left;font-size:12px}td{padding:9px 12px;border-bottom:1px solid #eee;font-size:13px}.tot{background:#F7F9FC;font-weight:800}</style></head><body><h1>Driver Payroll — ${payPeriod} · ${periodStart.toDateString()} to ${now.toDateString()}</h1><table><thead><tr><th>Driver</th><th>Loads</th><th>Route Pay</th><th>Wait Pay</th><th>Bonuses</th><th>TOTAL</th></tr></thead><tbody>${rows}<tr class="tot"><td colspan="5">GRAND TOTAL</td><td>$${grandTotal.toFixed(2)}</td></tr></tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 500);
  };

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">💵 Driver Payroll</div>
        <div className="slt-hero-sub">Automated pay calculation · Export for accounting</div>
      </div>
      <div className="slt-container">
        <div className="slt-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label className="slt-label">Pay Period</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["weekly", "Weekly"], ["biweekly", "Bi-Weekly"], ["monthly", "Monthly"]].map(([v, l]) => (
                  <button key={v} onClick={() => setPayPeriod(v)} className="slt-btn-secondary"
                    style={{ background: payPeriod === v ? C.blue : "#fff", color: payPeriod === v ? "#fff" : C.textMed, borderColor: payPeriod === v ? C.blue : C.border, padding: "8px 16px" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="slt-btn-secondary" style={{ padding: "10px 16px" }} onClick={() => setShowBonus(!showBonus)}>+ Bonus</button>
              <button className="slt-btn-primary" style={{ width: "auto", padding: "10px 18px" }} onClick={exportPayroll}>📄 Export</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 10 }}>Period: {periodStart.toDateString()} — {now.toDateString()}</div>
        </div>

        {showBonus && (
          <div className="slt-card" style={{ border: `2px solid ${C.green}`, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, color: C.green, marginBottom: 14 }}>Add Bonus / Adjustment</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label className="slt-label">Driver</label>
                <select value={bonusForm.driverUid} onChange={e => setBonusForm(f => ({ ...f, driverUid: e.target.value }))} className="slt-input">
                  <option value="">— Select Driver —</option>
                  {allDrivers.map(d => <option key={d.uid} value={d.uid}>{d.fullName || d.name}</option>)}
                </select>
              </div>
              <div><label className="slt-label">Amount ($)</label><input type="number" step="0.01" placeholder="0.00" value={bonusForm.amount} onChange={e => setBonusForm(f => ({ ...f, amount: e.target.value }))} className="slt-input" /></div>
              <div><label className="slt-label">Reason</label><input placeholder="e.g. Safety bonus" value={bonusForm.reason} onChange={e => setBonusForm(f => ({ ...f, reason: e.target.value }))} className="slt-input" /></div>
              <div><label className="slt-label">Date</label><input type="date" value={bonusForm.date} onChange={e => setBonusForm(f => ({ ...f, date: e.target.value }))} className="slt-input" /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="slt-btn-primary" style={{ flex: 1, background: `linear-gradient(135deg,${C.green},#1B5E20)` }} onClick={addBonus}>Save Bonus</button>
              <button className="slt-btn-ghost" style={{ padding: "12px 18px" }} onClick={() => setShowBonus(false)}>Cancel</button>
            </div>
          </div>
        )}

        {allDrivers.length === 0 ? (
          <div className="slt-card" style={{ textAlign: "center", padding: "52px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>👥</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>No Drivers Yet</div>
            <div style={{ color: C.textMed }}>Add drivers first to view payroll</div>
          </div>
        ) : (
          allDrivers.map(driver => {
            const p = getDriverPayroll(driver);
            const isOpen = expandDriver === driver.uid;
            return (
              <div key={driver.uid} className="slt-card" style={{ cursor: "pointer" }} onClick={() => setExpandDriver(isOpen ? null : driver.uid)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 17 }}>{driver.fullName || driver.name}</div>
                    <div style={{ fontSize: 12, color: C.textLight }}>{p.dLoads.length} load{p.dLoads.length !== 1 ? "s" : ""} this period</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800, color: C.green }}>{fmtC(p.total)}</div>
                    <div style={{ fontSize: 11, color: C.textLight }}>{isOpen ? "▲ Hide" : "▼ Details"}</div>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                      {[["Route Pay", fmtC(p.routePay), C.blue], ["Wait Pay", fmtC(p.waitPay), C.orange], ["Bonuses", fmtC(p.bonusTotal), C.green]].map(([l, v, color]) => (
                        <div key={l} style={{ background: C.offWhite, borderRadius: 9, padding: "12px", textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700 }}>{l}</div>
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {p.dLoads.map(l => (
                      <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                        <span>{l.location} · {l.date}</span>
                        <span style={{ fontWeight: 700, color: C.blue }}>{fmtC(l.driverBasePay)}</span>
                      </div>
                    ))}
                    {p.driverBonuses.map(b => (
                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                        <span style={{ color: C.green }}>🎁 {b.reason || "Bonus"} · {b.date}</span>
                        <span style={{ fontWeight: 700, color: C.green }}>+{fmtC(b.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────
// Feature 3: Trip History & Analytics (Charts using SVG)
function AnalyticsTab({ session, loads, isOwner, rates }) {
  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid);
  const [view, setView] = useState("income");

  // Build monthly income data (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short" });
    const mLoads = myLoads.filter(l => l.date && l.date.startsWith(key));
    const gross = mLoads.reduce((s, l) => {
      const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
      return s + Number(l.earnings || 0) + wm / 60 * (Number(isOwner ? rates.companyWaitRate : rates.driverWaitRate) || 0);
    }, 0);
    const drvPay = isOwner ? mLoads.filter(l => l.assignedDriverUid).reduce((s, l) => {
      const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
      return s + Number(l.driverBasePay || 0) + wm / 60 * (Number(rates.driverWaitRate) || 0);
    }, 0) : 0;
    months.push({ key, label, count: mLoads.length, gross, net: gross - drvPay });
  }

  // Route performance
  const routeMap = {};
  myLoads.forEach(l => {
    if (!l.location) return;
    if (!routeMap[l.location]) routeMap[l.location] = { count: 0, totalEarnings: 0, totalFuel: 0 };
    routeMap[l.location].count++;
    routeMap[l.location].totalEarnings += Number(l.earnings || 0);
    routeMap[l.location].totalFuel += Number(l.fuelTotal || 0);
  });
  const topRoutes = Object.entries(routeMap).map(([route, d]) => ({ route, ...d, avg: d.totalEarnings / d.count }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings).slice(0, 8);

  // Fuel efficiency
  const loadsWithFuel = myLoads.filter(l => l.fuelLitres > 0 && l.km > 0);
  const avgEfficiency = loadsWithFuel.length > 0
    ? loadsWithFuel.reduce((s, l) => s + Number(l.km) / Number(l.fuelLitres), 0) / loadsWithFuel.length
    : null;

  const totalLoads = myLoads.length;
  const completedLoads = myLoads.filter(l => l.completed).length;
  const totalGross = myLoads.reduce((s, l) => s + Number(l.earnings || 0), 0);
  const avgPerLoad = totalLoads > 0 ? totalGross / totalLoads : 0;

  // SVG Bar Chart
  const BarChart = ({ data, valueKey, colorFn, height = 140 }) => {
    const max = Math.max(...data.map(d => d[valueKey]), 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, padding: "0 4px" }}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d[valueKey] / max) * (height - 30));
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3, fontWeight: 700 }}>{d[valueKey] > 1000 ? `$${(d[valueKey] / 1000).toFixed(1)}k` : d[valueKey] > 0 ? fmtC(d[valueKey]) : "—"}</div>
              <div style={{ width: "100%", height: barH, background: colorFn ? colorFn(i) : `linear-gradient(180deg, ${C.teal}, ${C.blue})`, borderRadius: "5px 5px 0 0", transition: "height 0.4s" }} />
              <div style={{ fontSize: 10, color: C.textMed, marginTop: 4, fontWeight: 600 }}>{d.label}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">📈 Analytics</div>
        <div className="slt-hero-sub">Performance · Income trends · Best routes</div>
      </div>
      <div className="slt-container">
        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
          {[
            ["Total Loads", totalLoads, C.blue, "#1565C0"],
            ["Completed", `${completedLoads} (${totalLoads > 0 ? Math.round(completedLoads / totalLoads * 100) : 0}%)`, C.green, C.green],
            ["Total Earned", fmtC(totalGross), C.orange, C.orange],
            ["Avg / Load", fmtC(avgPerLoad), C.purple, C.purple],
          ].map(([l, v, color, border]) => (
            <div key={l} className="slt-card-sm" style={{ borderTop: `4px solid ${border}` }}>
              <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>{l}</div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color }}>{v}</div>
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[["income", "📊 Income"], ["routes", "🗺 Top Routes"], ["efficiency", "⛽ Efficiency"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className="slt-btn-secondary"
              style={{ background: view === v ? C.navy : "#fff", color: view === v ? "#fff" : C.textMed, borderColor: view === v ? C.navy : C.border, padding: "9px 18px" }}>{l}</button>
          ))}
        </div>

        {view === "income" && (
          <div className="slt-card">
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Monthly Income — Last 6 Months</div>
            <div style={{ fontSize: 12, color: C.textLight, marginBottom: 20 }}>Blue = {isOwner ? "Gross" : "Your Pay"}</div>
            <BarChart data={months} valueKey="gross" />
            <div style={{ marginTop: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: C.offWhite }}>{["Month", "Loads", isOwner ? "Gross" : "Pay", isOwner ? "Net" : ""].filter(Boolean).map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: C.textMed }}>{h}</th>)}</tr></thead>
                <tbody>{months.map((m, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.offWhite }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700 }}>{m.label}</td>
                    <td style={{ padding: "8px 12px" }}>{m.count}</td>
                    <td style={{ padding: "8px 12px", color: C.green, fontWeight: 700 }}>{fmtC(m.gross)}</td>
                    {isOwner && <td style={{ padding: "8px 12px", color: m.net >= 0 ? C.blue : C.red, fontWeight: 700 }}>{fmtC(m.net)}</td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {view === "routes" && (
          <div className="slt-card">
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 20 }}>Best Performing Routes</div>
            {topRoutes.length === 0 ? <div style={{ color: C.textLight, textAlign: "center", padding: "28px 0" }}>No route data yet</div> : (
              topRoutes.map((r, i) => (
                <div key={r.route} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>#{i + 1} {r.route}</span>
                      <span style={{ fontSize: 11.5, color: C.textLight, marginLeft: 8 }}>{r.count} load{r.count !== 1 ? "s" : ""}</span>
                    </div>
                    <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, color: C.green }}>{fmtC(r.totalEarnings)}</span>
                  </div>
                  <div style={{ height: 8, background: C.border, borderRadius: 4 }}>
                    <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg,${C.teal},${C.blue})`, width: `${Math.round(r.totalEarnings / (topRoutes[0]?.totalEarnings || 1) * 100)}%`, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 11.5, color: C.textLight }}>
                    <span>Avg/load: <strong style={{ color: C.blue }}>{fmtC(r.avg)}</strong></span>
                    {r.totalFuel > 0 && <span>Fuel: <strong style={{ color: C.orange }}>{fmtC(r.totalFuel)}</strong></span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === "efficiency" && (
          <div>
            {avgEfficiency ? (
              <div className="slt-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                <div style={{ fontSize: 56, marginBottom: 8 }}>⛽</div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 48, fontWeight: 800, color: C.orange }}>{avgEfficiency.toFixed(2)}</div>
                <div style={{ fontSize: 16, color: C.textMed, marginTop: 4 }}>km/L average fuel efficiency</div>
              </div>
            ) : (
              <div className="slt-card" style={{ textAlign: "center", padding: "52px 24px" }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>⛽</div>
                <div style={{ color: C.textMed }}>No fuel efficiency data yet. Log KM and fuel on loads to track efficiency.</div>
              </div>
            )}
            <div className="slt-card">
              <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Monthly Load Count</div>
              <BarChart data={months} valueKey="count" colorFn={i => `hsl(${200 + i * 8},70%,50%)`} height={120} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────
// Feature 4: Document Storage
function DocumentsTab({ session }) {
  const docsKey = `tp-docs-${session.uid}`;
  const [docs, setDocs] = useState(getStored(docsKey));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "bol", note: "", expiry: "", files: [] });
  const [viewDoc, setViewDoc] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const inputRef = useRef(null);

  const CATS = [
    { id: "bol", label: "Bill of Lading", icon: "📦", color: C.blue },
    { id: "insurance", label: "Insurance", icon: "🛡", color: C.green },
    { id: "permit", label: "Permits", icon: "📋", color: C.orange },
    { id: "inspection", label: "Inspection", icon: "🔍", color: C.purple },
    { id: "license", label: "License / CVOR", icon: "🪪", color: C.teal },
    { id: "other", label: "Other", icon: "📁", color: C.textMed },
  ];
  const getCat = (id) => CATS.find(c => c.id === id) || CATS[5];

  const save = (arr) => {
    setDocs(arr);
    try { localStorage.setItem(docsKey, JSON.stringify(arr)); } catch {
      const stripped = arr.map(d => ({ ...d, files: (d.files || []).map(f => ({ ...f, data: "[stored]" })) }));
      localStorage.setItem(docsKey, JSON.stringify(stripped));
      setDocs(arr);
    }
  };

  const handleFile = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setForm(f => ({ ...f, files: [...f.files, { id: Date.now().toString() + Math.random(), name: file.name, data: ev.target.result, type: file.type }] }));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const add = () => {
    if (!form.name.trim()) return;
    save([{ ...form, id: Date.now().toString(), uploadedAt: todayStr() }, ...docs]);
    setForm({ name: "", category: "bol", note: "", expiry: "", files: [] });
    setShowAdd(false);
  };

  const isExpired = (d) => d.expiry && d.expiry < todayStr();
  const isExpiringSoon = (d) => {
    if (!d.expiry || isExpired(d)) return false;
    const diff = (new Date(d.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  };

  const filtered = filterCat === "all" ? docs : docs.filter(d => d.category === filterCat);
  const expiredCount = docs.filter(isExpired).length;
  const soonCount = docs.filter(isExpiringSoon).length;

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">📁 Document Storage</div>
        <div className="slt-hero-sub">BOL · Insurance · Permits · Inspections — all in one place</div>
      </div>
      <div className="slt-container">
        {(expiredCount > 0 || soonCount > 0) && (
          <div style={{ background: "#FFF8E1", border: "1.5px solid #FFB300", borderRadius: 12, padding: "12px 18px", marginBottom: 18, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div>
              {expiredCount > 0 && <div style={{ fontWeight: 800, color: C.red }}>{expiredCount} document{expiredCount > 1 ? "s" : ""} expired!</div>}
              {soonCount > 0 && <div style={{ fontWeight: 700, color: C.orange }}>{soonCount} expiring within 30 days</div>}
            </div>
          </div>
        )}

        {/* Category filter */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
          <button onClick={() => setFilterCat("all")} className="slt-btn-secondary"
            style={{ background: filterCat === "all" ? C.navy : "#fff", color: filterCat === "all" ? "#fff" : C.textMed, borderColor: filterCat === "all" ? C.navy : C.border, padding: "7px 14px" }}>All ({docs.length})</button>
          {CATS.map(c => {
            const cnt = docs.filter(d => d.category === c.id).length;
            if (!cnt && filterCat !== c.id) return null;
            return (
              <button key={c.id} onClick={() => setFilterCat(c.id)} className="slt-btn-secondary"
                style={{ background: filterCat === c.id ? c.color : "#fff", color: filterCat === c.id ? "#fff" : C.textMed, borderColor: filterCat === c.id ? c.color : C.border, padding: "7px 14px" }}>
                {c.icon} {c.label} ({cnt})
              </button>
            );
          })}
          <button className="slt-btn-primary" style={{ marginLeft: "auto", width: "auto", padding: "10px 18px" }} onClick={() => setShowAdd(!showAdd)}>+ Upload Doc</button>
        </div>

        {showAdd && (
          <div className="slt-card" style={{ border: `2px solid ${C.blue}`, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, color: C.blue, fontSize: 16, marginBottom: 14 }}>Upload Document</div>
            <div style={{ marginBottom: 12 }}><label className="slt-label">Document Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="slt-input" placeholder="e.g. Insurance Certificate 2024" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label className="slt-label">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="slt-input">
                  {CATS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div><label className="slt-label">Expiry Date</label><input type="date" value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} className="slt-input" /></div>
            </div>
            <div style={{ marginBottom: 14 }}><label className="slt-label">Notes</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="slt-input" placeholder="Optional notes…" /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="slt-label">Attach Files</label>
              <div style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", background: C.offWhite }} onClick={() => inputRef.current?.click()}>
                <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={handleFile} />
                <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                <div style={{ fontSize: 13, color: C.textMed }}>Click to attach files (images, PDFs)</div>
              </div>
              {form.files.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {form.files.map(f => (
                    <div key={f.id} style={{ position: "relative" }}>
                      {f.type?.startsWith("image")
                        ? <img src={f.data} alt={f.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                        : <div style={{ width: 64, height: 64, borderRadius: 8, border: `1px solid ${C.border}`, background: C.offWhite, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📄</div>
                      }
                      <button onClick={() => setForm(prev => ({ ...prev, files: prev.files.filter(x => x.id !== f.id) }))}
                        style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", fontWeight: 800 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="slt-btn-primary" style={{ flex: 1 }} onClick={add}>Save Document</button>
              <button className="slt-btn-ghost" style={{ padding: "12px 18px" }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="slt-card" style={{ textAlign: "center", padding: "52px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📁</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>No documents yet</div>
            <div style={{ color: C.textMed }}>Upload BOL, insurance, permits and keep everything organized</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
            {filtered.map(d => {
              const cat = getCat(d.category);
              const expired = isExpired(d);
              const soon = isExpiringSoon(d);
              return (
                <div key={d.id} className="slt-card" style={{ borderTop: `4px solid ${expired ? C.red : soon ? C.orange : cat.color}`, cursor: "pointer" }} onClick={() => setViewDoc(d)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <span style={{ fontSize: 28 }}>{cat.icon}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {expired && <span className="slt-badge-red" style={{ fontSize: 10 }}>EXPIRED</span>}
                      {soon && !expired && <span className="slt-badge-orange" style={{ fontSize: 10 }}>⚠ Expiring</span>}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: C.textLight, marginBottom: 6 }}>{cat.label}{d.expiry ? ` · Expires ${d.expiry}` : ""}</div>
                  {d.note && <div style={{ fontSize: 12, color: C.textMed, marginBottom: 8, fontStyle: "italic" }}>{d.note}</div>}
                  {(d.files || []).length > 0 && <div style={{ fontSize: 12, color: C.blue }}>📎 {d.files.length} file{d.files.length !== 1 ? "s" : ""}</div>}
                  <button onClick={e => { e.stopPropagation(); if (window.confirm("Delete?")) save(docs.filter(x => x.id !== d.id)); }}
                    style={{ marginTop: 10, background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>🗑 Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Doc viewer modal */}
      {viewDoc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 28px 80px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontFamily: "'Sora',sans-serif", fontWeight: 800 }}>{viewDoc.name}</h2>
              <button className="slt-btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setViewDoc(null)}>✕</button>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ fontSize: 13, color: C.textMed, marginBottom: 12 }}>Category: {getCat(viewDoc.category).label}{viewDoc.expiry ? ` · Expires: ${viewDoc.expiry}` : ""}</div>
              {viewDoc.note && <div style={{ background: C.offWhite, borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.textMed }}>{viewDoc.note}</div>}
              {(viewDoc.files || []).length === 0 ? <div style={{ color: C.textLight, textAlign: "center", padding: "20px 0" }}>No files attached</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {viewDoc.files.map(f => (
                    <div key={f.id}>
                      {f.type?.startsWith("image") && f.data !== "[stored]"
                        ? <img src={f.data} alt={f.name} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
                        : <div style={{ background: C.offWhite, borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 32 }}>📄</span>
                          <div><div style={{ fontWeight: 700 }}>{f.name}</div>{f.data !== "[stored]" && <a href={f.data} download={f.name} style={{ color: C.blue, fontSize: 13 }}>Download</a>}</div>
                        </div>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Load Board Tab ───────────────────────────────────────────────
// Feature 5: Load Board (simulated + external links)
function LoadBoardTab({ session }) {
  const [province, setProvince] = useState("AB");
  const [destProvince, setDestProvince] = useState("");
  const [equipType, setEquipType] = useState("flatbed");
  const [showSample, setShowSample] = useState(false);

  const PROVINCES = ["AB", "BC", "MB", "ON", "QC", "SK", "NB", "NS", "NL", "PE"];
  const EQUIP = ["flatbed", "van", "reefer", "step_deck", "lowboy", "tanker", "conestoga"];

  // Sample loads (realistic mock data)
  const sampleLoads = [
    { id: 1, origin: "Edmonton, AB", dest: "Calgary, AB", dist: 300, rate: 850, ratePerMile: 2.83, equipment: "flatbed", weight: "42,000 lbs", age: "2h ago", broker: "Coyote", posted: todayStr() },
    { id: 2, origin: "Calgary, AB", dest: "Vancouver, BC", dist: 970, rate: 3200, ratePerMile: 3.30, equipment: "van", weight: "38,000 lbs", age: "4h ago", broker: "Echo Global", posted: todayStr() },
    { id: 3, origin: "Saskatoon, SK", dest: "Winnipeg, MB", dist: 780, rate: 1950, ratePerMile: 2.50, equipment: "flatbed", weight: "44,000 lbs", age: "1h ago", broker: "CH Robinson", posted: todayStr() },
    { id: 4, origin: "Edmonton, AB", dest: "Toronto, ON", dist: 3400, rate: 9800, ratePerMile: 2.88, equipment: "reefer", weight: "35,000 lbs", age: "30m ago", broker: "Total Quality", posted: todayStr() },
    { id: 5, origin: "Lethbridge, AB", dest: "Great Falls, MT", dist: 420, rate: 1400, ratePerMile: 3.33, equipment: "flatbed", weight: "40,000 lbs", age: "6h ago", broker: "DAT Direct", posted: todayStr() },
    { id: 6, origin: "Red Deer, AB", dest: "Regina, SK", dist: 680, rate: 1750, ratePerMile: 2.57, equipment: "step_deck", weight: "45,000 lbs", age: "3h ago", broker: "Transplace", posted: todayStr() },
  ];

  const equipLabel = e => e.replace("_", " ").replace(/\b\w/g, x => x.toUpperCase());

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">🚛 Load Board</div>
        <div className="slt-hero-sub">Find available loads · Connect to DAT & Truckstop</div>
      </div>
      <div className="slt-container">
        {/* External board links */}
        <div className="slt-card" style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>🔗 Industry Load Boards</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            {[
              { name: "DAT Load Board", url: "https://www.dat.com", desc: "Largest North American load board", color: "#E53935", logo: "🏆" },
              { name: "Truckstop.com", url: "https://truckstop.com", desc: "Real-time freight marketplace", color: "#F57C00", logo: "🚚" },
              { name: "123Loadboard", url: "https://www.123loadboard.com", desc: "Canadian & US loads", color: "#1E88E5", logo: "🇨🇦" },
              { name: "LoadLink", url: "https://www.loadlink.ca", desc: "Canada's freight network", color: "#00897B", logo: "🔗" },
              { name: "Convoy", url: "https://convoy.com", desc: "Digital freight network", color: "#7B1FA2", logo: "📡" },
              { name: "uShip", url: "https://www.uship.com", desc: "Freight marketplace", color: "#FF6F00", logo: "📦" },
            ].map(b => (
              <a key={b.name} href={b.url} target="_blank" rel="noreferrer"
                style={{ display: "block", background: C.offWhite, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", textDecoration: "none", transition: "all 0.18s", borderLeft: `4px solid ${b.color}` }}
                onMouseEnter={e => { e.currentTarget.style.background = C.blueLight; e.currentTarget.style.borderColor = C.blue; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.offWhite; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = b.color; }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{b.logo}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.textDark }}>{b.name}</div>
                <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{b.desc}</div>
                <div style={{ fontSize: 11, color: b.color, fontWeight: 700, marginTop: 6 }}>Open →</div>
              </a>
            ))}
          </div>
        </div>

        {/* Sample loads */}
        <div className="slt-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16 }}>📋 Sample Available Loads</div>
              <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>Demo data for reference — connect to DAT for live loads</div>
            </div>
            <button className="slt-btn-secondary" style={{ padding: "8px 14px" }} onClick={() => setShowSample(!showSample)}>
              {showSample ? "Hide" : "Show Samples"}
            </button>
          </div>
          {showSample && (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <select value={equipType} onChange={e => setEquipType(e.target.value)} className="slt-input" style={{ maxWidth: 180 }}>
                  {EQUIP.map(e => <option key={e} value={e}>{equipLabel(e)}</option>)}
                </select>
                <select value={province} onChange={e => setProvince(e.target.value)} className="slt-input" style={{ maxWidth: 120 }}>
                  {PROVINCES.map(p => <option key={p} value={p}>From: {p}</option>)}
                </select>
              </div>
              {sampleLoads.map(l => (
                <div key={l.id} className="slt-card-sm" style={{ marginBottom: 10, borderLeft: `4px solid ${C.blue}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{l.origin} → {l.dest}</div>
                      <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{l.dist.toLocaleString()} km · {l.weight} · {equipLabel(l.equipment)}</div>
                      <div style={{ fontSize: 12, color: C.textMed, marginTop: 2 }}>Broker: {l.broker} · Posted {l.age}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, color: C.green }}>{fmtC(l.rate)}</div>
                      <div style={{ fontSize: 11, color: C.textLight }}>${l.ratePerMile}/km</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <a href="https://www.dat.com" target="_blank" rel="noreferrer" className="slt-btn-primary" style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "8px 0", borderRadius: 8, fontSize: 12 }}>📞 Contact Broker</a>
                    <button className="slt-btn-secondary" style={{ flex: 1, padding: "8px 0", fontSize: 12 }}>📋 Book Load</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="slt-card" style={{ background: `linear-gradient(135deg,${C.navy},${C.navyMid})`, border: "none" }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 12 }}>💡 Load Board Tips</div>
          {["DAT and Truckstop offer free trials — sign up before you need loads", "Search by equipment type (flatbed has highest demand in AB)", "Rate per km should be $2.50+ to be profitable after fuel", "Use 123Loadboard for Canadian-specific freight", "Post your truck availability to attract brokers to you"].map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
              <span style={{ color: C.teal, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tax Export Tab ───────────────────────────────────────────────
// Feature 6: Tax Expense Export
function TaxTab({ session, isOwner }) {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const expenses = getStored(expensesKey(session.uid));

  const TAX_CATS = [
    { id: "fuel", label: "Fuel & Oil", icon: "⛽", taxLine: "Line 9220 – Fuel costs", color: C.orange },
    { id: "maintenance", label: "Repairs & Maintenance", icon: "🔧", taxLine: "Line 9270 – Repairs", color: C.red },
    { id: "insurance", label: "Insurance", icon: "🛡", taxLine: "Line 9910 – Insurance", color: C.blue },
    { id: "permits", label: "Licenses & Permits", icon: "📋", taxLine: "Line 9270 – Licences", color: C.purple },
    { id: "meals", label: "Meals (50% deductible)", icon: "🍽", taxLine: "Line 8523 – Meals (50%)", color: C.green },
    { id: "lodging", label: "Accommodation", icon: "🏨", taxLine: "Line 9200 – Travel", color: C.teal },
    { id: "tolls", label: "Tolls & Parking", icon: "🛣", taxLine: "Line 9281 – Other", color: C.textMed },
    { id: "other", label: "Other Operating", icon: "📦", taxLine: "Line 9270 – Other", color: "#546E7A" },
  ];

  const yearExp = expenses.filter(e => e.date && e.date.startsWith(year));
  const byCategory = TAX_CATS.map(cat => ({
    ...cat,
    total: yearExp.filter(e => e.category === cat.id).reduce((s, e) => s + Number(e.amount || 0), 0),
    count: yearExp.filter(e => e.category === cat.id).length,
  }));
  const grandTotal = byCategory.reduce((s, c) => s + c.total, 0);
  const mealsDeductible = byCategory.find(c => c.id === "meals")?.total * 0.5 || 0;
  const adjustedTotal = grandTotal - (byCategory.find(c => c.id === "meals")?.total * 0.5 || 0);

  const exportTax = () => {
    const rows = byCategory.filter(c => c.total > 0).map(c =>
      `<tr><td>${c.icon}</td><td><strong>${c.label}</strong><br><small style="color:#888">${c.taxLine}</small></td><td style="text-align:right">${c.count} entries</td><td style="text-align:right;font-weight:800;color:${c.color}">${fmtC(c.total)}${c.id === "meals" ? `<br><small>(Deductible: ${fmtC(c.total * 0.5)})</small>` : ""}</td></tr>`
    ).join("");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Tax Summary ${year}</title><style>body{font-family:Arial;padding:28px;max-width:800px;margin:0 auto}h1{color:#1E88E5}h2{color:#4A6080;font-size:16px;border-bottom:1px solid #eee;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#E3F2FD;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase}td{padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top}.tot{background:#E8F5E9;font-weight:800}.warn{background:#FFF8E1;font-size:12px;padding:10px;border-radius:6px;border-left:4px solid #FFB300}</style></head><body>
    <h1>🚛 Tax Expense Summary — ${year}</h1>
    <h2>Vehicle & Operating Expenses (CRA Schedule T2125 / T777)</h2>
    <table><thead><tr><th></th><th>Category</th><th>Entries</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}
    <tr class="tot"><td colspan="3">TOTAL EXPENSES</td><td style="text-align:right">$${grandTotal.toFixed(2)}</td></tr>
    <tr class="tot"><td colspan="3">ADJUSTED (meals at 50%)</td><td style="text-align:right">$${adjustedTotal.toFixed(2)}</td></tr>
    </tbody></table>
    <div class="warn">⚠️ This summary is for reference only. Consult a tax professional (CPA) for your actual return. Keep all original receipts for 6 years.</div>
    <p style="font-size:11px;color:#888;margin-top:20px">Generated by Smart Load Tracking · ${todayStr()}</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 500);
  };

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => y.toString());

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">🧾 Tax Export</div>
        <div className="slt-hero-sub">Auto-categorized expenses · CRA T2125 ready</div>
      </div>
      <div className="slt-container">
        <div className="slt-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <label className="slt-label">Tax Year</label>
              <div style={{ display: "flex", gap: 8 }}>
                {years.map(y => (
                  <button key={y} onClick={() => setYear(y)} className="slt-btn-secondary"
                    style={{ background: year === y ? C.blue : "#fff", color: year === y ? "#fff" : C.textMed, borderColor: year === y ? C.blue : C.border, padding: "8px 20px" }}>{y}</button>
                ))}
              </div>
            </div>
            <button className="slt-btn-primary" style={{ width: "auto", padding: "11px 22px" }} onClick={exportTax}>🖨 Export for Accountant</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.red}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>TOTAL EXPENSES</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: C.red }}>{fmtC(grandTotal)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.green}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>TAX DEDUCTIBLE</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: C.green }}>{fmtC(adjustedTotal)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.orange}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>MEALS (50%)</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: C.orange }}>{fmtC(mealsDeductible)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.blue}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>ENTRIES</div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: C.blue }}>{yearExp.length}</div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="slt-card">
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Expense Breakdown — {year}</div>
          {byCategory.map(cat => (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: cat.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{cat.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{cat.label}</div>
                <div style={{ fontSize: 11.5, color: C.textLight }}>{cat.taxLine}</div>
                {cat.id === "meals" && cat.total > 0 && <div style={{ fontSize: 11.5, color: C.orange }}>50% deductible = {fmtC(cat.total * 0.5)}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, color: cat.total > 0 ? cat.color : C.textLight }}>{fmtC(cat.total)}</div>
                <div style={{ fontSize: 11, color: C.textLight }}>{cat.count} entries</div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", marginTop: 4 }}>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16 }}>Adjusted Deductible Total</span>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 20, color: C.green }}>{fmtC(adjustedTotal)}</span>
          </div>
        </div>

        <div className="slt-card" style={{ background: "#FFF8E1", border: "1.5px solid #FFB300" }}>
          <div style={{ fontWeight: 800, color: C.orange, marginBottom: 6 }}>⚠️ Tax Disclaimer</div>
          <div style={{ fontSize: 13, color: C.textMed }}>This tool provides a summary for your accountant. Always work with a CPA for your actual tax filing. Keep all original receipts for a minimum of 6 years as required by CRA.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Emergency Tab ────────────────────────────────────────────────
// Feature 7: Emergency Roadside Help
function EmergencyTab() {
  const [loc, setLoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchType, setSearchType] = useState("mechanic");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const SEARCH_TYPES = [
    { id: "mechanic", label: "Mechanic", icon: "🔧", query: "truck+repair+mechanic" },
    { id: "tire", label: "Tire Shop", icon: "🔄", query: "truck+tire+repair" },
    { id: "tow", label: "Tow Truck", icon: "🚨", query: "tow+truck+service" },
    { id: "rest", label: "Truck Stop", icon: "🛑", query: "truck+stop" },
    { id: "fuel", label: "Fuel", icon: "⛽", query: "diesel+fuel+station" },
    { id: "hospital", label: "Hospital", icon: "🏥", query: "hospital+emergency" },
  ];

  const find = () => {
    setLoading(true); setError(""); setResults([]);
    if (!navigator.geolocation) { setError("Geolocation not supported."); setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setLoc({ lat, lng });
      const st = SEARCH_TYPES.find(s => s.id === searchType);
      try {
        const q = `[out:json][timeout:25];(node["shop"="car_repair"](around:20000,${lat},${lng});node["amenity"="fuel"](around:20000,${lat},${lng}););out body 15;`;
        const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
        const d = await r.json();
        const s = (d.elements || []).filter(e => e.lat && e.lon).slice(0, 10).map(e => ({
          id: e.id, name: e.tags?.name || "Service Provider", lat: e.lat, lng: e.lon,
          phone: e.tags?.phone || e.tags?.["contact:phone"] || null,
          dist: Math.round(Math.sqrt(Math.pow((e.lat - lat) * 111, 2) + Math.pow((e.lon - lng) * 111 * Math.cos(lat * Math.PI / 180), 2)) * 10) / 10,
        })).sort((a, b) => a.dist - b.dist);
        setResults(s); setSearched(true);
      } catch { setError("Search failed. Tap a card below to call for help."); }
      setLoading(false);
    }, () => { setError("Location unavailable."); setLoading(false); });
  };

  const EMERGENCY_CONTACTS = [
    { name: "BCAA Roadside", phone: "1-800-222-4357", area: "BC", icon: "🆘" },
    { name: "CAA Roadside", phone: "1-800-222-4357", area: "ON/QC", icon: "🆘" },
    { name: "AMA Roadside (AB)", phone: "1-800-222-4357", area: "AB", icon: "🆘" },
    { name: "Police/Emergency", phone: "911", area: "All", icon: "🚨" },
    { name: "Transport Canada", phone: "1-800-333-0371", area: "All", icon: "📋" },
  ];

  return (
    <div className="slt-page">
      <div className="slt-hero" style={{ background: `linear-gradient(135deg,#B71C1C,#D32F2F,#E53935)` }}>
        <div className="slt-hero-title">🚨 Emergency Roadside Help</div>
        <div className="slt-hero-sub">Find mechanics, tire shops, tow trucks near you</div>
      </div>
      <div className="slt-container">
        {/* Emergency contacts — always visible */}
        <div className="slt-card" style={{ borderTop: `4px solid ${C.red}`, marginBottom: 18 }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, color: C.red, marginBottom: 14 }}>📞 Emergency Contacts</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            {EMERGENCY_CONTACTS.map(c => (
              <a key={c.name} href={`tel:${c.phone.replace(/\D/g, "")}`}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.offWhite, borderRadius: 10, padding: "12px 14px", textDecoration: "none", border: `1px solid ${C.border}`, transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#FFEBEE"}
                onMouseLeave={e => e.currentTarget.style.background = C.offWhite}>
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: C.textDark }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: C.red, fontWeight: 700 }}>{c.phone}</div>
                  <div style={{ fontSize: 11, color: C.textLight }}>{c.area}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Find nearby services */}
        <div className="slt-card" style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>📍 Find Nearby Services</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {SEARCH_TYPES.map(s => (
              <button key={s.id} onClick={() => setSearchType(s.id)} className="slt-btn-secondary"
                style={{ background: searchType === s.id ? C.red : "#fff", color: searchType === s.id ? "#fff" : C.textMed, borderColor: searchType === s.id ? C.red : C.border, padding: "9px 14px" }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <button onClick={find} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.red},#B71C1C)`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Mulish',sans-serif" }}>
            📍 Find {SEARCH_TYPES.find(s => s.id === searchType)?.label} Near Me
          </button>
        </div>

        {loading && <div className="slt-card" style={{ textAlign: "center", padding: "32px", color: C.blue, fontWeight: 700 }}>🔍 Locating services…</div>}
        {error && <div style={{ background: "#FFEBEE", border: `1px solid ${C.red}30`, borderRadius: 12, padding: "14px 18px", color: C.red, marginBottom: 14 }}>{error}</div>}

        {results.map((r, i) => (
          <div key={r.id} className="slt-card" style={{ padding: "14px 18px", borderLeft: `4px solid ${C.red}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15 }}>{i + 1}. {r.name}</div>
                {r.phone && <div style={{ fontSize: 13, color: C.blue, marginTop: 2 }}>📞 {r.phone}</div>}
              </div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 18, fontWeight: 800, color: C.orange }}>{r.dist} km</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}&travelmode=driving`} target="_blank" rel="noreferrer"
                className="slt-btn-primary" style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "9px 0", borderRadius: 9, fontSize: 13 }}>🗺 Directions</a>
              {r.phone && <a href={`tel:${r.phone.replace(/\D/g, "")}`} className="slt-btn-secondary" style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "9px 0", borderRadius: 9, fontSize: 13 }}>📞 Call</a>}
            </div>
          </div>
        ))}

        {/* Safety checklist */}
        <div className="slt-card" style={{ background: `linear-gradient(135deg,${C.navy},${C.navyMid})`, border: "none" }}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 12 }}>🦺 Breakdown Safety Checklist</div>
          {["Pull completely off the road and onto the shoulder", "Turn on hazard lights immediately", "Place triangles/flares 30m, 60m, 90m behind truck", "Stay away from traffic — exit on the passenger side", "Call 911 if you feel unsafe or there's an injury", "Alert dispatch and document everything with photos"].map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ color: C.teal, fontWeight: 800, flexShrink: 0 }}>✓</span>
              <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─── MAIN APP v3 ─────────────────────────────────────────────────────────────
export default function SmartLoadTracking() {
  const [session, setSession] = useState(null);
  const [loads, setLoads] = useState([]);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [customRoutes, setCustomRoutes] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [detailLoad, setDetailLoad] = useState(null);
  const [editLoad, setEditLoad] = useState(null);
  const [invoiceLoad, setInvoiceLoad] = useState(null);

  useEffect(() => { const s = getSession(); if (s) loadSessionData(s); }, []);

  const loadSessionData = (s) => {
    setSession(s);
    const ownerUid = s.ownerUid || s.uid;
    try { const d = localStorage.getItem(loadsKey(ownerUid)); setLoads(d ? JSON.parse(d) : []); } catch {}
    try { const d = localStorage.getItem(ratesKey(ownerUid)); setRates(d ? { ...DEFAULT_RATES, ...JSON.parse(d) } : DEFAULT_RATES); } catch {}
    try { const d = localStorage.getItem(routesKey(ownerUid)); setCustomRoutes(d ? JSON.parse(d) : []); } catch {}
    try { const d = localStorage.getItem(trucksKey(ownerUid)); setTrucks(d ? JSON.parse(d) : []); } catch {}
  };

  const persist = (updated) => {
    const ownerUid = session.ownerUid || session.uid;
    setLoads(updated);
    localStorage.setItem(loadsKey(ownerUid), JSON.stringify(updated));
  };

  const handleLogin = (s) => { saveSession(s); loadSessionData(s); };
  const handleLogout = () => {
    clearSession(); setSession(null); setLoads([]); setRates(DEFAULT_RATES); setCustomRoutes([]); setTrucks([]);
  };

  const saveLoad = (load) => {
    const ex = loads.find(l => l.id === load.id);
    const updated = ex ? loads.map(l => l.id === load.id ? load : l) : [load, ...loads];
    persist(updated); setTab("log"); setEditLoad(null);
  };
  const deleteLoad = (id) => persist(loads.filter(l => l.id !== id));
  const toggleComplete = (id, completed) => {
    const updated = loads.map(l => l.id === id ? { ...l, completed, completedAt: completed ? new Date().toISOString() : null } : l);
    persist(updated);
    if (detailLoad?.id === id) setDetailLoad(updated.find(l => l.id === id));
  };
  const addNote = (loadId, text, author) => {
    const msg = { text, authorUid: author.uid, authorName: author.fullName || author.name, timestamp: new Date().toISOString() };
    const updated = loads.map(l => l.id === loadId ? { ...l, messages: [...(l.messages || []), msg] } : l);
    persist(updated);
    if (detailLoad?.id === loadId) setDetailLoad(updated.find(l => l.id === loadId));
  };

  if (!session) return <><GlobalCSS /><AuthScreen onLogin={handleLogin} /></>;

  const isOwner = session.role === "owner";
  const ownerUid = session.ownerUid || session.uid;
  const allDrivers = Object.values(getUsers()).filter(u => u.role === "driver" && u.ownerUid === ownerUid);
  const mergedRoutes = customRoutes.map(r => ({ ...r, billingMethod: r.billingMethod || "per_load", rate: r.rate || 0 }));
  const visibleLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid);
  const unreadMessages = visibleLoads.filter(l => l.messages && l.messages.some(m => m.authorUid !== session.uid)).length;

  // Extended nav items for ALL users
  const allOwnerTabs = ["dashboard","log","new","expenses","drivers","messages","fuel_finder","profit","maintenance","report","ifta","payroll","analytics","documents","loadboard","tax","emergency"];
  const allDriverTabs = ["dashboard","log","new","expenses","messages","fuel_finder","profit","maintenance","report","analytics","documents","emergency"];

  // Nav items for dropdown
  const ownerNavItems = [
    { id:"dashboard", icon:"🏠", label:"Dashboard" },
    { id:"log",       icon:"📋", label:"Haul Log" },
    { id:"new",       icon:"➕", label:"Post Load" },
    { id:"expenses",  icon:"🧾", label:"Expenses" },
    { id:"drivers",   icon:"👥", label:"Drivers" },
    { id:"messages",  icon:"💬", label:"Messages", badge: unreadMessages },
    { id:"fuel_finder",icon:"⛽",label:"Fuel" },
    { id:"profit",    icon:"💰", label:"Profit Calc" },
    { id:"maintenance",icon:"🔧",label:"Maintenance" },
    { id:"report",    icon:"📊", label:"Reports" },
    { id:"ifta",      icon:"📋", label:"IFTA Tax" },
    { id:"payroll",   icon:"💵", label:"Payroll" },
    { id:"analytics", icon:"📈", label:"Analytics" },
    { id:"documents", icon:"📁", label:"Documents" },
    { id:"loadboard", icon:"🚛", label:"Load Board" },
    { id:"tax",       icon:"🧾", label:"Tax Export" },
    { id:"emergency", icon:"🚨", label:"Emergency" },
  ];
  const driverNavItems = [
    { id:"dashboard", icon:"🏠", label:"Dashboard" },
    { id:"log",       icon:"📋", label:"My Loads" },
    { id:"new",       icon:"➕", label:"Log Load" },
    { id:"expenses",  icon:"🧾", label:"Expenses" },
    { id:"messages",  icon:"💬", label:"Messages", badge: unreadMessages },
    { id:"fuel_finder",icon:"⛽",label:"Fuel" },
    { id:"profit",    icon:"💰", label:"Pay Calc" },
    { id:"maintenance",icon:"🔧",label:"Maintenance" },
    { id:"report",    icon:"📊", label:"Reports" },
    { id:"analytics", icon:"📈", label:"Analytics" },
    { id:"documents", icon:"📁", label:"Documents" },
    { id:"emergency", icon:"🚨", label:"Emergency" },
  ];

  return (
    <div style={{ fontFamily: "'Mulish',sans-serif", minHeight: "100vh" }}>
      <GlobalCSS />
      <NavBar
        session={session}
        tab={tab}
        setTab={setTab}
        setShowSettings={setShowSettings}
        onLogout={handleLogout}
        isOwner={isOwner}
        unreadMessages={unreadMessages}
        navItems={isOwner ? ownerNavItems : driverNavItems}
      />

      {/* ── Core tabs ── */}
      {tab === "dashboard"  && <DashboardTab   session={session} loads={visibleLoads} rates={rates} isOwner={isOwner} setTab={setTab} allDrivers={allDrivers} trucks={trucks} />}
      {tab === "log"        && <HaulLogTab      session={session} loads={visibleLoads} rates={rates} isOwner={isOwner} trucks={trucks} setTab={setTab} setEditLoad={setEditLoad} deleteLoad={deleteLoad} setDetailLoad={setDetailLoad} toggleComplete={toggleComplete} />}
      {tab === "new"        && <LoadFormTab     session={session} isOwner={isOwner} rates={rates} allRoutes={mergedRoutes} trucks={trucks} onSave={saveLoad} editLoad={editLoad} onCancel={() => { setEditLoad(null); setTab("log"); }} />}
      {tab === "expenses"   && <ExpensesTab     session={session} isOwner={isOwner} />}
      {tab === "drivers"    && isOwner && <DriversTab session={session} loads={loads} rates={rates} />}
      {tab === "fuel_finder"&& <FuelFinderTab />}
      {tab === "profit"     && <ProfitTab       isOwner={isOwner} />}
      {tab === "maintenance"&& <MaintenanceTab  session={session} isOwner={isOwner} trucks={trucks} />}
      {tab === "report"     && <ReportTab       loads={visibleLoads} session={session} rates={rates} isOwner={isOwner} allDrivers={allDrivers} />}
      {tab === "messages"   && <MessagesTab     session={session} loads={visibleLoads} isOwner={isOwner} onAddNote={addNote} />}

      {/* ── New Premium tabs ── */}
      {tab === "ifta"       && <IFTATab         session={session} loads={visibleLoads} />}
      {tab === "payroll"    && isOwner && <PayrollTab session={session} loads={loads} rates={rates} allDrivers={allDrivers} />}
      {tab === "analytics"  && <AnalyticsTab    session={session} loads={visibleLoads} isOwner={isOwner} rates={rates} />}
      {tab === "documents"  && <DocumentsTab    session={session} />}
      {tab === "loadboard"  && <LoadBoardTab    session={session} />}
      {tab === "tax"        && <TaxTab          session={session} isOwner={isOwner} />}
      {tab === "emergency"  && <EmergencyTab />}

      {/* ── Modals ── */}
      {detailLoad && <LoadDetailModal load={detailLoad} onClose={() => setDetailLoad(null)} rates={rates} isOwner={isOwner} trucks={trucks} session={session} onToggleComplete={toggleComplete} onGenerateInvoice={(l) => { setInvoiceLoad(l); setDetailLoad(null); }} onAddNote={addNote} />}
      {invoiceLoad && <InvoiceModal load={invoiceLoad} onClose={() => setInvoiceLoad(null)} rates={rates} trucks={trucks} session={session} />}
      {showSettings && isOwner && <SettingsModal session={session} rates={rates} setRates={setRates} customRoutes={customRoutes} setCustomRoutes={setCustomRoutes} trucks={trucks} setTrucks={setTrucks} onClose={() => setShowSettings(false)} />}

      {/* Footer */}
      <div style={{ background: C.navy, padding: "20px 24px", textAlign: "center", marginTop: 48 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <SLTLogo size={28} />
          <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff", fontSize: 14 }}>Smart Load Tracking</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 8 }}>
          {["IFTA","Payroll","Analytics","Documents","Load Board","Tax Export","Emergency"].map(f => (
            <span key={f} style={{ color: C.teal, fontSize: 10, fontWeight: 700 }}>✓ {f}</span>
          ))}
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: 0, fontFamily: "'Mulish',sans-serif" }}>Fleet Intelligence Platform · v3.0 · © 2025</p>
      </div>
    </div>
  );
}
