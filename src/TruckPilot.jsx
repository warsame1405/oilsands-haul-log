/* eslint-disable */
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://ilfooyjtbtpsmzaezroj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eejIrxmMGgnBdKie9W0ZQA_7oW1Ewtv";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Supabase Data Layer ───────────────────────────────────────────────────────
// Loads
const sbGetLoads = async (uid, ownerUid) => {
  const { data } = await sb.from("loads").select("*").or(`user_id.eq.${uid},owner_uid.eq.${uid},owner_uid.eq.${ownerUid}`).order("created_at", { ascending: false });
  return (data || []).map(r => ({ id: r.id, user_id: r.user_id, owner_uid: r.owner_uid, created_at: r.created_at, ...r.data, completed: r.completed }));
};

const sbGetFleetLoads = async (ownerUid) => {
  // Get ALL drivers — active AND inactive (left the fleet)
  const { data: allFleetDrivers } = await sb.from("driver_fleets")
    .select("driver_uid, joined_at, left_at, status")
    .eq("owner_uid", ownerUid);
  if (!allFleetDrivers || allFleetDrivers.length === 0) return [];
  // Fetch loads for all fleet drivers (current and past)
  const driverUids = allFleetDrivers.map(d => d.driver_uid);
  const orFilter = driverUids.map(uid => `user_id.eq.${uid}`).join(",");
  const { data } = await sb.from("loads").select("*").or(orFilter).order("created_at", { ascending: false });
  if (!data) return [];
  // Only return loads logged WHILE driver was in this fleet
  return data
    .map(r => ({ id: r.id, user_id: r.user_id, owner_uid: r.owner_uid, created_at: r.created_at, ...r.data, completed: r.completed }))
    .filter(load => {
      const driver = allFleetDrivers.find(d => d.driver_uid === load.user_id);
      if (!driver) return false;
      const loadTimestamp = load.created_at
        ? new Date(load.created_at).getTime()
        : new Date(load.date + "T00:00:00").getTime();
      const joinTimestamp = new Date(driver.joined_at).getTime();
      // Load must be after driver joined
      if (loadTimestamp < joinTimestamp) return false;
      // If driver left, load must be before they left
      if (driver.left_at) {
        const leftTimestamp = new Date(driver.left_at).getTime();
        return loadTimestamp <= leftTimestamp;
      }
      return true;
    });
};
const sbSaveLoad = async (load, uid, ownerUid) => {
  const { id, ...data } = load;
  await sb.from("loads").upsert({ id, user_id: uid, owner_uid: ownerUid, data, completed: !!load.completed }, { onConflict: "id" });
};
const sbDeleteLoad = async (id) => { await sb.from("loads").delete().eq("id", id); };

// Expenses
const sbGetExpenses = async (uid) => {
  const { data } = await sb.from("expenses").select("*").eq("user_id", uid).order("created_at", { ascending: false });
  return (data || []).map(r => ({ id: r.id, ...r.data }));
};
const sbSaveExpense = async (exp, uid) => {
  const { id, ...data } = exp;
  await sb.from("expenses").upsert({ id, user_id: uid, data }, { onConflict: "id" });
};
const sbDeleteExpense = async (id) => { await sb.from("expenses").delete().eq("id", id); };
const sbGetAllExpenses = async (uid) => sbGetExpenses(uid);

// Trucks
const sbGetTrucks = async (ownerUid) => {
  const { data } = await sb.from("trucks").select("*").eq("user_id", ownerUid);
  return (data || []).map(r => ({ id: r.id, ...r.data }));
};
const sbSaveTrucks = async (trucks, ownerUid) => {
  if (!trucks || !trucks.length) return;
  await sb.from("trucks").delete().eq("user_id", ownerUid);
  if (trucks.length > 0) {
    await sb.from("trucks").insert(trucks.map(t => { const { id, ...data } = t; return { id, user_id: ownerUid, data }; }));
  }
};

// Settings (rates + routes)
const sbGetSettings = async (ownerUid) => {
  const { data } = await sb.from("settings").select("*").eq("user_id", ownerUid).maybeSingle();
  return data || null;
};
const sbSaveSettings = async (ownerUid, rates, routes) => {
  await sb.from("settings").upsert({ user_id: ownerUid, rates, routes }, { onConflict: "user_id" });
};

// Profiles
const sbGetProfile = async (uid) => {
  const { data } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  return data || null;
};
const sbSaveProfile = async (profile) => {
  await sb.from("profiles").upsert(profile, { onConflict: "id" });
};
const sbGetProfileByInviteCode = async (code) => {
  const { data } = await sb.from("profiles").select("id, name").eq("invite_code", code).maybeSingle();
  return data || null;
};

// ─── Recurring Routes ─────────────────────────────────────────────────────────
const sbGetRecurringRoutes = async (ownerUid) => {
  const { data } = await sb.from("recurring_routes").select("*").eq("owner_uid", ownerUid).order("created_at", { ascending: false });
  return data || [];
};
const sbSaveRecurringRoute = async (route) => {
  const { id, ...rest } = route;
  if (id) await sb.from("recurring_routes").update(rest).eq("id", id);
  else await sb.from("recurring_routes").insert(rest);
};
const sbDeleteRecurringRoute = async (id) => { await sb.from("recurring_routes").delete().eq("id", id); };

// ─── Driver Ratings ───────────────────────────────────────────────────────────
const sbGetDriverRatings = async (ownerUid) => {
  const { data } = await sb.from("driver_ratings").select("*").eq("owner_uid", ownerUid).order("created_at", { ascending: false });
  return data || [];
};
const sbSaveDriverRating = async (rating) => {
  await sb.from("driver_ratings").upsert(rating, { onConflict: "load_id,driver_uid" });
};

// ─── Fuel Log ─────────────────────────────────────────────────────────────────
const sbGetFuelLog = async (uid) => {
  const { data } = await sb.from("fuel_log").select("*").eq("user_id", uid).order("date", { ascending: false });
  return data || [];
};
const sbSaveFuelEntry = async (entry) => {
  const { id, ...rest } = entry;
  if (id) await sb.from("fuel_log").update(rest).eq("id", id);
  else await sb.from("fuel_log").insert(rest);
};
const sbDeleteFuelEntry = async (id) => { await sb.from("fuel_log").delete().eq("id", id); };

// ─── Driver Documents / Expiry Alerts ────────────────────────────────────────
const sbGetDriverDocuments = async (uid) => {
  const { data } = await sb.from("driver_documents").select("*").eq("user_id", uid).order("expiry_date", { ascending: true });
  return data || [];
};
const sbGetFleetDocuments = async (ownerUid) => {
  const { data } = await sb.from("driver_documents").select("*").eq("owner_uid", ownerUid).order("expiry_date", { ascending: true });
  return data || [];
};
const sbSaveDriverDocument = async (doc) => {
  const { id, ...rest } = doc;
  if (id) await sb.from("driver_documents").update(rest).eq("id", id);
  else await sb.from("driver_documents").insert(rest);
};
const sbDeleteDriverDocument = async (id) => { await sb.from("driver_documents").delete().eq("id", id); };
// ONE row per user. "message" = JSON array of msgs. "reply" = "__closed__" = closed.

const chatParse = (row) => {
  if (!row) return null;
  let msgs = [];
  try {
    const raw = row.message;
    if (Array.isArray(raw)) msgs = raw;
    else if (typeof raw === "string" && raw.trim().startsWith("[")) msgs = JSON.parse(raw);
    else if (raw) msgs = [{ id:"1", from:"user", text: String(raw), time: row.created_at }];
  } catch(e) { msgs = []; }
  return { ...row, msgs, closed: row.reply === "__closed__" };
};

const chatGetThread = async (uid) => {
  // Use select all + pick best row — handles duplicate rows gracefully
  const { data, error } = await sb.from("support_messages")
    .select("*").eq("from_uid", uid).order("created_at", { ascending: false });
  if (error) { console.error("chatGetThread:", error); return null; }
  if (!data || data.length === 0) return null;
  // Parse all rows and pick the one with the most messages
  const parsed = data.map(chatParse).filter(Boolean);
  parsed.sort((a, b) => (b.msgs?.length || 0) - (a.msgs?.length || 0));
  return parsed[0];
};

const chatGetAll = async () => {
  const { data, error } = await sb.from("support_messages").select("*").order("created_at", { ascending: false });
  if (error) { console.error("chatGetAll:", error); return []; }
  return (data || []).map(chatParse);
};

const chatSendMsg = async (uid, fromName, fromEmail, newMsg) => {
  // Fetch existing thread first to get current messages
  const existing = await chatGetThread(uid);
  const msgs = existing ? [...existing.msgs, newMsg] : [newMsg];
  // upsert — inserts if no row exists, updates if it does. Prevents duplicate rows.
  const { error } = await sb.from("support_messages").upsert({
    from_uid: uid, from_name: fromName, from_email: fromEmail,
    message: JSON.stringify(msgs), read: false,
    reply: existing?.reply === "__closed__" ? null : (existing?.reply || null),
  }, { onConflict: "from_uid" });
  return error;
};

const chatAdminSend = async (uid, currentMsgs, newMsg) => {
  // Re-fetch to get latest messages before appending (catches any new customer msgs)
  const fresh = await chatGetThread(uid);
  const base = fresh ? fresh.msgs : currentMsgs;
  const msgs = [...base, newMsg];
  const { error } = await sb.from("support_messages")
    .update({ message: JSON.stringify(msgs), read: true }).eq("from_uid", uid);
  return error;
};

const chatSetClosed = async (uid, closed) => {
  const { error } = await sb.from("support_messages")
    .update({ reply: closed ? "__closed__" : null }).eq("from_uid", uid);
  return error;
};

const chatMarkRead = async (uid) => {
  await sb.from("support_messages").update({ read: true }).eq("from_uid", uid);
};

const sbSendSupportMessage = async () => {};
const sbGetSupportMessages = async () => [];
const sbReplyToSupport = async () => {};
const sbMarkSupportRead = async () => {};


// Drivers (get all drivers under an owner)
const sbGetDrivers = async (ownerUid) => {
  const { data } = await sb.from("profiles").select("*").eq("owner_uid", ownerUid).eq("role", "driver");
  return (data || []).map(d => ({ uid: d.id, fullName: d.name, name: d.name, role: "driver", ownerUid: d.owner_uid, plan: d.plan || "free" }));
};

// Maintenance
// Fleet system — instant join, multiple owners supported
// Uses driver_fleets table: { driver_uid, owner_uid, owner_name, joined_at }

const sbJoinFleet = async (driverUid, driverName, ownerInviteCode) => {
  const owner = await sbGetProfileByInviteCode(ownerInviteCode);
  if (!owner) return { error: "Invalid invite code. Check with your fleet owner." };
  // Check if already in this fleet
  const { data: existing } = await sb.from("driver_fleets")
    .select("id").eq("driver_uid", driverUid).eq("owner_uid", owner.id).maybeSingle();
  if (existing) return { error: "You are already in this fleet." };
  // Join instantly
  const { error } = await sb.from("driver_fleets").insert([{
    driver_uid: driverUid,
    driver_name: driverName,
    owner_uid: owner.id,
    owner_name: owner.name,
  }]);
  if (error) return { error: error.message };
  // Update loads to link to this owner
  await sb.from("loads").update({ owner_uid: owner.id }).eq("user_id", driverUid);
  return { error: null, ownerName: owner.name };
};

const sbGetMyFleets = async (driverUid) => {
  const { data } = await sb.from("driver_fleets")
    .select("owner_uid, owner_name, joined_at, driver_rating")
    .eq("driver_uid", driverUid);
  return (data || []).map(r => ({ ...r, driverRating: r.driver_rating || 0 }));
};

const sbGetFleetDrivers = async (ownerUid) => {
  const { data } = await sb.from("driver_fleets")
    .select("driver_uid, driver_name, joined_at")
    .eq("owner_uid", ownerUid);
  const uids = (data||[]).map(r=>r.driver_uid);
  let ratings = {};
  if(uids.length>0){
    const {data:profiles} = await sb.from("profiles").select("id,owner_rating").in("id",uids);
    (profiles||[]).forEach(p=>{ratings[p.id]=p.owner_rating;});
  }
  return (data || []).map(r => ({ uid: r.driver_uid, name: r.driver_name, fullName: r.driver_name, joined: r.joined_at, ownerRating: ratings[r.driver_uid]||0 }));
};

const sbLeaveFleet = async (driverUid, ownerUid) => {
  await sb.from("driver_fleets")
    .delete().eq("driver_uid", driverUid).eq("owner_uid", ownerUid);
};

const sbRemoveDriverFromFleet = async (driverUid, ownerUid) => {
  // Archive the driver instead of deleting — move to inactive
  await sb.from("driver_fleets")
    .update({ status: "inactive", left_at: new Date().toISOString() })
    .eq("driver_uid", driverUid).eq("owner_uid", ownerUid);
};

const sbGetInactiveDrivers = async (ownerUid) => {
  try {
    const { data, error } = await sb.from("driver_fleets")
      .select("driver_uid, driver_name, joined_at, left_at, driver_rating, status")
      .eq("owner_uid", ownerUid)
      .eq("status", "inactive");
    if (error) return [];
    // Also fetch profile names for drivers
    const uids = (data||[]).map(r => r.driver_uid).filter(Boolean);
    let profileNames = {};
    if (uids.length > 0) {
      const { data: profiles } = await sb.from("profiles").select("id, name").in("id", uids);
      (profiles||[]).forEach(p => { profileNames[p.id] = p.name; });
    }
    return (data || []).map(r => ({
      uid: r.driver_uid,
      name: r.driver_name || profileNames[r.driver_uid] || "Unknown Driver",
      fullName: r.driver_name || profileNames[r.driver_uid] || "Unknown Driver",
      joined: r.joined_at,
      left: r.left_at,
      ownerRating: r.driver_rating || 0,
    }));
  } catch(e) { return []; }
};

// Legacy stubs
const sbSendFleetRequest = async () => ({ error: null });
const sbGetFleetRequests = async () => [];
const sbApproveFleetRequest = async () => {};
const sbRejectFleetRequest = async () => {};

const sbGetMaintenance = async (ownerUid) => {
  const { data } = await sb.from("maintenance").select("*").eq("user_id", ownerUid).order("created_at", { ascending: false });
  return (data || []).map(r => ({ id: r.id, ...r.data }));
};
const sbSaveMaintenance = async (record, ownerUid) => {
  const { id, ...data } = record;
  await sb.from("maintenance").upsert({ id, user_id: ownerUid, data }, { onConflict: "id" });
};
const sbDeleteMaintenance = async (id) => { await sb.from("maintenance").delete().eq("id", id); };

// ─── Storage Keys (kept for non-synced local state only) ──────────────────────
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

// ─── PWA Update Banner ────────────────────────────────────────────────────────
function useServiceWorkerUpdate() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        });
      });
    }
  }, []);
  const applyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  };
  return { showUpdate, applyUpdate };
}

// ─── Universal PDF/Print Helper ───────────────────────────────────────────────
const downloadPDF = (htmlContent, filename, session=null) => {
  const companyName = session?.companyName || null;
  const userName = session?.fullName || session?.name || null;
  const docHeader = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:#1a2744;margin-bottom:0;border-radius:8px 8px 0 0;">
      <div style="display:flex;align-items:baseline;gap:0;">
        <span style="font-family:Arial,sans-serif;font-weight:900;font-size:24px;color:#fff;letter-spacing:5px;text-decoration:underline;text-decoration-color:#FFD700;text-underline-offset:4px;">TRUCK</span>
        <span style="font-family:Arial,sans-serif;font-weight:900;font-size:24px;color:#FFD700;letter-spacing:5px;">PILOT</span>
        <span style="font-size:15px;margin-left:5px;">✈️</span>
      </div>
      <div style="text-align:right;">
        ${companyName ? `<div style="font-size:15px;font-weight:900;color:#fff;">${companyName}</div>` : ""}
        ${userName ? `<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">${userName}</div>` : ""}
      </div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#FFD700,#243B6E);margin-bottom:20px;"></div>
  `;
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>
  @page { margin: 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1A1A1A; margin: 0; padding: 0; font-size: 13px; line-height: 1.5; }
  h1 { color: #243B6E; font-size: 22px; margin-bottom: 4px; }
  h2 { color: #243B6E; font-size: 16px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #FFF3EB; padding: 9px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #243B6E; }
  td { padding: 9px 12px; border-bottom: 1px solid #E8EEF4; font-size: 13px; }
  .total td { font-weight: 800; background: #F7F9FC; font-size: 14px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 3px solid #243B6E; padding-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 900; color: #243B6E; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  .badge-green { background: #E8F5E9; color: #2E7D32; }
  .badge-orange { background: #FFF3E0; color: #243B6E; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .summary-card { background: #F7F9FC; border-radius: 8px; padding: 14px; text-align: center; border-top: 3px solid #243B6E; }
  .summary-card .label { font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-card .value { font-size: 20px; font-weight: 800; color: #1A1A1A; }
  .footer { text-align: center; color: #aaa; font-size: 11px; margin-top: 32px; border-top: 1px solid #E1E8F0; padding-top: 14px; }
  .green { color: #2E7D32; } .red { color: #C62828; } .blue { color: #243B6E; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${docHeader}${htmlContent}
<div class="footer">Generated by TruckPilot ✈️ · ${new Date().toLocaleDateString()} · Confidential</div>
</body></html>`;
  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename + ".html"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const previewPDF = (htmlContent, filename, setPreviewHtml, setPreviewTitle, setShowPreview) => {
  setPreviewHtml(htmlContent);
  setPreviewTitle(filename);
  setShowPreview(true);
};

const DEFAULT_RATES = { companyWaitRate: 85, driverWaitRate: 40, billingMethod: "per_load", perLoadRate: 0, payFrequency: "weekly", payDay: "friday", cutoffDay: "thursday", cutoffTime: "23:59" };

// ── Pay Period Calculator ─────────────────────────────────────────
const getPayPeriod = (rates = {}) => {
  const now = new Date();

  // If manual period dates are set in settings, use those as source of truth
  if (rates.periodStart && rates.periodEnd && rates.payDate) {
    const periodStart = new Date(rates.periodStart + "T12:00:00");
    const periodEnd = new Date(rates.periodEnd + "T12:00:00");
    const nextPayDate = new Date(rates.payDate + "T12:00:00");
    const fmt = (d) => d.toLocaleDateString("en-CA", {month:"short", day:"numeric"});
    const daysUntilNext = Math.ceil((nextPayDate - now) / (1000*60*60*24));
    return {
      periodStart, periodEnd, nextPayDate,
      label: `${fmt(periodStart)} – ${fmt(periodEnd)}`,
      nextPayLabel: fmt(nextPayDate),
      daysUntilNext: Math.max(0, daysUntilNext),
      cutoffLabel: `${fmt(periodEnd)} @ 23:59`,
      freqLabel: "Custom",
      periodStart: rates.periodStart,
      periodEnd: rates.periodEnd,
    };
  }

  const freq = rates.payFrequency || "weekly";
  const payDay = rates.payDay || "friday";
  const cutoffDay = rates.cutoffDay || "thursday";
  const cutoffTime = rates.cutoffTime || "23:59";
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const payDayNum = days.indexOf(payDay);
  const cutDayNum = days.indexOf(cutoffDay);
  const todayNum = now.getDay();

  let periodStart, periodEnd, nextPayDate;

  if (freq === "weekly") {
    let daysBack = (todayNum - cutDayNum + 7) % 7;
    if (daysBack === 0) daysBack = 7;
    periodEnd = new Date(now); periodEnd.setDate(now.getDate() - daysBack + 7);
    periodStart = new Date(periodEnd); periodStart.setDate(periodEnd.getDate() - 6);
    let daysUntilPay = (payDayNum - todayNum + 7) % 7 || 7;
    nextPayDate = new Date(now); nextPayDate.setDate(now.getDate() + daysUntilPay);
  } else if (freq === "biweekly") {
    let daysBack = (todayNum - cutDayNum + 7) % 7;
    if (daysBack === 0) daysBack = 14;
    periodEnd = new Date(now); periodEnd.setDate(now.getDate() - daysBack + 14);
    periodStart = new Date(periodEnd); periodStart.setDate(periodEnd.getDate() - 13);
    let daysUntilPay = (payDayNum - todayNum + 7) % 7 || 7;
    nextPayDate = new Date(now); nextPayDate.setDate(now.getDate() + daysUntilPay);
  } else if (freq === "semimonthly") {
    const d = now.getDate();
    if (d <= 15) {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 15);
      nextPayDate = new Date(now.getFullYear(), now.getMonth(), 15);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 16);
      periodEnd = new Date(now.getFullYear(), now.getMonth()+1, 0);
      nextPayDate = new Date(now.getFullYear(), now.getMonth()+1, 1);
    }
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth()+1, 0);
    nextPayDate = new Date(now.getFullYear(), now.getMonth()+1, 1);
  }

  const fmt = (d) => d.toLocaleDateString("en-CA", {month:"short", day:"numeric"});
  const daysUntilNext = Math.ceil((nextPayDate - now) / (1000*60*60*24));

  return {
    periodStart, periodEnd, nextPayDate,
    label: `${fmt(periodStart)} – ${fmt(periodEnd)}`,
    nextPayLabel: fmt(nextPayDate),
    daysUntilNext: Math.max(0, daysUntilNext),
    cutoffLabel: `${cutoffDay.charAt(0).toUpperCase()+cutoffDay.slice(1)} @ ${cutoffTime}`,
    freqLabel: { weekly:"Weekly", biweekly:"Bi-Weekly", semimonthly:"Semi-Monthly", monthly:"Monthly" }[freq] || freq,
  };
};

// ─── Subscription Plans ───────────────────────────────────────────────────────
const PLANS = {
  free: {
    id: "free", label: "⭐ Beta", price: 0, color: "#92400e", emoji: "⭐",
    desc: "Perfect for individual drivers",
    features: ["Log loads", "Expenses", "Fuel & Food finder", "Messages", "Documents", "Emergency"],
    limits: { loads: 50, drivers: 0 },
  },
  basic: {
    id: "basic", label: "💼 Hauler", price: 9.99, color: "#1e3a5f", emoji: "💼",
    desc: "For small fleet owners",
    features: ["Everything in Free", "Up to 3 drivers", "Reports & Analytics", "Maintenance tracker", "Pay Calculator", "Payroll"],
    limits: { loads: 500, drivers: 3 },
  },
  pro: {
    id: "pro", label: "🚀 Pro", price: 24.99, color: "#166534", emoji: "🚀",
    desc: "Full fleet management power",
    features: ["Everything in Basic", "Unlimited drivers", "IFTA Tax", "Tax Export", "Load Board", "Priority support", "Referral commissions"],
    limits: { loads: Infinity, drivers: Infinity },
  },
};

// ─── Referral System ──────────────────────────────────────────────────────────
const REFERRAL_KEY = "tp-referrals-v1";
const INSPECTION_ALERTS_KEY = (ownerUid) => `tp-inspection-alerts-v1-${ownerUid}`;
const getInspectionAlerts = (ownerUid) => { try { return JSON.parse(localStorage.getItem(INSPECTION_ALERTS_KEY(ownerUid)) || "[]"); } catch { return []; } };
const saveInspectionAlerts = (ownerUid, alerts) => localStorage.setItem(INSPECTION_ALERTS_KEY(ownerUid), JSON.stringify(alerts));
const getReferrals = () => { try { return JSON.parse(localStorage.getItem(REFERRAL_KEY) || "{}"); } catch { return {}; } };
const saveReferrals = (r) => localStorage.setItem(REFERRAL_KEY, JSON.stringify(r));
const genReferralCode = (uid) => "TIQ-" + uid.slice(0,4).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
const REFERRAL_COMMISSION_PCT = 20;
const REFERRAL_MONTHS = 3;

const getUserPlan = (uid) => { try { const s = JSON.parse(localStorage.getItem("tp-session-v1") || "null"); if (s && s.plan) return s.plan; } catch {} return "free"; };
const canAccessFeature = (plan, feature) => {
  return true; // Beta mode — all features free for everyone
};
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const getPlanColor = (plan) => {
  if (plan === "pro") return { bg:"#166534", text:"#fff", label:"🚀 Pro" };
  if (plan === "basic") return { bg:"#1e3a5f", text:"#fff", label:"💼 Hauler" };
  return { bg:"#92400e", text:"#fff", label:"⭐ Beta" };
};
const fmtC = (v) => `$${Number(v || 0).toLocaleString('en-CA', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
const fmt = (m) => { const h = Math.floor(m / 60), mn = m % 60; return `${h}h ${mn}m`; };
const secsToHMS = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`; };

// ─── Contact Us Tab ───────────────────────────────────────────────────────────
const COMPANY_PHONE = "437-700-5835";
const WHATSAPP_NUMBER = "14377005835";
const COMPANY_EMAIL = "support@truckpilot.ca";

function SuperAdminTab({ session }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [allUsers, setAllUsers] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [allLoads, setAllLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [expandedUser, setExpandedUser] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Profile Editor State ──
  const [profileConfig, setProfileConfig] = useState(null);
  const [profileConfigLoading, setProfileConfigLoading] = useState(false);
  const [profileConfigSaved, setProfileConfigSaved] = useState(false);
  const [profileConfigSaving, setProfileConfigSaving] = useState(false);
  const [profileTargetUser, setProfileTargetUser] = useState("global");

  // ── Notifications State ──
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [newNotif, setNewNotif] = useState({
    title: "", message: "", type: "info", target: "all", target_uid: "", expires_at: "", visibility: "after"
  });
  const [notifSending, setNotifSending] = useState(false);
  const [notifSent, setNotifSent] = useState(false);

  const loadNotifications = async () => {
    setNotifLoading(true);
    try {
      const { data } = await sb.from("app_notifications").select("*").order("created_at", { ascending: false });
      setNotifications(data || []);
    } catch(e) {}
    setNotifLoading(false);
  };

  const sendNotification = async () => {
    if (!newNotif.message.trim()) return alert("Please enter a message.");
    if (newNotif.target === "specific" && !newNotif.target_uid) return alert("Please select a specific user.");
    setNotifSending(true);
    try {
      await sb.from("app_notifications").insert({
        title: newNotif.title.trim(),
        message: newNotif.message.trim(),
        type: newNotif.type,
        target: newNotif.target,
        target_uid: newNotif.target === "specific" ? newNotif.target_uid : null,
        active: true,
        visibility: newNotif.visibility || "after",
        expires_at: newNotif.expires_at || null,
      });
      setNotifSent(true);
      setTimeout(() => setNotifSent(false), 2500);
      setNewNotif({ title:"", message:"", type:"info", target:"all", target_uid:"", expires_at:"", visibility:"after" });
      await loadNotifications();
    } catch(e) { console.error(e); }
    setNotifSending(false);
  };

  const toggleNotifActive = async (id, current) => {
    await sb.from("app_notifications").update({ active: !current }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, active: !current } : n));
  };

  const deleteNotif = async (id) => {
    if (!window.confirm("Delete this notification?")) return;
    await sb.from("app_notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // ── Admin Profile Edit ──
  const [adminProfile, setAdminProfile] = useState({
    name: session?.fullName || session?.name || "",
    username: "",
    email: session?.email || "",
    newPassword: "",
    confirmPassword: "",
    avatarUrl: "",
  });
  const [adminProfileSaving, setAdminProfileSaving] = useState(false);
  const [adminProfileSaved, setAdminProfileSaved] = useState(false);
  const [adminProfileMsg, setAdminProfileMsg] = useState({ text:"", type:"" });
  const [adminAvatarUploading, setAdminAvatarUploading] = useState(false);

  const loadAdminProfile = async () => {
    try {
      const { data } = await sb.from("profiles").select("*").eq("id", session.uid).maybeSingle();
      if (data) {
        setAdminProfile(p => ({
          ...p,
          name: data.name || "",
          username: data.username || "",
          email: data.username_email || session?.email || "",
          avatarUrl: data.avatar_url || "",
        }));
      }
    } catch(e) {}
  };

  const saveAdminProfile = async () => {
    if (!adminProfile.name.trim()) return setAdminProfileMsg({ text:"Name is required.", type:"error" });
    if (adminProfile.newPassword && adminProfile.newPassword !== adminProfile.confirmPassword)
      return setAdminProfileMsg({ text:"Passwords don't match.", type:"error" });
    if (adminProfile.newPassword && adminProfile.newPassword.length < 6)
      return setAdminProfileMsg({ text:"Password must be at least 6 characters.", type:"error" });
    setAdminProfileSaving(true);
    setAdminProfileMsg({ text:"", type:"" });
    try {
      // Update profile table
      await sb.from("profiles").update({
        name: adminProfile.name.trim(),
        username: adminProfile.username.trim().toLowerCase() || null,
        username_email: adminProfile.email.trim().toLowerCase() || null,
        avatar_url: adminProfile.avatarUrl || null,
      }).eq("id", session.uid);
      // Update email in auth if changed
      if (adminProfile.email && adminProfile.email !== session.email) {
        await sb.auth.updateUser({ email: adminProfile.email.trim() });
      }
      // Update password if provided
      if (adminProfile.newPassword) {
        const { error } = await sb.auth.updateUser({ password: adminProfile.newPassword });
        if (error) { setAdminProfileMsg({ text:"Password update failed: " + error.message, type:"error" }); setAdminProfileSaving(false); return; }
      }
      setAdminProfileSaved(true);
      setAdminProfileMsg({ text:"✅ Profile updated successfully!", type:"success" });
      setTimeout(() => { setAdminProfileSaved(false); setAdminProfileMsg({ text:"", type:"" }); }, 3000);
      setAdminProfile(p => ({ ...p, newPassword:"", confirmPassword:"" }));
    } catch(e) { setAdminProfileMsg({ text:"Something went wrong.", type:"error" }); }
    setAdminProfileSaving(false);
  };

  const uploadAdminAvatar = async (file) => {
    if (!file) return;
    setAdminAvatarUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result;
        // Store as base64 in profile (simple approach, no storage bucket needed)
        await sb.from("profiles").update({ avatar_url: base64 }).eq("id", session.uid);
        setAdminProfile(p => ({ ...p, avatarUrl: base64 }));
        setAdminAvatarUploading(false);
      };
      reader.readAsDataURL(file);
    } catch(e) { setAdminAvatarUploading(false); }
  };

  // ── Create New Admin Account ──
  const [newAdmin, setNewAdmin] = useState({ name:"", email:"", username:"", password:"", sendLink:false });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createAdminMsg, setCreateAdminMsg] = useState({ text:"", type:"" });

  const createAdminAccount = async () => {
    if (!newAdmin.name.trim()) return setCreateAdminMsg({ text:"Name is required.", type:"error" });
    if (!newAdmin.email.trim()) return setCreateAdminMsg({ text:"Email is required.", type:"error" });
    if (!newAdmin.sendLink && !newAdmin.password) return setCreateAdminMsg({ text:"Password is required, or choose to send a reset link.", type:"error" });
    if (!newAdmin.sendLink && newAdmin.password.length < 6) return setCreateAdminMsg({ text:"Password must be at least 6 characters.", type:"error" });
    setCreatingAdmin(true);
    setCreateAdminMsg({ text:"", type:"" });
    try {
      // Create user in Supabase Auth
      const { data, error } = await sb.auth.signUp({
        email: newAdmin.email.trim(),
        password: newAdmin.sendLink ? Math.random().toString(36).slice(-12) + "Aa1!" : newAdmin.password,
        options: { data: { name: newAdmin.name.trim(), role: "superadmin", ownerUid: "PENDING", plan: "pro" } }
      });
      if (error) { setCreateAdminMsg({ text:"Error: " + error.message, type:"error" }); setCreatingAdmin(false); return; }
      const uid = data.user?.id;
      if (uid) {
        await sb.from("profiles").upsert({
          id: uid, name: newAdmin.name.trim(), role: "superadmin",
          owner_uid: uid, plan: "pro",
          username: newAdmin.username.trim() || null,
          username_email: newAdmin.email.trim().toLowerCase(),
        }, { onConflict:"id" });
        // Send password reset link if chosen
        if (newAdmin.sendLink) {
          await sb.auth.resetPasswordForEmail(newAdmin.email.trim(), { redirectTo: "https://app.truckpilot.ca" });
          setCreateAdminMsg({ text:`✅ Admin account created! Password setup link sent to ${newAdmin.email}.`, type:"success" });
        } else {
          setCreateAdminMsg({ text:`✅ Admin account created for ${newAdmin.name}!`, type:"success" });
        }
        setNewAdmin({ name:"", email:"", username:"", password:"", sendLink:false });
        await loadData();
      }
    } catch(e) { setCreateAdminMsg({ text:"Something went wrong.", type:"error" }); }
    setCreatingAdmin(false);
  };
  const [adminNotes, setAdminNotes] = useState({});
  const [newNote, setNewNote] = useState({});
  const [savingNote, setSavingNote] = useState({});

  const loadAdminNotes = async (uid) => {
    try {
      const { data } = await sb.from("admin_notes").select("*").eq("user_id", uid).order("created_at", { ascending: false });
      setAdminNotes(prev => ({ ...prev, [uid]: data || [] }));
    } catch(e) {}
  };

  const saveAdminNote = async (uid) => {
    const text = (newNote[uid] || "").trim();
    if (!text) return;
    setSavingNote(prev => ({ ...prev, [uid]: true }));
    try {
      await sb.from("admin_notes").insert({ user_id: uid, note: text, created_by: session?.uid || "admin" });
      setNewNote(prev => ({ ...prev, [uid]: "" }));
      await loadAdminNotes(uid);
    } catch(e) {}
    setSavingNote(prev => ({ ...prev, [uid]: false }));
  };

  const deleteAdminNote = async (noteId, uid) => {
    await sb.from("admin_notes").delete().eq("id", noteId);
    setAdminNotes(prev => ({ ...prev, [uid]: (prev[uid] || []).filter(n => n.id !== noteId) }));
  };

  // ── Feature Overrides per user ──
  const FEATURE_LIST = [
    { id:"payroll",           label:"💵 Payroll"            },
    { id:"analytics",         label:"📈 Analytics"          },
    { id:"tax",               label:"🗂 Tax Export"         },
    { id:"financial_reports", label:"📋 Financial Reports"  },
    { id:"maintenance",       label:"🔧 Maintenance"        },
    { id:"inspection",        label:"🔍 Inspection"         },
    { id:"fuel_finder",       label:"⛽ Fuel Finder"        },
    { id:"documents",         label:"📁 Documents"          },
    { id:"loadboard",         label:"📋 Load Board"         },
    { id:"drivers",           label:"👥 Drivers"            },
  ];

  const toggleFeatureOverride = async (uid, featureId, currentOverrides) => {
    const updated = { ...currentOverrides };
    if (updated[featureId] === true) delete updated[featureId];
    else updated[featureId] = true;
    await sb.from("profiles").update({ feature_overrides: updated }).eq("id", uid);
    setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, feature_overrides: updated } : u));
  };

  // ── Export CSV ──
  const exportUsersCSV = () => {
    const headers = ["Name","Email","Role","Plan","Loads","Joined","Last Seen","Invite Code"];
    const rows = allUsers.map(u => [
      u.name || "Unknown",
      u.username_email || u.email || "—",
      u.role || "—",
      u.plan || "free",
      allLoads.filter(l => l.user_id === u.id).length,
      u.created_at?.slice(0,10) || "—",
      u.last_seen ? new Date(u.last_seen).toLocaleDateString() : "Never",
      u.invite_code || "—",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `truckpilot-users-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Message Search ──
  const [msgSearch, setMsgSearch] = useState("");

  const DEFAULT_PROFILE_ITEMS = {
    settingsMore: [
      { id:"ai",       icon:"🤖", label:"TruckPilot AI",    subtitle:"Ask anything, get tax help",        visible:true },
      { id:"darkmode", icon:"🌙", label:"Dark Mode",         subtitle:"Switch display theme",              visible:true },
      { id:"support",  icon:"🆘", label:"Support / Help",   subtitle:"Contact us anytime",                visible:true },
      { id:"settings", icon:"⚙️", label:"App Settings",    subtitle:"Rates, routes, trucks",             visible:true, ownerOnly:true },
      { id:"privacy",  icon:"🔒", label:"Privacy & Security",subtitle:"Password, data, notifications",    visible:true },
    ],
    ownerGroups: [
      { group:"Fleet",  visible:true, items:[
        { id:"drivers", icon:"👥", label:"Drivers",        visible:true },
        { id:"log",     icon:"🚛", label:"My Loads",       visible:true },
        { id:"new",     icon:"➕", label:"Add Load",      visible:true },
      ]},
      { group:"Money", visible:true, items:[
        { id:"expenses",          icon:"🧾", label:"Expenses",           visible:true },
        { id:"payroll",           icon:"💵", label:"Payroll",            visible:true },
        { id:"report",            icon:"📊", label:"Reports",            visible:true },
        { id:"analytics",         icon:"📈", label:"Analytics",          visible:true },
        { id:"tax",               icon:"🗂", label:"Tax Export",         visible:true },
        { id:"financial_reports", icon:"📋", label:"Financial Reports",  visible:true },
        { id:"documents",         icon:"📁", label:"Documents",          visible:true },
      ]},
      { group:"Operations", visible:true, items:[
        { id:"maintenance", icon:"🔧", label:"Maintenance",  visible:true },
        { id:"inspection",  icon:"🔍", label:"Inspection",   visible:true },
        { id:"fuel_finder", icon:"⛽", label:"Fuel Finder",  visible:true },
        { id:"emergency",   icon:"🚨", label:"Emergency",    visible:true },
      ]},
      { group:"Community", visible:true, items:[
        { id:"jobboard",  icon:"📋", label:"Job Board",       visible:true },
        { id:"community", icon:"💬", label:"Community Chat",  visible:true },
      ]},
    ],
    driverGroups: [
      { group:"My Work", visible:true, items:[
        { id:"log",    icon:"📋", label:"My Loads",  visible:true },
        { id:"new",    icon:"➕", label:"Add Load",  visible:true },
        { id:"report", icon:"📊", label:"Reports",   visible:true },
      ]},
      { group:"Money", visible:true, items:[
        { id:"expenses",          icon:"🧾", label:"Expenses",          visible:true },
        { id:"analytics",         icon:"📈", label:"Analytics",         visible:true },
        { id:"tax",               icon:"🗂", label:"Tax Export",        visible:true },
        { id:"financial_reports", icon:"📋", label:"Financial Reports", visible:true },
        { id:"documents",         icon:"📁", label:"Documents",         visible:true },
      ]},
      { group:"Operations", visible:true, items:[
        { id:"maintenance", icon:"🔧", label:"Maintenance", visible:true },
        { id:"inspection",  icon:"🔍", label:"Inspection",  visible:true },
        { id:"fuel_finder", icon:"⛽", label:"Fuel Finder", visible:true },
        { id:"emergency",   icon:"🚨", label:"Emergency",   visible:true },
      ]},
      { group:"Community", visible:true, items:[
        { id:"jobboard",  icon:"📋", label:"Job Board",      visible:true },
        { id:"community", icon:"💬", label:"Community Chat", visible:true },
      ]},
    ],
    theme: {
      primaryColor:   "#243B6E",
      accentColor:    "#FFD700",
      bgColor:        "#F4F1EC",
      cardBg:         "#FFFFFF",
      textColor:      "#1A1A1A",
      fontFamily:     "Barlow",
      borderRadius:   "18",
    },
  };

  const loadProfileConfig = async () => {
    setProfileConfigLoading(true);
    try {
      const { data } = await sb.from("app_config").select("*").eq("id", profileTargetUser === "global" ? "global" : profileTargetUser).maybeSingle();
      if (data?.profile_items) {
        setProfileConfig(data.profile_items);
      } else {
        setProfileConfig(JSON.parse(JSON.stringify(DEFAULT_PROFILE_ITEMS)));
      }
    } catch(e) {
      setProfileConfig(JSON.parse(JSON.stringify(DEFAULT_PROFILE_ITEMS)));
    }
    setProfileConfigLoading(false);
  };

  const saveProfileConfig = async () => {
    if (!profileConfig) return;
    setProfileConfigSaving(true);
    try {
      const id = profileTargetUser === "global" ? "global" : profileTargetUser;
      await sb.from("app_config").upsert({ id, profile_items: profileConfig, updated_at: new Date().toISOString() }, { onConflict: "id" });
      setProfileConfigSaved(true);
      setTimeout(() => setProfileConfigSaved(false), 2500);
    } catch(e) { console.error(e); }
    setProfileConfigSaving(false);
  };

  const resetProfileConfig = () => {
    if (!window.confirm("Reset to default profile layout? This will discard all changes.")) return;
    setProfileConfig(JSON.parse(JSON.stringify(DEFAULT_PROFILE_ITEMS)));
  };

  const toggleSettingsItem = (id) => {
    setProfileConfig(prev => ({
      ...prev,
      settingsMore: prev.settingsMore.map(item => item.id === id ? { ...item, visible: !item.visible } : item)
    }));
  };

  const toggleGroupVisible = (groupIdx, isOwner) => {
    const key = isOwner ? "ownerGroups" : "driverGroups";
    setProfileConfig(prev => {
      const groups = [...prev[key]];
      groups[groupIdx] = { ...groups[groupIdx], visible: !groups[groupIdx].visible };
      return { ...prev, [key]: groups };
    });
  };

  const toggleGroupItem = (groupIdx, itemId, isOwner) => {
    const key = isOwner ? "ownerGroups" : "driverGroups";
    setProfileConfig(prev => {
      const groups = prev[key].map((g, gi) => gi !== groupIdx ? g : {
        ...g,
        items: g.items.map(item => item.id === itemId ? { ...item, visible: !item.visible } : item)
      });
      return { ...prev, [key]: groups };
    });
  };

  const updateTheme = (key, value) => {
    setProfileConfig(prev => ({ ...prev, theme: { ...prev.theme, [key]: value } }));
  };
  const [appSettings, setAppSettings] = useState({
    supportPhone: "437-700-5835",
    supportEmail: "truckpilot.ca@gmail.com",
    whatsapp: "14377005835",
    appVersion: "v3.0",
    appName: "TruckPilot",
    basicPrice: "9.99",
    proPrice: "24.99",
    maintenanceMode: false,
    betaMode: true,
    showUpgradeOption: true,
    maxFreeLoads: "50",
    maxBasicDrivers: "3",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, msgsRes, loadsRes, settingsRes] = await Promise.all([
        sb.from("profiles").select("*").order("created_at", { ascending: false }),
        sb.from("support_messages").select("*").order("created_at", { ascending: false }),
        sb.from("loads").select("id,user_id,owner_uid,completed,created_at").order("created_at", { ascending: false }),
        sb.from("settings").select("*").eq("user_id", "__app__").maybeSingle(),
      ]);
      setAllUsers(usersRes.data || []);
      setAllMessages((msgsRes.data || []).map(chatParse));
      setAllLoads(loadsRes.data || []);
      if (settingsRes.data?.rates) {
        setAppSettings(prev => ({ ...prev, ...settingsRes.data.rates }));
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const updateUserPlan = async (uid, plan) => {
    await sb.from("profiles").update({ plan }).eq("id", uid);
    setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, plan } : u));
  };

  const updateUserRole = async (uid, role) => {
    await sb.from("profiles").update({ role }).eq("id", uid);
    setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, role } : u));
  };

  const updateUserName = async (uid, name) => {
    await sb.from("profiles").update({ name }).eq("id", uid);
    setAllUsers(prev => prev.map(u => u.id === uid ? { ...u, name } : u));
  };

  const deleteUser = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    const isOwnerUser = user?.role === "owner";
    if (!window.confirm(
      isOwnerUser
        ? "Delete this owner account?\n\n✅ Owner's loads, expenses, settings, trucks → DELETED\n✅ Fleet links → DELETED\n✅ Drivers' own data → UNTOUCHED (they keep their records)\n\nThis cannot be undone."
        : "Delete this driver account?\n\n✅ Driver's loads, expenses, fuel logs → DELETED\n✅ Fleet links → REMOVED\n\nThis cannot be undone."
    )) return;

    if (isOwnerUser) {
      // Delete owner's own data only — never touch driver data
      await Promise.all([
        sb.from("loads").delete().eq("user_id", uid),
        sb.from("expenses").delete().eq("user_id", uid),
        sb.from("maintenance").delete().eq("user_id", uid),
        sb.from("support_messages").delete().eq("from_uid", uid),
        sb.from("settings").delete().eq("user_id", uid),
        sb.from("trucks").delete().eq("user_id", uid),
        sb.from("fuel_log").delete().eq("user_id", uid),
        // Unlink drivers from fleet — their data stays intact
        sb.from("driver_fleets").delete().eq("owner_uid", uid),
        sb.from("profiles").update({ owner_uid: null }).eq("owner_uid", uid).neq("id", uid),
      ]);
    } else {
      // Delete driver's own data + flag owner cache for refresh
      const driverProfile = allUsers.find(u => u.id === uid);
      const ownerUid = driverProfile?.owner_uid;
      await Promise.all([
        sb.from("loads").delete().eq("user_id", uid),
        sb.from("expenses").delete().eq("user_id", uid),
        sb.from("maintenance").delete().eq("user_id", uid),
        sb.from("support_messages").delete().eq("from_uid", uid),
        sb.from("driver_fleets").delete().eq("driver_uid", uid),
        sb.from("fuel_log").delete().eq("user_id", uid),
        ownerUid && ownerUid !== uid
          ? sb.from("profiles").update({ clear_flag: new Date().toISOString() }).eq("id", ownerUid)
          : Promise.resolve(),
      ]);
    }
    // Finally delete profile + auth account
    await sb.rpc("delete_user", { user_id: uid });
    setAllUsers(prev => prev.filter(u => u.id !== uid));
    if (expandedUser === uid) setExpandedUser(null);
    alert(isOwnerUser
      ? "✅ Owner account deleted. Drivers' data preserved and untouched."
      : "✅ Driver account permanently deleted."
    );
  };

  const clearUserData = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    const isOwnerUser = user?.role === "owner";
    if (!window.confirm(
      isOwnerUser
        ? "Clear this owner's data?\n\n✅ Owner's loads, expenses, settings, trucks → CLEARED\n✅ Fleet links → REMOVED\n✅ Drivers' own data → UNTOUCHED\n\nAccount stays active. This cannot be undone."
        : "Clear this driver's data?\n\n✅ Driver's loads, expenses, fuel logs → CLEARED\n✅ Fleet links → REMOVED\n\nAccount stays active. This cannot be undone."
    )) return;

    if (isOwnerUser) {
      await Promise.all([
        sb.from("loads").delete().eq("user_id", uid),
        sb.from("expenses").delete().eq("user_id", uid),
        sb.from("maintenance").delete().eq("user_id", uid),
        sb.from("support_messages").delete().eq("from_uid", uid),
        sb.from("settings").delete().eq("user_id", uid),
        sb.from("trucks").delete().eq("user_id", uid),
        sb.from("fuel_log").delete().eq("user_id", uid),
        sb.from("driver_fleets").delete().eq("owner_uid", uid),
        sb.from("profiles").update({ owner_uid: null }).eq("owner_uid", uid).neq("id", uid),
        sb.from("profiles").update({ clear_flag: new Date().toISOString() }).eq("id", uid),
      ]);
      alert("✅ Owner data cleared. Account still active. Drivers unlinked but their data is untouched.");
    } else {
      // Get the driver's owner_uid to also flag their owner's cache for refresh
      const driverProfile = allUsers.find(u => u.id === uid);
      const ownerUid = driverProfile?.owner_uid;
      await Promise.all([
        sb.from("loads").delete().eq("user_id", uid),
        sb.from("expenses").delete().eq("user_id", uid),
        sb.from("maintenance").delete().eq("user_id", uid),
        sb.from("support_messages").delete().eq("from_uid", uid),
        sb.from("driver_fleets").delete().eq("driver_uid", uid),
        sb.from("fuel_log").delete().eq("user_id", uid),
        sb.from("profiles").update({ clear_flag: new Date().toISOString() }).eq("id", uid),
        // Also flag owner's cache to refresh so they don't see stale driver data
        ownerUid && ownerUid !== uid
          ? sb.from("profiles").update({ clear_flag: new Date().toISOString() }).eq("id", ownerUid)
          : Promise.resolve(),
      ]);
      alert("✅ Driver data cleared. Account still active.");
    }
  };

  const resetPassword = async (uid) => {
    // Get user email from Supabase auth
    const { data, error } = await sb.auth.admin?.getUserById?.(uid) || {};
    const email = data?.user?.email || allUsers.find(u => u.id === uid)?.email;
    if (!email) {
      // Fallback: prompt admin to enter email manually
      const manualEmail = window.prompt("Enter the user's email address to send reset link:");
      if (!manualEmail) return;
      const { error: resetErr } = await sb.auth.resetPasswordForEmail(manualEmail, {
        redirectTo: "https://truckpilot.ca"
      });
      if (resetErr) { alert("Error: " + resetErr.message); return; }
      alert("✅ Password reset email sent to " + manualEmail);
      return;
    }
    const { error: resetErr } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: "https://truckpilot.ca"
    });
    if (resetErr) { alert("Error: " + resetErr.message); return; }
    alert("✅ Password reset email sent to " + email);
  };

  const saveAppSettings = async () => {
    setSavingSettings(true);
    try {
      await sb.from("settings").upsert({ user_id: "__app__", rates: appSettings, routes: [] }, { onConflict: "user_id" });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch(e) { console.error(e); }
    setSavingSettings(false);
  };

  const bulkSetPlan = async (plan) => {
    if (!window.confirm(`Set ALL users to ${plan} plan? This affects everyone.`)) return;
    await sb.from("profiles").update({ plan }).neq("role", "superadmin");
    setAllUsers(prev => prev.map(u => u.role === "superadmin" ? u : { ...u, plan }));
  };

  const owners = allUsers.filter(u => u.role === "owner");
  const drivers = allUsers.filter(u => u.role === "driver");
  const superAdmins = allUsers.filter(u => u.role === "superadmin");
  const unreadMsgs = allMessages.filter(m => !m.read);

  // Filtered users for the Users tab
  const filteredUsers = allUsers.filter(u => {
    const matchSearch = !userSearch || (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.id || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.username_email || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.username || "").toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
    const matchPlan = userPlanFilter === "all" || (u.plan || "free") === userPlanFilter;
    return matchSearch && matchRole && matchPlan;
  });

  // Stats for overview
  const totalLoads = allLoads.length;
  const completedLoads = allLoads.filter(l => l.completed).length;
  const todayUsers = allUsers.filter(u => u.created_at?.slice(0,10) === new Date().toISOString().slice(0,10)).length;
  const proUsers = allUsers.filter(u => u.plan === "pro").length;
  const basicUsers = allUsers.filter(u => u.plan === "basic").length;
  const freeUsers = allUsers.filter(u => !u.plan || u.plan === "free").length;

  // Revenue estimate (basic: $9.99, pro: $24.99)
  const estMonthlyRevenue = (basicUsers * 9.99 + proUsers * 24.99).toFixed(2);

  const NAVS = [
    { id:"overview",       icon:"📊", label:"Overview"      },
    { id:"users",          icon:"👥", label:"Users"         },
    { id:"messages",       icon:"🎧", label:"Messages"      },
    { id:"plans",          icon:"💰", label:"Plans"         },
    { id:"analytics",      icon:"📈", label:"Analytics"     },
    { id:"settings",       icon:"⚙️", label:"App Settings" },
    { id:"profile_editor", icon:"🎨", label:"Profile Editor"},
    { id:"notifications",  icon:"📣", label:"Notifications" },
    { id:"my_profile",     icon:"👤", label:"My Profile"    },
    { id:"create_admin",   icon:"➕", label:"Create Admin"  },
  ];

  const sectionStyle = { padding: "0 16px 40px" };
  const inputStyle = { padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, width:"100%", boxSizing:"border-box", marginTop:4, fontFamily:"'Barlow',sans-serif" };
  const labelStyle = { fontSize:12, fontWeight:700, color:C.textMed, display:"block", marginBottom:2 };

  return (
    <div className="slt-page">
      {/* Admin Nav Tabs */}
      <div style={{ background:"#fff", padding:"0 12px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:2, overflowX:"auto", position:"sticky", top:0, zIndex:50 }}>
        {NAVS.map(n => (
          <button key={n.id} onClick={()=>setActiveSection(n.id)}
            style={{ padding:"12px 14px", border:"none", background:"transparent", color:activeSection===n.id?"#243B6E":C.textMed, fontWeight:activeSection===n.id?800:600, fontSize:13, cursor:"pointer", whiteSpace:"nowrap", borderBottom:activeSection===n.id?"3px solid #243B6E":"3px solid transparent", display:"flex", alignItems:"center", gap:5, transition:"all 0.15s" }}>
            {n.icon} {n.label}
            {n.id==="messages" && unreadMsgs.length > 0 && <span style={{ background:"#E53935", color:"#fff", borderRadius:20, padding:"1px 6px", fontSize:10, fontWeight:800 }}>{unreadMsgs.length}</span>}
            {n.id==="users" && <span style={{ background:"#243B6E22", color:"#243B6E", borderRadius:20, padding:"1px 6px", fontSize:10, fontWeight:800 }}>{allUsers.length}</span>}
          </button>
        ))}
        <button onClick={loadData} title="Refresh all data" style={{ marginLeft:"auto", padding:"8px 12px", border:"none", background:"transparent", color:C.textMed, fontSize:14, cursor:"pointer" }}>🔄</button>
      </div>

      {loading && (
        <div className="slt-container">
          <div className="slt-card" style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:40 }}>⏳</div>
            <div style={{ marginTop:12, color:C.textMed, fontWeight:700 }}>Loading admin data...</div>
          </div>
        </div>
      )}

      {/* ─────────────────── OVERVIEW ─────────────────── */}
      {!loading && activeSection === "overview" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>
            {/* Hero banner */}
            <div style={{ background:"linear-gradient(135deg,#243B6E,#2D4A8A)", borderRadius:16, padding:"20px 20px", marginBottom:16, color:"#fff", textAlign:"center" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:4 }}>
                <div style={{ fontSize:28 }}>👑</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:24, color:"#fff" }}>TruckPilot Admin</div>
              </div>
              <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>Super Admin Dashboard · Full Control</div>
              <div style={{ marginTop:8, fontSize:12, opacity:0.7 }}>Last refreshed: {new Date().toLocaleString()}</div>
            </div>

            {/* Stats grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:16 }}>
              {[
                { l:"Total Users", v:allUsers.length, c:"#243B6E", icon:"👤" },
                { l:"Fleet Owners", v:owners.length, c:C.blue, icon:"🚛" },
                { l:"Drivers", v:drivers.length, c:C.teal, icon:"🧑‍✈️" },
                { l:"Pro Users", v:proUsers, c:C.green, icon:"🚀" },
                { l:"Basic Users", v:basicUsers, c:C.orange, icon:"💼" },
                { l:"Beta Users", v:freeUsers, c:"#92400e", icon:"⭐" },
                { l:"Total Loads", v:totalLoads, c:C.blue, icon:"📦" },
                { l:"Completed", v:completedLoads, c:C.green, icon:"✅" },
                { l:"Support Msgs", v:allMessages.length, c:C.orange, icon:"💬" },
                { l:"Unread Msgs", v:unreadMsgs.length, c:C.red, icon:"🔴" },
                { l:"New Today", v:todayUsers, c:"#2D4A8A", icon:"🆕" },
                { l:"Est. Revenue", v:`$${estMonthlyRevenue}`, c:C.green, icon:"💵" },
              ].map(({l,v,c,icon}) => (
                <div key={l} className="slt-card-sm" style={{ borderTop:`3px solid ${c}`, textAlign:"center", padding:"12px 8px" }}>
                  <div style={{ fontSize:18, marginBottom:2 }}>{icon}</div>
                  <div style={{ fontSize:10, color:C.textLight, fontWeight:700, marginBottom:3 }}>{l.toUpperCase()}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:900, color:c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Plan distribution bar */}
            <div className="slt-card" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, marginBottom:12 }}>Plan Distribution</div>
              {allUsers.length > 0 && (
                <div>
                  <div style={{ display:"flex", borderRadius:8, overflow:"hidden", height:20, marginBottom:10 }}>
                    <div style={{ width:`${(proUsers/allUsers.length)*100}%`, background:C.green }} title={`Pro: ${proUsers}`} />
                    <div style={{ width:`${(basicUsers/allUsers.length)*100}%`, background:C.orange }} title={`Basic: ${basicUsers}`} />
                    <div style={{ width:`${(freeUsers/allUsers.length)*100}%`, background:"#ccc" }} title={`Free: ${freeUsers}`} />
                  </div>
                  <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                    {[["Pro", proUsers, C.green],["Basic", basicUsers, C.orange],["Free", freeUsers, "#888"]].map(([l,v,c]) => (
                      <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                        <span style={{ fontWeight:700, color:c }}>{l}</span>
                        <span style={{ color:C.textLight }}>({v} · {allUsers.length ? Math.round(v/allUsers.length*100) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent sign-ups */}
            <div className="slt-card" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, marginBottom:10 }}>🆕 Recent Sign-ups</div>
              {allUsers.slice(0,8).map(u => (
                <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background: u.role==="superadmin"?"#243B6E":u.role==="owner"?C.blue:C.teal, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:13 }}>
                      {(u.name||"?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{u.name || "Unknown"}</div>
                      <div style={{ fontSize:11, color:C.textLight }}>{u.role} · <span style={{ color: u.plan==="pro"?"#166534":u.plan==="basic"?"#1e3a5f":"#92400e", fontWeight:700 }}>{u.plan==="pro"?"🚀 Pro":u.plan==="basic"?"💼 Basic":"⭐ Beta"}</span></div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:C.textLight }}>{u.created_at?.slice(0,10)}</div>
                </div>
              ))}
              {allUsers.length > 8 && <div style={{ textAlign:"center", padding:"10px 0", fontSize:12, color:C.textLight }}>+{allUsers.length-8} more · go to Users tab</div>}
            </div>

            {/* Recent messages */}
            {unreadMsgs.length > 0 && (
              <div className="slt-card" style={{ border:`1.5px solid ${C.red}` }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, marginBottom:10, color:C.red }}>🔴 {unreadMsgs.length} Unread Support Messages</div>
                {unreadMsgs.slice(0,3).map(m => (
                  <div key={m.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{m.from_name}</div>
                    <div style={{ fontSize:12, color:C.textMed }}>{chatParse(m)?.msgs?.slice(-1)[0]?.text?.slice(0,80) || "Photo"}</div>
                    <div style={{ fontSize:11, color:C.textLight }}>{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                ))}
                <button onClick={()=>setActiveSection("messages")} className="slt-btn-primary" style={{ width:"100%", marginTop:10 }}>📬 Go to Messages</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────── USERS ─────────────────── */}
      {!loading && activeSection === "users" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>

            {/* Broadcast Email */}
            <div className="slt-card" style={{ marginBottom:12, borderLeft:`4px solid ${C.blue}` }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, marginBottom:4, color:C.blue }}>📧 Email Center</div>
              <div style={{ fontSize:12, color:C.textLight, marginBottom:14 }}>Send emails to all users, a group, or a specific user</div>

              {/* Recipient selector */}
              <div style={{ marginBottom:10 }}>
                <label style={labelStyle}>Send To</label>
                <select id="broadcast-recipients" style={inputStyle}>
                  <option value="all">👥 All Users ({allUsers.filter(u=>u.username_email).length} with email)</option>
                  <option value="owners">🔑 Owners Only</option>
                  <option value="drivers">🚛 Drivers Only</option>
                  <option value="free">⭐ Beta Users Only</option>
                  <option value="specific">✉️ Specific Email Address</option>
                </select>
              </div>
              <div id="broadcast-specific-email-wrapper" style={{ marginBottom:10, display:"none" }}>
                <label style={labelStyle}>Email Address</label>
                <input id="broadcast-specific-email" style={inputStyle} placeholder="user@example.com" />
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={labelStyle}>Subject</label>
                <input id="broadcast-subject" style={inputStyle} placeholder="e.g. Important update from TruckPilot" />
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={labelStyle}>Message <span style={{fontWeight:400,color:C.textLight}}>(use {"{name}"} to personalize)</span></label>
                <textarea id="broadcast-body" style={{ ...inputStyle, minHeight:100, resize:"vertical" }} placeholder="Write your message here..." />
              </div>
              <button className="slt-btn-primary" style={{ width:"100%" }} onClick={async () => {
                const recipients = document.getElementById("broadcast-recipients").value;
                const subject = document.getElementById("broadcast-subject").value.trim();
                const body = document.getElementById("broadcast-body").value.trim();
                const specificEmail = document.getElementById("broadcast-specific-email").value.trim();
                if (!subject || !body) return alert("Please fill in subject and message.");

                let targetUsers = [];
                if (recipients === "all") targetUsers = allUsers.filter(u => u.username_email);
                else if (recipients === "owners") targetUsers = allUsers.filter(u => u.role === "owner" && u.username_email);
                else if (recipients === "drivers") targetUsers = allUsers.filter(u => u.role === "driver" && u.username_email);
                else if (recipients === "free") targetUsers = allUsers.filter(u => (!u.plan || u.plan === "free") && u.username_email);
                else if (recipients === "specific") {
                  if (!specificEmail) return alert("Please enter an email address.");
                  targetUsers = [{ username_email: specificEmail, name: "there" }];
                }

                if (targetUsers.length === 0) return alert("No users found for this selection.");
                if (!window.confirm(`Send to ${targetUsers.length} recipient${targetUsers.length !== 1 ? "s" : ""}?`)) return;

                let sent = 0; let failed = 0;
                for (const u of targetUsers) {
                  try {
                    const personalizedBody = body.replace(/\{name\}/g, u.name||"there");
                    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;"><tr><td style="background:linear-gradient(135deg,#1a2744,#243B6E);padding:28px 40px;text-align:center;"><div style="font-weight:900;font-size:32px;letter-spacing:6px;"><span style="color:#fff;text-decoration:underline;text-decoration-color:#FFD700;">TRUCK</span><span style="color:#FFD700;">PILOT</span></div><div style="color:rgba(255,255,255,0.6);font-size:11px;letter-spacing:2px;margin-top:6px;">LOG LOADS &middot; SAVE TAXES &middot; STAY COMPLIANT</div></td></tr><tr><td style="background:#FFD700;padding:14px 40px;text-align:center;"><div style="font-size:13px;font-weight:800;color:#1a2744;margin-bottom:6px;">See everything TruckPilot can do for your business</div><a href="https://www.truckpilot.ca" style="display:inline-block;background:#1a2744;color:#FFD700;text-decoration:none;font-size:13px;font-weight:900;padding:8px 24px;border-radius:20px;">Visit www.truckpilot.ca</a></td></tr><tr><td style="padding:32px 40px;"><p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi <strong>${u.name||"there"}</strong>,</p><p style="color:#333;font-size:15px;line-height:1.7;white-space:pre-wrap;">${personalizedBody}</p><p style="font-weight:800;font-size:14px;color:#1a2744;margin:24px 0 0;">&mdash; TruckPilot Support Team</p></td></tr><tr><td style="padding:0 40px 32px;text-align:center;"><a href="https://app.truckpilot.ca" style="background:linear-gradient(135deg,#1a2744,#243B6E);color:#FFD700;text-decoration:none;font-size:15px;font-weight:900;padding:14px 40px;border-radius:30px;display:inline-block;">Open TruckPilot Now &rarr;</a></td></tr><tr><td style="background:#1a2744;padding:20px 40px;text-align:center;"><div style="font-weight:900;font-size:18px;letter-spacing:4px;margin-bottom:6px;"><span style="color:#fff;">TRUCK</span><span style="color:#FFD700;">PILOT</span></div><div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;"><a href="https://www.truckpilot.ca" style="color:rgba(255,255,255,0.5);text-decoration:none;">www.truckpilot.ca</a> &middot; <a href="mailto:support@truckpilot.ca" style="color:rgba(255,255,255,0.5);text-decoration:none;">support@truckpilot.ca</a></div><div style="color:rgba(255,255,255,0.3);font-size:11px;">&copy; 2026 TruckPilot &middot; Alberta, Canada</div></td></tr></table></td></tr></table></body></html>`;
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ to: u.username_email, name: u.name||"there", subject, html }),
                    });
                    if (res.ok) sent++; else failed++;
                  } catch { failed++; }
                }
                alert(`Done! Sent: ${sent} · Failed: ${failed}`);
              }}>📤 Send Email</button>
            </div>

            {/* Filters */}
            <div className="slt-card" style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14 }}>🔍 Search & Filter — {filteredUsers.length} of {allUsers.length} users</div>
                <button onClick={exportUsersCSV} style={{ padding:"7px 14px", background:"#166534", color:"#fff", border:"none", borderRadius:8, fontWeight:800, fontSize:12, cursor:"pointer" }}>⬇️ Export CSV</button>
              </div>
              <input
                type="text" placeholder="Search by name or ID..."
                value={userSearch} onChange={e=>setUserSearch(e.target.value)}
                style={{ ...inputStyle, marginBottom:10 }}
              />
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:120 }}>
                  <label style={labelStyle}>Role</label>
                  <select value={userRoleFilter} onChange={e=>setUserRoleFilter(e.target.value)} style={inputStyle}>
                    <option value="all">All Roles</option>
                    <option value="owner">Owner</option>
                    <option value="driver">Driver</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
                <div style={{ flex:1, minWidth:120 }}>
                  <label style={labelStyle}>Plan</label>
                  <select value={userPlanFilter} onChange={e=>setUserPlanFilter(e.target.value)} style={inputStyle}>
                    <option value="all">All Plans</option>
                    <option value="free">⭐ Beta</option>
                    <option value="basic">💼 Basic</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div style={{ flex:1, minWidth:120, display:"flex", alignItems:"flex-end" }}>
                  <button onClick={()=>{setUserSearch("");setUserRoleFilter("all");setUserPlanFilter("all");}} style={{ ...inputStyle, background:"#f5f5f5", cursor:"pointer", textAlign:"center", border:`1px solid ${C.border}` }}>Clear</button>
                </div>
              </div>
            </div>

            {filteredUsers.length === 0 && (
              <div className="slt-card" style={{ textAlign:"center", padding:32, color:C.textLight }}>No users match your filter.</div>
            )}

            {filteredUsers.map(u => {
              const isExpanded = expandedUser === u.id;
              const userLoads = allLoads.filter(l => l.user_id === u.id);
              const roleColor = u.role==="superadmin"?"#243B6E":u.role==="owner"?C.blue:C.teal;
              const planColor = u.plan==="pro"?"#166534":u.plan==="basic"?"#1e3a5f":"#92400e";
              return (
                <div key={u.id} className="slt-card" style={{ marginBottom:10, borderLeft:`4px solid ${roleColor}`, padding:0, overflow:"hidden" }}>
                  {/* User header row */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", cursor:"pointer" }}
                    onClick={()=>setExpandedUser(isExpanded?null:u.id)}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:roleColor, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:15, flexShrink:0 }}>
                        {(u.name||"?")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14 }}>{u.name || "Unknown"}</span>
                          <span style={{ background:roleColor, color:"#fff", borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800 }}>{u.role}</span>
                          <span style={{ background:planColor, color:"#fff", borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800 }}>{u.plan==="pro"?"🚀 Pro":u.plan==="basic"?"💼 Basic":"⭐ Beta"}</span>
                        </div>
                        <div style={{ fontSize:11, color:C.textLight, marginTop:2 }}>
                          {u.email || u.id?.slice(0,16)+"..."} 
                        </div>
                        <div style={{ fontSize:11, color:C.textLight, marginTop:1 }}>
                          {userLoads.length} loads · Joined {u.created_at?.slice(0,10)||"unknown"}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize:16, color:C.textLight }}>{isExpanded?"▲":"▼"}</div>
                  </div>

                  {/* Expanded controls */}
                  {isExpanded && (
                    <div style={{ padding:"14px", borderTop:`1px solid ${C.border}`, background:C.offWhite }}>
                      <div style={{ fontSize:11, color:C.textLight, marginBottom:12, wordBreak:"break-all" }}>
                        <strong>ID:</strong> {u.id}<br/>
                        <strong>Email:</strong> {u.username_email || u.email || "—"}<br/>
                        <strong>Username:</strong> {u.username || "—"}<br/>
                        <strong>Invite Code:</strong> {u.invite_code || "—"}<br/>
                        <strong>Owner UID:</strong> {u.owner_uid || "—"}<br/>
                        <strong>Loads:</strong> {userLoads.length} total · {userLoads.filter(l=>l.completed).length} completed<br/>
                        <strong>Last Seen:</strong> {u.last_seen ? new Date(u.last_seen).toLocaleString() : "Never recorded"}
                      </div>

                      {/* Editable name */}
                      <div style={{ marginBottom:12 }}>
                        <label style={labelStyle}>Display Name</label>
                        <div style={{ display:"flex", gap:8 }}>
                          <input id={`name-${u.id}`} defaultValue={u.name} style={{ ...inputStyle, flex:1 }} />
                          <button onClick={()=>{ const v=document.getElementById(`name-${u.id}`).value; if(v) updateUserName(u.id,v); }}
                            className="slt-btn-primary" style={{ whiteSpace:"nowrap", padding:"8px 14px" }}>Save</button>
                        </div>
                      </div>

                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
                        <div style={{ flex:1, minWidth:130 }}>
                          <label style={labelStyle}>Plan</label>
                          <select value={u.plan||"free"} onChange={e=>updateUserPlan(u.id,e.target.value)} style={inputStyle}>
                            <option value="free">⭐ Beta</option>
                            <option value="basic">💼 Basic</option>
                            <option value="pro">🚀 Pro</option>
                          </select>
                        </div>
                        <div style={{ flex:1, minWidth:130 }}>
                          <label style={labelStyle}>Role</label>
                          <select value={u.role||"owner"} onChange={e=>updateUserRole(u.id,e.target.value)} style={inputStyle}>
                            <option value="owner">🚛 Owner</option>
                            <option value="driver">🧑‍✈️ Driver</option>
                            <option value="superadmin">🛡 Super Admin</option>
                          </select>
                        </div>
                      </div>

                      {/* Feature Overrides */}
                      <div style={{ marginBottom:12 }}>
                        <label style={{ ...labelStyle, marginBottom:8 }}>🔧 Feature Overrides (grant access regardless of plan)</label>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {FEATURE_LIST.map(f => {
                            const overrides = u.feature_overrides || {};
                            const enabled = overrides[f.id] === true;
                            return (
                              <div key={f.id} onClick={()=>toggleFeatureOverride(u.id, f.id, overrides)}
                                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
                                  background: enabled?"#243B6E":"#f0f0f0", color: enabled?"#fff":"#666",
                                  border:`1.5px solid ${enabled?"#243B6E":"#ddd"}`, transition:"all 0.15s" }}>
                                {f.label} {enabled?"✓":""}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize:11, color:C.textLight, marginTop:6 }}>Tap a feature to toggle access for this user only</div>
                      </div>

                      {/* Admin Notes */}
                      <div style={{ marginBottom:12 }}>
                        <label style={{ ...labelStyle, marginBottom:8 }}>📝 Admin Notes (private, only you see these)</label>
                        {!(adminNotes[u.id]) && (
                          <button onClick={()=>loadAdminNotes(u.id)} style={{ padding:"6px 14px", background:"#f0f4ff", border:"1px solid #243B6E", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", color:"#243B6E", marginBottom:8 }}>
                            Load Notes
                          </button>
                        )}
                        {adminNotes[u.id] && (
                          <div>
                            {adminNotes[u.id].length === 0 && <div style={{ fontSize:12, color:C.textLight, marginBottom:8 }}>No notes yet.</div>}
                            {adminNotes[u.id].map(n => (
                              <div key={n.id} style={{ background:"#fff", borderRadius:8, padding:"8px 10px", marginBottom:6, border:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                                <div>
                                  <div style={{ fontSize:13, color:"#1a1a1a" }}>{n.note}</div>
                                  <div style={{ fontSize:11, color:C.textLight, marginTop:2 }}>{new Date(n.created_at).toLocaleString()}</div>
                                </div>
                                <button onClick={()=>deleteAdminNote(n.id, u.id)} style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer", fontSize:16, padding:"0 4px" }}>✕</button>
                              </div>
                            ))}
                            <div style={{ display:"flex", gap:8, marginTop:6 }}>
                              <input value={newNote[u.id]||""} onChange={e=>setNewNote(p=>({...p,[u.id]:e.target.value}))}
                                placeholder="Add a private note..." style={{ ...inputStyle, flex:1, marginTop:0 }}
                                onKeyDown={e=>{ if(e.key==="Enter") saveAdminNote(u.id); }} />
                              <button onClick={()=>saveAdminNote(u.id)} disabled={savingNote[u.id]}
                                className="slt-btn-primary" style={{ padding:"8px 14px", whiteSpace:"nowrap" }}>
                                {savingNote[u.id]?"...":"+ Add"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap" }}>
                        <button onClick={()=>resetPassword(u.id)}
                          style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${C.blue}`, background:"#fff", color:C.blue, fontWeight:800, fontSize:12, cursor:"pointer" }}>
                          🔑 Reset Password
                        </button>
                        {u.username_email && (
                          <button onClick={()=>{
                            const subject = window.prompt("Email subject:", "A message from TruckPilot");
                            if (!subject) return;
                            const body = window.prompt("Message (use {name} for their name):", "");
                            if (!body) return;
                            const personalizedBody = body.replace(/\{name\}/g, u.name||"there");
                            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;"><tr><td style="background:linear-gradient(135deg,#1a2744,#243B6E);padding:28px 40px;text-align:center;"><div style="font-weight:900;font-size:32px;letter-spacing:6px;"><span style="color:#fff;">TRUCK</span><span style="color:#FFD700;">PILOT</span></div></td></tr><tr><td style="padding:32px 40px;"><p style="color:#333;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi <strong>${u.name||"there"}</strong>,</p><p style="color:#333;font-size:15px;line-height:1.7;white-space:pre-wrap;">${personalizedBody}</p><p style="font-weight:800;font-size:14px;color:#1a2744;margin:24px 0 0;">&mdash; TruckPilot Support Team</p></td></tr><tr><td style="background:#1a2744;padding:20px 40px;text-align:center;"><span style="color:#fff;font-weight:900;">TRUCK</span><span style="color:#FFD700;font-weight:900;">PILOT</span><div style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:4px;">&copy; 2026 TruckPilot</div></td></tr></table></td></tr></table></body></html>`;
                            fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
                              method:"POST", headers:{"Content-Type":"application/json"},
                              body: JSON.stringify({ to: u.username_email, name: u.name||"there", subject, html })
                            }).then(r=>r.json()).then(d=>alert(d.id ? "✅ Email sent!" : "❌ Failed: " + JSON.stringify(d)));
                          }}
                          style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${C.teal}`, background:"#fff", color:C.teal, fontWeight:800, fontSize:12, cursor:"pointer" }}>
                          ✉️ Send Email
                        </button>
                        )}
                        <button onClick={()=>clearUserData(u.id)}
                          style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${C.orange}`, background:"#fff", color:C.orange, fontWeight:800, fontSize:12, cursor:"pointer" }}>
                          🧹 Clear Data
                        </button>
                        <button onClick={()=>deleteUser(u.id)} className="slt-btn-danger" style={{ padding:"8px 16px", fontSize:12 }}>
                          🗑 Delete User
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────── MESSAGES ─────────────────── */}
      {!loading && activeSection === "messages" && (
        <div style={{ padding:"0 16px 40px" }}>
          <div style={{ paddingTop:16, marginBottom:12 }}>
            <input value={msgSearch} onChange={e=>setMsgSearch(e.target.value)}
              placeholder="🔍 Search messages by name or content..."
              style={{ ...inputStyle, marginTop:0, background:"#fff" }} />
          </div>
          <SupportInboxTab session={session} embedded={true} searchFilter={msgSearch} />
        </div>
      )}

      {/* ─────────────────── ANALYTICS ─────────────────── */}
      {!loading && activeSection === "analytics" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>
            <div style={{ background:"linear-gradient(135deg,#1B5E20,#2E7D32)", borderRadius:16, padding:"18px 20px", color:"#fff", marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, marginBottom:4 }}>📈 App Analytics</div>
              <div style={{ fontSize:13, opacity:0.8 }}>Growth, activity and revenue trends</div>
            </div>

            {/* User growth by month */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>👤 User Signups by Month</div>
              {(() => {
                const months = {};
                allUsers.forEach(u => {
                  const m = u.created_at?.slice(0,7);
                  if (m) months[m] = (months[m]||0) + 1;
                });
                const sorted = Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
                const max = Math.max(...sorted.map(([,v])=>v), 1);
                return sorted.length === 0 ? <div style={{ color:C.textLight, fontSize:13 }}>No data yet</div> : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {sorted.map(([month, count]) => (
                      <div key={month} style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.textMed, width:60, flexShrink:0 }}>{month}</div>
                        <div style={{ flex:1, background:"#f0f0f0", borderRadius:6, height:24, overflow:"hidden" }}>
                          <div style={{ width:`${(count/max)*100}%`, background:"#243B6E", height:"100%", borderRadius:6, display:"flex", alignItems:"center", paddingLeft:8, minWidth:30 }}>
                            <span style={{ fontSize:11, fontWeight:800, color:"#fff" }}>{count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Loads by month */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>📦 Loads Logged by Month</div>
              {(() => {
                const months = {};
                allLoads.forEach(l => {
                  const m = l.created_at?.slice(0,7);
                  if (m) months[m] = (months[m]||0) + 1;
                });
                const sorted = Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
                const max = Math.max(...sorted.map(([,v])=>v), 1);
                return sorted.length === 0 ? <div style={{ color:C.textLight, fontSize:13 }}>No data yet</div> : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {sorted.map(([month, count]) => (
                      <div key={month} style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.textMed, width:60, flexShrink:0 }}>{month}</div>
                        <div style={{ flex:1, background:"#f0f0f0", borderRadius:6, height:24, overflow:"hidden" }}>
                          <div style={{ width:`${(count/max)*100}%`, background:"#166534", height:"100%", borderRadius:6, display:"flex", alignItems:"center", paddingLeft:8, minWidth:30 }}>
                            <span style={{ fontSize:11, fontWeight:800, color:"#fff" }}>{count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Revenue estimate by month */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>💵 Est. Revenue by Month</div>
              {(() => {
                const months = {};
                allUsers.forEach(u => {
                  const m = u.created_at?.slice(0,7);
                  if (!m) return;
                  const rev = u.plan==="pro" ? 24.99 : u.plan==="basic" ? 9.99 : 0;
                  months[m] = (months[m]||0) + rev;
                });
                const sorted = Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
                const max = Math.max(...sorted.map(([,v])=>v), 1);
                return sorted.length === 0 ? <div style={{ color:C.textLight, fontSize:13 }}>No paid users yet</div> : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {sorted.map(([month, rev]) => (
                      <div key={month} style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.textMed, width:60, flexShrink:0 }}>{month}</div>
                        <div style={{ flex:1, background:"#f0f0f0", borderRadius:6, height:24, overflow:"hidden" }}>
                          <div style={{ width:`${(rev/max)*100}%`, background:"#B45309", height:"100%", borderRadius:6, display:"flex", alignItems:"center", paddingLeft:8, minWidth:40 }}>
                            <span style={{ fontSize:11, fontWeight:800, color:"#fff" }}>${rev.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Top active users */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>🏆 Most Active Users (by loads)</div>
              {allUsers
                .map(u => ({ ...u, loadCount: allLoads.filter(l=>l.user_id===u.id).length }))
                .sort((a,b)=>b.loadCount-a.loadCount)
                .slice(0,10)
                .map((u,i) => (
                  <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:i===0?"#FFD700":i===1?"#aaa":i===2?"#cd7f32":C.textLight, width:20 }}>#{i+1}</span>
                      <div>
                        <div style={{ fontWeight:700, fontSize:13 }}>{u.name||"Unknown"}</div>
                        <div style={{ fontSize:11, color:C.textLight }}>{u.role} · {u.plan||"beta"}</div>
                      </div>
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, color:"#243B6E" }}>{u.loadCount}</div>
                  </div>
                ))}
            </div>

            {/* Last seen summary */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>👁 User Activity</div>
              {[
                { label:"Active today", count: allUsers.filter(u=>u.last_seen&&new Date(u.last_seen)>new Date(Date.now()-86400000)).length, color:"#166534" },
                { label:"Active this week", count: allUsers.filter(u=>u.last_seen&&new Date(u.last_seen)>new Date(Date.now()-7*86400000)).length, color:"#243B6E" },
                { label:"Active this month", count: allUsers.filter(u=>u.last_seen&&new Date(u.last_seen)>new Date(Date.now()-30*86400000)).length, color:"#B45309" },
                { label:"Never seen", count: allUsers.filter(u=>!u.last_seen).length, color:"#888" },
              ].map(({label,count,color})=>(
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                  <span style={{ color:C.textMed, fontWeight:600 }}>{label}</span>
                  <span style={{ fontWeight:900, color }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── PLANS ─────────────────── */}
      {!loading && activeSection === "plans" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>
            {/* Revenue summary */}
            <div style={{ background:"linear-gradient(135deg,#1B5E20,#2E7D32)", borderRadius:14, padding:"18px 20px", color:"#fff", marginBottom:16 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, marginBottom:4 }}>💵 Est. Monthly Revenue</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:36 }}>${estMonthlyRevenue}</div>
              <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>{basicUsers} Basic × $9.99 + {proUsers} Pro × $24.99</div>
            </div>

            {/* Bulk actions */}
            <div className="slt-card" style={{ marginBottom:16, background:"#FFF8E1", border:`1.5px solid ${C.orange}` }}>
              <div style={{ fontWeight:800, color:C.orange, marginBottom:10 }}>⚡ Bulk Actions</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {["free","basic","pro"].map(plan => (
                  <button key={plan} onClick={()=>bulkSetPlan(plan)} style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${plan==="pro"?"#166534":plan==="basic"?"#1e3a5f":"#92400e"}`, background:"#fff", color:plan==="pro"?"#166534":plan==="basic"?"#1e3a5f":"#92400e", fontWeight:800, fontSize:12, cursor:"pointer" }}>
                    {plan==="pro"?"🚀 Set All → Pro":plan==="basic"?"💼 Set All → Basic":"⭐ Set All → Beta"}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:C.textLight, marginTop:8 }}>⚠️ These actions affect all non-admin users</div>
            </div>

            {/* Users per plan */}
            {[
              { plan:"pro",   label:"🚀 Pro Plan",   color:C.green,  price:"$24.99/mo", users: allUsers.filter(u=>u.plan==="pro") },
              { plan:"basic", label:"💼 Hauler",  color:"#1e3a5f", price:"$9.99/mo",  users: allUsers.filter(u=>u.plan==="basic") },
              { plan:"free",  label:"⭐ Beta",   color:"#92400e",   price:"Free",       users: allUsers.filter(u=>!u.plan||u.plan==="free") },
            ].map(({ plan, label, color, price, users: planUsers }) => (
              <div key={plan} className="slt-card" style={{ marginBottom:14, borderTop:`4px solid ${color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, color }}>{label}</div>
                    <div style={{ fontSize:12, color:C.textLight }}>{price}</div>
                  </div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, color }}>{planUsers.length}</div>
                </div>
                {planUsers.length === 0 && <div style={{ fontSize:12, color:C.textLight, padding:"8px 0" }}>No users on this plan.</div>}
                {planUsers.map(u => (
                  <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{u.name || "Unknown"}</div>
                      <div style={{ fontSize:11, color:C.textLight }}>{u.role} · {u.created_at?.slice(0,10)}</div>
                    </div>
                    <select value={u.plan||"free"} onChange={e=>updateUserPlan(u.id,e.target.value)}
                      style={{ padding:"5px 8px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, cursor:"pointer" }}>
                      <option value="free">⭐ Beta</option>
                      <option value="basic">💼 Basic</option>
                      <option value="pro">Pro</option>
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────── NOTIFICATIONS ─────────────────── */}
      {!loading && activeSection === "notifications" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>
          {notifLoading === false && notifications.length === 0 && !notifSending && (() => { loadNotifications(); return null; })()}

            {/* Header */}
            <div style={{ background:"linear-gradient(135deg,#166534,#15803D)", borderRadius:16, padding:"18px 20px", marginBottom:16, color:"#fff" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, marginBottom:4 }}>📣 Send Notification</div>
              <div style={{ fontSize:13, opacity:0.8 }}>Send banners that appear at the top of users' app. Supports targeting all users, owners, drivers, or a specific person.</div>
            </div>

            {/* Compose */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>✍️ Compose Notification</div>

              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Title (optional)</label>
                <input value={newNotif.title} onChange={e=>setNewNotif(p=>({...p,title:e.target.value}))}
                  placeholder="e.g. App Update, Important Notice..." style={inputStyle} />
              </div>

              <div style={{ marginBottom:12 }}>
                <label style={labelStyle}>Message *</label>
                <textarea value={newNotif.message} onChange={e=>setNewNotif(p=>({...p,message:e.target.value}))}
                  placeholder="Write your notification message here..."
                  style={{ ...inputStyle, minHeight:80, resize:"vertical" }} />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={newNotif.type} onChange={e=>setNewNotif(p=>({...p,type:e.target.value}))} style={inputStyle}>
                    <option value="info">💬 Info</option>
                    <option value="update">🚀 App Update</option>
                    <option value="maintenance">🔧 Maintenance</option>
                    <option value="announcement">📣 Announcement</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Send To</label>
                  <select value={newNotif.target} onChange={e=>setNewNotif(p=>({...p,target:e.target.value,target_uid:""}))} style={inputStyle}>
                    <option value="all">👥 All Users</option>
                    <option value="owners">🚛 Owners Only</option>
                    <option value="drivers">🧑‍✈️ Drivers Only</option>
                    <option value="specific">👤 Specific User</option>
                  </select>
                </div>
              </div>

              {newNotif.target === "specific" && (
                <div style={{ marginBottom:12 }}>
                  <label style={labelStyle}>Select User</label>
                  <select value={newNotif.target_uid} onChange={e=>setNewNotif(p=>({...p,target_uid:e.target.value}))} style={inputStyle}>
                    <option value="">— Choose a user —</option>
                    {allUsers.filter(u=>u.role!=="superadmin").map(u=>(
                      <option key={u.id} value={u.id}>{u.name||"Unknown"} ({u.role} · {u.plan||"beta"})</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>Expires At (optional — leave blank = never)</label>
                <input type="datetime-local" value={newNotif.expires_at} onChange={e=>setNewNotif(p=>({...p,expires_at:e.target.value}))} style={inputStyle} />
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={labelStyle}>👁 Visibility — Who sees this and when?</label>
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:6 }}>
                  {[
                    { value:"after",  label:"After Login Only",   desc:"Only logged-in users see this" },
                    { value:"before", label:"Before Login Only",  desc:"Only shows on the login screen" },
                    { value:"both",   label:"Both (Before & After Login)", desc:"Everyone sees it — best for offers & announcements" },
                  ].map(opt=>(
                    <div key={opt.value} onClick={()=>setNewNotif(p=>({...p,visibility:opt.value}))}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`2px solid ${newNotif.visibility===opt.value?"#243B6E":"#ddd"}`, background:newNotif.visibility===opt.value?"#f0f4ff":"#fff", cursor:"pointer" }}>
                      <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${newNotif.visibility===opt.value?"#243B6E":"#ccc"}`, background:newNotif.visibility===opt.value?"#243B6E":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {newNotif.visibility===opt.value && <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:newNotif.visibility===opt.value?"#243B6E":"#1a1a1a" }}>{opt.label}</div>
                        <div style={{ fontSize:11, color:"#888" }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {newNotif.message && (
                <div style={{ marginBottom:14 }}>
                  <label style={labelStyle}>Preview</label>
                  <div style={{
                    borderRadius:10, padding:"12px 16px", fontSize:14, fontWeight:700,
                    background: newNotif.type==="update"?"#243B6E":newNotif.type==="maintenance"?"#B45309":newNotif.type==="announcement"?"#166534":"#1e3a5f",
                    color:"#fff", display:"flex", alignItems:"center", gap:10
                  }}>
                    <span style={{ fontSize:18 }}>{newNotif.type==="update"?"🚀":newNotif.type==="maintenance"?"🔧":newNotif.type==="announcement"?"📣":"💬"}</span>
                    <div>
                      {newNotif.title && <span style={{ fontWeight:900, marginRight:8 }}>{newNotif.title}:</span>}
                      {newNotif.message}
                    </div>
                    <span style={{ marginLeft:"auto", opacity:0.6, fontSize:18 }}>✕</span>
                  </div>
                </div>
              )}

              <button onClick={sendNotification} disabled={notifSending}
                style={{ width:"100%", padding:"13px", background: notifSent?"#166534":"#243B6E", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:15, cursor:"pointer" }}>
                {notifSending ? "Sending..." : notifSent ? "✅ Notification Sent!" : "📣 Send Notification"}
              </button>
            </div>

            {/* Active Notifications */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontWeight:800, fontSize:14, color:"#243B6E" }}>📋 All Notifications</div>
                <button onClick={loadNotifications} style={{ padding:"6px 14px", background:"#f0f4ff", border:"1px solid #243B6E", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", color:"#243B6E" }}>
                  🔄 Refresh
                </button>
              </div>

              {notifLoading && <div style={{ textAlign:"center", padding:24, color:C.textLight }}>Loading...</div>}

              {!notifLoading && notifications.length === 0 && (
                <div style={{ textAlign:"center", padding:24, color:C.textLight, fontSize:13 }}>No notifications yet. Send one above!</div>
              )}

              {!notifLoading && notifications.map(n => {
                const typeColors = {
                  update:       "#243B6E",
                  maintenance:  "#B45309",
                  announcement: "#166534",
                  info:         "#1e3a5f",
                };
                const typeIcons = { update:"🚀", maintenance:"🔧", announcement:"📣", info:"💬" };
                return (
                  <div key={n.id} style={{ borderRadius:12, border:`1.5px solid ${n.active?"#243B6E":"#ddd"}`, padding:"12px 14px", marginBottom:10, background: n.active?"#f0f4ff":"#f9f9f9" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>{typeIcons[n.type]||"💬"}</span>
                        <div>
                          {n.title && <div style={{ fontWeight:800, fontSize:13, color: typeColors[n.type]||"#243B6E" }}>{n.title}</div>}
                          <div style={{ fontSize:13, color:"#1a1a1a", fontWeight:600 }}>{n.message}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:8 }}>
                        <div onClick={()=>toggleNotifActive(n.id, n.active)}
                          style={{ width:40, height:22, borderRadius:20, background:n.active?"#243B6E":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:n.active?20:2, transition:"left 0.2s" }} />
                        </div>
                        <button onClick={()=>deleteNotif(n.id)}
                          style={{ padding:"3px 10px", background:"#FFF0F0", border:"1px solid #EF4444", borderRadius:8, color:"#EF4444", fontWeight:800, fontSize:12, cursor:"pointer" }}>
                          🗑
                        </button>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background: n.active?"#243B6E":"#ccc", color:"#fff" }}>
                        {n.active ? "● Active" : "○ Inactive"}
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#e0e7ff", color:"#243B6E" }}>
                        {n.target === "all" ? "👥 All Users" : n.target === "owners" ? "🚛 Owners" : n.target === "drivers" ? "🧑‍✈️ Drivers" : "👤 Specific User"}
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:"#f0fdf4", color:"#166534" }}>
                        {n.visibility === "before" ? "👁 Login screen only" : n.visibility === "both" ? "👁 Before & after login" : "👁 After login only"}
                      </span>
                      <span style={{ fontSize:11, color:C.textLight }}>
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                      {n.expires_at && (
                        <span style={{ fontSize:11, color:C.textLight }}>· Expires {new Date(n.expires_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── PROFILE EDITOR ─────────────────── */}
      {!loading && activeSection === "profile_editor" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>

            {/* Header */}
            <div style={{ background:"linear-gradient(135deg,#243B6E,#2D4A8A)", borderRadius:16, padding:"18px 20px", marginBottom:16, color:"#fff" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, marginBottom:4 }}>🎨 Profile Tab Editor</div>
              <div style={{ fontSize:13, opacity:0.8 }}>Control what every user sees in their Profile tab — items, groups, colors and fonts. Changes save to Supabase and apply live.</div>
            </div>

            {/* Target User Selector */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:10, color:"#243B6E" }}>👤 Apply To</div>
              <select value={profileTargetUser} onChange={e=>{ setProfileTargetUser(e.target.value); setProfileConfig(null); }}
                style={inputStyle}>
                <option value="global">🌍 All Users (Global)</option>
                {allUsers.filter(u=>u.role!=="superadmin").map(u=>(
                  <option key={u.id} value={u.id}>{u.name || "Unknown"} ({u.role} · {u.plan||"beta"})</option>
                ))}
              </select>
              <button onClick={loadProfileConfig} style={{ marginTop:10, padding:"9px 20px", background:"#243B6E", color:"#fff", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:"pointer", width:"100%" }}>
                {profileConfigLoading ? "Loading..." : "📥 Load Config"}
              </button>
            </div>

            {profileConfig && (<>

              {/* Save / Reset bar */}
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                <button onClick={saveProfileConfig} disabled={profileConfigSaving}
                  style={{ flex:1, padding:"11px", background: profileConfigSaved?"#166534":"#243B6E", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:14, cursor:"pointer" }}>
                  {profileConfigSaving ? "Saving..." : profileConfigSaved ? "✅ Saved!" : "💾 Save Changes"}
                </button>
                <button onClick={resetProfileConfig}
                  style={{ padding:"11px 18px", background:"#fff", color:"#E53935", border:"1.5px solid #E53935", borderRadius:10, fontWeight:800, fontSize:13, cursor:"pointer" }}>
                  ↺ Reset
                </button>
              </div>

              {/* ── THEME ── */}
              <div className="slt-card" style={{ marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>🎨 Theme & Colors</div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                  {[
                    { key:"primaryColor",  label:"Primary Color"  },
                    { key:"accentColor",   label:"Accent Color"   },
                    { key:"bgColor",       label:"Background"     },
                    { key:"cardBg",        label:"Card Background"},
                    { key:"textColor",     label:"Text Color"     },
                  ].map(({key,label})=>(
                    <div key={key}>
                      <label style={{...labelStyle, marginBottom:4}}>{label}</label>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input type="color" value={profileConfig.theme[key]||"#000000"}
                          onChange={e=>updateTheme(key,e.target.value)}
                          style={{ width:40, height:36, borderRadius:8, border:"1px solid #ddd", cursor:"pointer", padding:2 }} />
                        <input type="text" value={profileConfig.theme[key]||""}
                          onChange={e=>updateTheme(key,e.target.value)}
                          style={{ ...inputStyle, marginTop:0, flex:1, fontSize:12 }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom:12 }}>
                  <label style={labelStyle}>Font Family</label>
                  <select value={profileConfig.theme.fontFamily||"Barlow"} onChange={e=>updateTheme("fontFamily",e.target.value)} style={inputStyle}>
                    {["Barlow","Inter","Roboto","Poppins","Montserrat","Oswald","Lato","Nunito","Raleway","Open Sans"].map(f=>(
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Card Border Radius (px): {profileConfig.theme.borderRadius}px</label>
                  <input type="range" min="0" max="32" value={profileConfig.theme.borderRadius||18}
                    onChange={e=>updateTheme("borderRadius",e.target.value)}
                    style={{ width:"100%", marginTop:6 }} />
                </div>

                {/* Live Preview */}
                <div style={{ marginTop:14, borderRadius:12, border:"1px solid #ddd", overflow:"hidden" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#888", padding:"8px 12px", background:"#f9f9f9", borderBottom:"1px solid #ddd" }}>PREVIEW</div>
                  <div style={{ background: profileConfig.theme.bgColor, padding:16, fontFamily: profileConfig.theme.fontFamily+",sans-serif" }}>
                    <div style={{ background: profileConfig.theme.cardBg, borderRadius: profileConfig.theme.borderRadius+"px", padding:"14px 16px", border:"1px solid rgba(0,0,0,0.08)", marginBottom:10 }}>
                      <div style={{ fontWeight:800, fontSize:15, color: profileConfig.theme.textColor }}>Sample Card</div>
                      <div style={{ fontSize:12, color: profileConfig.theme.textColor, opacity:0.5, marginTop:3 }}>This is how cards will look</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <div style={{ flex:1, background: profileConfig.theme.primaryColor, borderRadius:8, padding:"10px", textAlign:"center", color:"#fff", fontWeight:800, fontSize:12 }}>Primary</div>
                      <div style={{ flex:1, background: profileConfig.theme.accentColor, borderRadius:8, padding:"10px", textAlign:"center", color: profileConfig.theme.primaryColor, fontWeight:800, fontSize:12 }}>Accent</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── SETTINGS & MORE ── */}
              <div className="slt-card" style={{ marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:"#243B6E" }}>⚙️ Settings & More Items</div>
                <div style={{ fontSize:12, color:C.textLight, marginBottom:12 }}>Toggle which items appear in the Settings & More section of the Profile tab</div>
                {profileConfig.settingsMore.map(item=>(
                  <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:20 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color: item.visible?C.text:"#bbb" }}>{item.label}</div>
                        <div style={{ fontSize:11, color:C.textLight }}>{item.subtitle}{item.ownerOnly?" · Owner only":""}</div>
                      </div>
                    </div>
                    <div onClick={()=>toggleSettingsItem(item.id)}
                      style={{ width:44, height:24, borderRadius:20, background:item.visible?"#243B6E":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:item.visible?22:2, transition:"left 0.2s" }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* ── OWNER TOOL GROUPS ── */}
              <div className="slt-card" style={{ marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:"#243B6E" }}>🚛 Owner Tool Groups</div>
                <div style={{ fontSize:12, color:C.textLight, marginBottom:12 }}>Control which tool groups and items owners see in their Profile tab</div>
                {profileConfig.ownerGroups.map((group, gi)=>(
                  <div key={group.group} style={{ marginBottom:14, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                    {/* Group header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background: group.visible?"#f0f4ff":"#f9f9f9" }}>
                      <div style={{ fontWeight:800, fontSize:13, color: group.visible?"#243B6E":"#bbb" }}>📁 {group.group}</div>
                      <div onClick={()=>toggleGroupVisible(gi,true)}
                        style={{ width:44, height:24, borderRadius:20, background:group.visible?"#243B6E":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:group.visible?22:2, transition:"left 0.2s" }} />
                      </div>
                    </div>
                    {/* Group items */}
                    {group.items.map(item=>(
                      <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 14px 9px 28px", borderTop:`1px solid ${C.border}`, background:"#fff" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>{item.icon}</span>
                          <span style={{ fontSize:13, fontWeight:600, color: item.visible?"#1a1a1a":"#bbb" }}>{item.label}</span>
                        </div>
                        <div onClick={()=>toggleGroupItem(gi,item.id,true)}
                          style={{ width:38, height:22, borderRadius:20, background:item.visible?"#243B6E":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:item.visible?18:2, transition:"left 0.2s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ── DRIVER TOOL GROUPS ── */}
              <div className="slt-card" style={{ marginBottom:14 }}>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:"#243B6E" }}>🧑‍✈️ Driver Tool Groups</div>
                <div style={{ fontSize:12, color:C.textLight, marginBottom:12 }}>Control which tool groups and items drivers see in their Profile tab</div>
                {profileConfig.driverGroups.map((group, gi)=>(
                  <div key={group.group} style={{ marginBottom:14, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background: group.visible?"#f0fff4":"#f9f9f9" }}>
                      <div style={{ fontWeight:800, fontSize:13, color: group.visible?"#166534":"#bbb" }}>📁 {group.group}</div>
                      <div onClick={()=>toggleGroupVisible(gi,false)}
                        style={{ width:44, height:24, borderRadius:20, background:group.visible?"#166534":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:group.visible?22:2, transition:"left 0.2s" }} />
                      </div>
                    </div>
                    {group.items.map(item=>(
                      <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 14px 9px 28px", borderTop:`1px solid ${C.border}`, background:"#fff" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>{item.icon}</span>
                          <span style={{ fontSize:13, fontWeight:600, color: item.visible?"#1a1a1a":"#bbb" }}>{item.label}</span>
                        </div>
                        <div onClick={()=>toggleGroupItem(gi,item.id,false)}
                          style={{ width:38, height:22, borderRadius:20, background:item.visible?"#166534":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                          <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:item.visible?18:2, transition:"left 0.2s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Save again at bottom */}
              <button onClick={saveProfileConfig} disabled={profileConfigSaving}
                style={{ width:"100%", padding:"14px", background: profileConfigSaved?"#166534":"#243B6E", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:15, cursor:"pointer" }}>
                {profileConfigSaving ? "Saving..." : profileConfigSaved ? "✅ Saved!" : "💾 Save All Changes"}
              </button>

            </>)}

            {!profileConfig && !profileConfigLoading && (
              <div className="slt-card" style={{ textAlign:"center", padding:40, color:C.textLight }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🎨</div>
                <div style={{ fontWeight:700, marginBottom:6 }}>Select a target and click "Load Config"</div>
                <div style={{ fontSize:13 }}>Choose "All Users" for global changes, or pick a specific user to customize their profile individually.</div>
              </div>
            )}

            {profileConfigLoading && (
              <div className="slt-card" style={{ textAlign:"center", padding:40 }}>
                <div style={{ fontSize:32 }}>⏳</div>
                <div style={{ marginTop:10, color:C.textMed, fontWeight:700 }}>Loading config...</div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ─────────────────── APP SETTINGS ─────────────────── */}
      {!loading && activeSection === "settings" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18 }}>⚙️ App Settings</div>
              <button onClick={saveAppSettings} disabled={savingSettings}
                style={{ padding:"10px 22px", background: settingsSaved ? C.green : "#243B6E", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:13, cursor:"pointer" }}>
                {savingSettings ? "Saving..." : settingsSaved ? "✅ Saved!" : "💾 Save All"}
              </button>
            </div>

            {/* Contact Info */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>📞 Contact & Support Info</div>
              {[
                { key:"supportPhone", label:"Support Phone", type:"tel", placeholder:"437-700-5835" },
                { key:"supportEmail", label:"Support Email", type:"email", placeholder:"truckpilot.ca@gmail.com" },
                { key:"whatsapp", label:"WhatsApp Number (digits only)", type:"text", placeholder:"14377005835" },
              ].map(({key,label,type,placeholder}) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={appSettings[key]} placeholder={placeholder}
                    onChange={e=>setAppSettings(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* App Info */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>🏷 App Info</div>
              {[
                { key:"appName", label:"App Name", type:"text", placeholder:"TruckPilot" },
                { key:"appVersion", label:"App Version", type:"text", placeholder:"v3.0" },
              ].map(({key,label,type,placeholder}) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={appSettings[key]} placeholder={placeholder}
                    onChange={e=>setAppSettings(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Plan Pricing */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>💰 Plan Pricing</div>
              {[
                { key:"basicPrice", label:"Basic Plan Price ($/mo)", placeholder:"9.99" },
                { key:"proPrice",   label:"Pro Plan Price ($/mo)",   placeholder:"24.99" },
                { key:"maxFreeLoads",   label:"Free Plan — Max Loads",   placeholder:"50" },
                { key:"maxBasicDrivers", label:"Basic Plan — Max Drivers", placeholder:"3" },
              ].map(({key,label,placeholder}) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type="number" step="0.01" value={appSettings[key]} placeholder={placeholder}
                    onChange={e=>setAppSettings(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Feature Flags */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>🚦 Feature Flags</div>
              {[
                { key:"maintenanceMode", label:"🔧 Maintenance Mode (locks app for all non-admins)" },
                { key:"betaMode", label:"🧪 Beta Mode (all features free for everyone)" },
                { key:"showUpgradeOption", label:"💳 Show Upgrade/Plans to users" },
              ].map(({key,label}) => (
                <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:13, fontWeight:600, flex:1 }}>{label}</div>
                  <div onClick={async()=>{ const newVal = !appSettings[key]; const updated = {...appSettings,[key]:newVal}; setAppSettings(updated); await sb.from("settings").upsert({ user_id:"__app__", rates:updated, routes:[] },{ onConflict:"user_id" }); await sb.from("settings").update({ rates: {...(updated), showUpgradeOption:updated.showUpgradeOption, maintenanceMode:updated.maintenanceMode, betaMode:updated.betaMode} }).eq("user_id","55661ff3-cd77-4e29-8de3-a4e2ad129dca"); }}
                    style={{ width:44, height:24, borderRadius:20, background:appSettings[key]?"#243B6E":"#ccc", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:appSettings[key]?22:2, transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.3)" }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, color:C.textLight, marginTop:8 }}>⚠️ Feature flags are saved to Supabase. Some may require a code deploy to fully take effect.</div>
            </div>

            {/* System stats */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>📊 System Stats (read-only)</div>
              {[
                ["Total Users", allUsers.length],
                ["Total Loads", totalLoads],
                ["Total Support Messages", allMessages.length],
                ["Super Admins", superAdmins.length],
                ["Unread Messages", unreadMsgs.length],
                ["Est. Monthly Revenue", `$${estMonthlyRevenue}`],
              ].map(([l,v]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                  <span style={{ color:C.textMed, fontWeight:600 }}>{l}</span>
                  <span style={{ fontWeight:800, color:"#243B6E" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Danger zone */}
            <div className="slt-card" style={{ background:"#FFF3E0", border:"1.5px solid #243B6E" }}>
              <div style={{ fontWeight:800, color:"#243B6E", marginBottom:8, fontSize:14 }}>⚠️ Danger Zone</div>
              <div style={{ fontSize:13, color:C.textMed, marginBottom:12 }}>These actions are irreversible. Proceed with extreme caution.</div>
              <button onClick={()=>{ if(window.confirm("Clear ALL support messages? This cannot be undone.")) sb.from("support_messages").delete().neq("id","00000000-0000-0000-0000-000000000000").then(()=>{ setAllMessages([]); }); }}
                style={{ padding:"10px 16px", background:"#E53935", color:"#fff", border:"none", borderRadius:8, fontWeight:800, fontSize:13, cursor:"pointer" }}>
                🗑 Clear All Support Messages
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─────────────────── MY PROFILE ─────────────────── */}
      {!loading && activeSection === "my_profile" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>

            <div style={{ background:"linear-gradient(135deg,#243B6E,#2D4A8A)", borderRadius:16, padding:"18px 20px", marginBottom:16, color:"#fff" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, marginBottom:4 }}>👤 My Admin Profile</div>
              <div style={{ fontSize:13, opacity:0.8 }}>Edit your name, username, email, password and profile photo</div>
            </div>

            {/* Load profile button */}
            {!adminProfile.name && (
              <button onClick={loadAdminProfile} style={{ width:"100%", padding:"12px", background:"#243B6E", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:14, cursor:"pointer", marginBottom:14 }}>
                📥 Load My Profile
              </button>
            )}

            {/* Avatar */}
            <div className="slt-card" style={{ marginBottom:14, textAlign:"center" }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>🖼 Profile Photo</div>
              <div style={{ width:90, height:90, borderRadius:"50%", background:"#243B6E", margin:"0 auto 14px", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {adminProfile.avatarUrl
                  ? <img src={adminProfile.avatarUrl} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#fff" }}>
                      {(adminProfile.name||"A")[0].toUpperCase()}
                    </span>
                }
              </div>
              <label style={{ display:"inline-block", padding:"9px 20px", background:"#f0f4ff", border:"1.5px solid #243B6E", borderRadius:10, fontWeight:800, fontSize:13, cursor:"pointer", color:"#243B6E" }}>
                {adminAvatarUploading ? "Uploading..." : "📷 Upload Photo"}
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>uploadAdminAvatar(e.target.files[0])} />
              </label>
              <div style={{ fontSize:11, color:"#888", marginTop:8 }}>JPG, PNG or GIF. Max 2MB recommended.</div>
            </div>

            {/* Profile fields */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#243B6E" }}>✏️ Profile Info</div>
              {[
                { key:"name",     label:"Full Name",  type:"text",  placeholder:"Your name" },
                { key:"username", label:"Username",   type:"text",  placeholder:"your_username" },
                { key:"email",    label:"Email",      type:"email", placeholder:"you@email.com" },
              ].map(({key,label,type,placeholder})=>(
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={adminProfile[key]} placeholder={placeholder}
                    onChange={e=>setAdminProfile(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>

            {/* Password */}
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:4, color:"#243B6E" }}>🔑 Change Password</div>
              <div style={{ fontSize:12, color:"#888", marginBottom:12 }}>Leave blank to keep current password</div>
              {[
                { key:"newPassword",     label:"New Password",     placeholder:"Min 6 characters" },
                { key:"confirmPassword", label:"Confirm Password", placeholder:"Repeat new password" },
              ].map(({key,label,placeholder})=>(
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type="password" value={adminProfile[key]} placeholder={placeholder}
                    onChange={e=>setAdminProfile(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>

            {adminProfileMsg.text && (
              <div style={{ padding:"12px 16px", borderRadius:10, marginBottom:14, fontSize:13, fontWeight:700,
                background: adminProfileMsg.type==="success"?"#f0fdf4":"#FFF0F0",
                color: adminProfileMsg.type==="success"?"#166534":"#EF4444",
                border: `1px solid ${adminProfileMsg.type==="success"?"#bbf7d0":"#fecaca"}` }}>
                {adminProfileMsg.text}
              </div>
            )}

            <button onClick={saveAdminProfile} disabled={adminProfileSaving}
              style={{ width:"100%", padding:"14px", background: adminProfileSaved?"#166534":"#243B6E", color:"#fff", border:"none", borderRadius:12, fontWeight:800, fontSize:15, cursor:"pointer" }}>
              {adminProfileSaving ? "Saving..." : adminProfileSaved ? "✅ Saved!" : "💾 Save Profile"}
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────── CREATE ADMIN ─────────────────── */}
      {!loading && activeSection === "create_admin" && (
        <div style={sectionStyle}>
          <div style={{ paddingTop:16 }}>

            <div style={{ background:"linear-gradient(135deg,#7C3AED,#6D28D9)", borderRadius:16, padding:"18px 20px", marginBottom:16, color:"#fff" }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:22, marginBottom:4 }}>➕ Create Admin Account</div>
              <div style={{ fontSize:13, opacity:0.8 }}>Create a new superadmin account. They will have full access to this admin panel.</div>
            </div>

            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:14, color:"#7C3AED" }}>👤 New Admin Details</div>

              {[
                { key:"name",     label:"Full Name *",  type:"text",  placeholder:"Admin's full name" },
                { key:"email",    label:"Email *",      type:"email", placeholder:"admin@truckpilot.ca" },
                { key:"username", label:"Username",     type:"text",  placeholder:"admin_username (optional)" },
              ].map(({key,label,type,placeholder})=>(
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} value={newAdmin[key]} placeholder={placeholder}
                    onChange={e=>setNewAdmin(p=>({...p,[key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}

              {/* Password method */}
              <div style={{ marginBottom:14 }}>
                <label style={{ ...labelStyle, marginBottom:8 }}>🔑 Password Setup</label>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div onClick={()=>setNewAdmin(p=>({...p,sendLink:false}))}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`2px solid ${!newAdmin.sendLink?"#7C3AED":"#ddd"}`, background:!newAdmin.sendLink?"#f5f3ff":"#fff", cursor:"pointer" }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${!newAdmin.sendLink?"#7C3AED":"#ccc"}`, background:!newAdmin.sendLink?"#7C3AED":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {!newAdmin.sendLink && <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:!newAdmin.sendLink?"#7C3AED":"#1a1a1a" }}>Set password manually</div>
                      <div style={{ fontSize:11, color:"#888" }}>You type their password now</div>
                    </div>
                  </div>
                  <div onClick={()=>setNewAdmin(p=>({...p,sendLink:true,password:""}))}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`2px solid ${newAdmin.sendLink?"#7C3AED":"#ddd"}`, background:newAdmin.sendLink?"#f5f3ff":"#fff", cursor:"pointer" }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${newAdmin.sendLink?"#7C3AED":"#ccc"}`, background:newAdmin.sendLink?"#7C3AED":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {newAdmin.sendLink && <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:newAdmin.sendLink?"#7C3AED":"#1a1a1a" }}>Send password setup link</div>
                      <div style={{ fontSize:11, color:"#888" }}>They get an email to set their own password</div>
                    </div>
                  </div>
                </div>
              </div>

              {!newAdmin.sendLink && (
                <div style={{ marginBottom:12 }}>
                  <label style={labelStyle}>Password *</label>
                  <input type="password" value={newAdmin.password} placeholder="Min 6 characters"
                    onChange={e=>setNewAdmin(p=>({...p,password:e.target.value}))} style={inputStyle} />
                </div>
              )}

              {createAdminMsg.text && (
                <div style={{ padding:"12px 16px", borderRadius:10, marginBottom:12, fontSize:13, fontWeight:700,
                  background: createAdminMsg.type==="success"?"#f0fdf4":"#FFF0F0",
                  color: createAdminMsg.type==="success"?"#166534":"#EF4444",
                  border:`1px solid ${createAdminMsg.type==="success"?"#bbf7d0":"#fecaca"}` }}>
                  {createAdminMsg.text}
                </div>
              )}

              <button onClick={createAdminAccount} disabled={creatingAdmin}
                style={{ width:"100%", padding:"13px", background:"#7C3AED", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:15, cursor:"pointer" }}>
                {creatingAdmin ? "Creating..." : "➕ Create Admin Account"}
              </button>
            </div>

            {/* Existing admins list */}
            <div className="slt-card">
              <div style={{ fontWeight:800, fontSize:14, marginBottom:12, color:"#7C3AED" }}>🛡 Current Admins</div>
              {allUsers.filter(u=>u.role==="superadmin").map(u=>(
                <div key={u.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:"#7C3AED", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:15 }}>
                      {(u.name||"A")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{u.name||"Unknown"}</div>
                      <div style={{ fontSize:11, color:C.textLight }}>{u.username_email||u.email||"—"} · Joined {u.created_at?.slice(0,10)}</div>
                    </div>
                  </div>
                  <span style={{ background:"#7C3AED22", color:"#7C3AED", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:800 }}>🛡 Admin</span>
                </div>
              ))}
              {allUsers.filter(u=>u.role==="superadmin").length===0 && (
                <div style={{ color:C.textLight, fontSize:13, textAlign:"center", padding:20 }}>No admins found</div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

function MessageDetailModal({ thread, onClose, onThreadUpdate, session }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const msgsLen = useRef(thread?.msgs?.length || 0);

  const msgs = thread?.msgs || [];
  const isClosed = thread?.closed;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs.length]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150); }, []);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await sb.from("support_messages")
          .select("message,reply").eq("from_uid", thread.from_uid).maybeSingle();
        if (!data) return;
        const fresh = chatParse({ ...thread, ...data });
        if (!fresh) return;
        if (fresh.msgs.length > msgsLen.current) {
          msgsLen.current = fresh.msgs.length;
          onThreadUpdate(fresh);
        }
      } catch(e) {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [thread.from_uid]);

  const compressImg = (file) => new Promise(res => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        let [w, h] = [img.width, img.height];
        if (w > 800) { h = h*800/w; w = 800; }
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", 0.65));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });

  const send = async () => {
    if ((!input.trim() && !imgB64) || sending || isClosed) return;
    setSending(true); setSendErr(null);
    const msg = { id: Date.now().toString(), from:"admin", text: input.trim(), image: imgB64||null, time: new Date().toISOString() };
    const err = await chatAdminSend(thread.from_uid, msgs, msg);
    if (err) { setSendErr("Failed: " + err.message); setSending(false); return; }
    const updatedMsgs = [...msgs, msg];
    msgsLen.current = updatedMsgs.length; // update BEFORE poll can fire
    onThreadUpdate({ ...thread, msgs: updatedMsgs });
    setInput(""); setImgB64(null); setSending(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const toggleClose = async () => {
    const closing = !isClosed;
    if (closing && !window.confirm("End this conversation?")) return;
    await chatSetClosed(thread.from_uid, closing);
    onThreadUpdate({ ...thread, closed: closing, reply: closing ? "__closed__" : null });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9500, display:"flex", flexDirection:"column", background:"#fff" }}>
      <div style={{ background:"linear-gradient(135deg,#0D47A1,#243B6E)", padding:"12px 14px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"#fff", fontSize:18, cursor:"pointer", padding:"4px 10px", fontWeight:700 }}>←</button>
        <div style={{ width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:15,flexShrink:0 }}>
          {(thread.from_name||"?")[0].toUpperCase()}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800,fontSize:15,color:"#fff" }}>{thread.from_name||"Unknown"}</div>
          <div style={{ fontSize:11,color:"rgba(255,255,255,0.7)" }}>{thread.from_email||""} · {msgs.length} msgs</div>
        </div>
        <button onClick={toggleClose}
          style={{ background:isClosed?"#43A047":"#E53935",border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",padding:"6px 12px" }}>
          {isClosed ? "Reopen" : "End Chat"}
        </button>
        <button onClick={async()=>{ if(!window.confirm("Delete conversation?")) return; await sb.from("support_messages").delete().eq("from_uid",thread.from_uid); onClose(); }}
          style={{ background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,color:"rgba(255,255,255,0.8)",fontSize:16,cursor:"pointer",padding:"6px 8px" }}>&#128465;</button>
      </div>

      {isClosed && (
        <div style={{ background:"rgba(0,0,0,0.05)",padding:"7px 14px",textAlign:"center",fontSize:11,fontWeight:600,color:C.textLight,flexShrink:0 }}>
          — Conversation paused · full history preserved —
        </div>
      )}

      <div style={{ flex:1,overflowY:"auto",padding:"14px",background:"#F0F4F8",display:"flex",flexDirection:"column",gap:8 }}>
        {msgs.length===0 && <div style={{ textAlign:"center",color:C.textLight,padding:40 }}>No messages yet</div>}
        {msgs.map((m,i) => {
          // If admin is viewing their OWN thread (they are the user), flip perspective
          const viewingOwnThread = thread.from_uid === session?.uid;
          const isMine = viewingOwnThread ? m.from === "user" : m.from === "admin";
          const senderName = viewingOwnThread
            ? (m.from === "user" ? (thread.from_name || "You") : "Customer Support")
            : (isMine ? "Customer Support" : (thread.from_name || "User"));
          const senderColor = isMine ? (viewingOwnThread ? C.blue : "#243B6E") : (viewingOwnThread ? "#243B6E" : C.blue);
          return (
            <div key={m.id||i} style={{ display:"flex", justifyContent:isMine?"flex-end":"flex-start", alignItems:"flex-end", gap:8, marginBottom:4 }}>
              {/* Left avatar — user messages */}
              {!isMine && (
                <div style={{ width:32,height:32,borderRadius:"50%",background:senderColor,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0 }}>
                  {senderName[0].toUpperCase()}
                </div>
              )}
              <div style={{ maxWidth:"72%" }}>
                <div style={{ fontSize:11,fontWeight:800,color:senderColor,marginBottom:3,textAlign:isMine?"right":"left" }}>{senderName}</div>
                {m.image && <img src={m.image} alt="" onClick={()=>window.open(m.image,"_blank")} style={{ maxWidth:"100%",borderRadius:12,marginBottom:m.text?4:0,display:"block",cursor:"pointer",border:"2px solid rgba(255,255,255,0.5)" }} />}
                {m.text && (
                  <div style={{ background:isMine?"linear-gradient(135deg,#243B6E,#2D4A8A)":"#fff", color:isMine?"#fff":C.textDark, borderRadius:isMine?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"10px 14px", fontSize:13, lineHeight:1.5, boxShadow:"0 1px 4px rgba(0,0,0,0.12)" }}>
                    {m.text}
                  </div>
                )}
                <div style={{ fontSize:10,color:C.textLight,marginTop:3,textAlign:isMine?"right":"left" }}>
                  {new Date(m.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                </div>
              </div>
              {/* Right avatar — admin messages */}
              {isMine && (
                <div style={{ width:32,height:32,borderRadius:"50%",background:senderColor,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0 }}>
                  A
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {imgB64 && (
        <div style={{ padding:"6px 12px",background:"#fff",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
          <img src={imgB64} alt="" style={{ height:50,borderRadius:6,border:`1px solid ${C.border}` }} />
          <button onClick={()=>setImgB64(null)} style={{ color:C.red,background:"none",border:"none",cursor:"pointer",fontWeight:700 }}>Remove</button>
        </div>
      )}
      {sendErr && <div style={{ padding:"8px 14px",background:"#FFEBEE",borderTop:`1px solid ${C.red}`,fontSize:12,color:C.red,fontWeight:700,flexShrink:0 }}>{sendErr}</div>}

      {isClosed ? (
        <div style={{ padding:"14px",background:"#fff",borderTop:`1px solid ${C.border}`,textAlign:"center",flexShrink:0 }}>
          <button onClick={toggleClose} style={{ padding:"10px 24px",background:C.blue,color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer" }}>Reopen Chat</button>
        </div>
      ) : (
        <div style={{ padding:"8px 12px 10px",background:"#fff",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={async e=>{ const f=e.target.files?.[0]; if(f) setImgB64(await compressImg(f)); }} />
          <button onClick={()=>fileRef.current?.click()} style={{ width:40,height:40,borderRadius:10,border:`1px solid ${C.border}`,background:"#f5f5f5",fontSize:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center" }}>&#128247;</button>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
            placeholder="Type reply... (Enter to send)" rows={2}
            style={{ flex:1,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:"'Barlow',sans-serif",resize:"none",outline:"none",lineHeight:1.4 }}
            onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border} />
          <button onClick={send} disabled={sending||(!input.trim()&&!imgB64)}
            style={{ width:42,height:42,borderRadius:10,border:"none",background:sending||(!input.trim()&&!imgB64)?"#ccc":C.blue,color:"#fff",fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
            {sending?"...":">"}
          </button>
        </div>
      )}
    </div>
  );
}

function SupportInboxTab({ session, embedded = false }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openThread, setOpenThread] = useState(null);
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const load = async () => {
    const data = await chatGetAll();
    setThreads(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 6000);
    return () => clearInterval(pollRef.current);
  }, []);

  const openModal = (t) => {
    clearInterval(pollRef.current);
    if (!t.read) { chatMarkRead(t.from_uid); setThreads(prev=>prev.map(x=>x.from_uid===t.from_uid?{...x,read:true}:x)); }
    setOpenThread(t);
  };

  const closeModal = () => {
    setOpenThread(null);
    load();
    pollRef.current = setInterval(load, 6000);
  };

  const handleUpdate = (fresh) => {
    setOpenThread(fresh);
    setThreads(prev=>prev.map(x=>x.from_uid===fresh.from_uid?fresh:x));
  };

  const unread = threads.filter(t=>!t.read).length;
  const filtered = threads.filter(t=>{
    if(filter==="unread") return !t.read;
    if(filter==="open") return !t.closed;
    if(filter==="closed") return t.closed;
    return true;
  });

  const body = (
    <div style={{ padding: embedded?"0":"0 16px 40px" }}>
      <div style={{ display:"flex",gap:6,flexWrap:"wrap",padding:embedded?"10px 0":"14px 0 10px" }}>
        {[["all","All",threads.length],["unread","Unread",unread],["open","Open",threads.filter(t=>!t.closed).length],["closed","Closed",threads.filter(t=>t.closed).length]].map(([v,l,c])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{ padding:"5px 12px",borderRadius:20,border:`1.5px solid ${filter===v?"#243B6E":C.border}`,background:filter===v?"#243B6E":"#fff",color:filter===v?"#fff":C.textMed,fontWeight:700,fontSize:12,cursor:"pointer" }}>
            {l} ({c})
          </button>
        ))}
        <button onClick={load} style={{ marginLeft:"auto",padding:"5px 10px",borderRadius:20,border:`1.5px solid ${C.border}`,background:"#fff",fontSize:14,cursor:"pointer" }}>&#8635;</button>
      </div>
      {loading && <div style={{ textAlign:"center",padding:40,color:C.textLight }}>Loading...</div>}
      {!loading && filtered.length===0 && (
        <div className="slt-card" style={{ textAlign:"center",padding:40 }}>
          <div style={{ fontSize:14,fontWeight:700 }}>{filter==="all"?"No conversations yet":"No " + filter + " conversations"}</div>
        </div>
      )}
      {filtered.map(t=>{
        const last=t.msgs?.[t.msgs.length-1];
        return (
          <div key={t.from_uid} onClick={()=>openModal(t)} className="slt-card"
            style={{ marginBottom:10,borderLeft:`4px solid ${!t.read?C.blue:t.closed?"#888":C.orange}`,cursor:"pointer",padding:"12px 14px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:40,height:40,borderRadius:"50%",background:!t.read?C.blue:t.closed?"#888":C.orange,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0 }}>
                {(t.from_name||"?")[0].toUpperCase()}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14 }}>{t.from_name||"Unknown"}</span>
                  {!t.read&&<span style={{ background:C.blue,color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800 }}>NEW</span>}
                  {t.closed&&<span style={{ background:"#888",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800 }}>CLOSED</span>}
                  <span style={{ background:"#f0f0f0",color:C.textMed,borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700 }}>{t.msgs?.length||0} msgs</span>
                </div>
                {t.from_email&&<div style={{ fontSize:11,color:C.textMed,marginBottom:1 }}>{t.from_email}</div>}
                <div style={{ fontSize:12,color:C.textLight,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                  {last?.image?"Photo":last?.text?.slice(0,80)||"No messages"}
                </div>
              </div>
              <div style={{ fontSize:11,color:C.textLight,flexShrink:0,textAlign:"right" }}>
                <div>{t.created_at?.slice(0,10)}</div>
                <div style={{ fontSize:16,marginTop:4 }}>&#9658;</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if(embedded) return (
    <>{body}{openThread&&<MessageDetailModal thread={openThread} onClose={closeModal} onThreadUpdate={handleUpdate} session={session}/>}</>
  );
  return (
    <div className="slt-page">
      <div className="slt-hero" style={{ background:"linear-gradient(135deg,#243B6E,#0D47A1)" }}>
        <div className="slt-hero-title">Support Inbox</div>
        <div className="slt-hero-sub">{threads.length} conversations · {unread} unread</div>
      </div>
      <div className="slt-container">{body}</div>
      {openThread&&<MessageDetailModal thread={openThread} onClose={closeModal} onThreadUpdate={handleUpdate} session={session}/>}
    </div>
  );
}

function ContactUsTab({ session, onBack }) {
  const [thread, setThread] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const msgsLen = useRef(0);

  const loadThread = async () => {
    if(!session?.uid) return;
    const t = await chatGetThread(session.uid);
    setThread(t);
    msgsLen.current = t?.msgs?.length||0;
    setLoading(false);
  };

  useEffect(()=>{
    loadThread();
    pollRef.current = setInterval(async()=>{
      if(!session?.uid) return;
      const t = await chatGetThread(session.uid);
      if(t && t.msgs.length!==msgsLen.current){
        msgsLen.current=t.msgs.length;
        setThread(t);
      }
    },5000);
    return ()=>clearInterval(pollRef.current);
  },[session?.uid]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[thread?.msgs?.length]);

  const compressImg=(file)=>new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const c=document.createElement("canvas");
        let[w,h]=[img.width,img.height];
        if(w>800){h=h*800/w;w=800;}
        c.width=w;c.height=h;
        c.getContext("2d").drawImage(img,0,0,w,h);
        res(c.toDataURL("image/jpeg",0.65));
      };
      img.src=e.target.result;
    };
    r.readAsDataURL(file);
  });

  const send=async()=>{
    if((!input.trim()&&!imgB64)||sending) return;
    if(thread?.closed){setSendErr("Chat is closed. Start a new conversation.");return;}
    setSending(true);setSendErr(null);
    const msg={id:Date.now().toString(),from:"user",text:input.trim(),image:imgB64||null,time:new Date().toISOString()};
    const err=await chatSendMsg(session.uid,session.fullName||session.name||"User",session.email||"",msg);
    if(err){setSendErr("Could not send.");setSending(false);return;}
    const userText = input.trim();
    setInput("");setImgB64(null);
    // AI auto-responds first if it's a text message
    if(userText && !imgB64) {
      try {
        const aiSystem = `You are TruckPilot Support AI — a helpful assistant for TruckPilot, a Canadian trucking app.
Answer support questions clearly and briefly (2-3 sentences max). 
If the issue requires human help (billing, account deletion, bugs, payment), end with: "If you need further help, a human agent will follow up shortly."
Common topics: logging loads, fleet management, pay calculation, IFTA taxes, expenses, documents, app navigation.
User: ${session.fullName||session.name}, Role: ${session.role}.`;
        const aiReply = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: aiSystem, message: userText, maxTokens: 200 })
        });
        const aiData = await aiReply.json();
        if (aiData.text && !aiData.error) {
          const aiMsg = {id: Date.now().toString()+"ai", from:"admin", text:"🤖 TruckPilot AI: " + aiData.text, time: new Date().toISOString()};
          await chatSendMsg(session.uid, session.fullName||session.name||"User", session.email||"", aiMsg, true);
          loadThread();
        }
      } catch(e) { /* AI failed silently, human will respond */ }
    }
    await loadThread();
    setSending(false);
    setTimeout(()=>inputRef.current?.focus(),80);
  };

  const endChat=async()=>{
    if(!window.confirm("End this conversation?")) return;
    await chatSetClosed(session.uid,true);
    await loadThread();
  };

  const newChat=async()=>{
    // Just reopen — never delete history, all messages stay for reference
    await chatSetClosed(session.uid,false);
    await loadThread();
    setTimeout(()=>inputRef.current?.focus(),150);
  };

  const msgs=thread?.msgs||[];
  const isClosed=thread?.closed;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 60px)",background:"#F0F4F8"}}>
      <div style={{background:"linear-gradient(135deg,#0A1628,#112240)",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,color:"#fff",fontSize:18,cursor:"pointer",padding:"4px 10px",fontWeight:700,flexShrink:0}}>←</button>
        <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#243B6E,#243B6E)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>&#128665;</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:"#fff"}}>TruckPilot Support</div>
          <div style={{fontSize:11,color:isClosed?"#FF8A65":"#243B6E",fontWeight:600}}>{isClosed?"Chat ended":"Online · Avg reply < 3 min"}</div>
        </div>
        <a href={"tel:"+COMPANY_PHONE.replace(/-/g,"")} style={{textDecoration:"none"}}>
          <button style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,color:"#fff",fontSize:12,cursor:"pointer",padding:"6px 10px",fontWeight:700}}>Call</button>
        </a>
        <a href={"https://wa.me/"+WHATSAPP_NUMBER} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
          <button style={{background:"#25D366",border:"none",borderRadius:8,color:"#fff",fontSize:12,cursor:"pointer",padding:"6px 10px",fontWeight:700}}>WhatsApp</button>
        </a>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 12px",display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",justifyContent:"flex-start",alignItems:"flex-end",gap:6}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#243B6E,#243B6E)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>&#128665;</div>
          <div style={{maxWidth:"78%",background:"#fff",borderRadius:"14px 14px 14px 4px",padding:"9px 13px",fontSize:13,color:C.textDark,boxShadow:"0 1px 3px rgba(0,0,0,0.1)"}}>
            Hello <strong>{session.fullName||session.name||"there"}</strong>, welcome to TruckPilot Support. We are recording this conversation for future reference and training purposes.
          </div>
        </div>
        {loading&&<div style={{textAlign:"center",padding:20,color:C.textLight}}>Loading...</div>}
        {msgs.map((m,i)=>{
          // From user perspective: user = right (outgoing/mine), admin = left (incoming)
          const isMine = m.from === "user";
          const senderName = isMine ? (session.fullName||session.name||"You") : "Customer Support";
          const senderColor = isMine ? C.blue : "#243B6E";
          return(
            <div key={m.id||i} style={{display:"flex", justifyContent:isMine?"flex-end":"flex-start", alignItems:"flex-end", gap:8, marginBottom:4}}>
              {/* Left avatar — admin messages */}
              {!isMine && (
                <div style={{width:32,height:32,borderRadius:"50%",background:senderColor,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0}}>A</div>
              )}
              <div style={{maxWidth:"72%"}}>
                <div style={{fontSize:11,fontWeight:800,color:senderColor,marginBottom:3,textAlign:isMine?"right":"left"}}>{senderName}</div>
                {m.image&&<img src={m.image} alt="" onClick={()=>window.open(m.image,"_blank")} style={{maxWidth:"100%",borderRadius:12,marginBottom:m.text?4:0,display:"block",cursor:"pointer"}}/>}
                {m.text&&(
                  <div style={{background:isMine?"linear-gradient(135deg,#243B6E,#243B6E)":"linear-gradient(135deg,#243B6E,#2D4A8A)", color:"#fff", borderRadius:isMine?"18px 18px 4px 18px":"18px 18px 18px 4px", padding:"10px 14px", fontSize:13, lineHeight:1.5, boxShadow:"0 1px 4px rgba(0,0,0,0.12)"}}>
                    {m.text}
                  </div>
                )}
                <div style={{fontSize:10,color:C.textLight,marginTop:3,textAlign:isMine?"right":"left"}}>{new Date(m.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              {/* Right avatar — user messages */}
              {isMine && (
                <div style={{width:32,height:32,borderRadius:"50%",background:senderColor,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0}}>
                  {senderName[0].toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
        {isClosed&&<div style={{textAlign:"center",padding:"8px 14px",background:"rgba(0,0,0,0.05)",borderRadius:12,fontSize:11,color:C.textLight,fontWeight:600,margin:"4px 0"}}>— Conversation paused · tap Continue to resume —</div>}
        <div ref={bottomRef}/>
      </div>

      {imgB64&&(
        <div style={{padding:"6px 12px",background:"#fff",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <img src={imgB64} alt="" style={{height:48,borderRadius:6,border:`1px solid ${C.border}`}}/>
          <button onClick={()=>setImgB64(null)} style={{color:C.red,background:"none",border:"none",cursor:"pointer",fontWeight:700}}>Remove</button>
        </div>
      )}
      {sendErr&&<div style={{padding:"6px 12px",background:"#FFEBEE",borderTop:`1px solid ${C.red}`,fontSize:12,color:C.red,fontWeight:700,flexShrink:0}}>{sendErr}</div>}

      {isClosed?(
        <div style={{padding:"14px",background:"#fff",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
          <button onClick={newChat} style={{width:"100%",padding:"12px",background:C.blue,color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:14,cursor:"pointer"}}>Continue Conversation</button>
        </div>
      ):(
        <div style={{flexShrink:0}}>
          <div style={{padding:"2px 12px 0",background:"#fff",display:"flex",justifyContent:"flex-end"}}>
            <button onClick={endChat} style={{background:"none",border:"none",color:C.textLight,fontSize:11,fontWeight:700,cursor:"pointer",padding:"4px 0"}}>End Conversation</button>
          </div>
          <div style={{padding:"6px 12px 10px",background:"#fff",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end"}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(f)setImgB64(await compressImg(f));}}/>
            <button onClick={()=>fileRef.current?.click()} style={{width:40,height:40,borderRadius:10,border:`1px solid ${C.border}`,background:"#f5f5f5",fontSize:18,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>&#128247;</button>
            <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder="Type a message... (Enter to send)" rows={2}
              style={{flex:1,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${C.border}`,fontSize:14,fontFamily:"'Barlow',sans-serif",resize:"none",outline:"none",lineHeight:1.4}}
              onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
            <button onClick={send} disabled={sending||(!input.trim()&&!imgB64)}
              style={{width:42,height:42,borderRadius:10,border:"none",background:sending||(!input.trim()&&!imgB64)?"#ccc":"linear-gradient(135deg,#243B6E,#243B6E)",color:"#fff",fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {sending?"...":">"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SLTLogo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Smartphone — bright cyan/white */}
      <rect x="44" y="10" width="28" height="44" rx="5" fill="#00E5FF" opacity="0.15" stroke="#00E5FF" strokeWidth="2"/>
      <rect x="47" y="15" width="22" height="30" rx="2.5" fill="#243B6E"/>
      {/* Phone screen glow */}
      <rect x="50" y="18" width="14" height="2" rx="1" fill="#fff" opacity="0.9"/>
      <rect x="50" y="22" width="16" height="1.5" rx="1" fill="#fff" opacity="0.6"/>
      <rect x="50" y="26" width="11" height="1.5" rx="1" fill="#fff" opacity="0.5"/>
      <rect x="50" y="30" width="13" height="1.5" rx="1" fill="#fff" opacity="0.4"/>
      {/* Phone home button */}
      <circle cx="58" cy="50" r="2.5" fill="#00E5FF" opacity="0.9"/>
      {/* Truck body — bright orange/yellow */}
      <rect x="4" y="34" width="32" height="22" rx="4" fill="#243B6E"/>
      {/* Truck cab */}
      <path d="M26 34 L36 34 L36 46 Q36 50 32 50 L26 50 Z" fill="#FFD600"/>
      {/* Windshield */}
      <rect x="27.5" y="36.5" width="7" height="6" rx="1.5" fill="#1A1A1A" opacity="0.8"/>
      {/* Truck wheels */}
      <circle cx="13" cy="57" r="5.5" fill="#1A237E" stroke="#FFD600" strokeWidth="2"/>
      <circle cx="13" cy="57" r="2.2" fill="#FFD600"/>
      <circle cx="29" cy="57" r="5.5" fill="#1A237E" stroke="#FFD600" strokeWidth="2"/>
      <circle cx="29" cy="57" r="2.2" fill="#FFD600"/>
      {/* Speed lines */}
      <line x1="1" y1="40" x2="9" y2="40" stroke="#FFD600" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
      <line x1="1" y1="45" x2="7" y2="45" stroke="#243B6E" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      <line x1="1" y1="50" x2="5" y2="50" stroke="#FFD600" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      {/* WiFi/signal arc — truck to phone */}
      <path d="M37 28 Q32 18 24 26" stroke="#00E5FF" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9" strokeDasharray="3 2"/>
      <path d="M37 33 Q28 20 20 30" stroke="#00E5FF" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" strokeDasharray="2 2"/>
      <circle cx="37" cy="28" r="2" fill="#00E5FF"/>
    </svg>
  );
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  navy:      "#1A1A1A",
  navyMid:   "#222222",
  blue:      "#243B6E",
  blueBright:"#2D4A8A",
  blueLight: "#FFF3EB",
  teal:      "#243B6E",
  white:     "#FFFFFF",
  offWhite:  "#F5F5F0",
  border:    "#EEEEEE",
  textDark:  "#1A1A1A",
  textMed:   "#555555",
  textLight: "#999999",
  green:     "#4CAF50",
  red:       "#E53935",
  orange:    "#243B6E",
  purple:    "#243B6E",
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalCSS = ({ darkMode }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Barlow:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    *, *::before, *::after { box-sizing: border-box; }
    html {
      margin: 0; padding: 0;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
      touch-action: manipulation;
    }
    body {
      margin: 0; padding: 0;
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
      font-family: 'Barlow', sans-serif;
      background: ${darkMode ? "#0f1a2e" : "#F5F5F0"};
      color: ${darkMode ? "#F0EDE8" : C.textDark};
      position: relative;
      -webkit-overflow-scrolling: touch;
    }
    /* Dark mode overrides */
    ${darkMode ? `
      .slt-page { background: #0f1a2e !important; }
      .slt-card { background: #1a2744 !important; border-color: rgba(255,255,255,0.08) !important; color: #F0EDE8 !important; }
      .slt-card-sm { background: #1a2744 !important; border-color: rgba(255,255,255,0.08) !important; }
      .slt-container { background: #0f1a2e !important; }
      .slt-hero { background: linear-gradient(135deg, #0a1628, #1a2744) !important; }
      .slt-input { background: #1a2744 !important; border-color: rgba(255,255,255,0.15) !important; color: #F0EDE8 !important; }
      .slt-label { color: rgba(240,237,232,0.6) !important; }
      .slt-nav { background: #0a1628 !important; border-color: rgba(255,255,255,0.08) !important; }
      .slt-bottom-bar { background: #0a1628 !important; border-color: rgba(255,255,255,0.08) !important; }
      .slt-btn-ghost { background: rgba(255,255,255,0.08) !important; color: #F0EDE8 !important; border-color: rgba(255,255,255,0.15) !important; }
      .slt-auth-bg { background: linear-gradient(160deg, #0a1628, #0f1a2e, #1a2744) !important; }
    ` : ""}
    #root {
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
      position: relative;
    }

    /* NAV */
    .slt-nav {
      background: ${C.navy};
      height: 56px;
      display: flex;
      align-items: center;
      padding: 0 24px;
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      z-index: 200;
      box-shadow: 0 2px 20px rgba(0,0,0,0.35);
      gap: 16px;
      box-sizing: border-box;
    }

    /* ── BOTTOM TAB BAR ── */
    .modal-open { overflow: hidden !important; }
    /* Desktop nav visible only on desktop */
    .slt-desktop-nav { display: flex !important; }
    /* Hide bottom tab bar on desktop */
    @media (min-width: 768px) {
      .slt-bottom-nav { display: none !important; }
    }
    /* Hide desktop nav on mobile */
    @media (max-width: 767px) {
      .slt-desktop-nav { display: none !important; }
    }
    .slt-bottom-nav {
      display: none;
    }
    @media (max-width: 640px) {
      .slt-bottom-nav {
        display: flex;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        background: ${C.navy};
        border-top: 1px solid rgba(255,255,255,0.1);
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
        box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
      }
      .slt-bottom-tab {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 4px 2px;
        cursor: pointer;
        background: none;
        border: none;
        position: relative;
      }
      .slt-bottom-tab-icon {
        font-size: 22px;
        line-height: 1;
        transition: transform 0.2s;
      }
      .slt-bottom-tab.active .slt-bottom-tab-icon {
        transform: scale(1.15);
      }
      .slt-bottom-tab-label {
        font-size: 10px;
        font-weight: 700;
        font-family: 'Barlow', sans-serif;
        color: rgba(255,255,255,0.45);
        transition: color 0.2s;
      }
      .slt-bottom-tab.active .slt-bottom-tab-label {
        color: #243B6E;
      }
      .slt-bottom-tab-badge {
        position: absolute;
        top: 0;
        right: calc(50% - 18px);
        background: #E53935;
        color: #fff;
        border-radius: 10px;
        font-size: 9px;
        font-weight: 800;
        padding: 1px 5px;
        min-width: 16px;
        text-align: center;
      }
      /* Push content above bottom nav */
      .slt-page {
        padding-bottom: 80px !important;
      }
    }

    /* ── SKELETON LOADER ── */
    .slt-skeleton {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: slt-shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes slt-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* ── PAGE TRANSITIONS ── */
    .slt-page-enter {
      animation: slt-fade-in 0.25s ease;
    }
    @keyframes slt-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── SWIPE LOAD CARD ── */
    .slt-swipeable {
      position: relative;
      overflow: hidden;
      touch-action: pan-y;
    }
    .slt-swipe-hint {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 80px;
      background: linear-gradient(135deg, #43A047, #2E7D32);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 24px;
      border-radius: 0 12px 12px 0;
      transform: translateX(100%);
      transition: transform 0.3s;
    }



    /* ── DARK MODE ── */
    body.slt-dark {
      background: #0A0E1A !important;
    }
    body.slt-dark .slt-card,
    body.slt-dark .slt-auth-card {
      background: #141824 !important;
      border-color: rgba(255,255,255,0.08) !important;
      color: #E8EAF0 !important;
    }
    body.slt-dark .slt-page {
      background: #0A0E1A !important;
    }
    body.slt-dark .slt-input {
      background: #1E2336 !important;
      border-color: rgba(255,255,255,0.1) !important;
      color: #E8EAF0 !important;
    }
    body.slt-dark .slt-load-card {
      background: #141824 !important;
      border-color: rgba(255,255,255,0.06) !important;
    }
    body.slt-dark .slt-bottom-nav {
      background: #0D1220 !important;
      border-top-color: rgba(255,255,255,0.08) !important;
    }
    body.slt-dark select option {
      background: #1E2336;
      color: #E8EAF0;
    }


    @keyframes slt-star-twinkle {
      0%, 100% { opacity: 0.2; transform: scale(0.8); }
      50%       { opacity: 1;   transform: scale(1.2); }
    }
    @keyframes slt-dot-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40%           { transform: scale(1);   opacity: 1;   }
    }
    /* ── ANIMATED GRADIENT HERO ── */
    .slt-hero {
      background: linear-gradient(135deg, #0A1628, #0D47A1, #243B6E, #0A1628);
      background-size: 400% 400%;
      animation: slt-hero-shift 8s ease infinite;
    }
    @keyframes slt-hero-shift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    /* ── GLOWING NUMBERS ── */
    .slt-glow-green {
      color: #69F0AE;
      text-shadow: 0 0 20px rgba(105,240,174,0.6), 0 0 40px rgba(105,240,174,0.3);
    }
    .slt-glow-blue {
      color: #40C4FF;
      text-shadow: 0 0 20px rgba(64,196,255,0.6), 0 0 40px rgba(64,196,255,0.3);
    }

    /* ── GRADIENT STAT CARDS ── */
    .slt-stat-card {
      border-radius: 16px;
      padding: 18px 16px;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .slt-stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
    .slt-stat-card::before {
      content: '';
      position: absolute;
      top: -30%;
      right: -10%;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
    }
    .slt-stat-card::after {
      content: '';
      position: absolute;
      bottom: -20%;
      left: -5%;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(255,255,255,0.05);
    }

    /* ── CONFETTI ── */
    .slt-confetti-piece {
      position: fixed;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      animation: slt-confetti-fall 1.2s ease-out forwards;
      z-index: 99999;
      pointer-events: none;
    }
    @keyframes slt-confetti-fall {
      0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }

    /* ── BUTTON RIPPLE ── */
    .slt-ripple {
      position: relative;
      overflow: hidden;
    }
    .slt-ripple::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      width: 100px;
      height: 100px;
      margin-top: -50px;
      margin-left: -50px;
      top: 50%;
      left: 50%;
      animation: slt-ripple-anim 0.6s linear;
      opacity: 0;
    }
    @keyframes slt-ripple-anim {
      0%   { transform: scale(0); opacity: 0.5; }
      100% { transform: scale(4); opacity: 0; }
    }

    /* ── CARD SLIDE IN ── */
    .slt-slide-in {
      animation: slt-slide-up 0.3s ease both;
    }
    @keyframes slt-slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .slt-slide-in:nth-child(1) { animation-delay: 0.05s; }
    .slt-slide-in:nth-child(2) { animation-delay: 0.1s; }
    .slt-slide-in:nth-child(3) { animation-delay: 0.15s; }
    .slt-slide-in:nth-child(4) { animation-delay: 0.2s; }
    .slt-slide-in:nth-child(5) { animation-delay: 0.25s; }

    /* ── PULSE LOG LOAD BUTTON ── */
    .slt-pulse-btn {
      animation: slt-pulse-btn 2.5s infinite;
    }
    @keyframes slt-pulse-btn {
      0%, 100% { box-shadow: 0 4px 20px rgba(0,188,212,0.5); }
      50%       { box-shadow: 0 4px 32px rgba(0,188,212,0.85), 0 0 0 8px rgba(0,188,212,0.15); }
    }

    /* ── GLASSMORPHISM CARD ── */
    .slt-glass {
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 16px;
    }

    /* ── COUNT UP NUMBER ── */
    .slt-countup {
      font-variant-numeric: tabular-nums;
      transition: all 0.05s;
    }
    /* Safe area spacer sits above the nav on notched iPhones */
    .slt-nav-safe {
      background: ${C.navy};
      height: env(safe-area-inset-top, 0px);
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      z-index: 201;
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
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.3px;
    }
    .slt-brand-sub {
      font-family: 'Barlow', sans-serif;
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
      font-family: 'Barlow', sans-serif;
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
    @media (max-width: 600px) {
      .slt-msg-grid { grid-template-columns: 1fr !important; }
    }
    .truckpilot-chat-fab {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 8888;
      display: flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, #6A0DAD, #9C27B0, #E040FB);
      color: #fff;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50px;
      padding: 13px 22px 13px 16px;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(156,39,176,0.7), 0 0 0 0 rgba(156,39,176,0.4), 0 0 40px rgba(224,64,251,0.3);
      animation: truckpilot-pulse 2.2s infinite;
      font-family: 'Barlow', sans-serif;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.2px;
      transition: box-shadow 0.15s;
      text-decoration: none;
      white-space: nowrap;
    }
    .truckpilot-chat-fab:hover {
      box-shadow: 0 6px 32px rgba(156,39,176,0.9), 0 0 60px rgba(224,64,251,0.5);
    }
    .truckpilot-chat-fab:active { transform: translateX(-50%) scale(0.97); }
    .truckpilot-chat-fab .fab-icon {
      width: 30px; height: 30px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .truckpilot-chat-fab .fab-dot {
      width: 9px; height: 9px;
      background: #69F0AE;
      border-radius: 50%;
      position: absolute;
      top: 8px; right: 12px;
      border: 2px solid #fff;
      animation: truckpilot-blink 1.4s infinite;
    }
    .truckpilot-chat-fab .fab-label { line-height: 1.2; }
    .truckpilot-chat-fab .fab-sub { font-size: 10px; font-weight: 600; opacity: 0.85; display: block; }
    @keyframes truckpilot-pulse {
      0%   { box-shadow: 0 4px 24px rgba(156,39,176,0.7), 0 0 0 0 rgba(156,39,176,0.4); }
      60%  { box-shadow: 0 4px 24px rgba(156,39,176,0.7), 0 0 0 16px rgba(156,39,176,0); }
      100% { box-shadow: 0 4px 24px rgba(156,39,176,0.7), 0 0 0 0 rgba(156,39,176,0); }
    }
    @keyframes truckpilot-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @media (max-width: 480px) {
      .truckpilot-chat-fab { bottom: 12px; font-size: 13px; padding: 11px 18px 11px 13px; }
      .truckpilot-chat-fab .fab-icon { width: 26px; height: 26px; font-size: 14px; }
    }
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
      font-family: 'Barlow', sans-serif;
    }

    /* DROPDOWN PANEL */
    .slt-dropdown-overlay {
      position: fixed;
      inset: 0;
      z-index: 290;
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
      z-index: 300;
    }
    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-10px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .slt-dropdown-header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-family: 'Barlow Condensed', sans-serif;
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
      font-family: 'Barlow', sans-serif;
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
      display: none;
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
      font-family: 'Barlow Condensed', sans-serif;
      flex-shrink: 0;
    }
    .slt-user-name { font-size: 13px; font-weight: 700; color: #fff; font-family: 'Barlow', sans-serif; }
    .slt-user-role { font-size: 10px; color: ${C.textLight}; font-family: 'Barlow', sans-serif; }
    .slt-settings-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 7px 12px;
      color: rgba(255,255,255,0.75);
      font-size: 13px;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
      font-weight: 600;
      transition: all 0.15s;
    }
    .slt-settings-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .slt-logout-btn {
      display: none;
      background: rgba(229,57,53,0.12);
      border: 1px solid rgba(229,57,53,0.3);
      border-radius: 8px;
      padding: 7px 12px;
      color: #ff8a80;
      font-size: 13px;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
      font-weight: 700;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .slt-logout-btn:hover { background: rgba(229,57,53,0.22); }
    .slt-logout-icon { display: none; }
    @media (max-width: 640px) {
      .slt-logout-text { display: none; }
      .slt-logout-icon { display: inline; font-size: 16px; }
      .slt-logout-btn { padding: 8px 10px; }
    }

    /* PAGE SHELLS */
    .slt-page { min-height: 100vh; background: #F5F5F0; }
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
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 30px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
      position: relative;
    }
    .slt-hero-sub { font-size: 15px; color: rgba(255,255,255,0.72); position: relative; }
    .slt-page { min-height: 100vh; background: #F5F5F0; width: 100%; overflow-x: hidden; }
    .slt-container { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; width: 100%; }
    .slt-container-sm { max-width: 600px; margin: 0 auto; padding: 32px 20px 64px; width: 100%; }

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
      padding: 13px 16px;
      border: 1.5px solid ${C.border};
      border-radius: 12px;
      font-size: 15px;
      color: ${C.textDark};
      background: ${C.white};
      outline: none;
      font-family: 'Barlow', sans-serif;
      transition: border-color 0.2s, box-shadow 0.2s;
      min-height: 48px;
      box-sizing: border-box;
    }
    .slt-input:focus { border-color: ${C.blue}; box-shadow: 0 0 0 3px ${C.blue}18; }

    /* BUTTONS */
    .slt-btn-primary {
      background: linear-gradient(135deg, ${C.blue}, ${C.teal});
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 14px 24px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
      transition: all 0.2s;
      letter-spacing: 0.2px;
      min-height: 48px;
    }
    .slt-btn-primary:hover { opacity: 0.92; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(30,136,229,0.4); }
    .slt-btn-secondary {
      background: ${C.white};
      color: ${C.blue};
      border: 1.5px solid ${C.blue};
      border-radius: 12px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
      transition: all 0.18s;
      min-height: 44px;
    }
    .slt-btn-secondary:hover { background: ${C.blueLight}; }
    .slt-btn-danger {
      background: ${C.white};
      color: ${C.red};
      border: 1.5px solid ${C.red};
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
      min-height: 44px;
    }
    .slt-btn-ghost {
      background: transparent;
      color: ${C.textMed};
      border: 1.5px solid ${C.border};
      border-radius: 9px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
      font-family: 'Barlow', sans-serif;
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
      font-family: 'Barlow', sans-serif;
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
      font-family: 'Barlow', sans-serif;
    }

    /* LABEL */
    .slt-label { display: block; font-size: 12.5px; font-weight: 700; color: ${C.textMed}; margin-bottom: 5px; font-family: 'Barlow', sans-serif; letter-spacing: 0.2px; }

    /* BADGES */
    .slt-badge-green  { display:inline-block; background:${C.green}18;  color:${C.green};  border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Barlow',sans-serif; }
    .slt-badge-orange { display:inline-block; background:${C.orange}18; color:${C.orange}; border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Barlow',sans-serif; }
    .slt-badge-blue   { display:inline-block; background:${C.blue}18;   color:${C.blue};   border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Barlow',sans-serif; }
    .slt-badge-red    { display:inline-block; background:${C.red}18;    color:${C.red};    border-radius:20px; padding:3px 11px; font-size:11.5px; font-weight:700; font-family:'Barlow',sans-serif; }

    /* DIVIDER */
    .slt-divider { border: none; border-top: 1px solid ${C.border}; margin: 18px 0; }

    /* SECTION TITLE */
    .slt-section-title { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 800; color: ${C.textDark}; margin-bottom: 4px; }
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
    .slt-bubble-other { background: #F5F5F0; color: ${C.textDark}; border: 1px solid ${C.border}; border-radius: 14px 14px 14px 4px; padding: 10px 14px; font-size: 13px; line-height: 1.5; }

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
      font-family: 'Barlow', sans-serif;
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
      .slt-nav { height: 52px; padding: 0 12px; gap: 8px; width: 100%; }
      .slt-brand { display: flex; }
      .slt-brand-main { font-size: 13px; }
      .slt-logo-area { gap: 7px; }
      .slt-menu-trigger { padding: 7px 10px; font-size: 13px; gap: 4px; }
      .slt-menu-label { display: none; }
      .slt-menu-chevron { display: none; }
      .slt-active-pilot { display: none; }
      .slt-active-pill { display: none; }
      .slt-user-name, .slt-user-role { display: none; }
      .slt-user-chip { display: none !important; }
      .slt-container, .slt-container-sm { padding: 16px 12px 80px; max-width: 100%; }
      .slt-card { padding: 14px; }
      .slt-card-sm { padding: 12px 10px; }
      .slt-hero { padding: 20px 16px 22px; }
      .slt-hero-title { font-size: 20px; }
      .slt-hero-sub { font-size: 13px; }
      .slt-dropdown {
        position: fixed;
        top: calc(52px + env(safe-area-inset-top, 0px));
        left: 0;
        right: 0;
        width: 100%;
        border-radius: 0 0 16px 16px;
        max-height: calc(100dvh - 52px - env(safe-area-inset-top, 0px) - 16px);
        overflow-y: scroll;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
        padding-bottom: env(safe-area-inset-bottom, 16px);
      }
      .slt-dropdown-grid { grid-template-columns: 1fr 1fr; }
      .slt-logout-btn { padding: 7px 9px; font-size: 12px; }
    }
  `}</style>
);

// ─── NAV BAR with Dropdown ────────────────────────────────────────────────────
function EditProfileModal({ session, onClose, onSave }) {
  const [name, setName] = useState(session.fullName||session.name||"");
  const [companyName, setCompanyName] = useState(session.companyName||"");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if(!name.trim()) return;
    setSaving(true);
    await sbSaveProfile({ id: session.uid, name: name.trim(), company_name: companyName.trim()||null, role: session.role, owner_uid: session.ownerUid||session.uid, plan: session.plan||"free", invite_code: session.inviteCode||null });
    onSave(name.trim(), companyName.trim()||null);
    setSaving(false);
    onClose();
  };
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:18,padding:28,width:"100%",maxWidth:360,boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,marginBottom:20}}>✏️ Edit Profile</div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:700,color:"#666",display:"block",marginBottom:6}}>Full Name *</label>
          <input value={name} onChange={e=>setName(e.target.value)} className="slt-input" placeholder="Your full name" style={{fontSize:16}}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:700,color:"#666",display:"block",marginBottom:6}}>Company Name</label>
          <input value={companyName} onChange={e=>setCompanyName(e.target.value)} className="slt-input" placeholder="e.g. ABC Trucking Ltd." style={{fontSize:16}}/>
          <div style={{fontSize:11,color:"#aaa",marginTop:4}}>Used on invoices and statements</div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:700,color:"#666",display:"block",marginBottom:6}}>Email</label>
          <div style={{padding:"12px 14px",borderRadius:10,background:"#f5f5f5",fontSize:14,color:"#888"}}>{session.email||session.uid}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:4}}>Email cannot be changed here</div>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,fontWeight:700,color:"#666",display:"block",marginBottom:6}}>Role</label>
          <div style={{padding:"10px 14px",borderRadius:10,background:session.role==="owner"?"#FFF3EB":"#E0F2F1",fontSize:13,fontWeight:800,color:session.role==="owner"?"#243B6E":"#00695C"}}>{session.role==="owner"?"⭐ Owner":"🚛 Driver"}</div>
        </div>
        {/* Join / Leave Fleet for drivers */}
        {session.role === "driver" && (
          <div style={{marginBottom:20, padding:"14px", borderRadius:12, border:`1.5px solid ${C.border}`, background:"#F5F5F0"}}>
            <div style={{fontWeight:800, fontSize:13, marginBottom:8}}>
              {session.ownerUid && session.ownerUid !== session.uid ? "🚛 Fleet Status" : "🔗 Join a Fleet"}
            </div>
            {session.ownerUid && session.ownerUid !== session.uid ? (
              <div>
                <div style={{fontSize:13, color:C.textMed, marginBottom:10}}>You are connected to a fleet.</div>
                <button onClick={async()=>{ if(!window.confirm("Leave this fleet? You will become a solo driver.")) return; await sbLeaveFleet(session.uid); alert("You have left the fleet."); onClose(); }}
                  style={{width:"100%", padding:"10px", borderRadius:9, border:`1.5px solid ${C.red}`, background:"#fff", color:C.red, fontWeight:800, fontSize:13, cursor:"pointer"}}>
                  Leave Fleet
                </button>
              </div>
            ) : (
              <JoinFleetForm session={session} onClose={onClose} />
            )}
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",borderRadius:10,border:"1.5px solid #ddd",background:"#fff",fontWeight:700,cursor:"pointer"}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"#243B6E",color:"#fff",fontWeight:800,cursor:"pointer",fontSize:14}}>{saving?"Saving…":"Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

function JoinFleetForm({ session, onClose }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [myFleets, setMyFleets] = useState([]);

  useEffect(() => {
    sbGetMyFleets(session.uid).then(setMyFleets);
  }, [session.uid]);

  const joinFleet = async () => {
    if (!code.trim()) return;
    setLoading(true); setStatus(null);
    const result = await sbJoinFleet(session.uid, session.fullName||session.name, code.trim().toUpperCase());
    if (result.error) {
      setStatus({ type:"error", msg: "❌ " + result.error });
    } else {
      setStatus({ type:"success", msg: `✅ Joined ${result.ownerName}'s fleet!` });
      setCode("");
      sbGetMyFleets(session.uid).then(setMyFleets);
    }
    setLoading(false);
  };

  return (
    <div>
      {myFleets.length > 0 && (
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12, fontWeight:700, color:C.textMed, marginBottom:6}}>YOUR FLEETS</div>
          {myFleets.map(f => (
            <div key={f.owner_uid} style={{padding:"10px 0", borderBottom:`1px solid ${C.border}`}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                <div>
                  <div style={{fontWeight:700, fontSize:13}}>{f.owner_name}</div>
                  <div style={{fontSize:11, color:C.textLight}}>Joined {f.joined_at?.slice(0,10)}</div>
                </div>
                <button onClick={async()=>{ if(!window.confirm("Leave this fleet?")) return; await sbLeaveFleet(session.uid, f.owner_uid); sbGetMyFleets(session.uid).then(setMyFleets); }}
                  style={{padding:"5px 10px", borderRadius:8, border:`1px solid ${C.red}`, background:"#fff", color:C.red, fontSize:11, fontWeight:700, cursor:"pointer"}}>
                  Leave
                </button>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:4}}>
                <span style={{fontSize:11, color:C.textMed, marginRight:4}}>Rate owner:</span>
                {[1,2,3,4,5].map(star=>(
                  <button key={star} onClick={async()=>{
                    await sb.from("driver_fleets").update({driver_rating:star}).eq("driver_uid",session.uid).eq("owner_uid",f.owner_uid);
                    setMyFleets(prev=>prev.map(x=>x.owner_uid===f.owner_uid?{...x,driverRating:star}:x));
                  }} style={{fontSize:20,background:"none",border:"none",cursor:"pointer",padding:"0 1px",
                    color:(f.driverRating||0)>=star?"#FFD700":"#ddd"}}>★</button>
                ))}
                {f.driverRating && <span style={{fontSize:11, color:C.textMed}}>{f.driverRating}.0</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:12, color:C.textMed, marginBottom:8}}>Enter an owner's invite code to join their fleet instantly.</div>
      <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
        placeholder="6-LETTER CODE"
        style={{width:"100%", padding:"10px 14px", borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:16, fontWeight:800, letterSpacing:6, textAlign:"center", marginBottom:8, boxSizing:"border-box"}} />
      {status && (
        <div style={{padding:"8px 12px", borderRadius:8, background:status.type==="success"?"#E8F5E9":"#FFEBEE", color:status.type==="success"?C.green:C.red, fontSize:12, fontWeight:700, marginBottom:8}}>
          {status.msg}
        </div>
      )}
      <button onClick={joinFleet} disabled={loading || !code.trim()}
        style={{width:"100%", padding:"10px", borderRadius:9, border:"none", background:loading||!code.trim()?"#ccc":C.blue, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer"}}>
        {loading ? "Joining..." : "Join Fleet Instantly"}
      </button>
    </div>
  );
}

// ─── CONFETTI ────────────────────────────────────────────────────────────────
function fireConfetti() {
  const colors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF6FC8","#243B6E"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "slt-confetti-piece";
    el.style.left = Math.random() * 100 + "vw";
    el.style.top = "-10px";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = (Math.random() * 8 + 6) + "px";
    el.style.height = (Math.random() * 8 + 6) + "px";
    el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    el.style.animationDelay = Math.random() * 0.5 + "s";
    el.style.animationDuration = (Math.random() * 0.8 + 0.8) + "s";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

// ─── COUNT UP HOOK ────────────────────────────────────────────────────────────
function useCountUp(target, duration=800) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const end = Number(target) || 0;
    if (start === end) return;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
      setValue(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else { setValue(end); prev.current = end; }
    };
    requestAnimationFrame(tick);
  }, [target]);
  return value;
}

// ─── ANIMATED STAT CARD ───────────────────────────────────────────────────────
function AnimatedStatCard({ label, value, icon, gradient, onClick, delay=0 }) {
  const isNumber = !isNaN(parseFloat(String(value).replace(/[$,]/g,"")));
  const numVal = isNumber ? parseFloat(String(value).replace(/[$,]/g,"")) : 0;
  const counted = useCountUp(numVal, 900);
  const displayValue = isNumber
    ? (String(value).startsWith("$") ? "$" + counted.toFixed(2) : Math.round(counted).toString())
    : value;

  return (
    <div className="slt-stat-card slt-slide-in" onClick={onClick}
      style={{ background:gradient, animationDelay:`${delay}s`, cursor:onClick?"pointer":"default" }}>
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div className="slt-countup" style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:28, color:"#fff", lineHeight:1 }}>
        {displayValue}
      </div>
      <div style={{ position:"absolute", bottom:10, right:14, fontSize:28, opacity:0.2 }}>{icon}</div>
    </div>
  );
}

// ─── WEATHER ALERT BANNER ────────────────────────────────────────────────────
function WeatherAlertBanner() {
  const [weather, setWeather] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=53.5461&longitude=-113.4938&current=weather_code,temperature_2m,wind_speed_10m,wind_gusts_10m,apparent_temperature,visibility,precipitation&timezone=America/Edmonton")
      .then(r=>r.json())
      .then(d=>{
        const code = d.current?.weather_code || 0;
        const temp = Math.round(d.current?.temperature_2m || 0);
        const feelsLike = Math.round(d.current?.apparent_temperature || temp);
        const wind = Math.round(d.current?.wind_speed_10m || 0);
        const gusts = Math.round(d.current?.wind_gusts_10m || 0);
        const visibility = d.current?.visibility || 10000;
        const precip = d.current?.precipitation || 0;
        const emoji = code<=1?"☀️":code<=3?"⛅":code<=48?"🌫️":code<=67?"🌧️":code<=77?"❄️":"⛈️";
        const label = code<=1?"Clear":code<=3?"Cloudy":code<=48?"Foggy":code<=67?"Rainy":code<=77?"Snowy":"Stormy";

        // Determine alert level
        let alert = null;
        if (temp<=-20 || code===66 || code===67) {
          alert = { level:"danger", msg: temp<=-20?`Extreme cold ${temp}°C — black ice risk`:`Freezing rain — dangerous roads`, icon:"🚨" };
        } else if (gusts>=60||code>=71&&code<=77||visibility<=1000||temp<=-10) {
          const msgs = [];
          if (code>=71&&code<=77) msgs.push("Snow");
          if (gusts>=60) msgs.push(`Gusts ${gusts}km/h`);
          if (visibility<=1000) msgs.push("Low visibility");
          if (temp<=-10) msgs.push(`${temp}°C icy roads`);
          alert = { level:"warning", msg: msgs.join(" · "), icon:"⚠️" };
        }

        setWeather({ temp, feelsLike, wind, gusts, emoji, label, alert, precip, visibility });
      }).catch(()=>{});
  }, []);

  if (!weather || dismissed) return null;

  return (
    <div style={{ marginBottom:12 }}>
      {/* Always show current conditions */}
      <div style={{ background:"linear-gradient(135deg,#0D47A1,#243B6E)", borderRadius:14, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:28 }}>{weather.emoji}</span>
          <div>
            <div style={{ fontWeight:800, color:"#fff", fontSize:14 }}>Edmonton, AB · {weather.temp}°C</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)" }}>
              {weather.label} · Feels {weather.feelsLike}°C · Wind {weather.wind}km/h
              {weather.gusts>30?` · Gusts ${weather.gusts}`:""}
            </div>
          </div>
        </div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", fontWeight:700 }}>
          {new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
        </div>
      </div>

      {/* Alert banner if dangerous */}
      {weather.alert && (
        <div style={{ 
          background:weather.alert.level==="danger"?"linear-gradient(135deg,#B71C1C,#C62828)":"linear-gradient(135deg,#243B6E,#F57C00)",
          borderRadius:"0 0 14px 14px", padding:"10px 16px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          marginTop:-4
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:18 }}>{weather.alert.icon}</span>
            <div>
              <div style={{ fontWeight:800, color:"#fff", fontSize:12 }}>
                {weather.alert.level==="danger"?"🚨 HAZARDOUS CONDITIONS":"⚠️ WEATHER ADVISORY"}
              </div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.85)" }}>{weather.alert.msg}</div>
            </div>
          </div>
          <button onClick={()=>setDismissed(true)} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:20, color:"#fff", width:24, height:24, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── DYNAMIC WELCOME SCREEN ──────────────────────────────────────────────────
function WelcomeScreen({ session, loads=[], rates={}, onDone }) {
  const [slide, setSlide] = useState(0);
  const [weather, setWeather] = useState(null);
  const [truckX, setTruckX] = useState(-120);

  const myLoads = loads.filter(l => l.user_id === session.uid || l.addedBy === session.uid || l.addedBy === session.uid);
  const totalPay = myLoads.reduce((s,l)=>s+(Number(l.driverBasePay)>0?Number(l.driverBasePay):Number(l.earnings||0)),0);
  const weekLoads = myLoads.filter(l=>{ const d=new Date(l.date); const now=new Date(); const w=new Date(now); w.setDate(w.getDate()-7); return d>=w; });
  const weekPay = weekLoads.reduce((s,l)=>s+(Number(l.driverBasePay)>0?Number(l.driverBasePay):Number(l.earnings||0)),0);
  const bestDay = (() => {
    const byDay = {};
    myLoads.forEach(l => { const k=l.date; byDay[k]=(byDay[k]||0)+(Number(l.driverBasePay)>0?Number(l.driverBasePay):Number(l.earnings||0)); });
    const best = Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
    return best ? { date: new Date(best[0]+'T12:00:00').toLocaleDateString('en-CA',{weekday:'long',month:'short',day:'numeric'}), amount: best[1] } : null;
  })();
  const yearlyPace = myLoads.length > 0 ? (totalPay / Math.max(1, (new Date()-new Date(myLoads[myLoads.length-1]?.date||new Date())) / (1000*60*60*24))) * 365 : 0;
  const streak = (() => { let c=0; const d=new Date(); while(true){ const ds=d.toISOString().slice(0,10); if(myLoads.some(l=>l.date===ds)){c++;d.setDate(d.getDate()-1);}else break; } return c; })();

  // Time of day sky
  const hour = new Date().getHours();
  const sky = hour >= 5 && hour < 7
    ? { bg:"linear-gradient(180deg,#1a0a2e 0%,#ff6b35 40%,#ffd700 70%,#87ceeb 100%)", stars:false, label:"sunrise", emoji:"🌅" }
    : hour >= 7 && hour < 17
    ? { bg:"linear-gradient(180deg,#0077b6 0%,#00b4d8 40%,#90e0ef 100%)", stars:false, label:"day", emoji:"☀️" }
    : hour >= 17 && hour < 20
    ? { bg:"linear-gradient(180deg,#1a0a2e 0%,#e76f51 35%,#f4a261 60%,#264653 100%)", stars:false, label:"sunset", emoji:"🌇" }
    : { bg:"linear-gradient(180deg,#020818 0%,#0d1b2a 40%,#1b2838 100%)", stars:true, label:"night", emoji:"🌙" };

  // Fetch real weather + alerts for Alberta (Edmonton area)
  useEffect(() => {
    const lat = 53.5461; // Edmonton AB
    const lon = -113.4938;
    Promise.all([
      // Current weather + hourly forecast + wind + precipitation
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,visibility,apparent_temperature&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=America/Edmonton&forecast_days=2`),
    ]).then(([weatherRes]) => Promise.all([weatherRes.json()])).then(([d]) => {
      const code = d.current?.weather_code || 0;
      const temp = Math.round(d.current?.temperature_2m || 0);
      const feelsLike = Math.round(d.current?.apparent_temperature || temp);
      const wind = Math.round(d.current?.wind_speed_10m || 0);
      const gusts = Math.round(d.current?.wind_gusts_10m || 0);
      const precip = d.current?.precipitation || 0;
      const visibility = d.current?.visibility || 10000;

      // Condition labels
      const conditions = code<=1?"Clear":code<=3?"Partly Cloudy":code<=45?"Foggy":code<=48?"Freezing Fog":code<=57?"Drizzle":code<=67?"Rain":code<=69?"Freezing Rain":code<=77?"Snow":code<=82?"Rain Showers":code<=86?"Snow Showers":"Thunderstorm";
      const emoji = code<=1?"☀️":code<=3?"⛅":code<=48?"🌫️":code<=57?"🌦️":code<=67?"🌧️":code<=69?"🌨️":code<=77?"❄️":code<=82?"🌦️":code<=86?"🌨️":"⛈️";

      // Build real trucker alerts
      const alerts = [];
      
      // Temperature alerts
      if (temp <= -20) alerts.push({ level:"danger", icon:"🥶", msg:`Extreme cold: ${temp}°C (feels ${feelsLike}°C) — risk of engine freeze & black ice` });
      else if (temp <= -10) alerts.push({ level:"warning", icon:"❄️", msg:`Cold conditions: ${temp}°C — watch for black ice on roads` });
      else if (temp >= 35) alerts.push({ level:"warning", icon:"🌡️", msg:`Heat advisory: ${temp}°C — check tire pressure & engine cooling` });

      // Wind alerts
      if (gusts >= 90) alerts.push({ level:"danger", icon:"💨", msg:`Extreme wind gusts: ${gusts} km/h — risk of truck rollover on exposed roads` });
      else if (gusts >= 60 || wind >= 50) alerts.push({ level:"warning", icon:"💨", msg:`Strong winds: ${wind} km/h, gusts to ${gusts} km/h — reduce speed on highways` });
      
      // Visibility alerts
      if (visibility <= 200) alerts.push({ level:"danger", icon:"🌫️", msg:`Near-zero visibility: ${Math.round(visibility)}m — pull over if unsafe` });
      else if (visibility <= 1000) alerts.push({ level:"warning", icon:"🌫️", msg:`Low visibility: ${Math.round(visibility/100)*100}m — use low beams & reduce speed` });

      // Snow/ice alerts
      if (code >= 71 && code <= 77) alerts.push({ level:"warning", icon:"❄️", msg:`Snow falling — roads may be icy, increase following distance` });
      if (code === 66 || code === 67) alerts.push({ level:"danger", icon:"🧊", msg:`Freezing rain — extremely dangerous road conditions` });
      
      // Rain alerts
      if (precip > 5) alerts.push({ level:"warning", icon:"🌧️", msg:`Heavy rain: ${precip.toFixed(1)}mm — reduced traction, slow down` });

      // Tomorrow forecast
      const tomorrowCode = d.daily?.weather_code?.[1] || 0;
      const tomorrowMax = Math.round(d.daily?.temperature_2m_max?.[1] || 0);
      const tomorrowMin = Math.round(d.daily?.temperature_2m_min?.[1] || 0);
      const tomorrowWind = Math.round(d.daily?.wind_speed_10m_max?.[1] || 0);
      const tomorrowEmoji = tomorrowCode<=1?"☀️":tomorrowCode<=3?"⛅":tomorrowCode<=48?"🌫️":tomorrowCode<=67?"🌧️":tomorrowCode<=77?"❄️":"⛈️";

      setWeather({ 
        conditions, temp, feelsLike, wind, gusts, precip, visibility,
        emoji, alerts,
        tomorrow: { emoji:tomorrowEmoji, max:tomorrowMax, min:tomorrowMin, wind:tomorrowWind,
          label: tomorrowCode<=1?"Clear":tomorrowCode<=3?"Cloudy":tomorrowCode<=67?"Rain":tomorrowCode<=77?"Snow":"Storms" }
      });
    }).catch(() => {});
  }, []);

  // Animate truck across screen
  useEffect(() => {
    let x = -120;
    const target = window.innerWidth + 40;
    const interval = setInterval(() => {
      x += 3;
      setTruckX(x);
      if (x > target) x = -120;
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // Auto-swipe slides
  const slides = [
    { type:"welcome" },
    { type:"weather" },
    { type:"money1" },
    { type:"money2" },
    { type:"money3" },
  ].filter(s => {
    if (s.type==="weather" && !weather) return false;
    if (s.type==="money1" && weekPay===0) return false;
    if (s.type==="money2" && yearlyPace<1000) return false;
    if (s.type==="money3" && !bestDay) return false;
    return true;
  });

  useEffect(() => {
    if (slide >= slides.length - 1) {
      const t = setTimeout(onDone, 2000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSlide(s => s+1), 2800);
    return () => clearTimeout(t);
  }, [slide, slides.length]);

  const greet = hour<5?"Working late":hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";

  const renderSlide = () => {
    const s = slides[slide];
    if (!s) return null;
    switch(s.type) {
      case "welcome": return (
        <div style={{textAlign:"center",animation:"slt-fade-in 0.5s ease"}}>
          <div style={{fontSize:56,marginBottom:8}}>{sky.emoji}</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:28,color:"#fff",marginBottom:8,textShadow:"0 2px 20px rgba(0,0,0,0.5)"}}>
            {greet},<br/>{(session.fullName||session.name).split(" ")[0]}!
          </div>
          {streak>=2&&<div style={{background:"rgba(255,152,0,0.3)",borderRadius:20,padding:"6px 16px",display:"inline-block",fontSize:14,fontWeight:700,color:"#FFD54F"}}>🔥 {streak} day streak!</div>}
        </div>
      );
      case "weather": return (
        <div style={{textAlign:"center",animation:"slt-fade-in 0.5s ease",width:"100%",maxWidth:360}}>
          {/* Current conditions */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:8}}>
            <div style={{fontSize:48}}>{weather.emoji}</div>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:36,color:"#fff",lineHeight:1}}>{weather.temp}°C</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>Feels {weather.feelsLike}°C</div>
            </div>
          </div>
          <div style={{fontWeight:700,color:"rgba(255,255,255,0.8)",fontSize:14,marginBottom:4}}>{weather.conditions} · Edmonton, AB</div>
          
          {/* Wind & visibility row */}
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:12,fontSize:12,color:"rgba(255,255,255,0.6)"}}>
            <span>💨 {weather.wind} km/h</span>
            {weather.gusts>0&&<span>⚡ Gusts {weather.gusts}</span>}
            {weather.precip>0&&<span>🌧️ {weather.precip.toFixed(1)}mm</span>}
          </div>

          {/* Alerts */}
          {weather.alerts?.length > 0 ? (
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {weather.alerts.map((a,i)=>(
                <div key={i} style={{
                  background:a.level==="danger"?"rgba(229,57,53,0.3)":"rgba(255,152,0,0.25)",
                  border:`1px solid ${a.level==="danger"?"rgba(229,57,53,0.5)":"rgba(255,152,0,0.4)"}`,
                  borderRadius:10,padding:"8px 12px",fontSize:12,
                  color:a.level==="danger"?"#FF8A80":"#FFD54F",
                  fontWeight:700,textAlign:"left",display:"flex",gap:8,alignItems:"flex-start"
                }}>
                  <span style={{flexShrink:0}}>{a.icon}</span>
                  <span>{a.msg}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{background:"rgba(105,240,174,0.2)",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#69F0AE",fontWeight:700,marginBottom:10}}>
              ✅ Good road conditions — safe to haul today!
            </div>
          )}

          {/* Tomorrow */}
          {weather.tomorrow&&(
            <div style={{background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"rgba(255,255,255,0.6)",display:"flex",justifyContent:"center",gap:16}}>
              <span style={{fontWeight:700,color:"rgba(255,255,255,0.4)"}}>Tomorrow:</span>
              <span>{weather.tomorrow.emoji} {weather.tomorrow.label}</span>
              <span>↑{weather.tomorrow.max}° ↓{weather.tomorrow.min}°</span>
              {weather.tomorrow.wind>40&&<span>💨 {weather.tomorrow.wind}km/h</span>}
            </div>
          )}
        </div>
      );
      case "money1": return (
        <div style={{textAlign:"center",animation:"slt-fade-in 0.5s ease"}}>
          <div style={{fontSize:48,marginBottom:8}}>💰</div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>This Week</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:42,color:"#69F0AE",textShadow:"0 0 30px rgba(105,240,174,0.6)"}}>
            ${weekPay.toFixed(2)}
          </div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",marginTop:8}}>{weekLoads.length} load{weekLoads.length!==1?"s":""} this week 📋</div>
        </div>
      );
      case "money2": return (
        <div style={{textAlign:"center",animation:"slt-fade-in 0.5s ease"}}>
          <div style={{fontSize:48,marginBottom:8}}>📈</div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>At This Pace</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:36,color:"#FFD54F",textShadow:"0 0 30px rgba(255,213,79,0.5)"}}>
            ${Math.round(yearlyPace).toLocaleString()}/year
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginTop:8}}>Keep logging every load 💪</div>
        </div>
      );
      case "money3": return (
        <div style={{textAlign:"center",animation:"slt-fade-in 0.5s ease"}}>
          <div style={{fontSize:48,marginBottom:8}}>🏆</div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Your Best Day</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:42,color:"#FF8A65",textShadow:"0 0 30px rgba(255,138,101,0.6)"}}>
            ${bestDay.amount.toFixed(2)}
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginTop:8}}>{bestDay.date} 🗓</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>Can you beat it today?</div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:99998,background:sky.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      
      {/* Stars for night */}
      {sky.stars && Array.from({length:40}).map((_,i)=>(
        <div key={i} style={{position:"absolute",width:Math.random()*3+1+"px",height:Math.random()*3+1+"px",borderRadius:"50%",background:"#fff",top:Math.random()*60+"%",left:Math.random()*100+"%",opacity:Math.random()*0.8+0.2,animation:`slt-star-twinkle ${Math.random()*2+1}s infinite`}} />
      ))}

      {/* Road */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"30%",background:"linear-gradient(180deg,transparent,#1a1a2e 60%)"}} />
      <div style={{position:"absolute",bottom:"18%",left:0,right:0,height:8,background:"#333"}} />
      <div style={{position:"absolute",bottom:"22%",left:0,right:0,height:60,background:"linear-gradient(180deg,transparent,rgba(0,0,0,0.4))"}} />
      {/* Road dashes */}
      {Array.from({length:8}).map((_,i)=>(
        <div key={i} style={{position:"absolute",bottom:"22.5%",left:`${i*14}%`,width:"8%",height:4,background:"rgba(255,255,0,0.4)",borderRadius:2}} />
      ))}

      {/* Truck */}
      <div style={{position:"absolute",bottom:"22%",fontSize:48,transform:`translateX(${truckX}px)`,transition:"none",filter:"drop-shadow(0 4px 8px rgba(0,0,0,0.5))"}}>🚛</div>

      {/* Slide content */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",padding:"0 32px",marginBottom:80}}>
        {renderSlide()}
      </div>

      {/* Progress dots */}
      <div style={{position:"absolute",bottom:40,display:"flex",gap:8}}>
        {slides.map((_,i)=>(
          <div key={i} onClick={()=>setSlide(i)} style={{width:i===slide?24:8,height:8,borderRadius:4,background:i===slide?"#243B6E":"rgba(255,255,255,0.3)",transition:"all 0.3s",cursor:"pointer"}} />
        ))}
      </div>

      {/* Skip button */}
      <button onClick={onDone} style={{position:"absolute",top:20,right:20,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:20,color:"rgba(255,255,255,0.7)",padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
        Skip →
      </button>
    </div>
  );
}

// ─── AI ENGINE ───────────────────────────────────────────────────────────────
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

async function callAI(systemPrompt, userMessage, maxTokens=600) {
  try {
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt, message: userMessage, maxTokens })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.text || "Sorry, I couldn't process that.";
  } catch(e) {
    return "Connection error. Please try again.";
  }
}

// ─── AI ASSISTANT MODAL ───────────────────────────────────────────────────────
function AIAssistant({ session, loads=[], rates={}, expenses=[], onClose, initialMode="chat" }) {
  const [mode, setMode] = useState(initialMode);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const myLoads = loads.filter(l => l.user_id === session.uid || l.addedBy === session.uid);
  const totalPay = myLoads.reduce((s,l) => s + (Number(l.driverBasePay)>0?Number(l.driverBasePay):Number(l.earnings||0)), 0);
  const totalExp = expenses.reduce((s,e) => s+Number(e.amount||0), 0);
  const recentLoads = myLoads.slice(0,5).map(l=>`${l.date}: ${l.location} — $${Number(l.earnings||0).toFixed(2)}`).join("\n");


  const SYSTEM = `You are TruckPilot AI — a smart assistant built into the TruckPilot fleet management app used by Canadian truckers.
You help drivers and fleet owners with: logging loads, tracking pay, understanding CRA tax deductions, fleet management, and app navigation.
Keep responses SHORT and practical — max 3-4 sentences. Use bullet points for lists. Be friendly and direct.
User info: Name: ${session.fullName||session.name}, Role: ${session.role}, Total loads: ${myLoads.length}, Total pay: $${totalPay.toFixed(2)}, Total expenses: $${totalExp.toFixed(2)}.
Recent loads:
${recentLoads||"No loads yet"}
Always give specific, actionable advice. Never say you cannot help.`;

  const modes = [
    { id:"chat",     icon:"💬", label:"Ask AI" },
    { id:"tax",      icon:"🗂", label:"Tax Help" },
    { id:"insights", icon:"📊", label:"Insights" },
    { id:"dispute",  icon:"✍️", label:"Draft Message" },
  ];

  const quickPrompts = {
    chat: ["How do I log a load?", "Where is my tax export?", "How do I join a fleet?", "What is wait pay?"],
    tax:  ["What can I claim as a trucker?", "How does CRA treat fuel expenses?", "What receipts should I keep?", "Is my phone bill deductible?"],
    insights: ["Analyze my earnings", "What are my best paying routes?", "How can I earn more?", "Compare my expenses"],
    dispute: ["Write a message about missing pay", "Draft a late payment reminder", "Help me explain a route issue", "Write a bonus request"],
  };

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role:"user", text:msg }]);
    setLoading(true);

    let prompt = msg;
    if (mode === "tax") prompt = `Tax question from a Canadian trucker: ${msg}. Give specific CRA line numbers and practical advice.`;
    if (mode === "insights") prompt = `Analyze this trucker's data and answer: ${msg}. Be specific with numbers from their actual data.`;
    if (mode === "dispute") prompt = `Write a professional, respectful message for this situation: ${msg}. Keep it under 100 words.`;

    const reply = await callAI(SYSTEM, prompt, 400);
    setMessages(prev => [...prev, { role:"assistant", text:reply }]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  };

  useEffect(() => {
    // Auto-greet based on mode
    const greetings = {
      chat: `Hi ${session.fullName?.split(" ")[0]||"there"}! 👋 I'm your TruckPilot AI. Ask me anything about the app, your loads, pay, or taxes.`,
      tax: `I'll help you maximize your CRA deductions! 🗂 You have $${totalExp.toFixed(2)} in tracked expenses. Ask me anything about Canadian trucker taxes.`,
      insights: `Let me analyze your data! 📊 You have ${myLoads.length} loads logged totaling $${totalPay.toFixed(2)} in pay. What would you like to know?`,
      dispute: `I'll help you write professional messages. ✍️ Just describe the situation and I'll draft something for you.`,
    };
    setMessages([{ role:"assistant", text:greetings[mode] }]);
  }, [mode]);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:19999, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:480, height:"85vh", background:"#fff", borderRadius:"24px 24px 0 0", display:"flex", flexDirection:"column", boxShadow:"0 -8px 40px rgba(0,0,0,0.3)" }}>
        
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#243B6E,#2D4A8A,#9C27B0)", padding:"16px 18px", borderRadius:"24px 24px 0 0", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🤖</div>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, color:"#fff", fontSize:16 }}>TruckPilot AI</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>Powered by Claude</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:20, color:"#fff", width:32, height:32, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
          </div>
          {/* Mode tabs */}
          <div style={{ display:"flex", gap:6 }}>
            {modes.map(m => (
              <button key={m.id} onClick={()=>setMode(m.id)}
                style={{ flex:1, padding:"6px 4px", borderRadius:20, border:"none", background:mode===m.id?"#fff":"rgba(255,255,255,0.15)", color:mode===m.id?"#2D4A8A":"#fff", fontWeight:700, fontSize:10, cursor:"pointer", transition:"all 0.2s" }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, background:"#F8F9FC" }}>
          {messages.map((m,i) => (
            <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", gap:8, alignItems:"flex-start" }}>
              {m.role==="assistant" && (
                <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#243B6E,#9C27B0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🤖</div>
              )}
              <div style={{ maxWidth:"80%", padding:"10px 14px", borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px", background:m.role==="user"?"linear-gradient(135deg,#243B6E,#243B6E)":"#fff", color:m.role==="user"?"#fff":"#1a1a2e", fontSize:13, lineHeight:1.6, boxShadow:"0 1px 4px rgba(0,0,0,0.1)", whiteSpace:"pre-wrap" }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#243B6E,#9C27B0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div>
              <div style={{ padding:"10px 14px", borderRadius:"18px 18px 18px 4px", background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,0.1)" }}>
                <div style={{ display:"flex", gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#9C27B0", animation:`slt-dot-bounce 1.2s ${i*0.2}s infinite` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div style={{ padding:"8px 16px", background:"#F8F9FC", borderTop:"1px solid #eee", flexShrink:0 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {quickPrompts[mode].map(p => (
                <button key={p} onClick={()=>send(p)}
                  style={{ padding:"6px 12px", borderRadius:20, border:"1.5px solid #E1E8FF", background:"#fff", color:"#243B6E", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding:"10px 16px 16px", background:"#fff", borderTop:"1px solid #eee", flexShrink:0 }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder="Ask anything..."
              rows={1}
              style={{ flex:1, padding:"10px 14px", borderRadius:20, border:"1.5px solid #E1E8FF", fontSize:14, resize:"none", outline:"none", fontFamily:"'Barlow',sans-serif", lineHeight:1.5, maxHeight:80, overflowY:"auto" }} />
            <button onClick={()=>send()} disabled={!input.trim()||loading}
              style={{ width:44, height:44, borderRadius:"50%", border:"none", background:input.trim()&&!loading?"linear-gradient(135deg,#243B6E,#9C27B0)":"#e0e0e0", color:"#fff", fontSize:18, cursor:input.trim()&&!loading?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SWIPEABLE LOAD CARD ─────────────────────────────────────────────────────
function SwipeableLoadCard({ load, onComplete, onClick, children }) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const cardRef = useRef(null);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!swiping) return;
    const dx = startX.current - e.touches[0].clientX;
    if (dx > 0) setSwipeX(Math.min(dx, 90));
    else setSwipeX(0);
  };

  const handleTouchEnd = () => {
    if (swipeX > 60 && !load.completed) {
      onComplete();
    }
    setSwipeX(0);
    setSwiping(false);
  };

  return (
    <div ref={cardRef} className="slt-swipeable"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ marginBottom:10, borderRadius:16, overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
      {/* Green complete hint behind card */}
      {!load.completed && (
        <div style={{ position:"absolute", right:0, top:0, bottom:0, width:swipeX, background:"linear-gradient(135deg,#43A047,#2E7D32)", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"0 12px 12px 0", overflow:"hidden" }}>
          {swipeX > 40 && <span style={{ color:"#fff", fontSize:22 }}>✓</span>}
        </div>
      )}
      {/* Card content */}
      <div style={{ transform:`translateX(-${swipeX}px)`, transition:swiping?"none":"transform 0.3s", background:"#fff", borderRadius:16, padding:"16px 18px" }}
        onClick={swipeX < 5 ? onClick : undefined}>
        {children}
      </div>
    </div>
  );
}

// ─── BOTTOM TAB BAR (mobile only) ────────────────────────────────────────────
// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
function PrivacySecurityModal({ session, onClose, onLogout, darkModeOn }) {
  useEffect(()=>{ document.body.style.overflow="hidden"; return()=>{ document.body.style.overflow=""; }; },[]);
  const [section, setSection] = useState("main");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");

  const bg = darkModeOn ? "#141414" : "#fff";
  const cardBg = darkModeOn ? "#1E1E1E" : "#F8F9FA";
  const textPrimary = darkModeOn ? "#F0EDE8" : "#1A1A1A";
  const textMuted = darkModeOn ? "rgba(240,237,232,.5)" : "#888";
  const border = darkModeOn ? "rgba(255,255,255,.08)" : "#EEEEEE";
  const BLUE = "#243B6E";

  const rowStyle = {display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:`1px solid ${border}`,cursor:"pointer"};
  const rowLastStyle = {display:"flex",alignItems:"center",gap:14,padding:"14px 18px"};
  const iconStyle = {width:38,height:38,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0};
  const inputStyle = {width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${border}`,fontSize:14,background:bg,color:textPrimary,fontFamily:"inherit",boxSizing:"border-box",marginTop:4,outline:"none"};
  const sectionTitle = {fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,color:textPrimary,marginBottom:16};

  const changePassword = async () => {
    if (!newPass || newPass.length < 6) { setPassMsg("Password must be at least 6 characters."); return; }
    if (newPass !== confirmPass) { setPassMsg("Passwords don't match."); return; }
    setPassLoading(true);
    const { error } = await sb.auth.updateUser({ password: newPass });
    setPassLoading(false);
    if (error) { setPassMsg("Error: " + error.message); return; }
    setPassMsg("✅ Password updated successfully!");
    setNewPass(""); setConfirmPass("");
    setTimeout(() => setPassMsg(""), 3000);
  };

  const exportData = () => {
    const loads = getStored(`tp-loads-${session.uid}`);
    const expenses = getStored(`tp-expensesv2-${session.uid}`);
    const rows = [["Type","Date","Route/Description","Amount","Status"]];
    loads.forEach(l => rows.push(["Load", l.date, l.location, l.earnings||0, l.completed?"Done":"Active"]));
    expenses.forEach(e => rows.push(["Expense", e.date, e.merchant||e.note||"", e.amount, e.category]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `TruckPilot-${session.fullName||"data"}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const requestDelete = async () => {
    if (deleteConfirm !== "DELETE") { setDeleteMsg("Type DELETE to confirm."); return; }
    await sb.from("support_messages").insert([{
      from_uid: session.uid, from_name: session.fullName||session.name,
      text: `⚠️ ACCOUNT DELETION REQUEST from ${session.fullName||session.name} (${session.email}) — User ID: ${session.uid}`,
      created_at: new Date().toISOString(), read: false
    }]);
    setDeleteMsg("✅ Deletion request sent. We'll process it within 48 hours.");
    setDeleteConfirm("");
  };

  const signOutAll = async () => {
    if (!window.confirm("Sign out from all devices?")) return;
    await sb.auth.signOut({ scope: "global" });
    onLogout();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:bg,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:"20px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          {section!=="main"
            ? <button onClick={()=>setSection("main")} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:BLUE,fontWeight:700,fontSize:15,cursor:"pointer",padding:0}}>‹ Back</button>
            : <div/>}
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color:textPrimary}}>
            {section==="main"?"🔒 Privacy & Security":section==="password"?"🔑 Change Password":section==="data"?"📤 My Data":section==="notifications"?"🔔 Notifications":section==="delete"?"🗑 Delete Account":section==="sessions"?"📱 Sessions":"📄 Legal"}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:textMuted}}>✕</button>
        </div>

        <div style={{padding:"0 16px 40px"}}>

          {/* MAIN MENU */}
          {section==="main" && (
            <div style={{borderRadius:18,background:cardBg,overflow:"hidden",marginBottom:16}}>
              {[
                {icon:"🔑",label:"Change Password",sub:"Update your login password",id:"password",bg:"rgba(36,59,110,.1)"},
                {icon:"📱",label:"Active Sessions",sub:"See & manage where you're logged in",id:"sessions",bg:"rgba(76,175,80,.1)"},
                {icon:"🔔",label:"Notifications",sub:"Email and push preferences",id:"notifications",bg:"rgba(255,193,7,.1)"},
                {icon:"👁",label:"Data Usage",sub:"What TruckPilot stores about you",id:"usage",bg:"rgba(33,150,243,.1)"},
                {icon:"📤",label:"Export My Data",sub:"Download all your loads & expenses",id:"data",bg:"rgba(0,150,136,.1)"},
                {icon:"📄",label:"Legal & Policies",sub:"Privacy policy, terms of service",id:"legal",bg:"rgba(100,100,100,.1)"},
                {icon:"🗑",label:"Delete Account",sub:"Permanently remove your account",id:"delete",bg:"rgba(229,57,53,.1)"},
              ].map((item,i,arr) => (
                <div key={item.id} style={i===arr.length-1?{...rowLastStyle,cursor:"pointer"}:{...rowStyle}} onClick={()=>setSection(item.id)}>
                  <div style={{...iconStyle,background:item.bg}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:item.id==="delete"?"#E53935":textPrimary}}>{item.label}</div>
                    <div style={{fontSize:12,color:textMuted,marginTop:1}}>{item.sub}</div>
                  </div>
                  <span style={{fontSize:14,color:textMuted}}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* CHANGE PASSWORD */}
          {section==="password" && (
            <div>
              <div style={{borderRadius:18,background:cardBg,padding:"18px",marginBottom:16}}>
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:textMuted,textTransform:"uppercase",letterSpacing:1}}>New Password</label>
                  <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Min 6 characters" style={inputStyle} />
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{fontSize:12,fontWeight:700,color:textMuted,textTransform:"uppercase",letterSpacing:1}}>Confirm Password</label>
                  <input type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="Repeat new password" style={inputStyle} />
                </div>
                {passMsg && <div style={{fontSize:13,fontWeight:600,color:passMsg.startsWith("✅")?"#4CAF50":"#E53935",marginBottom:12}}>{passMsg}</div>}
                <button onClick={changePassword} disabled={passLoading} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:BLUE,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                  {passLoading?"Updating...":"Update Password"}
                </button>
              </div>
              <div style={{borderRadius:18,background:cardBg,padding:"16px 18px"}}>
                <div style={{fontSize:13,fontWeight:700,color:textPrimary,marginBottom:8}}>🚪 Sign Out All Devices</div>
                <div style={{fontSize:12,color:textMuted,marginBottom:12}}>This will sign you out everywhere including this device.</div>
                <button onClick={signOutAll} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #E53935",background:"transparent",color:"#E53935",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                  Sign Out All Devices
                </button>
              </div>
            </div>
          )}

          {/* SESSIONS */}
          {section==="sessions" && (
            <div style={{borderRadius:18,background:cardBg,padding:"18px",marginBottom:16}}>
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>📱</div>
                <div style={{fontWeight:700,fontSize:16,color:textPrimary,marginBottom:8}}>Current Session</div>
                <div style={{fontSize:13,color:textMuted,marginBottom:4}}>{session.email}</div>
                <div style={{fontSize:12,color:textMuted,marginBottom:20}}>Logged in on this device</div>
                <div style={{background:BLUE,borderRadius:12,padding:"10px 18px",display:"inline-block",color:"#fff",fontSize:12,fontWeight:700}}>✅ Active</div>
              </div>
              <button onClick={signOutAll} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #E53935",background:"transparent",color:"#E53935",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginTop:8}}>
                🚪 Sign Out All Devices
              </button>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section==="notifications" && (
            <div style={{borderRadius:18,background:cardBg,overflow:"hidden",marginBottom:16}}>
              {[
                {label:"Email Notifications",sub:"Load updates, reports, reminders",val:notifEmail,set:setNotifEmail},
                {label:"Push Notifications",sub:"Alerts on your phone",val:notifPush,set:setNotifPush},
              ].map((item,i,arr) => (
                <div key={item.label} style={i===arr.length-1?rowLastStyle:rowStyle}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>{item.label}</div>
                    <div style={{fontSize:12,color:textMuted,marginTop:1}}>{item.sub}</div>
                  </div>
                  <div onClick={()=>item.set(v=>!v)} style={{width:46,height:26,borderRadius:13,background:item.val?BLUE:"#D1D5DB",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:3,left:item.val?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EXPORT DATA */}
          {section==="data" && (
            <div>
              <div style={{borderRadius:18,background:cardBg,padding:"18px",marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:700,color:textPrimary,marginBottom:8}}>📊 Export Your Data</div>
                <div style={{fontSize:13,color:textMuted,marginBottom:16}}>Download all your loads, expenses and activity as a CSV file you can open in Excel or Google Sheets.</div>
                <button onClick={exportData} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:BLUE,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                  ⬇️ Download My Data (CSV)
                </button>
              </div>
              <div style={{borderRadius:18,background:cardBg,padding:"16px 18px"}}>
                <div style={{fontSize:13,fontWeight:700,color:textPrimary,marginBottom:6}}>📋 What's included</div>
                {["All loads with dates, routes, earnings","All expenses with categories","Driver pay records","Wait time records"].map(item=>(
                  <div key={item} style={{fontSize:13,color:textMuted,padding:"6px 0",borderBottom:`1px solid ${border}`}}>✓ {item}</div>
                ))}
              </div>
            </div>
          )}

          {/* LEGAL */}
          {section==="legal" && (
            <div style={{borderRadius:18,background:cardBg,overflow:"hidden",marginBottom:16}}>
              {[
                {icon:"📄",label:"Privacy Policy",url:"https://truckpilot.ca/privacy"},
                {icon:"📋",label:"Terms of Service",url:"https://truckpilot.ca/terms"},
                {icon:"🍪",label:"Cookie Policy",url:"https://truckpilot.ca/cookies"},
              ].map((item,i,arr)=>(
                <a key={item.label} href={item.url} target="_blank" rel="noreferrer" style={{...(i===arr.length-1?rowLastStyle:rowStyle),textDecoration:"none"}}>
                  <div style={{...iconStyle,background:"rgba(100,100,100,.1)",fontSize:20}}>{item.icon}</div>
                  <div style={{flex:1,fontSize:15,fontWeight:600,color:textPrimary}}>{item.label}</div>
                  <span style={{fontSize:14,color:textMuted}}>›</span>
                </a>
              ))}
            </div>
          )}

          {/* DATA USAGE */}
          {section==="usage" && (
            <div>
              <div style={{borderRadius:18,background:cardBg,overflow:"hidden",marginBottom:16}}>
                {[
                  {icon:"📦",title:"Your Loads",desc:"Route, date, earnings, wait times, truck number, driver name. Stored securely in your account."},
                  {icon:"🧾",title:"Expenses",desc:"Amount, category, merchant name, date and optional receipt photos."},
                  {icon:"👤",title:"Profile Info",desc:"Your name, email, role (owner/driver), invite code and plan level."},
                  {icon:"🔧",title:"Maintenance Records",desc:"Truck service history, dates and costs you manually enter."},
                  {icon:"📍",title:"Location Data",desc:"We do NOT track your GPS or location. Fuel Finder uses your device location only — never stored."},
                  {icon:"📲",title:"Device Data",desc:"We do NOT sell your data to third parties. Ever."},
                ].map((item,i,arr)=>(
                  <div key={item.title} style={{padding:"14px 18px",borderBottom:i<arr.length-1?`1px solid ${border}`:"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                      <span style={{fontSize:18}}>{item.icon}</span>
                      <span style={{fontWeight:700,fontSize:14,color:textPrimary}}>{item.title}</span>
                    </div>
                    <div style={{fontSize:13,color:textMuted,paddingLeft:28}}>{item.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{borderRadius:18,background:"#E8F5E9",padding:"14px 18px",fontSize:13,color:"#2E7D32",fontWeight:600}}>
                🔒 All data is encrypted and stored securely via Supabase. You can export or delete your data at any time.
              </div>
            </div>
          )}

          {/* DELETE ACCOUNT */}
          {section==="delete" && (
            <div>
              <div style={{borderRadius:18,background:"#FFF5F5",border:"1.5px solid #FFCDD2",padding:"18px",marginBottom:16}}>
                <div style={{fontSize:16,fontWeight:800,color:"#E53935",marginBottom:8}}>⚠️ Delete Account</div>
                <div style={{fontSize:13,color:"#555",marginBottom:16}}>This will send a deletion request to TruckPilot support. Your account and all data will be permanently removed within 48 hours. This cannot be undone.</div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#E53935",textTransform:"uppercase",letterSpacing:1}}>Type DELETE to confirm</label>
                  <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="DELETE" style={{...inputStyle,border:"1.5px solid #E53935",marginTop:6}} />
                </div>
                {deleteMsg && <div style={{fontSize:13,fontWeight:600,color:deleteMsg.startsWith("✅")?"#4CAF50":"#E53935",marginBottom:12}}>{deleteMsg}</div>}
                <button onClick={requestDelete} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"#E53935",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                  Send Deletion Request
                </button>
              </div>
              <div style={{borderRadius:18,background:cardBg,padding:"14px 18px",fontSize:13,color:textMuted}}>
                Need help instead? Contact us at <strong>support@truckpilot.ca</strong> or call <strong>437-700-5835</strong>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function TruckEditCard({ truck, darkModeOn, cardBg, cardBorder, textPrimary, textMuted, rowBorder, BLUE, session }) {
  const [editing, setEditing] = useState(false);
  const [truckNum, setTruckNum] = useState(truck.truckNumber || "");
  const [trailerNum, setTrailerNum] = useState(truck.trailerNumber || "");
  const [plate, setPlate] = useState(truck.licensePlate || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const ownerUid = session.ownerUid || session.uid;
      const updatedTruck = { ...truck, truckNumber: truckNum, trailerNumber: trailerNum, licensePlate: plate };
      const allTrucks = await sbGetTrucks(ownerUid);
      const updated = allTrucks.map(t => t.id === truck.id ? updatedTruck : t);
      await sbSaveTrucks(updated, ownerUid);
    } catch(e) { console.error(e); }
    setSaving(false);
    setEditing(false);
  };

  const rowStyle = {display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:"1px solid "+rowBorder};
  const rowLastStyle = {display:"flex",alignItems:"center",gap:14,padding:"14px 18px"};
  const iconStyle = {width:38,height:38,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0};
  const inputStyle = {flex:1,padding:"8px 12px",borderRadius:10,border:"1.5px solid "+BLUE,fontSize:14,fontWeight:600,fontFamily:"inherit",background:darkModeOn?"#2a2a2a":"#fff",color:textPrimary,outline:"none"};

  if (editing) return (
    <div style={{borderRadius:18,background:cardBg,border:"2px solid "+BLUE,overflow:"hidden",marginBottom:20}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid "+rowBorder}}>
        <div style={{fontSize:13,fontWeight:700,color:BLUE,marginBottom:12}}>✏️ Edit Truck & Trailer</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:textMuted,marginBottom:4}}>TRUCK NUMBER</div>
          <input value={truckNum} onChange={e=>setTruckNum(e.target.value)} placeholder="e.g. T-101" style={inputStyle} />
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:textMuted,marginBottom:4}}>TRAILER NUMBER</div>
          <input value={trailerNum} onChange={e=>setTrailerNum(e.target.value)} placeholder="e.g. TRL-88" style={inputStyle} />
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:textMuted,marginBottom:4}}>LICENSE PLATE</div>
          <input value={plate} onChange={e=>setPlate(e.target.value)} placeholder="e.g. ABJ 4421" style={inputStyle} />
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setEditing(false)} style={{flex:1,padding:"11px",borderRadius:12,border:"1.5px solid "+rowBorder,background:"transparent",color:textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:BLUE,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>
            {saving?"Saving...":"💾 Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{borderRadius:18,background:cardBg,border:"1px solid "+cardBorder,overflow:"hidden",marginBottom:20}}>
      <div style={rowStyle}>
        <div style={{...iconStyle,background:"rgba(36,59,110,.1)"}}>🚛</div>
        <div style={{flex:1,fontSize:15,fontWeight:600,color:textPrimary}}>Truck No.</div>
        <div style={{fontSize:14,fontWeight:700,color:textMuted}}>{truck.truckNumber ? "TRK-"+truck.truckNumber : "—"}</div>
      </div>
      <div style={rowStyle}>
        <div style={{...iconStyle,background:"rgba(100,100,100,.1)"}}>🔗</div>
        <div style={{flex:1,fontSize:15,fontWeight:600,color:textPrimary}}>Trailer No.</div>
        <div style={{fontSize:14,fontWeight:700,color:textMuted}}>{truck.trailerNumber ? "TRL-"+truck.trailerNumber : "—"}</div>
      </div>
      <div style={rowStyle}>
        <div style={{...iconStyle,background:"rgba(100,100,100,.1)"}}>📋</div>
        <div style={{flex:1,fontSize:15,fontWeight:600,color:textPrimary}}>License Plate</div>
        <div style={{fontSize:14,fontWeight:700,color:textMuted}}>{truck.licensePlate || "—"}</div>
      </div>
      <div style={rowLastStyle}>
        <button onClick={()=>setEditing(true)} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid "+BLUE,background:"transparent",color:BLUE,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
          ✏️ Edit Truck & Trailer
        </button>
      </div>
    </div>
  );
}

function ProfileTab({ session, loads, trucks, plan, isOwner, onLogout, setTab, setShowSettings, onDarkToggle, darkModeOn, onEditProfile, openUpgrade, lang, changeLang }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profileCfg, setProfileCfg] = useState(null);
  const scrollRef = useRef(null);
  const scrollKey = `tp-profile-scroll-${session.uid}`;

  useEffect(() => {
    // Load profile config from Supabase (per-user first, then global)
    const loadCfg = async () => {
      try {
        // Try per-user config first
        const { data: userCfg } = await sb.from("app_config").select("profile_items").eq("id", session.uid).maybeSingle();
        if (userCfg?.profile_items) { setProfileCfg(userCfg.profile_items); return; }
        // Fall back to global
        const { data: globalCfg } = await sb.from("app_config").select("profile_items").eq("id", "global").maybeSingle();
        if (globalCfg?.profile_items) setProfileCfg(globalCfg.profile_items);
      } catch(e) {}
    };
    loadCfg();
  }, [session.uid]);

  useEffect(() => {
    // Restore scroll position
    const saved = sessionStorage.getItem(scrollKey);
    if (saved && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(saved);
    }
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => sessionStorage.setItem(scrollKey, el.scrollTop);
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);
  try {
    loads = loads || [];
    trucks = trucks || [];
    openUpgrade = openUpgrade || function(){};

    const myLoads = isOwner ? loads : loads.filter(function(l){ return l.assignedDriverUid === session.uid || l.addedBy === session.uid || l.user_id === session.uid; });
    const done = myLoads.filter(function(l){ return l.completed; });
    const name = session.fullName || session.name || "Driver";
    const initials = name.split(" ").map(function(w){ return w[0]; }).join("").slice(0,2).toUpperCase();
    const myTruck = trucks.length > 0 ? trucks[0] : null;

    const bg = profileCfg?.theme?.bgColor || (darkModeOn ? "#141414" : "#F4F1EC");
    const cardBg = profileCfg?.theme?.cardBg || (darkModeOn ? "#1E1E1E" : "#FFFFFF");
    const cardBorder = darkModeOn ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)";
    const textPrimary = profileCfg?.theme?.textColor || (darkModeOn ? "#F0EDE8" : "#1A1A1A");
    const textMuted = darkModeOn ? "rgba(240,237,232,.4)" : "rgba(26,26,26,.4)";
    const rowBorder = darkModeOn ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
    const BLUE = profileCfg?.theme?.primaryColor || "#243B6E";
    const fontFamily = profileCfg?.theme?.fontFamily ? `'${profileCfg.theme.fontFamily}',sans-serif` : "'Barlow',sans-serif";
    const borderRadius = profileCfg?.theme?.borderRadius ? parseInt(profileCfg.theme.borderRadius) : 18;

    const rowStyle = {display:"flex",alignItems:"center",gap:14,padding:"16px 18px",borderBottom:"1px solid "+rowBorder,cursor:"pointer"};
    const rowLastStyle = {display:"flex",alignItems:"center",gap:14,padding:"16px 18px"};
    const iconStyle = {width:38,height:38,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0};
    const cardStyle = {borderRadius:borderRadius,background:cardBg,border:"1px solid "+cardBorder,overflow:"hidden",marginBottom:20};
    const labelStyle = {fontSize:11,fontWeight:700,color:textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10,marginTop:4};

    // Settings & More items — filter by config visibility
    const settingsItems = profileCfg?.settingsMore || null;
    const isItemVisible = (id) => {
      if (!settingsItems) return true;
      const item = settingsItems.find(i => i.id === id);
      return item ? item.visible : true;
    };

    // Tool groups — use config if available, else hardcoded defaults
    const toolGroups = profileCfg ? (isOwner ? profileCfg.ownerGroups : profileCfg.driverGroups) : null;

    const tools = isOwner ? [
      {icon:"👥",label:"Drivers",id:"drivers"},
      {icon:"🧾",label:"Expenses",id:"expenses"},
      {icon:"💵",label:"Payroll",id:"payroll"},
      {icon:"📈",label:"Analytics",id:"analytics"},
      {icon:"🗂",label:"Tax Export",id:"tax"},
      {icon:"🔧",label:"Maintenance",id:"maintenance"},
      {icon:"🔍",label:"Inspection",id:"inspection"},
      {icon:"⛽",label:"Fuel Finder",id:"fuel_finder"},
      {icon:"📁",label:"Documents",id:"documents"},
      {icon:"🚨",label:"Emergency",id:"emergency"},
    ] : [
      {icon:"🧾",label:"Expenses",id:"expenses"},
      {icon:"📈",label:"Analytics",id:"analytics"},
      {icon:"🗂",label:"Tax Export",id:"tax"},
      {icon:"🔧",label:"Maintenance",id:"maintenance"},
      {icon:"🔍",label:"Inspection",id:"inspection"},
      {icon:"⛽",label:"Fuel Finder",id:"fuel_finder"},
      {icon:"📁",label:"Documents",id:"documents"},
      {icon:"🚨",label:"Emergency",id:"emergency"},
    ];

    return (
      <div ref={scrollRef} onScroll={e=>sessionStorage.setItem(scrollKey,e.target.scrollTop)} style={{background:bg,minHeight:"100vh",fontFamily:fontFamily,color:textPrimary}}>
        <div style={{padding:"20px 16px 140px"}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:textPrimary}}>MY PROFILE</div>
            <button style={{padding:"8px 18px",borderRadius:30,background:BLUE,color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:13}} onClick={function(){ if(onEditProfile) onEditProfile(); }}>✏️ Edit</button>
          </div>

          {/* Avatar */}
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
            <div style={{width:72,height:72,borderRadius:"50%",background:BLUE,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900,color:"#fff",flexShrink:0}}>
              {initials}
            </div>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900,color:textPrimary,lineHeight:1.1}}>{name}</div>
              <div style={{fontSize:13,fontWeight:700,color:BLUE,marginTop:2}}>{isOwner ? "Owner" : "Driver"}</div>
              <div style={{fontSize:12,color:textMuted,marginTop:2}}>{done.length} loads completed</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {[
              {val:done.length, lbl:"Loads Done"},
              {val: session.created_at ? new Date(session.created_at).toLocaleDateString("en-CA",{year:"numeric",month:"short"}) : new Date().toLocaleDateString("en-CA",{year:"numeric",month:"short"}), lbl:"Member Since"},
              {val:plan==="pro"?(isOwner?"🚀 Owner Pro":"🚀 Fleet Pro"):plan==="basic"?"💼 Hauler":"⭐ Beta", lbl:"Plan"},
            ].map(function(s){ return (
              <div key={s.lbl} style={{borderRadius:16,padding:"14px 12px",background:cardBg,border:"1px solid "+cardBorder,textAlign:"center"}}>
                {s.lbl==="Member Since" ? (
                  <>
                    <div style={{fontSize:10,fontWeight:600,color:textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{s.lbl}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:900,color:BLUE,lineHeight:1}}>{s.val}</div>
                  </>
                ) : (
                  <>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:BLUE,lineHeight:1}}>{s.val}</div>
                    <div style={{fontSize:10,fontWeight:600,color:textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>{s.lbl}</div>
                  </>
                )}
              </div>
            ); })}
          </div>

          {/* Truck */}
          <div style={labelStyle}>TRUCK & TRAILER</div>
          {myTruck ? (
            <TruckEditCard truck={myTruck} darkModeOn={darkModeOn} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textMuted={textMuted} rowBorder={rowBorder} BLUE={BLUE} session={session} />
          ) : (
            <div style={{...cardStyle,padding:"20px",textAlign:"center",color:textMuted,fontSize:13}}>
              No truck assigned yet. Ask your owner to add one in Settings.
            </div>
          )}

          {/* Settings */}
          <div style={labelStyle}>SETTINGS & MORE</div>
          <div style={cardStyle}>
            {isItemVisible("ai") && (
            <div style={rowStyle} onClick={function(){ if(setTab) setTab("contact"); }}>
              <div style={{...iconStyle,background:"rgba(99,102,241,.12)"}}>🤖</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>TruckPilot AI</div>
                <div style={{fontSize:12,color:textMuted,marginTop:1}}>Ask anything, get tax help</div>
              </div>
              <span style={{fontSize:16,color:textMuted}}>›</span>
            </div>
            )}
            {isItemVisible("darkmode") && (
            <div style={rowStyle}>
              <div style={{...iconStyle,background:"rgba(59,130,246,.1)"}}>🌙</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>Dark Mode</div>
                <div style={{fontSize:12,color:textMuted,marginTop:1}}>Switch display theme</div>
              </div>
              <button onClick={function(){ if(onDarkToggle) onDarkToggle(); }}
                style={{width:46,height:26,borderRadius:13,background:darkModeOn?BLUE:"#D1D5DB",border:"none",cursor:"pointer",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:3,left:darkModeOn?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}} />
              </button>
            </div>
            )}
            {isItemVisible("support") && (
            <div style={rowStyle} onClick={function(){ if(setTab) setTab("contact"); }}>
              <div style={{...iconStyle,background:"rgba(239,68,68,.1)"}}>🆘</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>Support / Help</div>
                <div style={{fontSize:12,color:textMuted,marginTop:1}}>Contact us anytime</div>
              </div>
              <span style={{fontSize:14,color:textMuted}}>›</span>
            </div>
            )}
            {isOwner && isItemVisible("settings") && (
              <div style={rowStyle} onClick={function(){ if(setShowSettings) setShowSettings(true); }}>
                <div style={{...iconStyle,background:"rgba(100,100,100,.1)"}}>⚙️</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>App Settings</div>
                  <div style={{fontSize:12,color:textMuted,marginTop:1}}>Rates, routes, trucks</div>
                </div>
                <span style={{fontSize:14,color:textMuted}}>›</span>
              </div>
            )}
            {isItemVisible("privacy") && (
            <div style={{...rowLastStyle,cursor:"pointer"}} onClick={()=>setShowPrivacy(true)}>
              <div style={{...iconStyle,background:"rgba(100,100,100,.1)"}}>🔒</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:textPrimary}}>Privacy & Security</div>
                <div style={{fontSize:12,color:textMuted,marginTop:1}}>Password, data, notifications</div>
              </div>
              <span style={{fontSize:14,color:textMuted}}>›</span>
            </div>
            )}
          </div>

          {/* Plan — only show if upgrade enabled OR already on paid plan */}
          {openUpgrade && (
          <div style={{borderRadius:18,padding:"16px 20px",marginBottom:20,background:BLUE,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:openUpgrade?"pointer":"default"}}
            onClick={function(){ if(openUpgrade) openUpgrade(); }}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Your Plan</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"#fff"}}>
                {plan==="pro" ? (isOwner?"🚀 Owner Pro":"🚀 Fleet Pro") : plan==="basic" ? "💼 Hauler" : "⭐ Beta"}
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:2}}>
                {plan==="pro" ? "All features unlocked" : plan==="basic" ? "You are on Hauler plan" : "Early access — thank you!"}
              </div>
            </div>
            {plan!=="pro" && openUpgrade && <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"8px 14px",color:"#fff",fontWeight:800,fontSize:13}}>Upgrade →</div>}
          </div>
          )}

          {/* Tools — grouped by category */}
          {(toolGroups || (isOwner ? [
            {
              group: "Fleet",
              visible: true,
              items: [
                {icon:"👥",label:"Drivers",id:"drivers",color:"rgba(59,130,246,.12)",visible:true},
                {icon:"🚛",label:"My Loads",id:"log",color:"rgba(36,59,110,.1)",visible:true},
                {icon:"➕",label:"Add Load",id:"new",color:"rgba(34,197,94,.12)",visible:true},
              ]
            },
            {
              group: "Money",
              visible: true,
              items: [
                {icon:"🧾",label:"Expenses",id:"expenses",color:"rgba(239,68,68,.1)",visible:true},
                {icon:"💵",label:"Payroll",id:"payroll",color:"rgba(34,197,94,.12)",visible:true},
                {icon:"📊",label:"Reports",id:"report",color:"rgba(36,59,110,.1)",visible:true},
                {icon:"📈",label:"Analytics",id:"analytics",color:"rgba(59,130,246,.12)",visible:true},
                {icon:"🗂",label:"Tax Export",id:"tax",color:"rgba(245,158,11,.12)",visible:true},
                {icon:"📋",label:"Financial Reports",id:"financial_reports",color:"rgba(36,59,110,.12)",visible:true},
                {icon:"📁",label:"Documents",id:"documents",color:"rgba(245,158,11,.12)",visible:true},
              ]
            },
            {
              group: "Operations",
              visible: true,
              items: [
                {icon:"🔧",label:"Maintenance",id:"maintenance",color:"rgba(107,114,128,.1)",visible:true},
                {icon:"🔍",label:"Inspection",id:"inspection",color:"rgba(239,68,68,.1)",visible:true},
                {icon:"⛽",label:"Fuel Finder",id:"fuel_finder",color:"rgba(16,185,129,.12)",visible:true},
                {icon:"🚨",label:"Emergency",id:"emergency",color:"rgba(239,68,68,.15)",visible:true},
                {icon:"🪣",label:"Fuel Log",id:"fuel_log",color:"rgba(16,185,129,.12)",visible:true},
                
                {icon:"⭐",label:"Driver Ratings",id:"driver_ratings",color:"rgba(255,215,0,.2)",visible:true},
              ]
            },
            {
              group: "Community",
              visible: true,
              items: [
                {icon:"📋",label:"Job Board",id:"jobboard",color:"rgba(36,59,110,.1)",visible:true},
                {icon:"💬",label:"Community Chat",id:"community",color:"rgba(34,197,94,.12)",visible:true},
              ]
            }
          ] : [
            {
              group: "My Work",
              visible: true,
              items: [
                {icon:"📋",label:"My Loads",id:"log",color:"rgba(36,59,110,.1)",visible:true},
                {icon:"➕",label:"Add Load",id:"new",color:"rgba(34,197,94,.12)",visible:true},
                {icon:"📊",label:"Reports",id:"report",color:"rgba(36,59,110,.1)",visible:true},
              ]
            },
            {
              group: "Money",
              visible: true,
              items: [
                {icon:"🧾",label:"Expenses",id:"expenses",color:"rgba(239,68,68,.1)",visible:true},
                {icon:"📈",label:"Analytics",id:"analytics",color:"rgba(59,130,246,.12)",visible:true},
                {icon:"🗂",label:"Tax Export",id:"tax",color:"rgba(245,158,11,.12)",visible:true},
                {icon:"📋",label:"Financial Reports",id:"financial_reports",color:"rgba(36,59,110,.12)",visible:true},
                {icon:"📁",label:"Documents",id:"documents",color:"rgba(245,158,11,.12)",visible:true},
              ]
            },
            {
              group: "Operations",
              visible: true,
              items: [
                {icon:"🔧",label:"Maintenance",id:"maintenance",color:"rgba(107,114,128,.1)",visible:true},
                {icon:"🔍",label:"Inspection",id:"inspection",color:"rgba(239,68,68,.1)",visible:true},
                {icon:"⛽",label:"Fuel Finder",id:"fuel_finder",color:"rgba(16,185,129,.12)",visible:true},
                {icon:"🚨",label:"Emergency",id:"emergency",color:"rgba(239,68,68,.15)",visible:true},
                {icon:"🪣",label:"Fuel Log",id:"fuel_log",color:"rgba(16,185,129,.12)",visible:true},
              ]
            },
            {
              group: "Community",
              visible: true,
              items: [
                {icon:"📋",label:"Job Board",id:"jobboard",color:"rgba(36,59,110,.1)",visible:true},
                {icon:"💬",label:"Community Chat",id:"community",color:"rgba(34,197,94,.12)",visible:true},
              ]
            }
          ])).filter(function(group){ return group.visible !== false; }).map(function(group){ return (
            <div key={group.group} style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>{group.group}</div>
              <div style={{borderRadius:borderRadius,background:cardBg,border:"1px solid "+cardBorder,overflow:"hidden"}}>
                {group.items.filter(function(tool){ return tool.visible !== false; }).map(function(tool, idx, visibleItems){ return (
                  <button key={tool.id}
                    onClick={function(){ if(setTab) setTab(tool.id); }}
                    style={{
                      width:"100%",display:"flex",alignItems:"center",gap:14,
                      padding:"14px 18px",
                      borderBottom: idx < visibleItems.length-1 ? "1px solid "+rowBorder : "none",
                      background:"transparent",border:"none",cursor:"pointer",textAlign:"left"
                    }}>
                    <div style={{width:40,height:40,borderRadius:12,background:tool.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                      {tool.icon}
                    </div>
                    <div style={{flex:1,fontSize:15,fontWeight:600,color:textPrimary}}>{tool.label}</div>
                    <span style={{fontSize:16,color:textMuted}}>›</span>
                  </button>
                ); })}
              </div>
            </div>
          ); })}

          {/* Logout */}
          <button style={{width:"100%",padding:"16px",borderRadius:18,background:darkModeOn?"rgba(239,68,68,.15)":"#FFF0F0",border:"1px solid rgba(239,68,68,.2)",color:"#EF4444",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginTop:8}}
            onClick={function(){ if(onLogout) onLogout(); }}>
            🚪 Log Out
          </button>

          {showPrivacy && <PrivacySecurityModal session={session} onClose={()=>setShowPrivacy(false)} onLogout={onLogout} darkModeOn={darkModeOn} />}

          {/* Contact & About */}
          <div style={{marginTop:28,borderRadius:20,background:darkModeOn?"#1C2333":"#1a2744",padding:"24px 20px",textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:16}}>
              <span style={{fontSize:24}}>🚛</span>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:"#fff",letterSpacing:1}}>TruckPilot</div>
            </div>

            <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:"8px 16px",marginBottom:16}}>
              {["IFTA","Payroll","Analytics","Documents","Load Board","Tax Export","Emergency"].map(function(f){ return (
                <span key={f} style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:600}}>✓ {f}</span>
              ); })}
            </div>

            <div style={{width:"100%",height:1,background:"rgba(255,255,255,.1)",marginBottom:16}} />

            <a href="tel:4377005835" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,textDecoration:"none",marginBottom:10}}>
              <span style={{fontSize:16}}>📞</span>
              <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.85)"}}>437-700-5835</span>
            </a>
            <a href="mailto:support@truckpilot.ca" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,textDecoration:"none",marginBottom:10}}>
              <span style={{fontSize:16}}>✉️</span>
              <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.85)"}}>support@truckpilot.ca</span>
            </a>
            <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:6}}>Mon–Fri · 8AM–8PM MT</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.25)",marginTop:10}}>TruckPilot · v4.0 · © 2025 · Log Loads. Save Taxes. Stay Compliant.</div>

            {/* Language Selector */}
            <div style={{marginTop:16,display:"flex",justifyContent:"center",gap:8}}>
              {[["en","🇨🇦 EN"],["ar","🇸🇦 AR"],["fr","🇫🇷 FR"]].map(([code,label])=>(
                <button key={code} onClick={function(){ if(changeLang) changeLang(code); }}
                  style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${lang===code?"#FFD700":"rgba(255,255,255,0.3)"}`,background:lang===code?"#FFD700":"rgba(255,255,255,0.1)",color:lang===code?"#1a2744":"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  } catch(err) {
    return (
      <div style={{padding:40,textAlign:"center",color:"#333"}}>
        <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
        <div style={{fontWeight:700,marginBottom:8}}>Something went wrong</div>
        <div style={{fontSize:13,color:"#666",marginBottom:24}}>{String(err)}</div>
        <button onClick={function(){ if(onLogout) onLogout(); }} style={{padding:"12px 24px",background:"#EF4444",color:"#fff",border:"none",borderRadius:12,cursor:"pointer",fontWeight:700}}>Log Out</button>
      </div>
    );
  }
}

function BottomTabBar({ tab, setTab, isOwner, unreadMessages, inspectionAlerts=[] }) {
  const ownerTabs = [
    { id:"dashboard", icon:"🏠", label:"Home" },
    { id:"new",       icon:"➕", label:"Add Load" },
    { id:"log",       icon:"📋", label:"Load Log" },
    { id:"report",    icon:"📊", label:"Reports" },
    { id:"profile",   icon:"👤", label:"Profile" },
  ];
  const driverTabs = [
    { id:"dashboard", icon:"🏠", label:"Home" },
    { id:"new",       icon:"➕", label:"Add Load" },
    { id:"log",       icon:"📋", label:"Load Log" },
    { id:"report",    icon:"📊", label:"Reports" },
    { id:"profile",   icon:"👤", label:"Profile" },
  ];
  const tabs = isOwner ? ownerTabs : driverTabs;

  return (
    <div className="slt-bottom-nav">
      {tabs.map(t => {
        const isActive = tab === t.id;
        const badge = (t.id === "support_inbox" || t.id === "contact") && unreadMessages > 0 ? unreadMessages : 0;
        return (
          <button key={t.id} className={`slt-bottom-tab${isActive?" active":""}`} onClick={() => setTab(t.id)}>
            {badge > 0 && <span className="slt-bottom-tab-badge">{badge}</span>}
            <span className="slt-bottom-tab-icon">{t.icon}</span>
            <span className="slt-bottom-tab-label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── SKELETON LOADER ──────────────────────────────────────────────────────────
function SkeletonCard({ rows=3 }) {
  return (
    <div style={{ background:"#fff", borderRadius:14, padding:"16px 18px", marginBottom:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
      {Array.from({length:rows}).map((_,i) => (
        <div key={i} className="slt-skeleton" style={{ height:i===0?20:14, width:i===0?"60%":i===1?"80%":"40%", marginBottom:i<rows-1?10:0 }} />
      ))}
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div style={{ padding:"16px" }}>
      {[1,2,3].map(i => <SkeletonCard key={i} rows={3} />)}
    </div>
  );
}

// ─── ONBOARDING SCREEN ────────────────────────────────────────────────────────
function OnboardingScreen({ session, isOwner, onDone }) {
  const [step, setStep] = useState(0);
  
  const steps = isOwner ? [
    {
      icon: "🚛",
      title: "Welcome to TruckPilot!",
      desc: "Your fleet command center. Log loads, track drivers, and maximize your profits.",
      cta: "Let's get started"
    },
    {
      icon: "👥",
      title: "Add Your Drivers",
      desc: "Share your invite code with drivers so they can join your fleet. Go to Drivers → copy your code.",
      cta: "Got it"
    },
    {
      icon: "➕",
      title: "Post Your First Load",
      desc: "Tap Add Load to log a haul. Set the route, earnings, and assign a driver.",
      cta: "I'm ready!"
    }
  ] : [
    {
      icon: "✈️",
      title: `Welcome, ${session.fullName?.split(" ")[0] || "Driver"}!`,
      desc: "TruckPilot helps you log loads, track pay, and save on taxes. Simple and fast.",
      cta: "Let's go"
    },
    {
      icon: "➕",
      title: "Log Your Loads",
      desc: "Every load takes 30 seconds to log. Tap Add Load → pick your route → done.",
      cta: "Easy enough"
    },
    {
      icon: "💰",
      title: "Track Your Pay & Taxes",
      desc: "See your earnings and expenses in Reports. Download your tax summary anytime.",
      cta: "I'm ready!"
    }
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(160deg,#0A1628,#0D47A1)", zIndex:99999, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
      {/* Progress dots */}
      <div style={{ display:"flex", gap:8, marginBottom:48 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ width: i===step?24:8, height:8, borderRadius:4, background: i===step?"#243B6E":"rgba(255,255,255,0.3)", transition:"all 0.3s" }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ textAlign:"center", maxWidth:340 }}>
        <div style={{ fontSize:80, marginBottom:24 }}>{current.icon}</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, color:"#fff", marginBottom:16, lineHeight:1.2 }}>
          {current.title}
        </div>
        <div style={{ fontSize:15, color:"rgba(255,255,255,0.7)", lineHeight:1.7, marginBottom:48 }}>
          {current.desc}
        </div>
      </div>

      {/* CTA Button */}
      <button onClick={() => { if (isLast) onDone(); else setStep(s => s+1); }}
        style={{ background:"linear-gradient(135deg,#243B6E,#243B6E)", border:"none", borderRadius:50, color:"#fff", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, padding:"16px 48px", cursor:"pointer", boxShadow:"0 4px 24px rgba(0,188,212,0.5)" }}>
        {current.cta} →
      </button>

      {/* Skip */}
      {!isLast && (
        <button onClick={onDone} style={{ marginTop:20, background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:13, cursor:"pointer" }}>
          Skip intro
        </button>
      )}
    </div>
  );
}

function NavBar({ session, tab, setTab, setShowSettings, onLogout, isOwner, isSuperAdmin=false, unreadMessages, navItems, plan, openUpgrade, onEditProfile=()=>{}, onDarkToggle=()=>{}, darkModeOn=false }) {
  const [showProfile,setShowProfile]=useState(false);
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

  // Lock background scroll when dropdown is open
  useEffect(() => {
    if (open) {
      // Save scroll position before locking
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.dataset.scrollY = scrollY;
    } else {
      // Restore scroll position
      const scrollY = parseInt(document.body.dataset.scrollY || "0");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    }
    return () => {
      const scrollY = parseInt(document.body.dataset.scrollY || "0");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const items = navItems || [];
  const activeItem = items.find(i => i.id === tab) || items[0];
  useEffect(()=>{
    const close=(e)=>{ if(!e.target.closest(".slt-nav-right")) setShowProfile(false); };
    document.addEventListener("mousedown",close);
    return ()=>document.removeEventListener("mousedown",close);
  },[]);
  const initials = (session.fullName || session.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarGradient = isSuperAdmin
    ? "linear-gradient(135deg,#243B6E,#9C27B0)"
    : isOwner
    ? "linear-gradient(135deg,#0D47A1,#1976D2)"
    : "linear-gradient(135deg,#00695C,#00897B)";

  return (
    <nav className="slt-nav">
      <div style={{display:"flex",alignItems:"center",flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
            <rect x="9" y="2" width="14" height="22" rx="3" stroke="#FFD700" strokeWidth="1.8"/>
            <rect x="13" y="0.5" width="6" height="2.5" rx="1.2" fill="#FFD700"/>
            <circle cx="16" cy="21" r="1.5" fill="#FFD700"/>
            <line x1="4" y1="9" x2="7" y2="9" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2.5" y1="13" x2="7" y2="13" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
            <line x1="4" y1="17" x2="7" y2="17" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="13" y="7" width="4" height="6" rx="1" fill="#FFD700"/>
            <rect x="13" y="9" width="3" height="3.5" rx="0.5" fill="#1a2744"/>
            <rect x="8" y="9.5" width="6" height="4" rx="1" fill="#FFD700"/>
            <circle cx="10" cy="15" r="2" fill="#0f1a33"/>
            <circle cx="10" cy="15" r="0.8" fill="#FFD700"/>
            <circle cx="16" cy="15" r="2" fill="#0f1a33"/>
            <circle cx="16" cy="15" r="0.8" fill="#FFD700"/>
            <rect x="17" y="4" width="1.5" height="5" rx="0.75" fill="#FFD700"/>
          </svg>
          <div style={{display:"flex",alignItems:"baseline",gap:0}}>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:28,color:"#fff",letterSpacing:4,whiteSpace:"nowrap"}}>TRUCK</span>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:28,color:"#FFD700",letterSpacing:4,whiteSpace:"nowrap"}}>PILOT</span>
          </div>
        </div>
      </div>





      <div className="slt-nav-right" style={{display:"flex",alignItems:"center",gap:8}}>
        {/* Nav links for desktop only */}
        <div className="slt-desktop-nav" style={{display:"flex",gap:4,alignItems:"center"}}>
          {["dashboard","new","log","report","profile"].map(t => {
            const labels = {dashboard:"Home",new:"Add Load",log:"My Loads",report:"Reports",profile:"Profile"};
            const icons = {dashboard:"🏠",new:"➕",log:"📋",report:"📊",profile:"👤"};
            return (
              <button key={t} onClick={()=>setTab(t)}
                style={{padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                  background:tab===t?"rgba(255,255,255,.2)":"transparent",
                  color:"rgba(255,255,255,.85)",fontFamily:"'Barlow',sans-serif",whiteSpace:"nowrap"}}>
                {icons[t]} {labels[t]}
              </button>
            );
          })}
        </div>
        {/* Divider */}
        <div style={{width:1,height:20,background:"rgba(255,255,255,.2)"}} />
        {/* Dark toggle */}
        <button onClick={onDarkToggle} style={{
          padding:"7px 14px", borderRadius:30, border:"none", cursor:"pointer",
          fontSize:12, fontWeight:700,
          background:darkModeOn?"#fff":"rgba(255,255,255,.15)",
          color:darkModeOn?"#1A1A1A":"#fff",
          fontFamily:"'Barlow',sans-serif",
          display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap"
        }}>
          {darkModeOn?"☀️ Light":"🌙 Dark"}
        </button>
        {/* Sign out */}
        <button onClick={onLogout} style={{
          padding:"7px 14px", borderRadius:30, border:"1px solid rgba(255,255,255,.25)", cursor:"pointer",
          fontSize:12, fontWeight:700, background:"transparent", color:"rgba(255,255,255,.8)",
          fontFamily:"'Barlow',sans-serif", whiteSpace:"nowrap"
        }}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}


// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, loginNotifs, onDismissNotif }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("owner");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [pass, setPass] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error");
  const [loading, setLoading] = useState(false);
  // loginInput can be email or username
  const [loginInput, setLoginInput] = useState("");

  // Check for existing Supabase session on mount
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) buildSessionFromSupabase(session);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) buildSessionFromSupabase(session);
      // Ignore TOKEN_REFRESHED — prevents re-render on every token refresh
    });
    return () => subscription.unsubscribe();
  }, []);

  const buildSessionFromSupabase = async (sbSession) => {
    const uid = sbSession.user.id;
    const meta = sbSession.user.user_metadata || {};
    let ownerUid = meta.ownerUid && meta.ownerUid !== "PENDING" ? meta.ownerUid : uid;
    // Fetch profile from Supabase for accurate ownerUid
    const profile = await sbGetProfile(uid);
    if (profile) ownerUid = profile.owner_uid || uid;
    const sess = {
      uid, email: sbSession.user.email,
      fullName: profile?.name || meta.name || sbSession.user.email,
      name: profile?.name || meta.name || sbSession.user.email,
      role: profile?.role || meta.role || "owner",
      ownerUid,
      plan: profile?.plan || meta.plan || "free",
      inviteCode: profile?.invite_code || meta.inviteCode || null,
      supabase: true,
    };
    saveSession(sess);
    // Update last_seen
    try { await sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", uid); } catch(e) {}
    // Show onboarding for first-time users
    const onboardedKey = `tp-onboarded-${sess.uid}`;
    if (!localStorage.getItem(onboardedKey)) {
      // Will be handled by main app
    }
    onLogin(sess);
  };

  const showMsg = (text, type = "error") => { setMsg(text); setMsgType(type); };

  const resolveEmailFromUsername = async (input) => {
    // If input contains @, it's an email — use directly
    if (input.includes("@")) return input.trim().toLowerCase();
    // Otherwise treat as username — look up email from profiles
    const { data } = await sb.from("profiles").select("id").eq("username", input.trim().toLowerCase()).maybeSingle();
    if (!data) return null;
    // Get email from auth using the profile id
    const { data: authData } = await sb.from("profiles").select("id, name").eq("id", data.id).maybeSingle();
    // We store username→email mapping in profiles.username_email
    const { data: prof } = await sb.from("profiles").select("username_email").eq("username", input.trim().toLowerCase()).maybeSingle();
    return prof?.username_email || null;
  };

  const submit = async () => {
    setMsg(""); setLoading(true);
    try {
      if (mode === "login") {
        const input = loginInput.trim();
        if (!input || !pass.trim()) return showMsg("Enter your email or username and password.");
        let loginEmail = input;
        if (!input.includes("@")) {
          // Username login — look up their email
          const { data: prof } = await sb.from("profiles")
            .select("username_email, name")
            .eq("username", input.toLowerCase())
            .maybeSingle();
          if (!prof?.username_email) return showMsg("Username not found. Try your email instead.");
          loginEmail = prof.username_email;
        }
        const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password: pass });
        if (error) return showMsg("Wrong email/username or password. Please try again.");
      } else {
        if (!email.trim() || !pass.trim() || !fullName.trim()) return showMsg("All fields are required.");
        if (pass.length < 6) return showMsg("Password must be at least 6 characters.");
        // Username validation
        const usernameVal = username.trim().toLowerCase();
        if (usernameVal.length < 3) return showMsg("Username must be at least 3 characters.");
        if (!/^[a-z0-9_]+$/.test(usernameVal)) return showMsg("Username can only contain letters, numbers and underscores.");
        // Check username not taken
        const { data: existingUser } = await sb.from("profiles").select("id").eq("username", usernameVal).maybeSingle();
        if (existingUser) return showMsg("Username already taken. Choose another.");
        let ownerUid = null;
        const inviteCode = role === "owner" ? genCode() : null;
        if (role === "driver" && invite.trim()) {
          const code = invite.trim().toUpperCase();
          const ownerProfile = await sbGetProfileByInviteCode(code);
          if (!ownerProfile) return showMsg("Invalid invite code. Check with your fleet owner.");
          ownerUid = ownerProfile.id;
        }
        // If no invite code, driver signs up solo — can join fleet later
        const { data, error } = await sb.auth.signUp({
          email: email.trim(), password: pass,
          options: { data: { name: fullName.trim(), role, ownerUid: ownerUid || "PENDING", plan: "free", inviteCode } }
        });
        if (error) return showMsg(error.message);
        console.log("SignUp data:", JSON.stringify({user: data.user?.id, session: data.session?.user?.id, identities: data.user?.identities?.length}));
        const userId = data.user?.id || data.session?.user?.id;
        if (userId) {
          const uid = userId;
          const finalOwnerUid = ownerUid || uid;
          await sbSaveProfile({
            id: uid, name: fullName.trim(), role,
            owner_uid: finalOwnerUid, plan: "free",
            invite_code: inviteCode,
            username: usernameVal,
            username_email: email.trim().toLowerCase()
          });
          // Send welcome email
          try {
            const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/resend-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ to: email.trim(), name: fullName.trim() }),
            });
            const emailData = await emailRes.json();
            console.log("Welcome email response:", JSON.stringify(emailData));
          } catch(e) { console.log("Welcome email failed:", e); }
          const { error: signInErr } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
          if (signInErr) {
            showMsg("Account created! Please sign in.", "success");
            setMode("login");
          }
        }
      }
    } catch (e) {
      showMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const authInput = { width: "100%", padding: "12px 15px", border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.07)", outline: "none", fontFamily: "'Barlow',sans-serif", marginBottom: 14, boxSizing: "border-box" };
  const authLabel = { display: "block", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontFamily: "'Barlow',sans-serif", letterSpacing: 0.3 };

  return (
    <div className="slt-auth-bg">
      {/* Login screen notifications */}
      {loginNotifs && loginNotifs.map((n, idx) => {
        const colors = { update:"#243B6E", maintenance:"#B45309", announcement:"#166534", info:"#1e3a5f" };
        const icons  = { update:"🚀", maintenance:"🔧", announcement:"📣", info:"💬" };
        return (
          <div key={n.id} style={{
            position:"fixed", top: idx * 52, left:0, right:0, zIndex:9999,
            background: colors[n.type]||"#1e3a5f", color:"#fff",
            padding:"12px 48px 12px 16px", fontSize:14, fontWeight:700,
            display:"flex", alignItems:"center", gap:10,
            boxShadow:"0 2px 8px rgba(0,0,0,0.2)"
          }}>
            <span style={{fontSize:18}}>{icons[n.type]||"💬"}</span>
            <div style={{flex:1}}>
              {n.title && <span style={{fontWeight:900, marginRight:8}}>{n.title}:</span>}
              {n.message}
            </div>
            <button onClick={()=>onDismissNotif&&onDismissNotif(n.id)} style={{
              position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
              background:"rgba(255,255,255,0.2)", border:"none", color:"#fff",
              borderRadius:"50%", width:28, height:28, fontSize:16, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900
            }}>✕</button>
          </div>
        );
      })}
      <div style={{ width: "100%", maxWidth: 440, position: "relative" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "18px 28px", marginBottom: 16, width: "100%" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="2" width="14" height="22" rx="3" stroke="#FFD700" strokeWidth="1.8"/>
                <rect x="13" y="0.5" width="6" height="2.5" rx="1.2" fill="#FFD700"/>
                <circle cx="16" cy="21" r="1.5" fill="#FFD700"/>
                <line x1="4" y1="9" x2="7" y2="9" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="2.5" y1="13" x2="7" y2="13" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="4" y1="17" x2="7" y2="17" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="13" y="7" width="4" height="6" rx="1" fill="#FFD700"/>
                <rect x="13" y="9" width="3" height="3.5" rx="0.5" fill="#1a2744"/>
                <rect x="8" y="9.5" width="6" height="4" rx="1" fill="#FFD700"/>
                <circle cx="10" cy="15" r="2" fill="#0f1a33"/>
                <circle cx="10" cy="15" r="0.8" fill="#FFD700"/>
                <circle cx="16" cy="15" r="2" fill="#0f1a33"/>
                <circle cx="16" cy="15" r="0.8" fill="#FFD700"/>
                <rect x="17" y="4" width="1.5" height="5" rx="0.75" fill="#FFD700"/>
              </svg>
              <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, color: "#fff", letterSpacing: 6 }}>TRUCK</span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, color: "#FFD700", letterSpacing: 6 }}>PILOT</span>
              </div>
            </div>
            {/* Tagline */}
            <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap", textAlign: "center" }}>
              Log Loads · Save Taxes · Stay Compliant
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="slt-auth-card">
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
            {[["login","Sign In"],["register","Create Account"]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setMsg(""); }}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: mode === m ? "#fff" : "transparent", color: mode === m ? C.navy : "rgba(255,255,255,0.6)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Barlow',sans-serif", transition: "all 0.2s" }}>
                {l}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[["owner","🔑 Owner"],["driver","🚛 Driver"]].map(([r, l]) => (
                <button key={r} onClick={() => setRole(r)}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${role === r ? "#FFD700" : "rgba(255,255,255,0.25)"}`, background: role === r ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.08)", color: role === r ? "#FFD700" : "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: 1 }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* LOGIN — email or username */}
          {mode === "login" && (
            <div><label style={authLabel}>Email or Username</label><input className="slt-input" value={loginInput} onChange={e => setLoginInput(e.target.value)} placeholder="you@email.com or your_username" style={authInput} onKeyDown={e=>{if(e.key==="Enter")submit();}}/></div>
          )}

          {/* REGISTER fields */}
          {mode === "register" && (
            <>
              <div><label style={authLabel}>Full Name</label><input className="slt-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={authInput} /></div>
              <div><label style={authLabel}>Email Address</label><input className="slt-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={authInput} /></div>
              <div><label style={authLabel}>Username <span style={{fontWeight:400,opacity:0.6}}>(for quick login)</span></label><input className="slt-input" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="e.g. john_driver" style={authInput} /></div>
            </>
          )}

          <div><label style={authLabel}>Password</label><input className="slt-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder={mode==="register"?"Min. 6 characters":"Enter password"} style={authInput} onKeyDown={e=>{if(e.key==="Enter")submit();}}/></div>
          {mode === "register" && role === "driver" && (
            <div>
              <label style={authLabel}>Owner Invite Code <span style={{fontWeight:400,opacity:0.6}}>(optional — you can join a fleet later)</span></label>
              <input className="slt-input" value={invite} onChange={e => setInvite(e.target.value.toUpperCase())} placeholder="Leave blank to sign up solo" style={{ ...authInput, textTransform: "uppercase", letterSpacing: invite ? 6 : 1, textAlign: "center", fontSize: invite ? 16 : 13 }} />
            </div>
          )}

          {msg && <div style={{ background: msgType==="success"?"rgba(0,137,123,0.2)":"rgba(229,57,53,0.15)", border: `1px solid ${msgType==="success"?"rgba(0,137,123,0.5)":"rgba(229,57,53,0.35)"}`, borderRadius: 9, padding: "10px 14px", color: msgType==="success"?"#80cbc4":"#ff8a80", fontSize: 13, marginBottom: 14, fontFamily: "'Barlow',sans-serif" }}>{msg}</div>}

          <button className="slt-btn-primary" onClick={submit} disabled={loading} style={{ width: "100%", padding: "13px", fontSize: 15, borderRadius: 10, opacity: loading?0.7:1 }}>
            {loading ? "⏳ Please wait…" : mode === "login" ? "→ Sign In" : "→ Create Account"}
          </button>

          {mode === "login" && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={async () => {
                const emailVal = loginInput.trim();
                if (!emailVal) { showMsg("Enter your email address first."); return; }
                if (!emailVal.includes("@")) { showMsg("Please enter your email address (not username) to reset password."); return; }
                setLoading(true);
                const { error } = await sb.auth.resetPasswordForEmail(emailVal, { redirectTo: window.location.origin });
                setLoading(false);
                if (error) return showMsg(error.message);
                showMsg("✅ Reset link sent! Check your email.", "success");
              }} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "'Barlow',sans-serif" }}>
                Forgot Password?
              </button>
            </div>
          )}
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, fontFamily: "'Barlow',sans-serif" }}>
              🔒 Secured by Supabase · Works on all devices
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── BACK BUTTON ─────────────────────────────────────────────────────────────
function BackButton({ onBack, label }) {
  return (
    <button onClick={onBack} style={{
      display:"flex", alignItems:"center", gap:6,
      background:"none", border:"none", cursor:"pointer",
      padding:"10px 16px", fontSize:15, fontWeight:700,
      color:"#243B6E", fontFamily:"'Barlow',sans-serif"
    }}>
      <span style={{fontSize:20, lineHeight:1}}>‹</span>
      <span>{label || "Back"}</span>
    </button>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
/* eslint-disable */
/**
 * TruckPilot — Redesigned DashboardTab
 * Drop-in replacement for the DashboardTab function in your App.jsx
 *
 * HOW TO INTEGRATE:
 *   1. Copy this entire function (and the helper CSS block at the bottom)
 *   2. In your App.jsx, find: function DashboardTab({ ... })
 *   3. Replace that entire function with this one
 *   4. Paste the <style> block into your GlobalCSS component (or a <style> tag)
 */

function DashboardTab({
  session, loads, rates, isOwner, setTab, allDrivers, trucks,
  plan, openUpgrade, inspectionAlerts = [], onClearAlert,
  setShowAI = () => {}, setAIMode = () => {}
}) {
  const [bonusAlerts, setBonusAlerts] = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("tp-dark") === "1";
  });
  const [docAlertDismissed, setDocAlertDismissed] = useState(() => sessionStorage.getItem("tp-doc-alert-dismissed") === "1");
  const [expiringDocs, setExpiringDocs] = useState([]);

  useEffect(() => {
    // Check existing docs from localStorage for expiry
    const docsKey = `tp-docs-${session.uid}`;
    try {
      const docs = JSON.parse(localStorage.getItem(docsKey) || "[]");
      const today = new Date();
      const expiring = docs.filter(d => {
        if (!d.expiry) return false;
        const diff = (new Date(d.expiry) - today) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      });
      setExpiringDocs(expiring);
    } catch(e) {}
  }, [session.uid]);

  useEffect(() => {
    if (isOwner) return;
    sbGetExpenses(session.uid).then(exps => {
      setBonusAlerts(exps.filter(e => e.category === "bonus" && e.source === "bonus" && !e.paid));
    }).catch(() => {});
  }, [session.uid, isOwner]);

  const toggleDark = () => {
    setDarkMode(d => {
      localStorage.setItem("tp-dark", d ? "0" : "1");
      return !d;
    });
  };

  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid || l.user_id === session.uid);
  const active = myLoads.filter(l => !l.completed);
  const done = myLoads.filter(l => l.completed);
  const gross = myLoads.reduce((s, l) => {
    const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
    return s + Number(l.earnings || 0) + wm / 60 * (Number(rates.companyWaitRate) || 0);
  }, 0);
  const drvPay = myLoads.reduce((s, l) => {
    const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
    const waitPay = wm / 60 * (Number(rates.driverWaitRate) || 0);
    return s + Number(l.driverBasePay||0) + waitPay;
  }, 0);
  const totalExp = getStored(expensesKey(session.uid)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const today = todayStr();
  const todayLoads = myLoads.filter(l => l.date === today);
  const recent = [...myLoads].sort((a, b) => b.date > a.date ? 1 : -1).slice(0, 6);

  const todayEarnings = todayLoads.reduce((s, l) => {
    const wm = (Number(l.loadWaitMins)||0) + (Number(l.offloadWaitMins)||0);
    const waitPay = wm / 60 * (Number(rates.driverWaitRate)||0);
    if (isOwner) {
      const ownerWait = wm / 60 * (Number(rates.companyWaitRate)||0);
      return s + Number(l.earnings||0) + ownerWait;
    }
    const basePay = Number(l.driverBasePay) > 0 ? Number(l.driverBasePay) : Number(l.earnings||0);
    return s + basePay + waitPay;
  }, 0);

  const streak = (() => {
    let count = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (myLoads.some(l => l.date === ds)) { count++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  })();

  // Build 7-day bar chart data
  const weekBars = (() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayLoads = myLoads.filter(l => l.date === ds);
      const earn = dayLoads.reduce((s, l) => s + Number(l.earnings || 0), 0);
      return { label: days[d.getDay()], earn, isToday: ds === today };
    });
  })();
  const maxEarn = Math.max(...weekBars.map(b => b.earn), 1);

  // Color palette
  const ORANGE = "#243B6E";
  const bg = darkMode ? "#141414" : "#F4F1EC";
  const cardBg = darkMode ? "#1E1E1E" : "#FFFFFF";
  const cardBorder = darkMode ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)";
  const textPrimary = darkMode ? "#F0EDE8" : "#1A1A1A";
  const textMuted = darkMode ? "rgba(240,237,232,.4)" : "rgba(26,26,26,.4)";
  const altBg = darkMode ? "#272727" : "#F4F1EC";
  const heroLine = darkMode ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.3)";

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
  })();
  const firstName = (session.fullName || session.name || "").split(" ")[0];

  const planLabel = isOwner
    ? (plan === "pro" ? "🚀 Owner Pro" : plan === "basic" ? "💼 Hauler" : "⭐ Beta")
    : (plan === "pro" ? "🚀 Fleet Pro" : plan === "basic" ? "💼 Hauler" : "⭐ Beta");

  const S = {
    root: { fontFamily: "'DM Sans', 'Barlow', sans-serif", background: bg, minHeight: "100vh", color: textPrimary, transition: "background .3s, color .3s" },
    scroll: { padding: "16px 16px 100px" },
    // Top bar
    topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    greeting: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 27, fontWeight: 900, lineHeight: 1.15, color: textPrimary },
    greetOrange: { color: ORANGE },
    sectionLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: textMuted, marginBottom: 6 },
    // Pills
    streakPill: { background: "rgba(36,59,110,.12)", color: ORANGE, padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
    planPill: { background: plan==="pro"?"#166534":plan==="basic"?"#1e3a5f":"#92400e", color: "#fff", padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
    modeBtn: { padding: "7px 16px", borderRadius: 30, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: darkMode ? "#fff" : "#1A1A1A", color: darkMode ? "#1A1A1A" : "#fff", fontFamily: "inherit" },
    // Hero card
    hero: { borderRadius: 22, padding: "28px 22px", background: ORANGE, color: "#fff", marginBottom: 14, textAlign: "center" },
    heroRevenue: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 900, lineHeight: 1, margin: "6px 0 2px" },
    heroSub: { fontSize: 13, color: "rgba(255,255,255,.65)" },
    heroLine: { width: "100%", height: 1, background: heroLine, margin: "16px 0" },
    heroStats: { display: "flex", justifyContent: "space-between" },
    heroStatVal: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: "#fff" },
    heroStatLbl: { fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.55)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 },
    heroDivider: { width: 1, background: "rgba(255,255,255,.2)", alignSelf: "stretch", margin: "2px 0" },
    ctaBtn: { width: "100%", padding: "14px", borderRadius: 50, background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)", color: "#fff", border: "2px solid rgba(255,255,255,.3)", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 16, marginTop: 14, letterSpacing: ".02em" },
    // Stat row
    statRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 },
    statMini: { borderRadius: 16, padding: "14px 16px", background: cardBg, border: `1px solid ${cardBorder}` },
    statNum: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 900, color: ORANGE, lineHeight: 1.1 },
    statLbl: { fontSize: 10, fontWeight: 600, color: textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 },
    // Card
    card: { borderRadius: 18, padding: "18px 20px", background: cardBg, border: `1px solid ${cardBorder}`, marginBottom: 14 },
    sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    sectionTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800, color: textPrimary },
    seeAll: { fontSize: 12, color: ORANGE, fontWeight: 700, cursor: "pointer", background: "none", border: "none" },
    // Chart
    barsWrap: { display: "flex", alignItems: "flex-end", gap: 6, height: 80, marginTop: 8 },
    barLbls: { display: "flex", justifyContent: "space-around", marginTop: 6 },
    // Load item
    loadItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${cardBorder}` },
    loadItemLast: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0 0" },
    truckIcon: { width: 40, height: 40, borderRadius: 12, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 },
    loadInfo: { flex: 1, minWidth: 0 },
    loadId: { fontSize: 13, fontWeight: 700, color: textPrimary, lineHeight: 1.2 },
    loadRoute: { fontSize: 12, color: textMuted, marginTop: 1 },
    loadAmount: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 900, color: ORANGE },
    badgeDone: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,.12)", color: "#16a34a" },
    badgeActive: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(36,59,110,.12)", color: ORANGE },
    // AI card



    // Alert
    alertBanner: { borderRadius: 14, padding: "14px 16px", background: darkMode ? "rgba(36,59,110,.15)" : "#FFF3EE", border: `2px solid ${ORANGE}`, marginBottom: 14, display: "flex", alignItems: "center", gap: 12 },
  };

  return (
    <div style={S.root}>
      <div style={S.scroll}>
        {/* ── Top Bar ── */}
        <div style={S.topBar}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {streak >= 2 && <span style={S.streakPill}>🔥 {streak} day streak</span>}
          </div>
        </div>

        {/* ── Document Expiry Alert (once per session, dismissable) ── */}
        {!docAlertDismissed && expiringDocs.length > 0 && (
          <div style={{ background:"#FFF8E1", border:"2px solid #B45309", borderRadius:14, padding:"14px 16px", marginBottom:14, display:"flex", alignItems:"flex-start", gap:12 }}>
            <span style={{ fontSize:24, flexShrink:0 }}>⚠️</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, color:"#B45309", marginBottom:4 }}>Document Expiry Alert</div>
              {expiringDocs.map(d => {
                const days = Math.ceil((new Date(d.expiry) - new Date()) / (1000*60*60*24));
                return <div key={d.id} style={{ fontSize:13, color: days < 0 ? "#EF4444" : "#B45309", marginBottom:2 }}>• {d.name} — {days < 0 ? "EXPIRED" : `${days} days left`}</div>;
              })}
              <button onClick={()=>setTab("documents")} style={{ marginTop:8, padding:"6px 14px", background:"#B45309", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>📁 View Documents</button>
            </div>
            <button onClick={()=>{ setDocAlertDismissed(true); sessionStorage.setItem("tp-doc-alert-dismissed","1"); }} style={{ background:"none", border:"none", color:"#B45309", cursor:"pointer", fontSize:20, padding:"0 4px", flexShrink:0 }}>✕</button>
          </div>
        )}

        {/* ── Bonus Alerts (Driver) ── */}
        {!isOwner && bonusAlerts.length > 0 && bonusAlerts.map(b => (
          <div key={b.id} style={S.alertBanner}>
            <span style={{ fontSize: 28 }}>🎁</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 15, color: ORANGE }}>You have a bonus!</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 20, color: textPrimary }}>${Number(b.amount || 0).toFixed(2)}</div>
              <div style={{ fontSize: 12, color: textMuted }}>{b.description?.replace("🎁 Bonus: ", "")}</div>
            </div>
            <div style={{ background: ORANGE, color: "#fff", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 800 }}>Added</div>
          </div>
        ))}

        {/* ── Inspection Alerts (Owner) ── */}
        {isOwner && inspectionAlerts.filter(a => !a.read).length > 0 && (
          <div style={{ ...S.alertBanner, background: darkMode ? "rgba(239,68,68,.15)" : "#FFF5F5", borderColor: "#EF4444" }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 14, color: "#EF4444" }}>
                {inspectionAlerts.filter(a => !a.read).length} Inspection Issue{inspectionAlerts.filter(a => !a.read).length > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 12, color: textMuted }}>Tap to review reported issues</div>
            </div>
            <button onClick={() => setTab("inspection")}
              style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              View →
            </button>
          </div>
        )}

        {/* ── Hero Revenue Card ── */}
        <div style={S.hero}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
            Today's {isOwner ? "Revenue" : "Pay"}
          </div>
          <div style={{ ...S.heroRevenue, fontSize: 60, letterSpacing: "-1px" }}>{fmtC(todayEarnings)}</div>
          <div style={{ ...S.heroSub, marginTop: 6, fontSize: 13, color: "rgba(255,255,255,.65)" }}>{todayLoads.length} load{todayLoads.length !== 1 ? "s" : ""} today</div>

          <div style={S.heroLine} />

          <div style={S.heroStats}>
            {(isOwner
              ? [["Gross", fmtC(gross)], ["Completed", done.length], ["Active", active.length], ["Drivers", allDrivers.length]]
              : [["Total Pay", fmtC(drvPay)], ["Completed", done.length], ["Active", active.length], ["Expenses", fmtC(totalExp)]]
            ).map(([lbl, val], i, arr) => (
              <div key={lbl} style={{display:"contents"}}>
                <div style={{ textAlign: "center" }}>
                  <div style={S.heroStatVal}>{val}</div>
                  <div style={S.heroStatLbl}>{lbl}</div>
                </div>
                {i < arr.length - 1 && <div style={S.heroDivider} />}
              </div>
            ))}
          </div>

          <button style={S.ctaBtn} onClick={() => setTab("new")}>
            ➕ {isOwner ? "Add Load" : "Add Load"}
          </button>
        </div>

        {/* ── Quick Stats Row ── */}
        <div style={S.statRow}>
          {[
            ["Avg / Load", myLoads.length > 0 ? fmtC((isOwner ? gross : drvPay) / myLoads.length) : "$0", null],
            ["vs Last Wk", "+12%", null],
            ["Total Miles", "942", null],
          ].map(([lbl, val]) => (
            <div key={lbl} style={S.statMini}>
              <div style={S.statNum}>{val}</div>
              <div style={S.statLbl}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Pay Day Banner ── */}
        {(()=>{
          const ps = rates.periodStart ? new Date(rates.periodStart+"T12:00:00") : null;
          const pe = rates.periodEnd   ? new Date(rates.periodEnd+"T12:00:00")   : null;
          const pd = rates.payDate     ? new Date(rates.payDate+"T12:00:00")     : null;
          const now = new Date();
          const daysUntilPay = pd ? Math.ceil((pd - now) / (1000*60*60*24)) : null;
          const fmt = d => d.toLocaleDateString("en-CA",{month:"short",day:"numeric"});
          const periodLoads = (ps && pe) ? myLoads.filter(l => {
            if (!l.date) return false;
            const ld = new Date(l.date+"T12:00:00");
            return ld >= ps && ld <= pe;
          }) : myLoads;
          const ownerEarnings = periodLoads.reduce((s,l) => { const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); const wComp=wm/60*(Number(rates.companyWaitRate)||0); return s + Number(l.earnings||0) + wComp; }, 0);
          // Count all loads with driver pay that were not posted by the owner themselves
          const totalDriverPay = periodLoads.filter(l => Number(l.driverBasePay||0) > 0 && (l.addedBy !== session.uid && l.user_id !== session.uid)).reduce((s,l) => { const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); const wDrv=wm/60*(Number(rates.driverWaitRate)||0); return s + Number(l.driverBasePay||0) + wDrv; }, 0);
          const myDriverPay = periodLoads.reduce((s,l) => { const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); const wDrv=wm/60*(Number(rates.driverWaitRate)||0); return s + Number(l.driverBasePay||0) + wDrv; }, 0);
          if (!pd && !ps) return null;
          return isOwner ? (
            <div style={{borderRadius:20,background:"linear-gradient(135deg,#1a2744,#243B6E)",padding:"20px",marginBottom:14,color:"#fff"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>💵 PAY DAY</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:48,fontWeight:900,color:"#FFD700",lineHeight:1}}>
                {pd ? fmt(pd) : "Not set"}
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginTop:4,marginBottom:16}}>
                {daysUntilPay !== null ? (daysUntilPay > 0 ? `in ${daysUntilPay} day${daysUntilPay!==1?"s":""}` : daysUntilPay === 0 ? "🎉 Today!" : `${Math.abs(daysUntilPay)} days ago`) : ""}
                {ps && pe ? ` · Period: ${fmt(ps)} → ${fmt(pe)}` : ""}
              </div>
              <div style={{height:1,background:"rgba(255,255,255,0.15)",marginBottom:16}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>You Owe Drivers</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"#FF6B6B"}}>{fmtC(totalDriverPay)}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>{periodLoads.length} load{periodLoads.length!==1?"s":""} this period</div>
                </div>
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Your Earnings</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"#69f0ae"}}>{fmtC(ownerEarnings)}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>gross revenue</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{borderRadius:20,background:"linear-gradient(135deg,#14532d,#166534)",padding:"20px",marginBottom:14,color:"#fff"}}>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>💰 YOUR PAY DAY</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:48,fontWeight:900,color:"#FFD700",lineHeight:1}}>
                {pd ? fmt(pd) : "Not set"}
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginTop:4,marginBottom:16}}>
                {daysUntilPay !== null ? (daysUntilPay > 0 ? `in ${daysUntilPay} day${daysUntilPay!==1?"s":""}` : daysUntilPay === 0 ? "🎉 Today!" : `${Math.abs(daysUntilPay)} days ago`) : ""}
                {ps && pe ? ` · Period: ${fmt(ps)} → ${fmt(pe)}` : ""}
              </div>
              <div style={{height:1,background:"rgba(255,255,255,0.15)",marginBottom:16}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>You'll Get Paid</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"#69f0ae"}}>{fmtC(myDriverPay)}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>{periodLoads.length} load{periodLoads.length!==1?"s":""} this period</div>
                </div>
                <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:"14px 16px"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Loads Done</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900,color:"#fff"}}>{periodLoads.filter(l=>l.completed).length}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>of {periodLoads.length} total</div>
                </div>
              </div>
            </div>
          );
        })()}

                {/* ── Daily Earnings Bar Chart ── */}
        <div style={S.card}>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Daily Earnings</div>
            <span style={S.seeAll}>This Week</span>
          </div>
          <div style={S.barsWrap}>
            {weekBars.map((b, i) => (
              <div key={i} style={{
                flex: 1,
                height: `${Math.max(b.earn / maxEarn * 100, b.earn > 0 ? 8 : 4)}%`,
                borderRadius: "6px 6px 0 0",
                background: b.isToday ? ORANGE : (darkMode ? "rgba(36,59,110,.18)" : "rgba(36,59,110,.15)"),
                cursor: "pointer",
                transition: "all .2s",
                minHeight: 4,
              }} />
            ))}
          </div>
          <div style={S.barLbls}>
            {weekBars.map((b, i) => (
              <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: b.isToday ? 700 : 500, color: b.isToday ? ORANGE : textMuted }}>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Today's Loads ── */}
        <div style={S.card}>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Today's Loads</div>
            <button style={S.seeAll} onClick={() => setTab("new")}>+ New Load</button>
          </div>
          {todayLoads.length === 0
            ? <div style={{ textAlign: "center", padding: "20px 0", color: textMuted, fontSize: 13 }}>No loads today — start logging!</div>
            : todayLoads.map((l, idx) => (
              <div key={l.id} style={idx < todayLoads.length - 1 ? S.loadItem : S.loadItemLast}>
                <div style={S.truckIcon}>🚛</div>
                <div style={S.loadInfo}>
                  <div style={S.loadId}>{l.location}</div>
                  <div style={S.loadRoute}>{l.truckNumber ? `TRK-${l.truckNumber} · ` : ""}{l.time || l.date}</div>
                </div>
                <span style={l.completed ? S.badgeDone : S.badgeActive}>{l.completed ? "Done" : "Active"}</span>
              </div>
            ))
          }
        </div>

        {/* ── Per Load Breakdown ── */}
        <div style={S.card}>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>Load Breakdown</div>
            <button style={S.seeAll} onClick={() => setTab("log")}>View All</button>
          </div>
          {recent.length === 0
            ? <div style={{ textAlign: "center", padding: "20px 0", color: textMuted, fontSize: 13 }}>No loads yet</div>
            : recent.map((l, idx) => (
              <div key={l.id} style={idx < recent.length - 1 ? S.loadItem : S.loadItemLast}>
                <div style={S.truckIcon}>🚛</div>
                <div style={S.loadInfo}>
                  <div style={S.loadId}>{l.location}</div>
                  <div style={S.loadRoute}>{l.date}</div>
                </div>
                <div style={S.loadAmount}>{fmtC(Number(l.earnings || 0))}</div>
              </div>
            ))
          }
        </div>



        {/* ── Quick Actions ── */}
        <div style={S.card}>
          <div style={S.sectionHead}>
            <div style={S.sectionTitle}>⚡ Quick Actions</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8 }}>
            {(isOwner
              ? [["Add Load", "new", "➕"], ["Drivers", "drivers", "👥"], ["Reports", "report", "📊"], ["Expenses", "expenses", "🧾"], ["Payroll", "payroll", "💵"], ["Tax", "tax", "🗂"]]
              : [["Add Load", "new", "➕"], ["Load Log", "log", "📋"], ["Expenses", "expenses", "🧾"], ["Reports", "report", "📊"]]
            ).map(([label, goTab, icon]) => (
              <button key={goTab} onClick={() => setTab(goTab)}
                style={{ padding: "14px 10px", borderRadius: 16, border: `1px solid ${cardBorder}`, background: altBg, cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                <div style={{ fontSize: 20, marginBottom: 5 }}>{icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: textPrimary }}>{label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Weather Alert ── */}
        <WeatherAlertBanner />

        {/* ── Need Help Card ── */}
        <div style={{
          borderRadius: 18, overflow: "hidden", marginBottom: 14,
          background: "#1a2744"
        }}>
          <div style={{ padding: "18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <span style={{ fontSize:22 }}>🆘</span>
              <div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:17, color:"#fff" }}>Need Help?</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", marginTop:1 }}>TruckPilot Support · Mon–Fri 8AM–8PM</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <a href="tel:4377005835" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px", borderRadius:12, background:"rgba(255,255,255,.12)", textDecoration:"none" }}>
                <span style={{ fontSize:18 }}>📞</span>
                <span style={{ fontWeight:700, fontSize:13, color:"#fff" }}>437-700-5835</span>
              </a>
              <a href="mailto:support@truckpilot.ca" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px", borderRadius:12, background:"rgba(255,255,255,.12)", textDecoration:"none" }}>
                <span style={{ fontSize:18 }}>✉️</span>
                <span style={{ fontWeight:700, fontSize:13, color:"#fff" }}>Email Us</span>
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── HAUL LOG ─────────────────────────────────────────────────────────────────
function HaulLogTab({ session, loads, rates, isOwner, trucks, setTab, setEditLoad, deleteLoad, setDetailLoad, toggleComplete, allDrivers=[] }) {
  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid===session.uid||l.addedBy===session.uid||l.user_id===session.uid);
  const [filter, setFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const filteredByDriver = isOwner && driverFilter !== "all"
    ? myLoads.filter(l => {
        if (driverFilter === "owner") {
          return !l.assignedDriverUid || l.assignedDriverUid === session.uid;
        }
        const driver = allDrivers.find(d => d.uid === driverFilter);
        return l.assignedDriverUid === driverFilter
          || l.addedBy === driverFilter
          || l.user_id === driverFilter
          || (driver && l.driverFullName === (driver.fullName || driver.name));
      })
    : myLoads;
  const filtered = filteredByDriver.filter(l => filter==="active"?!l.completed:filter==="done"?l.completed:true).sort((a,b)=>b.date>a.date?1:-1);
  const activeCount = myLoads.filter(l=>!l.completed).length;

  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">{isOwner?"Load Log":"Load Log"}</div>
        <div className="slt-hero-sub">{myLoads.length} total · <span style={{color:"#FFD54F",fontWeight:700}}>{activeCount} active</span></div>
      </div>
      <div className="slt-container" style={{padding:"16px 14px 80px"}}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12 }}>
          <div style={{ display:"flex",gap:8 }}>
            {[["active","⬤ Active"],["done","✓ Done"],["all","All"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)} className="slt-btn-secondary"
                style={{ background:filter===v?(v==="active"?C.orange:v==="done"?C.green:C.blue):"#fff", color:filter===v?"#fff":C.textMed, borderColor:filter===v?(v==="active"?C.orange:v==="done"?C.green:C.blue):C.border, padding:"8px 16px" }}>
                {l}{v==="active"&&activeCount>0?` (${activeCount})`:""}
              </button>
            ))}
          </div>
        </div>
        {isOwner&&allDrivers.length>0&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            <span style={{fontSize:12,fontWeight:700,color:C.textMed,alignSelf:"center"}}>Driver:</span>
            {[["all","👥 All"],["owner","👤 Me"],...allDrivers.map(d=>[d.uid,d.fullName||d.name])].map(([v,l])=>(
              <button key={v} onClick={()=>setDriverFilter(v)} className="slt-btn-secondary"
                style={{padding:"6px 12px",fontSize:12,background:driverFilter===v?C.navy:"#fff",color:driverFilter===v?"#fff":C.textMed,borderColor:driverFilter===v?C.navy:C.border}}>{l}</button>
            ))}
          </div>
        )}

        {filtered.length===0
          ? <div style={{ textAlign:"center",padding:"48px 24px",background:"#fff",borderRadius:16,margin:"0 0 12px" }}>
              <div style={{fontSize:64,marginBottom:16}}>{filter==="active"?"✅":"🚛"}</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,color:C.navy,marginBottom:8}}>
                {filter==="active"?"You're all caught up!":"No loads yet"}
              </div>
              <div style={{fontSize:13,color:C.textLight,marginBottom:20,lineHeight:1.6}}>
                {filter==="active"
                  ?"All your active loads are complete. Great work! 🎉"
                  :"Start logging your loads to track earnings and stay compliant."}
              </div>
              {filter!=="active"&&(
                <button onClick={()=>setTab("new")} style={{background:"linear-gradient(135deg,#243B6E,#243B6E)",border:"none",borderRadius:50,color:"#fff",fontWeight:800,fontSize:14,padding:"12px 28px",cursor:"pointer"}}>
                  ➕ Log Your First Load
                </button>
              )}
            </div>
          : filtered.map(l => {
            const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
            const loadWm=Number(l.loadWaitMins)||0;
            const offWm=Number(l.offloadWaitMins)||0;
            const truck=trucks.find(t=>t.id===l.truckId);
            const waitOwner=wm/60*(Number(rates.companyWaitRate)||0);
            const waitDrv=wm/60*(Number(rates.driverWaitRate)||0);
            // Owner sees gross earnings only — never driver pay on their own loads
            const amt = isOwner
              ? Number(l.earnings||0) + waitOwner
              : Number(l.driverBasePay||0) + waitDrv;
            return (
              <SwipeableLoadCard key={l.id} load={l} onComplete={()=>!l.completed&&toggleComplete(l.id,true)} onClick={()=>setDetailLoad(l)}>
                {/* Badges row */}
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
                  {l.tmwLoadNumber&&<span style={{background:"#243B6E",color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>TMW #{l.tmwLoadNumber}</span>}
                  <span className={l.completed?"slt-badge-green":"slt-badge-orange"}>{l.completed?"✓ Done":"⬤ Active"}</span>
                </div>
                {/* Route + Amount row - aligned together */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,color:"#1A1A1A"}}>{l.location}</div>
                    {l.time&&<div style={{fontSize:11,fontWeight:600,color:"#888",marginTop:1}}>🛬 {(()=>{const [h,m]=l.time.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;})()}</div>}
                  </div>
                  <div style={{textAlign:"right",fontFamily:"'Barlow Condensed',sans-serif",flexShrink:0,marginLeft:12}}>
                    {!isOwner&&<div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Your Pay</div>}
                    {(loadWm>0||offWm>0) ? (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                        <div style={{fontSize:22,fontWeight:900,color:"#243B6E"}}>{fmtC(amt)}</div>
                        <div style={{borderBottom:"2px solid #243B6E",width:"100%",marginBottom:2}}/>
                        {offWm>0&&<div style={{fontSize:13,fontWeight:700,color:"#EF4444"}}>{fmtC(parseFloat((offWm/60*(Number(isOwner?rates.companyWaitRate:rates.driverWaitRate)||0)).toFixed(2)))} <span style={{fontSize:10,fontWeight:600,color:"#888"}}>offload</span></div>}
                        {loadWm>0&&<div style={{fontSize:13,fontWeight:700,color:"#22C55E"}}>+ {fmtC(parseFloat((loadWm/60*(Number(isOwner?rates.companyWaitRate:rates.driverWaitRate)||0)).toFixed(2)))} <span style={{fontSize:10,fontWeight:600,color:"#888"}}>load</span></div>}
                      </div>
                    ) : (
                      <div style={{fontSize:22,fontWeight:900,color:"#243B6E"}}>{fmtC(amt)}</div>
                    )}
                  </div>
                </div>
                <div style={{fontSize:13,color:"#444",fontWeight:500,marginBottom:2,marginTop:1}}>
                  {(() => {
                    const fmt12 = (t) => { if(!t) return null; const [h,m]=t.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; };
                    const arrival = fmt12(l.time);
                    const appt = fmt12(l.appointmentTime);
                    const done = fmt12(l.completedTime);
                    return (
                      <>
                        {l.date}{truck?` · ${truck.truckNumber}`:""}{isOwner&&l.driverFullName?` · ${l.driverFullName}`:""}
                        {(appt||arrival||done) && (
                          <div style={{marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                            {appt&&<span style={{fontSize:12,color:"#888"}}>📅 Appt: <strong style={{color:"#444"}}>{appt}</strong></span>}
                            {arrival&&<span style={{fontSize:12,color:"#888"}}>🛬 Arrived: <strong style={{color:"#22C55E"}}>{arrival}</strong></span>}
                            {done&&<span style={{fontSize:12,color:"#888"}}>✅ Done: <strong style={{color:"#243B6E"}}>{done}</strong></span>}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {l.messages&&l.messages.length>0&&<div style={{fontSize:12,color:C.blue,marginBottom:4}}>💬 {l.messages.length} note{l.messages.length!==1?"s":""}</div>}
                <div style={{display:"flex",gap:8,marginTop:10,borderTop:"1px solid #f0f0f0",paddingTop:10}}>
                  {!l.completed
                    ? <button className="slt-btn-complete" style={{flex:1}} onClick={e=>{e.stopPropagation();toggleComplete(l.id,true);}}>✓ Mark Complete</button>
                    : <button className="slt-btn-reopen" style={{flex:1}} onClick={e=>{e.stopPropagation();toggleComplete(l.id,false);}}>↩ Reopen</button>
                  }
                  {/* Only the load's original poster can edit or delete it */}
                  {(l.addedBy===session.uid||l.user_id===session.uid||(!l.addedBy&&!l.user_id&&isOwner)) && (
                    <button className="slt-btn-secondary" style={{padding:"8px 16px",fontSize:13}} onClick={e=>{e.stopPropagation();setEditLoad(l);setTab("new");}}>✏️ Edit</button>
                  )}
                  {(l.addedBy===session.uid||l.user_id===session.uid||(!l.addedBy&&!l.user_id&&isOwner)) && (
                    <button className="slt-btn-danger" style={{padding:"8px 14px",fontSize:13}} onClick={e=>{e.stopPropagation();if(window.confirm("Delete this load?"))deleteLoad(l.id);}}>🗑</button>
                  )}
                </div>
            </SwipeableLoadCard>
            );
          })
        }
      </div>
    </div>
  );
}

// ─── LOAD FORM ────────────────────────────────────────────────────────────────
function LoadFormTab({ session, isOwner, rates, allRoutes, trucks, onSave, editLoad, onCancel }) {
  const [myFleets, setMyFleets] = useState([]);
  const [selectedFleetOwner, setSelectedFleetOwner] = useState(null);
  const [fleetTrucks, setFleetTrucks] = useState(trucks);
  const [fleetRoutes, setFleetRoutes] = useState(allRoutes);
  const [fleetRates, setFleetRates] = useState(rates);
  const [scanningLoad, setScanningLoad] = useState(false);
  const [scanLoadMsg, setScanLoadMsg] = useState("");
  const loadScanRef = useRef(null);

  useEffect(() => {
    if (!isOwner) {
      // Always fetch ALL fleets for this driver fresh from Supabase
      sbGetMyFleets(session.uid).then(async (fleets) => {
        setMyFleets(fleets);
        if (fleets.length > 0) {
          // Default to first fleet
          const first = fleets[0];
          setSelectedFleetOwner(first.owner_uid);
          loadFleetData(first.owner_uid);
        } else if (session.fleetOwnerUid || session.ownerUid) {
          // Fallback to session owner
          const ownerUid = session.fleetOwnerUid || session.ownerUid;
          if (ownerUid !== session.uid) loadFleetData(ownerUid);
        }
      });
    } else {
      // Owner - refresh their own routes from Supabase
      sbGetSettings(session.uid).then(s => {
        if (s?.routes) setFleetRoutes(s.routes);
        if (s?.rates) setFleetRates({ ...DEFAULT_RATES, ...s.rates });
      });
    }
  }, [session.uid]);

  const loadFleetData = async (ownerUid) => {
    const [t, s] = await Promise.all([sbGetTrucks(ownerUid), sbGetSettings(ownerUid)]);
    setFleetTrucks(t || trucks);
    if (s?.rates) setFleetRates({ ...DEFAULT_RATES, ...s.rates });
    if (s?.routes) setFleetRoutes(s.routes || allRoutes);
  };

  const activeTrucks = (!isOwner && session.inFleet) ? fleetTrucks : trucks;
  const activeRoutes = (!isOwner && session.inFleet) ? fleetRoutes : allRoutes;
  const activeRates = (!isOwner && session.inFleet) ? fleetRates : rates;

  const ownerUid = selectedFleetOwner || session.fleetOwnerUid || session.ownerUid || session.uid;
  const seqKey=`tp-seq-${ownerUid}`;
  // Read next number WITHOUT incrementing — just a preview
  const peekNextNum=()=>{ const last=parseInt(localStorage.getItem(seqKey)||"1000",10); return (last+1).toString(); };
  // Actually consume and increment — called only on submit
  const genNextNum=()=>{ const last=parseInt(localStorage.getItem(seqKey)||"1000",10); const next=last+1; localStorage.setItem(seqKey,next.toString()); return next.toString(); };
  const [previewNum] = useState(()=> editLoad ? null : peekNextNum());

  const blank = { date:todayStr(),time:"",appointmentTime:"",completedTime:"",offloadArrivalTime:"",offloadCompletedTime:"",location:"",loadWaitMins:"",offloadWaitMins:"",earnings:"",driverBasePay:"",assignedDriverUid:"",fuelLitres:"",fuelPricePerLitre:"",fuelTotal:"",note:"",truckId:"",manualTruckNumber:"",driverFullName:"",completed:false,quantity:"",billingMethod:"per_load" };
  
  // Smart defaults — remember last used truck and route
  const getSmartDefaults = () => {
    const lastTruck = localStorage.getItem(`tp-last-truck-${session.uid}`) || "";
    const lastRoute = localStorage.getItem(`tp-last-route-${session.uid}`) || "";
    return { truckId: lastTruck, location: lastRoute };
  };
  
  const [form, setForm] = useState(() => {
    if (editLoad) return {...blank, ...editLoad};
    const defaults = getSmartDefaults();
    return {...blank, tmwLoadNumber:"", ...defaults};
  });
  const [section, setSection] = useState("details");
  const [loadStatus,setLoadStatus]=useState(null); const [offStatus,setOffStatus]=useState(null);
  const [loadElapsed,setLoadElapsed]=useState(0); const [offElapsed,setOffElapsed]=useState(0);
  const loadRef=useRef(null); const loadStart=useRef(0); const offRef=useRef(null); const offStart=useRef(0);

  // Cancel just navigates away — no number was ever generated
  const handleCancel=()=>{ onCancel(); };

  const startTimer=(k)=>{ if(k==="load"){loadStart.current=Date.now()-loadElapsed*1000;setLoadStatus("running");loadRef.current=setInterval(()=>setLoadElapsed(Math.floor((Date.now()-loadStart.current)/1000)),1000);}else{offStart.current=Date.now()-offElapsed*1000;setOffStatus("running");offRef.current=setInterval(()=>setOffElapsed(Math.floor((Date.now()-offStart.current)/1000)),1000);}};
  const stopTimer=(k)=>{ if(k==="load"){clearInterval(loadRef.current);setLoadStatus("stopped");setForm(f=>({...f,loadWaitMins:Math.floor(loadElapsed/60).toString()}));}else{clearInterval(offRef.current);setOffStatus("stopped");setForm(f=>({...f,offloadWaitMins:Math.floor(offElapsed/60).toString()}));}};
  const resetTimer=(k)=>{ if(k==="load"){clearInterval(loadRef.current);setLoadStatus(null);setLoadElapsed(0);}else{clearInterval(offRef.current);setOffStatus(null);setOffElapsed(0);}};
  useEffect(()=>()=>{clearInterval(loadRef.current);clearInterval(offRef.current);},[]);

  const users=getUsers();
  const drivers=Object.values(users).filter(u=>u.role==="driver"&&u.ownerUid===ownerUid);
  const hc=(e)=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const getRD=(loc)=>(activeRoutes||allRoutes).find(r=>`${r.from} → ${r.to}`===loc);

  // ── Auto-calculate earnings based on billing method ──
  const calcEarnings=(rd,qty)=>{ if(!rd)return""; const m=rd.billingMethod||"per_load"; if(m==="per_load")return(Number(rd.ratePerLoad||rd.rate)||0).toString(); if(m==="per_cubic")return(Number(rd.rateCubic||0)*Number(qty||0)).toFixed(2); if(m==="per_hour")return(Number(rd.rateHour||rd.rate||0)*Number(qty||0)).toFixed(2); if(m==="per_pct")return(Number(rd.rateCubic||rd.rate||0)*Number(qty||0)).toFixed(2); return""; };
  // Driver pay: per_load/per_cubic = flat rate (override or default); per_hour = driver's hourly rate × hours
  const getDriverRate=(rd,uid)=>{ const overrides=rd.driverOverrides||{}; return uid&&overrides[uid]!==undefined&&overrides[uid]!==""?Number(overrides[uid]):Number(rd.driverPay||rd.pay||0); };
  const calcDriverPay=(rd,qty)=>{
    if(!rd)return"";
    const m=rd.billingMethod||"per_load";
    const uid=form.assignedDriverUid||(isOwner?"":session.uid);
    const dRate=getDriverRate(rd,uid);
    if(m==="per_hour") return (dRate*Number(qty||0)).toFixed(2);
    if(m==="per_pct") return (Number(rd.ratePerLoad||0)*Number(qty||0)*Number(rd.driverPct||0)/100).toFixed(2);
    // per_cubic: driver always gets flat fixed pay, never multiplied by qty
    if(m==="per_cubic") return Number(rd.driverPay||rd.pay||0).toString();
    return dRate.toString();
  };
  const handleRoute=(val)=>{ if(!val){setForm(f=>({...f,location:"",driverBasePay:"",earnings:"",quantity:"",billingMethod:"per_load"}));return;} const rd=getRD(val); if(rd){const m=rd.billingMethod||"per_load";const earn=m==="per_load"?calcEarnings(rd,""):"";setForm(f=>{const overrides=rd.driverOverrides||{};const uid=f.assignedDriverUid||(isOwner?"":session.uid);const isCubicPct=m==="per_cubic"&&(rd.cubicDriverMode||"flat")==="pct";const pay=isCubicPct?"0":(uid&&overrides[uid]!==undefined&&overrides[uid]!==""?Number(overrides[uid]).toString():Number(rd.driverPay||rd.pay||0).toString());return{...f,location:val,billingMethod:m,driverBasePay:pay,earnings:earn,quantity:""};});}else{setForm(f=>({...f,location:val,billingMethod:"per_load"}));}};
  // When driver assignment changes, recalculate their pay for the selected route
  const handleDriverChange=(e)=>{ const uid=e.target.value; setForm(f=>{ const rd=getRD(f.location); if(!rd)return{...f,assignedDriverUid:uid}; const m=rd.billingMethod||"per_load"; const overrides=rd.driverOverrides||{}; const dRate=uid&&overrides[uid]!==undefined&&overrides[uid]!==""?Number(overrides[uid]):Number(rd.driverPay||rd.pay||0); const pay=m==="per_hour"?(dRate*Number(f.quantity||0)).toFixed(2):dRate.toString(); return{...f,assignedDriverUid:uid,driverBasePay:pay}; }); };
  const handleQuantity=(val)=>{ const rd=getRD(form.location); if(rd){ const m=rd.billingMethod||"per_load"; const newDriverPay=m==="per_cubic"?Number(rd.driverPay||rd.pay||0).toString():calcDriverPay(rd,val); setForm(f=>({...f,quantity:val,earnings:calcEarnings(rd,val),driverBasePay:newDriverPay}));}else{setForm(f=>({...f,quantity:val}));} };
  useEffect(()=>{ const t=activeTrucks||trucks; if(!form.truckId&&t.length===1)setForm(f=>({...f,truckId:t[0].id})); },[activeTrucks?.length, trucks.length]);

  const wm=(Number(form.loadWaitMins)||0)+(Number(form.offloadWaitMins)||0);
  const wComp=parseFloat((wm/60*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const wDrv=parseFloat((wm/60*(Number(rates.driverWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(form.earnings)||0)+wComp).toFixed(2));
  const dPay=parseFloat(((Number(form.driverBasePay)||0)+wDrv).toFixed(2));
  const net=parseFloat((gross-dPay).toFixed(2));

  const scanLoadDocument = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanningLoad(true);
    setScanLoadMsg("🤖 Reading document...");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Data = ev.target.result;
      const base64 = base64Data.split(",")[1];
      const mediaType = base64Data.split(";")[0].split(":")[1];
      try {
        const routeList = (activeRoutes||[]).map(r=>`${r.from} → ${r.to}`).join(", ");
        const truckList = (activeTrucks||[]).map(t=>t.truckNumber).join(", ");
        const response = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: `You extract load/dispatch information from documents and respond ONLY with valid JSON.
Available routes: ${routeList||"unknown"}
Available trucks: ${truckList||"unknown"}
Respond with: {"tmwLoadNumber":"","location":"<from> → <to>","date":"<YYYY-MM-DD>","time":"<HH:MM>","appointmentTime":"<HH:MM>","completedTime":"<HH:MM>","truckNumber":"","loadWaitMins":<number or 0>,"offloadWaitMins":<number or 0>,"note":""}
Match location to one of the available routes if possible. loadWaitMins = wait time at loading site in minutes. offloadWaitMins = wait time at offload/delivery site in minutes. Leave fields empty string or 0 if not found.`,
            message: "Extract all load details from this dispatch document.",
            maxTokens: 400,
            image: base64,
            mediaType: mediaType
          })
        });
        const data = await response.json();
        const text = data.text || "";
        const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
        // Find matching route
        const matchedRoute = (activeRoutes||[]).find(r=>`${r.from} → ${r.to}`===parsed.location);
        const matchedTruck = (activeTrucks||[]).find(t=>t.truckNumber===parsed.truckNumber||t.truckNumber?.includes(parsed.truckNumber));
        setForm(f=>({
          ...f,
          tmwLoadNumber: parsed.tmwLoadNumber || f.tmwLoadNumber,
          location: matchedRoute ? parsed.location : f.location,
          date: parsed.date || f.date,
          time: parsed.time || f.time,
          appointmentTime: parsed.appointmentTime || f.appointmentTime,
          completedTime: parsed.completedTime || f.completedTime,
          truckId: matchedTruck ? matchedTruck.id : f.truckId,
          loadWaitMins: parsed.loadWaitMins ? String(parsed.loadWaitMins) : f.loadWaitMins,
          offloadWaitMins: parsed.offloadWaitMins ? String(parsed.offloadWaitMins) : f.offloadWaitMins,
          note: parsed.note || f.note,
        }));
        setScanLoadMsg("✅ Load details filled in — please review!");
        setTimeout(()=>setScanLoadMsg(""),4000);
      } catch(err) {
        setScanLoadMsg("⚠️ Could not read document. Please fill in manually.");
        setTimeout(()=>setScanLoadMsg(""),4000);
      }
      setScanningLoad(false);
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };

  const submit=()=>{
    if(!form.tmwLoadNumber||!form.tmwLoadNumber.trim()){alert("TMW # is required. Please enter a TMW number before saving.");return;}
    if(!form.location)return;
    const rd=getRD(form.location);
    let finalEarn=Number(form.earnings)||(rd?.rate?Number(rd.rate):Number(rates.perLoadRate)||0);
    let drvName=!isOwner?(session.fullName||session.name):form.driverFullName;
    if(isOwner&&form.assignedDriverUid){const d=users[form.assignedDriverUid];drvName=d?(d.fullName||d.name):"";}
    // Save smart defaults for next time
    if (form.truckId && form.truckId !== "__manual__") localStorage.setItem(`tp-last-truck-${session.uid}`, form.truckId);
    if (form.location) localStorage.setItem(`tp-last-route-${session.uid}`, form.location);
    onSave({...form,earnings:finalEarn,driverFullName:drvName,id:editLoad?.id||Date.now().toString(),addedBy:session.uid});
  };

  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">{editLoad?"Edit Load":"New Load"}</div><div className="slt-hero-sub">Fill in load details below</div></div>
      {/* Fleet selector — only for drivers in multiple fleets */}
      {!isOwner && myFleets.length > 0 && (
        <div style={{background:"#1C2333", padding:"14px 16px", borderBottom:`2px solid ${C.blue}`}}>
          <div style={{fontSize:11, fontWeight:800, color:"rgba(255,255,255,0.5)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:10}}>🚛 Adding this load for</div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {myFleets.map(f => (
              <button key={f.owner_uid} onClick={()=>{ setSelectedFleetOwner(f.owner_uid); loadFleetData(f.owner_uid); }}
                style={{padding:"10px 18px", borderRadius:10, border:`2px solid ${selectedFleetOwner===f.owner_uid?"#FFD700":C.border}`, background:selectedFleetOwner===f.owner_uid?"#FFD700":"rgba(255,255,255,0.07)", color:selectedFleetOwner===f.owner_uid?"#1C2333":"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:0.5}}>
                {selectedFleetOwner===f.owner_uid ? "✓ " : ""}{f.owner_name}
              </button>
            ))}
            <button onClick={()=>{ setSelectedFleetOwner(session.uid); setFleetTrucks(trucks); setFleetRoutes(allRoutes); setFleetRates(rates); }}
              style={{padding:"10px 18px", borderRadius:10, border:`2px solid ${selectedFleetOwner===session.uid?"#FFD700":C.border}`, background:selectedFleetOwner===session.uid?"#FFD700":"rgba(255,255,255,0.07)", color:selectedFleetOwner===session.uid?"#1C2333":"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif"}}>
              {selectedFleetOwner===session.uid ? "✓ " : ""}My Own Load
            </button>
          </div>
        </div>
      )}
      <div className="slt-container-sm">

        {/* ── TMW# INPUT ── */}
        <div style={{background:"#1C2333",borderRadius:14,padding:"16px 20px",marginBottom:20,border:"1.5px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.55)",letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>TMW # <span style={{color:"#FFD700"}}>*</span></div>
          <input
            type="text"
            placeholder="Enter TMW number..."
            value={form.tmwLoadNumber||""}
            onChange={e=>setForm(f=>({...f,tmwLoadNumber:e.target.value}))}
            style={{width:"100%",padding:"10px 14px",borderRadius:9,border:"2px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.12)",color:"#fff",fontSize:18,fontWeight:800,fontFamily:"'Barlow Condensed',sans-serif",outline:"none",boxSizing:"border-box",letterSpacing:1}}
          />
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:6}}>Type your TMW # manually — leave blank if not assigned yet</div>
          <div style={{marginTop:12,display:"flex",gap:8}}>
            <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px",borderRadius:10,background:"rgba(255,215,0,.15)",border:"1.5px solid rgba(255,215,0,.4)",cursor:"pointer",color:"#FFD700",fontWeight:700,fontSize:13}}>
              {scanningLoad ? "🤖 Reading..." : "📷 Scan Dispatch Sheet"}
              <input ref={loadScanRef} type="file" accept="image/*,application/pdf" capture="environment" style={{display:"none"}} onChange={scanLoadDocument} disabled={scanningLoad}/>
            </label>
            <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px",borderRadius:10,background:"rgba(255,215,0,.1)",border:"1.5px solid rgba(255,215,0,.3)",cursor:"pointer",color:"#FFD700",fontWeight:700,fontSize:13}}>
              📁 Choose File
              <input type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={scanLoadDocument} disabled={scanningLoad}/>
            </label>
          </div>
          {scanLoadMsg && <div style={{marginTop:8,fontSize:12,fontWeight:700,color:scanLoadMsg.startsWith("✅")?"#69f0ae":"#FFD700"}}>{scanLoadMsg}</div>}
        </div>
        <div style={{ display:"flex",gap:8,marginBottom:20 }}>
          {[["details","📋 Details"],["wait","⏱ Wait Time"]].map(([v,l])=>(
            <button key={v} onClick={()=>setSection(v)}
              style={{ flex:1, padding:"14px 6px", borderRadius:12, border:`2px solid ${section===v?C.blue:"#dde3ec"}`, background:section===v?"#243B6E":"#fff", color:section===v?"#fff":C.textMed, fontWeight:800, fontSize:14, cursor:"pointer", boxShadow:section===v?"0 4px 12px rgba(36,59,110,0.25)":"none", transition:"all 0.2s", letterSpacing:0.3 }}>{l}</button>
          ))}
        </div>

        {section==="details"&&(
          <div className="slt-card">
            {/* Quick tip for new drivers */}
            {!isOwner && !editLoad && (
              <div style={{background:"linear-gradient(135deg,#FFF3EB,#E0F7FA)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:C.blue,fontWeight:600}}>
                💡 <strong>Quick tip:</strong> Pick your route and date — everything else is optional!
              </div>
            )}
            {isOwner&&drivers.length>0&&(
              <div style={{marginBottom:16}}><label className="slt-label">Assign Driver</label>
                <select name="assignedDriverUid" value={form.assignedDriverUid} onChange={handleDriverChange} className="slt-input">
                  <option value="">— Owner Operator —</option>
                  {drivers.map(d=><option key={d.uid} value={d.uid}>{d.fullName||d.name}</option>)}
                </select></div>
            )}
            <div style={{marginBottom:14}}>
              <label className="slt-label">Date</label>
              <input name="date" type="date" value={form.date} onChange={hc} className="slt-input"/>
            </div>
            {/* ── TIMES SECTION ── */}
            {(()=>{
              const calcMins=(a,b)=>{ if(!a||!b)return null; const [ah,am]=a.split(":").map(Number); const [bh,bm]=b.split(":").map(Number); let diff=(bh*60+bm)-(ah*60+am); if(diff<0)diff+=1440; return diff; };
              const loadMins=calcMins(form.appointmentTime,form.completedTime);
              const offMins=calcMins(form.offloadArrivalTime,form.offloadCompletedTime);
              const fmtMins=(m)=>m===null?"—":`${Math.floor(m/60)>0?Math.floor(m/60)+"h ":""}${m%60}min`;
              return (
                <div style={{background:C.offWhite,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>⏰ Times</div>

                  {/* Loading times */}
                  <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8,textTransform:"uppercase",letterSpacing:0.8}}>🏭 Loading Site</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label className="slt-label" style={{fontSize:11}}>📅 Appt</label>
                      <input name="appointmentTime" type="time" value={form.appointmentTime||""} onChange={e=>{hc(e);const m=calcMins(e.target.value,form.completedTime);if(m!==null)setForm(f=>({...f,loadWaitMins:m.toString()}));}} className="slt-input" style={{fontSize:13,padding:"8px 10px"}}/>
                    </div>
                    <div>
                      <label className="slt-label" style={{fontSize:11}}>🛬 Arrival</label>
                      <input name="time" type="time" value={form.time} onChange={hc} className="slt-input" style={{fontSize:13,padding:"8px 10px"}}/>
                    </div>
                    <div>
                      <label className="slt-label" style={{fontSize:11}}>✅ Done</label>
                      <input name="completedTime" type="time" value={form.completedTime||""} onChange={e=>{hc(e);const m=calcMins(form.appointmentTime,e.target.value);if(m!==null)setForm(f=>({...f,loadWaitMins:m.toString()}));}} className="slt-input" style={{fontSize:13,padding:"8px 10px"}}/>
                    </div>
                  </div>
                  {loadMins!==null&&(
                    <div style={{background:"#FFF3EB",borderRadius:8,padding:"8px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:C.blue,fontWeight:700}}>⏱ Load Wait Auto-Calculated</span>
                      <span style={{fontSize:14,fontWeight:800,color:C.blue}}>{fmtMins(loadMins)}</span>
                    </div>
                  )}

                  {/* Offloading times */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.orange,marginBottom:8,textTransform:"uppercase",letterSpacing:0.8}}>🏗 Offloading Site</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div>
                        <label className="slt-label" style={{fontSize:11}}>🛬 Arrival</label>
                        <input name="offloadArrivalTime" type="time" value={form.offloadArrivalTime||""} onChange={e=>{hc(e);const m=calcMins(e.target.value,form.offloadCompletedTime);if(m!==null)setForm(f=>({...f,offloadWaitMins:m.toString()}));}} className="slt-input" style={{fontSize:13,padding:"8px 10px"}}/>
                      </div>
                      <div>
                        <label className="slt-label" style={{fontSize:11}}>✅ Done</label>
                        <input name="offloadCompletedTime" type="time" value={form.offloadCompletedTime||""} onChange={e=>{hc(e);const m=calcMins(form.offloadArrivalTime,e.target.value);if(m!==null)setForm(f=>({...f,offloadWaitMins:m.toString()}));}} className="slt-input" style={{fontSize:13,padding:"8px 10px"}}/>
                      </div>
                    </div>
                    {offMins!==null&&(
                      <div style={{background:"#FFF3E0",borderRadius:8,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:C.orange,fontWeight:700}}>⏱ Offload Wait Auto-Calculated</span>
                        <span style={{fontSize:14,fontWeight:800,color:C.orange}}>{fmtMins(offMins)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div style={{marginBottom:14}}>
              <label className="slt-label">Route</label>
              {(activeRoutes||allRoutes).length===0
                ? <div style={{background:C.blueLight,borderRadius:9,padding:"12px 16px",fontSize:13,color:C.blue}}>{isOwner?"No routes yet. Add in ⚙ Settings.":"No routes available — ask your fleet owner."}</div>
                : <select value={form.location||""} onChange={e=>handleRoute(e.target.value)} className="slt-input" style={{fontSize:14,padding:"10px 14px"}}>
                    <option value="">— Select Route —</option>
                    {(activeRoutes||allRoutes).map((r,i)=>{
                      const loc=`${r.from} → ${r.to}`;
                      return <option key={i} value={loc}>{r.from} → {r.to} · {isOwner?`Driver: ${fmtC(r.driverPay||r.pay||0)}`:`Pay: ${fmtC(r.pay||r.ratePerLoad||0)}`}</option>;
                    })}
                  </select>
              }
            </div>

            {/* Billing method auto-calc */}
            {form.location&&getRD(form.location)&&(()=>{
              const rd=getRD(form.location);
              const method=rd.billingMethod||"per_load";
              const colors={per_load:C.teal,per_cubic:C.green,per_hour:C.orange,per_pct:"#2D4A8A"};
              const icons={per_load:"📦",per_cubic:"📐",per_hour:"⏱",per_pct:"💯"};
              const labels={per_load:"Per Load — flat rate",per_cubic:"Per Cubic Yard",per_hour:"Per Hour",per_pct:"% of Load Earnings"};
              const driverHints={per_load:"Your pay is set for this route",per_cubic:"Enter cubic yards to log this load",per_hour:"Enter your hours — your pay will calculate automatically",per_pct:"Your pay is automatically calculated as a % of load earnings"};
              const ownerHints={per_load:"Earnings auto-filled",per_cubic:"Enter cubic yards hauled",per_hour:"Enter hours worked",per_pct:"Driver pay auto-calculated from %"};
              const col=colors[method];

              // Driver's personal rate for this route
              const driverUid=form.assignedDriverUid||(isOwner?"":session.uid);
              const overrides=rd.driverOverrides||{};
              const driverHourlyRate=driverUid&&overrides[driverUid]!==undefined&&overrides[driverUid]!==""?Number(overrides[driverUid]):Number(rd.driverPay||rd.pay||0);

              return(
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,background:`${col}12`,border:`1.5px solid ${col}40`,borderRadius:10,padding:"10px 14px",marginBottom:method!=="per_load"?12:0}}>
                    <span style={{fontSize:20}}>{icons[method]}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:800,color:col}}>{labels[method]}</div>
                      <div style={{fontSize:11,color:C.textLight}}>{isOwner?ownerHints[method]:driverHints[method]}</div>
                    </div>
                    {/* Per load: owner sees business rate, driver sees flat pay */}
                    {method==="per_load"&&isOwner&&<div style={{fontSize:17,fontWeight:800,color:C.green,fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(rd.ratePerLoad||rd.rate||0)}</div>}
                    {method==="per_load"&&!isOwner&&<div style={{fontSize:17,fontWeight:800,color:C.blue,fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(rd.driverPay||rd.pay||0)}</div>}
                    {/* Per hour: show driver their hourly rate */}
                    {method==="per_hour"&&!isOwner&&<div style={{textAlign:"right"}}><div style={{fontSize:11,color:"rgba(0,0,0,0.45)"}}>Your rate</div><div style={{fontSize:17,fontWeight:800,color:C.orange,fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(driverHourlyRate)}/hr</div></div>}
                  </div>

                  {method!=="per_load"&&(
                    <div>
                      <label className="slt-label">{method==="per_cubic"||method==="per_pct"?"Cubic Yards (yd³)":"Hours Worked"}</label>
                      <input type="number" step="0.1" min="0" value={form.quantity} onChange={e=>handleQuantity(e.target.value)} className="slt-input"
                        placeholder={method==="per_cubic"||method==="per_pct"?"e.g. 150":"e.g. 8.5"}
                        style={{fontSize:24,fontWeight:800,textAlign:"center"}}/>

                      {form.quantity&&(
                        <div style={{marginTop:8,borderRadius:10,padding:"10px 14px",background:method==="per_hour"?`${C.orange}10`:`${C.green}10`,border:`1px solid ${method==="per_hour"?C.orange:C.green}30`}}>
                          {/* Owner sees business earnings calc */}
                          {isOwner&&<div style={{textAlign:"center"}}>
                            <div style={{fontSize:13,color:C.textMed,marginBottom:4}}>
                              {method==="per_cubic"||method==="per_pct"
                                ?`${form.quantity} yd³ × ${fmtC(rd.rateCubic||0)}/yd³`
                                :`${form.quantity} hrs × ${fmtC(rd.rateHour||rd.rate||0)}/hr`}
                              {" = "}<strong style={{color:C.green,fontSize:15}}>{fmtC(form.earnings)}</strong>
                            </div>
                            {method==="per_cubic"&&form.assignedDriverUid&&(
                              <div style={{fontSize:11,color:"#2D4A8A",marginTop:4}}>
                                {(rd.cubicDriverMode||"flat")==="pct"
                                  ?`Driver: ${form.quantity} yd³ × ${fmtC(rd.rateCubic||rd.rate||0)} × ${rd.driverPct||0}% = ${fmtC(form.driverBasePay)}`
                                  :`Driver: ${form.quantity} yd³ × ${fmtC(rd.driverPay||rd.pay||0)}/yd³ = ${fmtC(form.driverBasePay)}`
                                }
                              </div>
                            )}
                          </div>}
                          {/* Driver sees their own pay calc */}
                          {!isOwner&&method==="per_hour"&&<div style={{textAlign:"center"}}>
                            <div style={{fontSize:13,color:C.textMed,marginBottom:4}}>
                              {form.quantity} hrs × {fmtC(driverHourlyRate)}/hr
                            </div>
                            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:C.orange}}>
                              = {fmtC(form.driverBasePay)}
                            </div>
                          </div>}
                          {!isOwner&&method==="per_cubic"&&(
                            <div style={{textAlign:"center"}}>
                              {(rd.cubicDriverMode||"flat")==="pct"
                                ?<>
                                  <div style={{fontSize:12,color:C.textMed,marginBottom:4}}>
                                    {form.quantity} yd³ × {fmtC(rd.rateCubic||rd.rate||0)}/yd³ × {rd.driverPct||0}%
                                  </div>
                                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"#2D4A8A"}}>
                                    = {fmtC(form.driverBasePay)}
                                  </div>
                                </>
                                :<>
                                  <div style={{fontSize:12,color:C.textMed,marginBottom:4}}>
                                    {form.quantity} yd³ × {fmtC(rd.driverPay||rd.pay||0)}/yd³
                                  </div>
                                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:C.green}}>
                                    = {fmtC(form.driverBasePay)}
                                  </div>
                                </>
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{marginBottom:14}}>
              <label className="slt-label">Truck</label>
              {(activeTrucks||trucks).length > 0 ? (
                <select value={form.truckId} onChange={e=>{const t=(activeTrucks||trucks).find(x=>x.id===e.target.value);setForm(f=>({...f,truckId:e.target.value,trailerNumber:t?.trailerNumber||f.trailerNumber,manualTruckNumber:""}));}} className="slt-input">
                  <option value="">— Select truck —</option>
                  {(activeTrucks||trucks).map(t=><option key={t.id} value={t.id}>Truck {t.truckNumber}{t.tmwNumber?` · TMW #${t.tmwNumber}`:""}</option>)}
                  <option value="__manual__">✏️ Enter truck number manually</option>
                </select>
              ) : null}
              {(form.truckId === "__manual__" || (activeTrucks||trucks).length === 0) && (
                <input value={form.manualTruckNumber||""} onChange={e=>setForm(f=>({...f,manualTruckNumber:e.target.value}))}
                  placeholder="Enter truck number (e.g. T-247)"
                  className="slt-input" style={{marginTop:8}} />
              )}
            </div>
            {isOwner&&form.location&&(
              <>
                <div style={{marginBottom:14}}><label className="slt-label">Load Earnings ($)</label><input name="earnings" type="number" step="0.01" placeholder="0.00" value={form.earnings} onChange={hc} className="slt-input"/></div>
                <div style={{background:C.offWhite,borderRadius:11,padding:16,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {(form.assignedDriverUid
                  ?[["Gross",fmtC(gross),C.green],["Driver Pay",fmtC(dPay),C.blue],["Wait Co.",fmtC(wComp),C.orange],["Net",fmtC(net),net>=0?C.green:C.red]]
                  :[["Gross Revenue",fmtC(gross),C.green],["Net (no driver)",fmtC(gross),C.green]]
                ).map(([l,v,color])=>(
                    <div key={l} style={{background:"#fff",borderRadius:9,padding:"10px 12px",border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:11,color:C.textLight,fontFamily:"'Barlow',sans-serif"}}>{l}</div>
                      <div style={{fontSize:15,fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif",marginTop:2}}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {section==="wait"&&(
          <div className="slt-card">
            <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1.5,textTransform:"uppercase",marginBottom:16}}>⏱ Wait Time Tracker</div>

            {/* Loading Site Wait */}
            <div style={{background:"#F0F7FF",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:C.blue,marginBottom:12,textTransform:"uppercase",letterSpacing:0.8}}>🏭 Loading Site Wait</div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <button className="slt-btn-primary" style={{flex:1,background:loadStatus==="running"?"#EF4444":C.blue,padding:"12px"}} onClick={()=>loadStatus==="running"?stopTimer("load"):startTimer("load")}>
                  {loadStatus==="running"?"⏹ Stop":"▶ Start"} Timer
                </button>
              </div>
              {loadStatus&&<div style={{fontSize:13,color:C.blue,fontWeight:700,marginBottom:10,textAlign:"center"}}>
                {loadStatus==="running"?"🔴 Running: ":"✅ Recorded: "}
                {Math.floor(loadElapsed/3600)>0?`${Math.floor(loadElapsed/3600)}h `:""}
                {Math.floor((loadElapsed%3600)/60)}m {loadElapsed%60}s
              </div>}
              <div style={{marginTop:8}}>
                <label className="slt-label">Manual Entry (minutes)</label>
                <input type="number" className="slt-input" placeholder="0" value={form.loadWaitMins||""} onChange={e=>setForm(f=>({...f,loadWaitMins:e.target.value}))} />
              </div>
            </div>

            {/* Offloading Site Wait */}
            <div style={{background:"#FFF3EB",borderRadius:12,padding:16,marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:C.orange,marginBottom:12,textTransform:"uppercase",letterSpacing:0.8}}>🏗 Offloading Site Wait</div>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <button className="slt-btn-primary" style={{flex:1,background:offStatus==="running"?"#EF4444":C.orange,padding:"12px"}} onClick={()=>offStatus==="running"?stopTimer("off"):startTimer("off")}>
                  {offStatus==="running"?"⏹ Stop":"▶ Start"} Timer
                </button>
              </div>
              {offStatus&&<div style={{fontSize:13,color:C.orange,fontWeight:700,marginBottom:10,textAlign:"center"}}>
                {offStatus==="running"?"🔴 Running: ":"✅ Recorded: "}
                {Math.floor(offElapsed/3600)>0?`${Math.floor(offElapsed/3600)}h `:""}
                {Math.floor((offElapsed%3600)/60)}m {offElapsed%60}s
              </div>}
              <div style={{marginTop:8}}>
                <label className="slt-label">Manual Entry (minutes)</label>
                <input type="number" className="slt-input" placeholder="0" value={form.offloadWaitMins||""} onChange={e=>setForm(f=>({...f,offloadWaitMins:e.target.value}))} />
              </div>
            </div>

            {/* Wait Pay Summary */}
            {wm>0&&(
              <div style={{background:C.offWhite,borderRadius:11,padding:14}}>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>💰 Wait Pay Preview</div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:13,color:C.textMed}}>Total Wait</span>
                  <span style={{fontSize:13,fontWeight:700}}>{Math.floor(wm/60)>0?`${Math.floor(wm/60)}h `:""}{wm%60}m</span>
                </div>
                {!isOwner&&<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:13,color:C.textMed}}>Your Wait Pay</span>
                  <span style={{fontSize:14,fontWeight:800,color:C.green}}>{fmtC(wDrv)}</span>
                </div>}
                {isOwner&&<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                  <span style={{fontSize:13,color:C.textMed}}>Company Wait Pay</span>
                  <span style={{fontSize:14,fontWeight:800,color:C.orange}}>{fmtC(wComp)}</span>
                </div>}
              </div>
            )}
          </div>
        )}

        {/* Total Pay Summary for drivers */}
        {!isOwner && (Number(form.driverBasePay||0) > 0 || Number(form.loadWaitMins||0) > 0 || Number(form.offloadWaitMins||0) > 0) && (
          <div style={{background:"linear-gradient(135deg,#1a2744,#243B6E)",borderRadius:14,padding:"16px 20px",marginBottom:16,color:"#fff"}}>
            <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.6)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}}>💵 Your Total Pay</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div style={{textAlign:"center",background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 6px"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:4}}>Load Pay</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,color:"#fff"}}>{fmtC(Number(form.driverBasePay||0)||Number(form.earnings||0))}</div>
              </div>
              <div style={{textAlign:"center",background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 6px"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:4}}>Wait Pay</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,color:"#FFD700"}}>{fmtC(wDrv)}</div>
              </div>
              <div style={{textAlign:"center",background:"rgba(255,215,0,0.2)",borderRadius:10,padding:"10px 6px",border:"1.5px solid rgba(255,215,0,0.4)"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:4}}>Total</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900,color:"#FFD700"}}>{fmtC((Number(form.driverBasePay||0)||Number(form.earnings||0)) + wDrv)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Notes field */}
        <div style={{marginBottom:16}}><label className="slt-label">📝 Note (optional)</label><textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="slt-input" placeholder="Add any notes about this load..." style={{width:"100%",minHeight:80,resize:"vertical"}} /></div>

        {/* Save / Cancel buttons — always visible */}
        <div style={{display:"flex",gap:10,marginTop:20,paddingBottom:20}}>
          <button className="slt-btn-ghost" style={{flex:1,padding:"13px"}} onClick={onCancel}>Cancel</button>
          <button className="slt-btn-primary" style={{flex:2,padding:"13px",background:`linear-gradient(135deg,${C.blue},${C.navy})`}} onClick={submit}>
            {editLoad?"💾 Save Changes":"➕ Add Load"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOAD DETAIL MODAL ────────────────────────────────────────────────────────
function LoadDetailModal({ load, onClose, rates, isOwner, trucks, session, onToggleComplete, onGenerateInvoice, onAddNote, onSummary, onViewPhotos }) {
  const [note,setNote]=useState("");
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[load.messages?.length]);
  const wm=(Number(load.loadWaitMins)||0)+(Number(load.offloadWaitMins)||0);
  const fmt=(m)=>{const h=Math.floor(m/60),mn=m%60;return `${h}h ${mn}m`;};
  const wComp=parseFloat(((wm/60)*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const wDrv=parseFloat(((wm/60)*(Number(rates.driverWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(load.earnings)||0)+wComp).toFixed(2));
  const dPay=parseFloat(((Number(load.driverBasePay)||0)+wDrv).toFixed(2));
  const net=parseFloat((gross-dPay).toFixed(2));
  const handleSend=()=>{if(!note.trim())return;onAddNote(load.id,note.trim(),session);setNote("");};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.navy,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.4)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid rgba(255,255,255,0.08)`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:C.navy,zIndex:1}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17,color:"#fff"}}>📦 Load Details</div>
          <button className="slt-btn-ghost" style={{padding:"6px 12px",fontSize:13}} onClick={onClose}>✕</button>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{background:C.blueLight,borderRadius:11,padding:14,marginBottom:18}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,color:C.blue}}>{load.location}</div>
            {load.driverFullName&&<div style={{fontSize:12.5,color:C.textMed,marginTop:2}}>Driver: {load.driverFullName}</div>}
          </div>

          {/* Times row */}
          {(()=>{
            const fmt12=(t)=>{ if(!t)return null; const [h,m]=t.split(":").map(Number); const ampm=h>=12?"PM":"AM"; return `${h%12||12}:${String(m).padStart(2,"0")} ${ampm}`; };
            const fmtW=(mins)=>{ const h=Math.floor(mins/60); const m=mins%60; return `${h>0?h+"h ":""}${m}min`; };
            const lwm=Number(load.loadWaitMins)||0;
            const owm=Number(load.offloadWaitMins)||0;
            return (
              <div style={{background:"#F0F7FF",borderRadius:11,padding:"14px 16px",marginBottom:14}}>
                {/* Loading Site */}
                <div style={{fontSize:10,fontWeight:800,color:C.blue,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>🏭 Loading Site</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,textAlign:"center",marginBottom:8}}>
                  {[
                    ["📅 Appt", fmt12(load.appointmentTime), C.blue],
                    ["🛬 Arrival", fmt12(load.time), C.green],
                    ["✅ Done", fmt12(load.completedTime), C.orange],
                  ].map(([label,val,col],i)=>(
                    <div key={label} style={{background:val?"#fff":"#F5F5F0",borderRadius:8,padding:"8px 4px",border:val?`1.5px solid ${col}30`:`1px solid ${C.border}`}}>
                      <div style={{fontSize:9,color:C.textMed,fontWeight:700,marginBottom:3,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
                      <div style={{fontSize:13,fontWeight:800,color:val?col:C.textLight}}>{val||"—"}</div>
                    </div>
                  ))}
                </div>
                {lwm>0&&<div style={{background:"#FFF3EB",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,color:C.blue,marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                  <span>⏱ Load Wait</span><span>{fmtW(lwm)}</span>
                </div>}

                {/* Offloading Site */}
                {(load.offloadArrivalTime||load.offloadCompletedTime)&&(
                  <>
                    <div style={{fontSize:10,fontWeight:800,color:C.orange,textTransform:"uppercase",letterSpacing:0.8,marginBottom:10,borderTop:`1px solid ${C.border}`,paddingTop:10}}>🏗 Offloading Site</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,textAlign:"center",marginBottom:8}}>
                      {[
                        ["🛬 Arrival", fmt12(load.offloadArrivalTime), C.green],
                        ["✅ Done", fmt12(load.offloadCompletedTime), C.orange],
                      ].map(([label,val,col])=>(
                        <div key={label} style={{background:val?"#fff":"#F5F5F0",borderRadius:8,padding:"8px 4px",border:val?`1.5px solid ${col}30`:`1px solid ${C.border}`}}>
                          <div style={{fontSize:9,color:C.textMed,fontWeight:700,marginBottom:3,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
                          <div style={{fontSize:13,fontWeight:800,color:val?col:C.textLight}}>{val||"—"}</div>
                        </div>
                      ))}
                    </div>
                    {owm>0&&<div style={{background:"#FFF3E0",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,color:C.orange,display:"flex",justifyContent:"space-between"}}>
                      <span>⏱ Offload Wait</span><span>{fmtW(owm)}</span>
                    </div>}
                  </>
                )}
              </div>
            );
          })()}
          {[["Date",load.date],["TMW #",load.tmwLoadNumber||"—"],["Wait",wm>0?fmt(wm):"—"],["Note",load.note||"—"]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.textMed}}>{l}</span>
              <span style={{fontSize:13,fontWeight:700}}>{v}</span>
            </div>
          ))}

          {isOwner&&(
            <div style={{background:C.offWhite,borderRadius:11,padding:14,marginTop:16}}>
              <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10,fontFamily:"'Barlow',sans-serif"}}>Financials</div>
              {/* Revenue */}
              {[["Earnings",fmtC(load.earnings||0),C.textDark],["Wait Co.",fmtC(wComp),C.orange],["Gross",fmtC(gross),C.green]].map(([l,v,color])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12.5,color:C.textMed}}>{l}</span>
                  <span style={{fontSize:13.5,fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</span>
                </div>
              ))}
              {/* Driver Pay breakdown */}
              {Number(load.driverBasePay||0) > 0 && (<>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginTop:10,marginBottom:6}}>Driver Pay</div>
                {[
                  ["Route Pay", fmtC(Number(load.driverBasePay||0)), C.blue],
                  ...(wDrv > 0 ? [["Wait Pay", fmtC(wDrv), C.orange]] : []),
                  ["Total Driver Pay", fmtC(dPay), C.blue],
                ].map(([l,v,color])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontWeight:l==="Total Driver Pay"?800:400}}>
                    <span style={{fontSize:12.5,color:l==="Total Driver Pay"?C.textDark:C.textMed}}>{l}</span>
                    <span style={{fontSize:13.5,fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif"}}>-{v}</span>
                  </div>
                ))}
              </>)}
              {/* Net */}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",marginTop:4,borderTop:`2px solid ${C.border}`}}>
                <span style={{fontSize:13,fontWeight:800,color:C.textDark}}>Net</span>
                <span style={{fontSize:15,fontWeight:900,color:net>=0?C.green:C.red,fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(net)}</span>
              </div>
            </div>
          )}

          {!isOwner&&(load.assignedDriverUid===session.uid||load.addedBy===session.uid||load.user_id===session.uid)&&(
            <div style={{background:"#E8F5E9",borderRadius:11,padding:14,marginTop:16,border:`1.5px solid ${C.green}`}}>
              <div style={{fontSize:11,fontWeight:800,color:C.green,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>💵 Your Pay</div>
              {[["Driver's Base Pay",fmtC(Number(load.driverBasePay)||0),C.blue],["Wait Pay",fmtC(wDrv),C.orange],["Total Pay",fmtC(dPay),C.green]].map(([l,v,color])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12.5,color:C.textMed}}>{l}</span>
                  <span style={{fontSize:13.5,fontWeight:800,color,fontFamily:"'Barlow Condensed',sans-serif"}}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Same-day Expenses Box */}
          {(()=>{
            const dayExp = getStored(expensesKey(session.uid)).filter(e => e.date === load.date && e.source !== "load");
            if(dayExp.length === 0) return null;
            const dayTotal = dayExp.reduce((s,e)=>s+Number(e.amount||0),0);
            return (
              <div style={{marginTop:16,background:"#FFF8E1",borderRadius:11,padding:14,border:"1.5px solid #FFB300"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#243B6E",letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
                  🧾 Expenses on {load.date}
                </div>
                {dayExp.map(e=>(
                  <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(0,0,0,0.06)",fontSize:13}}>
                    <span style={{color:"#5D4037"}}>{e.category==="fuel"?"⛽":e.category==="meals"?"🍽":e.category==="tolls"?"🛣":"🧾"} {e.description||e.note||e.category}</span>
                    <span style={{fontWeight:800,color:"#243B6E"}}>{fmtC(Number(e.amount||0))}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:"2px solid #FFB300"}}>
                  <span style={{fontWeight:800,fontSize:13,color:"#243B6E"}}>Total expenses this day</span>
                  <span style={{fontWeight:900,fontSize:15,color:"#243B6E",fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(dayTotal)}</span>
                </div>
                <div style={{fontSize:11,color:"#8D6E63",marginTop:6}}>These are shown for reference only — not deducted from load earnings</div>
              </div>
            );
          })()}

          {/* Notes */}
          <div style={{marginTop:20}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:10,fontFamily:"'Barlow Condensed',sans-serif"}}>💬 Load Notes</div>
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
            {isOwner&&<button className="slt-btn-primary" style={{flex:1,background:`linear-gradient(135deg,${C.purple},#243B6E)`}} onClick={()=>onGenerateInvoice(load)}>📄 Invoice</button>}
            {onViewPhotos&&<button className="slt-btn-primary" style={{flex:1,background:"#166534"}} onClick={()=>onViewPhotos(load)}>📷 Photos {load.photos?.length>0?`(${load.photos.length})`:""}</button>}
            <button className="slt-btn-ghost" style={{flex:1,padding:"12px"}} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── INVOICE MODAL ────────────────────────────────────────────────────────────
function InvoiceModal({ load, onClose, rates, trucks, session }) {
  useEffect(()=>{ document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=""; }; },[]);
  const wm=(Number(load.loadWaitMins)||0)+(Number(load.offloadWaitMins)||0);
  const wHrs=wm/60; const wComp=parseFloat((wHrs*(Number(rates.companyWaitRate)||0)).toFixed(2));
  const gross=parseFloat(((Number(load.earnings)||0)+wComp).toFixed(2));
  const truck=trucks?.find(t=>t.id===load.truckId);
  const users=getUsers(); const owner=users[session.ownerUid||session.uid];
  const invNum=`INV-${load.tmwLoadNumber||load.id?.slice(-4)||"0001"}`;

  const handlePrint=()=>{
    const content=document.getElementById("slt-invoice-content").innerHTML;
    downloadPDF(content, `Invoice_${invNum}`, session);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 28px 80px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:800,fontFamily:"'Barlow Condensed',sans-serif"}}>📄 Invoice Preview</h2>
          <div style={{display:"flex",gap:10}}>
            <button className="slt-btn-primary" style={{width:"auto",padding:"9px 18px"}} onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="slt-btn-ghost" style={{padding:"9px 12px"}} onClick={onClose}>✕</button>
          </div>
        </div>
        <div id="slt-invoice-content" style={{padding:28}}>
          <div className="header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,borderBottom:`3px solid ${C.blue}`,paddingBottom:18}}>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:800,color:C.blue}}>🚛 TruckPilot</div>
              {(session.companyName||owner?.companyName)&&<div style={{fontSize:15,fontWeight:800,color:C.textDark,marginTop:4}}>{session.companyName||owner?.companyName}</div>}
              <div style={{fontSize:13,color:C.textMed,marginTop:2}}>{owner?.fullName||session.fullName||"Owner Operator"}</div>
              {load.driverFullName&&load.driverFullName!==(owner?.fullName||session.fullName)&&<div style={{fontSize:12,color:C.textLight,marginTop:1}}>Driver: {load.driverFullName}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:800,color:C.textDark}}>{invNum}</div>
              <div style={{fontSize:12,color:C.textLight,marginTop:4}}>Issued: {todayStr()}</div>
              <div style={{marginTop:8}}><span className={load.completed?"slt-badge-green":"slt-badge-orange"}>{load.completed?"✓ Delivered":"⬤ In Progress"}</span></div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24}}>
            <div>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:C.textLight,fontWeight:700,marginBottom:8}}>Load Info</div>
              <div style={{fontSize:13.5,color:C.textDark,lineHeight:1.9}}>
                <div><strong>Route:</strong> {load.location}</div><div><strong>Date:</strong> {load.date}</div>
                {load.appointmentTime&&<div><strong>Appt:</strong> {load.appointmentTime}</div>}{load.time&&<div><strong>Arrival:</strong> {load.time}</div>}{load.completedTime&&<div><strong>Completed:</strong> {load.completedTime}</div>}{load.tmwLoadNumber&&<div><strong>TMW #:</strong> {load.tmwLoadNumber}</div>}
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
              {load.fuelTotal>0&&<tr style={{borderBottom:`1px solid ${C.border}`,background:"#FFF8E1"}}><td style={{padding:"11px 12px",color:"#243B6E",fontWeight:700}}>⛽ Fuel Expense</td><td style={{color:"#243B6E"}}>{load.fuelLitres?`${load.fuelLitres}L @ $${Number(load.fuelPricePerLitre||0).toFixed(3)}/L`:"—"}</td><td style={{fontSize:11,color:"#888"}}>Business expense<br/>{load.completedTime?`at ${load.completedTime}`:load.date}</td><td style={{fontWeight:800,color:"#243B6E"}}>{fmtC(load.fuelTotal)}</td></tr>}
              <tr className="total" style={{background:C.blueLight}}><td colSpan={3} style={{padding:"11px 12px",fontWeight:800,fontSize:14}}>TOTAL</td><td style={{fontWeight:800,fontSize:17,color:C.blue,fontFamily:"'Barlow Condensed',sans-serif"}}>{fmtC(gross)}</td></tr>
            </tbody>
          </table>
          {load.note&&<div style={{background:C.offWhite,borderRadius:9,padding:"11px 14px",marginBottom:20,fontSize:13,color:C.textMed,fontStyle:"italic"}}>📝 {load.note}</div>}
          <div style={{textAlign:"center",color:C.textLight,fontSize:11,marginTop:28,borderTop:`1px solid ${C.border}`,paddingTop:14}}>Generated by TruckPilot · {todayStr()}</div>
        </div>
      </div>
    </div>
  );
}

// ─── MESSAGES TAB ─────────────────────────────────────────────────────────────
function MessagesTab({ session, loads, isOwner, onAddNote }) {
  const myLoads = isOwner?loads:loads.filter(l=>l.assignedDriverUid===session.uid||l.addedBy===session.uid||l.user_id===session.uid);
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
        <div style={{display:"grid",gridTemplateColumns:"min(300px,100%) 1fr",gap:18,minHeight:520,gridTemplateRows:"auto"}} className="slt-msg-grid">
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14}}>Load Threads</span>
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
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13.5,marginBottom:2}}>{l.location}</div>
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
                <div style={{fontWeight:700,marginBottom:6,fontFamily:"'Barlow Condensed',sans-serif"}}>Select a load to view notes</div>
                <div style={{fontSize:13}}>Notes are shared between owner and driver</div>
              </div>
            ):(
              <>
                <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,background:C.offWhite}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15}}>{current.location}</div>
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
function ExpensesTab({ session, isOwner, allLoads=[] , goBack}) {
  // Full CRA-claimable categories
  const CATS = [
    {id:"fuel",           l:"Fuel & Oil",              i:"⛽", c:C.orange,  cra:"Line 9220"},
    {id:"maintenance",    l:"Repairs & Maintenance",   i:"🔧", c:C.red,     cra:"Line 9270"},
    {id:"insurance",      l:"Insurance",               i:"🛡", c:C.blue,    cra:"Line 9910"},
    {id:"permits",        l:"Licenses & Renewals",     i:"📋", c:C.purple,  cra:"Line 9270"},
    {id:"telephone",      l:"Telephone & Internet",    i:"📱", c:"#00897B",  cra:"Line 9220"},
    {id:"rent",           l:"Rent / Lease",            i:"🏢", c:"#5C6BC0",  cra:"Line 9200"},
    {id:"meals",          l:"Meals & Entertainment",   i:"🍽", c:C.green,   cra:"Line 8523 (50%)"},
    {id:"lodging",        l:"Accommodation / Travel",  i:"🏨", c:"#8D6E63",  cra:"Line 9200"},
    {id:"tolls",          l:"Tolls & Parking",         i:"🛣", c:C.teal,    cra:"Line 9281"},
    {id:"union_dues",     l:"Union / Association Dues",i:"🤝", c:"#546E7A",  cra:"Line 9270"},
    {id:"tools_supplies", l:"Tools & Supplies",        i:"🧰", c:C.orange,  cra:"Line 9270"},
    {id:"safety",         l:"Safety Gear & Clothing",  i:"🦺", c:"#EF6C00",  cra:"Line 9270"},
    {id:"accounting",     l:"Accounting / Legal Fees", i:"📂", c:"#6D4C41",  cra:"Line 8860"},
    {id:"advertising",    l:"Advertising / Marketing", i:"📣", c:"#E91E63",  cra:"Line 8520"},
    {id:"bank_fees",      l:"Bank & Interest Charges", i:"🏦", c:"#37474F",  cra:"Line 8710"},
    {id:"medical",        l:"Medical / Drug Plan",     i:"💊", c:"#D32F2F",  cra:"Line 9270"},
    {id:"other",          l:"Other Operating",         i:"📦", c:C.textMed, cra:"Line 9270"},
  ];
  const HIGH_FUEL_THRESHOLD = 300;
  const [expenses,setExpenses]=useState([]);
  const [expView,setExpView]=useState("all");
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({amount:"",category:CATS[0].id,merchant:"",note:"",date:todayStr(),receipt:"",litres:"",pricePerLitre:"",expenseType:"personal"});
  const [receiptPreview,setReceiptPreview]=useState(null);
  const [fuelLogByDriver, setFuelLogByDriver] = useState({});

  useEffect(() => {
    if (!isOwner) return;
    const fetchFuelLogs = async () => {
      try {
        const own = await sbGetFuelLog(session.uid);
        const { data: fleetDrivers } = await sb.from("driver_fleets").select("driver_uid, driver_name, joined_at, left_at").eq("owner_uid", session.uid);
        let all = own.map(f => ({ ...f, driverName: session.fullName || "Owner" }));
        if (fleetDrivers) {
          for (const d of fleetDrivers) {
            const logs = await sbGetFuelLog(d.driver_uid);
            all = [...all, ...logs.map(f => ({ ...f, driverName: d.driver_name || "Driver" }))];
          }
        }
        // Group by driver name
        const grouped = all.reduce((acc, f) => {
          const name = f.driverName || "Unknown";
          if (!acc[name]) acc[name] = { name, total: 0, loads: 0, litres: 0, entries: [] };
          acc[name].total += Number(f.total || 0);
          acc[name].loads += 1;
          acc[name].litres += Number(f.litres || 0);
          acc[name].entries.push(f);
          return acc;
        }, {});
        setFuelLogByDriver(grouped);
      } catch(e) {}
    };
    fetchFuelLogs();
  }, [session.uid, isOwner]);
  const [alerts,setAlerts]=useState([]);
  const [editingId,setEditingId]=useState(null);
  const [scanning,setScanning]=useState(false);
  const [scanError,setScanError]=useState("");
  const [viewReceiptUrl,setViewReceiptUrl]=useState(null);

  useEffect(()=>{
    if (isOwner) {
      sbGetExpenses(session.uid).then(async data => {
        let all = data.length > 0 ? data : getStored(expensesKey(session.uid));
        // Fetch business expenses from fleet drivers
        try {
          const { data: fleetDrivers } = await sb.from("driver_fleets").select("driver_uid, driver_name, joined_at, left_at").eq("owner_uid", session.uid);
          if (fleetDrivers && fleetDrivers.length > 0) {
            for (const d of fleetDrivers) {
              const driverExps = await sbGetExpenses(d.driver_uid);
              const bizExps = driverExps.filter(e => e.ownerExpense || e.expenseType === "business");
              all = [...all, ...bizExps];
              // Also fetch fuel log entries and add as expenses
              const fuelLogs = await sbGetFuelLog(d.driver_uid);
              fuelLogs.forEach(f => {
                all.push({
                  id: `fuellog-${f.id}`, category:"fuel",
                  amount: Number(f.total||0),
                  merchant: `⛽ ${f.truck_number||"Truck"} · ${d.driver_name||"Driver"}`,
                  note: `${f.litres}L @ $${Number(f.price_per_litre||0).toFixed(3)}/L${f.location?` · ${f.location}`:""}`,
                  date: f.date || todayStr(),
                  source:"fuel_log", ownerExpense:true,
                  taxCategory:"Line 9220", taxLabel:"Fuel & Oil",
                  driverName: d.driver_name||"Driver",
                });
              });
            }
          }
          // Owner's own fuel logs
          const ownFuelLogs = await sbGetFuelLog(session.uid);
          ownFuelLogs.forEach(f => {
            all.push({
              id: `fuellog-${f.id}`, category:"fuel",
              amount: Number(f.total||0),
              merchant: `⛽ ${f.truck_number||"Truck"} · Owner`,
              note: `${f.litres}L @ $${Number(f.price_per_litre||0).toFixed(3)}/L${f.location?` · ${f.location}`:""}`,
              date: f.date || todayStr(),
              source:"fuel_log", ownerExpense:true,
              taxCategory:"Line 9220", taxLabel:"Fuel & Oil",
            });
          });
        } catch(e) {}
        setExpenses(all);
      }).catch(()=>setExpenses(getStored(expensesKey(session.uid))));
    } else {
      sbGetExpenses(session.uid).then(data=>{
        if(data.length>0) setExpenses(data);
        else setExpenses(getStored(expensesKey(session.uid)));
      }).catch(()=>setExpenses(getStored(expensesKey(session.uid))));
    }
  },[session.uid, isOwner]);

  // Auto-detect high fuel alerts from loads
  useEffect(()=>{
    if(!isOwner) return;
    const highFuel = allLoads.filter(l=>Number(l.fuelTotal)>HIGH_FUEL_THRESHOLD).map(l=>({
      id:l.id, driver:l.driverFullName||"Driver", amount:Number(l.fuelTotal),
      location:l.location||"Load", date:l.date, tmw:l.tmwLoadNumber
    }));
    setAlerts(highFuel);
  },[allLoads, isOwner]);

  const save=(arr)=>{
    setExpenses(arr);
    localStorage.setItem(expensesKey(session.uid),JSON.stringify(arr));
    arr.forEach(exp=>sbSaveExpense(exp,session.uid).catch(console.error));
  };

  const scanReceiptWithAI = async (base64Data) => {
    if (!base64Data || !base64Data.startsWith("data:image")) return;
    setScanning(true);
    setScanError("");
    console.log("Scanning receipt, calling /api/scan-receipt...");
    try {
      const base64 = base64Data.split(",")[1];
      const mediaType = base64Data.split(";")[0].split(":")[1];
      console.log("MediaType:", mediaType, "Image size:", base64.length);
      const response = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType })
      });
      const parsed = await response.json();
      if (parsed.error) throw new Error(parsed.error);
      setForm(f => ({
        ...f,
        amount: parsed.amount ? String(parsed.amount) : f.amount,
        merchant: parsed.merchant || f.merchant,
        category: parsed.category || f.category,
        date: parsed.date || f.date,
      }));
    } catch(e) {
      setScanError("Error: " + (e.message || "Could not read receipt. Please fill in manually."));
    }
    setScanning(false);
  };


  const handleReceipt=(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      const base64=ev.target.result;
      setForm(f=>({...f,receipt:base64}));
      setReceiptPreview(base64);
      // Trigger AI scan if it's an image
      if(base64.startsWith("data:image")) {
        scanReceiptWithAI(base64);
      } else {
        // Fallback: auto-categorize based on file name
        const name=file.name.toLowerCase();
        if(name.includes("shell")||name.includes("petro")||name.includes("esso")||name.includes("fuel")||name.includes("gas"))
          setForm(f=>({...f,category:"fuel",merchant:name.includes("shell")?"Shell":name.includes("petro")?"Petro-Canada":name.includes("esso")?"Esso":"Gas Station"}));
        else if(name.includes("hotel")||name.includes("inn")||name.includes("motel"))
          setForm(f=>({...f,category:"lodging"}));
        else if(name.includes("food")||name.includes("restaurant")||name.includes("meal"))
          setForm(f=>({...f,category:"meals"}));
      }
    };
    reader.readAsDataURL(file);
  };

  const add=()=>{
    if(!form.amount||isNaN(parseFloat(form.amount))) return;
    const cat=CATS.find(c=>c.id===form.category)||CATS[CATS.length-1];
    if(editingId){
      const updated=expenses.map(e=>e.id===editingId?{...e,...form,amount:parseFloat(form.amount),taxCategory:cat.cra,taxLabel:cat.l}:e);
      save(updated);
      if(session?.supabase) sbSaveExpense(updated.find(e=>e.id===editingId),session.uid).catch(console.error);
      setEditingId(null);
    } else {
      save([{...form,amount:parseFloat(form.amount),litres:form.litres?Number(form.litres):undefined,pricePerLitre:form.pricePerLitre?Number(form.pricePerLitre):undefined,id:Date.now().toString(),taxCategory:cat.cra,taxLabel:cat.l,expenseType:form.expenseType||"personal",ownerExpense:form.expenseType==="business"},...expenses]);
    }
    setForm({amount:"",category:CATS[0].id,merchant:"",note:"",date:todayStr(),receipt:"",litres:"",pricePerLitre:"",expenseType:"personal"});
    setReceiptPreview(null);
    setShowAdd(false);
  };

  const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  const fuelExps=expenses.filter(e=>e.category==="fuel");
  // Driver sees personal expenses only in Expenses tab — business expenses go to owner
  const visibleExpenses = isOwner ? expenses : expenses.filter(e => e.source !== "load" && !e.ownerExpense && e.expenseType !== "business");
  const fuelTotal=fuelExps.reduce((s,e)=>s+Number(e.amount||0),0);
  const byCat=CATS.map(c=>({...c,total:visibleExpenses.filter(e=>e.category===c.id).reduce((s,e)=>s+Number(e.amount||0),0)})).filter(c=>c.total>0);

  // For owner: fuel by driver from loads
  // Fuel by driver — combine load fuel + fuel log entries
  const fuelByDriver = isOwner ? (() => {
    const acc = { ...fuelLogByDriver };
    // Also add load-based fuel
    allLoads.filter(l=>Number(l.fuelTotal)>0).forEach(l=>{
      const name = l.driverFullName || (l.addedBy===l.ownerUid ? (l.ownerName||"Owner") : l.driverName||"Unknown");
      if(!acc[name]) acc[name]={name,total:0,loads:0,litres:0,entries:[]};
      acc[name].total+=Number(l.fuelTotal)||0;
      acc[name].loads+=1;
      acc[name].litres+=Number(l.fuelLitres)||0;
    });
    return acc;
  })() : {};

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">Expenses</div>
        <div className="slt-hero-sub">Total: {fmtC(total)} · Fuel: {fmtC(fuelTotal)}</div>
      </div>
      <div className="slt-container">

        {/* ── HIGH FUEL ALERTS (owner only) ── */}
        {isOwner&&alerts.length>0&&(
          <div style={{marginBottom:16}}>
            {alerts.map(a=>(
              <div key={a.id} style={{background:"#FFF3E0",border:"2px solid #243B6E",borderRadius:12,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>🚨</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,color:"#243B6E",fontSize:13}}>High Fuel Alert — {a.driver}</div>
                  <div style={{fontSize:12,color:"#BF360C"}}>{a.location} · {a.date}{a.tmw?` · TMW #${a.tmw}`:""} · {fmtC(a.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── VIEW TABS ── */}
        {isOwner&&(
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[["all","All Expenses"],["fuel","⛽ Fuel by Driver"]].map(([v,l])=>(
              <button key={v} onClick={()=>setExpView(v)} className="slt-btn-secondary"
                style={{flex:1,background:expView===v?C.blue:"#fff",color:expView===v?"#fff":C.textMed,borderColor:expView===v?C.blue:C.border,padding:"9px 8px",fontSize:13}}>{l}</button>
            ))}
          </div>
        )}

        {/* ── FUEL BY DRIVER VIEW (owner only) ── */}
        {isOwner&&expView==="fuel"&&(
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17,marginBottom:12}}>⛽ Fuel Expenses by Driver</div>
            {Object.keys(fuelByDriver).length===0
              ?<div className="slt-card" style={{textAlign:"center",padding:40}}><div style={{fontSize:38,marginBottom:8}}>⛽</div><div style={{color:C.textMed}}>No fuel logged yet</div></div>
              :Object.values(fuelByDriver).sort((a,b)=>b.total-a.total).map(d=>(
                <div key={d.name} className="slt-card" style={{borderLeft:`4px solid ${C.orange}`,padding:"14px 18px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>{d.name}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color:C.orange}}>{fmtC(d.total)}</div>
                  </div>
                  <div style={{display:"flex",gap:20}}>
                    <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>LOADS</div><div style={{fontSize:16,fontWeight:800}}>{d.loads}</div></div>
                    <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>LITRES</div><div style={{fontSize:16,fontWeight:800}}>{d.litres.toFixed(0)}L</div></div>
                    <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>AVG/LOAD</div><div style={{fontSize:16,fontWeight:800}}>{fmtC(d.total/d.loads)}</div></div>
                    <div><div style={{fontSize:11,color:C.textLight,fontWeight:700}}>TAX LINE</div><div style={{fontSize:12,fontWeight:700,color:C.orange}}>CRA 9220</div></div>
                  </div>
                  {allLoads.filter(l=>(l.driverFullName||"Unknown")===d.name&&Number(l.fuelTotal)>0).map(l=>(
                    <div key={l.id} style={{marginTop:8,padding:"8px 12px",background:C.offWhite,borderRadius:8,fontSize:12}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{color:C.textMed}}>{l.date} · {l.location||"—"}{l.tmwLoadNumber?` · TMW #${l.tmwLoadNumber}`:""}</span>
                        <span style={{fontWeight:800,color:Number(l.fuelTotal)>HIGH_FUEL_THRESHOLD?C.red:C.textMed}}>
                          {fmtC(Number(l.fuelTotal))}{Number(l.fuelTotal)>HIGH_FUEL_THRESHOLD?" 🚨":""}
                        </span>
                      </div>
                      {l.fuelLitres&&<div style={{color:C.textLight,marginTop:2}}>{l.fuelLitres}L @ ${Number(l.fuelPricePerLitre||0).toFixed(3)}/L</div>}
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        )}

        {/* ── ALL EXPENSES VIEW ── */}
        {expView==="all"&&<>
          {byCat.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>{byCat.map(c=><div key={c.id} className="slt-card-sm" style={{borderTop:`4px solid ${c.c}`}}><div style={{fontSize:20,marginBottom:4}}>{c.i}</div><div style={{fontSize:12,color:C.textMed,fontWeight:700}}>{c.l}</div><div style={{fontSize:20,fontWeight:800,color:c.c,fontFamily:"'Barlow Condensed',sans-serif",marginTop:4}}>{fmtC(c.total)}</div><div style={{fontSize:10,color:C.textLight,marginTop:2}}>{c.cra}</div></div>)}</div>}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17}}>All Expenses</span>
            <button className="slt-btn-primary" style={{width:"auto",padding:"10px 18px"}} onClick={()=>setShowAdd(!showAdd)}>{showAdd?"Cancel":"+ Add"}</button>
          </div>

          {showAdd&&<div className="slt-card" style={{border:`2px solid ${C.blue}`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              <div><label className="slt-label">Amount ($)</label><input type="number" step="0.01" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="slt-input" placeholder="0.00"/></div>
              <div><label className="slt-label">Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="slt-input"/></div>
            </div>
            {!isOwner && (
              <div style={{marginBottom:12}}>
                <label className="slt-label">Expense Type</label>
                <div style={{display:"flex",gap:8}}>
                  {[["personal","👤 My Expense","Personal cost — affects your tax report"],["business","🏢 Business Expense","Truck/fuel cost — goes to owner's business report"]].map(([val,label,desc])=>(
                    <button key={val} type="button" onClick={()=>setForm(f=>({...f,expenseType:val}))}
                      style={{flex:1,padding:"10px 12px",borderRadius:10,border:`2px solid ${form.expenseType===val?C.blue:C.border}`,background:form.expenseType===val?C.blueLight:"transparent",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontWeight:800,fontSize:13,color:form.expenseType===val?C.blue:C.textDark}}>{label}</div>
                      <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{marginBottom:12}}><label className="slt-label">Category (Auto Tax Line)</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="slt-input">
                {CATS.map(c=><option key={c.id} value={c.id}>{c.i} {c.l} — {c.cra}</option>)}
              </select>
            </div>
            <div style={{marginBottom:12}}><label className="slt-label">Merchant</label><input value={form.merchant} onChange={e=>setForm(f=>({...f,merchant:e.target.value}))} className="slt-input" placeholder="e.g. Shell"/></div>
            {form.category==="fuel"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div><label className="slt-label">Litres Pumped</label><input type="number" step="0.1" value={form.litres} onChange={e=>{const l=e.target.value;setForm(f=>({...f,litres:l,amount:l&&f.pricePerLitre?(Number(l)*Number(f.pricePerLitre)).toFixed(2):f.amount}));}} className="slt-input" placeholder="e.g. 150"/></div>
                <div><label className="slt-label">Price Per Litre ($)</label><input type="number" step="0.001" value={form.pricePerLitre} onChange={e=>{const p=e.target.value;setForm(f=>({...f,pricePerLitre:p,amount:p&&f.litres?(Number(f.litres)*Number(p)).toFixed(2):f.amount}));}} className="slt-input" placeholder="e.g. 1.459"/></div>
              </div>
            )}
            <div style={{marginBottom:12}}><label className="slt-label">Note</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="slt-input" placeholder="Details…"/></div>
            <div style={{marginBottom:16}}>
              <label className="slt-label">📎 Attach Receipt (auto-categorizes)</label>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <label style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.offWhite,cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:700,color:C.textMed}}>
                  📁 Choose File
                  <input type="file" accept="image/*,application/pdf" onChange={handleReceipt} style={{display:"none"}}/>
                </label>
                <label style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${C.blue}`,background:C.blueLight,cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:700,color:C.blue}}>
                  📷 Camera Scan
                  <input type="file" accept="image/*" capture="environment" onChange={handleReceipt} style={{display:"none"}}/>
                </label>
              </div>
              {receiptPreview&&receiptPreview.startsWith("data:image")&&(
                <div style={{marginTop:8,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,maxHeight:160,position:"relative"}}>
                  <img src={receiptPreview} alt="Receipt" style={{width:"100%",objectFit:"cover",maxHeight:160}}/>
                  {scanning&&(
                    <div style={{position:"absolute",inset:0,background:"rgba(36,59,110,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
                      <div style={{fontSize:28}}>🤖</div>
                      <div style={{color:"#fff",fontWeight:700,fontSize:13}}>Reading receipt...</div>
                    </div>
                  )}
                </div>
              )}
              {scanError&&<div style={{marginTop:6,fontSize:12,color:C.red,fontWeight:600}}>⚠️ {scanError}</div>}
              {scanning&&!receiptPreview&&<div style={{marginTop:8,padding:"10px 14px",borderRadius:10,background:"#EEF2FB",fontSize:13,fontWeight:600,color:"#243B6E"}}>🤖 Reading receipt with AI...</div>}
              {receiptPreview&&!receiptPreview.startsWith("data:image")&&(
                <div style={{marginTop:8,padding:"8px 12px",background:C.offWhite,borderRadius:8,fontSize:12,color:C.textMed}}>📄 PDF receipt attached</div>
              )}
            </div>
            <div style={{background:"#FFF3EB",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12}}>
              <span style={{fontWeight:800,color:C.blue}}>Tax: </span>
              <span style={{color:C.blue}}>{CATS.find(c=>c.id===form.category)?.cra||"—"} — {CATS.find(c=>c.id===form.category)?.l||"—"}</span>
            </div>
            <button className="slt-btn-primary" style={{width:"100%"}} onClick={add}>{editingId?"Update Expense":"Save Expense"}</button>
          </div>}

          {/* Full screen receipt viewer */}
          {viewReceiptUrl && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:3000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onClick={()=>setViewReceiptUrl(null)}>
              <div style={{position:"absolute",top:20,right:20}}>
                <button onClick={()=>setViewReceiptUrl(null)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:20,padding:"8px 16px",fontSize:14,fontWeight:700,cursor:"pointer"}}>✕ Close</button>
              </div>
              <img src={viewReceiptUrl} alt="Receipt" style={{maxWidth:"95vw",maxHeight:"85vh",objectFit:"contain",borderRadius:12}} onClick={e=>e.stopPropagation()}/>
              <a href={viewReceiptUrl} download="receipt.jpg" style={{marginTop:16,background:"#243B6E",color:"#fff",padding:"10px 24px",borderRadius:20,textDecoration:"none",fontWeight:700,fontSize:14}}>⬇️ Download</a>
            </div>
          )}

          {expenses.length===0
            ?<div className="slt-card" style={{textAlign:"center",padding:"44px"}}><div style={{fontSize:38,marginBottom:10}}>🧾</div><div style={{color:C.textMed}}>No expenses yet</div></div>
            :visibleExpenses.map(e=>{
              const cat=CATS.find(c=>c.id===e.category)||CATS[CATS.length-1];
              const isAutoFuel=e.source==="load";
              return(
                <div key={e.id} className="slt-card" style={{padding:"14px 18px",borderLeft:`4px solid ${cat.c}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17,color:cat.c}}>{fmtC(e.amount)}</div>
                        {isAutoFuel&&<span style={{fontSize:10,background:"#FFF3EB",color:C.blue,borderRadius:6,padding:"2px 8px",fontWeight:800}}>🔗 From Load</span>}
                        {e.receipt&&<span style={{fontSize:10,background:"#E8F5E9",color:C.green,borderRadius:6,padding:"2px 8px",fontWeight:800}}>📎 Receipt</span>}
                        {Number(e.amount)>HIGH_FUEL_THRESHOLD&&e.category==="fuel"&&<span style={{fontSize:10,background:"#FFF3E0",color:"#243B6E",borderRadius:6,padding:"2px 8px",fontWeight:800}}>🚨 High</span>}
                      </div>
                      <div style={{fontSize:13,color:C.textMed}}>{cat.i} {cat.l}{e.merchant?` · ${e.merchant}`:""}</div>
                      {(e.note||e.description)&&<div style={{fontSize:12,color:C.textLight}}>{e.description||e.note}</div>}
                      <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:C.textLight}}>{e.date}</span>
                        <span style={{fontSize:10,background:cat.c+"18",color:cat.c,borderRadius:6,padding:"1px 7px",fontWeight:700}}>{e.taxCategory||cat.cra}</span>
                        {cat.id==="meals"&&<span style={{fontSize:10,background:"#FFF8E1",color:"#F57C00",borderRadius:6,padding:"1px 7px",fontWeight:700}}>50% deductible</span>}
                      </div>
                      {e.receipt&&e.receipt.startsWith("data:image")&&(
                        <div style={{marginTop:8,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`,maxHeight:100,cursor:"pointer",position:"relative"}} onClick={()=>setViewReceiptUrl(e.receipt)}>
                          <img src={e.receipt} alt="Receipt" style={{width:"100%",objectFit:"cover",maxHeight:100}}/>
                          <div style={{position:"absolute",bottom:4,right:4,background:"rgba(0,0,0,0.55)",borderRadius:6,padding:"2px 7px",fontSize:10,color:"#fff",fontWeight:700}}>👁 View</div>
                        </div>
                      )}
                    </div>
                    <div style={{marginLeft:10,flexShrink:0,display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {isAutoFuel&&<span style={{fontSize:9,color:C.textLight,textAlign:"center",lineHeight:1.2}}>From<br/>Load</span>}
                        <button className="slt-btn-danger" style={{padding:"5px 10px",fontSize:11}} onClick={async()=>{
                          const updated=expenses.filter(x=>x.id!==e.id);
                          save(updated);
                          if(session?.supabase) await sbDeleteExpense(e.id).catch(console.error);
                        }}>Delete</button>
                        <button className="slt-btn-secondary" style={{padding:"5px 10px",fontSize:11}} onClick={()=>{
                          setForm({amount:String(e.amount),category:e.category,merchant:e.merchant||"",note:e.note||e.description||"",date:e.date,receipt:e.receipt||""});
                          setEditingId(e.id);
                          setReceiptPreview(e.receipt||null);
                          setShowAdd(true);
                        }}>Edit</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </>}
      </div>
    </div>
  );
}

// ─── DRIVERS TAB ──────────────────────────────────────────────────────────────
function DriversTab({ session, loads, rates , goBack}) {
  const [inviteCode, setInviteCode] = useState(session.inviteCode || "");
  const [drivers, setDrivers] = useState([]);
  const [inactiveDrivers, setInactiveDrivers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [copied, setCopied] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const loadAll = async () => {
    sbGetProfile(session.uid).then(profile => {
      if (profile?.invite_code) setInviteCode(profile.invite_code);
      else {
        const newCode = genCode();
        setInviteCode(newCode);
        sbSaveProfile({ id: session.uid, name: session.fullName, role: "owner", owner_uid: session.uid, plan: "free", invite_code: newCode });
      }
    });
    // Get drivers from both driver_fleets table and legacy owner_uid
    const [fleetDrivers, legacyDrivers] = await Promise.all([
      sbGetFleetDrivers(session.uid),
      sbGetDrivers(session.uid),
    ]);
    // Merge, deduplicate by uid (including within fleet drivers themselves)
    const seen = new Set();
    const merged = [];
    [...fleetDrivers, ...legacyDrivers].forEach(d => {
      if (!seen.has(d.uid)) { seen.add(d.uid); merged.push(d); }
    });
    setDrivers(merged);
    setRequests([]);
    sbGetInactiveDrivers(session.uid).then(setInactiveDrivers).catch(()=>{});
  };

  useEffect(() => { loadAll(); }, [session.uid]);

  const copyCode = () => {
    if (inviteCode) navigator.clipboard.writeText(inviteCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const regen = async () => {
    const newCode = genCode();
    setInviteCode(newCode);
    await sbSaveProfile({ id: session.uid, name: session.fullName, role: "owner", owner_uid: session.uid, plan: "free", invite_code: newCode });
  };
  const approve = async (driverUid) => {
    await sbApproveFleetRequest(driverUid, session.uid);
    setRequests(prev => prev.filter(r => r.id !== driverUid));
    await sbGetDrivers(session.uid).then(setDrivers);
  };
  const reject = async (driverUid) => {
    await sbRejectFleetRequest(driverUid);
    setRequests(prev => prev.filter(r => r.id !== driverUid));
  };
  const remove = async (uid) => {
    if (!window.confirm("Remove this driver from your fleet? Their account stays active.")) return;
    await sbRemoveDriverFromFleet(uid, session.uid);
    // Also update legacy owner_uid back to driver's own uid
    await sb.from("profiles").update({ owner_uid: uid }).eq("id", uid);
    setDrivers(prev => prev.filter(d => d.uid !== uid));
  };

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">Fleet Drivers</div>
        <div className="slt-hero-sub">{drivers.length} driver{drivers.length!==1?"s":""} in fleet{requests.length>0?` · ${requests.length} pending request${requests.length!==1?"s":""}`:""}</div>
      </div>
      <div className="slt-container">

        {/* Invite Code */}
        <div className="slt-card" style={{border:`2px solid ${C.blue}`, marginBottom:16}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17,color:C.blue,marginBottom:6}}>Your Fleet Invite Code</div>
          <div style={{fontSize:13,color:C.textMed,marginBottom:16}}>Share with drivers — they enter this to join your fleet</div>
          <div style={{background:C.blueLight,borderRadius:12,padding:"16px 20px",textAlign:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:30,fontWeight:800,color:C.blue,letterSpacing:10,marginBottom:16}}>{inviteCode||"——"}</div>
          <div style={{display:"flex",gap:10}}>
            <button className="slt-btn-primary" style={{background:copied?C.green:undefined}} onClick={copyCode}>{copied?"✓ Copied!":"Copy Code"}</button>
            <button className="slt-btn-secondary" style={{padding:"12px 16px"}} onClick={regen}>🔄 New Code</button>
          </div>
        </div>

        {/* Pending Requests */}
        {requests.length > 0 && (
          <div className="slt-card" style={{border:`2px solid ${C.orange}`, marginBottom:16}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,color:C.orange,marginBottom:12}}>
              🔔 {requests.length} Fleet Request{requests.length!==1?"s":""}
            </div>
            {requests.map(r => (
              <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{r.name}</div>
                  {r.username && <div style={{fontSize:12,color:C.textLight}}>@{r.username}</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>approve(r.id)} style={{padding:"7px 14px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>✅ Approve</button>
                  <button onClick={()=>reject(r.id)} style={{padding:"7px 14px",borderRadius:8,border:`1px solid ${C.red}`,background:"#fff",color:C.red,fontWeight:800,fontSize:12,cursor:"pointer"}}>❌ Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Driver Profile View */}
        {selectedDriver && (() => {
          const d = selectedDriver;
          const dl = loads.filter(l=>l.assignedDriverUid===d.uid||l.addedBy===d.uid);
          const done = dl.filter(l=>l.completed);
          const active = dl.filter(l=>!l.completed);
          const dp = dl.reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates?.driverWaitRate)||0);},0);
          const initials = (d.fullName||d.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
          return (
            <div className="slt-card" style={{marginBottom:16}}>
              {/* Back button */}
              <button onClick={()=>setSelectedDriver(null)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"#243B6E",fontWeight:700,fontSize:14,marginBottom:16,padding:0}}>
                ‹ All Drivers
              </button>
              {/* Avatar + Name */}
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
                <div style={{width:64,height:64,borderRadius:"50%",background:"#243B6E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:24,fontWeight:900,color:"#fff",flexShrink:0}}>
                  {initials}
                </div>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:"#1A1A1A"}}>{d.fullName||d.name}</div>
                  {d.username&&<div style={{fontSize:13,color:"#888"}}>@{d.username}</div>}
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>Joined {d.joined?.slice(0,10)||"—"}</div>
                </div>
              </div>
              {/* Stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                {[{val:dl.length,lbl:"Total Loads"},{val:done.length,lbl:"Completed"},{val:active.length,lbl:"Active"}].map(s=>(
                  <div key={s.lbl} style={{borderRadius:12,padding:"12px",background:"#F4F1EC",textAlign:"center"}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:"#243B6E"}}>{s.val}</div>
                    <div style={{fontSize:10,fontWeight:600,color:"#888",textTransform:"uppercase",marginTop:2}}>{s.lbl}</div>
                  </div>
                ))}
              </div>
              {/* Total Pay */}
              <div style={{background:"#243B6E",borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:"rgba(255,255,255,.7)",fontWeight:600}}>Total Pay Earned</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900,color:"#fff"}}>{fmtC(dp)}</div>
              </div>
              {/* Recent Loads */}
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,marginBottom:12}}>Recent Loads</div>
              {dl.slice(0,5).map((l,i)=>(
                <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f0f0f0"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#1A1A1A"}}>{l.location}</div>
                    <div style={{fontSize:12,color:"#888"}}>{l.date}{l.time?` · ${l.time}`:""}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:800,color:"#243B6E"}}>{fmtC(Number(l.driverBasePay||0))}</div>
                    <span style={{fontSize:10,fontWeight:700,color:l.completed?"#22C55E":"#243B6E"}}>{l.completed?"✓ Done":"Active"}</span>
                  </div>
                </div>
              ))}
              {dl.length===0&&<div style={{textAlign:"center",color:"#888",padding:"20px 0",fontSize:13}}>No loads yet</div>}
              {/* Owner Rating */}
              <div style={{marginTop:16,borderTop:"1px solid #f0f0f0",paddingTop:16}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,marginBottom:10}}>⭐ Your Rating for this Driver</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[1,2,3,4,5].map(star=>(
                    <button key={star} onClick={async()=>{
                      await sb.from("profiles").update({owner_rating:star}).eq("id",d.uid);
                      setDrivers(prev=>prev.map(x=>x.uid===d.uid?{...x,ownerRating:star}:x));
                      setSelectedDriver({...d,ownerRating:star});
                    }} style={{fontSize:28,background:"none",border:"none",cursor:"pointer",
                      color:(d.ownerRating||0)>=star?"#FFD700":"#ddd"}}>★</button>
                  ))}
                  {d.ownerRating && <span style={{fontSize:13,color:"#888",alignSelf:"center"}}>{d.ownerRating}.0 / 5</span>}
                </div>
              </div>
              {/* Remove button */}
              <button className="slt-btn-danger" style={{width:"100%",marginTop:8,padding:"12px"}} onClick={()=>{remove(d.uid);setSelectedDriver(null);}}>Remove from Fleet</button>
            </div>
          );
        })()}

        {/* Active Drivers List */}
        {!selectedDriver && (
          <>
            {drivers.length===0
              ? <div className="slt-card" style={{textAlign:"center",padding:"44px"}}><div style={{fontSize:38,marginBottom:10}}>👥</div><div style={{color:C.textMed}}>No drivers in your fleet yet.</div><div style={{fontSize:13,color:C.textLight,marginTop:6}}>Share your invite code above or wait for join requests.</div></div>
              : drivers.map(d => {
                const dl = loads.filter(l=>l.assignedDriverUid===d.uid||l.addedBy===d.uid);
                const dp = dl.reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates?.driverWaitRate)||0);},0);
                const initials = (d.fullName||d.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                return (
                  <div key={d.uid} className="slt-card" style={{cursor:"pointer"}} onClick={()=>setSelectedDriver(d)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:44,height:44,borderRadius:"50%",background:"#243B6E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,color:"#fff",flexShrink:0}}>
                          {initials}
                        </div>
                        <div>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:17}}>{d.fullName||d.name}</div>
                          <div style={{fontSize:12,color:C.textLight}}>{dl.length} loads · {fmtC(dp)} total pay</div>
                        </div>
                      </div>
                      <span style={{fontSize:18,color:"#888"}}>›</span>
                    </div>
                  </div>
                );
              })
            }
          </>
        )}
      </div>
    </div>
  );
}

// ─── REPORT TAB ───────────────────────────────────────────────────────────────
function ReportTab({ loads, session, rates, isOwner, allDrivers, goBack, setTab, setDetailLoad }) {
  const [range,setRange]=useState("month"); const [dFilter,setDFilter]=useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [reportFuelLogs, setReportFuelLogs] = useState([]);
  const [expanded, setExpanded] = useState(null); // which P&L row is expanded
  const toggleExpand = (key) => setExpanded(prev => prev === key ? null : key);

  useEffect(() => {
    if (!isOwner) return;
    const fetchFuelLogs = async () => {
      try {
        const own = await sbGetFuelLog(session.uid);
        const { data: fleetDrivers } = await sb.from("driver_fleets").select("driver_uid, driver_name, joined_at, left_at").eq("owner_uid", session.uid);
        let all = own.map(f => ({ ...f, driverName:"Owner" }));
        if (fleetDrivers) {
          for (const d of fleetDrivers) {
            const logs = await sbGetFuelLog(d.driver_uid);
            all = [...all, ...logs.map(f => ({ ...f, driverName: d.driver_name||"Driver" }))];
          }
        }
        setReportFuelLogs(all);
      } catch(e) {}
    };
    fetchFuelLogs();
  }, [session.uid, isOwner]);

  const fd=(d)=>{ 
    if(!d) return false; 
    const dt=new Date(d+"T12:00:00"), now=new Date(); 
    if(range==="custom") {
      const from = customFrom ? new Date(customFrom+"T00:00:00") : null;
      const to = customTo ? new Date(customTo+"T23:59:59") : null;
      if(from && dt < from) return false;
      if(to && dt > to) return false;
      return true;
    }
    if(range==="today") return dt.toDateString()===now.toDateString(); 
    if(range==="week"){const w=new Date(now);w.setDate(w.getDate()-7);return dt>=w;} 
    if(range==="month"){const m=new Date(now);m.setDate(m.getDate()-30);return dt>=m;} 
    // all / year
    return dt.getFullYear()===now.getFullYear();
  };
  const ml=isOwner?loads.filter(l=>fd(l.date)&&(dFilter==="all"||l.assignedDriverUid===dFilter||(!l.assignedDriverUid&&dFilter==="owner"))):loads.filter(l=>fd(l.date)&&(l.assignedDriverUid===session.uid||l.addedBy===session.uid||l.user_id===session.uid));

  // Load financials
  const te=ml.reduce((s,l)=>s+Number(l.earnings||0),0);
  const wc=ml.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
  const gross=te+wc;
  // Only count driver pay for loads actually assigned to a driver (not owner)
  const totalDrvPay=ml.filter(l=>{ const dUid=l.assignedDriverUid||(l.addedBy!==session.uid?l.addedBy:null)||(l.user_id!==session.uid?l.user_id:null); return Number(l.driverBasePay||0)>0 && dUid && dUid!==session.uid; }).reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates.driverWaitRate)||0);},0);
  const tw=ml.reduce((s,l)=>s+(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0),0);
  // Driver-specific pay:
  // If load has driverBasePay set (fleet driver) use that
  // If driver logged their own load solo, use earnings as their pay
  const drp = isOwner ? 0 : ml.reduce((s,l) => {
    if (Number(l.driverBasePay) > 0) return s + Number(l.driverBasePay);
    // Solo driver own load — use earnings
    if (!l.assignedDriverUid || l.assignedDriverUid === session.uid) return s + Number(l.earnings||0);
    return s;
  }, 0);
  const dwp = isOwner ? 0 : ml.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0),0);

  // Expenses — load fuel is owner/business only, never shown to drivers
  const [sbExpRep, setSbExpRep] = useState([]);
  useEffect(()=>{ sbGetExpenses(session.uid).then(d=>{if(d?.length>0)setSbExpRep(d);}).catch(()=>{}); },[session.uid]);
  const allExpenses=(()=>{
    const local=getStored(expensesKey(session.uid));
    const merged=[...local];
    sbExpRep.forEach(se=>{if(!merged.find(e=>e.id===se.id))merged.push(se);});
    // Add fuel log entries for owner — keyed by date for correct period filtering
    if (isOwner) {
      reportFuelLogs.filter(f => fd(f.date)).forEach(f => {
        const fid = `fuellog-${f.id}`;
        if (!merged.find(e => e.id === fid)) {
          merged.push({
            id: fid, category:"fuel",
            amount: Number(f.total||0),
            merchant: `⛽ Fuel Log · ${f.driverName||"Driver"}`,
            note: `${f.litres}L @ $${Number(f.price_per_litre||0).toFixed(3)}/L${f.location?` · ${f.location}`:""}`,
            date: f.date, source:"fuel_log", ownerExpense:true,
            taxCategory:"Line 9220", taxLabel:"Fuel & Oil",
          });
        }
      });
    }
    return merged;
  })();
  const filteredExp=allExpenses.filter(e=>{
    if(!fd(e.date)) return false;
    if(isOwner) return true;
    // Driver: personal expenses only — business expenses don't deduct from driver pay
    if(e.source==="load" || e.ownerExpense || e.expenseType==="business") return false;
    return true;
  });
  // Business expenses submitted by driver — shown separately in driver report, no deduction
  const driverSubmittedBizExp = !isOwner ? allExpenses.filter(e => fd(e.date) && (e.ownerExpense || e.expenseType==="business")) : [];
  // Business expenses (logged by driver but flagged as business) — go to owner report
  const businessExp=allExpenses.filter(e=>fd(e.date) && (e.ownerExpense || e.expenseType==="business"));
  const filteredExpNoFuel=filteredExp.filter(e=>e.category!=="fuel"&&e.source!=="load");
  const filteredFuelOnly=filteredExp.filter(e=>e.category==="fuel"||e.source==="load");
  const expByCategory={};
  filteredExp.forEach(e=>{const cat=e.category||"other";expByCategory[cat]=(expByCategory[cat]||0)+Number(e.amount||0);});
  const expByCategoryNoFuel={};
  filteredExpNoFuel.forEach(e=>{const cat=e.category||"other";expByCategoryNoFuel[cat]=(expByCategoryNoFuel[cat]||0)+Number(e.amount||0);});
  const totalExp=filteredExp.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalExpNoFuel=filteredExpNoFuel.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalFuelExp=filteredFuelOnly.reduce((s,e)=>s+Number(e.amount||0),0);

  // Net after expenses
  // Owner net: gross minus driver pay minus ALL expenses (fuel is owner cost)
  const ownerNet=gross-totalDrvPay-totalExp;
  // Driver net: driver pay minus ONLY non-fuel expenses (fuel is NOT driver's cost)
  const driverNet=(drp+dwp); // Expenses shown separately, never deducted from pay

  const ECATS={fuel:"⛽ Fuel & Oil",maintenance:"🔧 Repairs & Maintenance",insurance:"🛡 Insurance",permits:"📋 Licenses & Renewals",telephone:"📱 Telephone & Internet",rent:"🏢 Rent / Lease",meals:"🍽 Meals & Entertainment",lodging:"🏨 Accommodation",tolls:"🛣 Tolls & Parking",union_dues:"🤝 Union Dues",tools_supplies:"🧰 Tools & Supplies",safety:"🦺 Safety Gear",accounting:"📂 Accounting / Legal",advertising:"📣 Advertising",bank_fees:"🏦 Bank Fees",medical:"💊 Medical",other:"📦 Other"};

  return (
    <div className="slt-page" style={{background:"#F5F5F0"}}>
      {goBack && <BackButton onBack={goBack} label="Back" />}
      {/* Orange Earnings Header */}
      <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:700,letterSpacing:1,color:"#1A1A1A"}}>MY <span style={{color:"#243B6E"}}>EARNINGS</span></div>
      </div>

      {/* Period Chips */}
      <div style={{padding:"0 16px 12px"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom: showCustom ? 10 : 0}}>
          {[["week","This Week"],["month","This Month"],["all","This Year"],["custom","📅 Custom"]].map(([v,l])=>(
            <div key={v} onClick={()=>{ setRange(v); if(v==="custom") setShowCustom(true); else setShowCustom(false); }}
              style={{borderRadius:20,padding:"6px 14px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer",flexShrink:0,background:range===v?"#243B6E":"#fff",color:range===v?"#fff":"#888",border:range===v?"none":"1px solid #eee"}}>{l}</div>
          ))}
        </div>
        {showCustom && (
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,background:"#f0f4ff",borderRadius:12,padding:"10px 14px"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:"#243B6E",marginBottom:4}}>FROM</div>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="slt-input" style={{width:"100%",fontSize:13}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:"#243B6E",marginBottom:4}}>TO</div>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="slt-input" style={{width:"100%",fontSize:13}}/>
            </div>
            <button onClick={()=>{ if(!customFrom&&!customTo){setShowCustom(false);setRange("month");} }} 
              style={{padding:"8px 12px",background:"#243B6E",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",marginTop:18}}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Hero Card */}
      <div style={{margin:"0 16px 12px",borderRadius:22,padding:"28px 20px",background:"#243B6E",position:"relative",overflow:"hidden",textAlign:"center"}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:"rgba(255,255,255,0.55)",marginBottom:10}}>
          {isOwner ? "💰 Gross Revenue" : "💵 You Earned"}
        </div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:64,fontWeight:900,color:"#fff",lineHeight:1,marginBottom:8,letterSpacing:"-1px"}}>
          ${(isOwner?gross:drp+dwp).toLocaleString("en",{minimumFractionDigits:0,maximumFractionDigits:0})}
        </div>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.12)",borderRadius:20,padding:"6px 14px"}}>
          <span style={{fontSize:13,color:"rgba(255,255,255,0.9)",fontWeight:600}}>↑ {ml.length} load{ml.length!==1?"s":""} this period</span>
        </div>
        {ml.length > 0 && (
          <div style={{marginTop:16,fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:500}}>
            avg {fmtC(Math.round((isOwner?gross:drp+dwp)/ml.length))} per load
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div style={{display:"flex",gap:8,margin:"0 16px 12px"}}>
        {[{val:ml.length,label:"Loads"},{val:"$"+(ml.length?Math.round((isOwner?gross:drp+dwp)/ml.length):0).toLocaleString(),label:"Avg / Load"},{val:ml.reduce((s,l)=>s+Number(l.distance||l.miles||0),0)||"—",label:"Miles"}].map(s=>(
          <div key={s.label} style={{flex:1,borderRadius:14,padding:12,textAlign:"center",background:"#fff",border:"1px solid #eee"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:700,color:"#243B6E"}}>{s.val}</div>
            <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginTop:2,color:"#aaa"}}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="slt-container">
        {/* Hidden range filter for compatibility */}
        <div style={{display:"none"}}>
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

        {/* ── SUMMARY CARDS ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
          {(isOwner
            ?[["Loads",ml.length,C.textDark,"#243B6E"],["Gross",fmtC(gross),C.green,C.green],["Driver Pay",fmtC(totalDrvPay),C.blue,C.blue],["Expenses",fmtC(totalExp),C.red,C.red],["Net",fmtC(ownerNet),ownerNet>=0?C.green:C.red,ownerNet>=0?C.green:C.red]]
            :[["Loads",ml.length,C.textDark,"#243B6E"],["Route Pay",fmtC(drp),C.blue,C.blue],["Wait Pay",fmtC(dwp),C.orange,C.orange],["Total Pay",fmtC(driverNet),C.green,C.green],["My Expenses",fmtC(allExpenses.filter(e=>!e.ownerExpense&&e.expenseType!=="business"&&e.source!=="load").reduce((s,e)=>s+Number(e.amount||0),0)),C.red,C.red]]
          ).map(([l,v,color,border])=>(
            <div key={l} className="slt-card-sm" style={{borderTop:`4px solid ${border}`}}>
              <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,letterSpacing:1,marginBottom:4}}>{l.toUpperCase()}</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color}}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── EXPORT REPORT ── */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <button className="slt-btn-primary" style={{ width:"auto", padding:"10px 20px", fontSize:13 }} onClick={() => {
            const rangeLabel = range==="custom" ? `${customFrom||"Start"}_to_${customTo||"End"}` : {today:"Today",week:"Last 7 Days",month:"Last 30 Days",all:"This Year"}[range]||"Report";
            const loadRows = ml.slice(0,50).map(l=>`<tr><td>${l.date||"—"}</td><td>${l.location||"—"}</td><td>${l.completedAt?"✓ Done":"Active"}</td><td style="text-align:right">$${Number(l.earnings||0).toFixed(2)}</td>${isOwner&&l.assignedDriverUid?`<td style="text-align:right">$${Number(l.driverBasePay||0).toFixed(2)}</td>`:"<td style='text-align:right;color:#999'>—</td>"}</tr>`).join("");
            const html = `
              <div class="header"><div class="brand">🚛 TruckPilot</div><div><div style="font-size:20px;font-weight:800">${isOwner?"Fleet Report":"Driver Report"}</div><div style="color:#666">${rangeLabel} · ${session.fullName||session.name}</div></div></div>
              <div class="summary">
                <div class="summary-card"><div class="label">Loads</div><div class="value">${ml.length}</div></div>
                <div class="summary-card"><div class="label">${isOwner?"Gross Revenue":"Route Pay"}</div><div class="value green">$${isOwner?gross.toFixed(2):drp.toFixed(2)}</div></div>
                <div class="summary-card"><div class="label">${isOwner?"Net Profit":"Net Pay"}</div><div class="value" style="color:${isOwner?(ownerNet>=0?"#2E7D32":"#C62828"):(driverNet>=0?"#2E7D32":"#C62828")}">$${isOwner?ownerNet.toFixed(2):driverNet.toFixed(2)}</div></div>
              </div>
              ${isOwner?`<div class="summary">
                <div class="summary-card"><div class="label">Driver Pay</div><div class="value red">$${totalDrvPay.toFixed(2)}</div></div>
                <div class="summary-card"><div class="label">Expenses</div><div class="value red">$${totalExp.toFixed(2)}</div></div>
                <div class="summary-card"><div class="label">Wait Time Pay</div><div class="value blue">$${wc.toFixed(2)}</div></div>
              </div>`:""}
              <h2>Load History (${ml.length} loads${ml.length>50?" · showing first 50":""})</h2>
              <table><thead><tr><th>Date</th><th>Route</th><th>Status</th><th>Earnings</th><th>Driver Pay</th></tr></thead>
              <tbody>${loadRows}</tbody>
              <tr class="total"><td colspan="3"><strong>TOTAL</strong></td><td><strong>$${gross.toFixed(2)}</strong></td><td><strong>$${totalDrvPay.toFixed(2)}</strong></td></tr></table>
              ${Object.keys(expByCategory).length>0?`<h2>Expenses by Category</h2><table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${Object.entries(expByCategory).map(([cat,amt])=>`<tr><td>${ECATS[cat]||cat}</td><td style="text-align:right">$${amt.toFixed(2)}</td></tr>`).join("")}</tbody><tr class="total"><td>Total Expenses</td><td>$${totalExp.toFixed(2)}</td></tr></table>`:""}`;
            downloadPDF(html, `Report_${rangeLabel.replace(/ /g,"_")}_${todayStr()}`, session);
          }}>⬇ Download Report PDF</button>
        </div>

        {/* ── DETAILED P&L BREAKDOWN ── */}
        <div className="slt-card" style={{marginBottom:20}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,marginBottom:16}}>{isOwner?"📊 Profit & Loss":"💵 Pay Breakdown"}</div>

          {isOwner?(
            <>
              {/* Revenue */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Revenue</div>

                {/* Load Earnings */}
                <div onClick={()=>toggleExpand("earnings")} style={{cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:13,color:C.textMed}}>Load Earnings <span style={{fontSize:11}}>{expanded==="earnings"?"▲":"▼"}</span></span>
                    <span style={{fontSize:13,fontWeight:600,color:C.green}}>+{fmtC(te)}</span>
                  </div>
                  {expanded==="earnings" && (
                    <div style={{background:"#f8faff",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                      {ml.map(l=>(
                        <div key={l.id} onClick={()=>{ setDetailLoad(l); setTab("log"); }} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eef0f8",fontSize:12,cursor:"pointer"}}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(36,59,110,0.05)"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div><div style={{fontWeight:700,color:"#243B6E"}}>{l.location||"—"}</div><div style={{color:"#999"}}>{l.date} · {l.driverFullName||"Owner"}</div></div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontWeight:700,color:C.green}}>+{fmtC(l.earnings||0)}</span>
                            <span style={{color:"#aaa",fontSize:14}}>›</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Wait Time */}
                {wc > 0 && (
                  <div onClick={()=>toggleExpand("waittime")} style={{cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,color:C.textMed}}>Wait Time (Co.) <span style={{fontSize:11}}>{expanded==="waittime"?"▲":"▼"}</span></span>
                      <span style={{fontSize:13,fontWeight:600,color:C.green}}>+{fmtC(wc)}</span>
                    </div>
                    {expanded==="waittime" && (
                      <div style={{background:"#f8faff",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                        {ml.filter(l=>(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0)>0).map(l=>{
                          const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                          const wpay=wm/60*(Number(rates.companyWaitRate)||0);
                          return(
                            <div key={l.id} onClick={()=>{ setDetailLoad(l); setTab("log"); }} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eef0f8",fontSize:12,cursor:"pointer"}}
                              onMouseEnter={e=>e.currentTarget.style.background="rgba(36,59,110,0.05)"}
                              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              <div><div style={{fontWeight:700,color:"#243B6E"}}>{l.location||"—"}</div><div style={{color:"#999"}}>{l.date} · {wm}min wait</div></div>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontWeight:700,color:C.green}}>+{fmtC(wpay)}</span>
                                <span style={{color:"#aaa",fontSize:14}}>›</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Total Gross */}
                <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontWeight:800}}>
                  <span style={{fontSize:13,color:C.textDark}}>Total Gross</span>
                  <span style={{fontSize:13,fontWeight:800,color:C.green,fontFamily:"'Barlow Condensed',sans-serif"}}>+{fmtC(gross)}</span>
                </div>
              </div>

              {/* Deductions */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Deductions</div>

                {/* Driver Pay */}
                <div onClick={()=>toggleExpand("drvpay")} style={{cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:13,color:C.textMed}}>Driver Pay (all) <span style={{fontSize:11}}>{expanded==="drvpay"?"▲":"▼"}</span></span>
                    <span style={{fontSize:13,fontWeight:600,color:C.red}}>-{fmtC(totalDrvPay)}</span>
                  </div>
                  {expanded==="drvpay" && (
                    <div style={{background:"#fff5f5",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                      {ml.filter(l=>{
                        const dUid=l.assignedDriverUid||(l.addedBy!==session.uid?l.addedBy:null)||(l.user_id!==session.uid?l.user_id:null);
                        return Number(l.driverBasePay||0)>0 && dUid && dUid!==session.uid;
                      }).map(l=>{
                        const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                        const waitPay=wm/60*(Number(rates.driverWaitRate)||0);
                        const totalPay=Number(l.driverBasePay||0)+waitPay;
                        return(
                          <div key={l.id} onClick={()=>{ setDetailLoad(l); setTab("log"); }} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #ffe8e8",fontSize:12,cursor:"pointer"}}
                            onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,0.05)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <div>
                              <div style={{fontWeight:700,color:"#243B6E"}}>{l.driverFullName||"Driver"}</div>
                              <div style={{color:"#999"}}>{l.date} · {l.location||"—"}</div>
                              {waitPay>0&&<div style={{color:"#B45309",fontSize:11}}>Route {fmtC(l.driverBasePay)} + Wait {fmtC(waitPay)}</div>}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontWeight:700,color:C.red}}>-{fmtC(totalPay)}</span>
                              <span style={{color:"#aaa",fontSize:14}}>›</span>
                            </div>
                          </div>
                        );
                      })}
                      {ml.filter(l=>{
                        const dUid=l.assignedDriverUid||(l.addedBy!==session.uid?l.addedBy:null)||(l.user_id!==session.uid?l.user_id:null);
                        return Number(l.driverBasePay||0)>0 && dUid && dUid!==session.uid;
                      }).length===0&&
                        <div style={{fontSize:12,color:"#999",padding:"4px 0"}}>No driver pay in this period</div>}
                    </div>
                  )}
                </div>

                {/* Expense categories */}
                {Object.entries(expByCategory).map(([cat,amt])=>(
                  <div key={cat} onClick={()=>toggleExpand(`exp-${cat}`)} style={{cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,color:C.textMed}}>{ECATS[cat]||cat} <span style={{fontSize:11}}>{expanded===`exp-${cat}`?"▲":"▼"}</span></span>
                      <span style={{fontSize:13,fontWeight:600,color:C.red}}>-{fmtC(amt)}</span>
                    </div>
                    {expanded===`exp-${cat}` && (
                      <div style={{background:"#fff5f5",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                        {filteredExp.filter(e=>e.category===cat).map(e=>(
                          <div key={e.id} onClick={()=>setTab("expenses")} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #ffe8e8",fontSize:12,cursor:"pointer"}}
                            onMouseEnter={ev=>ev.currentTarget.style.background="rgba(239,68,68,0.05)"}
                            onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                            <div><div style={{fontWeight:700,color:"#243B6E"}}>{e.merchant||e.description||"Expense"}</div><div style={{color:"#999"}}>{e.date}{e.note?` · ${e.note}`:""}</div></div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontWeight:700,color:C.red}}>-{fmtC(e.amount)}</span>
                              <span style={{color:"#aaa",fontSize:14}}>›</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {totalExp===0&&<div style={{fontSize:12,color:C.textLight,padding:"7px 0"}}>No expenses logged</div>}
              </div>
              {/* Fuel Log breakdown */}
              {reportFuelLogs.filter(f=>fd(f.date)).length > 0 && (
                <div style={{marginBottom:10,borderRadius:10,border:"1.5px solid #E0F2F1",padding:"10px 14px",background:"#E0F2F1"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#00695C",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>⛽ Fleet Fuel Log</div>
                  {reportFuelLogs.filter(f=>fd(f.date)).map(f=>(
                    <div key={f.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"#00695C"}}>{f.driverName||"Driver"} · {f.truck_number||"Truck"}</div>
                        <div style={{fontSize:11,color:"#666"}}>{f.date} · {f.litres}L @ ${Number(f.price_per_litre||0).toFixed(3)}/L{f.location?` · ${f.location}`:""}</div>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:"#00695C"}}>-${Number(f.total||0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontWeight:800,fontSize:13,color:"#00695C"}}>
                    <span>Total Fleet Fuel</span>
                    <span>-${reportFuelLogs.filter(f=>fd(f.date)).reduce((s,f)=>s+Number(f.total||0),0).toFixed(2)}</span>
                  </div>
                </div>
              )}
              {/* Net */}
              <div style={{background:ownerNet>=0?"#E8F5E9":"#FFEBEE",borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:ownerNet>=0?C.green:C.red}}>NET PROFIT</span>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:ownerNet>=0?C.green:C.red}}>{ownerNet>=0?"+":""}{fmtC(ownerNet)}</span>
              </div>
            </>
          ):(
            <>
              {/* Driver pay breakdown */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Earnings</div>

                {/* Base Route Pay */}
                <div onClick={()=>toggleExpand("drv-route")} style={{cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:13,color:C.textMed}}>Base Route Pay <span style={{fontSize:11}}>{expanded==="drv-route"?"▲":"▼"}</span></span>
                    <span style={{fontSize:13,fontWeight:600,color:C.blue}}>+{fmtC(drp)}</span>
                  </div>
                  {expanded==="drv-route" && (
                    <div style={{background:"#f0f4ff",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                      {ml.map(l=>(
                        <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #e8eeff",fontSize:12}}>
                          <div><div style={{fontWeight:700,color:"#243B6E"}}>{l.location||"—"}</div><div style={{color:"#999"}}>{l.date}</div></div>
                          <span style={{fontWeight:700,color:C.blue}}>+{fmtC(Number(l.driverBasePay||0)||Number(l.earnings||0))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Wait Pay */}
                {dwp > 0 && (
                  <div onClick={()=>toggleExpand("drv-wait")} style={{cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,color:C.textMed}}>Wait Pay <span style={{fontSize:11}}>{expanded==="drv-wait"?"▲":"▼"}</span></span>
                      <span style={{fontSize:13,fontWeight:600,color:C.orange}}>+{fmtC(dwp)}</span>
                    </div>
                    {expanded==="drv-wait" && (
                      <div style={{background:"#FFF8E1",borderRadius:8,padding:"8px 12px",marginBottom:4}}>
                        {ml.filter(l=>(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0)>0).map(l=>{
                          const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                          const wp=wm/60*(Number(rates.driverWaitRate)||0);
                          return(
                            <div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #fff0c0",fontSize:12}}>
                              <div><div style={{fontWeight:700,color:"#243B6E"}}>{l.location||"—"}</div><div style={{color:"#999"}}>{l.date} · {wm}min</div></div>
                              <span style={{fontWeight:700,color:C.orange}}>+{fmtC(wp)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Total */}
                <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontWeight:800}}>
                  <span style={{fontSize:13,color:C.textDark}}>Total Earned</span>
                  <span style={{fontSize:13,fontWeight:800,color:C.green,fontFamily:"'Barlow Condensed',sans-serif"}}>+{fmtC(drp+dwp)}</span>
                </div>
              </div>
              {/* Driver expenses — fuel excluded, it is a business cost */}
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>My Expenses</div>
                {Object.entries(expByCategoryNoFuel).length>0
                  ?Object.entries(expByCategoryNoFuel).map(([cat,amt])=>(
                    <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,color:C.textMed}}>{ECATS[cat]||cat}</span>
                      <span style={{fontSize:13,fontWeight:600,color:C.red}}>-{fmtC(amt)}</span>
                    </div>
                  ))
                  :<div style={{fontSize:12,color:C.textLight,padding:"7px 0"}}>No personal expenses logged</div>
                }
                {totalFuelExp>0&&(
                  <div style={{marginTop:8,padding:"8px 12px",background:"#FFF8E1",borderRadius:8,border:"1px solid #FFB300"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#243B6E",marginBottom:2}}>⛽ Fuel (Business Expense — not deducted from your pay)</div>
                    <div style={{fontSize:13,color:"#BF360C",fontWeight:700}}>{fmtC(totalFuelExp)} — shown in Tax Export only</div>
                  </div>
                )}
              </div>
              {/* Total Pay — expenses shown separately, never deducted */}
              <div style={{background:"#FFF3EB",borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.blue}}>TOTAL PAY</span>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:C.blue}}>+{fmtC(drp+dwp)}</span>
              </div>
              <div style={{fontSize:11,color:C.textLight,marginTop:8,textAlign:"center"}}>
                Expenses are tracked separately and do not affect your pay
              </div>
              {/* Business expenses submitted to owner */}
              {driverSubmittedBizExp.length > 0 && (
                <div style={{marginTop:14,borderRadius:10,border:"1.5px solid #243B6E",padding:"12px 14px",background:"#f0f4ff"}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#243B6E",marginBottom:8}}>📤 Business Expenses Submitted to Owner</div>
                  {driverSubmittedBizExp.map(e=>(
                    <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                      <span style={{color:C.textMed}}>{e.merchant||e.category||"Expense"} · {e.date}</span>
                      <span style={{fontWeight:700,color:"#243B6E"}}>{fmtC(e.amount)}</span>
                    </div>
                  ))}
                  <div style={{fontSize:11,color:"#243B6E",marginTop:8,fontWeight:600}}>
                    Total: {fmtC(driverSubmittedBizExp.reduce((s,e)=>s+Number(e.amount||0),0))} — not deducted from your pay
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── DATE-GROUPED LOAD HISTORY WITH INLINE EXPENSES ── */}
        <div className="slt-card">
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,marginBottom:14}}>📋 Daily Activity</div>
          {ml.length===0 ? (
            <div style={{textAlign:"center",padding:"28px 0",color:C.textLight}}>No loads in this period</div>
          ) : (() => {
            // Group loads by date
            const byDate = {};
            [...ml].sort((a,b)=>b.date>a.date?1:-1).forEach(l => {
              const d = l.date || "Unknown";
              if (!byDate[d]) byDate[d] = [];
              byDate[d].push(l);
            });
            // Group expenses by date
            const expByDate = {};
            filteredExp.forEach(e => {
              const d = e.date || "Unknown";
              if (!expByDate[d]) expByDate[d] = [];
              expByDate[d].push(e);
            });
            // Track which expense dates matched a load date
            const matchedExpDates = new Set();

            return Object.entries(byDate).map(([date, dayLoads]) => {
              const dayExp = expByDate[date] || [];
              if (dayExp.length > 0) matchedExpDates.add(date);
              const dayLoadPay = dayLoads.reduce((s,l) => {
                const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                const waitPay = wm/60*(isOwner?(Number(rates.companyWaitRate)||0):(Number(rates.driverWaitRate)||0));
                if (isOwner) return s + (Number(l.earnings)||0) + waitPay;
                // Solo driver: use earnings; fleet driver: use driverBasePay
                return s + (Number(l.driverBasePay)>0 ? Number(l.driverBasePay) : Number(l.earnings)||0) + waitPay;
              }, 0);
              // Expenses are tracked separately — never deducted from pay
              const dayExpTotal = isOwner
                ? dayExp.reduce((s,e) => s + Number(e.amount||0), 0)
                : dayExp.filter(e=>e.source!=="load"&&!e.ownerExpense).reduce((s,e) => s + Number(e.amount||0), 0);
              const dayFuelTotal = 0;
              // Day header shows pay and expenses separately — no subtraction for drivers
              const dayNet = isOwner ? dayLoadPay - dayExpTotal : dayLoadPay;

              return (
                <div key={date} style={{marginBottom:18}}>
                  {/* Date header */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.navy,borderRadius:"10px 10px 0 0",padding:"8px 14px"}}>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,color:"#fff"}}>
                      {new Date(date+"T12:00:00").toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"})}
                    </div>
                    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.6)"}}>{dayLoads.length} load{dayLoads.length!==1?"s":""}</span>
                      {isOwner&&dayExpTotal>0&&<span style={{fontSize:11,color:"#FF8A80"}}>-{fmtC(dayExpTotal)} exp</span>}
                      {!isOwner&&dayExpTotal>0&&<span style={{fontSize:11,color:"#FFB74D"}}>🧾 {fmtC(dayExpTotal)} exp</span>}
                      <span style={{fontWeight:800,fontSize:13,color:"#69F0AE"}}>+{fmtC(dayLoadPay)}</span>
                    </div>
                  </div>

                  {/* Loads for this day */}
                  {dayLoads.map((l,i) => {
                    const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);
                    const wP=wm/60*(Number(rates.companyWaitRate)||0);
                    const drvWait=wm/60*(Number(rates.driverWaitRate)||0);
                    // Owner sees gross earnings
              // Driver: use driverBasePay if set, otherwise use earnings (solo load)
              const pay = isOwner
                ? (Number(l.earnings)||0) + wP
                : Number(l.driverBasePay) > 0
                  ? (Number(l.driverBasePay)||0) + drvWait
                  : (Number(l.earnings)||0) + drvWait;
                    return (
                      <div key={l.id} style={{background:i%2===0?C.white:"#F8FAFC",padding:"10px 14px",borderLeft:`3px solid ${C.teal}`,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                              <span style={{fontSize:11,color:C.blue,fontWeight:800}}>#{l.tmwLoadNumber||"—"}</span>
                              <span style={{fontWeight:700,fontSize:13}}>{l.location}</span>
                              {isOwner&&l.driverFullName&&<span style={{fontSize:11,color:C.textMed,background:C.blueLight,borderRadius:8,padding:"1px 7px"}}>{l.driverFullName}</span>}
                              <span className={l.completed?"slt-badge-green":"slt-badge-orange"} style={{fontSize:10}}>{l.completed?"Done":"Active"}</span>
                            </div>
                            {wm>0&&<div style={{fontSize:11,color:C.textLight,marginTop:2}}>⏱ {fmt(wm)} wait</div>}
                          </div>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.green,marginLeft:8}}>
                            {isOwner?"+":""}{fmtC(pay)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Expenses for this day inline */}
                  {dayExp.map((e,i) => (
                    <div key={e.id||i} style={{background:"#FFF8F8",padding:"8px 14px",borderLeft:`3px solid ${C.red}`,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:C.red}}>{ECATS[e.category]||e.category||"Expense"}</div>
                        {e.description&&<div style={{fontSize:11,color:C.textLight}}>{e.description}</div>}
                      </div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,color:C.red}}>-{fmtC(e.amount||0)}</div>
                    </div>
                  ))}

                  {/* Day net summary if expenses exist */}
                  {dayExpTotal>0&&(
                    <div style={{background:dayNet>=0?"#E8F5E9":"#FFEBEE",borderRadius:"0 0 10px 10px",padding:"7px 14px",display:"flex",justifyContent:"space-between",borderLeft:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,color:C.textMed,fontWeight:600}}>Day net ({isOwner?"after driver pay + exp":"after expenses"})</span>
                      <span style={{fontSize:13,fontWeight:800,color:dayNet>=0?C.green:C.red}}>{dayNet>=0?"+":""}{fmtC(dayNet)}</span>
                    </div>
                  )}
                  {dayExpTotal===0&&<div style={{borderRadius:"0 0 10px 10px",borderLeft:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,height:4,background:C.offWhite}}/>}
                </div>
              );
            });
          })()}
        </div>

        {/* ── UNMATCHED EXPENSES (no load that day) ── */}
        {(() => {
          const loadDates = new Set(ml.map(l => l.date));
          const unmatchedExp = filteredExp.filter(e => !loadDates.has(e.date));
          if (unmatchedExp.length === 0) return null;
          const unmatchedTotal = unmatchedExp.reduce((s,e) => s + Number(e.amount||0), 0);
          return (
            <div className="slt-card" style={{marginTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16}}>🧾 Other Expenses</div>
                <div style={{fontSize:12,color:C.textLight}}>No load logged on these days</div>
              </div>
              {unmatchedExp.sort((a,b)=>b.date>a.date?1:-1).map((e,i)=>(
                <div key={e.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{ECATS[e.category]||e.category||"—"}</div>
                    <div style={{fontSize:11,color:C.textLight}}>{e.date||"—"}{e.description?` · ${e.description}`:""}</div>
                  </div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,color:C.red}}>-{fmtC(e.amount||0)}</div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:10,borderTop:`2px solid ${C.border}`}}>
                <span style={{fontWeight:800,fontSize:14}}>Total Other Expenses</span>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:16,color:C.red}}>-{fmtC(unmatchedTotal)}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── FUEL FINDER ─────────────────────────────────────────────────────────────
function FuelFinderTab({ goBack }) {
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
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero"><div className="slt-hero-title">Fuel Finder</div><div className="slt-hero-sub">Diesel truck stops near your location</div></div>
      <div className="slt-container">
        {!searched&&!loading&&<div className="slt-card" style={{textAlign:"center",padding:"52px 24px"}}><div style={{fontSize:48,marginBottom:14}}>⛽</div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,marginBottom:8}}>Find Diesel Near You</div><div style={{color:C.textMed,fontSize:14,marginBottom:24}}>Uses GPS to locate nearby stations</div><button className="slt-btn-primary" style={{width:"auto",padding:"12px 36px"}} onClick={find}>📍 Find Diesel</button></div>}
        {loading&&<div className="slt-card" style={{textAlign:"center",padding:"40px",color:C.blue,fontWeight:700}}>🔍 Searching nearby…</div>}
        {error&&<div style={{background:"#FFEBEE",border:`1px solid #FFCDD2`,borderRadius:12,padding:18,marginBottom:14}}><div style={{color:C.red}}>{error}</div><button className="slt-btn-primary" style={{width:"auto",marginTop:10,padding:"9px 20px"}} onClick={find}>Try Again</button></div>}
        {stations.length>0&&<div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:700}}>{stations.length} stations found</span><button className="slt-btn-secondary" style={{padding:"7px 14px"}} onClick={find}>🔄 Refresh</button></div>}
        {stations.map((s,i)=>(
          <div key={s.id} className="slt-card" style={{padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,marginBottom:4}}>{i+1}. {s.name}</div>{s.diesel&&<span className="slt-badge-green">✓ Diesel</span>}</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color:C.orange}}>{s.dist} km</div>
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

// ─── RESTAURANT FINDER ───────────────────────────────────────────────────────
function RestaurantFinderTab() {
  const [loading,setLoading]=useState(false);
  const [places,setPlaces]=useState([]);
  const [error,setError]=useState("");
  const [searched,setSearched]=useState(false);
  const [filter,setFilter]=useState("all");

  const FILTERS=[
    {id:"all",      label:"All Food",   icon:"🍽", query:`"amenity"="restaurant";"amenity"="fast_food";"amenity"="cafe";"amenity"="pub";"amenity"="food_court"`},
    {id:"restaurant",label:"Sit-Down",  icon:"🍴", query:`"amenity"="restaurant"`},
    {id:"fast_food", label:"Fast Food", icon:"🍔", query:`"amenity"="fast_food"`},
    {id:"cafe",      label:"Café",      icon:"☕", query:`"amenity"="cafe"`},
    {id:"pub",       label:"Pub/Bar",   icon:"🍺", query:`"amenity"="pub";"amenity"="bar"`},
  ];

  const calcDist=(lat1,lng1,lat2,lng2)=>Math.round(Math.sqrt(Math.pow((lat2-lat1)*111,2)+Math.pow((lng2-lng1)*111*Math.cos(lat1*Math.PI/180),2))*10)/10;

  const find=(f=filter)=>{
    setLoading(true);setError("");setPlaces([]);setSearched(false);
    if(!navigator.geolocation){setError("Geolocation not supported.");setLoading(false);return;}
    navigator.geolocation.getCurrentPosition(async(pos)=>{
      const{latitude:lat,longitude:lng}=pos.coords;
      try{
        const chosen=FILTERS.find(x=>x.id===f)||FILTERS[0];
        const nodes=chosen.query.split(";").map(q=>`node[${q}](around:5000,${lat},${lng});`).join("");
        const q=`[out:json][timeout:25];(${nodes});out body 30;`;
        const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
        const d=await r.json();
        const s=(d.elements||[]).filter(e=>e.lat&&e.lon&&(e.tags?.name)).map(e=>({
          id:e.id,
          name:e.tags.name,
          type:e.tags.amenity||"food",
          cuisine:e.tags.cuisine||"",
          phone:e.tags.phone||e.tags["contact:phone"]||"",
          hours:e.tags.opening_hours||"",
          website:e.tags.website||e.tags["contact:website"]||"",
          lat:e.lat,lng:e.lon,
          dist:calcDist(lat,lng,e.lat,e.lon),
        })).sort((a,b)=>a.dist-b.dist).slice(0,20);
        setPlaces(s);setSearched(true);
      }catch{setError("Could not load restaurants. Try again.");}
      setLoading(false);
    },()=>{setError("Location unavailable. Please enable GPS.");setLoading(false);});
  };

  const typeLabel={restaurant:"🍴 Restaurant",fast_food:"🍔 Fast Food",cafe:"☕ Café",pub:"🍺 Pub",bar:"🍺 Bar",food_court:"🍽 Food Court"};

  return(
    <div className="slt-page">
      <div className="slt-hero" style={{background:`linear-gradient(135deg,#243B6E,#243B6E,#FF9100)`}}>
        <div className="slt-hero-title">🍽 Food Near Me</div>
        <div className="slt-hero-sub">Restaurants, fast food & cafés near your location</div>
      </div>
      <div className="slt-container">

        {/* Filter chips */}
        <div className="slt-card" style={{padding:"14px 16px"}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            {FILTERS.map(f=>(
              <button key={f.id} onClick={()=>setFilter(f.id)}
                className="slt-btn-secondary"
                style={{background:filter===f.id?"#243B6E":"#fff",color:filter===f.id?"#fff":C.textMed,borderColor:filter===f.id?"#243B6E":C.border,padding:"8px 14px",fontSize:13,fontWeight:filter===f.id?800:400}}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
          <button className="slt-btn-primary" style={{width:"100%",background:"linear-gradient(135deg,#243B6E,#243B6E)",padding:"13px"}}
            onClick={()=>find(filter)}>
            📍 Find Food Near Me
          </button>
        </div>

        {loading&&<div className="slt-card" style={{textAlign:"center",padding:"40px",color:"#243B6E",fontWeight:700}}>🔍 Finding restaurants nearby…</div>}
        {error&&<div style={{background:"#FFEBEE",border:`1px solid #FFCDD2`,borderRadius:12,padding:18,marginBottom:14}}>
          <div style={{color:C.red,marginBottom:8}}>{error}</div>
          <button className="slt-btn-primary" style={{width:"auto",padding:"9px 20px"}} onClick={()=>find(filter)}>Try Again</button>
        </div>}

        {!searched&&!loading&&!error&&(
          <div className="slt-card" style={{textAlign:"center",padding:"52px 24px"}}>
            <div style={{fontSize:56,marginBottom:14}}>🍽</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18,marginBottom:8}}>Find Food Nearby</div>
            <div style={{color:C.textMed,fontSize:14}}>Uses GPS to find restaurants within 5 km</div>
          </div>
        )}

        {searched&&places.length===0&&!loading&&(
          <div className="slt-card" style={{textAlign:"center",padding:"40px"}}>
            <div style={{fontSize:40,marginBottom:10}}>😕</div>
            <div style={{color:C.textMed,fontWeight:600}}>No results found nearby</div>
            <div style={{fontSize:13,color:C.textLight,marginTop:4}}>Try a different filter or search in a larger area</div>
          </div>
        )}

        {places.length>0&&(
          <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,fontSize:14}}>{places.length} places found</span>
            <button className="slt-btn-secondary" style={{padding:"7px 14px"}} onClick={()=>find(filter)}>🔄 Refresh</button>
          </div>
        )}

        {places.map((p,i)=>(
          <div key={p.id} className="slt-card" style={{padding:"16px 18px",borderLeft:`4px solid #243B6E`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,marginBottom:3}}>{i+1}. {p.name}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,background:"#FFF3E0",color:"#243B6E",borderRadius:8,padding:"2px 8px",fontWeight:700}}>{typeLabel[p.type]||"🍽 Food"}</span>
                  {p.cuisine&&<span style={{fontSize:11,color:C.textLight,textTransform:"capitalize"}}>{p.cuisine.replace(/_/g," ")}</span>}
                  {p.hours&&<span style={{fontSize:11,color:C.green}}>🕐 {p.hours.length>25?p.hours.slice(0,25)+"…":p.hours}</span>}
                </div>
                {p.phone&&<div style={{fontSize:12,color:C.textMed,marginTop:4}}>📞 <a href={`tel:${p.phone}`} style={{color:C.blue}}>{p.phone}</a></div>}
              </div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color:"#243B6E",marginLeft:10,flexShrink:0}}>{p.dist} km</div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`} target="_blank" rel="noreferrer"
                className="slt-btn-primary" style={{flex:1,textAlign:"center",textDecoration:"none",padding:"9px 0",borderRadius:9,fontSize:13,background:"#243B6E",border:"none"}}>
                🗺 Directions
              </a>
              {p.website
                ? <a href={p.website.startsWith("http")?p.website:`https://${p.website}`} target="_blank" rel="noreferrer"
                    className="slt-btn-secondary" style={{flex:1,textAlign:"center",textDecoration:"none",padding:"9px 0",borderRadius:9,fontSize:13}}>
                    🌐 Website
                  </a>
                : <a href={`https://www.google.com/search?q=${encodeURIComponent(p.name+" restaurant")}`} target="_blank" rel="noreferrer"
                    className="slt-btn-secondary" style={{flex:1,textAlign:"center",textDecoration:"none",padding:"9px 0",borderRadius:9,fontSize:13}}>
                    🔍 Search
                  </a>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


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
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:800,marginBottom:8}}>{fmtC(profit)}</div>
          <div style={{fontSize:16,fontWeight:700}}>{profit>=500?"✅ Take It!":profit>=0?"⚠️ Marginal":"❌ Leave It!"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16}}>{[["Gross",fmtC(g)],["Costs",fmtC(costs)],["Margin",margin+"%"]].map(([l,v])=><div key={l} style={{background:"rgba(255,255,255,0.15)",borderRadius:9,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:10,opacity:0.8,marginBottom:2}}>{l}</div><div style={{fontSize:16,fontWeight:800}}>{v}</div></div>)}</div>
        </div>}
        <div className="slt-card">
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.green,marginBottom:14,fontSize:16}}>Revenue</div>
          <div style={{marginBottom:14}}><label className="slt-label">Gross Revenue ($)</label><input name="gross" type="number" placeholder="2500" value={form.gross} onChange={hc} className="slt-input" style={{fontSize:18}}/></div>
          <hr className="slt-divider"/>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.red,marginBottom:14,fontSize:16}}>Costs</div>
          {[["fuel","⛽ Fuel"],["driverPay","👤 Driver Pay"],["maintenance","🔧 Maintenance"],["tolls","🛣 Tolls"],["other","📦 Other"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input"/></div>)}
          <button className="slt-btn-secondary" style={{width:"100%",marginTop:4}} onClick={reset}>Reset</button>
        </div>
      </div>
    </div>);
  }
  const gp=(Number(form.routePay)||0)+(Number(form.waitPay)||0);const te=(Number(form.meals)||0)+(Number(form.lodging)||0)+(Number(form.tolls)||0)+(Number(form.other)||0);const nh=gp-te;
  return(<div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">Pay Calculator</div><div className="slt-hero-sub">Take-home after trip expenses</div></div>
    <div className="slt-container-sm">
      {gp>0&&<div style={{background:nh>=300?`linear-gradient(135deg,${C.green},#1B5E20)`:`linear-gradient(135deg,${C.red},#B71C1C)`,borderRadius:16,padding:"24px 28px",marginBottom:20,color:"#fff"}}><div style={{fontSize:13,opacity:0.85}}>Your Take-Home</div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:800}}>{fmtC(nh)}</div></div>}
      <div className="slt-card">
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.blue,marginBottom:14,fontSize:16}}>Your Pay</div>
        {[["routePay","Route Pay"],["waitPay","Wait Pay"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input" style={{fontSize:18}}/></div>)}
        <hr className="slt-divider"/>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.red,marginBottom:14,fontSize:16}}>Expenses</div>
        {[["meals","🍽 Meals"],["lodging","🏨 Lodging"],["tolls","🛣 Tolls"],["other","📦 Other"]].map(([n,l])=><div key={n} style={{marginBottom:12}}><label className="slt-label">{l} ($)</label><input name={n} type="number" value={form[n]} onChange={hc} className="slt-input"/></div>)}
        <button className="slt-btn-secondary" style={{width:"100%",marginTop:4}} onClick={reset}>Reset</button>
      </div>
    </div>
  </div>);
}

// ─── MAINTENANCE TAB ──────────────────────────────────────────────────────────
function MaintenanceTab({ session, trucks, goBack }) {
  const key=maintenanceKey(session.ownerUid||session.uid);
  const [records,setRecords]=useState([]);
  useEffect(()=>{
    const ownerUid = session.ownerUid||session.uid;
    sbGetMaintenance(ownerUid).then(data=>{
      if(data.length>0) setRecords(data);
      else setRecords(getStored(key));
    }).catch(()=>setRecords(getStored(key)));
  },[session.uid]);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({truckId:"",type:"oil_change",date:todayStr(),odometer:"",cost:"",notes:"",nextDueKm:""});
  const hc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const TYPES=[["oil_change","🛢","Oil Change",C.orange],["tires","🔄","Tires",C.blue],["brakes","🛑","Brakes",C.red],["repair","🔧","Repair",C.purple],["service","⚙","Service",C.green],["inspection","📋","Inspection",C.textMed]];
  const ti=t=>TYPES.find(([id])=>id===t)||["","🔧","Service",C.textMed];
  const saveR=()=>{ if(!form.type)return; const record={...form,id:Date.now().toString()}; const u=[record,...records]; setRecords(u); localStorage.setItem(key,JSON.stringify(u)); sbSaveMaintenance(record, session.ownerUid||session.uid).catch(console.error); setShowAdd(false); };
  return(
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero"><div className="slt-hero-title">Maintenance</div><div className="slt-hero-sub">Oil changes, tires, brakes & service records</div></div>
      <div className="slt-container">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
          {TYPES.map(([id,icon,label,color])=><div key={id} className="slt-card-sm" style={{textAlign:"center",borderTop:`3px solid ${color}`,padding:"12px 8px"}}><div style={{fontSize:22}}>{icon}</div><div style={{fontSize:11,color:C.textMed,fontWeight:700,marginTop:4}}>{label}</div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:800,color,marginTop:2}}>{records.filter(r=>r.type===id).length}</div></div>)}
        </div>
        <button className="slt-btn-primary" style={{marginBottom:16}} onClick={()=>setShowAdd(!showAdd)}>{showAdd?"Cancel":"+ Add Record"}</button>
        {showAdd&&<div className="slt-card" style={{border:`2px solid ${C.blue}`}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
            {TYPES.map(([id,icon,label,color])=><button key={id} onClick={()=>setForm(f=>({...f,type:id}))} style={{padding:"10px 6px",borderRadius:9,border:`2px solid ${form.type===id?color:C.border}`,background:form.type===id?color+"18":C.white,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}><div style={{fontSize:20}}>{icon}</div><div style={{fontSize:11,fontWeight:700,color:form.type===id?color:C.textMed,marginTop:3}}>{label}</div></button>)}
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
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:20}}>{icon}</span><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15}}>{label}</span>{kl!==null&&kl<=2000&&<span className="slt-badge-red">⚠ Due Soon</span>}</div>
                {truck&&<div style={{fontSize:13,color:C.orange,marginBottom:2}}>🚛 Truck {truck.truckNumber}</div>}
                <div style={{fontSize:12.5,color:C.textLight}}>{r.date}{r.odometer?` · ${Number(r.odometer).toLocaleString()} km`:""}</div>
                {r.notes&&<div style={{fontSize:13,color:C.textMed,marginTop:4,fontStyle:"italic"}}>{r.notes}</div>}
                {kl!==null&&<div style={{fontSize:12,color:kl<=2000?C.red:C.green,marginTop:4}}>{kl<=2000?`⚠ Due in ${kl.toLocaleString()} km`:`✓ Next in ${kl.toLocaleString()} km`}</div>}
              </div>
              <div style={{textAlign:"right"}}>
                {r.cost&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:800,color:C.red}}>{fmtC(r.cost)}</div>}
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
  useEffect(()=>{ document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=""; }; },[]);
  const [lr,setLr]=useState({...DEFAULT_RATES,...rates});
  const [lRoutes,setLRoutes]=useState([...customRoutes]);
  const [lTrucks,setLTrucks]=useState([...trucks]);
  const [sec,setSec]=useState("rates");
  const [nr,setNr]=useState({from:"",to:"",billingMethod:"per_load",ratePerLoad:"",rateCubic:"",rateHour:"",driverPay:""});
  const [nt,setNt]=useState({truckNumber:"",trailerNumber:""});
  const [expandedRoute,setExpandedRoute]=useState(null);
  const [editingRoute,setEditingRoute]=useState(null);
  // Safety check — drivers in a fleet should never see this modal
  const isFleetDriver = session.role === "driver" && session.inFleet;
  if (isFleetDriver) return null;
  // All hooks are above this line — safe to return early now
  const [editingTruck,setEditingTruck]=useState(null);

  // Lock background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, []);

  // All drivers under this owner
  const ownerUid=session.ownerUid||session.uid;
  const allDrivers=Object.values(getUsers()).filter(u=>u.role==="driver"&&u.ownerUid===ownerUid);

  const save=async()=>{
    const ownerUid = session.ownerUid||session.uid;
    setRates(lr); setCustomRoutes(lRoutes); setTrucks(lTrucks);
    localStorage.setItem(ratesKey(ownerUid),JSON.stringify(lr));
    localStorage.setItem(routesKey(ownerUid),JSON.stringify(lRoutes));
    localStorage.setItem(trucksKey(ownerUid),JSON.stringify(lTrucks));
    // Save to Supabase so all devices see updates
    sbSaveSettings(ownerUid, lr, lRoutes).catch(console.error);
    sbSaveTrucks(lTrucks, ownerUid).catch(console.error);
    onClose();
  };

  const BILLING=[{id:"per_load",label:"Per Load",icon:"📦",desc:"Flat rate per trip"},{id:"per_cubic",label:"Per Cubic",icon:"📐",desc:"$/yd³ × quantity"},{id:"per_hour",label:"Per Hour",icon:"⏱",desc:"$/hr × hours worked"},{id:"per_pct",label:"% of Earnings",icon:"💯",desc:"Company % & driver % of load earnings"},{id:"per_km",label:"Per KM/Mile",icon:"🛣",desc:"Rate × distance driven"}];

  const addRoute=()=>{
    if(!nr.from.trim()||!nr.to.trim())return;
    setLRoutes(r=>[...r,{id:Date.now().toString(),from:nr.from.trim(),to:nr.to.trim(),billingMethod:nr.billingMethod,ratePerLoad:Number(nr.ratePerLoad)||0,rateCubic:Number(nr.rateCubic)||0,rateHour:Number(nr.rateHour)||0,driverPay:Number(nr.driverPay)||0,driverPct:Number(nr.driverPct)||0,cubicDriverMode:nr.cubicDriverMode||"flat",driverOverrides:{},rate:nr.billingMethod==="per_load"?Number(nr.ratePerLoad)||0:nr.billingMethod==="per_cubic"?Number(nr.rateCubic)||0:nr.billingMethod==="per_pct"?Number(nr.ratePerLoad)||0:Number(nr.rateHour)||0,pay:nr.billingMethod==="per_pct"?(Number(nr.ratePerLoad)||0)*(Number(nr.driverPct)||0)/100:(nr.billingMethod==="per_cubic"&&(nr.cubicDriverMode||"flat")==="pct")?0:Number(nr.driverPay)||0}]);
    setNr({from:"",to:"",billingMethod:"per_load",ratePerLoad:"",rateCubic:"",rateHour:"",driverPay:"",driverPct:"",cubicDriverMode:"flat"});
  };
  const addTruck=()=>{ if(!nt.truckNumber.trim())return; const ex=lTrucks.map(t=>parseInt(t.tmwNumber)||0); const tmw=(Math.max(1000,...ex)+1).toString(); setLTrucks(t=>[...t,{...nt,tmwNumber:tmw,id:Date.now().toString()}]); setNt({truckNumber:"",trailerNumber:""}); };

  const rateDisplay=(r)=>{ if((r.billingMethod||"per_load")==="per_cubic"){const cubicRate=`$${Number(r.rateCubic||r.rate||0).toFixed(2)}/yd³`;return(r.cubicDriverMode||"flat")==="pct"?`${cubicRate} · ${r.driverPct||0}% driver`:cubicRate;} if((r.billingMethod||"per_load")==="per_hour")return`$${Number(r.rateHour||r.rate||0).toFixed(2)}/hr`; if((r.billingMethod||"per_load")==="per_pct")return`$${Number(r.ratePerLoad||r.rate||0).toFixed(2)} · ${r.driverPct||0}% driver`; return`$${Number(r.ratePerLoad||r.rate||0).toFixed(2)}/load`; };

  const setDriverOverride=(routeIdx,driverUid,val)=>{
    setLRoutes(rs=>rs.map((r,i)=>i===routeIdx?{...r,driverOverrides:{...(r.driverOverrides||{}), [driverUid]:val}}:r));
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.white,borderRadius:18,width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 28px 80px rgba(0,0,0,0.25)"}}>
        <div style={{padding:"20px 24px 0",position:"sticky",top:0,background:C.white,borderBottom:`1px solid ${C.border}`,paddingBottom:14,zIndex:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:18}}>⚙ Settings</div>
            <button className="slt-btn-ghost" style={{padding:"6px 12px"}} onClick={onClose}>✕</button>
          </div>
          <div style={{display:"flex",gap:8}}>
            {[["rates","Rates"],["routes","Routes"],["trucks","Trucks/Trailers"]].map(([v,l])=>(
              <button key={v} onClick={()=>setSec(v)} className="slt-btn-secondary" style={{background:sec===v?C.blue:C.white,color:sec===v?"#fff":C.textMed,borderColor:sec===v?C.blue:C.border,padding:"8px 14px",fontSize:13}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{padding:"20px 24px"}}>
          {sec==="rates"&&(<div>
            {[["companyWaitRate","Company Wait Rate ($/hr)"],["driverWaitRate","Driver Wait Rate ($/hr)"]].map(([k,l])=>(
              <div key={k} style={{marginBottom:14}}><label className="slt-label">{l}</label><input type="number" value={lr[k]} onChange={e=>setLr(r=>({...r,[k]:e.target.value}))} className="slt-input"/></div>
            ))}


            <div style={{borderTop:`1px solid ${C.border}`,marginTop:20,paddingTop:20}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:C.blue,marginBottom:4}}>💰 Pay Schedule</div>
              <div style={{fontSize:12,color:C.textLight,marginBottom:16}}>Set your pay period and when drivers get paid. You can change these anytime.</div>

              {/* Period Start */}
              <div style={{marginBottom:14}}>
                <label className="slt-label">📅 Period Start</label>
                <input type="date" value={lr.periodStart||""} onChange={e=>setLr(r=>({...r,periodStart:e.target.value}))} className="slt-input"/>
                <div style={{fontSize:11,color:C.textLight,marginTop:4}}>First day loads count toward this pay cycle</div>
              </div>

              {/* Period End */}
              <div style={{marginBottom:14}}>
                <label className="slt-label">🏁 Period End</label>
                <input type="date" value={lr.periodEnd||""} onChange={e=>setLr(r=>({...r,periodEnd:e.target.value}))} className="slt-input"/>
                {lr.periodStart&&lr.periodEnd&&(
                  <div style={{fontSize:11,color:C.blue,marginTop:4,fontWeight:700}}>
                    📆 {Math.max(0,Math.round((new Date(lr.periodEnd+"T12:00:00")-new Date(lr.periodStart+"T12:00:00"))/(1000*60*60*24)))} day period · {new Date(lr.periodStart+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric"})} → {new Date(lr.periodEnd+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric"})}
                  </div>
                )}
              </div>

              {/* Pay Date */}
              <div style={{marginBottom:16}}>
                <label className="slt-label">💸 Pay Date</label>
                <input type="date" value={lr.payDate||""} onChange={e=>setLr(r=>({...r,payDate:e.target.value}))} className="slt-input"/>
                {lr.payDate&&(
                  <div style={{fontSize:11,color:C.green,marginTop:4,fontWeight:700}}>
                    💰 Drivers get paid on {new Date(lr.payDate+"T12:00:00").toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"})}
                  </div>
                )}
              </div>

              {/* Summary + Advance */}
              {lr.periodStart&&lr.periodEnd&&lr.payDate&&(()=>{
                const start=new Date(lr.periodStart+"T12:00:00");
                const end=new Date(lr.periodEnd+"T12:00:00");
                const pay=new Date(lr.payDate+"T12:00:00");
                const cycleLen=Math.round((end-start)/(1000*60*60*24))+1;
                const nextStart=new Date(end); nextStart.setDate(end.getDate()+1);
                const nextEnd=new Date(nextStart); nextEnd.setDate(nextStart.getDate()+cycleLen-1);
                const nextPay=new Date(pay); nextPay.setDate(pay.getDate()+cycleLen);
                const fmt=d=>d.toISOString().split("T")[0];
                const daysUntilPay=Math.max(0,Math.round((pay-new Date())/(1000*60*60*24)));
                return(
                  <div style={{background:"linear-gradient(135deg,#1a2744,#243B6E)",borderRadius:12,padding:16,marginBottom:4}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div style={{background:"rgba(255,255,255,0.08)",borderRadius:8,padding:10}}>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:3,textTransform:"uppercase",letterSpacing:0.8}}>Current Period</div>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:13,color:"#fff"}}>
                          {start.toLocaleDateString("en-CA",{month:"short",day:"numeric"})} → {end.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}
                        </div>
                      </div>
                      <div style={{background:"rgba(255,215,0,0.15)",borderRadius:8,padding:10,border:"1px solid rgba(255,215,0,0.3)"}}>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:3,textTransform:"uppercase",letterSpacing:0.8}}>Pay Date</div>
                        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:15,color:"#FFD700"}}>
                          {pay.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}
                        </div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:1}}>in {daysUntilPay} day{daysUntilPay!==1?"s":""}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:8}}>
                      Next cycle: <strong style={{color:"rgba(255,255,255,0.8)"}}>{nextStart.toLocaleDateString("en-CA",{month:"short",day:"numeric"})} → {nextEnd.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</strong> · Pay: <strong style={{color:"#FFD700"}}>{nextPay.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</strong>
                    </div>
                    <button onClick={()=>setLr(r=>({...r,periodStart:fmt(nextStart),periodEnd:fmt(nextEnd),payDate:fmt(nextPay)}))}
                      style={{width:"100%",padding:"10px",borderRadius:10,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
                      ➡️ Advance to Next Cycle
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>)}

          {sec==="routes"&&(<div>
            {lRoutes.map((r,i)=>(
              <div key={i} style={{marginBottom:10}}>
                <div className="slt-card-sm" style={{borderLeft:`3px solid ${C.teal}`}}>
                  {editingRoute===i ? (
                    <div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>✏️ Edit Route</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        <div><label className="slt-label">From</label><input value={r.from} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,from:e.target.value}:x))} className="slt-input"/></div>
                        <div><label className="slt-label">To</label><input value={r.to} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,to:e.target.value}:x))} className="slt-input"/></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                        {(r.billingMethod||"per_load")==="per_load"&&<div><label className="slt-label">Rate/Load ($)</label><input type="number" step="0.01" value={r.ratePerLoad||r.rate||""} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,ratePerLoad:e.target.value,rate:Number(e.target.value)}:x))} className="slt-input"/></div>}
                        {(r.billingMethod||"per_load")==="per_cubic"&&<div><label className="slt-label">Rate/yd³ ($)</label><input type="number" step="0.01" value={r.rateCubic||""} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,rateCubic:e.target.value,rate:Number(e.target.value)}:x))} className="slt-input"/></div>}
                        {(r.billingMethod||"per_load")==="per_hour"&&<div><label className="slt-label">Rate/hr ($)</label><input type="number" step="0.01" value={r.rateHour||""} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,rateHour:e.target.value,rate:Number(e.target.value)}:x))} className="slt-input"/></div>}
                        <div><label className="slt-label">Driver Pay ($)</label><input type="number" step="0.01" value={r.driverPay||r.pay||""} onChange={e=>setLRoutes(rs=>rs.map((x,j)=>j===i?{...x,driverPay:e.target.value,pay:Number(e.target.value)}:x))} className="slt-input"/></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button className="slt-btn-primary" style={{flex:2}} onClick={()=>setEditingRoute(null)}>✓ Done</button>
                        <button className="slt-btn-danger" style={{flex:1}} onClick={()=>{setLRoutes(rs=>rs.filter((_,j)=>j!==i));setEditingRoute(null);}}>Delete</button>
                      </div>
                    </div>
                  ) : (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700}}>{r.from} → {r.to}</div>
                      <div style={{fontSize:12,color:C.textMed,marginTop:2}}>
                        <span style={{background:C.blueLight,color:C.blue,borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700,marginRight:6}}>{(r.billingMethod||"per_load").replace("_"," ")}</span>
                        Rate: {rateDisplay(r)} · Driver: {fmtC(r.driverPay||r.pay||0)}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button className="slt-btn-secondary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setEditingRoute(i)}>✏️ Edit</button>
                      <button className="slt-btn-danger" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setLRoutes(rs=>rs.filter((_,j)=>j!==i))}>Remove</button>
                    </div>
                  </div>)}

                  {/* Per-driver pay overrides */}
                  {expandedRoute===i&&allDrivers.length>0&&(
                    <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                      <div style={{fontSize:11,fontWeight:800,color:C.textMed,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
                        Driver Pay Overrides
                      </div>
                      <div style={{fontSize:11,color:C.textLight,marginBottom:10}}>
                        {(r.billingMethod||"per_load")==="per_hour"
                          ?`Set each driver's hourly rate ($/hr). Default: $${Number(r.driverPay||r.pay||0).toFixed(2)}/hr`
                          :`Leave blank to use default (${fmtC(r.driverPay||r.pay||0)})`
                        }
                      </div>
                      {allDrivers.map(d=>(
                        <div key={d.uid} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:C.blue,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>
                            {(d.fullName||d.name||"?")[0].toUpperCase()}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600}}>{d.fullName||d.name}</div>
                            {(r.billingMethod||"per_load")==="per_hour"&&<div style={{fontSize:10,color:C.textLight}}>$/hr rate</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{position:"relative"}}>
                              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.textMed,fontSize:13}}>$</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={(r.driverOverrides||{})[d.uid]||""}
                                onChange={e=>setDriverOverride(i,d.uid,e.target.value)}
                                className="slt-input"
                                placeholder={(r.driverPay||r.pay||0).toString()}
                                style={{width:100,paddingLeft:22,fontSize:13}}
                              />
                            </div>
                            {(r.billingMethod||"per_load")==="per_hour"&&<span style={{fontSize:12,color:C.textMed}}>/hr</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add New Route */}
            <div className="slt-card-sm" style={{border:`2px dashed ${C.border}`,marginTop:10}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:C.blue,marginBottom:12}}>+ Add Route</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="slt-label">From</label><input value={nr.from} onChange={e=>setNr(r=>({...r,from:e.target.value}))} className="slt-input" placeholder="e.g. CNRL"/></div>
                <div><label className="slt-label">To</label><input value={nr.to} onChange={e=>setNr(r=>({...r,to:e.target.value}))} className="slt-input" placeholder="e.g. Heartland"/></div>
              </div>
              <div style={{marginBottom:10}}>
                <label className="slt-label">Billing Method</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[["per_load","📦 Per Load"],["per_cubic","📐 Per Cubic Yard"],["per_hour","⏱ Per Hour"],["per_pct","💯 % of Earnings"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setNr(r=>({...r,billingMethod:v}))}
                      style={{padding:"8px 10px",borderRadius:9,border:`2px solid ${(nr.billingMethod||"per_load")===v?C.blue:C.border}`,background:(nr.billingMethod||"per_load")===v?`${C.blue}10`:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,color:(nr.billingMethod||"per_load")===v?C.blue:C.textMed,textAlign:"left"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                {(nr.billingMethod||"per_load")==="per_load"&&<><div><label className="slt-label">Rate/Load ($)</label><input type="number" step="0.01" value={nr.ratePerLoad} onChange={e=>setNr(r=>({...r,ratePerLoad:e.target.value}))} className="slt-input" placeholder="e.g. 1900"/></div><div><label className="slt-label">Driver Pay ($)</label><input type="number" step="0.01" value={nr.driverPay} onChange={e=>setNr(r=>({...r,driverPay:e.target.value}))} className="slt-input" placeholder="e.g. 420"/></div></>}
                {nr.billingMethod==="per_cubic"&&<><div><label className="slt-label">Rate/yd³ ($)</label><input type="number" step="0.01" value={nr.rateCubic} onChange={e=>setNr(r=>({...r,rateCubic:e.target.value}))} className="slt-input" placeholder="e.g. 40"/></div><div><label className="slt-label">Driver Pay ($)</label><input type="number" step="0.01" value={nr.driverPay} onChange={e=>setNr(r=>({...r,driverPay:e.target.value}))} className="slt-input" placeholder="e.g. 450"/></div></>}
                {nr.billingMethod==="per_hour"&&<><div><label className="slt-label">Rate/hr ($)</label><input type="number" step="0.01" value={nr.rateHour} onChange={e=>setNr(r=>({...r,rateHour:e.target.value}))} className="slt-input" placeholder="e.g. 120"/></div><div><label className="slt-label">Driver Pay/hr ($)</label><input type="number" step="0.01" value={nr.driverPay} onChange={e=>setNr(r=>({...r,driverPay:e.target.value}))} className="slt-input" placeholder="e.g. 50"/></div></>}
                {nr.billingMethod==="per_pct"&&<><div><label className="slt-label">Rate/Load ($)</label><input type="number" step="0.01" value={nr.ratePerLoad} onChange={e=>setNr(r=>({...r,ratePerLoad:e.target.value}))} className="slt-input" placeholder="e.g. 1900"/></div><div><label className="slt-label">Driver % of Earnings</label><input type="number" step="1" value={nr.driverPct} onChange={e=>setNr(r=>({...r,driverPct:e.target.value}))} className="slt-input" placeholder="e.g. 25"/></div></>}
              </div>
              <button className="slt-btn-primary" style={{width:"100%"}} onClick={()=>{
                if(!nr.from.trim()||!nr.to.trim()) return;
                setLRoutes(r=>[...r,{id:Date.now().toString(),from:nr.from.trim(),to:nr.to.trim(),billingMethod:nr.billingMethod||"per_load",ratePerLoad:Number(nr.ratePerLoad)||0,rate:nr.billingMethod==="per_load"||nr.billingMethod==="per_pct"?Number(nr.ratePerLoad)||0:nr.billingMethod==="per_cubic"?Number(nr.rateCubic)||0:Number(nr.rateHour)||0,rateCubic:Number(nr.rateCubic)||0,rateHour:Number(nr.rateHour)||0,driverPay:Number(nr.driverPay)||0,pay:Number(nr.driverPay)||0,driverPct:Number(nr.driverPct)||0,cubicDriverMode:"flat",driverOverrides:{}}]);
                setNr({from:"",to:"",billingMethod:"per_load",ratePerLoad:"",rateCubic:"",rateHour:"",driverPay:"",driverPct:"",cubicDriverMode:"flat"});
              }}>+ Add Route</button>
            </div>
          </div>)}

          {sec==="trucks"&&(<div>
            {lTrucks.map(t=>(
              <div key={t.id} className="slt-card-sm" style={{marginBottom:10}}>
                {editingTruck===t.id ? (
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.blue,fontSize:14,marginBottom:12}}>✏️ Edit Truck</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      <div><label className="slt-label">Truck # *</label><input value={t.truckNumber} onChange={e=>setLTrucks(ts=>ts.map(x=>x.id===t.id?{...x,truckNumber:e.target.value}:x))} className="slt-input"/></div>
                      <div><label className="slt-label">Trailer #</label><input value={t.trailerNumber||""} onChange={e=>setLTrucks(ts=>ts.map(x=>x.id===t.id?{...x,trailerNumber:e.target.value}:x))} className="slt-input" placeholder="Optional"/></div>
                    </div>
                    <div style={{marginBottom:10}}><label className="slt-label">License Plate</label><input value={t.licensePlate||""} onChange={e=>setLTrucks(ts=>ts.map(x=>x.id===t.id?{...x,licensePlate:e.target.value}:x))} className="slt-input" placeholder="Optional"/></div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="slt-btn-primary" style={{flex:2}} onClick={()=>setEditingTruck(null)}>✓ Done</button>
                      <button className="slt-btn-danger" style={{flex:1}} onClick={()=>{setLTrucks(ts=>ts.filter(x=>x.id!==t.id));setEditingTruck(null);}}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700}}>Truck {t.truckNumber}</div>
                      <div style={{fontSize:12,color:C.textMed}}>{t.trailerNumber?`Trailer ${t.trailerNumber}`:""}{t.licensePlate?` · ${t.licensePlate}`:""}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button className="slt-btn-secondary" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setEditingTruck(t.id)}>✏️ Edit</button>
                      <button className="slt-btn-danger" style={{padding:"6px 12px",fontSize:12}} onClick={()=>setLTrucks(ts=>ts.filter(x=>x.id!==t.id))}>Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {lTrucks.length===0&&<div style={{textAlign:"center",padding:"24px",color:C.textLight,fontSize:13}}>No trucks yet.</div>}
            <div className="slt-card-sm" style={{border:`2px dashed ${C.border}`,marginTop:10}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:C.orange,marginBottom:12}}>+ Add Truck/Trailer</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="slt-label">Truck # *</label><input value={nt.truckNumber} onChange={e=>setNt(t=>({...t,truckNumber:e.target.value}))} className="slt-input" placeholder="e.g. T-17"/></div>
                <div><label className="slt-label">Trailer #</label><input value={nt.trailerNumber||""} onChange={e=>setNt(t=>({...t,trailerNumber:e.target.value}))} className="slt-input" placeholder="Optional"/></div>
              </div>
              <div style={{marginBottom:10}}><label className="slt-label">License Plate</label><input value={nt.licensePlate||""} onChange={e=>setNt(t=>({...t,licensePlate:e.target.value}))} className="slt-input" placeholder="Optional"/></div>
              <button className="slt-btn-primary" style={{width:"100%"}} onClick={()=>{
                if(!nt.truckNumber.trim()) return;
                const ex=lTrucks.map(t=>parseInt(t.tmwNumber)||0);
                const tmw=(Math.max(1000,...ex)+1).toString();
                setLTrucks(t=>[...t,{...nt,tmwNumber:tmw,id:Date.now().toString()}]);
                setNt({truckNumber:"",trailerNumber:"",licensePlate:""});
              }}>+ Add Truck</button>
            </div>

          </div>)}
        </div>
        <div style={{padding:"0 24px 22px"}}><button className="slt-btn-primary" style={{width:"100%",padding:"13px",fontSize:15}} onClick={save}>💾 Save All Settings</button></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// NEW FEATURE MODULES — TruckPilot v3
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
    const rows = iftaRows.map(r => `<tr><td>${r.jur}</td><td>${r.km.toLocaleString()}</td><td>${r.allocated}</td><td>${r.fuel.toFixed(1)}</td><td>${Number(r.diff) > 0 ? "+" : ""}${r.diff}</td><td style="color:${r.isRefund ? "green" : "red"};font-weight:800">${r.isRefund ? "REFUND" : "OWED"} $${Math.abs(r.taxOwed).toFixed(2)}</td></tr>`).join("");
    const html = `
      <div class="header"><div class="brand">🚛 TruckPilot</div><div><div style="font-size:20px;font-weight:800">IFTA Tax Report</div><div style="color:#666">${quarter}</div></div></div>
      <div class="summary">
        <div class="summary-card"><div class="label">Total KM</div><div class="value">${totalKm.toLocaleString()}</div></div>
        <div class="summary-card"><div class="label">Total Fuel (L)</div><div class="value">${totalFuel.toFixed(1)}</div></div>
        <div class="summary-card"><div class="label">Net Tax ${totalTax >= 0 ? "Owed" : "Refund"}</div><div class="value" style="color:${totalTax >= 0 ? "#C62828" : "#2E7D32"}">$${Math.abs(totalTax).toFixed(2)}</div></div>
      </div>
      <table><thead><tr><th>Jurisdiction</th><th>KM Driven</th><th>Fuel Allocated (L)</th><th>Fuel Purchased (L)</th><th>Difference</th><th>Tax Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="font-size:11px;color:#888">Avg efficiency: ${avgMpg} km/L</p>`;
    downloadPDF(html, `IFTA_${quarter}`, session);
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
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color }}>{v}</div>
            </div>
          ))}
        </div>

        {showAdd && (
          <div className="slt-card" style={{ border: `2px solid ${C.blue}`, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, color: C.blue, fontSize: 16, marginBottom: 16 }}>Add Jurisdiction Entry</div>
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
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>IFTA Summary — {quarter}</div>
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
                    <td colSpan={5} style={{ padding: "11px 12px", fontWeight: 800, fontFamily: "'Barlow Condensed',sans-serif" }}>NET IFTA {totalTax >= 0 ? "TAX OWED" : "REFUND"}</td>
                    <td style={{ padding: "11px 12px", fontWeight: 800, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, color: totalTax > 0 ? C.red : C.green }}>${Math.abs(totalTax).toFixed(2)}</td>
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
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, marginBottom: 8 }}>No entries for {quarter}</div>
            <div style={{ color: C.textMed, fontSize: 13 }}>Add your KM by jurisdiction and fuel purchases to generate your IFTA report</div>
          </div>
        )}

        {/* Raw entries */}
        {qEntries.length > 0 && (
          <div className="slt-card" style={{ marginTop: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Trip Entries</div>
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
function PayrollTab({ session, loads, rates, allDrivers: allDriversProp , goBack}) {
  const payrollKey = `tp-payroll-${session.ownerUid || session.uid}`;
  const [payPeriod, setPayPeriod] = useState(rates?.payFrequency || "biweekly");
  const pp = getPayPeriod(rates);
  const [bonuses, setBonuses] = useState(getStored(payrollKey));
  const [showBonus, setShowBonus] = useState(false);
  const [bonusForm, setBonusForm] = useState({ driverUid: "", amount: "", reason: "", date: todayStr() });
  const [expandDriver, setExpandDriver] = useState(null);
  const [sbDrivers, setSbDrivers] = useState([]);

  useEffect(() => {
    sbGetDrivers(session.ownerUid || session.uid).then(d => {
      if (d && d.length > 0) setSbDrivers(d);
    }).catch(() => {});
  }, [session.uid]);

  // Merge Supabase drivers with localStorage drivers, deduplicate by uid
  const allDrivers = (() => {
    const merged = [...(allDriversProp || [])];
    sbDrivers.forEach(sd => {
      if (!merged.find(d => d.uid === sd.uid)) merged.push(sd);
    });
    // Also add any drivers found in loads who aren't in the list yet
    loads.forEach(l => {
      const dUid = l.assignedDriverUid || (l.addedBy !== session.uid ? l.addedBy : null) || (l.user_id !== session.uid ? l.user_id : null);
      if (dUid && dUid !== session.uid && !merged.find(d => d.uid === dUid)) {
        merged.push({ uid: dUid, fullName: l.driverFullName || "Unknown Driver", name: l.driverFullName || "Unknown Driver" });
      }
    });
    return merged;
  })();

  const now = new Date();
  const periodStart = new Date(now);
  if (payPeriod === "weekly") periodStart.setDate(now.getDate() - 7);
  else if (payPeriod === "biweekly") periodStart.setDate(now.getDate() - 14);
  else periodStart.setDate(1); // monthly
  const calcPeriodStart = pp?.periodStart || periodStart;
  const calcPeriodEnd = pp?.periodEnd || now;

  const inPeriod = (dateStr) => {
    if (!dateStr) return false;
    if (pp?.periodStart) {
      const d = new Date(dateStr + "T12:00:00");
      const start = pp.periodStart instanceof Date ? pp.periodStart : new Date((pp.periodStart||"") + "T00:00:00");
      const end = pp.periodEnd instanceof Date ? pp.periodEnd : new Date((pp.periodEnd||new Date().toISOString().slice(0,10)) + "T23:59:59");
      return d >= start && d <= end;
    }
    // Fallback: use payPeriod
    const d = new Date(dateStr + "T12:00:00");
    const now = new Date();
    if (payPeriod === "weekly") { const w = new Date(now); w.setDate(w.getDate()-7); return d >= w; }
    if (payPeriod === "biweekly") { const bw = new Date(now); bw.setDate(bw.getDate()-14); return d >= bw; }
    // monthly
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const saveBonus = (arr) => {
    setBonuses(arr);
    localStorage.setItem(payrollKey, JSON.stringify(arr));
    // Save each bonus to Supabase so driver can see it
    arr.forEach(b => sbSaveExpense({
      id: `bonus-${b.id}`, category: "bonus", amount: Number(b.amount),
      description: `🎁 Bonus: ${b.reason||"Bonus"}`, date: b.date,
      reason: b.reason, driverUid: b.driverUid, source: "bonus", paid: b.paid||false
    }, b.driverUid).catch(console.error));
  };
  const addBonus = () => {
    if (!bonusForm.driverUid || !bonusForm.amount) return;
    const newBonus = { ...bonusForm, amount: Number(bonusForm.amount), id: Date.now().toString(), paid: false };
    saveBonus([newBonus, ...bonuses]);
    setBonusForm({ driverUid: "", amount: "", reason: "", date: todayStr() });
    setShowBonus(false);
  };

  const getDriverPayroll = (driver) => {
    const dLoads = loads.filter(l => (l.assignedDriverUid === driver.uid || l.addedBy === driver.uid || l.user_id === driver.uid) && inPeriod(l.date));
    const routePay = dLoads.reduce((s, l) => s + (Number(l.driverBasePay||0) > 0 ? Number(l.driverBasePay||0) : Number(l.earnings||0)), 0);
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
      return `<tr><td>${d.fullName || d.name}</td><td>${p.dLoads.length}</td><td>$${p.routePay.toFixed(2)}</td><td>$${p.waitPay.toFixed(2)}</td><td>$${p.bonusTotal.toFixed(2)}</td><td style="font-weight:800;color:#243B6E">$${p.total.toFixed(2)}</td></tr>`;
    }).join("");
    const grandTotal = allDrivers.reduce((s, d) => s + getDriverPayroll(d).total, 0);
    const html = `
      <div class="header"><div class="brand">🚛 TruckPilot</div><div><div style="font-size:20px;font-weight:800">Driver Payroll Report</div><div style="color:#666">${payPeriod.charAt(0).toUpperCase()+payPeriod.slice(1)} · ${periodStart.toDateString()} to ${now.toDateString()}</div></div></div>
      <div class="summary">
        <div class="summary-card"><div class="label">Drivers</div><div class="value">${allDrivers.length}</div></div>
        <div class="summary-card"><div class="label">Total Loads</div><div class="value">${allDrivers.reduce((s,d)=>s+getDriverPayroll(d).dLoads.length,0)}</div></div>
        <div class="summary-card"><div class="label">Grand Total</div><div class="value blue">$${grandTotal.toFixed(2)}</div></div>
      </div>
      <table><thead><tr><th>Driver</th><th>Loads</th><th>Route Pay</th><th>Wait Pay</th><th>Bonuses</th><th>Total</th></tr></thead>
      <tbody>${rows}
      <tr class="total"><td colspan="5"><strong>GRAND TOTAL</strong></td><td><strong>$${grandTotal.toFixed(2)}</strong></td></tr>
      </tbody></table>`;
    downloadPDF(html, `Payroll_${payPeriod}_${todayStr()}`, session);
  };

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">💵 Driver Payroll</div>
        <div className="slt-hero-sub">Automated pay calculation · Export for accounting</div>
      </div>
      <div className="slt-container">

        {/* Pay Period Banner */}
        <div style={{background:"linear-gradient(135deg,#1a2744,#243B6E)",borderRadius:16,padding:"16px 18px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Current Pay Period</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color:"#fff"}}>{pp.label}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:3}}>Cut-off: {pp.cutoffLabel} · {pp.freqLabel}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Next Pay Date</div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,color:"#FFD700"}}>{pp.nextPayLabel}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>in {pp.daysUntilNext} day{pp.daysUntilNext!==1?"s":""}</div>
            </div>
          </div>
        </div>

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
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 10 }}>Period: {pp?.periodStart ? new Date(pp.periodStart+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}) : periodStart.toDateString()} — {pp?.periodEnd ? new Date(pp.periodEnd+"T12:00:00").toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}) : now.toDateString()}</div>
        </div>

        {showBonus && (
          <div className="slt-card" style={{ border: `2px solid ${C.green}`, marginBottom: 18 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, color: C.green, marginBottom: 14 }}>Add Bonus / Adjustment</div>
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
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 17 }}>{driver.fullName || driver.name}</div>
                    <div style={{ fontSize: 12, color: C.textLight }}>{p.dLoads.length} load{p.dLoads.length !== 1 ? "s" : ""} this period</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: C.green }}>{fmtC(p.total)}</div>
                    <div style={{ fontSize: 11, color: C.textLight }}>{isOpen ? "▲ Hide" : "▼ Details"}</div>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                      {[["Route Pay", fmtC(p.routePay), C.blue], ["Wait Pay", fmtC(p.waitPay), C.orange], ["Bonuses", fmtC(p.bonusTotal), C.green]].map(([l, v, color]) => (
                        <div key={l} style={{ background: C.offWhite, borderRadius: 9, padding: "12px", textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700 }}>{l}</div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color, marginTop: 3 }}>{v}</div>
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
function AnalyticsTab({ session, loads, isOwner, rates , goBack}) {
  const myLoads = isOwner ? loads : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid || l.user_id === session.uid);
  const [view, setView] = useState("income");
  const expenses = getStored(expensesKey(session.uid));

  // Helper: driver pay for a single load
  const getDriverPay = (l) => {
    const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
    return Number(l.driverBasePay || 0) + wm / 60 * (Number(rates.driverWaitRate) || 0);
  };
  const getOwnerGross = (l) => {
    const wm = (Number(l.loadWaitMins) || 0) + (Number(l.offloadWaitMins) || 0);
    return Number(l.earnings || 0) + wm / 60 * (Number(rates.companyWaitRate) || 0);
  };

  // Build monthly data (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short" });
    const mLoads = myLoads.filter(l => l.date && l.date.startsWith(key));
    const monthExp = expenses.filter(e => e.date && e.date.startsWith(key)).reduce((s,e) => s + Number(e.amount||0), 0);
    if (isOwner) {
      const gross = mLoads.reduce((s, l) => s + getOwnerGross(l), 0);
      const drvPay = mLoads.reduce((s, l) => s + getDriverPay(l), 0);
      months.push({ key, label, count: mLoads.length, gross, net: gross - drvPay - monthExp, drvPay, exp: monthExp });
    } else {
      const pay = mLoads.reduce((s, l) => s + getDriverPay(l), 0);
      months.push({ key, label, count: mLoads.length, gross: pay, net: pay - monthExp, exp: monthExp });
    }
  }

  // Route performance — owner sees business earnings, driver sees their pay per route
  const routeMap = {};
  myLoads.forEach(l => {
    if (!l.location) return;
    if (!routeMap[l.location]) routeMap[l.location] = { count: 0, totalEarnings: 0, totalPay: 0 };
    routeMap[l.location].count++;
    routeMap[l.location].totalEarnings += getOwnerGross(l);
    routeMap[l.location].totalPay += getDriverPay(l);
  });
  const topRoutes = Object.entries(routeMap).map(([route, d]) => ({
    route, ...d,
    displayTotal: isOwner ? d.totalEarnings : d.totalPay,
    avg: isOwner ? d.totalEarnings / d.count : d.totalPay / d.count,
  })).sort((a, b) => b.displayTotal - a.displayTotal).slice(0, 8);

  // Fuel efficiency
  const loadsWithFuel = myLoads.filter(l => l.fuelLitres > 0 && l.km > 0);
  const avgEfficiency = loadsWithFuel.length > 0
    ? loadsWithFuel.reduce((s, l) => s + Number(l.km) / Number(l.fuelLitres), 0) / loadsWithFuel.length
    : null;

  const totalLoads = myLoads.length;
  const completedLoads = myLoads.filter(l => l.completed).length;
  // KPI totals: owner = gross/net, driver = their pay only
  const totalDriverPay = myLoads.reduce((s, l) => s + getDriverPay(l), 0);
  const totalGross = myLoads.reduce((s, l) => s + getOwnerGross(l), 0);
  const totalOwnerNet = totalGross - myLoads.reduce((s, l) => s + (isOwner ? getDriverPay(l) : 0), 0);
  const displayTotal = isOwner ? totalGross : totalDriverPay;
  const avgPerLoad = totalLoads > 0 ? displayTotal / totalLoads : 0;

  const BarChart = ({ data, valueKey, colorFn, height = 140 }) => {
    const max = Math.max(...data.map(d => d[valueKey]), 1);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, padding: "0 4px" }}>
      {goBack && <BackButton onBack={goBack} label="Back" />}
        {data.map((d, i) => {
          const barH = Math.max(4, (d[valueKey] / max) * (height - 30));
          const val = d[valueKey];
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3, fontWeight: 700 }}>
                {val > 1000 ? `$${(val / 1000).toFixed(1)}k` : val > 0 ? fmtC(val) : "—"}
              </div>
              <div style={{ width: "100%", height: barH, background: colorFn ? colorFn(i) : `linear-gradient(180deg,${C.teal},${C.blue})`, borderRadius: "5px 5px 0 0", transition: "height 0.4s" }} />
              <div style={{ fontSize: 10, color: C.textMed, marginTop: 4, fontWeight: 600 }}>{d.label}</div>
            </div>
          );
        })}
      </div>
    );
  };


  // ── AI Insights ──────────────────────────────────────────────────
  const insights = [];
  const expensesAll = getStored(expensesKey(session.uid));
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  if (lastMonth && prevMonth && prevMonth.exp > 0) {
    const expChange = ((lastMonth.exp - prevMonth.exp) / prevMonth.exp) * 100;
    if (expChange > 20) insights.push({ type:"warning", icon:"⚠️", title:"Expense Spike", msg:`Expenses up ${expChange.toFixed(0)}% vs last month ($${lastMonth.exp.toFixed(0)} vs $${prevMonth.exp.toFixed(0)}). Review your spending.` });
    else if (expChange < -15) insights.push({ type:"success", icon:"✅", title:"Expenses Down", msg:`Great job! Expenses dropped ${Math.abs(expChange).toFixed(0)}% vs last month.` });
  }
  if (topRoutes.length > 0) {
    const best = topRoutes[0];
    insights.push({ type:"info", icon:"🏆", title:"Best Route", msg:`${best.route} is your most profitable route — averaging ${fmtC(best.avg)} per load across ${best.count} loads.` });
  }
  const pendingLoads = myLoads.filter(l => !l.completed);
  if (pendingLoads.length > 2) insights.push({ type:"warning", icon:"🔄", title:"Pending Loads", msg:`You have ${pendingLoads.length} loads not marked complete. Update them to keep records accurate.` });
  const driverStats = {};
  if (isOwner) {
    myLoads.forEach(l => {
      // include loads assigned to any driver including owner-driven
      const n = l.driverFullName || l.assignedDriverName || (l.assignedDriverUid && l.assignedDriverUid !== session.uid ? "Driver" : null);
      if (!n) return;
      const uid = l.assignedDriverUid || n;
      const key = uid;
      if (!driverStats[key]) driverStats[key] = { loads:0, pay:0, name:n, uid };
      driverStats[key].loads++;
      driverStats[key].pay += getDriverPay(l);
    });
    const sorted = Object.entries(driverStats).sort((a,b) => b[1].loads - a[1].loads);
    if (sorted.length > 0) {
      const [, topData] = sorted[0];
      insights.push({ type:"success", icon:"🚛", title:"Top Driver", msg:`${topData.name} is your hardest working driver — ${topData.loads} loads, ${fmtC(topData.pay)} earned this period.` });
    }
    if (sorted.length > 1) {
      const [, lowData] = sorted[sorted.length-1];
      if (lowData.loads < 3) insights.push({ type:"info", icon:"💡", title:"Low Activity", msg:`${lowData.name} only has ${lowData.loads} load${lowData.loads!==1?"s":""} this period. Consider assigning more loads.` });
    }
  }
  if (months.length >= 2) {
    const last2 = months[months.length-1], prev2 = months[months.length-2];
    if (prev2.gross > 0) {
      const ch = ((last2.gross - prev2.gross)/prev2.gross)*100;
      if (ch > 10) insights.push({ type:"success", icon:"📈", title:"Revenue Up", msg:`Revenue up ${ch.toFixed(0)}% this month — ${last2.count} loads vs ${prev2.count} last month.` });
      else if (ch < -10) insights.push({ type:"warning", icon:"📉", title:"Revenue Down", msg:`Revenue down ${Math.abs(ch).toFixed(0)}% this month. ${last2.count} loads vs ${prev2.count} last month.` });
    }
  }
  const actions = [];
  if (pendingLoads.length > 0) actions.push({ icon:"🔄", text:`${pendingLoads.length} loads not marked complete — tap to go to My Loads`, urgent:pendingLoads.length > 3, tab:"log" });
  const uncategorized = expensesAll.filter(e => !e.category || e.category === "other").length;
  if (uncategorized > 0) actions.push({ icon:"🧾", text:`${uncategorized} expenses need categories for better tax reporting`, urgent:false, tab:"expenses" });
  if (isOwner && Object.keys(driverStats).length === 0 && myLoads.length > 0) actions.push({ icon:"👥", text:"No drivers found — make sure loads have drivers assigned", urgent:false, tab:"drivers" });
  const noTruck = myLoads.filter(l => !l.truckId && !l.manualTruckNumber).length;
  if (noTruck > 3) actions.push({ icon:"🚛", text:`${noTruck} loads have no truck assigned — add truck numbers for better tracking`, urgent:false, tab:"log" });

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">{isOwner ? "📈 Business Analytics" : "📈 My Analytics"}</div>
        <div className="slt-hero-sub">{isOwner ? "Fleet revenue · Driver performance · Smart insights" : "Your pay · Expenses · Route performance"}</div>
      </div>
      <div className="slt-container">

        {/* KPI row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
          {(isOwner ? [
            ["Total Loads", totalLoads, C.blue],
            ["Gross Revenue", fmtC(totalGross), C.green],
            ["Net Income", fmtC(totalOwnerNet), C.teal],
            ["Avg/Load", fmtC(avgPerLoad), C.orange],
            ["Completion", `${(totalLoads>0?(completedLoads/totalLoads)*100:100).toFixed(0)}%`, C.green],
          ] : [
            ["Total Loads", totalLoads, C.blue],
            ["Total Pay", fmtC(totalDriverPay), C.green],
            ["Avg/Load", fmtC(avgPerLoad), C.teal],
            ["Completed", completedLoads, C.green],
            ["Pending", pendingLoads.length, pendingLoads.length > 0 ? C.orange : C.green],
          ]).map(([l,v,c]) => (
            <div key={l} className="slt-card-sm" style={{ borderTop:`3px solid ${c}`, textAlign:"center", padding:"12px 8px" }}>
              <div style={{ fontSize:10, color:C.textLight, fontWeight:700, marginBottom:2, textTransform:"uppercase" }}>{l}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:900, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* 🤖 AI INSIGHTS */}
        {insights.length > 0 && (
          <div className="slt-card" style={{ marginBottom:20, background:"linear-gradient(135deg,#1a2744,#243B6E)", border:"none" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:"#fff", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
              🤖 AI Insights <span style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)" }}>Based on your data</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background:"rgba(255,255,255,0.08)", borderRadius:12, padding:"12px 14px", borderLeft:`4px solid ${ins.type==="success"?"#4ade80":ins.type==="warning"?"#FFD700":"rgba(255,255,255,0.4)"}` }}>
                  <div style={{ fontWeight:800, fontSize:13, color:"#fff", marginBottom:3 }}>{ins.icon} {ins.title}</div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.75)", lineHeight:1.5 }}>{ins.msg}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ⚠️ ACTION REQUIRED */}
        {actions.length > 0 && (
          <div className="slt-card" style={{ marginBottom:20, border:`1.5px solid ${C.orange}` }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, color:C.orange, marginBottom:12 }}>⚠️ Action Required</div>
            {actions.map((a, i) => (
              <button key={i} onClick={()=>{ if(a.tab && goBack){ goBack(); setTimeout(()=>{ const ev=new CustomEvent("tp-nav",{detail:{tab:a.tab}}); window.dispatchEvent(ev); },100); }}}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderBottom: i < actions.length-1 ? `1px solid ${C.border}` : "none", background:"none", border:"none", cursor: a.tab ? "pointer" : "default", textAlign:"left" }}>
                <span style={{ fontSize:20 }}>{a.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:a.urgent ? C.red : C.textMed, fontWeight: a.urgent ? 700 : 600 }}>{a.text}</div>
                  {a.tab && <div style={{ fontSize:11, color:C.blue, fontWeight:600, marginTop:2 }}>Tap to fix →</div>}
                </div>
                {a.urgent && <span style={{ fontSize:11, background:C.red, color:"#fff", padding:"2px 8px", borderRadius:10, fontWeight:700 }}>URGENT</span>}
              </button>
            ))}
          </div>
        )}

        {/* 📊 REVENUE CHART */}
        <div className="slt-card" style={{ marginBottom:20 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:4 }}>📊 Monthly Revenue</div>
          <div style={{ fontSize:12, color:C.textLight, marginBottom:16 }}>Last 6 months</div>
          <BarChart data={months} valueKey="gross" colorFn={(i) => i === months.length-1 ? "#243B6E" : "#B8C9E8"} height={140} />
        </div>

        {/* 💸 EXPENSE BREAKDOWN */}
        {(() => {
          const expBycat = {};
          expensesAll.forEach(e => { const cat = e.category||"other"; if(!expBycat[cat])expBycat[cat]=0; expBycat[cat]+=Number(e.amount||0); });
          const expEntries = Object.entries(expBycat).sort((a,b)=>b[1]-a[1]).slice(0,6);
          const totalExp = expEntries.reduce((s,[,v])=>s+v,0);
          if (expEntries.length === 0) return null;
          const colors = ["#243B6E","#E53935","#F57C00","#2E7D32","#1565C0","#6A1B9A"];
          return (
            <div className="slt-card" style={{ marginBottom:20 }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:4 }}>💸 Where You Spend Most</div>
              <div style={{ fontSize:12, color:C.textLight, marginBottom:16 }}>All time expense breakdown</div>
              {expEntries.map(([cat, amt], i) => {
                const pct = totalExp > 0 ? (amt/totalExp)*100 : 0;
                return (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:C.textMed, textTransform:"capitalize" }}>{cat.replace(/_/g," ")}</span>
                      <span style={{ fontSize:13, fontWeight:700 }}>{fmtC(amt)} <span style={{ color:C.textLight, fontWeight:500 }}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:colors[i%colors.length], borderRadius:4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 🏆 DRIVER LEADERBOARD */}
        {isOwner && Object.keys(driverStats).length > 0 && (
          <div className="slt-card" style={{ marginBottom:20 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:4 }}>🏆 Driver Leaderboard</div>
            <div style={{ fontSize:12, color:C.textLight, marginBottom:14 }}>Ranked by loads completed</div>
            {Object.values(driverStats).sort((a,b)=>b.loads-a.loads).map((data, i) => {
              const initials = (data.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
              const medals = ["🥇","🥈","🥉"];
              const medalColors = ["#FFD700","#C0C0C0","#CD7F32"];
              return (
                <div key={data.uid} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:i<3?medalColors[i]:C.blue, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:i<3?18:13, color:i<3?"#1a2744":"#fff", flexShrink:0 }}>
                    {i < 3 ? medals[i] : initials}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{data.name}</div>
                    <div style={{ fontSize:12, color:C.textLight }}>{data.loads} load{data.loads!==1?"s":""} · {fmtC(data.pay)} earned</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:24, fontWeight:900, color: i===0?C.orange:C.green }}>{data.loads}</div>
                    <div style={{ fontSize:10, color:C.textLight }}>loads</div>
                  </div>
                </div>
              );
            })}
            {Object.keys(driverStats).length === 0 && (
              <div style={{ textAlign:"center", padding:"20px 0", color:C.textLight, fontSize:13 }}>No driver data yet — assign loads to drivers to see leaderboard</div>
            )}
          </div>
        )}
        {isOwner && Object.keys(driverStats).length === 0 && myLoads.length > 0 && (
          <div className="slt-card" style={{ marginBottom:20, border:`1px dashed ${C.border}`, textAlign:"center", padding:28 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🏆</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>Driver Leaderboard</div>
            <div style={{ fontSize:13, color:C.textLight }}>Assign loads to drivers to see rankings here</div>
          </div>
        )}

        {/* 🗺 ROUTE PERFORMANCE */}
        {topRoutes.length > 0 && (
          <div className="slt-card" style={{ marginBottom:20 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:14 }}>🗺 Route Performance</div>
            {topRoutes.map((r, i) => (
              <div key={r.route} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${C.blue}18`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:13, color:C.blue, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{r.route}</div>
                  <div style={{ fontSize:12, color:C.textLight }}>{r.count} loads · avg {fmtC(r.avg)}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, color:C.green }}>{fmtC(r.displayTotal)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 🎯 MONTHLY GOAL */}
        {(() => {
          const curMonth = months[months.length-1];
          const goalKey = `tp-monthly-goal-${session.uid}`;
          const defaultGoal = isOwner ? 20000 : 5000;
          const [goal, setGoal] = React.useState(() => Number(localStorage.getItem(goalKey)) || defaultGoal);
          const [editingGoal, setEditingGoal] = React.useState(false);
          const [goalInput, setGoalInput] = React.useState(String(goal));
          const saveGoal = () => {
            const val = Number(goalInput);
            if (val > 0) { localStorage.setItem(goalKey, val); setGoal(val); }
            setEditingGoal(false);
          };
          const pct = Math.min((curMonth?.gross||0)/goal*100, 100);
          return (
            <div className="slt-card" style={{ marginBottom:20, background:"linear-gradient(135deg,#f0f4ff,#e8efff)", border:"1.5px solid rgba(36,59,110,0.15)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, color:"#243B6E" }}>🎯 Monthly Goal</div>
                <button onClick={()=>{ setGoalInput(String(goal)); setEditingGoal(true); }} style={{ fontSize:12, color:"#243B6E", background:"rgba(36,59,110,0.1)", border:"none", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontWeight:700 }}>✏️ Edit</button>
              </div>
              {editingGoal ? (
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <input type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} className="slt-input" style={{ flex:1 }} placeholder="Enter goal amount" />
                  <button onClick={saveGoal} style={{ padding:"8px 16px", background:"#243B6E", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer" }}>Save</button>
                  <button onClick={()=>setEditingGoal(false)} style={{ padding:"8px 12px", background:"#eee", border:"none", borderRadius:8, cursor:"pointer" }}>✕</button>
                </div>
              ) : (
                <div style={{ fontSize:12, color:C.textLight, marginBottom:14 }}>Target: {fmtC(goal)} this month</div>
              )}
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#243B6E" }}>{fmtC(curMonth?.gross||0)}</span>
                <span style={{ fontSize:13, color:C.textLight }}>{pct.toFixed(0)}% of goal</span>
              </div>
              <div style={{ height:12, background:"rgba(36,59,110,0.1)", borderRadius:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:pct>=100?C.green:"linear-gradient(90deg,#243B6E,#2D4A8A)", borderRadius:6, transition:"width 0.6s" }} />
              </div>
              {pct >= 100 
                ? <div style={{ fontSize:13, color:C.green, fontWeight:700, marginTop:8 }}>🎉 Goal achieved this month!</div>
                : <div style={{ fontSize:13, color:C.textLight, marginTop:8 }}>{fmtC(goal-(curMonth?.gross||0))} more to reach your goal</div>
              }
            </div>
          );
        })()}

      </div>
    </div>
  );
}

function DocumentsTab({ session , goBack}) {
  const docsKey = `tp-docs-${session.uid}`;
  const [docs, setDocs] = useState(getStored(docsKey));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "bol", note: "", expiry: "", files: [] });
  const [viewDoc, setViewDoc] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [nameError, setNameError] = useState(false);
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
    if (!form.name.trim()) { setNameError(true); setTimeout(()=>setNameError(false), 2500); return; }
    save([{ ...form, id: Date.now().toString(), uploadedAt: todayStr() }, ...docs]);
    setForm({ name: "", category: "bol", note: "", expiry: "", files: [] });
    setNameError(false);
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
      {goBack && <BackButton onBack={goBack} label="Back" />}
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
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, color: C.blue, fontSize: 16, marginBottom: 14 }}>Upload Document</div>
            <div style={{ marginBottom: 12 }}>
              <label className="slt-label">Document Name *</label>
              <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError(false); }} className="slt-input" placeholder="e.g. Insurance Certificate 2024" style={{border: nameError ? "2px solid #E53935" : undefined}} />
              {nameError && <div style={{color:"#E53935",fontSize:12,fontWeight:600,marginTop:4}}>⚠️ Please enter a document name to save</div>}
            </div>
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
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{d.name}</div>
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
              <h2 style={{ margin: 0, fontSize: 17, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800 }}>{viewDoc.name}</h2>
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
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>🔗 Industry Load Boards</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            {[
              { name: "DAT Load Board", url: "https://www.dat.com", desc: "Largest North American load board", color: "#E53935", logo: "🏆" },
              { name: "Truckstop.com", url: "https://truckstop.com", desc: "Real-time freight marketplace", color: "#F57C00", logo: "🚚" },
              { name: "123Loadboard", url: "https://www.123loadboard.com", desc: "Canadian & US loads", color: "#243B6E", logo: "🇨🇦" },
              { name: "LoadLink", url: "https://www.loadlink.ca", desc: "Canada's freight network", color: "#00897B", logo: "🔗" },
              { name: "Convoy", url: "https://convoy.com", desc: "Digital freight network", color: "#2D4A8A", logo: "📡" },
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
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16 }}>📋 Sample Available Loads</div>
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
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 800, color: C.green }}>{fmtC(l.rate)}</div>
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
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 12 }}>💡 Load Board Tips</div>
          {["DAT and Truckstop offer free trials — sign up before you need loads", "Search by equipment type (flatbed has highest demand in AB)", "Rate per km should be $2.50+ to be profitable after fuel", "Use 123Loadboard for Canadian-specific freight", "Post your truck availability to attract brokers to you"].map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
              <span style={{ color: C.teal, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{tip}</span>
            </div>
          ))}
        </div>

        {/* 📋 PAST / INACTIVE DRIVERS */}
        {!selectedDriver && (
          <div style={{marginTop:24}}>
            <div style={{marginTop:8}}>
              <button onClick={()=>setShowInactive(v=>!v)}
                style={{width:"100%",padding:"14px 16px",background:showInactive?"rgba(36,59,110,0.06)":"rgba(0,0,0,0.03)",border:`1.5px solid ${showInactive?"#243B6E":C.border}`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>📋</span>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:showInactive?"#243B6E":C.textMed}}>
                    Past Drivers
                    <span style={{marginLeft:8,background:inactiveDrivers.length>0?"#243B6E":"#ccc",color:"#fff",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{inactiveDrivers.length}</span>
                  </div>
                </div>
                <span style={{color:C.textLight,fontSize:12,fontWeight:600}}>{showInactive?"▲ Hide":"▼ Show"}</span>
              </button>
              {showInactive && (
                inactiveDrivers.length === 0 ? (
                  <div style={{textAlign:"center",padding:"24px 16px",color:C.textLight,fontSize:13}}>
                    <div style={{fontSize:28,marginBottom:8}}>👥</div>
                    No past drivers yet. When you remove a driver they will appear here.
                  </div>
                ) : null
              )}
            </div>
            {showInactive && inactiveDrivers.length > 0 && inactiveDrivers.map(d => {
              const dl = loads.filter(l=>l.assignedDriverUid===d.uid||l.addedBy===d.uid);
              const dp = dl.reduce((s,l)=>{const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0);return s+(Number(l.driverBasePay)||0)+wm/60*(Number(rates?.driverWaitRate)||0);},0);
              const initials=(d.fullName||d.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
              return (
                <div key={d.uid} className="slt-card" style={{marginBottom:10,opacity:0.85,borderLeft:`3px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:40,height:40,borderRadius:"50%",background:"#ccc",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>{initials}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:15}}>{d.fullName||d.name}</div>
                        <div style={{fontSize:12,color:C.textLight}}>Left {d.left?new Date(d.left).toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"}):"Unknown"}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,color:C.textMed}}>{dl.length} loads</div>
                      <div style={{fontSize:12,color:C.textLight}}>{fmtC(dp)} total</div>
                    </div>
                  </div>
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,color:C.textLight}}>Joined: {d.joined?new Date(d.joined).toLocaleDateString("en-CA",{year:"numeric",month:"short"}):"Unknown"}{d.ownerRating?` · ${d.ownerRating}.0★`:""}</div>
                    <button onClick={async()=>{
                      if(!window.confirm("Re-invite this driver? They'll need your invite code.")) return;
                      await sb.from("driver_fleets").update({status:"active",left_at:null}).eq("driver_uid",d.uid).eq("owner_uid",session.uid);
                      loadAll();
                    }} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${C.blue}`,background:"#fff",color:C.blue,fontSize:11,fontWeight:700,cursor:"pointer"}}>Re-invite</button>
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


// ─── JOB BOARD ────────────────────────────────────────────────────────────────
function JobBoardTab({ session, goBack }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPost, setShowPost] = useState(false);
  const [form, setForm] = useState({ type:"hiring", title:"", description:"", location:"Fort McMurray, AB", contact:"" });
  const [posting, setPosting] = useState(false);
  const [filter, setFilter] = useState("all");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);

  useEffect(() => {
    if (selectedPost) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedPost]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      // Use community_messages table with type = job_board — readable by all
      const { data, error: err } = await sb.from("community_messages")
        .select("*")
        .eq("sender_role", "job_board")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!err && data) {
        const parsed = data.map(r => {
          try { return { ...JSON.parse(r.message), dbId: r.id, senderUid: r.sender_uid }; }
          catch { return null; }
        }).filter(Boolean);
        setPosts(parsed);
      }
    } catch(e) { console.error("Load posts error:", e); }
    setLoading(false);
  };

  useEffect(() => { loadPosts(); }, []);

  const submitPost = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError("Please fill in Title and Description."); return;
    }
    setPosting(true); setError("");
    const post = {
      id: `${session.uid}_${Date.now()}`,
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim() || "Fort McMurray, AB",
      contact: form.contact.trim() || "",
      postedBy: session.fullName || session.name || "Anonymous",
      postedByUid: session.uid,
      role: session.role || "owner",
      date: new Date().toISOString(),
    };
    try {
      const { error: err } = await sb.from("community_messages").insert({
        message: JSON.stringify(post),
        sender_uid: session.uid,
        sender_name: session.fullName || session.name || "Anonymous",
        sender_role: "job_board",
      });
      if (err) throw err;
      setForm({ type:"hiring", title:"", description:"", location:"Fort McMurray, AB", contact:"" });
      setShowPost(false);
      setSuccess("✅ Post published! All TruckPilot users can see it.");
      setTimeout(() => setSuccess(""), 4000);
      loadPosts();
    } catch(e) {
      console.error("Post error:", e);
      setError("Could not post. Make sure you are signed in and try again.");
    }
    setPosting(false);
  };

  const deletePost = async (dbId) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await sb.from("community_messages").delete().eq("id", dbId).eq("sender_uid", session.uid);
      loadPosts();
    } catch(e) { alert("Could not delete."); }
  };

  const typeColors = { hiring:"#166534", looking:"#1e3a5f", "owner-op":"#92400e" };
  const typeBg = { hiring:"#DCFCE7", looking:"#DBEAFE", "owner-op":"#FEF3C7" };
  const typeLabels = { hiring:"🟢 Hiring Drivers", looking:"🔵 Looking for Work", "owner-op":"🟡 Owner Operator" };
  const filtered = filter === "all" ? posts : posts.filter(p => p.type === filter);

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">📋 Job Board</div>
        <div className="slt-hero-sub">Visible to ALL TruckPilot users · Find drivers · Find work</div>
      </div>
      <div className="slt-container">

        {success && <div style={{background:"#DCFCE7",border:"1px solid #4ade80",borderRadius:10,padding:"12px 16px",marginBottom:12,color:"#166534",fontWeight:700,fontSize:14}}>{success}</div>}
        {error && <div style={{background:"#FEE2E2",border:"1px solid #f87171",borderRadius:10,padding:"12px 16px",marginBottom:12,color:"#991B1B",fontWeight:600,fontSize:14}}>{error}</div>}

        {/* Post button */}
        <button onClick={()=>{setShowPost(v=>!v);setError("");}}
          style={{width:"100%",marginBottom:14,padding:"14px",background:"#243B6E",border:"none",borderRadius:12,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:16,cursor:"pointer"}}>
          {showPost ? "✕ Cancel" : "✏️ Post a Job / Opportunity"}
        </button>

        {/* Post form */}
        {showPost && (
          <div className="slt-card" style={{marginBottom:16,border:"2px solid #243B6E"}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,marginBottom:14,color:"#243B6E"}}>New Post</div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Post Type *</div>
              <div style={{display:"flex",gap:8}}>
                {[["hiring","🟢 Hiring"],["looking","🔵 Looking for Work"],["owner-op","🟡 Owner Op"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setForm(f=>({...f,type:v}))}
                    style={{flex:1,padding:"10px 6px",borderRadius:10,border:`2px solid ${form.type===v?"#243B6E":"rgba(0,0,0,0.1)"}`,background:form.type===v?"#243B6E":"#fff",color:form.type===v?"#fff":"#555",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Title *</div>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                placeholder="e.g. Looking for flat deck driver — Fort Mac" className="slt-input" />
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Description *</div>
              <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                placeholder="Pay rate, requirements, schedule, start date..." rows={4}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.12)",fontSize:14,fontFamily:"'Barlow',sans-serif",resize:"vertical",outline:"none"}} />
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Location</div>
              <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}
                placeholder="Fort McMurray, AB" className="slt-input" />
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Contact (Phone or Email)</div>
              <input value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))}
                placeholder="437-700-5835" className="slt-input" />
            </div>

            <button onClick={submitPost} disabled={posting}
              style={{width:"100%",padding:"14px",background:posting?"#999":"#FFD700",border:"none",borderRadius:50,color:"#1a2744",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:17,cursor:posting?"not-allowed":"pointer"}}>
              {posting ? "⏳ Publishing..." : "📋 Publish to All Users →"}
            </button>
          </div>
        )}

        {/* Filter */}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[["all","All"],["hiring","Hiring"],["looking","For Work"],["owner-op","Owner Op"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              style={{flex:1,padding:"8px 4px",borderRadius:20,border:`1px solid ${filter===v?"#243B6E":"rgba(0,0,0,0.08)"}`,background:filter===v?"#243B6E":"#fff",color:filter===v?"#fff":"#666",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {!loading && <div style={{fontSize:12,color:"#888",marginBottom:10}}>{filtered.length} post{filtered.length!==1?"s":""} · visible to all TruckPilot users</div>}

        {loading ? (
          <div style={{textAlign:"center",padding:40,color:"#888"}}>
            <div style={{fontSize:28,marginBottom:8}}>⏳</div>Loading posts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="slt-card" style={{textAlign:"center",padding:40}}>
            <div style={{fontSize:36,marginBottom:10}}>📋</div>
            <div style={{fontWeight:700,marginBottom:6}}>No posts yet</div>
            <div style={{color:"#888",fontSize:13}}>Be the first to post a job or opportunity!</div>
          </div>
        ) : filtered.map((post, i) => (
          <div key={post.id||i} className="slt-card"
            onClick={()=>setSelectedPost(post)}
            style={{marginBottom:12,borderLeft:`4px solid ${typeColors[post.type]||"#ccc"}`,cursor:"pointer",transition:"box-shadow .15s",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{flex:1}}>
                <span style={{background:typeBg[post.type]||"#f5f5f5",color:typeColors[post.type]||"#666",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,display:"inline-block",marginBottom:8}}>
                  {typeLabels[post.type]||post.type}
                </span>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,color:"#1a1a1a",lineHeight:1.2}}>{post.title}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:8}}>
                <div style={{fontSize:11,color:"#aaa"}}>{post.date?new Date(post.date).toLocaleDateString("en-CA",{month:"short",day:"numeric"}):""}</div>
                <span style={{fontSize:16,color:"#aaa"}}>›</span>
              </div>
            </div>
            <div style={{fontSize:13,color:"#666",lineHeight:1.6,marginBottom:10,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{post.description}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              {post.location && <span style={{fontSize:12,color:"#888"}}>📍 {post.location}</span>}
              {post.postedBy && <span style={{fontSize:12,color:"#888"}}>👤 {post.postedBy}</span>}
              {post.contact && <span style={{fontSize:12,color:"#243B6E",fontWeight:700}}>📞 Tap to view</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Job Detail Modal ── */}
      {selectedPost && (
        <div onClick={()=>setSelectedPost(null)}
          style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onTouchMove={e=>e.stopPropagation()}>
          <div onClick={e=>e.stopPropagation()}
            onTouchMove={e=>e.stopPropagation()}
            style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"88vh",overflowY:"auto",overflowX:"hidden",padding:"0 0 40px",WebkitOverflowScrolling:"touch"}}>

            {/* Handle bar */}
            <div style={{display:"flex",justifyContent:"center",padding:"12px 0 4px"}}>
              <div style={{width:40,height:4,borderRadius:2,background:"#ddd"}} />
            </div>

            {/* Header */}
            <div style={{padding:"12px 20px 16px",borderBottom:"1px solid #f0f0f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{background:typeBg[selectedPost.type]||"#f5f5f5",color:typeColors[selectedPost.type]||"#666",fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:20}}>
                {typeLabels[selectedPost.type]||selectedPost.type}
              </span>
              <button onClick={()=>setSelectedPost(null)} style={{background:"rgba(0,0,0,0.07)",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            {/* Body */}
            <div style={{padding:"20px 20px 0"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:24,color:"#1a1a1a",lineHeight:1.2,marginBottom:16}}>{selectedPost.title}</div>

              {/* Meta row */}
              <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}}>
                {selectedPost.location && (
                  <div style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"#555",background:"#f5f5f5",padding:"6px 12px",borderRadius:20}}>
                    📍 {selectedPost.location}
                  </div>
                )}
                {selectedPost.date && (
                  <div style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"#555",background:"#f5f5f5",padding:"6px 12px",borderRadius:20}}>
                    🗓 {new Date(selectedPost.date).toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"})}
                  </div>
                )}
              </div>

              {/* Description */}
              <div style={{fontSize:11,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>About this post</div>
              <div style={{fontSize:15,color:"#333",lineHeight:1.8,marginBottom:20,whiteSpace:"pre-wrap"}}>{selectedPost.description}</div>

              {/* Posted by */}
              <div style={{background:"#f8f8f8",borderRadius:14,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:"50%",background:"#243B6E",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:17,flexShrink:0}}>
                  {(selectedPost.postedBy||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#1a1a1a"}}>{selectedPost.postedBy||"Anonymous"}</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>{selectedPost.role==="owner"?"Fleet Owner":"Driver"}</div>
                </div>
              </div>

              {/* Contact */}
              {selectedPost.contact ? (
                <a href={`tel:${selectedPost.contact}`}
                  style={{display:"block",width:"100%",padding:"16px",background:"#243B6E",border:"none",borderRadius:50,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,cursor:"pointer",textAlign:"center",textDecoration:"none",marginBottom:12}}>
                  📞 Call {selectedPost.contact}
                </a>
              ) : (
                <div style={{textAlign:"center",fontSize:13,color:"#aaa",padding:"12px 0",marginBottom:12}}>No contact info provided</div>
              )}

              {/* Delete (own post) */}
              {selectedPost.postedByUid === session.uid && (
                <button onClick={()=>{ deletePost(selectedPost.dbId); setSelectedPost(null); }}
                  style={{display:"block",width:"100%",padding:"12px",background:"none",border:"1.5px solid #f87171",borderRadius:50,color:"#f87171",fontWeight:700,fontSize:14,cursor:"pointer"}}>
                  🗑 Delete My Post
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function CommunityTab({ session, goBack }) {
  const CHAT_TABLE = "community_messages";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const lastIdRef = useRef(null);

  const loadMessages = async (initial = false) => {
    try {
      // Try community_messages table first
      const { data, error } = await sb.from("community_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);

      if (!error && data) {
        setMessages(data.map(r => ({
          id: r.id,
          text: r.message,
          from: r.sender_name,
          fromUid: r.sender_uid,
          role: r.sender_role,
          time: r.created_at,
        })));
        lastIdRef.current = data[data.length-1]?.id || null;
        if (initial) setTimeout(() => bottomRef.current?.scrollIntoView({behavior:"smooth"}), 200);
      } else {
        // Fallback: load from profiles community_chat field
        const { data: profiles } = await sb.from("profiles")
          .select("id, community_chat, name")
          .not("community_chat", "is", null);
        const all = (profiles||[]).flatMap(p => {
          try { return JSON.parse(p.community_chat||"[]"); } catch { return []; }
        }).sort((a,b) => new Date(a.time) - new Date(b.time));
        setMessages(all);
        if (initial) setTimeout(() => bottomRef.current?.scrollIntoView({behavior:"smooth"}), 200);
      }
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    loadMessages(true);
    pollRef.current = setInterval(() => loadMessages(false), 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({behavior:"smooth"});
  }, [messages.length]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    const msg = {
      id: `${session.uid}_${Date.now()}`,
      text,
      from: session.fullName || session.name || "Anonymous",
      fromUid: session.uid,
      role: session.role || "driver",
      time: new Date().toISOString(),
    };
    // Optimistic update
    setMessages(prev => [...prev, msg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({behavior:"smooth"}), 100);

    try {
      // Try community_messages table
      const { error } = await sb.from("community_messages").insert({
        message: text,
        sender_uid: session.uid,
        sender_name: session.fullName || session.name || "Anonymous",
        sender_role: session.role || "driver",
      });

      if (error) {
        // Fallback: save to this user's profile community_chat field
        const { data: pd } = await sb.from("profiles").select("community_chat").eq("id", session.uid).single();
        const existing = JSON.parse(pd?.community_chat || "[]");
        existing.push(msg);
        await sb.from("profiles").update({ community_chat: JSON.stringify(existing.slice(-50)) }).eq("id", session.uid);
      }
    } catch(e) {
      console.error("Send error:", e);
    }
    setSending(false);
  };

  const initials = (name) => (name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const roleColors = { owner:"#243B6E", driver:"#1e6ba8" };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#F4F1EC"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a2744,#243B6E)",padding:"52px 20px 16px",color:"#fff",flexShrink:0}}>
        {goBack && (
          <button onClick={goBack} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:600,cursor:"pointer",marginBottom:8,padding:0,display:"flex",alignItems:"center",gap:6}}>
            ← Back
          </button>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22}}>💬 TruckPilot Community</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:2}}>Visible to all TruckPilot users · Messages are permanent</div>
          </div>
          <div style={{background:"rgba(74,222,128,0.2)",border:"1px solid rgba(74,222,128,0.4)",borderRadius:20,padding:"4px 12px",fontSize:12,color:"#4ade80",fontWeight:700}}>
            🟢 Live
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px"}}>
        {loading ? (
          <div style={{textAlign:"center",padding:40,color:"#888"}}>
            <div style={{fontSize:28,marginBottom:8}}>⏳</div>
            Loading community chat...
          </div>
        ) : messages.length === 0 ? (
          <div style={{textAlign:"center",padding:48}}>
            <div style={{fontSize:48,marginBottom:12}}>💬</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Welcome to the Community!</div>
            <div style={{color:"#888",fontSize:14}}>Be the first to say hello. All TruckPilot users can see and reply.</div>
          </div>
        ) : (
          <>
            <div style={{textAlign:"center",marginBottom:20}}>
              <span style={{fontSize:12,color:"#aaa",background:"rgba(0,0,0,0.06)",padding:"4px 14px",borderRadius:20}}>
                {messages.length} messages · Visible to all users
              </span>
            </div>
            {messages.map((m, i) => {
              const isMe = m.fromUid === session.uid;
              const showName = !isMe && (i === 0 || messages[i-1]?.fromUid !== m.fromUid);
              const bg = isMe ? "#243B6E" : "#fff";
              const color = isMe ? "#fff" : "#1a1a1a";
              return (
                <div key={m.id||i} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",marginBottom:8,gap:8,alignItems:"flex-end"}}>
                  {!isMe && (
                    <div style={{width:30,height:30,borderRadius:"50%",background:roleColors[m.role]||"#243B6E",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0,marginBottom:2,opacity:showName?1:0}}>
                      {initials(m.from)}
                    </div>
                  )}
                  <div style={{maxWidth:"75%"}}>
                    {showName && !isMe && (
                      <div style={{fontSize:11,color:"#888",marginBottom:3,fontWeight:700,paddingLeft:2}}>
                        {m.from} <span style={{color:m.role==="owner"?"#243B6E":"#1e6ba8",fontWeight:600}}>· {m.role==="owner"?"🔑 Owner":"🚛 Driver"}</span>
                      </div>
                    )}
                    <div style={{background:bg,color,borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"10px 14px",fontSize:14,lineHeight:1.5,boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}}>
                      {m.text}
                    </div>
                    <div style={{fontSize:10,color:"#bbb",marginTop:3,textAlign:isMe?"right":"left",paddingLeft:isMe?0:4}}>
                      {m.time ? new Date(m.time).toLocaleTimeString("en-CA",{hour:"2-digit",minute:"2-digit"}) : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{padding:"10px 14px 24px",background:"#fff",borderTop:"1px solid rgba(0,0,0,0.08)",display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="Message the community..."
          style={{flex:1,padding:"12px 18px",borderRadius:50,border:"1.5px solid rgba(0,0,0,0.12)",fontSize:14,outline:"none",fontFamily:"'Barlow',sans-serif",background:"#F4F1EC"}}
        />
        <button onClick={send} disabled={!input.trim()||sending}
          style={{width:46,height:46,borderRadius:"50%",background:input.trim()&&!sending?"#243B6E":"#ddd",border:"none",color:"#fff",fontSize:18,cursor:input.trim()&&!sending?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.2s"}}>
          {sending ? "⏳" : "➤"}
        </button>
      </div>
    </div>
  );
}

// ─── Tax Export Tab ───────────────────────────────────────────────
// Feature 6: Tax Expense Export
// ─── FINANCIAL REPORTS ────────────────────────────────────────────────────────
function FinancialReportsTab({ session, loads=[], rates={}, isOwner, allDrivers=[], goBack }) {
  const [period, setPeriod] = useState("year");
  const yearWithData = (() => { const y = new Date().getFullYear().toString(); const hasData = loads.some(l=>l.date&&l.date.startsWith(y)); if(hasData) return y; const prev = (new Date().getFullYear()-1).toString(); return prev; })(); const [year, setYear] = useState(yearWithData);
  const [generating, setGenerating] = useState(null);
  const [sbExpenses, setSbExpenses] = useState([]);

  useEffect(() => {
    sbGetExpenses(session.uid).then(d => { if(d?.length>0) setSbExpenses(d); }).catch(()=>{});
  }, [session.uid]);

  const allExpenses = (() => {
    const local = getStored(expensesKey(session.uid));
    const merged = [...local];
    sbExpenses.forEach(se => { if(!merged.find(e=>e.id===se.id)) merged.push(se); });
    return merged;
  })();

  const inRange = (d) => {
    if(!d) return false;
    if(period==="year") return d.startsWith(year);
    if(period==="q1") return d>=`${year}-01-01`&&d<=`${year}-03-31`;
    if(period==="q2") return d>=`${year}-04-01`&&d<=`${year}-06-30`;
    if(period==="q3") return d>=`${year}-07-01`&&d<=`${year}-09-30`;
    if(period==="q4") return d>=`${year}-10-01`&&d<=`${year}-12-31`;
    return true;
  };

  const filteredLoads = loads.filter(l => inRange(l.date));
  const filteredExp = allExpenses.filter(e => inRange(e.date));
  const myLoads = isOwner ? filteredLoads : filteredLoads.filter(l=>l.assignedDriverUid===session.uid||l.addedBy===session.uid||l.user_id===session.uid);
  const grossRevenue = isOwner ? myLoads.reduce((s,l)=>s+Number(l.earnings||0),0) : 0;
  const driverPay = isOwner ? myLoads.filter(l=> Number(l.driverBasePay||0) > 0 && ( (l.assignedDriverUid && l.assignedDriverUid !== session.uid) || (l.addedBy && l.addedBy !== session.uid) || (l.user_id && l.user_id !== session.uid) ) ).reduce((s,l)=>{ const wm=(Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0); const wDrv=wm/60*(Number(rates.driverWaitRate)||0); return s+Number(l.driverBasePay||0)+wDrv; },0) : 0;
  const myPay = !isOwner ? myLoads.reduce((s,l)=>s+(Number(l.driverBasePay||0)||Number(l.earnings||0)),0) : grossRevenue - driverPay;
  const waitPay = myLoads.reduce((s,l)=>s+((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.companyWaitRate)||0),0);
  const totalIncome = isOwner ? grossRevenue + waitPay - driverPay : myPay;
  const totalExpenses = filteredExp.reduce((s,e)=>s+Number(e.amount||0),0);
  const netProfit = totalIncome - totalExpenses;
  const periodLabel = period==="year"?`Full Year ${year}`:period==="q1"?`Q1 ${year}`:period==="q2"?`Q2 ${year}`:period==="q3"?`Q3 ${year}`:`Q4 ${year}`;

  const expByCategory = {};
  filteredExp.forEach(e=>{
    const cat = e.category||"other";
    if(!expByCategory[cat]) expByCategory[cat]={total:0,items:[]};
    expByCategory[cat].total += Number(e.amount||0);
    expByCategory[cat].items.push(e);
  });

  const generatePDF = async (type) => {
    setGenerating(type);
    try {
      // Load jsPDF
      const loadjsPDF = () => new Promise((resolve, reject) => {
        if (window.jspdf?.jsPDF) { resolve(window.jspdf.jsPDF); return; }
        const existing = document.getElementById('jspdf-script');
        if (existing) { existing.onload = () => resolve(window.jspdf.jsPDF); return; }
        const script = document.createElement("script");
        script.id = 'jspdf-script';
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => { setTimeout(() => resolve(window.jspdf?.jsPDF), 100); };
        script.onerror = () => reject(new Error("Failed to load jsPDF"));
        document.head.appendChild(script);
      });
      const jsPDFClass = await loadjsPDF();
      if (!jsPDFClass) throw new Error("jsPDF not available");
      const doc = new jsPDFClass({ orientation:"portrait", unit:"mm", format:"letter" });
      const W = 215.9, margin = 20;
      let y = margin;

      const addPage = () => { doc.addPage(); y = margin; };
      const checkPage = (h=20) => { if(y+h > 270) addPage(); };
      const line = (x1,y1,x2,y2,color=[200,200,200]) => { doc.setDrawColor(...color); doc.line(x1,y1,x2,y2); };
      const hLine = (yy,color) => line(margin,yy,W-margin,yy,color);
      const text = (t,x,yy,opts={}) => { doc.text(String(t),x,yy,opts); };
      const money = (v) => `$${Number(v).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

      // Header
      doc.setFillColor(36,59,110);
      doc.rect(0,0,W,30,"F");
      doc.setTextColor(255,255,255);
      doc.setFontSize(20); doc.setFont("helvetica","bold");
      text("TruckPilot", margin, 13);
      doc.setFontSize(11); doc.setFont("helvetica","normal");
      text(type==="income"?"Income & Expense Statement":type==="tax"?"CRA T2125 — Business Income":type==="payroll"?"Payroll Summary":"IFTA Fuel Tax Report", margin, 21);
      doc.setFontSize(9);
      text(periodLabel, W-margin, 13, {align:"right"});
      text(`Generated: ${new Date().toLocaleDateString("en-CA")}`, W-margin, 21, {align:"right"});
      y = 40;
      doc.setTextColor(30,30,30);

      // Business info
      doc.setFontSize(10); doc.setFont("helvetica","bold");
      const reportName = isOwner
        ? (session.companyName || session.fullName || session.name || "Owner Operator")
        : (session.fullName || session.name || "Driver");
      text(reportName, margin, y); y+=5;
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      text(`Role: ${isOwner?"Fleet Owner":"Driver"} | Period: ${periodLabel}`, margin, y); y+=10;
      hLine(y,[180,180,180]); y+=6;

      if(type==="income") {
        // INCOME SECTION
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.setTextColor(36,59,110);
        text("INCOME", margin, y); y+=6;
        doc.setTextColor(30,30,30); doc.setFontSize(10); doc.setFont("helvetica","normal");
        hLine(y,[220,220,220]); y+=5;
        const incomeRows = isOwner ? [
          ["Gross Load Revenue", money(grossRevenue)],
          ["Wait Time Pay", money(waitPay)],
          ["Driver Pay Paid Out", `(${money(driverPay)})`],
          ["Net Owner Income", money(totalIncome)],
        ] : [
          ["Load Pay", money(myPay)],
          ["Total Income", money(totalIncome)],
        ];
        incomeRows.forEach(([l,v],i) => {
          const isBold = i===incomeRows.length-1;
          doc.setFont("helvetica", isBold?"bold":"normal");
          doc.setFontSize(isBold?11:10);
          text(l, margin+2, y);
          text(v, W-margin, y, {align:"right"});
          y+=6; hLine(y,[235,235,235]); y+=3;
        });
        y+=6;

        // EXPENSES SECTION
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.setTextColor(36,59,110);
        text("EXPENSES", margin, y); y+=6;
        doc.setTextColor(30,30,30); doc.setFontSize(10); doc.setFont("helvetica","normal");
        hLine(y,[220,220,220]); y+=5;
        Object.entries(expByCategory).forEach(([cat,data]) => {
          checkPage(12);
          const label = cat.replace(/_/g," ").replace(/\w/g,c=>c.toUpperCase());
          doc.setFont("helvetica","normal"); doc.setFontSize(10);
          text(label, margin+2, y);
          text(money(data.total), W-margin, y, {align:"right"});
          y+=6; hLine(y,[235,235,235]); y+=3;
        });
        checkPage(14);
        doc.setFont("helvetica","bold"); doc.setFontSize(11);
        text("Total Expenses", margin+2, y);
        text(money(totalExpenses), W-margin, y, {align:"right"});
        y+=8; hLine(y,[36,59,110]); y+=6;

        // NET PROFIT
        doc.setFillColor(36,59,110);
        doc.rect(margin,y-2,W-margin*2,12,"F");
        doc.setTextColor(255,255,255);
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        text("NET PROFIT", margin+4, y+6);
        text(money(netProfit), W-margin-4, y+6, {align:"right"});
        doc.setTextColor(30,30,30); y+=18;
      }

      else if(type==="tax") {
        // CRA T2125 FORMAT
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.setTextColor(36,59,110);
        text("STATEMENT OF BUSINESS INCOME — T2125", margin, y); y+=4;
        doc.setFont("helvetica","normal"); doc.setFontSize(8);
        doc.setTextColor(120,120,120);
        text("For use with personal income tax return. Consult a CRA-certified accountant for filing.", margin, y); y+=8;
        doc.setTextColor(30,30,30);
        hLine(y,[220,220,220]); y+=5;

        const t2125Sections = [
          {title:"PART 1 — INCOME FROM BUSINESS", rows:[
            ["Gross business income (Line 8000)", money(totalIncome)],
            ["Less: Returns, allowances (Line 8290)", "$0.00"],
            ["Net sales/commissions (Line 8299)", money(totalIncome)],
          ]},
          {title:"PART 2 — COST OF GOODS SOLD", rows:[
            ["Opening inventory (Line 8300)", "$0.00"],
            ["Purchases (Line 8320)", "$0.00"],
            ["Closing inventory (Line 8500)", "$0.00"],
            ["Cost of goods sold (Line 8519)", "$0.00"],
          ]},
          {title:"PART 3 — GROSS PROFIT", rows:[
            ["Gross profit (Line 8299 - Line 8519)", money(totalIncome)],
          ]},
          {title:"PART 4 — EXPENSES", rows:[
            ...Object.entries(expByCategory).map(([cat,data])=>[`${cat.replace(/_/g," ").replace(/\w/g,c=>c.toUpperCase())}`,money(data.total)]),
            ["Total expenses (Line 9368)", money(totalExpenses)],
          ]},
          {title:"PART 5 — NET INCOME", rows:[
            ["Net income before adjustments (Line 9369)", money(netProfit)],
            ["Business-use-of-home expenses (Line 9270)", "$0.00"],
            ["NET INCOME (Line 9946)", money(netProfit)],
          ]},
        ];

        t2125Sections.forEach(section => {
          checkPage(30);
          doc.setFontSize(10); doc.setFont("helvetica","bold");
          doc.setFillColor(240,244,255);
          doc.rect(margin,y-3,W-margin*2,8,"F");
          doc.setTextColor(36,59,110);
          text(section.title, margin+2, y+2); y+=8;
          doc.setTextColor(30,30,30);
          section.rows.forEach(([l,v],i) => {
            checkPage(8);
            const isBold = i===section.rows.length-1;
            doc.setFont("helvetica",isBold?"bold":"normal");
            doc.setFontSize(isBold?10:9);
            text(l, margin+2, y);
            text(v, W-margin, y, {align:"right"});
            y+=5; hLine(y,[235,235,235]); y+=2;
          });
          y+=4;
        });
      }

      else if(type==="payroll" && isOwner) {
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.setTextColor(36,59,110);
        text("DRIVER PAYROLL SUMMARY", margin, y); y+=6;
        doc.setTextColor(30,30,30); doc.setFontSize(9); doc.setFont("helvetica","normal");
        hLine(y,[220,220,220]); y+=5;

        const driverStats = {};
        filteredLoads.forEach(l => {
          if(!l.assignedDriverUid || l.assignedDriverUid===session.uid) return;
          const name = l.driverFullName||"Unknown Driver";
          if(!driverStats[name]) driverStats[name]={loads:0,pay:0,waitPay:0,completed:0};
          driverStats[name].loads++;
          driverStats[name].pay += Number(l.driverBasePay||0);
          driverStats[name].waitPay += ((Number(l.loadWaitMins)||0)+(Number(l.offloadWaitMins)||0))/60*(Number(rates.driverWaitRate)||0);
          if(l.completed) driverStats[name].completed++;
        });

        if(Object.keys(driverStats).length===0) {
          doc.setFontSize(10); text("No driver payroll data for this period.", margin, y); y+=10;
        }

        Object.entries(driverStats).forEach(([name,data]) => {
          checkPage(40);
          doc.setFillColor(240,244,255);
          doc.rect(margin,y-3,W-margin*2,8,"F");
          doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(36,59,110);
          text(name, margin+2, y+2); y+=8;
          doc.setTextColor(30,30,30); doc.setFont("helvetica","normal"); doc.setFontSize(10);
          [
            ["Total Loads", data.loads],
            ["Completed Loads", data.completed],
            ["Route Pay", money(data.pay)],
            ["Wait Time Pay", money(data.waitPay)],
            ["Total Pay", money(data.pay+data.waitPay)],
          ].forEach(([l,v]) => {
            text(l, margin+4, y); text(String(v), W-margin, y, {align:"right"});
            y+=5; hLine(y,[235,235,235]); y+=2;
          });
          y+=6;
        });

        // Totals
        checkPage(20);
        hLine(y,[36,59,110]); y+=4;
        doc.setFillColor(36,59,110);
        doc.rect(margin,y-2,W-margin*2,12,"F");
        doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(11);
        const totalDriverPay = Object.values(driverStats).reduce((s,d)=>s+d.pay+d.waitPay,0);
        text("TOTAL PAYROLL", margin+4, y+6);
        text(money(totalDriverPay), W-margin-4, y+6, {align:"right"});
        doc.setTextColor(30,30,30); y+=16;
      }

      else if(type==="ifta") {
        doc.setFontSize(12); doc.setFont("helvetica","bold");
        doc.setTextColor(36,59,110);
        text("IFTA FUEL TAX REPORT", margin, y); y+=4;
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(120,120,120);
        text("International Fuel Tax Agreement — Summary Report", margin, y); y+=8;
        doc.setTextColor(30,30,30);
        hLine(y,[220,220,220]); y+=5;

        const iftaKey = `tp-ifta-${session.ownerUid || session.uid}`;
        const iftaStored = getStored(iftaKey);
        // Pull fuel from expenses (fuel category with litres recorded)
        const expFuelEntries = filteredExp.filter(e => e.category === "fuel" && Number(e.litres||0) > 0).map(e => ({
          id: `exp-fuel-${e.id}`,
          date: e.date,
          jurisdiction: "AB",
          km: 0,
          fuelLitres: Number(e.litres||0),
          fuelCost: Number(e.amount||0),
          quarter: (() => { const d = new Date(e.date); const q = Math.floor(d.getMonth()/3)+1; return `Q${q}-${d.getFullYear()}`; })(),
        }));
        const iftaData = [...iftaStored, ...expFuelEntries].filter(e=>inRange(e.date));
        const byJur = {};
        iftaData.forEach(e=>{
          if(!byJur[e.jurisdiction]) byJur[e.jurisdiction]={km:0,fuel:0};
          byJur[e.jurisdiction].km += Number(e.km||0);
          byJur[e.jurisdiction].fuel += Number(e.fuelLitres||0);
        });
        const totalKm = iftaData.reduce((s,e)=>s+Number(e.km||0),0);
        const totalFuel = iftaData.reduce((s,e)=>s+Number(e.fuelLitres||0),0);

        doc.setFont("helvetica","bold"); doc.setFontSize(10);
        doc.setFillColor(240,244,255);
        doc.rect(margin,y-3,W-margin*2,8,"F");
        doc.setTextColor(36,59,110);
        text("JURISDICTION", margin+2, y+2);
        text("KM", margin+80, y+2);
        text("FUEL (L)", margin+110, y+2);
        text("ALLOCATED FUEL", margin+140, y+2, {align:"left"});
        y+=8; doc.setTextColor(30,30,30);

        Object.entries(byJur).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([jur,data]) => {
          checkPage(8);
          const allocated = (totalFuel>0 && totalKm>0)?(data.km/totalKm)*totalFuel:totalFuel>0?data.fuel:0;
          doc.setFont("helvetica","normal"); doc.setFontSize(9);
          text(jur, margin+2, y);
          text(data.km.toLocaleString(), margin+80, y);
          text(data.fuel.toFixed(1)+"L", margin+110, y);
          text(allocated.toFixed(1)+"L", margin+140, y);
          y+=5; hLine(y,[235,235,235]); y+=2;
        });

        y+=4;
        doc.setFont("helvetica","bold"); doc.setFontSize(10);
        text("TOTALS", margin+2, y);
        text(totalKm.toLocaleString()+" km", margin+80, y);
        text(totalFuel.toFixed(1)+"L", margin+110, y);
        y+=8;
        text(`Average Fuel Economy: ${totalFuel>0?(totalKm/totalFuel).toFixed(2):"—"} km/L`, margin, y); y+=6;
        if(iftaData.length===0) { y-=10; doc.setFontSize(10); doc.setFont("helvetica","normal"); text("No IFTA data recorded for this period.", margin, y); }
      }

      // Footer
      const totalPages = doc.getNumberOfPages();
      for(let i=1;i<=totalPages;i++){
        doc.setPage(i);
        doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(150,150,150);
        hLine(275,[200,200,200]);
        doc.text("TruckPilot · truckpilot.ca · Generated " + new Date().toLocaleDateString("en-CA"), margin, 280);
        doc.text(`Page ${i} of ${totalPages}`, W-margin, 280, {align:"right"});
      }

      const fileName = `TruckPilot-${type}-${periodLabel.replace(/ /g,"-")}.pdf`;
      doc.save(fileName);
    } catch(e) {
      alert("Error generating PDF: " + e.message);
    }
    setGenerating(null);
  };

  const money = (v) => `$${Number(v||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const REPORTS = [
    { id:"income", icon:"📊", title:"Income & Expense Statement", desc:"Revenue, expenses and net profit summary", color:"#243B6E" },
    { id:"tax", icon:"🗂", title:"CRA T2125 Tax Report", desc:"Statement of business income for CRA filing", color:"#166534" },
    ...(isOwner ? [{ id:"payroll", icon:"💵", title:"Payroll Summary", desc:"Driver pay breakdown for the period", color:"#1e3a5f" }] : []),
    { id:"ifta", icon:"⛽", title:"IFTA Fuel Tax Report", desc:"Jurisdiction fuel summary for IFTA filing", color:"#92400e" },
  ];

  return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">📋 Financial Reports</div>
        <div className="slt-hero-sub">Professional PDF reports for tax, payroll and compliance</div>
      </div>
      <div className="slt-container">

        {/* Period selector */}
        <div className="slt-card" style={{marginBottom:16}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,marginBottom:12,color:"#243B6E"}}>📅 Report Period</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {[["year","Full Year"],["q1","Q1"],["q2","Q2"],["q3","Q3"],["q4","Q4"]].map(([v,l])=>(
              <button key={v} onClick={()=>setPeriod(v)}
                style={{padding:"7px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                  background:period===v?"#243B6E":"#F0F4FF",color:period===v?"#fff":"#243B6E"}}>
                {l}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,fontWeight:600,color:"#555"}}>Year:</span>
            <select value={year} onChange={e=>setYear(e.target.value)}
              style={{padding:"6px 12px",borderRadius:8,border:"1.5px solid #e0e0e0",fontSize:13,fontWeight:600}}>
              {["2026","2025","2024","2023"].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Debug info */}
        <div style={{fontSize:11,color:"#888",marginBottom:8,padding:"8px 12px",background:"#f0f0f0",borderRadius:8}}>
          Loads in range: {filteredLoads.length} · Expenses: {filteredExp.length} · Gross: {money(grossRevenue)} · DriverPay: {money(driverPay)} · WaitPay: {money(waitPay)} · Expenses$: {money(totalExpenses)}
        </div>

        {/* Summary card */}
        <div style={{borderRadius:18,background:"#243B6E",padding:"18px 20px",marginBottom:16,color:"#fff"}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
            {periodLabel} Summary
          </div>
          <div style={{display:"grid",gridTemplateColumns:isOwner?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10}}>
            {[
              {label:"Gross Revenue",val:money(isOwner?grossRevenue+waitPay:totalIncome)},
              ...(isOwner?[{label:"Driver Pay",val:`(${money(driverPay)})`,green:false}]:[]),
              {label:"Expenses",val:money(totalExpenses)},
              {label:"Net Profit",val:money(netProfit),green:netProfit>=0},
            ].map(s=>(
              <div key={s.label} style={{textAlign:"center",background:"rgba(255,255,255,.1)",borderRadius:10,padding:"10px 6px"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginBottom:4}}>{s.label}</div>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:18,fontWeight:900,
                  color:s.green===false?"#ff8a80":s.green?"#69f0ae":"#fff"}}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report cards */}
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:14,marginBottom:10,color:"#243B6E"}}>
          📥 Download Reports
        </div>
        {REPORTS.map(r=>(
          <div key={r.id} className="slt-card" style={{marginBottom:10,borderLeft:`4px solid ${r.color}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:12,background:r.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                  {r.icon}
                </div>
                <div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:"#1A1A1A"}}>{r.title}</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>{r.desc}</div>
                </div>
              </div>
              <button onClick={()=>generatePDF(r.id)} disabled={!!generating}
                style={{padding:"10px 16px",borderRadius:12,border:"none",background:r.color,color:"#fff",
                  fontWeight:800,fontSize:12,cursor:generating?"wait":"pointer",whiteSpace:"nowrap",opacity:generating===r.id?0.7:1}}>
                {generating===r.id?"⏳ Generating...":"⬇️ PDF"}
              </button>
            </div>
          </div>
        ))}

        <div style={{borderRadius:12,background:"#FFF8E1",padding:"12px 16px",marginTop:8,fontSize:12,color:"#F57C00",fontWeight:600}}>
          ⚠️ These reports are for reference only. Always consult a CRA-certified accountant before filing taxes.
        </div>

      </div>
    </div>
  );
}

function TaxTab({ session, isOwner, allLoads=[] , goBack}) {
  const curYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(curYear);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(`${curYear}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(`${curYear}-12-31`);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [sbExpenses, setSbExpenses] = useState([]);
  const [expandedCat, setExpandedCat] = useState(null);
  const [fuelLogEntries, setFuelLogEntries] = useState([]);

  useEffect(() => {
    sbGetExpenses(session.uid).then(data => {
      if (data && data.length > 0) setSbExpenses(data);
    }).catch(() => {});
    // Owner: fetch all fleet fuel log entries
    if (isOwner) {
      const fetchFleetFuelLogs = async () => {
        try {
          // Get own fuel logs
          const own = await sbGetFuelLog(session.uid);
          // Get fleet driver fuel logs
          const { data: fleetDrivers } = await sb.from("driver_fleets").select("driver_uid, driver_name, joined_at, left_at").eq("owner_uid", session.uid);
          let all = [...own.map(e => ({ ...e, driverName: "Owner" }))];
          if (fleetDrivers && fleetDrivers.length > 0) {
            for (const d of fleetDrivers) {
              const driverLogs = await sbGetFuelLog(d.driver_uid);
              all = [...all, ...driverLogs.map(e => ({ ...e, driverName: d.driver_name || d.driver_uid }))];
            }
          }
          setFuelLogEntries(all);
        } catch(e) {}
      };
      fetchFleetFuelLogs();
    }
  }, [session.uid, isOwner]);

  // Merge localStorage + Supabase expenses, deduplicate by id
  const allExpenses = (() => {
    const local = getStored(expensesKey(session.uid));
    const merged = [...local];
    sbExpenses.forEach(se => {
      if (!merged.find(e => e.id === se.id)) merged.push(se);
    });
    // Load fuel = owner/business expense only — never shown to drivers
    if (isOwner) {
      allLoads.filter(l => Number(l.fuelTotal) > 0).forEach(l => {
        const fuelId = `fuel-${l.id}`;
        if (!merged.find(e => e.id === fuelId)) {
          merged.push({
            id: fuelId, loadRef: l.id, category: "fuel",
            amount: Number(l.fuelTotal),
            description: `Fuel – ${l.location||"Load"} (${l.fuelLitres||"?"}L @ $${Number(l.fuelPricePerLitre||0).toFixed(3)}/L)`,
            date: l.date || todayStr(), source: "load",
            taxCategory: "Line 9220", taxLabel: "Fuel & Oil", ownerExpense: true
          });
        }
      });
      // Add fuel log entries from fleet drivers — use transaction date (date field)
      fuelLogEntries.forEach(f => {
        const fuelId = `fuellog-${f.id}`;
        if (!merged.find(e => e.id === fuelId)) {
          merged.push({
            id: fuelId, category: "fuel",
            amount: Number(f.total || 0),
            description: `⛽ Fuel Log – ${f.truck_number || "Truck"} · ${f.litres}L @ $${Number(f.price_per_litre||0).toFixed(3)}/L${f.driverName ? ` · ${f.driverName}` : ""}${f.location ? ` · ${f.location}` : ""}`,
            date: f.date || todayStr(), source: "fuel_log",
            taxCategory: "Line 9220", taxLabel: "Fuel & Oil", ownerExpense: true,
            driverName: f.driverName,
          });
        }
      });
    }
    return merged;
  })();

  const expenses = allExpenses;
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (useCustomRange) return dateStr >= rangeStart && dateStr <= rangeEnd;
    return dateStr.startsWith(year);
  };

  // Driver-only view: simplified personal expense summary
  // Drivers only see expenses THEY manually added — load fuel is owner/business only
  const driverExpenses = allExpenses.filter(e => e.source !== "load" && !e.ownerExpense && e.expenseType !== "business");

  if (!isOwner) {
    const TAX_CATS_DRIVER = [
      { id:"fuel",           label:"Fuel & Oil",              icon:"⛽", taxLine:"Line 9220", color:C.orange },
      { id:"meals",          label:"Meals (50% deductible)",  icon:"🍽", taxLine:"Line 8523", color:C.green  },
      { id:"lodging",        label:"Accommodation / Travel",  icon:"🏨", taxLine:"Line 9200", color:"#8D6E63"},
      { id:"tolls",          label:"Tolls & Parking",         icon:"🛣", taxLine:"Line 9281", color:C.teal   },
      { id:"tools_supplies", label:"Tools & Supplies",        icon:"🧰", taxLine:"Line 9270", color:C.blue   },
      { id:"safety",         label:"Safety Gear",             icon:"🦺", taxLine:"Line 9270", color:"#EF6C00"},
      { id:"union_dues",     label:"Union / Dues",            icon:"🤝", taxLine:"Line 9270", color:"#546E7A"},
      { id:"telephone",      label:"Phone & Internet",        icon:"📱", taxLine:"Line 9220", color:"#00897B"},
      { id:"medical",        label:"Medical / Drug Plan",     icon:"💊", taxLine:"Line 9270", color:"#D32F2F"},
      { id:"other",          label:"Other",                   icon:"📦", taxLine:"Line 9270", color:"#546E7A"},
    ];
    const yearExp = allExpenses.filter(e => e.date && inRange(e.date) && !e.ownerExpense && e.expenseType !== "business" && e.source !== "load");
    const byCategory = TAX_CATS_DRIVER.map(cat => ({
      ...cat,
      total: yearExp.filter(e => e.category === cat.id).reduce((s, e) => s + Number(e.amount || 0), 0),
    })).filter(c => c.total > 0);
    const grandTotal = byCategory.reduce((s, c) => s + c.total, 0);
    return (
      <div className="slt-page slt-page-enter">
      {goBack && <BackButton onBack={goBack} label="Back" />}
        <div className="slt-hero" style={{ background: `linear-gradient(135deg, #1B5E20, #2E7D32)` }}>
          <div className="slt-hero-title">🗂 My Tax Summary</div>
          <div className="slt-hero-sub">Your personal deductible expenses — {year}</div>
        </div>
        <div className="slt-container-sm">
          <div className="slt-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setUseCustomRange(false)} className="slt-btn-secondary"
                style={{ flex:1, background: !useCustomRange ? C.green : "#fff", color: !useCustomRange ? "#fff" : C.textMed, borderColor: !useCustomRange ? C.green : C.border, padding:"8px" }}>
                By Year
              </button>
              <button onClick={() => setUseCustomRange(true)} className="slt-btn-secondary"
                style={{ flex:1, background: useCustomRange ? C.green : "#fff", color: useCustomRange ? "#fff" : C.textMed, borderColor: useCustomRange ? C.green : C.border, padding:"8px" }}>
                Custom Range
              </button>
            </div>
            {!useCustomRange
              ? <div><label className="slt-label">Tax Year</label>
                  <select className="slt-input" value={year} onChange={e => setYear(e.target.value)}>
                    {["2026","2025","2024","2023","2022"].map(y => <option key={y}>{y}</option>)}
                  </select>
                </div>
              : <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><label className="slt-label">From</label><input type="date" className="slt-input" value={rangeStart} onChange={e => setRangeStart(e.target.value)}/></div>
                  <div><label className="slt-label">To</label><input type="date" className="slt-input" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}/></div>
                </div>
            }
          </div>
          {byCategory.length === 0
            ? <div className="slt-card" style={{ textAlign:"center", padding:40, color:C.textLight }}>No expenses logged for {year}</div>
            : <>
              {byCategory.map(cat => {
                const catItems2 = yearExp.filter(e=>e.category===cat.id);
                const isOpen2 = expandedCat===cat.id;
                return (
                <div key={cat.id} className="slt-card" style={{ marginBottom:10, borderLeft:`4px solid ${cat.color}`, cursor:"pointer" }}
                  onClick={()=>setExpandedCat(isOpen2?null:cat.id)}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{flex:1}}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{cat.icon} {cat.label}</div>
                      <div style={{ fontSize:11, color:C.textLight, marginTop:2 }}>{cat.taxLine}</div>
                      {cat.id === "meals" && <div style={{ fontSize:11, color:C.orange, marginTop:2 }}>⚠️ 50% deductible = {fmtC(cat.total * 0.5)}</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:cat.color }}>{fmtC(cat.total)}</div>
                      <div style={{fontSize:11,color:cat.color}}>{isOpen2?"▲":"▼"} details</div>
                    </div>
                  </div>
                  {isOpen2&&catItems2.length>0&&(
                    <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${cat.color}30`}}>
                      {catItems2.map((e,i)=>(
                        <div key={e.id||i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<catItems2.length-1?`1px solid ${C.border}`:"none"}}>
                          <div>
                            <div style={{fontSize:12.5,fontWeight:600,color:C.textDark}}>{e.description||e.note||e.merchant||cat.label}</div>
                            <div style={{fontSize:11,color:C.textLight}}>{e.date}{e.merchant?` · ${e.merchant}`:""}</div>
                          </div>
                          <div style={{fontWeight:800,fontSize:13,color:cat.color,marginLeft:10}}>{fmtC(Number(e.amount||0))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
              <div className="slt-card" style={{ background:`linear-gradient(135deg,${C.navy},#1B3A5C)`, color:"#fff", marginTop:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15 }}>Total Deductions</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:22 }}>{fmtC(grandTotal)}</div>
                </div>
                <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>Show this to your accountant or tax preparer</div>
                <button onClick={() => {
                  const rows = byCategory.map(c => `<tr>
                    <td style="padding:10px 12px">${c.icon} ${c.label}</td>
                    <td style="padding:10px 12px;color:#555;font-size:12px">${c.taxLine}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:700;color:#243B6E">$${c.total.toFixed(2)}</td>
                    <td style="padding:10px 12px;font-size:12px;color:#243B6E">${c.id==="meals"?`50% rule → $${(c.total*0.5).toFixed(2)} deductible`:""}</td>
                  </tr>`).join("");
                  const html = `<div class="header"><div class="brand">🚛 TruckPilot</div><div><div style="font-size:20px;font-weight:800">Personal Tax Summary</div><div style="color:#666">${session.fullName||session.name} · Tax Year ${year}</div></div></div>
                    <div class="summary"><div class="summary-card"><div class="label">Total Expenses</div><div class="value red">$${grandTotal.toFixed(2)}</div></div><div class="summary-card"><div class="label">Meals Adj (50%)</div><div class="value" style="color:#243B6E">-$${(byCategory.find(c=>c.id==="meals")?.total*0.5||0).toFixed(2)}</div></div><div class="summary-card"><div class="label">Net Deductible</div><div class="value green">$${(grandTotal-(byCategory.find(c=>c.id==="meals")?.total*0.5||0)).toFixed(2)}</div></div></div>
                    <h2>Expense Breakdown by CRA Category</h2>
                    <table style="table-layout:fixed;width:100%">
                      <colgroup>
                        <col style="width:35%"/>
                        <col style="width:25%"/>
                        <col style="width:20%"/>
                        <col style="width:20%"/>
                      </colgroup>
                      <thead><tr><th>Category</th><th>CRA Line</th><th style="text-align:right">Amount</th><th>Notes</th></tr></thead>
                      <tbody>${rows}</tbody>
                      <tr class="total">
                        <td colspan="2"><strong>NET DEDUCTIBLE TOTAL</strong></td>
                        <td style="text-align:right"><strong>$${(grandTotal-(byCategory.find(c=>c.id==="meals")?.total*0.5||0)).toFixed(2)}</strong></td>
                        <td></td>
                      </tr>
                    </table>
                    <div style="background:#FFF8E1;border:1.5px solid #FFB300;border-radius:8px;padding:14px;font-size:12px;color:#7a5f00;margin-top:20px">⚠️ Retain all receipts for 6 years. Meals are 50% deductible per CRA rules. Consult a qualified tax preparer for your return.</div>`;
                  downloadPDF(html, `DriverTax_${session.fullName||session.name}_${year}`.replace(/\s+/g,"_"), session);
                }} style={{ marginTop:12, width:"100%", padding:"10px", border:"none", borderRadius:9, background:"rgba(255,255,255,0.2)", color:"#fff", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, fontSize:13 }}>⬇ Download PDF Report</button>
              </div>
            </>
          }
        </div>
      </div>
    );
  }

  // ── Date Range Picker (replaces year-only selector) ────────────────────────
  const DateRangePicker = () => (
    <div className="slt-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setUseCustomRange(false)} className="slt-btn-secondary"
          style={{ flex:1, background: !useCustomRange ? C.blue : "#fff", color: !useCustomRange ? "#fff" : C.textMed, borderColor: !useCustomRange ? C.blue : C.border, padding:"8px" }}>
          By Year
        </button>
        <button onClick={() => setUseCustomRange(true)} className="slt-btn-secondary"
          style={{ flex:1, background: useCustomRange ? C.blue : "#fff", color: useCustomRange ? "#fff" : C.textMed, borderColor: useCustomRange ? C.blue : C.border, padding:"8px" }}>
          Custom Range
        </button>
      </div>
      {!useCustomRange
        ? <div><label className="slt-label">Tax Year</label>
            <select className="slt-input" value={year} onChange={e => setYear(e.target.value)}>
              {["2026","2025","2024","2023","2022"].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        : <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label className="slt-label">From</label><input type="date" className="slt-input" value={rangeStart} onChange={e => setRangeStart(e.target.value)}/></div>
            <div><label className="slt-label">To</label><input type="date" className="slt-input" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}/></div>
          </div>
      }
    </div>
  );

  const TAX_CATS = [
    { id:"fuel",           label:"Fuel & Oil",               icon:"⛽", taxLine:"Line 9220 – Fuel costs",          color:C.orange  },
    { id:"maintenance",    label:"Repairs & Maintenance",    icon:"🔧", taxLine:"Line 9270 – Repairs",             color:C.red     },
    { id:"insurance",      label:"Insurance",                icon:"🛡", taxLine:"Line 9910 – Insurance premiums",  color:C.blue    },
    { id:"permits",        label:"Licenses & Renewals",      icon:"📋", taxLine:"Line 9270 – Licences & fees",    color:C.purple  },
    { id:"telephone",      label:"Telephone & Internet",     icon:"📱", taxLine:"Line 9220 – Phone / internet",   color:"#00897B" },
    { id:"rent",           label:"Rent / Lease",             icon:"🏢", taxLine:"Line 9200 – Rent & leasing",     color:"#5C6BC0" },
    { id:"meals",          label:"Meals & Entertainment",    icon:"🍽", taxLine:"Line 8523 – Meals (50% rule)",   color:C.green   },
    { id:"lodging",        label:"Accommodation / Travel",   icon:"🏨", taxLine:"Line 9200 – Travel costs",       color:"#8D6E63" },
    { id:"tolls",          label:"Tolls & Parking",          icon:"🛣", taxLine:"Line 9281 – Other expenses",     color:C.teal    },
    { id:"union_dues",     label:"Union / Association Dues", icon:"🤝", taxLine:"Line 9270 – Professional fees",  color:"#546E7A" },
    { id:"tools_supplies", label:"Tools & Supplies",         icon:"🧰", taxLine:"Line 9270 – Supplies",           color:C.orange  },
    { id:"safety",         label:"Safety Gear & Clothing",   icon:"🦺", taxLine:"Line 9270 – Protective clothing",color:"#EF6C00" },
    { id:"accounting",     label:"Accounting / Legal Fees",  icon:"📂", taxLine:"Line 8860 – Professional fees",  color:"#6D4C41" },
    { id:"advertising",    label:"Advertising & Marketing",  icon:"📣", taxLine:"Line 8520 – Advertising",        color:"#E91E63" },
    { id:"bank_fees",      label:"Bank & Interest Charges",  icon:"🏦", taxLine:"Line 8710 – Interest & bank",    color:"#37474F" },
    { id:"medical",        label:"Medical / Drug Plan",      icon:"💊", taxLine:"Line 9270 – Medical premiums",   color:"#D32F2F" },
    { id:"other",          label:"Other Operating",          icon:"📦", taxLine:"Line 9270 – Other expenses",     color:"#546E7A" },
  ];

  const yearExp = allExpenses.filter(e => e.date && inRange(e.date));
  const byCategory = TAX_CATS.map(cat => ({
    ...cat,
    total: yearExp.filter(e => e.category === cat.id).reduce((s, e) => s + Number(e.amount || 0), 0),
    count: yearExp.filter(e => e.category === cat.id).length,
  }));
  const grandTotal = byCategory.reduce((s, c) => s + c.total, 0);
  const mealsDeductible = byCategory.find(c => c.id === "meals")?.total * 0.5 || 0;
  const adjustedTotal = grandTotal - (byCategory.find(c => c.id === "meals")?.total * 0.5 || 0);

  const buildHtml = () => {
    const ownerName = session.companyName || session.fullName || session.name || "Owner Operator";
    const generatedDate = new Date().toLocaleDateString("en-CA", { year:"numeric", month:"long", day:"numeric" });
    const itemizedSections = byCategory.filter(c => c.total > 0).map(cat => {
      const items = yearExp.filter(e => e.category === cat.id);
      const itemRows = items.map((e,i) => `<tr style="background:${i%2===0?"#fff":"#f9fafb"}"><td style="padding:6px 10px;color:#666;font-size:12px">${e.date||"—"}</td><td style="padding:6px 10px;font-size:12px">${e.description||"—"}</td><td style="padding:6px 10px;text-align:right;font-weight:600;font-size:12px">$${Number(e.amount||0).toFixed(2)}</td></tr>`).join("");
      return `<div style="margin-bottom:24px;page-break-inside:avoid"><div style="background:${cat.color}18;border-left:4px solid ${cat.color};padding:8px 14px;display:flex;justify-content:space-between;align-items:center"><div><span style="font-size:15px;margin-right:8px">${cat.icon}</span><strong style="font-size:13px;color:#1a2a3a">${cat.label}</strong><span style="font-size:11px;color:#888;margin-left:10px">${cat.taxLine}</span></div><strong style="font-size:15px;color:${cat.color}">$${cat.total.toFixed(2)}</strong></div><table style="width:100%;border-collapse:collapse;border:1px solid #e8eaed;border-top:none"><thead><tr style="background:#f1f3f5"><th style="padding:6px 10px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;width:100px">Date</th><th style="padding:6px 10px;text-align:left;font-size:11px;color:#666;text-transform:uppercase">Description</th><th style="padding:6px 10px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;width:90px">Amount</th></tr></thead><tbody>${itemRows}</tbody><tfoot><tr style="background:#f8f9fa;border-top:2px solid #dee2e6"><td colspan="2" style="padding:7px 10px;font-weight:800;font-size:12px">${cat.label} Subtotal${cat.id==="meals"?` (50% deductible = $${(cat.total*0.5).toFixed(2)})`:"" }</td><td style="padding:7px 10px;text-align:right;font-weight:800;font-size:13px;color:${cat.color}">$${cat.total.toFixed(2)}</td></tr></tfoot></table></div>`;
    }).join("");
    const summaryRows = byCategory.filter(c => c.total > 0).map(c =>
      `<tr><td style="padding:8px 12px">${c.icon} ${c.label}</td><td style="padding:8px 12px;color:#666;font-size:12px">${c.taxLine}</td><td style="padding:8px 12px;text-align:center;color:#888">${c.count}</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:${c.color}">$${c.total.toFixed(2)}</td></tr>`
    ).join("");
    return `<!DOCTYPE html><html><head><title>Tax Summary ${year} — ${ownerName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a2a3a;background:#fff}.page{max-width:820px;margin:0 auto;padding:36px 40px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.page{padding:20px 24px}}.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #243B6E;margin-bottom:28px}.badge{display:inline-block;background:#243B6E;color:#fff;font-size:10px;font-weight:800;letter-spacing:1px;padding:3px 10px;border-radius:20px;text-transform:uppercase;margin-bottom:6px}h1{font-size:22px;color:#0A1628;margin-bottom:4px}.meta{font-size:12px;color:#666;line-height:1.8}.summary-box{background:#f8faff;border:1.5px solid #c5d8f5;border-radius:10px;padding:20px 24px;margin-bottom:28px}.summary-box h2{font-size:14px;color:#243B6E;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px}.totals-row{display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap}.total-item{flex:1;min-width:140px;background:#fff;border-radius:8px;border:1px solid #e0e8f5;padding:12px 16px;text-align:center}.total-item .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.total-item .value{font-size:20px;font-weight:800}.section-title{font-size:15px;font-weight:800;color:#0A1628;margin:28px 0 14px;border-bottom:2px solid #e8eaed;padding-bottom:6px}.signature-block{margin-top:40px;padding-top:24px;border-top:2px dashed #ccc;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sig-line{border-bottom:1px solid #333;height:40px;margin-bottom:6px}.sig-label{font-size:11px;color:#666}.disclaimer{background:#FFF8E1;border:1.5px solid #FFB300;border-radius:8px;padding:14px 18px;font-size:12px;color:#7a5f00;margin-top:24px;line-height:1.6}.footer{margin-top:28px;padding-top:12px;border-top:1px solid #e8eaed;font-size:10px;color:#aaa;display:flex;justify-content:space-between}</style></head><body><div class="page"><div class="header"><div><div class="badge">Tax Export</div><h1>🚛 Tax Expense Summary</h1><div class="meta"><strong>Owner Operator:</strong> ${ownerName}<br><strong>Tax Year:</strong> ${year}<br><strong>Report Type:</strong> CRA T2125 / T777<br><strong>Generated:</strong> ${generatedDate}</div></div><div style="text-align:right"><div style="font-size:11px;color:#888;margin-bottom:6px">Total Deductible</div><div style="font-size:36px;font-weight:900;color:#243B6E">$${adjustedTotal.toFixed(2)}</div><div style="font-size:11px;color:#888">${yearExp.length} entries · ${year}</div></div></div><div class="summary-box"><h2>Summary Totals</h2><div class="totals-row"><div class="total-item"><div class="label">Total Expenses</div><div class="value" style="color:#D32F2F">$${grandTotal.toFixed(2)}</div></div><div class="total-item"><div class="label">Meals (50% adj)</div><div class="value" style="color:#F57C00">-$${mealsDeductible.toFixed(2)}</div></div><div class="total-item"><div class="label">Net Deductible</div><div class="value" style="color:#2E7D32">$${adjustedTotal.toFixed(2)}</div></div><div class="total-item"><div class="label">Entries</div><div class="value" style="color:#243B6E">${yearExp.length}</div></div></div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#e8f0fe"><th style="padding:8px 12px;text-align:left">Category</th><th style="padding:8px 12px;text-align:left;color:#666">CRA Line</th><th style="padding:8px 12px;text-align:center;color:#666">Entries</th><th style="padding:8px 12px;text-align:right">Amount</th></tr></thead><tbody>${summaryRows}</tbody><tfoot><tr style="background:#e8f5e9;border-top:2px solid #4CAF50"><td colspan="3" style="padding:10px 12px;font-weight:800;font-size:14px">NET DEDUCTIBLE TOTAL</td><td style="padding:10px 12px;text-align:right;font-weight:900;font-size:16px;color:#2E7D32">$${adjustedTotal.toFixed(2)}</td></tr></tfoot></table></div><div class="section-title">Itemized Expense Detail</div>${itemizedSections||'<p style="color:#888;font-size:13px;padding:12px 0">No expenses recorded for this year.</p>'}<div class="signature-block"><div><div class="sig-line"></div><div class="sig-label">Owner Operator Signature &amp; Date</div></div><div><div class="sig-line"></div><div class="sig-label">Accountant / CPA Signature &amp; Date</div></div></div><div class="disclaimer">⚠️ <strong>Tax Disclaimer:</strong> This report is for your accountant's reference only. Meals are subject to the 50% limitation rule. Work with a qualified CPA for your actual CRA filing. Retain all original receipts for 6 years.</div><div class="footer"><span>TruckPilot · Confidential Tax Document</span><span>Generated ${generatedDate} · Tax Year ${year}</span></div></div></body></html>`;
  };

  const exportTax = () => {
    const html = buildHtml();
    setPreviewHtml(html);
    setShowPreview(true);
  };

  const downloadTax = () => {
    const html = buildHtml();
    // Extract body content from full HTML for the universal helper
    const bodyContent = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TaxSummary_${year}_${(session.fullName||session.name||"Owner").replace(/\s+/g,"_")}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => y.toString());

  return (
    <div className="slt-page">
      {showPreview && (
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column"}}>
          <div style={{background:C.navy,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,gap:10}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:15,color:"#fff"}}>🧾 Tax Summary {year}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={downloadTax} className="slt-btn-primary" style={{padding:"8px 14px",fontSize:12}}>⬇ Download</button>
              <button onClick={()=>setShowPreview(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",fontSize:13,cursor:"pointer",fontWeight:700}}>✕ Close</button>
            </div>
          </div>
          <iframe srcDoc={previewHtml} style={{flex:1,border:"none",background:"#fff"}} title="Tax Export Preview" />
        </div>
      )}
      <div className="slt-hero">
        <div className="slt-hero-title">🧾 Tax Export</div>
        <div className="slt-hero-sub">Auto-categorized expenses · CRA T2125 ready</div>
      </div>
      <div className="slt-container">
        <DateRangePicker />
        <div className="slt-card" style={{ marginBottom: 18 }}>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button className="slt-btn-primary" style={{ flex:1, padding:"11px 20px" }} onClick={exportTax}>👁 Preview PDF</button>
            <button className="slt-btn-secondary" style={{ flex:1, padding:"11px 18px" }} onClick={downloadTax}>⬇ Download</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 20 }}>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.red}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>TOTAL EXPENSES</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: C.red }}>{fmtC(grandTotal)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.green}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>TAX DEDUCTIBLE</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: C.green }}>{fmtC(adjustedTotal)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.orange}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>MEALS (50%)</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: C.orange }}>{fmtC(mealsDeductible)}</div>
          </div>
          <div className="slt-card-sm" style={{ borderTop: `4px solid ${C.blue}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 700, marginBottom: 4 }}>ENTRIES</div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: C.blue }}>{yearExp.length}</div>
          </div>
        </div>

        {/* Category breakdown — clickable rows */}
        <div className="slt-card">
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, marginBottom:14 }}>
            Expense Breakdown — {useCustomRange?`${rangeStart} → ${rangeEnd}`:year}
          </div>
          {byCategory.map(cat => {
            const catItems = yearExp.filter(e=>e.category===cat.id);
            const isOpen = expandedCat===cat.id;
            return (
              <div key={cat.id}>
                <div onClick={()=>cat.count>0&&setExpandedCat(isOpen?null:cat.id)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:`1px solid ${C.border}`, cursor:cat.count>0?"pointer":"default", background:isOpen?cat.color+"08":"transparent", borderRadius:isOpen?8:0, paddingLeft:isOpen?6:0, transition:"background 0.15s" }}>
                  <div style={{ width:38, height:38, borderRadius:9, background:cat.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{cat.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13.5 }}>{cat.label}</div>
                    <div style={{ fontSize:11.5, color:C.textLight }}>{cat.taxLine}</div>
                    {cat.id==="meals"&&cat.total>0&&<div style={{ fontSize:11.5, color:C.orange }}>50% deductible = {fmtC(cat.total*0.5)}</div>}
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:cat.total>0?cat.color:C.textLight }}>{fmtC(cat.total)}</div>
                    <div style={{ fontSize:11, color:cat.count>0?cat.color:C.textLight }}>{cat.count} entries {cat.count>0?(isOpen?"▲":"▼"):""}</div>
                  </div>
                </div>
                {isOpen&&catItems.length>0&&(
                  <div style={{ background:cat.color+"08", borderRadius:10, padding:"10px 12px", marginBottom:8, border:`1px solid ${cat.color}20` }}>
                    {catItems.map((e,i)=>(
                      <div key={e.id||i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 0", borderBottom:i<catItems.length-1?`1px solid ${cat.color}15`:"none" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:C.textDark }}>{e.description||e.note||e.merchant||cat.label}</div>
                          <div style={{ fontSize:11, color:C.textLight, marginTop:2 }}>{e.date}{e.merchant?` · ${e.merchant}`:""}</div>
                          {e.source==="load"&&<span style={{ fontSize:10, color:C.blue, background:C.blueLight, borderRadius:5, padding:"1px 6px", marginTop:2, display:"inline-block" }}>🔗 From Load</span>}
                        </div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14, color:cat.color, marginLeft:12, flexShrink:0 }}>{fmtC(Number(e.amount||0))}</div>
                      </div>
                    ))}
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, paddingTop:8, borderTop:`2px solid ${cat.color}30` }}>
                      <span style={{ fontSize:12, fontWeight:800, color:cat.color }}>Subtotal — {cat.count} entries</span>
                      <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:15, color:cat.color }}>{fmtC(cat.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"14px 0", marginTop:4 }}>
            <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16 }}>Adjusted Deductible Total</span>
            <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:C.green }}>{fmtC(adjustedTotal)}</span>
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
function EmergencyTab({ goBack }) {
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
      {goBack && <BackButton onBack={goBack} label="Back" />}
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero" style={{ background: `linear-gradient(135deg,#B71C1C,#D32F2F,#E53935)` }}>
        <div className="slt-hero-title">🚨 Emergency Roadside Help</div>
        <div className="slt-hero-sub">Find mechanics, tire shops, tow trucks near you</div>
      </div>
      <div className="slt-container">
        {/* Emergency contacts — always visible */}
        <div className="slt-card" style={{ borderTop: `4px solid ${C.red}`, marginBottom: 18 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: C.red, marginBottom: 14 }}>📞 Emergency Contacts</div>
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
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 14 }}>📍 Find Nearby Services</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {SEARCH_TYPES.map(s => (
              <button key={s.id} onClick={() => setSearchType(s.id)} className="slt-btn-secondary"
                style={{ background: searchType === s.id ? C.red : "#fff", color: searchType === s.id ? "#fff" : C.textMed, borderColor: searchType === s.id ? C.red : C.border, padding: "9px 14px" }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <button onClick={find} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.red},#B71C1C)`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Barlow',sans-serif" }}>
            📍 Find {SEARCH_TYPES.find(s => s.id === searchType)?.label} Near Me
          </button>
        </div>

        {loading && <div className="slt-card" style={{ textAlign: "center", padding: "32px", color: C.blue, fontWeight: 700 }}>🔍 Locating services…</div>}
        {error && <div style={{ background: "#FFEBEE", border: `1px solid ${C.red}30`, borderRadius: 12, padding: "14px 18px", color: C.red, marginBottom: 14 }}>{error}</div>}

        {results.map((r, i) => (
          <div key={r.id} className="slt-card" style={{ padding: "14px 18px", borderLeft: `4px solid ${C.red}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 15 }}>{i + 1}. {r.name}</div>
                {r.phone && <div style={{ fontSize: 13, color: C.blue, marginTop: 2 }}>📞 {r.phone}</div>}
              </div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 800, color: C.orange }}>{r.dist} km</div>
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
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#fff", marginBottom: 12 }}>🦺 Breakdown Safety Checklist</div>
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


// ═══════════════════════════════════════════════════════════════════
// NEW FEATURE MODULES — TruckPilot v3
// All 10 new features appended/integrated
// ═══════════════════════════════════════════════════════════════════

// ─── IFTA Tab ─────────────────────────────────────────────────────
// Feature 1: IFTA Tax Reporting
function InspectionTab({ session, onAlertSaved , goBack}) {
  const INSPECTION_KEY = (uid) => `tp-inspections-v1-${uid}`;
  const INSPECTION_ITEMS = [
    { id:"tires",          icon:"🔄", label:"Tires & Pressure",        group:"exterior" },
    { id:"lights",         icon:"💡", label:"All Lights Working",       group:"exterior" },
    { id:"mirrors",        icon:"🪞", label:"Mirrors & Windows",        group:"exterior" },
    { id:"brakes",         icon:"🛑", label:"Brakes",                   group:"exterior" },
    { id:"fuel",           icon:"⛽", label:"Fuel Level",               group:"exterior" },
    { id:"cab",            icon:"🚛", label:"Cab Clean & Clear",        group:"interior" },
    { id:"seatbelt",       icon:"🦺", label:"Seatbelt & Safety",        group:"interior" },
    { id:"t_tires",        icon:"🔄", label:"Trailer Tires",            group:"trailer" },
    { id:"t_lights",       icon:"💡", label:"Trailer Lights & Markers", group:"trailer" },
    { id:"t_brakes",       icon:"🛑", label:"Trailer Brakes",           group:"trailer" },
    { id:"t_kingpin",      icon:"🔩", label:"Kingpin & 5th Wheel",      group:"trailer" },
    { id:"t_doors",        icon:"🚪", label:"Trailer Doors & Seals",    group:"trailer" },
    { id:"t_frame",        icon:"🏗",  label:"Frame & Undercarriage",   group:"trailer" },
    { id:"load",           icon:"📦", label:"Load Secured",             group:"cargo" },
    { id:"straps",         icon:"🔗", label:"Straps & Chains",          group:"cargo" },
    { id:"docs",           icon:"📋", label:"Shipping Docs Present",    group:"cargo" },
  ];

  const [inspections, setInspections] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSPECTION_KEY(session.uid)) || "[]"); } catch { return []; }
  });
  const [mode, setMode] = useState("list"); // list | new
  const [type, setType] = useState("pre"); // pre | post
  const [checks, setChecks] = useState({});
  const [photos, setPhotos] = useState([]);
  const [note, setNote] = useState("");
  const [truckId, setTruckId] = useState("");
  const [viewItem, setViewItem] = useState(null);
  const fileRef = useRef();

  const trucks = getStored(trucksKey(session.ownerUid || session.uid));

  const save = () => {
    const passed = INSPECTION_ITEMS.filter(i => checks[i.id] === "pass").length;
    const failed = INSPECTION_ITEMS.filter(i => checks[i.id] === "fail").length;
    const rec = {
      id: Date.now().toString(),
      type,
      date: todayStr(),
      time: new Date().toLocaleTimeString("en-CA", { hour:"2-digit", minute:"2-digit" }),
      truckId,
      driverName: session.fullName || session.name,
      driverUid: session.uid,
      checks: { ...checks },
      photos: [...photos],
      note,
      passed,
      failed,
      total: INSPECTION_ITEMS.length,
    };
    const updated = [rec, ...inspections];
    setInspections(updated);
    localStorage.setItem(INSPECTION_KEY(session.uid), JSON.stringify(updated));

    // ── Notify owner if there are failed items ─────────────────────────────
    if (failed > 0 && session.ownerUid && session.ownerUid !== session.uid) {
      const ownerUid = session.ownerUid;
      const existingAlerts = getInspectionAlerts(ownerUid);
      const failedItems = INSPECTION_ITEMS.filter(i => checks[i.id] === "fail");
      const alert = {
        id: rec.id,
        inspectionId: rec.id,
        driverUid: session.uid,
        driverName: session.fullName || session.name,
        type: rec.type,
        date: rec.date,
        time: rec.time,
        truckId,
        failed,
        failedItems: failedItems.map(i => ({ id: i.id, icon: i.icon, label: i.label })),
        note,
        read: false,
        createdAt: new Date().toISOString(),
      };
      saveInspectionAlerts(ownerUid, [alert, ...existingAlerts]);
    }

    if (onAlertSaved) onAlertSaved();
    setMode("list");
    setChecks({}); setPhotos([]); setNote(""); setTruckId("");
  };

  const handlePhoto = (e) => {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = (ev) => setPhotos(p => [...p, { name: file.name, data: ev.target.result, ts: Date.now() }]);
      r.readAsDataURL(file);
    });
  };

  const allChecked = INSPECTION_ITEMS.every(i => checks[i.id]);
  const groups = ["exterior","interior","trailer","cargo"];
  const groupLabels = { exterior:"🚛 Truck — Exterior & Mechanical", interior:"🪑 Truck — Interior & Safety", trailer:"🔗 Trailer", cargo:"📦 Cargo & Load" };

  if (mode === "new") return (
    <div className="slt-page">
      {goBack && <BackButton onBack={goBack} label="Back" />}
      <div className="slt-hero">
        <div className="slt-hero-title">{type === "pre" ? "🔍 Pre-Trip Inspection" : "✅ Post-Trip Inspection"}</div>
        <div className="slt-hero-sub">Check each item — tap ✅ pass or ⚠️ fail</div>
      </div>
      <div className="slt-container">
        {/* Type + Truck */}
        <div className="slt-card" style={{ marginBottom:16 }}>
          <div style={{ display:"flex", gap:10, marginBottom:12 }}>
            {[["pre","🔍 Pre-Trip"],["post","✅ Post-Trip"]].map(([v,l]) => (
              <button key={v} onClick={() => setType(v)} className="slt-btn-secondary"
                style={{ flex:1, background:type===v?C.navy:"#fff", color:type===v?"#fff":C.textMed, borderColor:type===v?C.navy:C.border, fontWeight:700 }}>{l}</button>
            ))}
          </div>
          {trucks.length > 0 && (
            <div style={{ display:"flex", gap:10 }}>
              <select value={truckId} onChange={e=>setTruckId(e.target.value)} className="slt-input" style={{ flex:1 }}>
                <option value="">— Select Truck (opt) —</option>
                {trucks.map(t => <option key={t.id} value={t.id}>Truck {t.truckNumber}{t.trailerNumber?` · Trailer ${t.trailerNumber}`:""}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Checklist */}
        {groups.map(g => (
          <div key={g} className="slt-card" style={{ marginBottom:14 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, marginBottom:12, color:C.navy }}>{groupLabels[g]}</div>
            {INSPECTION_ITEMS.filter(i => i.group === g).map(item => (
              <div key={item.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{item.icon}</span>
                  <span style={{ fontSize:13, fontWeight:600 }}>{item.label}</span>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setChecks(c => ({...c, [item.id]:"pass"}))}
                    style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:800, fontSize:12,
                      background: checks[item.id]==="pass" ? C.green : "#E8F5E9", color: checks[item.id]==="pass" ? "#fff" : C.green }}>✅ OK</button>
                  <button onClick={() => setChecks(c => ({...c, [item.id]:"fail"}))}
                    style={{ padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:800, fontSize:12,
                      background: checks[item.id]==="fail" ? C.red : "#FFEBEE", color: checks[item.id]==="fail" ? "#fff" : C.red }}>⚠️ Fail</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Photos */}
        <div className="slt-card" style={{ marginBottom:14 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, marginBottom:10 }}>📸 Photo Evidence</div>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{ display:"none" }} onChange={handlePhoto} />
          <button onClick={() => fileRef.current.click()} className="slt-btn-secondary" style={{ width:"100%", marginBottom:10 }}>📷 Take / Upload Photos</button>
          {photos.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {photos.map((p,i) => (
                <div key={i} style={{ position:"relative" }}>
                  <img src={p.data} alt={p.name} style={{ width:"100%", height:80, objectFit:"cover", borderRadius:8 }} />
                  <button onClick={() => setPhotos(ps => ps.filter((_,j) => j!==i))}
                    style={{ position:"absolute", top:3, right:3, background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", borderRadius:"50%", width:20, height:20, fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="slt-card" style={{ marginBottom:16 }}>
          <label className="slt-label">Notes / Damage Observed</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} className="slt-input" rows={3} placeholder="Describe any damage, issues, or observations..." style={{ resize:"none" }} />
        </div>

        {/* Progress + Save */}
        <div style={{ background: allChecked ? "#E8F5E9" : C.blueLight, borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:700, color: allChecked ? C.green : C.blue }}>
            {INSPECTION_ITEMS.filter(i=>checks[i.id]).length} / {INSPECTION_ITEMS.length} checked
          </span>
          {!allChecked && <span style={{ fontSize:12, color:C.textMed }}>Check all items to save</span>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="slt-btn-secondary" style={{ flex:1 }} onClick={() => setMode("list")}>← Cancel</button>
          <button className="slt-btn-primary" style={{ flex:2 }} onClick={save} disabled={!allChecked}
            style={{ flex:2, opacity: allChecked?1:0.5, cursor: allChecked?"pointer":"not-allowed",
              background:`linear-gradient(135deg,${C.green},#1B5E20)`, border:"none", color:"#fff", borderRadius:10, padding:"13px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14 }}>
            🔒 Sign & Save Inspection
          </button>
        </div>
      </div>
    </div>
  );

  // View single inspection
  if (viewItem) {
    const fails = INSPECTION_ITEMS.filter(i => viewItem.checks[i.id] === "fail");
    const passes = INSPECTION_ITEMS.filter(i => viewItem.checks[i.id] === "pass");
    return (
      <div className="slt-page slt-page-enter">
        <div className="slt-hero" style={{ background: fails.length > 0 ? `linear-gradient(135deg,#B71C1C,#D32F2F)` : `linear-gradient(135deg,${C.navy},#1B3A5C)` }}>
          <div className="slt-hero-title">{viewItem.type === "pre" ? "🔍 Pre-Trip" : "✅ Post-Trip"} Inspection</div>
          <div className="slt-hero-sub">{viewItem.date} · {viewItem.time} · {viewItem.driverName}</div>
        </div>
        <div className="slt-container">
          {/* Score */}
          <div className="slt-card" style={{ marginBottom:16, textAlign:"center" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              <div><div style={{ fontSize:28, fontWeight:900, color:C.green }}>{viewItem.passed}</div><div style={{ fontSize:11, color:C.textMed }}>PASSED</div></div>
              <div><div style={{ fontSize:28, fontWeight:900, color:viewItem.failed>0?C.red:C.textLight }}>{viewItem.failed}</div><div style={{ fontSize:11, color:C.textMed }}>FAILED</div></div>
              <div><div style={{ fontSize:28, fontWeight:900, color:C.blue }}>{viewItem.total}</div><div style={{ fontSize:11, color:C.textMed }}>TOTAL</div></div>
            </div>
          </div>
          {fails.length > 0 && (
            <div className="slt-card" style={{ marginBottom:14, border:`2px solid ${C.red}`, background:"#FFF8F8" }}>
              <div style={{ fontWeight:800, color:C.red, marginBottom:10 }}>⚠️ Failed Items</div>
              {fails.map(i => <div key={i.id} style={{ padding:"6px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>{i.icon} {i.label}</div>)}
            </div>
          )}
          {viewItem.photos.length > 0 && (
            <div className="slt-card" style={{ marginBottom:14 }}>
              <div style={{ fontWeight:800, marginBottom:10 }}>📸 Photos ({viewItem.photos.length})</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {viewItem.photos.map((p,i) => <img key={i} src={p.data} alt="" style={{ width:"100%", height:90, objectFit:"cover", borderRadius:8 }} />)}
              </div>
            </div>
          )}
          {viewItem.note && <div className="slt-card" style={{ marginBottom:14 }}><div style={{ fontWeight:800, marginBottom:6 }}>📝 Notes</div><div style={{ fontSize:13, color:C.textMed }}>{viewItem.note}</div></div>}
          <button className="slt-btn-secondary" style={{ width:"100%" }} onClick={() => setViewItem(null)}>← Back</button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="slt-page">
      <div className="slt-hero">
        <div className="slt-hero-title">🔍 Trip Inspections</div>
        <div className="slt-hero-sub">Pre & post-trip checklists with photo proof</div>
      </div>
      <div className="slt-container">
        <div style={{ display:"flex", gap:10, marginBottom:20 }}>
          <button onClick={() => { setType("pre"); setMode("new"); }} className="slt-btn-primary" style={{ flex:1, padding:"13px" }}>🔍 Pre-Trip</button>
          <button onClick={() => { setType("post"); setMode("new"); }} className="slt-btn-secondary" style={{ flex:1, padding:"13px", background:`linear-gradient(135deg,${C.green},#2E7D32)`, color:"#fff", border:"none" }}>✅ Post-Trip</button>
        </div>
        {inspections.length === 0
          ? <div className="slt-card" style={{ textAlign:"center", padding:"48px 24px" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
              <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>No Inspections Yet</div>
              <div style={{ color:C.textMed, fontSize:13 }}>Start your first pre-trip check above</div>
            </div>
          : inspections.map(ins => {
              const hasFail = ins.failed > 0;
              return (
                <div key={ins.id} className="slt-card" style={{ marginBottom:12, borderLeft:`4px solid ${hasFail?C.red:C.green}`, cursor:"pointer" }} onClick={() => setViewItem(ins)}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14 }}>{ins.type === "pre" ? "🔍 Pre-Trip" : "✅ Post-Trip"} · {ins.date}</div>
                      <div style={{ fontSize:12, color:C.textMed, marginTop:2 }}>{ins.time} · {ins.driverName}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:12, fontWeight:800, color: hasFail ? C.red : C.green }}>{hasFail ? `⚠️ ${ins.failed} issue${ins.failed>1?"s":""}` : "✅ All Clear"}</div>
                      {ins.photos.length > 0 && <div style={{ fontSize:11, color:C.textMed }}>📸 {ins.photos.length} photo{ins.photos.length>1?"s":""}</div>}
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

// ─── TRIP SUMMARY SHARE CARD ──────────────────────────────────────────────────
function TripSummaryModal({ load, onClose, rates, session, trucks }) {
  useEffect(()=>{ document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=""; }; },[]);
  const truck = trucks?.find(t => t.id === load.truckId);
  const wm = (Number(load.loadWaitMins)||0) + (Number(load.offloadWaitMins)||0);
  const drvWaitPay = wm / 60 * (Number(rates?.driverWaitRate) || 0);
  const basePay = Number(load.driverBasePay) || 0;
  const totalPay = basePay + drvWaitPay;
  const fmtTime = (t) => { if(!t) return null; const [h,m]=t.split(":"); const hr=Number(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?"PM":"AM"}`; };
  const wHrs = Math.floor(wm/60); const wMins = wm%60;

  const download = () => {
    const html = `
      <div class="header"><div class="brand">🚛 TruckPilot</div><div><div style="font-size:20px;font-weight:800">Trip Summary</div><div style="color:#666">${load.date}</div></div></div>
      <div class="summary">
        <div class="summary-card"><div class="label">Route</div><div class="value" style="font-size:14px">${load.location||"—"}</div></div>
        <div class="summary-card"><div class="label">Total Pay</div><div class="value green">$${totalPay.toFixed(2)}</div></div>
        <div class="summary-card"><div class="label">Wait Time</div><div class="value blue">${wm>0?`${wHrs>0?wHrs+"h ":""}${wMins}min`:"None"}</div></div>
      </div>
      <table><thead><tr><th>Item</th><th>Detail</th></tr></thead><tbody>
        <tr><td>Driver</td><td>${session.fullName||session.name}</td></tr>
        ${truck?`<tr><td>Truck</td><td>${truck.truckNumber}</td></tr>`:""}
        ${load.appointmentTime?`<tr><td>Appt Time</td><td>${fmtTime(load.appointmentTime)||load.appointmentTime}</td></tr>`:""}
        ${load.time?`<tr><td>Arrival</td><td>${fmtTime(load.time)||load.time}</td></tr>`:""}
        ${load.completedTime?`<tr><td>Completed</td><td>${fmtTime(load.completedTime)||load.completedTime}</td></tr>`:""}
        <tr><td>Base Pay</td><td>$${basePay.toFixed(2)}</td></tr>
        ${wm>0?`<tr><td>Wait Pay (${wHrs>0?wHrs+"h ":""}${wMins}min)</td><td>$${drvWaitPay.toFixed(2)}</td></tr>`:""}
        <tr style="font-weight:800;background:#E8F5E9"><td>TOTAL PAY</td><td style="color:#2E7D32;font-size:15px">$${totalPay.toFixed(2)}</td></tr>
      </tbody></table>
      ${load.note?`<div style="margin-top:16px;padding:12px;background:#F7F9FC;border-radius:8px;font-size:12px;color:#666"><strong>Notes:</strong> ${load.note}</div>`:""}`;
    downloadPDF(html, `TripSummary_${load.date}_${(load.location||"trip").replace(/[^a-z0-9]/gi,"_")}`, session);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:0 }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:500, maxHeight:"92vh", display:"flex", flexDirection:"column", paddingBottom:"env(safe-area-inset-bottom,16px)" }}>
        {/* Sticky Header */}
        <div style={{ background:`linear-gradient(135deg,${C.navy},#1B3A5C)`, borderRadius:"20px 20px 0 0", padding:"20px 24px 24px", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, color:"#fff" }}>🚛 Trip Summary</div>
              <div style={{ color:"rgba(255,255,255,0.7)", fontSize:13, marginTop:3 }}>{load.date} · {load.location}</div>
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:10, padding:"8px 12px", cursor:"pointer", fontSize:16, fontWeight:800 }}>✕ Close</button>
          </div>
          {/* Big pay amount */}
          <div style={{ marginTop:20, background:"rgba(255,255,255,0.1)", borderRadius:14, padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ color:"rgba(255,255,255,0.8)", fontSize:13 }}>Your Total Pay</div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#69F0AE" }}>${totalPay.toFixed(2)}</div>
          </div>
        </div>

        <div style={{ padding:"20px 24px", overflowY:"auto", flex:1 }}>
          {/* Times strip */}
          {(load.appointmentTime||load.time||load.completedTime) && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:20, textAlign:"center" }}>
              {[["📅 Appt", fmtTime(load.appointmentTime), C.blue],["🛬 Arrival", fmtTime(load.time), C.green],["✅ Done", fmtTime(load.completedTime), C.orange]].map(([l,v,col]) => (
                <div key={l} style={{ background:C.offWhite, borderRadius:10, padding:"10px 6px" }}>
                  <div style={{ fontSize:10, color:C.textMed, fontWeight:700, marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:v?col:C.textLight }}>{v||"—"}</div>
                </div>
              ))}
            </div>
          )}

          {/* Pay breakdown */}
          <div style={{ background:C.offWhite, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, marginBottom:12, color:C.navy }}>💵 Pay Breakdown</div>
            {[
              ["Base Pay", `$${basePay.toFixed(2)}`, C.blue],
              ...(wm > 0 ? [[`Wait Pay (${wHrs>0?wHrs+"h ":""}${wMins}min)`, `$${drvWaitPay.toFixed(2)}`, C.orange]] : []),
            ].map(([l,v,col]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontSize:13, color:C.textMed }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0" }}>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14 }}>TOTAL</span>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, color:C.green }}>${totalPay.toFixed(2)}</span>
            </div>
          </div>

          {/* Details */}
          <div style={{ background:C.offWhite, borderRadius:12, padding:"14px 16px", marginBottom:20 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, marginBottom:12, color:C.navy }}>📋 Trip Details</div>
            {[
              ["Driver", session.fullName||session.name],
              truck && ["Truck", `Truck ${truck.truckNumber}`],
              ["Route", load.location||"—"],
              wm > 0 && ["Total Wait", `${wHrs>0?wHrs+"h ":""}${wMins} min`],
              load.note && ["Notes", load.note],
            ].filter(Boolean).map(([l,v]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontSize:12, color:C.textMed }}>{l}</span>
                <span style={{ fontSize:12, fontWeight:700, maxWidth:"55%", textAlign:"right" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={download} className="slt-btn-primary" style={{ flex:1, padding:"13px" }}>⬇ Download PDF</button>
            <button onClick={() => { if(navigator.share){ navigator.share({ title:"Trip Summary", text:`Route: ${load.location} | Pay: $${totalPay.toFixed(2)} | Date: ${load.date}` }); } else { navigator.clipboard.writeText(`🚛 Trip Summary\nRoute: ${load.location}\nDate: ${load.date}\nPay: $${totalPay.toFixed(2)}\nWait: ${wm>0?`${wHrs>0?wHrs+"h ":""}${wMins}min`:"None"}`); }}} className="slt-btn-secondary" style={{ flex:1, padding:"13px" }}>📤 Share</button>
          </div>
        </div>
      </div>
    </div>
  );
}



// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
function UpgradeModal({ session, onClose, onUpgrade }) {
  useEffect(()=>{ document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=""; }; },[]);
  const currentPlan = session.plan || "free";
  const [selected, setSelected] = useState(currentPlan);

  const handleUpgrade = (planId) => {
    const users = getUsers();
    users[session.uid].plan = planId;
    // Set upgrade timestamp for referral tracking
    users[session.uid].planUpgradedAt = new Date().toISOString();
    users[session.uid].planHistory = [...(users[session.uid].planHistory || []), { plan: planId, date: new Date().toISOString() }];
    saveUsers(users);
    // Handle referral commission
    const refs = getReferrals();
    const referrerUid = users[session.uid].referredBy;
    if (referrerUid && planId !== "free") {
      if (!refs[referrerUid]) refs[referrerUid] = { commissions: [], totalEarned: 0, pendingPayout: 0 };
      const monthlyPrice = PLANS[planId]?.price || 0;
      const commission = (monthlyPrice * REFERRAL_COMMISSION_PCT / 100) * REFERRAL_MONTHS;
      refs[referrerUid].commissions.push({
        fromUid: session.uid,
        fromName: session.fullName,
        plan: planId,
        amount: commission,
        date: new Date().toISOString(),
        status: "pending",
      });
      refs[referrerUid].totalEarned += commission;
      refs[referrerUid].pendingPayout += commission;
      saveReferrals(refs);
    }
    onUpgrade(planId);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.4)" }}>
        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,#0A1628,#1E3A5F)`, padding:"28px 24px 24px", borderRadius:"20px 20px 0 0", textAlign:"center" }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"#fff", marginBottom:6 }}>🚀 Upgrade TruckPilot</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>Choose the plan that fits your fleet</div>
          <div style={{ marginTop:10, background:"rgba(255,255,255,0.1)", borderRadius:8, padding:"6px 14px", display:"inline-block", fontSize:12, color:"#FFD600", fontWeight:700 }}>Current: {currentPlan==="pro"?"🚀 Pro":currentPlan==="basic"?"💼 Basic":"⭐ Beta"}</div>
        </div>
        {/* Plans */}
        <div style={{ padding:"20px 16px" }}>
          {Object.values(PLANS).map(plan => (
            <div key={plan.id} onClick={() => setSelected(plan.id)}
              style={{ border:`2.5px solid ${selected===plan.id ? plan.color : "#e8ecf0"}`, borderRadius:14, padding:"16px 18px", marginBottom:12, cursor:"pointer", transition:"all 0.2s", background: selected===plan.id ? plan.color+"11" : "#fff", position:"relative" }}>
              {plan.id === "pro" && <div style={{ position:"absolute", top:-10, right:16, background:"#243B6E", color:"#fff", fontSize:10, fontWeight:800, padding:"3px 10px", borderRadius:20, letterSpacing:1 }}>BEST VALUE</div>}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <span style={{ fontSize:20, marginRight:8 }}>{plan.emoji}</span>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"#1A1A1A" }}>{plan.id==="pro"?(session.role==="owner"?"🚀 Owner Pro":"🚀 Fleet Pro"):plan.label}</span>
                </div>
                <div style={{ textAlign:"right" }}>
                  {plan.price === 0
                    ? <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:plan.color }}>FREE</div>
                    : <div><span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:22, color:plan.color }}>${plan.price}</span><span style={{ fontSize:11, color:"#888" }}>/mo</span></div>
                  }
                </div>
              </div>
              <div style={{ fontSize:12, color:"#666", marginBottom:10 }}>{plan.desc}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {plan.features.map(f => <span key={f} style={{ fontSize:11, background:plan.color+"22", color:plan.color, padding:"3px 9px", borderRadius:20, fontWeight:600 }}>✓ {f}</span>)}
              </div>
              {currentPlan === plan.id && <div style={{ marginTop:10, fontSize:12, color:plan.color, fontWeight:700 }}>✓ Current plan</div>}
            </div>
          ))}
          {/* Action buttons */}
          <div style={{ display:"flex", gap:10, marginTop:4 }}>
            <button onClick={onClose} style={{ flex:1, padding:"12px", border:"1.5px solid #ddd", borderRadius:10, background:"#fff", cursor:"pointer", fontFamily:"'Barlow',sans-serif", fontWeight:700, fontSize:14 }}>‹ Back</button>
            <button disabled
              style={{ flex:2, padding:"12px", border:"none", borderRadius:10, background:"#ccc", color:"#fff", cursor:"not-allowed", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14 }}>
              Coming Soon
            </button>
          </div>
          <div style={{ textAlign:"center", fontSize:12, color:"#666", marginTop:10, fontWeight:600 }}>
            Your current plan: {currentPlan==="pro"?"🚀 Pro":currentPlan==="basic"?"💼 Basic":"⭐ Beta"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── REFERRAL TAB ──────────────────────────────────────────────────────────────
function ReferralTab({ session }) {
  const users = getUsers();
  const user = users[session.uid] || {};
  const plan = getUserPlan(session.uid);
  const refs = getReferrals();
  const myRef = refs[session.uid] || { commissions: [], totalEarned: 0, pendingPayout: 0 };

  // Generate referral code if not set
  if (!user.referralCode) {
    user.referralCode = genReferralCode(session.uid);
    users[session.uid] = user;
    saveUsers(users);
  }

  const referralCode = user.referralCode;
  const referralLink = `https://oilsands-haul-log.vercel.app?ref=${referralCode}`;
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  // Count referred users
  const referredUsers = Object.values(users).filter(u => u.referredBy === session.uid);
  const payingReferrals = referredUsers.filter(u => u.plan && u.plan !== "free");

  const tiers = [
    { label:"Bronze", min:0, max:2, reward:"$" + (PLANS.basic.price * REFERRAL_COMMISSION_PCT/100 * REFERRAL_MONTHS).toFixed(0) + " per referral", color:"#CD7F32", emoji:"🥉" },
    { label:"Silver", min:3, max:9, reward:"25% commission", color:"#9E9E9E", emoji:"🥈" },
    { label:"Gold",   min:10, max:Infinity, reward:"30% + free month", color:"#FFD600", emoji:"🥇" },
  ];
  const currentTier = tiers.find(t => payingReferrals.length >= t.min && payingReferrals.length <= t.max) || tiers[0];

  return (
    <div className="slt-page">
      <div className="slt-hero" style={{ background:"linear-gradient(135deg,#243B6E,#2D4A8A,#AB47BC)" }}>
        <div className="slt-hero-title">🎁 Referral Program</div>
        <div className="slt-hero-sub">Earn cash for every trucker you bring in</div>
      </div>
      <div className="slt-container-sm">

        {/* Earnings summary */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
          {[
            ["Total Earned", "$" + myRef.totalEarned.toFixed(2), "#4CAF50"],
            ["Pending", "$" + myRef.pendingPayout.toFixed(2), "#243B6E"],
            ["Referrals", payingReferrals.length + " paying", "#243B6E"],
          ].map(([l,v,col]) => (
            <div key={l} className="slt-card" style={{ textAlign:"center", padding:"14px 10px", borderTop:`3px solid ${col}` }}>
              <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>{l}</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:col }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Current tier */}
        <div className="slt-card" style={{ background:`linear-gradient(135deg,${currentTier.color}22,${currentTier.color}11)`, border:`2px solid ${currentTier.color}`, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:24, marginBottom:4 }}>{currentTier.emoji} {currentTier.label} Tier</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:700, color:currentTier.color }}>{currentTier.reward}</div>
              <div style={{ fontSize:12, color:"#666", marginTop:4 }}>{payingReferrals.length} paying referrals so far</div>
            </div>
            {payingReferrals.length < 10 && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#888" }}>Next tier</div>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"#FFD600", fontSize:18 }}>{tiers[Math.min(tiers.findIndex(t=>t===currentTier)+1, tiers.length-1)].emoji}</div>
                <div style={{ fontSize:11, color:"#888" }}>{tiers[1].min - payingReferrals.length > 0 ? tiers[1].min - payingReferrals.length + " more" : "10+ for Gold"}</div>
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="slt-card" style={{ marginBottom:16 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:14 }}>💡 How It Works</div>
          {[
            ["1️⃣","Share your link","Send your unique referral link to other truckers or fleet owners"],
            ["2️⃣","They sign up","They create a TruckPilot account using your link"],
            ["3️⃣","They upgrade","When they subscribe to Basic or Pro, you earn commission"],
            ["4️⃣","You get paid","Earn " + REFERRAL_COMMISSION_PCT + "% of their subscription for " + REFERRAL_MONTHS + " months"],
          ].map(([num, title, desc]) => (
            <div key={title} style={{ display:"flex", gap:12, marginBottom:12, alignItems:"flex-start" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{num}</span>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{title}</div>
                <div style={{ fontSize:12, color:"#666" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Commission table */}
        <div className="slt-card" style={{ marginBottom:16 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:12 }}>💰 Commission Table</div>
          {[
            ["Basic referral", PLANS.basic.price, REFERRAL_COMMISSION_PCT, REFERRAL_MONTHS],
            ["Pro referral",   PLANS.pro.price,   REFERRAL_COMMISSION_PCT, REFERRAL_MONTHS],
          ].map(([label, price, pct, months]) => {
            const monthly = price * pct / 100;
            const total = monthly * months;
            return (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0f0f0" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{label}</div>
                  <div style={{ fontSize:11, color:"#888" }}>{pct}% × {months} months</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"#4CAF50", fontSize:16 }}>${total.toFixed(2)}</div>
                  <div style={{ fontSize:11, color:"#888" }}>${monthly.toFixed(2)}/mo</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Share your link */}
        <div className="slt-card" style={{ marginBottom:16 }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:12 }}>🔗 Your Referral Link</div>
          <div style={{ background:"#f8f9fa", border:"1.5px solid #e0e0e0", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#333", wordBreak:"break-all", marginBottom:10, fontFamily:"monospace" }}>
            {referralLink}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={copyLink} className="slt-btn-primary" style={{ flex:1 }}>{copied ? "✅ Copied!" : "📋 Copy Link"}</button>
            <button onClick={() => { if(navigator.share) navigator.share({ title:"TruckPilot", text:"Join me on TruckPilot — the smart fleet management app!", url:referralLink }); }}
              className="slt-btn-secondary" style={{ flex:1 }}>📤 Share</button>
          </div>
          <div style={{ fontSize:11, color:"#888", marginTop:8, textAlign:"center" }}>Your code: <strong style={{ color:"#2D4A8A", letterSpacing:2 }}>{referralCode}</strong></div>
        </div>

        {/* Referred users list */}
        {referredUsers.length > 0 && (
          <div className="slt-card">
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, marginBottom:12 }}>👥 Your Referrals ({referredUsers.length})</div>
            {referredUsers.map(u => (
              <div key={u.uid} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:"1px solid #f5f5f5" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{u.fullName}</div>
                  <div style={{ fontSize:11, color:"#888" }}>{u.role} · joined {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : "—"}</div>
                </div>
                <span style={{ fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:20,
                  background: u.plan && u.plan !== "free" ? "#E8F5E9" : "#FFF3E0",
                  color: u.plan && u.plan !== "free" ? "#2E7D32" : "#243B6E" }}>
                  {u.plan ? PLANS[u.plan]?.label : "Free"}
                </span>
              </div>
            ))}
            {myRef.commissions.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Commission History</div>
                {myRef.commissions.map((c, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"6px 0", borderBottom:"1px solid #f5f5f5" }}>
                    <span>{c.fromName} → {PLANS[c.plan]?.label}</span>
                    <span style={{ color:"#4CAF50", fontWeight:700 }}>+${c.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PLAN GATE (lock screen for locked features) ───────────────────────────────
function PlanGate({ feature, plan, onUpgrade }) {
  const needed = canAccessFeature("basic", feature) ? "basic" : "pro";
  const neededPlan = PLANS[needed];
  return (
    <div className="slt-page">
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", padding:24, textAlign:"center" }}>
        <div style={{ fontSize:60, marginBottom:16 }}>🔒</div>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"#1A1A1A", marginBottom:8 }}>
          {neededPlan.emoji} {neededPlan.label} Required
        </div>
        <div style={{ fontSize:14, color:"#666", marginBottom:24, maxWidth:300 }}>
          This feature is available on the {neededPlan.label} plan and above.
        </div>
        <div style={{ background:`${neededPlan.color}11`, border:`2px solid ${neededPlan.color}`, borderRadius:16, padding:"20px 24px", marginBottom:24, width:"100%", maxWidth:320 }}>
          <div style={{ fontWeight:700, fontSize:15, color:neededPlan.color, marginBottom:10 }}>{neededPlan.label} — ${neededPlan.price}/mo</div>
          {neededPlan.features.map(f => <div key={f} style={{ fontSize:13, color:"#333", textAlign:"left", marginBottom:5 }}>✓ {f}</div>)}
        </div>
        <button onClick={onUpgrade} style={{ background:neededPlan.color, color:"#fff", border:"none", borderRadius:12, padding:"14px 32px", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:15, cursor:"pointer", width:"100%", maxWidth:320 }}>
          Upgrade to {neededPlan.label} →
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP v3 ─────────────────────────────────────────────────────────────

// ─── RESET PASSWORD SCREEN ────────────────────────────────────────────────────
function ResetPasswordScreen({ onDone }) {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!newPass || !confirmPass) { setMsg("Please fill in both fields."); return; }
    if (newPass.length < 6) { setMsg("Password must be at least 6 characters."); return; }
    if (newPass !== confirmPass) { setMsg("Passwords do not match."); return; }
    setLoading(true);
    const { error } = await sb.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) { setMsg(error.message); setMsgType("error"); return; }
    setDone(true);
    setTimeout(() => onDone(), 2000);
  };

  const authInput = { width:"100%", padding:"12px 15px", border:"1.5px solid rgba(255,255,255,0.15)", borderRadius:10, fontSize:14, color:"#fff", background:"rgba(255,255,255,0.07)", outline:"none", fontFamily:"'Barlow',sans-serif", marginBottom:14, boxSizing:"border-box" };
  const authLabel = { display:"block", fontSize:12.5, fontWeight:700, color:"rgba(255,255,255,0.6)", marginBottom:6, fontFamily:"'Barlow',sans-serif" };

  return (
    <div className="slt-auth-bg">
      <div style={{ width:"100%", maxWidth:440 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:0 }}>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:52, color:"#fff", letterSpacing:6, textDecoration:"underline", textDecorationColor:"#FFD700", textUnderlineOffset:6, textDecorationThickness:3 }}>TRUCK</span>
              <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:52, color:"#FFD700", letterSpacing:6 }}>PILOT</span>
            </div>
            <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:3, textTransform:"uppercase", marginTop:8, textAlign:"center" }}>Log Loads · Save Taxes · Stay Compliant</div>
          </div>
        </div>
        <div className="slt-auth-card">
          {done ? (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:C.teal, marginBottom:8 }}>Password Updated!</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)" }}>Redirecting you to login...</div>
            </div>
          ) : (
            <>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:20, color:"#fff", marginBottom:6, textAlign:"center" }}>🔐 Set New Password</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:24, textAlign:"center" }}>Enter your new password below</div>
              <div><label style={authLabel}>New Password</label>
              <input type="password" className="slt-input" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 6 characters" style={authInput} /></div>
              <div><label style={authLabel}>Confirm New Password</label>
              <input type="password" className="slt-input" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Repeat your password" style={authInput} onKeyDown={e => { if(e.key==="Enter") handleReset(); }} /></div>
              {msg && <div style={{ background:msgType==="success"?"rgba(0,137,123,0.2)":"rgba(229,57,53,0.15)", border:"1px solid rgba(229,57,53,0.35)", borderRadius:9, padding:"10px 14px", color:msgType==="success"?"#80cbc4":"#ff8a80", fontSize:13, marginBottom:14, fontFamily:"'Barlow',sans-serif" }}>{msg}</div>}
              <button className="slt-btn-primary" onClick={handleReset} disabled={loading} style={{ width:"100%", padding:"13px", fontSize:15, borderRadius:10, opacity:loading?0.7:1 }}>
                {loading ? "⏳ Updating..." : "✅ Set New Password"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Login Screen ───────────────────────────────────────────────────────
function AdminLoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) { setError("Invalid credentials"); setLoading(false); return; }
    const profile = await sbGetProfile(data.user.id);
    if (!profile || profile.role !== "superadmin") {
      await sb.auth.signOut();
      setError("Access denied — not an admin account");
      setLoading(false);
      return;
    }
    onLogin({ uid: data.user.id, email: data.user.email, fullName: profile.name, name: profile.name, role: "superadmin", plan: "pro", supabase: true });
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1a0030,#2d006e,#0d1f35)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <GlobalCSS darkMode={false} />
      <div style={{ background:"#fff", borderRadius:20, padding:36, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>👑</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:32, color:"#fff" }}>ADMIN</div>
          <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Authorized personnel only</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#666", display:"block", marginBottom:6 }}>Admin Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="truckpilot.ca@gmail.com"
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1.5px solid #ddd", fontSize:14, outline:"none", boxSizing:"border-box" }}
            onKeyDown={e=>e.key==="Enter"&&login()}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#666", display:"block", marginBottom:6 }}>Password</label>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••"
            style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1.5px solid #ddd", fontSize:14, outline:"none", boxSizing:"border-box" }}
            onKeyDown={e=>e.key==="Enter"&&login()}/>
        </div>
        {error && <div style={{ background:"#FFEBEE", color:"#C62828", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:14, fontWeight:600 }}>⚠️ {error}</div>}
        <button onClick={login} disabled={loading}
          style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#243B6E,#6A1B9A)", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer" }}>
          {loading ? "Signing in..." : "👑 Sign In as Admin"}
        </button>
        <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:"#aaa" }}>
          This page is for TruckPilot administrators only
        </div>
      </div>
    </div>
  );
}

// ─── RECURRING ROUTES TAB ─────────────────────────────────────────────────────
function RecurringRoutesTab({ session, isOwner, goBack }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", location:"", earnings:"", driver_pay:"", billing_method:"per_load" });
  const [saving, setSaving] = useState(false);
  const ownerUid = session.ownerUid || session.uid;
  useEffect(() => { sbGetRecurringRoutes(ownerUid).then(d => { setRoutes(d); setLoading(false); }); }, [ownerUid]);
  const openNew = () => { setForm({ name:"", location:"", earnings:"", driver_pay:"", billing_method:"per_load" }); setEditing(null); setShowForm(true); };
  const openEdit = (r) => { setForm({ name:r.name, location:r.location, earnings:r.earnings||"", driver_pay:r.driver_pay||"", billing_method:r.billing_method||"per_load" }); setEditing(r.id); setShowForm(true); };
  const save = async () => {
    if (!form.name.trim() || !form.location.trim()) return alert("Name and route are required.");
    setSaving(true);
    await sbSaveRecurringRoute({ id: editing||undefined, owner_uid: ownerUid, ...form, earnings: Number(form.earnings)||0, driver_pay: Number(form.driver_pay)||0 });
    setRoutes(await sbGetRecurringRoutes(ownerUid)); setShowForm(false); setSaving(false);
  };
  const del = async (id) => {
    if (!window.confirm("Delete this route template?")) return;
    await sbDeleteRecurringRoute(id); setRoutes(prev => prev.filter(r => r.id !== id));
  };
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">🔁 Recurring Routes</div><div className="slt-hero-sub">Save route templates to fill load forms instantly</div></div>
      <div className="slt-container">
        <button onClick={openNew} className="slt-btn-primary" style={{width:"100%",marginBottom:16}}>+ Add Route Template</button>
        {showForm && (
          <div className="slt-card" style={{marginBottom:16,border:"2px solid #243B6E"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:"#243B6E"}}>{editing?"✏️ Edit Route":"➕ New Route Template"}</div>
            {[{key:"name",label:"Template Name",placeholder:"e.g. CNRL → Heartland Daily"},{key:"location",label:"Route (From → To)",placeholder:"e.g. CNRL → Heartland"},{key:"earnings",label:"Company Earnings ($)",placeholder:"0.00",type:"number"},{key:"driver_pay",label:"Driver Pay ($)",placeholder:"0.00",type:"number"}].map(({key,label,placeholder,type})=>(
              <div key={key} style={{marginBottom:10}}><label className="slt-label">{label}</label><input type={type||"text"} value={form[key]} placeholder={placeholder} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} className="slt-input"/></div>
            ))}
            <div style={{marginBottom:14}}><label className="slt-label">Billing Method</label><select value={form.billing_method} onChange={e=>setForm(p=>({...p,billing_method:e.target.value}))} className="slt-input"><option value="per_load">Per Load</option><option value="per_hour">Per Hour</option><option value="per_cubic">Per Cubic</option></select></div>
            <div style={{display:"flex",gap:10}}><button onClick={save} disabled={saving} className="slt-btn-primary" style={{flex:2}}>{saving?"Saving...":"💾 Save Template"}</button><button onClick={()=>setShowForm(false)} className="slt-btn-ghost" style={{flex:1}}>Cancel</button></div>
          </div>
        )}
        {loading && <div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>}
        {!loading && routes.length===0 && <div className="slt-card" style={{textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>🔁</div><div style={{fontWeight:700,marginBottom:6}}>No route templates yet</div><div style={{fontSize:13,color:"#999"}}>Add your common routes to speed up load logging</div></div>}
        {routes.map(r=>(
          <div key={r.id} className="slt-card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:17,color:"#243B6E",marginBottom:4}}>{r.name}</div>
                <div style={{fontSize:13,color:"#555",marginBottom:4}}>📍 {r.location}</div>
                <div style={{display:"flex",gap:12,fontSize:12,color:"#888"}}>
                  {r.earnings>0&&<span>💰 ${r.earnings} company</span>}
                  {r.driver_pay>0&&<span>🧑‍✈️ ${r.driver_pay} driver</span>}
                  <span>📋 {r.billing_method}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>openEdit(r)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #243B6E",background:"#fff",color:"#243B6E",fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️</button>
                <button onClick={()=>del(r.id)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #EF4444",background:"#fff",color:"#EF4444",fontWeight:700,fontSize:12,cursor:"pointer"}}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DRIVER RATINGS TAB ───────────────────────────────────────────────────────
function DriverRatingsTab({ session, loads, allDrivers, isOwner, goBack }) {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingModal, setRatingModal] = useState(null);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { sbGetDriverRatings(session.ownerUid||session.uid).then(d=>{setRatings(d);setLoading(false);}); }, [session.uid]);
  const submitRating = async () => {
    if (!ratingModal) return;
    setSaving(true);
    await sbSaveDriverRating({ load_id:ratingModal.id, driver_uid:ratingModal.assignedDriverUid||ratingModal.user_id, owner_uid:session.ownerUid||session.uid, rating:ratingVal, comment:ratingComment.trim() });
    setRatings(await sbGetDriverRatings(session.ownerUid||session.uid));
    setRatingModal(null); setRatingComment(""); setRatingVal(5); setSaving(false);
  };
  const getAvg = (uid) => { const r=ratings.filter(r=>r.driver_uid===uid); return r.length?( r.reduce((a,b)=>a+b.rating,0)/r.length).toFixed(1):null; };
  const ratedIds = new Set(ratings.map(r=>r.load_id));
  const unrated = loads.filter(l=>l.completed&&!ratedIds.has(l.id)&&(l.assignedDriverUid||l.user_id));
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">⭐ Driver Ratings</div><div className="slt-hero-sub">Rate drivers after completed loads</div></div>
      <div className="slt-container">
        {allDrivers&&allDrivers.length>0&&(
          <div className="slt-card" style={{marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:12,color:"#243B6E"}}>📊 Driver Averages</div>
            {allDrivers.map(d=>{const avg=getAvg(d.uid);const count=ratings.filter(r=>r.driver_uid===d.uid).length;return(
              <div key={d.uid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #eee"}}>
                <div style={{fontWeight:700,fontSize:14}}>{d.name||"Driver"}</div>
                {avg?<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:"#FFD700",fontSize:18}}>{"★".repeat(Math.round(avg))}</span><span style={{fontWeight:800,color:"#243B6E"}}>{avg}</span><span style={{fontSize:12,color:"#999"}}>({count})</span></div>:<span style={{fontSize:13,color:"#999"}}>No ratings yet</span>}
              </div>
            );})}
          </div>
        )}
        <div style={{fontWeight:800,fontSize:14,marginBottom:10,color:"#243B6E"}}>📋 Rate Completed Loads</div>
        {unrated.length===0&&<div className="slt-card" style={{textAlign:"center",padding:32,color:"#999",marginBottom:16}}><div style={{fontSize:32,marginBottom:8}}>✅</div>All completed loads have been rated!</div>}
        {unrated.slice(0,20).map(l=>(
          <div key={l.id} className="slt-card" style={{marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:700,fontSize:14}}>{l.location}</div><div style={{fontSize:12,color:"#999"}}>{l.date} · {l.driverFullName||"Driver"}</div></div>
            <button onClick={()=>{setRatingModal(l);setRatingVal(5);setRatingComment("");}} style={{padding:"8px 16px",background:"#FFD700",color:"#1a2744",border:"none",borderRadius:10,fontWeight:800,fontSize:13,cursor:"pointer"}}>⭐ Rate</button>
          </div>
        ))}
        {ratings.length>0&&(<><div style={{fontWeight:800,fontSize:14,marginBottom:10,color:"#243B6E",marginTop:16}}>📝 Recent Ratings</div>
        {ratings.slice(0,10).map(r=>(
          <div key={r.id} className="slt-card" style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:13}}>{allDrivers?.find(d=>d.uid===r.driver_uid)?.name||"Driver"}</div>
              <div style={{color:"#FFD700",fontSize:16}}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</div>
            </div>
            {r.comment&&<div style={{fontSize:12,color:"#666",fontStyle:"italic"}}>"{r.comment}"</div>}
            <div style={{fontSize:11,color:"#999",marginTop:4}}>{new Date(r.created_at).toLocaleDateString()}</div>
          </div>
        ))}</>)}
      </div>
      {ratingModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:480,padding:28,paddingBottom:40}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22,marginBottom:4}}>Rate This Driver</div>
            <div style={{fontSize:13,color:"#666",marginBottom:20}}>{ratingModal.location} · {ratingModal.driverFullName}</div>
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:20}}>
              {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRatingVal(n)} style={{fontSize:36,background:"none",border:"none",cursor:"pointer",opacity:n<=ratingVal?1:0.3,transition:"opacity 0.15s"}}>⭐</button>)}
            </div>
            <textarea value={ratingComment} onChange={e=>setRatingComment(e.target.value)} placeholder="Add a comment (optional)..." className="slt-input" style={{width:"100%",minHeight:80,resize:"vertical",marginBottom:16}}/>
            <div style={{display:"flex",gap:10}}><button onClick={submitRating} disabled={saving} className="slt-btn-primary" style={{flex:2}}>{saving?"Saving...":"💾 Submit Rating"}</button><button onClick={()=>setRatingModal(null)} className="slt-btn-ghost" style={{flex:1}}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FUEL LOG TAB ─────────────────────────────────────────────────────────────
function FuelLogTab2({ session, trucks, goBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({date:"",truck_number:"",litres:"",price_per_litre:"",total:"",odometer:"",location:"",notes:""});
  const [saving, setSaving] = useState(false);
  const todayStr2 = () => new Date().toISOString().slice(0,10);
  useEffect(() => { sbGetFuelLog(session.uid).then(d=>{setEntries(d);setLoading(false);}); }, [session.uid]);
  const calcTotal = (l,p) => ((parseFloat(l)||0)*(parseFloat(p)||0)).toFixed(2);
  const save = async () => {
    if (!form.date||!form.litres) return alert("Date and litres are required.");
    setSaving(true);
    await sbSaveFuelEntry({user_id:session.uid,...form,litres:parseFloat(form.litres),price_per_litre:parseFloat(form.price_per_litre)||0,total:parseFloat(calcTotal(form.litres,form.price_per_litre))||0,odometer:form.odometer?parseFloat(form.odometer):null});
    setEntries(await sbGetFuelLog(session.uid)); setShowForm(false); setSaving(false);
  };
  const del = async (id) => { if(!window.confirm("Delete?"))return; await sbDeleteFuelEntry(id); setEntries(prev=>prev.filter(e=>e.id!==id)); };
  const totalL=entries.reduce((a,b)=>a+(b.litres||0),0);
  const totalC=entries.reduce((a,b)=>a+(b.total||0),0);
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">⛽ Fuel Log</div><div className="slt-hero-sub">Track fuel costs per truck</div></div>
      <div className="slt-container">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {[{label:"Total Litres",value:`${totalL.toFixed(0)}L`,color:"#243B6E"},{label:"Total Cost",value:`$${totalC.toFixed(2)}`,color:"#166534"},{label:"Avg $/L",value:totalL>0?`$${(totalC/totalL).toFixed(3)}`:"—",color:"#B45309"}].map(({label,value,color})=>(
            <div key={label} className="slt-card" style={{textAlign:"center",padding:"14px 8px"}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:20,color}}>{value}</div><div style={{fontSize:11,color:"#999",marginTop:2}}>{label}</div></div>
          ))}
        </div>
        <button onClick={()=>{setForm({date:todayStr2(),truck_number:"",litres:"",price_per_litre:"",total:"",odometer:"",location:"",notes:""});setShowForm(true);}} className="slt-btn-primary" style={{width:"100%",marginBottom:16}}>+ Log Fuel</button>
        {showForm&&(
          <div className="slt-card" style={{marginBottom:16,border:"2px solid #243B6E"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:"#243B6E"}}>⛽ New Fuel Entry</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="slt-label">Date</label><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className="slt-input"/></div>
              <div><label className="slt-label">Truck #</label><input value={form.truck_number} placeholder="T-247" onChange={e=>setForm(p=>({...p,truck_number:e.target.value}))} className="slt-input"/></div>
              <div><label className="slt-label">Litres</label><input type="number" value={form.litres} placeholder="0.0" onChange={e=>setForm(p=>({...p,litres:e.target.value,total:calcTotal(e.target.value,p.price_per_litre)}))} className="slt-input"/></div>
              <div><label className="slt-label">Price/L ($)</label><input type="number" step="0.001" value={form.price_per_litre} placeholder="1.500" onChange={e=>setForm(p=>({...p,price_per_litre:e.target.value,total:calcTotal(p.litres,e.target.value)}))} className="slt-input"/></div>
              <div><label className="slt-label">Total ($)</label><input type="number" value={form.total} placeholder="0.00" onChange={e=>setForm(p=>({...p,total:e.target.value}))} className="slt-input"/></div>
              <div><label className="slt-label">Odometer (km)</label><input type="number" value={form.odometer} placeholder="Optional" onChange={e=>setForm(p=>({...p,odometer:e.target.value}))} className="slt-input"/></div>
            </div>
            <div style={{marginBottom:10}}><label className="slt-label">Location</label><input value={form.location} placeholder="e.g. Petro-Canada Fort Mac" onChange={e=>setForm(p=>({...p,location:e.target.value}))} className="slt-input"/></div>
            <div style={{marginBottom:14}}><label className="slt-label">Notes</label><input value={form.notes} placeholder="Optional" onChange={e=>setForm(p=>({...p,notes:e.target.value}))} className="slt-input"/></div>
            <div style={{display:"flex",gap:10}}><button onClick={save} disabled={saving} className="slt-btn-primary" style={{flex:2}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setShowForm(false)} className="slt-btn-ghost" style={{flex:1}}>Cancel</button></div>
          </div>
        )}
        {loading&&<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>}
        {!loading&&entries.length===0&&!showForm&&<div className="slt-card" style={{textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>⛽</div><div style={{fontWeight:700}}>No fuel entries yet</div></div>}
        {entries.map(e=>(
          <div key={e.id} className="slt-card" style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:18,color:"#243B6E"}}>${(e.total||0).toFixed(2)}</span>{e.truck_number&&<span style={{fontSize:12,background:"#f0f4ff",color:"#243B6E",padding:"2px 8px",borderRadius:20,fontWeight:700}}>🚛 {e.truck_number}</span>}</div>
                <div style={{fontSize:13,color:"#555"}}>{e.litres}L @ ${(e.price_per_litre||0).toFixed(3)}/L</div>
                <div style={{fontSize:12,color:"#999",marginTop:2}}>{e.date}{e.location?` · ${e.location}`:""}{e.odometer?` · ${e.odometer}km`:""}</div>
              </div>
              <button onClick={()=>del(e.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:18,padding:"4px 8px"}}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DOCUMENT EXPIRY TAB ──────────────────────────────────────────────────────
function DocExpiryTab({ session, isOwner, goBack }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({name:"",type:"license",expiry_date:"",notes:""});
  const [saving, setSaving] = useState(false);
  const ownerUid = session.ownerUid||session.uid;
  useEffect(() => {
    const fn=isOwner?sbGetFleetDocuments:sbGetDriverDocuments;
    fn(isOwner?ownerUid:session.uid).then(d=>{setDocs(d);setLoading(false);});
  }, [session.uid]);
  const daysUntil = (d) => Math.ceil((new Date(d)-new Date())/(1000*60*60*24));
  const getStatus = (d) => { const days=daysUntil(d); if(days<0)return{label:"EXPIRED",color:"#EF4444",bg:"#FFF0F0"}; if(days<=30)return{label:`${days}d left`,color:"#B45309",bg:"#FFF8E1"}; if(days<=90)return{label:`${days}d left`,color:"#166534",bg:"#F0FDF4"}; return{label:`${days}d left`,color:"#243B6E",bg:"#f0f4ff"}; };
  const save = async () => {
    if (!form.name.trim()||!form.expiry_date) return alert("Name and expiry date are required.");
    setSaving(true);
    await sbSaveDriverDocument({user_id:session.uid,owner_uid:ownerUid,...form});
    const fn=isOwner?sbGetFleetDocuments:sbGetDriverDocuments;
    setDocs(await fn(isOwner?ownerUid:session.uid)); setShowForm(false); setSaving(false);
    setForm({name:"",type:"license",expiry_date:"",notes:""});
  };
  const del = async (id) => { if(!window.confirm("Delete?"))return; await sbDeleteDriverDocument(id); setDocs(prev=>prev.filter(d=>d.id!==id)); };
  const expired=docs.filter(d=>daysUntil(d.expiry_date)<0);
  const soon=docs.filter(d=>{const x=daysUntil(d.expiry_date);return x>=0&&x<=30;});
  const typeIcons={license:"🪪",insurance:"🛡",permit:"📄",registration:"🚛",medical:"🏥",other:"📋"};
  return (
    <div className="slt-page">
      <div className="slt-hero"><div className="slt-hero-title">📋 Document Expiry</div><div className="slt-hero-sub">Track licenses, insurance and permits</div></div>
      <div className="slt-container">
        {expired.length>0&&<div style={{background:"#FFF0F0",border:"2px solid #EF4444",borderRadius:14,padding:14,marginBottom:14}}><div style={{fontWeight:800,color:"#EF4444",marginBottom:8}}>🚨 {expired.length} Expired</div>{expired.map(d=><div key={d.id} style={{fontSize:13,color:"#EF4444",marginBottom:2}}>• {d.name}</div>)}</div>}
        {soon.length>0&&<div style={{background:"#FFF8E1",border:"2px solid #B45309",borderRadius:14,padding:14,marginBottom:14}}><div style={{fontWeight:800,color:"#B45309",marginBottom:8}}>⚠️ {soon.length} Expiring Soon</div>{soon.map(d=><div key={d.id} style={{fontSize:13,color:"#B45309",marginBottom:2}}>• {d.name} — {daysUntil(d.expiry_date)} days</div>)}</div>}
        <button onClick={()=>setShowForm(true)} className="slt-btn-primary" style={{width:"100%",marginBottom:16}}>+ Add Document</button>
        {showForm&&(
          <div className="slt-card" style={{marginBottom:16,border:"2px solid #243B6E"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14,color:"#243B6E"}}>📋 New Document</div>
            <div style={{marginBottom:10}}><label className="slt-label">Document Name</label><input value={form.name} placeholder="e.g. Driver's License" onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="slt-input"/></div>
            <div style={{marginBottom:10}}><label className="slt-label">Type</label><select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} className="slt-input"><option value="license">🪪 Driver's License</option><option value="insurance">🛡 Insurance</option><option value="permit">📄 Permit</option><option value="registration">🚛 Registration</option><option value="medical">🏥 Medical Certificate</option><option value="other">📋 Other</option></select></div>
            <div style={{marginBottom:10}}><label className="slt-label">Expiry Date</label><input type="date" value={form.expiry_date} onChange={e=>setForm(p=>({...p,expiry_date:e.target.value}))} className="slt-input"/></div>
            <div style={{marginBottom:14}}><label className="slt-label">Notes</label><input value={form.notes} placeholder="Optional" onChange={e=>setForm(p=>({...p,notes:e.target.value}))} className="slt-input"/></div>
            <div style={{display:"flex",gap:10}}><button onClick={save} disabled={saving} className="slt-btn-primary" style={{flex:2}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setShowForm(false)} className="slt-btn-ghost" style={{flex:1}}>Cancel</button></div>
          </div>
        )}
        {loading&&<div style={{textAlign:"center",padding:40,color:"#999"}}>Loading...</div>}
        {!loading&&docs.length===0&&!showForm&&<div className="slt-card" style={{textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>📋</div><div style={{fontWeight:700}}>No documents tracked yet</div><div style={{fontSize:13,color:"#999",marginTop:6}}>Add your license, insurance and permits to get expiry alerts</div></div>}
        {docs.map(d=>{const status=getStatus(d.expiry_date);return(
          <div key={d.id} className="slt-card" style={{marginBottom:10,borderLeft:`4px solid ${status.color}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span>{typeIcons[d.type]||"📋"}</span><span style={{fontWeight:700,fontSize:15}}>{d.name}</span><span style={{fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:20,background:status.bg,color:status.color}}>{status.label}</span></div>
                <div style={{fontSize:12,color:"#999"}}>Expires: {d.expiry_date}</div>
                {d.notes&&<div style={{fontSize:12,color:"#888",marginTop:2,fontStyle:"italic"}}>{d.notes}</div>}
              </div>
              <button onClick={()=>del(d.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:18}}>🗑</button>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── LOAD PHOTOS MODAL ────────────────────────────────────────────────────────
function LoadPhotosModal({ load, session, onClose, onPhotosUpdated }) {
  const [photos, setPhotos] = useState(load.photos || []);
  const [uploading, setUploading] = useState(false);
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);
  const handleUpload = async (files) => {
    setUploading(true);
    const newPhotos=[];
    for(const file of files){
      await new Promise(res=>{
        const reader=new FileReader();
        reader.onload=e=>{
          const img=new Image();
          img.onload=()=>{
            const canvas=document.createElement("canvas");
            let[w,h]=[img.width,img.height];
            if(w>1200){h=h*1200/w;w=1200;}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            newPhotos.push({url:canvas.toDataURL("image/jpeg",0.7),timestamp:new Date().toISOString()});
            res();
          };
          img.src=e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
    const updated=[...photos,...newPhotos];
    setPhotos(updated);
    try{await sb.from("loads").update({data:{...load,photos:updated}}).eq("id",load.id);if(onPhotosUpdated)onPhotosUpdated(updated);}catch(e){}
    setUploading(false);
  };
  const deletePhoto=async(idx)=>{const updated=photos.filter((_,i)=>i!==idx);setPhotos(updated);try{await sb.from("loads").update({data:{...load,photos:updated}}).eq("id",load.id);}catch(e){}};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:600,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"85vh",overflowY:"auto",padding:24,paddingBottom:40}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:22}}>📷 Load Photos</div>
          <button onClick={onClose} style={{background:"rgba(0,0,0,0.07)",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <label style={{display:"block",width:"100%",padding:"14px",background:"#243B6E",color:"#fff",borderRadius:12,fontWeight:800,fontSize:14,cursor:"pointer",textAlign:"center",marginBottom:20}}>
          {uploading?"Uploading...":"📷 Add Photos"}
          <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleUpload(Array.from(e.target.files))} disabled={uploading}/>
        </label>
        {photos.length===0&&<div style={{textAlign:"center",padding:40,color:"#999"}}><div style={{fontSize:40,marginBottom:12}}>📷</div>No photos yet.</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {photos.map((p,i)=>(
            <div key={i} style={{position:"relative",borderRadius:12,overflow:"hidden",aspectRatio:"4/3"}}>
              <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              <button onClick={()=>deletePhoto(i)} style={{position:"absolute",top:6,right:6,background:"rgba(239,68,68,0.9)",border:"none",borderRadius:"50%",width:28,height:28,color:"#fff",fontSize:14,cursor:"pointer"}}>✕</button>
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.5)",color:"#fff",fontSize:10,padding:"4px 8px"}}>{new Date(p.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OFFLINE SYNC HOOK ────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY="tp-offline-queue";
const getOfflineQueue=()=>{try{return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||"[]");}catch{return[];}};
const addToOfflineQueue=(action)=>{const q=getOfflineQueue();q.push({...action,queuedAt:new Date().toISOString()});localStorage.setItem(OFFLINE_QUEUE_KEY,JSON.stringify(q));};
const clearOfflineQueue=()=>localStorage.removeItem(OFFLINE_QUEUE_KEY);
function useOfflineSync(session){
  const[isOnline,setIsOnline]=useState(navigator.onLine);
  const[queueCount,setQueueCount]=useState(getOfflineQueue().length);
  useEffect(()=>{
    const handleOnline=async()=>{
      setIsOnline(true);
      const queue=getOfflineQueue();
      if(queue.length>0&&session){
        for(const action of queue){try{if(action.type==="save_load")await sbSaveLoad(action.load,action.uid,action.ownerUid);}catch(e){}}
        clearOfflineQueue();setQueueCount(0);
      }
    };
    const handleOffline=()=>setIsOnline(false);
    window.addEventListener("online",handleOnline);window.addEventListener("offline",handleOffline);
    return()=>{window.removeEventListener("online",handleOnline);window.removeEventListener("offline",handleOffline);};
  },[session]);
  return{isOnline,queueCount};
}

// ─── MULTI-LANGUAGE ───────────────────────────────────────────────────────────
const TRANSLATIONS={
  en:{dashboard:"Dashboard",addLoad:"Add Load",myLoads:"My Loads",reports:"Reports",profile:"Profile",expenses:"Expenses",drivers:"Drivers",payroll:"Payroll",analytics:"Analytics",taxExport:"Tax Export",maintenance:"Maintenance",inspection:"Inspection",fuelFinder:"Fuel Finder",documents:"Documents",emergency:"Emergency",jobBoard:"Job Board",community:"Community",signIn:"Sign In",signOut:"Sign Out",save:"Save",cancel:"Cancel",loading:"Loading...",noData:"No data yet",settings:"Settings"},
  ar:{dashboard:"الرئيسية",addLoad:"إضافة حمولة",myLoads:"حمولاتي",reports:"التقارير",profile:"الملف الشخصي",expenses:"المصاريف",drivers:"السائقون",payroll:"الرواتب",analytics:"الإحصائيات",taxExport:"تصدير الضرائب",maintenance:"الصيانة",inspection:"الفحص",fuelFinder:"محطات الوقود",documents:"الوثائق",emergency:"الطوارئ",jobBoard:"لوحة الوظائف",community:"المجتمع",signIn:"تسجيل الدخول",signOut:"تسجيل الخروج",save:"حفظ",cancel:"إلغاء",loading:"جاري التحميل...",noData:"لا توجد بيانات",settings:"الإعدادات"},
  fr:{dashboard:"Tableau de bord",addLoad:"Ajouter chargement",myLoads:"Mes chargements",reports:"Rapports",profile:"Profil",expenses:"Dépenses",drivers:"Chauffeurs",payroll:"Paie",analytics:"Analytique",taxExport:"Export fiscal",maintenance:"Maintenance",inspection:"Inspection",fuelFinder:"Trouver carburant",documents:"Documents",emergency:"Urgence",jobBoard:"Offres d'emploi",community:"Communauté",signIn:"Se connecter",signOut:"Se déconnecter",save:"Enregistrer",cancel:"Annuler",loading:"Chargement...",noData:"Aucune donnée",settings:"Paramètres"},
};
function LangSelector({lang,changeLang}){
  return(<div style={{display:"flex",gap:8}}>{[["en","🇨🇦 EN"],["ar","🇸🇦 AR"],["fr","🇫🇷 FR"]].map(([code,label])=>(<button key={code} onClick={()=>changeLang(code)} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${lang===code?"#243B6E":"#ddd"}`,background:lang===code?"#243B6E":"#fff",color:lang===code?"#fff":"#666",fontWeight:700,fontSize:12,cursor:"pointer"}}>{label}</button>))}</div>);
}

export default function TruckPilot() {
  const isAdminRoute = window.location.pathname === "/admin";
  const [session, setSession] = useState(() => getSession()); // load instantly from localStorage
  const [authChecked, setAuthChecked] = useState(() => !!getSession()); // skip auth screen if we have cached session
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [loads, setLoads] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [appLoading, setAppLoading] = useState(() => !getSession()); // don't show loading if we have session
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("tp-dark")==="1");
  const [showAI, setShowAI] = useState(false);
  const [aiMode, setAIMode] = useState("chat");
  const [showWelcome, setShowWelcome] = useState(false);
  
  useEffect(() => {
    if (darkMode) document.body.classList.add("slt-dark");
    else document.body.classList.remove("slt-dark");
    localStorage.setItem("tp-dark", darkMode?"1":"0");
  }, [darkMode]);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [customRoutes, setCustomRoutes] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [tab, setTab_raw] = useState("dashboard");
  const [prevTab, setPrevTab] = useState("dashboard");
  const MAIN_TABS = ["dashboard","new","log","report","profile"];
  const scrollPositions = useRef({});

  // Listen for navigation events from Analytics action items
  useEffect(() => {
    const onTpNav = (e) => { if(e.detail?.tab) setTab(e.detail.tab); };
    window.addEventListener("tp-nav", onTpNav);
    return () => window.removeEventListener("tp-nav", onTpNav);
  }, []);

  const setTab = (newTab) => {
    // Save current scroll position before leaving
    scrollPositions.current[tab] = window.scrollY;
    setPrevTab(tab);
    setTab_raw(newTab);
    // Restore scroll position for the new tab, or go to top
    setTimeout(() => {
      window.scrollTo(0, scrollPositions.current[newTab] || 0);
    }, 50);
  };
  const goBack = () => {
    scrollPositions.current[tab] = window.scrollY;
    setTab_raw(prevTab);
    setPrevTab("dashboard");
    setTimeout(() => {
      window.scrollTo(0, scrollPositions.current[prevTab] || 0);
    }, 50);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [userPlan, setUserPlan] = useState("free");
  const [detailLoad, setDetailLoad] = useState(null);
  const [tripSummaryLoad, setTripSummaryLoad] = useState(null);
  const [inspectionAlerts, setInspectionAlerts] = useState([]);
  const { showUpdate, applyUpdate } = useServiceWorkerUpdate();
  const { isOnline, queueCount } = useOfflineSync(session);

  // ── Poll for clear_flag every 30s while app is active ────────────────────────
  useEffect(() => {
    if (!session) return;
    const checkClearFlag = async () => {
      try {
        const { data: profile } = await sb.from("profiles").select("clear_flag").eq("id", session.uid).maybeSingle();
        if (!profile?.clear_flag) return;
        const lastClear = new Date(profile.clear_flag).getTime();
        const lastWipe = parseInt(localStorage.getItem(`tp-wiped-${session.uid}`) || "0");
        if (lastClear > lastWipe) {
          // Wipe all keys for this user
          Object.keys(localStorage).filter(k => k.includes(session.uid)).forEach(k => localStorage.removeItem(k));
          localStorage.setItem(`tp-wiped-${session.uid}`, lastClear.toString());
          await sb.from("profiles").update({ clear_flag: null }).eq("id", session.uid);
          // Force reload to show fresh empty state
          window.location.reload();
        }
      } catch(e) {}
    };
    const interval = setInterval(checkClearFlag, 30000);
    return () => clearInterval(interval);
  }, [session?.uid]);
  const [lang, setLang] = useState(() => localStorage.getItem("tp-lang") || "en");
  const changeLang = (l) => { setLang(l); localStorage.setItem("tp-lang", l); };
  const t = (key) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
  const [showLoadPhotos, setShowLoadPhotos] = useState(null);
  const [docBannerDismissed, setDocBannerDismissed] = useState(() => sessionStorage.getItem("tp-doc-banner-dismissed") === "1");
  const [docBannerDocs, setDocBannerDocs] = useState([]);

  useEffect(() => {
    if (!session) return;
    const docsKey = `tp-docs-${session.uid}`;
    try {
      const docs = JSON.parse(localStorage.getItem(docsKey) || "[]");
      const today = new Date();
      const expiring = docs.filter(d => {
        if (!d.expiry) return false;
        const diff = (new Date(d.expiry) - today) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      });
      setDocBannerDocs(expiring);
    } catch(e) {}
  }, [session?.uid]);

  // ── App Notifications ─────────────────────────────────────────────────────────
  const [appNotifications, setAppNotifications] = useState([]);
  const [dismissedNotifs, setDismissedNotifs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("tp_dismissed_notifs") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data } = await sb.from("app_notifications")
          .select("*")
          .eq("active", true)
          .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
          .order("created_at", { ascending: false });
        setAppNotifications(data || []);
      } catch(e) {}
    };
    fetchNotifications();
    // Poll every 60 seconds for new notifications
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const dismissNotif = (id) => {
    const updated = [...dismissedNotifs, id];
    setDismissedNotifs(updated);
    sessionStorage.setItem("tp_dismissed_notifs", JSON.stringify(updated));
  };

  const visibleNotifs = appNotifications.filter(n => {
    if (dismissedNotifs.includes(n.id)) return false;
    if (n.visibility === "before") return false; // before-only shown on login screen
    if (n.target === "all") return true;
    if (n.target === "owners" && isOwner) return true;
    if (n.target === "drivers" && !isOwner) return true;
    if (n.target === "specific" && session && n.target_uid === session.uid) return true;
    return false;
  });

  // Load inspection alerts for owner
  const refreshInspectionAlerts = (s) => {
    if (s && (s.role === "owner")) {
      setInspectionAlerts(getInspectionAlerts(s.ownerUid || s.uid));
    }
  };
  const [editLoad, setEditLoad] = useState(null);
  const [invoiceLoad, setInvoiceLoad] = useState(null);
  const [showUpgradeEnabled, setShowUpgradeEnabled] = useState(true);
  useEffect(() => {
    sb.from("settings").select("rates").eq("user_id", "55661ff3-cd77-4e29-8de3-a4e2ad129dca").maybeSingle().then(({ data }) => {
      if (data?.rates?.showUpgradeOption !== undefined) {
        setShowUpgradeEnabled(data.rates.showUpgradeOption);
      }
    }).catch(() => {});
  }, []);

  // ── On mount: restore session and load Supabase data ─────────────────────────
  useEffect(() => {
    // Immediately load from localStorage so no white screen
    const cachedSession = getSession();
    if (cachedSession) {
      loadLocalData(cachedSession);
      setAuthChecked(true);
    }
    // Then verify with Supabase in background and refresh data
    sb.auth.getSession().then(({ data: { session: sbSess } }) => {
      setAuthChecked(true);
      if (sbSess) { loadSupabaseData(sbSess); }
      else if (!cachedSession) { setAppLoading(false); }
    }).catch(() => { setAuthChecked(true); if (!cachedSession) setAppLoading(false); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, sbSess) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      } else if (event === 'SIGNED_IN' && sbSess) {
        loadSupabaseData(sbSess);
      } else if (event === 'SIGNED_OUT') {
        setAuthChecked(true);
      }
      // Ignore TOKEN_REFRESHED and other events — they cause full re-renders
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadSupabaseData = async (sbSess, silent=false) => {
    const uid = sbSess.user.id;
    const profile = await sbGetProfile(uid);
    const ownerUid = profile?.owner_uid || uid;
    const sess = {
      uid, email: sbSess.user.email,
      fullName: profile?.name || sbSess.user.user_metadata?.name || sbSess.user.email,
      name: profile?.name || sbSess.user.user_metadata?.name || sbSess.user.email,
      companyName: profile?.company_name || null,
      role: profile?.role || sbSess.user.user_metadata?.role || "owner",
      ownerUid, plan: profile?.plan || "free",
      inviteCode: profile?.invite_code || null,
      created_at: profile?.created_at || sbSess.user.created_at || null,
      ownerRating: profile?.owner_rating || null,
      supabase: true,
    };
    // Show onboarding for first-time users
    const onboardKey = `tp-onboarded-${uid}`;
    localStorage.setItem(onboardKey, "1"); // onboarding disabled
    // Welcome screen disabled

    saveSession(sess);
    // Check if admin flagged this account for data clear
    if (profile?.clear_flag) {
      const lastClear = new Date(profile.clear_flag).getTime();
      const lastWipe = parseInt(localStorage.getItem(`tp-wiped-${uid}`) || "0");
      if (lastClear > lastWipe) {
        // Wipe all localStorage keys for this user
        const keysToWipe = [
          `tp-loads-${uid}`, `tp-expenses-${uid}`, `tp-expensesv2-${uid}`,
          `tp-rates-${uid}`, `tp-routes-${uid}`, `tp-trucks-${uid}`,
          `tp-maint-${uid}`, `tp-ifta-${uid}`, `tp-payroll-${uid}`,
          `tp-referrals-v1`, `tp-docs-${uid}`, `tp-inspection-${uid}`,
          `tp-last-truck-${uid}`, `tp-last-route-${uid}`,
        ];
        // Also wipe any other keys that start with tp- for this uid
        Object.keys(localStorage).filter(k => k.includes(uid)).forEach(k => localStorage.removeItem(k));
        keysToWipe.forEach(k => localStorage.removeItem(k));
        localStorage.setItem(`tp-wiped-${uid}`, lastClear.toString());
        // Clear the flag in Supabase
        await sb.from("profiles").update({ clear_flag: null }).eq("id", uid);
      }
    }

    // Update session silently - don't flash loading screen
    setSession(sess);
    setUserPlan(sess.plan || "free"); // Use actual plan from Supabase
    try {
      // For drivers in a fleet, load trucks/routes from their first fleet owner
      let trucksOwnerUid = ownerUid;
      let inFleet = false;
      if (sess.role === "driver") {
        const myFleets = await sbGetMyFleets(uid);
        if (myFleets.length > 0) {
          trucksOwnerUid = myFleets[0].owner_uid;
          inFleet = true;
          // Update session with fleet info
          sess.inFleet = true;
          sess.fleetOwnerUid = myFleets[0].owner_uid;
          saveSession(sess);
        }
      }
      const [sbLoads, sbTrucks, sbSettings, sbFleetLoads] = await Promise.all([
        sbGetLoads(uid, ownerUid),
        sbGetTrucks(trucksOwnerUid),
        sbGetSettings(trucksOwnerUid),
        sess.role === "owner" ? sbGetFleetLoads(uid) : Promise.resolve([]),
      ]);
      // Merge own loads with fleet driver loads, deduplicate by id
      const allLoads = [...sbLoads];
      sbFleetLoads.forEach(l => { if (!allLoads.find(x => x.id === l.id)) allLoads.push(l); });
      setLoads(allLoads);
      setTrucks(sbTrucks);
      if (sbSettings?.rates) setRates({ ...DEFAULT_RATES, ...sbSettings.rates });
      if (sbSettings?.routes) setCustomRoutes(sbSettings.routes);
    } catch (e) { console.error("Supabase data load error:", e); setAppLoading(false); return; }
    setAppLoading(false);
    if (sess.role === "owner") {
      setInspectionAlerts(getInspectionAlerts(ownerUid));
      // Load fleet drivers from driver_fleets table
      sbGetFleetDrivers(uid).then(fd => {
        setAllDrivers(fd);
      });
    }
  };

  const loadLocalData = (s) => {
    setSession(s);
    setUserPlan(s.plan || "free");
    // Always fetch fresh plan from Supabase in background
    sbGetProfile(s.uid).then(profile => {
      if (profile?.plan !== undefined) {
        setUserPlan(profile.plan || "free");
        const updated = { ...s, plan: profile.plan || "free" };
        setSession(updated);
        saveSession(updated);
      }
    }).catch(() => {});
    setAppLoading(false); // Local data loads instantly
    const ownerUid = s.ownerUid || s.uid;
    try { const d = localStorage.getItem(loadsKey(ownerUid)); setLoads(d ? JSON.parse(d) : []); } catch {}
    try { const d = localStorage.getItem(ratesKey(ownerUid)); setRates(d ? { ...DEFAULT_RATES, ...JSON.parse(d) } : DEFAULT_RATES); } catch {}
    try { const d = localStorage.getItem(routesKey(ownerUid)); setCustomRoutes(d ? JSON.parse(d) : []); } catch {}
    try { const d = localStorage.getItem(trucksKey(ownerUid)); setTrucks(d ? JSON.parse(d) : []); } catch {}
    if (s.role === "owner") setInspectionAlerts(getInspectionAlerts(ownerUid));
  };

  const persist = async (updated) => {
    const ownerUid = session.ownerUid || session.uid;
    setLoads(updated);
    if (session?.supabase) {
      // Save each load to Supabase
      for (const load of updated) {
        sbSaveLoad(load, session.uid, ownerUid).catch(console.error);
      }
    } else {
      localStorage.setItem(loadsKey(ownerUid), JSON.stringify(updated));
    }
  };

  const handleLogin = (s) => {
    saveSession(s);
    if (s.role === "superadmin") setTab("admin");
    if (s.supabase) {
      sb.auth.getSession().then(({ data: { session: sbSess } }) => {
        if (sbSess) loadSupabaseData(sbSess);
        setAuthChecked(true);
      });
    } else {
      loadLocalData(s);
      setAuthChecked(true);
    }
  };

  const handleLogout = async () => {
    // Clear state first so UI transitions immediately — no white screen
    clearSession();
    setSession(null); setLoads([]); setRates(DEFAULT_RATES); setCustomRoutes([]); setTrucks([]);
    setAuthChecked(true);
    // Sign out from Supabase in background after UI has already updated
    if (session?.supabase) sb.auth.signOut().catch(() => {});
  };

  const saveLoad = async (load) => {
    const ex = loads.find(l => l.id === load.id);
    // CRITICAL: When editing, preserve the original owner_uid — never overwrite it
    const originalOwnerUid = ex?.owner_uid || ex?.ownerUid;
    const ownerUid = originalOwnerUid || session.ownerUid || session.uid;
    const updated = ex ? loads.map(l => l.id === load.id ? { ...load, owner_uid: ownerUid } : l) : [{ ...load, owner_uid: ownerUid }, ...loads];
    persist(updated);
    if (session?.supabase) {
      sbSaveLoad(load, session.uid, ownerUid).catch(console.error);
      // Auto-sync fuel to OWNER expenses only — never driver's expenses
      if (Number(load.fuelTotal) > 0) {
        // For fleet driver, save to fleet owner. For solo/owner, save to their own.
        const fuelOwnerUid = session.fleetOwnerUid || ownerUid;
        const fuelExp = {
          id: `fuel-${load.id}`, loadRef: load.id, category: "fuel",
          amount: Number(load.fuelTotal),
          description: `Fuel – ${load.location||"Load"} (${load.fuelLitres||"?"}L @ $${Number(load.fuelPricePerLitre||0).toFixed(3)}/L)`,
          date: load.date || todayStr(), source: "load",
          taxCategory: "Line 9220", taxLabel: "Fuel & Oil",
          ownerExpense: true
        };
        sbSaveExpense(fuelExp, fuelOwnerUid).catch(console.error);
        // Make sure it never shows in driver's expenses
        const driverExps = getStored(expensesKey(session.uid)).filter(e => e.id !== fuelExp.id);
        localStorage.setItem(expensesKey(session.uid), JSON.stringify(driverExps));
      }
    } else {
      // Load fuel = owner/business expense only
      if (Number(load.fuelTotal) > 0) {
        const ownerExpKey = expensesKey(ownerUid);
        const allOwnerExp = getStored(ownerExpKey).filter(e => e.loadRef !== load.id);
        const fuelExp = {
          id: `fuel-${load.id}`, loadRef: load.id, category: "fuel",
          amount: Number(load.fuelTotal),
          description: `Fuel – ${load.location||"Load"} (${load.fuelLitres||"?"}L @ $${Number(load.fuelPricePerLitre||0).toFixed(3)}/L)`,
          date: load.date || todayStr(), source: "load",
          taxCategory: "Line 9220", taxLabel: "Fuel & Oil", ownerExpense: true
        };
        localStorage.setItem(ownerExpKey, JSON.stringify([fuelExp, ...allOwnerExp]));
      }
    }
    setTab("log"); setEditLoad(null);
  };

  const deleteLoad = async (id) => {
    const load = loads.find(l => l.id === id);
    // Owner cannot delete a driver's load
    if (isOwner && load?.user_id && load.user_id !== session.uid) {
      alert("You cannot delete a driver's load.");
      return;
    }
    persist(loads.filter(l => l.id !== id));
    if (session?.supabase) sbDeleteLoad(id).catch(console.error);
  };

  const toggleComplete = async (id, completed) => {
    const updated = loads.map(l => l.id === id ? { ...l, completed, completedAt: completed ? new Date().toISOString() : null } : l);
    persist(updated);
    if (completed) fireConfetti(); // 🎉 celebrate!
    if (session?.supabase) {
      const load = updated.find(l => l.id === id);
      const ownerUid = session.ownerUid || session.uid;
      sbSaveLoad(load, session.uid, ownerUid).catch(console.error);
    }
    if (detailLoad?.id === id) setDetailLoad(updated.find(l => l.id === id));
  };

  const addNote = (loadId, text, author) => {
    const msg = { text, authorUid: author.uid, authorName: author.fullName || author.name, timestamp: new Date().toISOString() };
    const updated = loads.map(l => l.id === loadId ? { ...l, messages: [...(l.messages || []), msg] } : l);
    persist(updated);
    if (detailLoad?.id === loadId) setDetailLoad(updated.find(l => l.id === loadId));
  };

  if (showResetPassword) return <><GlobalCSS darkMode={darkMode} /><ResetPasswordScreen onDone={() => { setShowResetPassword(false); }} /></>;
  if (!authChecked) return (
    <div style={{position:"fixed",inset:0,background:"#1a2744",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <GlobalCSS darkMode={darkMode} />
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="2" width="14" height="22" rx="3" stroke="#FFD700" strokeWidth="1.8"/>
          <rect x="13" y="0.5" width="6" height="2.5" rx="1.2" fill="#FFD700"/>
          <circle cx="16" cy="21" r="1.5" fill="#FFD700"/>
          <line x1="4" y1="9" x2="7" y2="9" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2.5" y1="13" x2="7" y2="13" stroke="#FFD700" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="4" y1="17" x2="7" y2="17" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="13" y="7" width="4" height="6" rx="1" fill="#FFD700"/>
          <rect x="13" y="9" width="3" height="3.5" rx="0.5" fill="#1a2744"/>
          <rect x="8" y="9.5" width="6" height="4" rx="1" fill="#FFD700"/>
          <circle cx="10" cy="15" r="2" fill="#0f1a33"/>
          <circle cx="10" cy="15" r="0.8" fill="#FFD700"/>
          <circle cx="16" cy="15" r="2" fill="#0f1a33"/>
          <circle cx="16" cy="15" r="0.8" fill="#FFD700"/>
          <rect x="17" y="4" width="1.5" height="5" rx="0.75" fill="#FFD700"/>
        </svg>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:32,letterSpacing:4}}>
          <span style={{color:"#fff"}}>TRUCK</span><span style={{color:"#FFD700"}}>PILOT</span>
        </div>
      </div>
      <div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,.2)",overflow:"hidden"}}>
        <div style={{width:"100%",height:"100%",background:"#FFD700",borderRadius:2,animation:"tp-load 1.2s ease-in-out infinite"}}/>
      </div>
      <style>{`@keyframes tp-load{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
    </div>
  );
  if (!session && isAdminRoute) return <AdminLoginScreen onLogin={handleLogin} />;
  if (!session) return <><GlobalCSS darkMode={darkMode} /><AuthScreen onLogin={handleLogin} loginNotifs={appNotifications.filter(n => n.active && (n.visibility === "before" || n.visibility === "both") && !dismissedNotifs.includes(n.id))} onDismissNotif={dismissNotif} /></>;

  const isSuperAdmin = session.role === "superadmin";

  // Super Admin sees ONLY the Admin Panel — clean and separate
  if (isSuperAdmin) return (
    <div style={{ fontFamily:"'Barlow',sans-serif", minHeight:"100vh", background:"#f5f0ff" }}>
      <GlobalCSS darkMode={darkMode} />
      {/* Admin Top Nav */}
      <div style={{ background:"linear-gradient(135deg,#1a0030,#243B6E)", padding:"0 20px", position:"sticky", top:0, zIndex:200, boxShadow:"0 2px 20px rgba(0,0,0,0.3)", height:56, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        {/* Left placeholder for balance */}
        <div style={{width:80}} />
        {/* Logo centered */}
        <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"baseline",gap:0}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:36,color:"#fff",letterSpacing:6,textDecoration:"underline",textDecorationColor:"#FFD700",textUnderlineOffset:5,textDecorationThickness:3}}>TRUCK</span>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:36,color:"#FFD700",letterSpacing:6}}>PILOT</span>
        </div>
        {/* ADMIN + Sign Out on right */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,color:"#fff",fontSize:28,letterSpacing:2}}>ADMIN</span>
          <button onClick={handleLogout} style={{ padding:"6px 16px", borderRadius:8, border:"none", background:"rgba(255,255,255,0.15)", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>Sign Out</button>
        </div>
      </div>
      <SuperAdminTab session={session} />
    </div>
  );

  const isOwner = session.role === "owner";
  const ownerUid = session.ownerUid || session.uid;
  // allDrivers comes from Supabase fleet drivers (loaded in useEffect below)
  // Use state allDrivers which is populated from sbGetFleetDrivers
  const mergedRoutes = customRoutes.map(r => ({ ...r, billingMethod: r.billingMethod || "per_load", rate: r.rate || 0 }));
  // visibleLoads — fleet loads already filtered at fetch time by sbGetFleetLoads
  const visibleLoads = isOwner
    ? loads // all loads already fetched correctly (own + fleet drivers after join date)
    : loads.filter(l => l.assignedDriverUid === session.uid || l.addedBy === session.uid || l.user_id === session.uid);
  const unreadMessages = visibleLoads.filter(l => l.messages && l.messages.some(m => m.authorUid !== session.uid)).length;
  const plan = userPlan;
  const handleUpgrade = (planId) => { setUserPlan(planId); };

  const openUpgrade = () => { if (showUpgradeEnabled) setShowUpgrade(true); };

  // Extended nav items for ALL users
  const allOwnerTabs = ["dashboard","log","new","expenses","drivers","messages","fuel_finder","profit","maintenance","report","ifta","payroll","analytics","documents","loadboard","tax","emergency"];
  const allDriverTabs = ["dashboard","log","new","expenses","messages","fuel_finder","profit","maintenance","report","analytics","documents","emergency"];

  // Nav items for dropdown
  const ownerNavItems = [
    { id:"dashboard",     icon:"🏠", label:"Dashboard",    core:true },
    { id:"new",           icon:"➕", label:"Add Load",     core:true },
    { id:"log",           icon:"📋", label:"My Loads",      core:true },
    { id:"report",        icon:"📊", label:"Reports",       core:true },
    { id:"drivers",       icon:"👥", label:"Drivers",       core:true },
    { id:"expenses",      icon:"🧾", label:"Expenses",      core:true },
    { id:"support_inbox", icon:"🎧", label:"Inbox",         core:true },
    { id:"payroll",       icon:"💵", label:"Payroll",       core:false },
    { id:"analytics",     icon:"📈", label:"Analytics",     core:false },
    { id:"tax",           icon:"🗂", label:"Tax Export",    core:false },
    { id:"maintenance",   icon:"🔧", label:"Maintenance",   core:false },
    { id:"inspection",    icon:"🔍", label:"Inspection",    core:false, badge: inspectionAlerts.filter(a=>!a.read).length||0 },
    { id:"fuel_finder",   icon:"⛽", label:"Fuel Finder",   core:false },
    { id:"documents",     icon:"📁", label:"Documents",     core:false },
    { id:"emergency",     icon:"🚨", label:"Emergency",     core:false },
  ];
  const driverNavItems = [
    { id:"dashboard",   icon:"🏠", label:"Dashboard",  core:true },
    { id:"new",         icon:"➕", label:"Add Load",   core:true },
    { id:"log",         icon:"📋", label:"My Loads",   core:true },
    { id:"report",      icon:"📊", label:"Reports",    core:true },
    { id:"expenses",    icon:"🧾", label:"Expenses",   core:true },
    { id:"contact",     icon:"💬", label:"Support",    core:true },
    { id:"tax",         icon:"🗂", label:"Tax Export", core:false },
    { id:"maintenance", icon:"🔧", label:"Maintenance",core:false },
    { id:"analytics",   icon:"📈", label:"Analytics",  core:false },
    { id:"fuel_finder", icon:"⛽", label:"Fuel Finder",core:false },
    { id:"inspection",  icon:"🔍", label:"Inspection", core:false },
    { id:"documents",   icon:"📁", label:"Documents",  core:false },
    { id:"emergency",   icon:"🚨", label:"Emergency",  core:false },
  ];

  return (
    <div style={{ fontFamily: "'Barlow',sans-serif", minHeight: "100vh", width: "100%", maxWidth: "100vw", overflowX: "hidden", position: "relative" }}>
      {/* ── Update banner ── */}
      {showUpdate && (
        <div onClick={applyUpdate} style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "#243B6E", color: "#fff", textAlign: "center",
          padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer"
        }}>
          🚀 New update available — tap here to refresh!
        </div>
      )}
      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:9997, background:"#B45309", color:"#fff", textAlign:"center", padding:"10px", fontSize:13, fontWeight:700 }}>
          📵 You're offline — loads will sync when you reconnect {queueCount > 0 ? `(${queueCount} queued)` : ""}
        </div>
      )}
      {/* ── Document Expiry Banner (once per session) ── */}
      {!docBannerDismissed && docBannerDocs.length > 0 && isOnline && (
        <div style={{ position:"fixed", top: showUpdate || !isOnline ? 52 : 0, left:0, right:0, zIndex:9996, background:"#92400e", color:"#fff", padding:"10px 48px 10px 16px", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:10 }}>
          <span>⚠️</span>
          <span>{docBannerDocs.length} document{docBannerDocs.length>1?"s":""} expiring soon — tap to view</span>
          <button onClick={()=>setTab("documents")} style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:8, padding:"3px 10px", fontSize:12, fontWeight:800, cursor:"pointer", marginLeft:4 }}>View</button>
          <button onClick={()=>{ setDocBannerDismissed(true); sessionStorage.setItem("tp-doc-banner-dismissed","1"); }} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:"50%", width:28, height:28, fontSize:16, cursor:"pointer" }}>✕</button>
        </div>
      )}
      {/* ── App Notifications banners ── */}
      {!showUpdate && visibleNotifs.map((notif, idx) => {
        const colors = {
          update:      { bg:"#243B6E", color:"#fff", icon:"🚀" },
          maintenance: { bg:"#B45309", color:"#fff", icon:"🔧" },
          announcement:{ bg:"#166534", color:"#fff", icon:"📣" },
          info:        { bg:"#1e3a5f", color:"#fff", icon:"💬" },
        };
        const style = colors[notif.type] || colors.info;
        return (
          <div key={notif.id} style={{
            position: "fixed", top: idx * 52, left: 0, right: 0, zIndex: 9998 - idx,
            background: style.bg, color: style.color,
            padding: "12px 48px 12px 16px", fontSize: 14, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
          }}>
            <span style={{ fontSize: 18 }}>{style.icon}</span>
            <div style={{ flex: 1 }}>
              {notif.title && <span style={{ fontWeight: 900, marginRight: 8 }}>{notif.title}:</span>}
              {notif.message}
            </div>
            <button onClick={() => dismissNotif(notif.id)} style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
              borderRadius: "50%", width: 28, height: 28, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900
            }}>✕</button>
          </div>
        );
      })}
      <GlobalCSS darkMode={darkMode} />
      <div className="slt-nav-safe" />
      <NavBar
        session={session}
        tab={tab}
        setTab={setTab}
        setShowSettings={setShowSettings}
        onDarkToggle={()=>setDarkMode(d=>!d)}
        darkModeOn={darkMode}
        onLogout={handleLogout}
        isOwner={isOwner}
        isSuperAdmin={isSuperAdmin}
        unreadMessages={unreadMessages}
        navItems={isOwner ? ownerNavItems : driverNavItems}
        plan={plan}
        openUpgrade={openUpgrade}
        onEditProfile={()=>setShowEditProfile(true)}
      />

      {/* ── Core tabs ── */}
      {tab === "dashboard"  && appLoading && !session && <SkeletonDashboard />}
      {tab === "dashboard"  && (!appLoading || session) && <DashboardTab   session={session} loads={visibleLoads} rates={rates} isOwner={isOwner} setTab={setTab} allDrivers={allDrivers} trucks={trucks} plan={plan} openUpgrade={showUpgradeEnabled ? openUpgrade : null} inspectionAlerts={inspectionAlerts} setShowAI={setShowAI} setAIMode={setAIMode} onClearAlert={(id)=>{ const updated = inspectionAlerts.map(a=>a.id===id?{...a,read:true}:a); setInspectionAlerts(updated); saveInspectionAlerts(session.ownerUid||session.uid, updated); }} />}
      {tab === "log"        && <HaulLogTab      session={session} loads={visibleLoads} rates={rates} isOwner={isOwner} trucks={trucks} setTab={setTab} setEditLoad={setEditLoad} deleteLoad={deleteLoad} setDetailLoad={setDetailLoad} toggleComplete={toggleComplete} allDrivers={allDrivers} />}
      {tab === "new"        && <LoadFormTab     session={session} isOwner={isOwner} rates={rates} allRoutes={mergedRoutes} trucks={trucks} onSave={saveLoad} editLoad={editLoad} onCancel={() => { setEditLoad(null); goBack(); }} />}
      {tab === "expenses"   && <ExpensesTab     session={session} isOwner={isOwner} allLoads={loads} goBack={goBack} />}
      {tab === "drivers"    && isOwner && (canAccessFeature(plan,"drivers") ? <DriversTab session={session} loads={loads} rates={rates} goBack={goBack} /> : <PlanGate feature="drivers" plan={plan} onUpgrade={openUpgrade} />)}
      {tab === "drivers"    && !isOwner && <div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">🔒 Owner Only</div><div className="slt-hero-sub">Driver management is for fleet owners</div></div></div>}
      {tab === "fuel_finder"&& <FuelFinderTab goBack={goBack} />}
      {tab === "restaurants"&& <RestaurantFinderTab />}
      {tab === "profit"     && <ProfitTab       isOwner={isOwner} />}
      {tab === "maintenance"&& <MaintenanceTab  session={session} isOwner={isOwner} trucks={trucks} goBack={goBack} />}
      {tab === "report"     && <ReportTab       loads={visibleLoads} session={session} rates={rates} isOwner={isOwner} allDrivers={allDrivers} goBack={goBack} setTab={setTab} setDetailLoad={setDetailLoad} />}
      {tab === "messages"   && <MessagesTab     session={session} loads={visibleLoads} isOwner={isOwner} onAddNote={addNote} />}

      {/* ── New Premium tabs ── */}
      {tab === "ifta"       && isOwner && (canAccessFeature(plan,"ifta") ? <IFTATab session={session} loads={visibleLoads} /> : <PlanGate feature="ifta" plan={plan} onUpgrade={openUpgrade} />)}
      {tab === "ifta"       && !isOwner && <div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">🔒 Owner Only</div><div className="slt-hero-sub">IFTA Tax is managed by your fleet owner</div></div></div>}
      {tab === "payroll"    && isOwner && (canAccessFeature(plan,"payroll") ? <PayrollTab session={session} loads={loads} rates={rates} allDrivers={allDrivers} goBack={goBack} /> : <PlanGate feature="payroll" plan={plan} onUpgrade={openUpgrade} />)}
      {tab === "payroll"    && !isOwner && <div className="slt-page"><div className="slt-hero"><div className="slt-hero-title">🔒 Owner Only</div></div></div>}
      {tab === "analytics"  && <AnalyticsTab    session={session} loads={visibleLoads} isOwner={isOwner} rates={rates} goBack={goBack} />}
      {tab === "documents"  && <DocumentsTab    session={session} goBack={goBack} />}
      {tab === "loadboard"  && (canAccessFeature(plan,"loadboard") ? <LoadBoardTab session={session} /> : <PlanGate feature="loadboard" plan={plan} onUpgrade={openUpgrade} />)}
      {tab === "financial_reports" && <FinancialReportsTab session={session} loads={visibleLoads} rates={rates} isOwner={isOwner} allDrivers={allDrivers} goBack={goBack} />}
      {tab === "tax"        && <TaxTab          session={session} isOwner={isOwner} allLoads={loads} goBack={goBack} />}
      {tab === "referral"   && <ReferralTab     session={session} />}
      {tab === "emergency"  && <EmergencyTab goBack={goBack} />}
      {tab === "inspection" && <InspectionTab session={session} onAlertSaved={()=>{ if(session.role==="owner") setInspectionAlerts(getInspectionAlerts(session.ownerUid||session.uid)); }} goBack={goBack} />}
      {tab === "contact"    && <ContactUsTab session={session} onBack={goBack} />}
      {tab === "jobboard"   && <JobBoardTab session={session} goBack={goBack} />}
      {tab === "community"  && <CommunityTab session={session} goBack={goBack} />}
      {tab === "profile"    && <ProfileTab session={session} loads={visibleLoads} trucks={trucks} plan={plan} isOwner={isOwner} onLogout={handleLogout} setTab={setTab} setShowSettings={setShowSettings} onDarkToggle={()=>setDarkMode(d=>!d)} darkModeOn={darkMode} onEditProfile={()=>setShowEditProfile(true)} openUpgrade={showUpgradeEnabled ? openUpgrade : null} lang={lang} changeLang={changeLang} />}
      {tab === "driver_ratings"   && <DriverRatingsTab session={session} loads={visibleLoads} allDrivers={allDrivers} isOwner={isOwner} goBack={goBack} />}
      {tab === "fuel_log"         && <FuelLogTab2 session={session} trucks={trucks} goBack={goBack} />}
      {tab === "doc_expiry"       && <DocExpiryTab session={session} isOwner={isOwner} goBack={goBack} />}
      {tab === "support_inbox" && isOwner && <SupportInboxTab session={session} />}
      {tab === "admin" && isSuperAdmin && <SuperAdminTab session={session} />}

      {/* ── Welcome Screen ── */}
{/* WelcomeScreen disabled */}

{/* AI Assistant modal removed */}

      {/* ── Bottom Tab Bar (mobile) ── */}
      {!isSuperAdmin && (
        <BottomTabBar tab={tab} setTab={setTab} isOwner={isOwner} unreadMessages={unreadMessages} inspectionAlerts={inspectionAlerts} />
      )}

      {/* ── Onboarding ── */}
{/* OnboardingScreen disabled */}

{/* Floating buttons removed */}

      {/* ── Modals ── */}
      {showLoadPhotos && <LoadPhotosModal load={showLoadPhotos} session={session} onClose={()=>setShowLoadPhotos(null)} onPhotosUpdated={(photos)=>{ setShowLoadPhotos(prev=>prev?{...prev,photos}:null); }} />}
      {detailLoad && <LoadDetailModal load={detailLoad} onClose={() => setDetailLoad(null)} rates={rates} isOwner={isOwner} trucks={trucks} session={session} onToggleComplete={toggleComplete} onGenerateInvoice={(l) => { setInvoiceLoad(l); setDetailLoad(null); }} onAddNote={addNote} onSummary={() => { setTripSummaryLoad(detailLoad); setDetailLoad(null); }} onViewPhotos={(l)=>{ setShowLoadPhotos(l); setDetailLoad(null); }} />}
      {invoiceLoad && <InvoiceModal load={invoiceLoad} onClose={() => setInvoiceLoad(null)} rates={rates} trucks={trucks} session={session} />}
      {showSettings && (isOwner || (!isOwner && (session.ownerUid === session.uid || !session.ownerUid))) && !(session.role==="driver" && session.inFleet) && <SettingsModal session={session} rates={rates} setRates={setRates} customRoutes={customRoutes} setCustomRoutes={setCustomRoutes} trucks={trucks} setTrucks={setTrucks} onClose={() => setShowSettings(false)} />}
      {showUpgrade && showUpgradeEnabled && <UpgradeModal session={session} onClose={() => setShowUpgrade(false)} onUpgrade={handleUpgrade} />}
      {showEditProfile && <EditProfileModal session={session} onClose={()=>setShowEditProfile(false)} onSave={(newName, newCompany)=>{ setSession(s=>({...s,fullName:newName,name:newName,companyName:newCompany})); }} />}
      {tripSummaryLoad && <TripSummaryModal load={tripSummaryLoad} onClose={() => setTripSummaryLoad(null)} rates={rates} session={session} trucks={trucks} />}

      {/* Footer — minimal, clean */}
      <div style={{ background:C.navy, padding:"16px 24px", textAlign:"center", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
        <p style={{ color:"rgba(255,255,255,0.25)", fontSize:10, margin:0, fontFamily:"'Barlow',sans-serif" }}>
          TruckPilot ✈️ · v4.0 · © 2025 · Log Loads. Save Taxes. Stay Compliant.
        </p>
      </div>
    </div>
  );
}
