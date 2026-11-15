import { TIERS, MARKET_RENT, PROBLEM_STATS, BUILDINGS, SHARE_PRICE, RENT_PER_SQFT, SHARE_SPLIT, SHARES_PER_SQFT,
  EXIT_FEE_RATE, EXIT_FEE_YEARS,
} from './data.js';
import {
  getTier, projectOwnership, portfolioAllocation, validateWaitlist, formatUSD, buyoutQuote, paymentSplit, formatShares,
} from './model.js';
import { saveWaitlistEntry, isLiveStorage } from './waitlist.js';
import { esc, $, icon } from './ui.js';

const STEPS = [
  ['join', 'Join', 'Become a member and pick a tier. No mortgage, no down-payment hunt.'],
  ['live', 'Live', 'Move into a furnished home. Part of every payment buys shares.'],
  ['move', 'Move', 'Swap to another building with 30–60 days’ notice. Your equity stays with you.'],
  ['grow', 'Grow', 'Buy more shares to upsize. Own your tier outright after 20 years.'],
];

const AMENITIES = [
  ['kitchen', 'Chef’s kitchen + dining', 'Host dinners for 20+ without carrying a big kitchen yourself.'],
  ['desk', 'Coworking + focus booths', 'Hot desks, video-call booths and enterprise fiber.'],
  ['heart', 'Wellness + fitness', 'Strength, cardio and yoga space in every building.'],
  ['bed', 'Bookable guest suites', 'Space for visiting friends and family, only when you need it.'],
  ['wrench', 'We manage it', 'Maintenance, turnover and operations run by the platform. You just live there.'],
  ['users', 'A cooperative community', 'Members vote on the next building and shape how the network grows.'],
];

const FAQ = [
  ['What do I actually own?', 'Shares tied to your home’s tier, backed by real estate in the network’s property companies. The final legal vehicle (co-op, tenancy-in-common or portfolio trust) is being chosen with NYC counsel.'],
  ['How does ownership build up?', `Half of every monthly payment buys shares at ${formatUSD(SHARE_PRICE)} each; the other half covers running costs, maintenance and debt. At your tier’s base payment you own your home outright after 20 years. Paying more buys extra shares and gets you there sooner.`],
  ['Can I buy my home outright on day one?', `Yes. A buyout costs your tier’s shares × ${formatUSD(SHARE_PRICE)}, with no early-payment discount: ${TIERS.map((t) => `${t.name} ${formatUSD(t.shares * SHARE_PRICE)}`).join(', ')}. You then pay only the running-cost half each month.`],
  ['What happens when I move?', 'Request a swap with 30–60 days’ notice. If several members want the same home, priority points decide. Your shares don’t change.'],
  ['How do I earn priority points?', 'By paying your monthly fee and by buying extra shares.'],
  ['Can I sell?', `Yes. Sell any number of whole shares back to the co-op or to new members at the current share price: ${formatUSD(SHARE_PRICE)} × a building value index that starts at 1.00 and is reset once a year by appraisal, so it can rise or fall. New members buy at the same price. Sales within ${EXIT_FEE_YEARS} years of joining pay a ${EXIT_FEE_RATE * 100}% exit fee. There is no guaranteed minimum price.`],
  ['Is this an investment offer?', 'No. This is a hackathon demo; prices and terms are placeholders.'],
];

const state = { tier: 'M' };
const pct = Math.round(SHARE_SPLIT * 100);

function tierOwnership(t) {
  const split = paymentSplit(t);
  const buyout = buyoutQuote(t, 0);
  return `
      <div class="mt-5 rounded-xl bg-sand p-3 text-sm space-y-1">
        <p class="flex justify-between"><span>Builds equity each month</span><strong>${formatUSD(split.toShares)}</strong></p>
        <p class="flex justify-between text-stone-600"><span>Running costs each month</span><span>${formatUSD(split.toRunningCosts)}</span></p>
        <p class="flex justify-between border-t border-stone-200 pt-1 mt-1"><span>Buy out on day one</span><strong>${formatUSD(buyout.cost)}</strong></p>
        <p class="text-xs text-stone-500">then ${formatUSD(buyout.monthlyAfter)}/month for running costs</p>
      </div>`;
}

