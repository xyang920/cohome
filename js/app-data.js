// Views for the database-backed tabs: profile/community cards, community comparison, data tables.
import { RISK_LABELS, SAFETY_LABELS } from './schema.js';
import { esc } from './ui.js';

const meter = (level, goodHigh) => {
  const color = goodHigh ? (level >= 4 ? 'bg-moss' : level === 3 ? 'bg-amber-500' : 'bg-clay')
    : (level <= 2 ? 'bg-moss' : level === 3 ? 'bg-amber-500' : 'bg-clay');
  return `<span class="inline-flex gap-1 align-middle" aria-hidden="true">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="block h-2 w-5 rounded-full ${i <= level ? color : 'bg-stone-200'}"></i>`).join('')}</span>`;
};

export const riskView = (n) => `${meter(n, false)} <span class="text-sm">${n}/5 · ${esc(RISK_LABELS[n])}</span>`;
export const safetyView = (n) => `${meter(n, true)} <span class="text-sm">${n}/5 · ${esc(SAFETY_LABELS[n])}</span>`;
const chips = (items) => items.map((a) => `<span class="badge badge-muted">${esc(a)}</span>`).join(' ');

export function profileCard(r) {
  return `<div class="card">
    <h2 class="font-semibold">Profile</h2>
    <dl class="mt-3 grid grid-cols-2 gap-y-2 text-sm">
      <dt class="text-stone-500">Name</dt><dd>${esc(r.user.firstName)} ${esc(r.user.lastName)}</dd>
      <dt class="text-stone-500">Date of birth</dt><dd>${esc(r.user.dateOfBirth)} (age ${r.age})</dd>
      <dt class="text-stone-500">Member id</dt><dd class="font-mono">${esc(r.user.id)}</dd>
      <dt class="text-stone-500">Property id</dt><dd class="font-mono">${esc(r.property.id)}</dd>
      <dt class="text-stone-500">Tier</dt><dd>${esc(r.tier.id)} · ${esc(r.tier.name)}</dd>
    </dl></div>`;
}

export function communityCard(c, { title = 'Your community', extra = '' } = {}) {
  return `<div class="card">
    <h2 class="font-semibold">${esc(title)}</h2>
    <p class="mt-1 text-lg">${esc(c.location)}</p>
    <dl class="mt-3 space-y-3 text-sm">
      <div><dt class="label">Investment risk</dt><dd class="mt-1 whitespace-nowrap">${riskView(c.riskLevel)}</dd></div>
      <div><dt class="label">Safety</dt><dd class="mt-1 whitespace-nowrap">${safetyView(c.safetyLevel)}</dd></div>
    </dl>
    <div class="mt-3 flex flex-wrap gap-1">${chips(c.amenities)}</div>${extra}
    <p class="mt-3 text-xs text-stone-500">Risk and safety scores are illustrative demo data.</p></div>`;
}

export function renderCommunities(db, homeId) {
  return db.communityStats().map((s) => {
    const tiers = Object.entries(s.byTier)
      .map(([t, v]) => `<li>Tier ${esc(t)}: <strong>${v.free}</strong> free of ${v.units}</li>`).join('');
    const extra = `
      <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><p class="label">Homes</p><ul class="mt-1 space-y-0.5">${tiers}</ul></div>
        <div><p class="label">Members</p><p class="mt-1">${s.members} of ${s.units} homes occupied</p>
          <p class="text-stone-500">${s.totalShares.toLocaleString()} shares held</p></div>
      </div>`;
    const title = s.community.id === homeId ? 'Your community' : 'Community';
    return `<div class="${s.community.id === homeId ? 'ring-2 ring-moss rounded-[1.25rem]' : ''}">${communityCard(s.community, { title, extra })}</div>`;
  }).join('');
}

const table = (headers, rows) => `
  <div class="overflow-x-auto"><table class="w-full text-sm">
    <thead><tr class="text-left text-stone-500 border-b border-stone-200">${headers.map((h) => `<th class="py-2 pr-4 font-medium">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('') || `<tr><td class="py-3 text-stone-500" colspan="${headers.length}">No rows</td></tr>`}</tbody>
  </table></div>`;

const td = (v, cls = '') => `<td class="py-2 pr-4 ${cls}">${v}</td>`;

export function renderDataTables(db, protectedUserId) {
  const users = table(['Id', 'First name', 'Last name', 'Date of birth', 'Shares', 'Property id', ''],
    db.users.findAll().map((u) => `<tr class="border-b border-stone-100">
      ${td(esc(u.id), 'font-mono')}${td(esc(u.firstName))}${td(esc(u.lastName))}${td(esc(u.dateOfBirth))}
      ${td(String(u.shares))}${td(esc(u.propertyId), 'font-mono')}
      ${td(u.id === protectedUserId ? '<span class="text-stone-400">you</span>' : `<button class="underline text-red-700" data-remove-user="${esc(u.id)}">Remove</button>`)}</tr>`));

  const portfolio = table(['Id', 'Tier type', 'Community id', 'Occupied by'],
    db.portfolio.findAll().map((p) => {
      const occ = db.occupantOf(p.id);
      return `<tr class="border-b border-stone-100">${td(esc(p.id), 'font-mono')}${td(esc(p.tier))}${td(esc(p.communityId), 'font-mono')}
        ${td(occ ? esc(occ.id) : '<span class="badge badge-good">free</span>')}</tr>`;
    }));

  const communities = table(['Id', 'Risk level', 'Location', 'Amenity', 'Safety level'],
    db.communities.findAll().map((c) => `<tr class="border-b border-stone-100 align-top">
      ${td(esc(c.id), 'font-mono')}${td(String(c.riskLevel))}${td(esc(c.location))}${td(esc(c.amenities.join(', ')))}${td(String(c.safetyLevel))}</tr>`));

  return { users, portfolio, communities };
}

export function freeUnitOptions(db) {
  return db.freeUnits({}).map((p) => {
    const c = db.communities.findById(p.communityId);
    return `<option value="${esc(p.id)}">${esc(p.id)} · Tier ${esc(p.tier)} · ${esc(c ? c.location : p.communityId)}</option>`;
  }).join('');
}
