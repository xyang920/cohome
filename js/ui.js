// Shared UI helpers: escaping, icons and schematic floor plans.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  join: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  live: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
  move: '<path d="M17 3l4 4-4 4"/><path d="M21 7H9"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h12"/>',
  grow: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  kitchen: '<path d="M4 3h16v6H4z"/><path d="M4 9v12h16V9"/><path d="M9 13h6"/>',
  desk: '<rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  bed: '<path d="M2 18V6M2 12h20v6M22 18v-4a3 3 0 0 0-3-3h-8v4"/><circle cx="7" cy="10" r="2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
};

export const icon = (name, cls = 'h-6 w-6') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// Schematic floor plans (not to scale between tiers beyond rough proportion).
const PLANS = {
  S: { w: 150, rooms: [[0, 0, 60, 50, 'Bed'], [60, 0, 40, 30, 'Bath'], [100, 0, 50, 30, 'Kitchen'], [60, 30, 90, 50, 'Desk + living'], [0, 50, 60, 30, 'Storage']] },
  M: { w: 180, rooms: [[0, 0, 70, 45, 'Sleeping alcove'], [70, 0, 45, 30, 'Bath'], [115, 0, 65, 30, 'Kitchen'], [70, 30, 110, 50, 'Living'], [0, 45, 70, 35, 'Work niche']] },
  L: { w: 220, rooms: [[0, 0, 85, 50, 'Bedroom'], [85, 0, 50, 30, 'Bath'], [135, 0, 85, 30, 'Kitchen'], [85, 30, 135, 50, 'Living'], [0, 50, 85, 30, 'Flex room']] },
};

export function floorPlan(tierId) {
  const plan = PLANS[tierId];
  if (!plan) return '';
  const rooms = plan.rooms.map(([x, y, w, h, label]) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 3}" text-anchor="middle" font-size="8" fill="currentColor">${esc(label)}</text>`).join('');
  return `<svg viewBox="-2 -2 ${plan.w + 4} 84" class="w-full h-auto text-stone-500" role="img" aria-label="Schematic floor plan, tier ${esc(tierId)}">
    <rect x="0" y="0" width="${plan.w}" height="80" fill="none" stroke="currentColor" stroke-width="2"/>${rooms}</svg>`;
}
