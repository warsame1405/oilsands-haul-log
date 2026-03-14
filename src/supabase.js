// ─── TruckIQ Supabase Configuration ──────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ilfooyjtbtpsmzaezroj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eejIrxmMGgnBdKie9W0ZQA_7oW1Ewtv";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const signUp = async (email, password, meta) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: meta }, // { name, role, company }
  });
  return { data, error };
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

export const getSession = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};

export const onAuthChange = (callback) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
};

// ─── LOADS ────────────────────────────────────────────────────────────────────

export const fetchLoads = async (userId) => {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('fetchLoads error:', error);
  return data || [];
};

export const saveLoad = async (load) => {
  const { data, error } = await supabase
    .from('loads')
    .upsert(load, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('saveLoad error:', error);
  return data;
};

export const deleteLoad = async (id) => {
  const { error } = await supabase.from('loads').delete().eq('id', id);
  if (error) console.error('deleteLoad error:', error);
};

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

export const fetchExpenses = async (userId) => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('fetchExpenses error:', error);
  return data || [];
};

export const saveExpense = async (expense) => {
  const { data, error } = await supabase
    .from('expenses')
    .upsert(expense, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('saveExpense error:', error);
  return data;
};

export const deleteExpense = async (id) => {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) console.error('deleteExpense error:', error);
};

// ─── DRIVERS ──────────────────────────────────────────────────────────────────

export const fetchDrivers = async (ownerUid) => {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('owner_uid', ownerUid);
  if (error) console.error('fetchDrivers error:', error);
  return data || [];
};

export const saveDriver = async (driver) => {
  const { data, error } = await supabase
    .from('drivers')
    .upsert(driver, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('saveDriver error:', error);
  return data;
};

export const deleteDriver = async (id) => {
  const { error } = await supabase.from('drivers').delete().eq('id', id);
  if (error) console.error('deleteDriver error:', error);
};

// ─── TRUCKS ───────────────────────────────────────────────────────────────────

export const fetchTrucks = async (userId) => {
  const { data, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('user_id', userId);
  if (error) console.error('fetchTrucks error:', error);
  return data || [];
};

export const saveTruck = async (truck) => {
  const { data, error } = await supabase
    .from('trucks')
    .upsert(truck, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('saveTruck error:', error);
  return data;
};

export const deleteTruck = async (id) => {
  const { error } = await supabase.from('trucks').delete().eq('id', id);
  if (error) console.error('deleteTruck error:', error);
};

// ─── MAINTENANCE ──────────────────────────────────────────────────────────────

export const fetchMaintenance = async (userId) => {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('fetchMaintenance error:', error);
  return data || [];
};

export const saveMaintenance = async (record) => {
  const { data, error } = await supabase
    .from('maintenance')
    .upsert(record, { onConflict: 'id' })
    .select()
    .single();
  if (error) console.error('saveMaintenance error:', error);
  return data;
};

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export const fetchMessages = async (userId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) console.error('fetchMessages error:', error);
  return data || [];
};

export const sendMessage = async (message) => {
  const { data, error } = await supabase
    .from('messages')
    .insert(message)
    .select()
    .single();
  if (error) console.error('sendMessage error:', error);
  return data;
};

// ─── RATES / SETTINGS ─────────────────────────────────────────────────────────

export const fetchRates = async (userId) => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('fetchRates error:', error);
  return data?.rates || null;
};

export const saveRates = async (userId, rates) => {
  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, rates }, { onConflict: 'user_id' });
  if (error) console.error('saveRates error:', error);
};

// ─── USER PROFILE ─────────────────────────────────────────────────────────────

export const fetchProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) console.error('fetchProfile error:', error);
  return data;
};

export const saveProfile = async (profile) => {
  const { error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' });
  if (error) console.error('saveProfile error:', error);
};
