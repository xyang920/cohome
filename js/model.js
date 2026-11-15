// Pure business logic for CoHome. No DOM access, so it runs in Node tests.
import {
  SHARE_PRICE, MONTHS_TO_OWN, SHARE_SPLIT, SHARE_VALUE_INDEX, EXIT_FEE_RATE, EXIT_FEE_YEARS,
  SHARES_PER_SQFT, POINTS_PER_PAYMENT, SWAP_POINT_SPEND,
} from './data.js';

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const DAY_MS = 86_400_000;

export const formatUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** Whole shares with thousands separators, e.g. 36000 -> "36,000". */
export const formatShares = (n) => Math.floor(n).toLocaleString('en-US');

/** Current price of one share, for buying and selling: $3 × the building value index. */
export function currentSharePrice(index = SHARE_VALUE_INDEX, base = SHARE_PRICE) {
  if (!(index > 0)) throw new RangeError('Share value index must be above 0.');
  return round(base * index, 4);
}

/**
 * Quote selling shares back to the co-op or to a new member at the current share price.
 * Sales within `feeYears` of joining pay an exit fee. There is no guaranteed minimum price.
 */
export function sellQuote({
  ownedShares, sharesToSell = ownedShares, yearsHeld, index = SHARE_VALUE_INDEX,
  feeRate = EXIT_FEE_RATE, feeYears = EXIT_FEE_YEARS,
}) {
  if (!Number.isInteger(sharesToSell) || sharesToSell < 1) return { ok: false, error: 'Sell at least 1 whole share.' };
  if (sharesToSell > ownedShares) return { ok: false, error: `You own ${formatShares(ownedShares)} shares.` };
  if (!(yearsHeld >= 0)) return { ok: false, error: 'Years held must be zero or more.' };

  const pricePerShare = currentSharePrice(index);
  const gross = round(sharesToSell * pricePerShare, 2);
  const rate = yearsHeld < feeYears ? feeRate : 0;
  const exitFee = round(gross * rate, 2);
  return {
    ok: true, sharesToSell, pricePerShare, gross, feeRate: rate, exitFee,
    net: round(gross - exitFee, 2), sharesLeft: ownedShares - sharesToSell,
  };
}

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

/** Monthly payment split: the share part buys shares, the rest covers running costs and debt. */
export const paymentSplit = (tier, split = SHARE_SPLIT) => ({
  toShares: tier.monthly * split,
  toRunningCosts: tier.monthly * (1 - split),
});

/**
 * Buy the rest of a home outright at the current share price (no discount for paying early).
 * After a buyout the member still pays the running-cost part every month.
 */
export function buyoutQuote(tier, ownedShares = 0, sharePrice = currentSharePrice(), split = SHARE_SPLIT) {
  const sharesToBuy = Math.max(0, tier.shares - ownedShares);
  return {
    sharesToBuy,
    cost: sharesToBuy * sharePrice,
    monthlyAfter: paymentSplit(tier, split).toRunningCosts,
    monthlyNow: tier.monthly,
  };
}

export function memberSummary(member, tiers, sharePrice = currentSharePrice()) {
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

export function upsizeOptions(member, tiers, targetId, sharePrice = currentSharePrice()) {
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

// ---------- Priority points ----------

/** One monthly rent payment: buys the base shares (capped at the tier total) and earns a point. */
export function monthlyPayment(tier, ownedShares, monthsToOwn = MONTHS_TO_OWN) {
  const sharesAfter = Math.min(tier.shares, ownedShares + baseAccrual(tier, monthsToOwn));
  return { sharesAfter, sharesBought: sharesAfter - ownedShares, pointsEarned: POINTS_PER_PAYMENT };
}

/** Points for buying extra shares (buyout, lump-sum upsize): 1 per square foot's worth, rounded down. */
export const pointsForShares = (shares, perPoint = SHARES_PER_SQFT) => Math.floor(Math.max(0, shares) / perPoint);

/** Selling a fraction of your shares removes the same fraction of your points (rounded up). */
export function pointsAfterSale({ points, ownedShares, sharesSold }) {
  const pointsLost = ownedShares > 0 ? Math.min(points, Math.ceil((points * sharesSold) / ownedShares)) : 0;
  return { pointsLost, points: points - pointsLost };
}

/** Winning a contested swap on points spends a share of them; uncontested matches are free. */
export const swapPointCost = (result, points, spend = SWAP_POINT_SPEND) =>
  (result?.status === 'matched-by-points' ? Math.ceil(points * spend) : 0);

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
