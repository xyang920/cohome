import {
  TIERS, BUILDINGS, DEMO_MEMBER, PROPOSALS, SHARE_PRICE,
  SHARE_VALUE_INDEX, EXIT_FEE_RATE, EXIT_FEE_YEARS, SWAP_POINT_SPEND, BUYBACK_CAP_RATE, BUYBACK_USED_DEMO,
} from './data.js';
import { SEED } from './seed.js';
import { createDb } from './db.js';
import {
  getTier, memberSummary, upsizeOptions, validateSwapDates, matchSwap, portfolioAllocation, formatUSD,
  buyoutQuote, paymentSplit, formatShares, currentSharePrice, sellQuote,
  monthlyPayment, pointsForShares, pointsAfterSale, swapPointCost,
  quarterlyBuybackCap, buybackPlan, startQuarter,
} from './model.js';
import { profileCard, communityCard, renderCommunities, renderDataTables, freeUnitOptions } from './app-data.js';
import { esc, $ } from './ui.js';

const STORE_KEY = 'sp-demo-state-v5';
const MOCK_VOTES = { 'bushwick-2': 41, 'manhattan-les': 57, 'partner-coop': 23 };
const TABS = ['dashboard', 'swap', 'upsize', 'sell', 'vote', 'guest', 'communities', 'data'];

const seedQuarter = () => ({
  number: 1,
  cap: quarterlyBuybackCap(SEED.users.reduce((n, u) => n + u.shares, 0)),
  used: BUYBACK_USED_DEMO,
});

const initialState = () => ({
  member: { ...DEMO_MEMBER, queuedShares: 0 }, vote: null, db: null, quarter: seedQuarter(),
  activity: ['Joined the co-op · Tier M Flex Suite', 'Moved into Gowanus'],
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved?.member && saved.quarter ? saved : initialState();
  } catch {
    return initialState();
  }
}

let state = load();
const persist = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* demo works without storage */ }
};

function openDb(snapshot) {
  const onChange = (snap) => { state = { ...state, db: snap }; persist(); };
  const db = createDb(snapshot ?? SEED, { onChange });
  return db.resolveUser(state.member.userId)?.community ? db : createDb(SEED, { onChange });
}
let db = openDb(state.db);

function setState(patch) {
  state = { ...state, ...patch };
  persist();
  render();
}

/** What the member pays now: full rent, or only running costs once the home is fully owned. */
const monthlyDue = (tier, shares) => (shares >= tier.shares ? paymentSplit(tier).toRunningCosts : tier.monthly);
const logActivity = (text) => [text, ...state.activity].slice(0, 8);
const building = (id) => BUILDINGS.find((b) => b.id === id);
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** The signed-in member, joined from the user, portfolio and community tables. */
function me() {
  const r = db.resolveUser(state.member.userId);
  return {
    ...state.member, ...r,
    name: `${r.user.firstName} ${r.user.lastName}`,
    shares: r.user.shares, tier: r.tier.id, home: r.community.id,
  };
}

/** Building availability with `units` taken from free homes in the portfolio table. */
function withLiveUnits(b) {
  if (b.status !== 'live') return b;
  const availability = Object.fromEntries(Object.entries(b.availability).map(([tier, slot]) =>
    [tier, { ...slot, units: db.freeUnits({ communityId: b.id, tier }).length }]));
  return { ...b, availability };
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  history.replaceState(null, '', `#${name}`);
}

// ---------- M1 Dashboard ----------
const kpi = (label, value, sub) => `<div class="card"><p class="label">${esc(label)}</p>
  <p class="font-display text-3xl mt-1">${esc(value)}</p><p class="text-sm text-stone-500">${esc(sub)}</p></div>`;

const bar = (label, value, max, color) => `
  <div><div class="flex justify-between text-sm"><span>${esc(label)}</span><span class="font-semibold">${formatUSD(value)}</span></div>
  <div class="bar-track mt-1"><div class="bar-fill ${color}" style="width:${max ? Math.max(1, (value / max) * 100) : 0}%"></div></div></div>`;

