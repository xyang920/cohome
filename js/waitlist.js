// Waitlist adapter: Supabase when configured, otherwise browser-only demo storage.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LOCAL_KEY = 'sp-waitlist';

export const isLiveStorage = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function saveToSupabase(entry) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      name: entry.name,
      email: entry.email,
      preferred_tier: entry.tier,
      deposit_interest: entry.deposit,
    }),
  });
  if (res.status === 409) return { ok: true, duplicate: true };
  if (!res.ok) throw new Error(`Waitlist service returned ${res.status}`);
  return { ok: true };
}

function saveLocally(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    const duplicate = list.some((e) => e.email === entry.email);
    if (!duplicate) list.push({ ...entry, createdAt: new Date().toISOString() });
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    return { ok: true, duplicate, local: true };
  } catch {
    // Storage blocked (private window etc.) — still acknowledge in demo mode.
    return { ok: true, local: true, unsaved: true };
  }
}

/** Save a validated waitlist entry. Throws only on a live-storage failure. */
export async function saveWaitlistEntry(entry) {
  return isLiveStorage() ? saveToSupabase(entry) : saveLocally(entry);
}
