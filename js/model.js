// Pure business logic for CoHome. No DOM access, so it runs in Node tests.
import { SHARE_PRICE, MONTHS_TO_OWN } from './data.js';

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const DAY_MS = 86_400_000;

export const formatUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function getTier(tiers, id) {
  const tier = tiers.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

/** Shares a member gains per month at the tier's base fee (full ownership at 20 years). */
export const baseAccrual = (tier, monthsToOwn = MONTHS_TO_OWN) => tier.shares / monthsToOwn;

/**
 * Project ownership for the equity calculator.
 * Rules (spec section 5): ownership accrues evenly to 100% at 20 years of base-fee payments;
 * every dollar above the base fee buys extra shares at the share price.
 */
export function projectOwnership({
  tier, monthlyFee, years, appreciation = 0, startShares = 0,
  sharePrice = SHARE_PRICE, monthsToOwn = MONTHS_TO_OWN,
}) {
  if (monthlyFee < tier.monthly) {
    throw new RangeError(`Monthly fee must be at least the tier base fee (${tier.monthly}).`);
  }
  if (years < 0) throw new RangeError('Years must be zero or more.');

  const months = Math.round(years * 12);
  const extraPerMonth = (monthlyFee - tier.monthly) / sharePrice;
  const perMonth = baseAccrual(tier, monthsToOwn) + extraPerMonth;
  const sharesOwned = Math.min(tier.shares, startShares + perMonth * months);
  const remaining = Math.max(0, tier.shares - startShares);

  return {
    months,
    sharesOwned: round(sharesOwned, 2),
    equity: round(sharesOwned * sharePrice * (1 + appreciation) ** years, 2),
    totalPaid: monthlyFee * months,
    extraPerMonth: round(extraPerMonth, 2),
    monthsToFullOwnership: Math.ceil(remaining / perMonth),
  };
}

export function memberSummary(member, tiers, sharePrice = SHARE_PRICE) {
  const tier = getTier(tiers, member.tier);
  const remainingShares = Math.max(0, tier.shares - member.shares);
  return {
    tier,
    equity: member.shares * sharePrice,
    remainingShares,
    ownedPct: round((member.shares / tier.shares) * 100, 1),
    yearsToFull: round(remainingShares / baseAccrual(tier) / 12, 1),
  };
}

export function upsizeOptions(member, tiers, targetId, sharePrice = SHARE_PRICE) {
  const current = getTier(tiers, member.tier);
  const target = getTier(tiers, targetId);
  if (target.shares <= current.shares) throw new Error('Upsizing needs a larger tier.');

  const sharesNeeded = target.shares - current.shares;
  const yearsFrom = (owned) => round(Math.max(0, target.shares - owned) / baseAccrual(target) / 12, 1);
  return {
    current,
    target,
    sharesNeeded,
    lumpSum: sharesNeeded * sharePrice,
    newMonthly: target.monthly,
    monthlyIncrease: target.monthly - current.monthly,
    lump: { sharesOwned: member.shares + sharesNeeded, yearsToFull: yearsFrom(member.shares + sharesNeeded) },
    monthly: { sharesOwned: member.shares, yearsToFull: yearsFrom(member.shares) },
  };
}

const toDay = (d) => {
  const date = d instanceof Date ? d : new Date(`${d}T00:00:00Z`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** A swap needs 30–60 days' notice (spec section 7). */
export function validateSwapDates(start, end, today = new Date(), minNotice = 30, maxNotice = 60) {
  if (!start || !end) return { ok: false, error: 'Pick a move-in date and an end date.' };
  const notice = Math.round((toDay(start) - toDay(today)) / DAY_MS);
  if (Number.isNaN(notice)) return { ok: false, error: 'Dates are not valid.' };
  if (notice < minNotice) return { ok: false, error: `Swaps need at least ${minNotice} days' notice (you gave ${notice}).` };
  if (notice > maxNotice) return { ok: false, error: `Requests open ${maxNotice} days ahead; pick a date within ${maxNotice} days.` };
  if (toDay(end) <= toDay(start)) return { ok: false, error: 'The end date must be after the move-in date.' };
  return { ok: true, notice };
}

/**
 * Match a swap request against mock availability.
 * Contested slots (more requests than units) go to members with the most priority points.
 */
export function matchSwap(building, tierId, points) {
  if (!building || building.status !== 'live') return { status: 'not-open' };
  const slot = building.availability?.[tierId];
  if (!slot || slot.units === 0) return { status: 'no-units' };
  if (slot.requests <= slot.units) return { status: 'matched', units: slot.units };
  if (points >= slot.cutoffPoints) return { status: 'matched-by-points', cutoffPoints: slot.cutoffPoints };
  return { status: 'waitlisted', cutoffPoints: slot.cutoffPoints, pointsNeeded: slot.cutoffPoints - points };
}

/** Spread a member's equity across live buildings by value weight (ETF-style view). */
export function portfolioAllocation(equity, buildings) {
  const live = buildings.filter((b) => b.status === 'live' && b.valueIndex > 0);
  const total = live.reduce((s, b) => s + b.valueIndex, 0);
  return live.map((b) => ({
    id: b.id,
    name: b.name,
    pct: (b.valueIndex / total) * 100,
    equity: (equity * b.valueIndex) / total,
  }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateWaitlist({ name, email, tier, deposit }) {
  const errors = {};
  const cleanName = String(name ?? '').trim();
  const cleanEmail = String(email ?? '').trim();
  if (cleanName.length < 1 || cleanName.length > 100) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) errors.email = 'Enter a valid email.';
  if (!['S', 'M', 'L'].includes(tier)) errors.tier = 'Pick a tier.';
  if (!['yes', 'no'].includes(deposit)) errors.deposit = 'Tell us about a refundable deposit.';
  const ok = Object.keys(errors).length === 0;
  return ok
    ? { ok, value: { name: cleanName, email: cleanEmail.toLowerCase(), tier, deposit: deposit === 'yes' } }
    : { ok, errors };
}