function renderDashboard() {
  const m = me();
  const s = memberSummary(m, TIERS);
  const home = building(m.home);
  $('#member-name').textContent = m.name;
  $('#kpis').innerHTML = [
    kpi('Shares held', `${formatShares(m.shares)} / ${formatShares(s.tier.shares)}`, `${s.ownedPct}% of your ${s.tier.name}`),
    kpi('Equity value', formatUSD(s.equity), `${formatShares(m.shares)} × $${currentSharePrice().toFixed(2)} per share`),
    kpi('Current home', home ? home.name : m.community.location, `${m.property.id} · ${formatUSD(monthlyDue(s.tier, m.shares))}/month`),
    kpi('Priority points', String(m.points), `${m.monthsPaid} monthly payments made · decide contested swaps`),
  ].join('');
  $('#profile-row').innerHTML = profileCard(db.resolveUser(m.user.id)) + communityCard(m.community);

  $('#ownership').innerHTML = `
    <div class="bar-track !h-4"><div class="bar-fill bg-moss" style="width:${Math.min(100, s.ownedPct)}%"></div></div>
    <div class="mt-3 flex justify-between text-sm"><span>${s.ownedPct}% owned</span><span>${formatShares(s.remainingShares)} shares to go</span></div>
    ${s.remainingShares === 0
    ? `<p class="mt-4 text-sm text-stone-600">You own your ${esc(s.tier.name)} outright. You pay ${formatUSD(paymentSplit(s.tier).toRunningCosts)}/month for running costs.</p>`
    : `<p class="mt-4 text-sm text-stone-600">Of your ${formatUSD(s.tier.monthly)} payment, ${formatUSD(paymentSplit(s.tier).toShares)} buys shares. You fully own your ${esc(s.tier.name)} in
      <strong>${s.yearsToFull} years</strong>, or buy it out now for <strong>${formatUSD(buyoutQuote(s.tier, m.shares).cost)}</strong>.
      <button class="underline text-moss" data-go="upsize">Buy out or upsize →</button></p>`}
    <button class="btn-ghost mt-4" data-pay="1">Pay this month's rent (${formatUSD(monthlyDue(s.tier, m.shares))}, +1 point)</button>`;

  $('#dash-alloc').innerHTML = portfolioAllocation(s.equity, BUILDINGS)
    .map((a) => bar(`${a.name} (${a.pct.toFixed(0)}%)`, a.equity, s.equity, 'bg-moss')).join('');
  $('#activity').innerHTML = state.activity.map((a) => `<li>· ${esc(a)}</li>`).join('');
}

// ---------- M2 Swap ----------
const STATUS_VIEW = {
  matched: ['badge-good', 'Matched', 'A home is open for your dates.'],
  'matched-by-points': ['badge-good', 'Matched on priority points', 'Several members asked for this home; your points put you first.'],
  waitlisted: ['badge-warn', 'Contested', ''],
  'no-units': ['badge-bad', 'No homes free', 'No homes in this tier are free. Try another building or tier.'],
  'not-open': ['badge-muted', 'Not open yet', 'This location is planned. Vote for it in the co-op vote to bring it sooner.'],
};

function initSwapForm() {
  const m = me();
  $('#swap-building').innerHTML = BUILDINGS.filter((b) => b.id !== m.home).map((b) => `
    <option value="${b.id}">${esc(b.name)}${b.status === 'live' ? '' : b.status === 'planned' ? ' (planned)' : ' (future city)'}</option>`).join('');
  $('#swap-tier').innerHTML = TIERS.map((t) => `<option value="${t.id}" ${t.id === m.tier ? 'selected' : ''}>Tier ${t.id} · ${esc(t.name)}</option>`).join('');
  $('#swap-start').value = isoDay(35);
  $('#swap-end').value = isoDay(35 + 180);
  $('#swap-result').innerHTML = '';
}