function renderStatic() {
  $('#stats').innerHTML = PROBLEM_STATS.map((s) => `
    <div class="card">
      <p class="font-display text-5xl text-moss">${esc(s.value)}</p>
      <p class="mt-2 text-stone-700">${esc(s.label)}</p>
      <p class="mt-3 text-xs text-stone-500">Source: ${s.href ? `<a class="underline" href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : esc(s.source)}</p>
    </div>`).join('');

  $('#steps').innerHTML = STEPS.map(([ic, title, text], i) => `
    <li class="card">
      <div class="flex items-center gap-3 text-moss">${icon(ic, 'h-8 w-8')}<span class="text-sm text-stone-400">0${i + 1}</span></div>
      <h3 class="mt-4 font-semibold text-lg">${esc(title)}</h3>
      <p class="mt-1 text-stone-600 text-sm">${esc(text)}</p>
    </li>`).join('');

  $('#tier-cards').innerHTML = TIERS.map((t) => `
    <article class="card flex flex-col ${t.id === 'M' ? 'ring-2 ring-moss' : ''}">
      <div class="flex items-baseline justify-between">
        <h3 class="font-display text-2xl">${esc(t.name)}</h3><span class="badge badge-muted">Tier ${esc(t.id)}</span>
      </div>
      <p class="text-sm text-stone-500">${esc(t.audience)}</p>
      <div class="my-5 aspect-[5/4] flex items-center justify-center">
        <img src="${esc(t.image)}" alt="${esc(t.imageAlt)}" width="1000" height="800" loading="lazy" decoding="async" class="max-h-full w-full object-contain">
      </div>
      <dl class="grid grid-cols-3 gap-2 text-center">
        <div><dt class="label">Size (sq ft)</dt><dd class="font-semibold whitespace-nowrap">${esc(t.sqft)}</dd></div>
        <div><dt class="label">Shares</dt><dd class="font-semibold">${formatShares(t.shares)}</dd></div>
        <div><dt class="label">Monthly</dt><dd class="font-semibold">${formatUSD(t.monthly)}</dd><dd class="text-xs text-stone-500">${t.areaSqft} sq ft × $${RENT_PER_SQFT}</dd></div>
      </dl>
      <ul class="mt-5 space-y-1 text-sm text-stone-600 flex-1">${t.features.map((f) => `<li>· ${esc(f)}</li>`).join('')}</ul>
      ${tierOwnership(t)}
    </article>`).join('');

  $('#amenities').innerHTML = AMENITIES.map(([ic, title, text]) => `
    <div class="card"><div class="text-clay">${icon(ic)}</div>
      <h3 class="mt-3 font-semibold">${esc(title)}</h3><p class="mt-1 text-sm text-stone-600">${esc(text)}</p></div>`).join('');

  $('#faq-list').innerHTML = FAQ.map(([q, a]) => `
    <details class="py-4 group"><summary class="cursor-pointer font-medium list-none flex justify-between">${esc(q)}<span class="text-stone-400 group-open:rotate-45 transition">+</span></summary>
      <p class="mt-2 text-stone-600 text-sm">${esc(a)}</p></details>`).join('');

  const flex = getTier(TIERS, 'M');
  $('#hero-equity').textContent = formatUSD(flex.shares * SHARE_PRICE);
  $('#hero-equity-sub').textContent = `A Flex Suite you own after 20 years at ${formatUSD(flex.monthly)}/month, or buy it out on day one`;
  $('#tiers-intro').textContent = `Furnished, with a built-in desk, modular storage and acoustic separation (STC ≥ 55). Rent is $${RENT_PER_SQFT} per square foot for every home: ${pct}% buys shares at ${formatUSD(SHARE_PRICE)} each (${SHARES_PER_SQFT} shares per square foot) and ${100 - pct}% covers running costs.`;
  $('#calc-assumptions').innerHTML = `<strong>Assumptions:</strong> ${pct}% of each base payment buys shares at ${formatUSD(SHARE_PRICE)} (so ownership reaches 100% after 20 years) and ${100 - pct}% covers running costs and debt. Anything above the base payment buys extra shares. Day-one buyouts cost shares × ${formatUSD(SHARE_PRICE)}, no discount. Demo values, not a financial offer. Value growth defaults to 0%.`;

  const cheapest = Math.min(...TIERS.map((t) => t.monthly));
  $('#hero-price').textContent = `From ${formatUSD(cheapest)}/month ($${RENT_PER_SQFT}/sq ft) · ownership accrues to 100% over 20 years`;

  const live = BUILDINGS.filter((b) => b.status === 'live');
  $('#hero-buildings').innerHTML = live.map((b) => `<div class="rounded-xl bg-white/10 py-3">${esc(b.name)}</div>`).join('');
}

// ---------- Calculator (L4) ----------
function renderCalcTiers() {
  $('#calc-tiers').innerHTML = TIERS.map((t) => `
    <button type="button" class="chip" data-tier="${t.id}" aria-pressed="${t.id === state.tier}">
      ${esc(t.id)}<span class="block text-xs text-stone-500">${formatUSD(t.monthly)}/mo</span></button>`).join('');
}

function setTier(id) {
  state.tier = id;
  const tier = getTier(TIERS, id);
  const fee = $('#fee');
  fee.min = tier.monthly;
  fee.max = tier.monthly + 1000;
  fee.value = tier.monthly;
  renderCalcTiers();
  updateCalc();
}

const bar = (label, value, max, color, note = '') => `
  <div><div class="flex justify-between text-sm"><span>${esc(label)}</span><span class="font-semibold">${formatUSD(value)}${note}</span></div>
  <div class="bar-track mt-1"><div class="bar-fill ${color}" style="width:${max ? Math.max(1, (value / max) * 100) : 0}%"></div></div></div>`;

function updateCalc() {
  const tier = getTier(TIERS, state.tier);
  const monthlyFee = Number($('#fee').value);
  const years = Number($('#years').value);
  const appreciation = Number($('#appr').value) / 100;
  const rent = Math.max(0, Number($('#rent').value) || 0);

  $('#fee-out').textContent = `${formatUSD(monthlyFee)}`;
  $('#years-out').textContent = `${years} yr`;
  $('#appr-out').textContent = `${(appreciation * 100).toFixed(1)}%`;

  const r = projectOwnership({ tier, monthlyFee, years, appreciation });
  const rentPaid = rent * r.months;
  const max = Math.max(r.totalPaid, r.equity, rentPaid);

  $('#out-shares').textContent = `${formatShares(r.sharesOwned)} / ${formatShares(tier.shares)}`;
  $('#out-pct').textContent = `shares of a ${tier.name} (${Math.round((r.sharesOwned / tier.shares) * 100)}%)`;
  $('#out-equity').textContent = formatUSD(r.equity);
  const yrs = (r.monthsToFullOwnership / 12).toFixed(1);
  $('#out-full').textContent = r.extraPerMonth > 0
    ? `Fully owned in ${yrs} years (+${formatShares(r.extraPerMonth)} shares/mo)`
    : `Fully owned in ${yrs} years`;

  $('#out-bars').innerHTML = [
    bar('CoHome: you pay', r.totalPaid, max, 'bg-stone-400'),
    bar('CoHome: you own', r.equity, max, 'bg-moss'),
    bar('Renting: you pay', rentPaid, max, 'bg-clay'),
    bar('Renting: you own', 0, max, 'bg-clay'),
  ].join('') + (() => {
    const split = paymentSplit(tier);
    const buyout = buyoutQuote(tier, 0);
    return `<p class="text-sm text-stone-600 pt-2">Base payment ${formatUSD(tier.monthly)} = ${formatUSD(split.toShares)} to shares + ${formatUSD(split.toRunningCosts)} running costs. Or buy out on day one for <strong>${formatUSD(buyout.cost)}</strong>, then ${formatUSD(buyout.monthlyAfter)}/month.</p>`;
  })();
}

function initCalc() {
  $('#calc-tiers').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tier]');
    if (btn) setTier(btn.dataset.tier);
  });
  ['#fee', '#years', '#appr', '#rent'].forEach((id) => $(id).addEventListener('input', updateCalc));
  setTier(state.tier);
}

// ---------- Network (L6) ----------
const MARKER_COLORS = { live: '#2f5d46', planned: '#c8693c', future: '#a8a29e' };

function initMap() {
  if (typeof L === 'undefined') {
    $('#map').innerHTML = '<p class="p-6 text-stone-500">Map unavailable offline.</p>';
    return;
  }
  const map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  BUILDINGS.forEach((b) => {
    L.circleMarker([b.lat, b.lng], {
      radius: b.status === 'live' ? 9 : 7, color: '#fff', weight: 2,
      fillColor: MARKER_COLORS[b.status], fillOpacity: 0.95,
    }).addTo(map).bindPopup(`<strong>${esc(b.name)}</strong><br>${b.status === 'live' ? 'Live pilot building' : b.status === 'planned' ? 'Planned (SPV Pilot 2)' : 'Future network city'}`);
  });

  const nyc = L.latLngBounds(BUILDINGS.filter((b) => b.status !== 'future').map((b) => [b.lat, b.lng])).pad(0.3);
  const all = L.latLngBounds(BUILDINGS.map((b) => [b.lat, b.lng])).pad(0.1);
  let showingAll = false;
  map.fitBounds(nyc);
  $('#map-toggle').addEventListener('click', () => {
    showingAll = !showingAll;
    map.flyToBounds(showingAll ? all : nyc, { duration: 0.8 });
    $('#map-toggle').textContent = showingAll ? 'Back to Brooklyn' : 'Show all cities';
  });
}

function renderNetworkPanels() {
  const rows = [...MARKET_RENT.map((m) => ({ label: m.geo, value: m.monthly, color: 'bg-clay' })),
    ...TIERS.map((t) => ({ label: `CoHome ${t.name}`, value: t.monthly, color: 'bg-moss' }))];
  const max = Math.max(...rows.map((r) => r.value));
  $('#rent-compare').innerHTML = rows.map((r) => bar(r.label, r.value, max, r.color)).join('');

  const stake = getTier(TIERS, 'M').shares * SHARE_PRICE;
  $('#alloc-intro').textContent = `A ${formatUSD(stake)} Flex Suite stake, spread across live buildings by value:`;
  $('#alloc').innerHTML = portfolioAllocation(stake, BUILDINGS)
    .map((a) => bar(`${a.name} (${a.pct.toFixed(0)}%)`, a.equity, stake, 'bg-moss')).join('');
}

// ---------- Waitlist (L9) ----------
function initWaitlist() {
  $('#wl-tiers').innerHTML = TIERS.map((t) => `
    <label><input type="radio" name="tier" value="${t.id}" class="sr-only" ${t.id === 'M' ? 'checked' : ''}>
      <span class="chip block">${esc(t.id)} · ${esc(t.name)}</span></label>`).join('');

  const form = $('#waitlist-form');
  const status = $('#wl-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    const check = validateWaitlist(data);
    if (!check.ok) {
      Object.entries(check.errors).forEach(([k, msg]) => { form.querySelector(`[data-for="${k}"]`).textContent = msg; });
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.className = 'text-sm text-stone-600';
    status.textContent = 'Saving…';
    try {
      const res = await saveWaitlistEntry(check.value);
      form.reset();
      status.className = 'text-sm text-moss font-medium';
      status.textContent = res.duplicate
        ? 'You’re already on the list. We’ll be in touch.'
        : `Thanks, ${check.value.name}! You’re on the Brooklyn waitlist.${res.local ? ' (Demo mode: saved in this browser only.)' : ''}`;
    } catch (err) {
      console.error('Waitlist save failed', err);
      status.className = 'text-sm text-red-700';
      status.textContent = 'Something went wrong saving your spot. Please try again.';
    } finally {
      btn.disabled = false;
    }
  });
  if (!isLiveStorage()) console.info('[CoHome] Waitlist in demo mode. Configure js/config.js to store sign-ups.');
}

renderStatic();
initCalc();
renderNetworkPanels();
initMap();
initWaitlist();