function onSwapSubmit(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const dates = validateSwapDates(form.get('start'), form.get('end'));
  $('#swap-error').textContent = dates.ok ? '' : dates.error;
  if (!dates.ok) { $('#swap-result').innerHTML = ''; return; }

  const m = me();
  const target = withLiveUnits(building(form.get('building')));
  const tierId = form.get('tier');
  const result = matchSwap(target, tierId, m.points);
  const [cls, title, text] = STATUS_VIEW[result.status];
  const cost = swapPointCost(result, m.points);
  const detail = result.status === 'waitlisted'
    ? `This home needs ${result.cutoffPoints} priority points; you have ${m.points}. You need ${result.pointsNeeded} more, so you're on the waitlist.`
    : cost ? `${text} Confirming spends ${cost} of your ${m.points} points (${SWAP_POINT_SPEND * 100}%).` : text;
  const canConfirm = ['matched', 'matched-by-points'].includes(result.status);
  const tierChange = tierId !== m.tier;
  const community = db.communities.findById(target.id);

  $('#swap-result').innerHTML = `
    <div class="grid lg:grid-cols-2 gap-6">
      <div class="card">
        <div class="flex items-center gap-3"><span class="badge ${cls}">${esc(title)}</span>
          <span class="text-sm text-stone-500">${esc(target.name)} · Tier ${esc(tierId)} · ${dates.notice} days' notice</span></div>
        <p class="mt-3">${esc(detail)}</p>
        ${canConfirm ? `<p class="mt-2 text-sm text-stone-600">Your ${formatShares(m.shares)} shares (${formatUSD(m.shares * currentSharePrice())}) move with you.${tierChange ? ' Changing tier also changes your monthly fee; use Upsize to plan it.' : ''}</p>
          <button class="btn-primary mt-4" data-confirm-swap="${esc(target.id)}" ${tierChange ? 'disabled title="Same-tier swaps only in this demo"' : ''}>Confirm swap</button>` : ''}
      </div>
      ${community ? communityCard(community, { title: 'About this community' }) : ''}
    </div>`;
}

function confirmSwap(communityId) {
  const m = me();
  // Price the swap before taking the home: taking it changes the free-home count.
  const cost = swapPointCost(matchSwap(withLiveUnits(building(communityId)), m.tier, m.points), m.points);
  const unit = db.freeUnits({ communityId, tier: m.tier })[0];
  const res = unit ? db.users.update(m.user.id, { propertyId: unit.id }) : { ok: false };
  if (!res.ok) {
    $('#swap-result').innerHTML = '<div class="card"><span class="badge badge-bad">Not completed</span><p class="mt-3">That home was just taken. Try again.</p></div>';
    return;
  }
  const target = building(communityId);
  setState({
    member: { ...state.member, points: m.points - cost },
    activity: logActivity(`Swap confirmed: moving to ${target.name} (${unit.id})${cost ? `, spent ${cost} points` : ''}`),
  });
  initSwapForm();
  $('#swap-result').innerHTML = `<div class="card"><span class="badge badge-good">Confirmed</span>
    <p class="mt-3">You're moving to ${esc(target.name)}, home ${esc(unit.id)}. Equity unchanged: ${formatUSD(m.shares * currentSharePrice())}.</p></div>`;
}

// ---------- M3 Upsize ----------
const upsizeUnit = (m, tierId) =>
  db.freeUnits({ communityId: m.home, tier: tierId })[0] ?? db.freeUnits({ tier: tierId })[0];

function buyoutCard(m, tier) {
  const q = buyoutQuote(tier, m.shares);
  if (q.sharesToBuy === 0) {
    return `<div class="card mb-6"><p class="eyebrow">Your home</p><h2 class="font-display text-3xl mt-1">You own your ${esc(tier.name)} outright</h2>
      <p class="text-stone-600 mt-1">You pay ${formatUSD(q.monthlyAfter)}/month for running costs.</p></div>`;
  }
  return `
    <div class="card mb-6">
      <p class="eyebrow">Buy out your ${esc(tier.name)}</p>
      <h2 class="font-display text-3xl mt-1">Own it outright for ${formatUSD(q.cost)}</h2>
      <p class="text-stone-600 mt-1">${formatShares(q.sharesToBuy)} remaining shares × $${currentSharePrice().toFixed(2)}, no early-payment discount.
        Your payment drops from ${formatUSD(q.monthlyNow)} to ${formatUSD(q.monthlyAfter)}/month (running costs only).</p>
      <button class="btn-primary mt-4" data-buyout="1">Buy out for ${formatUSD(q.cost)}</button>
    </div>`;
}

function renderUpsize() {
  const m = me();
  const current = getTier(TIERS, m.tier);
  const larger = TIERS.filter((t) => t.shares > current.shares);
  if (larger.length === 0) {
    $('#upsize').innerHTML = buyoutCard(m, current) + `<div class="card">You're in our largest tier (${esc(current.name)}).</div>`;
    return;
  }
  $('#upsize').innerHTML = buyoutCard(m, current) + larger.map((t) => {
    const u = upsizeOptions(m, TIERS, t.id);
    const unit = upsizeUnit(m, t.id);
    const where = unit
      ? `Free home: <span class="font-mono">${esc(unit.id)}</span> in ${esc(db.communities.findById(unit.communityId).location)}${unit.communityId === m.home ? ' (your community)' : ''}`
      : `No free Tier ${esc(t.id)} homes right now.`;
    const dis = unit ? '' : 'disabled';
    return `
    <div class="card mb-6">
      <p class="eyebrow">Tier ${esc(current.id)} → Tier ${esc(t.id)}</p>
      <h2 class="font-display text-3xl mt-1">You need ${formatShares(u.sharesNeeded)} more shares for Tier ${esc(t.id)}</h2>
      <p class="text-stone-600 mt-1">${esc(t.name)}, ${esc(t.sqft)} sq ft · ${formatUSD(u.newMonthly)}/month (+${formatUSD(u.monthlyIncrease)})</p>
      <p class="text-sm mt-2">${where}</p>
      <div class="mt-6 grid md:grid-cols-2 gap-4">
        <div class="rounded-2xl border border-stone-200 p-5">
          <h3 class="font-semibold">Lump sum</h3>
          <p class="font-display text-3xl mt-2">${formatUSD(u.lumpSum)}</p>
          <p class="text-sm text-stone-600 mt-1">You'd own ${formatShares(u.lump.sharesOwned)} of ${formatShares(t.shares)} shares and own the home outright in ${u.lump.yearsToFull} years.</p>
          <button class="btn-primary mt-4" data-upsize="${t.id}" data-mode="lump" ${dis}>Choose lump sum</button>
        </div>
        <div class="rounded-2xl border border-stone-200 p-5">
          <h3 class="font-semibold">Higher monthly payment</h3>
          <p class="font-display text-3xl mt-2">${formatUSD(u.newMonthly)}<span class="text-base text-stone-500">/mo</span></p>
          <p class="text-sm text-stone-600 mt-1">No upfront cost. Keep your ${formatShares(u.monthly.sharesOwned)} shares and own the home outright in ${u.monthly.yearsToFull} years.</p>
          <button class="btn-ghost mt-4" data-upsize="${t.id}" data-mode="monthly" ${dis}>Choose monthly</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function confirmBuyout() {
  const m = me();
  const tier = getTier(TIERS, m.tier);
  const q = buyoutQuote(tier, m.shares);
  if (q.sharesToBuy === 0) return;
  if (!db.users.update(m.user.id, { shares: tier.shares }).ok) return;
  setState({
    member: { ...state.member, points: m.points + pointsForShares(q.sharesToBuy) },
    activity: logActivity(`Bought out ${m.property.id} for ${formatUSD(q.cost)}; now ${formatUSD(q.monthlyAfter)}/month`),
  });
  showTab('dashboard');
}

function confirmUpsize(tierId, mode) {
  const m = me();
  const u = upsizeOptions(m, TIERS, tierId);
  const unit = upsizeUnit(m, tierId);
  if (!unit) return;
  const shares = mode === 'lump' ? u.lump.sharesOwned : u.monthly.sharesOwned;
  const res = db.users.update(m.user.id, { propertyId: unit.id, shares });
  if (!res.ok) return;
  setState({
    member: { ...state.member, points: m.points + (mode === 'lump' ? pointsForShares(u.sharesNeeded) : 0) },
    activity: logActivity(`Upsized to Tier ${tierId}, home ${unit.id} (${mode === 'lump' ? `lump sum ${formatUSD(u.lumpSum)}` : `${formatUSD(u.newMonthly)}/month`})`),
  });
  initSwapForm();
  showTab('dashboard');
}

// ---------- Sell shares ----------
const yearsHeld = (m) => m.monthsPaid / 12;
const pctLabel = (rate) => `${rate * 100}%`;
const totalMemberShares = () => db.users.findAll().reduce((s, u) => s + u.shares, 0);
/** Shares the member can still offer: owned minus those already waiting in the buyback queue. */
const sellableShares = (m) => Math.max(0, m.shares - (m.queuedShares ?? 0));

function renderSellPrice() {
  const m = me();
  const price = currentSharePrice();
  const years = yearsHeld(m);
  const feeApplies = years < EXIT_FEE_YEARS;
  const feeNote = feeApplies
    ? `You joined ${years.toFixed(1)} years ago; the fee ends after year ${EXIT_FEE_YEARS}.`
    : `You joined ${years.toFixed(1)} years ago (fee only within ${EXIT_FEE_YEARS} years).`;
  const { number, cap, used } = state.quarter;
  const room = Math.max(0, cap - used);
  const queued = m.queuedShares ?? 0;
  $('#sell-price').innerHTML = `<div class="grid md:grid-cols-3 gap-4">
    ${kpi('Share price', `$${price.toFixed(2)}`, `$${SHARE_PRICE} × value index ${SHARE_VALUE_INDEX.toFixed(2)} (illustrative, reset yearly)`)}
    ${kpi('Shares held', formatShares(m.shares), `Worth ${formatUSD(m.shares * price)}${queued ? ` · ${formatShares(queued)} queued` : ''}`)}
    ${kpi('Exit fee', feeApplies ? pctLabel(EXIT_FEE_RATE) : 'None', feeNote)}</div>
    <div class="card mt-4">
      <div class="flex justify-between text-sm"><span class="label">Co-op buyback room · quarter ${number}</span>
        <span class="font-semibold">${formatShares(room)} of ${formatShares(cap)} shares left</span></div>
      <div class="bar-track mt-2"><div class="bar-fill bg-moss" style="width:${cap ? Math.min(100, (used / cap) * 100) : 100}%"></div></div>
      <p class="mt-2 text-sm text-stone-600">The co-op buys back at most ${pctLabel(BUYBACK_CAP_RATE)} of all member shares each quarter, so a rush of sales can't drain its cash.
        Sales over the cap wait in a first-come queue and are paid first next quarter, at that quarter's share price. Other members' sales this quarter are illustrative.</p>
      ${queued ? `<p class="mt-2 text-sm"><strong>${formatShares(queued)} of your shares are queued</strong> for quarter ${number + 1}. You keep them, and their points, until they're paid.</p>` : ''}
    </div>`;
  $('#sell-shares').max = String(sellableShares(m));
  $('#sell-submit').disabled = sellableShares(m) === 0;
  renderSellQuote();
}

/** Quote for the typed amount, split into the part paid now and the part queued. */
function currentSellQuote() {
  const m = me();
  const raw = $('#sell-shares').value;
  if (raw === '') return null;
  const q = sellQuote({ ownedShares: sellableShares(m), sharesToSell: Number(raw), yearsHeld: yearsHeld(m) });
  if (!q.ok && m.queuedShares && Number(raw) > sellableShares(m) && Number(raw) <= m.shares) {
    return { ok: false, error: `You can sell up to ${formatShares(sellableShares(m))} shares; ${formatShares(m.queuedShares)} are already queued.` };
  }
  if (!q.ok) return q;
  const plan = buybackPlan({ sharesToSell: q.sharesToSell, cap: state.quarter.cap, used: state.quarter.used });
  const part = (n) => (n > 0 ? sellQuote({ ownedShares: n, sharesToSell: n, yearsHeld: yearsHeld(m) }) : null);
  return { ...q, plan, now: part(plan.paidNow), later: part(plan.queued) };
}

const proceeds = (q) => `${formatShares(q.sharesToSell)} × $${q.pricePerShare.toFixed(2)} = ${formatUSD(q.gross)}${
  q.exitFee ? ` − ${formatUSD(q.exitFee)} exit fee (${pctLabel(q.feeRate)})` : ''}`;

function renderSellQuote() {
  const out = $('#sell-quote');
  const q = currentSellQuote();
  if (!q || !q.ok) {
    out.className = `md:col-span-3 text-sm ${q ? 'text-red-700' : 'text-stone-500'}`;
    out.textContent = q ? q.error : 'Enter how many shares to sell.';
    return;
  }
  const m = me();
  const lost = q.now ? pointsAfterSale({ points: m.points, ownedShares: m.shares, sharesSold: q.now.sharesToSell }).pointsLost : 0;
  const nowText = q.now
    ? `Paid now: ${proceeds(q.now)}. <strong>You receive ${formatUSD(q.now.net)}</strong> and give up ${lost} priority points.`
    : 'The co-op has no buyback room left this quarter.';
  const laterText = q.later
    ? ` <span class="text-clay font-medium">${formatShares(q.later.sharesToSell)} shares go in the queue</span> for quarter ${state.quarter.number + 1},
      paid at that quarter's price (about ${formatUSD(q.later.net)} at today's price).`
    : '';
  out.className = 'md:col-span-3 text-sm text-stone-600';
  out.innerHTML = nowText + laterText;
}

function onSellSubmit(e) {
  e.preventDefault();
  const q = currentSellQuote();
  if (!q?.ok) return renderSellQuote();
  const m = me();
  const paid = q.plan.paidNow;
  if (paid > 0 && !db.users.update(m.user.id, { shares: m.shares - paid }).ok) return;
  const pts = pointsAfterSale({ points: m.points, ownedShares: m.shares, sharesSold: paid });
  const parts = [
    q.now && `Sold ${formatShares(paid)} shares for ${formatUSD(q.now.net)} (−${pts.pointsLost} points)`,
    q.later && `queued ${formatShares(q.plan.queued)} shares for next quarter`,
  ].filter(Boolean);
  $('#sell-shares').value = '';
  setState({
    member: { ...state.member, points: pts.points, queuedShares: (m.queuedShares ?? 0) + q.plan.queued },
    quarter: { ...state.quarter, used: state.quarter.used + paid },
    activity: logActivity(parts.join('; ')),
  });
}

/** Demo control: open the next quarter, reset the cap and pay the member's queued shares first. */
function startNextQuarter() {
  const m = me();
  const queued = m.queuedShares ?? 0;
  const next = startQuarter({ totalShares: totalMemberShares(), queued });
  const paid = next.paidFromQueue;
  if (paid > 0 && !db.users.update(m.user.id, { shares: m.shares - paid }).ok) return;
  const pts = pointsAfterSale({ points: m.points, ownedShares: m.shares, sharesSold: paid });
  const q = paid > 0 ? sellQuote({ ownedShares: paid, sharesToSell: paid, yearsHeld: yearsHeld(m) }) : null;
  setState({
    member: { ...state.member, points: pts.points, queuedShares: next.stillQueued },
    quarter: { number: state.quarter.number + 1, cap: next.cap, used: next.used },
    activity: logActivity(`Quarter ${state.quarter.number + 1} opened (cap ${formatShares(next.cap)} shares)${
      q ? `; queue paid ${formatShares(paid)} shares for ${formatUSD(q.net)} (−${pts.pointsLost} points)` : ''}`),
  });
}

// ---------- Monthly payment ----------
function payRent() {
  const m = me();
  const tier = getTier(TIERS, m.tier);
  const p = monthlyPayment(tier, m.shares);
  if (!db.users.update(m.user.id, { shares: p.sharesAfter }).ok) return;
  setState({
    member: { ...state.member, points: m.points + p.pointsEarned, monthsPaid: m.monthsPaid + 1 },
    activity: logActivity(`Paid ${formatUSD(monthlyDue(tier, m.shares))} rent: +${formatShares(p.sharesBought)} shares, +${p.pointsEarned} point`),
  });
}

// ---------- M4 Vote ----------
function renderVote() {
  const tally = { ...MOCK_VOTES };
  if (state.vote) tally[state.vote] += 1;
  const total = Object.values(tally).reduce((s, n) => s + n, 0);
  $('#vote').innerHTML = PROPOSALS.map((p) => {
    const pct = Math.round((tally[p.id] / total) * 100);
    const mine = state.vote === p.id;
    return `<div class="card ${mine ? 'ring-2 ring-moss' : ''}">
      <div class="flex justify-between gap-4"><div><h2 class="font-semibold">${esc(p.title)}</h2><p class="text-sm text-stone-600">${esc(p.detail)}</p></div>
      <button class="${mine ? 'btn-primary' : 'btn-ghost'} shrink-0 self-start" data-vote="${p.id}" ${state.vote ? 'disabled' : ''}>${mine ? 'Your vote' : 'Vote'}</button></div>
      <div class="mt-4 bar-track"><div class="bar-fill bg-moss" style="width:${pct}%"></div></div>
      <p class="mt-1 text-sm text-stone-500">${tally[p.id]} votes · ${pct}%</p></div>`;
  }).join('');
}

// ---------- M5 Guest suite ----------
function onGuestSubmit(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const date = form.get('date');
  const nights = Number(form.get('nights'));
  const status = $('#guest-status');
  const home = building(me().home);
  const error = (msg) => { status.className = 'md:col-span-3 text-sm text-red-700'; status.textContent = msg; };
  if (!date || date < isoDay(0)) return error('Pick an arrival date from today on.');
  if (!Number.isInteger(nights) || nights < 1 || nights > 7) return error('Stays are 1–7 nights.');
  if (!home?.guestSuites) return error('No guest suites in this building.');
  status.className = 'md:col-span-3 text-sm text-moss font-medium';
  status.textContent = `Booked: guest suite at ${home.name}, ${nights} night${nights > 1 ? 's' : ''} from ${date}.`;
  setState({ activity: logActivity(`Booked a guest suite at ${home.name} (${nights} nights)`) });
}

// ---------- Communities + Data tabs ----------
function renderDataTabs() {
  $('#communities').innerHTML = renderCommunities(db, me().home);
  const t = renderDataTables(db, state.member.userId);
  $('#tbl-users').innerHTML = t.users;
  $('#tbl-portfolio').innerHTML = t.portfolio;
  $('#tbl-communities').innerHTML = t.communities;
  const select = $('#user-property');
  const keep = select.value;
  select.innerHTML = freeUnitOptions(db);
  if ([...select.options].some((o) => o.value === keep)) select.value = keep;
}

function onAddUser(e) {
  e.preventDefault();
  const form = e.target;
  const status = $('#user-status');
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  const res = db.users.create(Object.fromEntries(new FormData(form)));
  if (!res.ok) {
    Object.entries(res.errors).forEach(([k, msg]) => {
      const el = form.querySelector(`[data-for="${k}"]`);
      if (el) el.textContent = msg;
    });
    status.className = 'text-sm text-red-700';
    status.textContent = 'Fix the highlighted fields.';
    return;
  }
  form.reset();
  status.className = 'text-sm text-moss font-medium';
  status.textContent = `Added ${res.value.firstName} ${res.value.lastName} (${res.value.id}) to ${res.value.propertyId}.`;
  setState({ activity: logActivity(`Data: added user ${res.value.id}`) });
}

function removeUser(id) {
  if (id === state.member.userId) return;
  if (db.users.remove(id).ok) setState({ activity: logActivity(`Data: removed user ${id}`) });
}

// ---------- Wiring ----------
function render() {
  renderDashboard();
  renderUpsize();
  renderSellPrice();
  renderVote();
  renderDataTabs();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab], [data-go], [data-confirm-swap], [data-upsize], [data-buyout], [data-pay], [data-vote], [data-remove-user]');
  if (!t) return;
  if (t.dataset.tab) showTab(t.dataset.tab);
  else if (t.dataset.go) showTab(t.dataset.go);
  else if (t.dataset.confirmSwap) confirmSwap(t.dataset.confirmSwap);
  else if (t.dataset.upsize) confirmUpsize(t.dataset.upsize, t.dataset.mode);
  else if (t.dataset.buyout) confirmBuyout();
  else if (t.dataset.pay) payRent();
  else if (t.dataset.removeUser) removeUser(t.dataset.removeUser);
  else if (t.dataset.vote && !state.vote) setState({ vote: t.dataset.vote, activity: logActivity('Voted in the co-op ballot') });
});

$('#swap-form').addEventListener('submit', onSwapSubmit);
$('#guest-form').addEventListener('submit', onGuestSubmit);
$('#sell-form').addEventListener('submit', onSellSubmit);
$('#sell-shares').addEventListener('input', renderSellQuote);
$('#next-quarter').addEventListener('click', startNextQuarter);
$('#user-form').addEventListener('submit', onAddUser);
$('#guest-date').min = isoDay(0);
$('#reset').addEventListener('click', () => {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  state = initialState();
  db = openDb(null);
  initSwapForm();
  render();
  showTab('dashboard');
});

initSwapForm();
render();
const startTab = location.hash.slice(1);
showTab(TABS.includes(startTab) ? startTab : 'dashboard');
