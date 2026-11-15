import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTier, projectOwnership, memberSummary, upsizeOptions, buyoutQuote,
  validateSwapDates, matchSwap, portfolioAllocation, validateWaitlist, currentSharePrice, sellQuote,
} from '../js/model.js';
import { TIERS, BUILDINGS, SHARE_PRICE, SHARE_SPLIT, SHARES_PER_SQFT,
  SHARE_VALUE_INDEX, EXIT_FEE_RATE, EXIT_FEE_YEARS,
} from '../js/data.js';

const M = getTier(TIERS, 'M');
// Same values as user u-001 in js/seed.js (Tier M home, 10,080 shares).
const DEMO_MEMBER = Object.freeze({ tier: 'M', shares: 10080 });

test('getTier finds a tier and rejects unknown ids', () => {
  assert.equal(M.shares, 36000);
  assert.throws(() => getTier(TIERS, 'XL'), /Unknown tier/);
});

test('base fee owns the tier outright after 20 years', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 20 });
  assert.equal(r.sharesOwned, 36000);
  assert.equal(r.equity, 108000);
  assert.equal(r.totalPaid, 216000);
  assert.equal(r.monthsToFullOwnership, 240);
});

test('ownership accrues evenly before 20 years', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 10 });
  assert.equal(r.sharesOwned, 18000);
  assert.equal(r.equity, 54000);
});

test('paying above the base fee buys extra shares and shortens the path', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 1260, years: 5 });
  // 150 accrued + 120 extra ($360 / $3) = 270 shares a month
  assert.equal(r.sharesOwned, 16200);
  assert.equal(r.monthsToFullOwnership, Math.ceil(36000 / 270));
});

test('shares never exceed the tier total', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 1900, years: 30 });
  assert.equal(r.sharesOwned, 36000);
});

test('appreciation grows equity value, not share count', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 20, appreciation: 0.02 });
  assert.equal(r.sharesOwned, 36000);
  assert.ok(Math.abs(r.equity - 108000 * 1.02 ** 20) < 1);
});

test('fee below the tier base fee is rejected', () => {
  assert.throws(() => projectOwnership({ tier: M, monthlyFee: 100, years: 5 }), RangeError);
});

test('member summary for the demo member', () => {
  const s = memberSummary(DEMO_MEMBER, TIERS);
  assert.equal(s.equity, 10080 * SHARE_PRICE);
  assert.equal(s.remainingShares, 25920);
  assert.equal(s.ownedPct, 28);
  assert.equal(s.yearsToFull, 14.4);
});

test('upsize M to L needs 36,000 more shares', () => {
  const u = upsizeOptions(DEMO_MEMBER, TIERS, 'L');
  assert.equal(u.sharesNeeded, 36000);
  assert.equal(u.lumpSum, 108000);
  assert.equal(u.newMonthly, 1800);
  assert.equal(u.monthlyIncrease, 900);
  // lump: owns 46,080 of 72,000, accrues 300/month => 25,920/300/12 = 7.2 years
  assert.equal(u.lump.yearsToFull, 7.2);
  // monthly only: owns 10,080 of 72,000 => 61,920/300/12 = 17.2 years
  assert.equal(u.monthly.yearsToFull, 17.2);
});

test('upsize to a smaller or equal tier is rejected', () => {
  assert.throws(() => upsizeOptions(DEMO_MEMBER, TIERS, 'S'), /larger tier/);
  assert.throws(() => upsizeOptions(DEMO_MEMBER, TIERS, 'M'), /larger tier/);
});

test('swap dates need 30 to 60 days of notice', () => {
  const today = new Date('2026-11-14');
  assert.equal(validateSwapDates('2026-12-01', '2027-03-01', today).ok, false);
  assert.equal(validateSwapDates('2026-12-20', '2027-03-01', today).ok, true);
  assert.equal(validateSwapDates('2027-02-01', '2027-03-01', today).ok, false);
  assert.equal(validateSwapDates('2026-12-20', '2026-12-10', today).ok, false);
  assert.equal(validateSwapDates('', '2026-12-10', today).ok, false);
});

const byId = (id) => BUILDINGS.find((b) => b.id === id);

test('swap matching: open unit matches', () => {
  assert.equal(matchSwap(byId('downtown-bk'), 'M', 120).status, 'matched');
});

test('swap matching: contested slot uses priority points', () => {
  const lose = matchSwap(byId('gowanus'), 'M', 120);
  assert.equal(lose.status, 'waitlisted');
  assert.equal(lose.pointsNeeded, 30);
  assert.equal(matchSwap(byId('gowanus'), 'M', 150).status, 'matched-by-points');
});

test('swap matching: no units and planned buildings', () => {
  assert.equal(matchSwap(byId('gowanus'), 'L', 500).status, 'no-units');
  assert.equal(matchSwap(byId('manhattan'), 'M', 500).status, 'not-open');
});

test('portfolio allocation splits equity across live buildings by value', () => {
  const alloc = portfolioAllocation(21000, BUILDINGS);
  assert.equal(alloc.length, 3);
  const total = alloc.reduce((s, a) => s + a.equity, 0);
  assert.ok(Math.abs(total - 21000) < 0.01);
  const pct = alloc.reduce((s, a) => s + a.pct, 0);
  assert.ok(Math.abs(pct - 100) < 0.01);
});

test('waitlist validation', () => {
  assert.equal(validateWaitlist({ name: 'Ana', email: 'ana@example.com', tier: 'M', deposit: 'yes' }).ok, true);
  assert.equal(validateWaitlist({ name: '', email: 'ana@example.com', tier: 'M', deposit: 'yes' }).ok, false);
  assert.equal(validateWaitlist({ name: 'Ana', email: 'bad', tier: 'M', deposit: 'yes' }).ok, false);
  assert.equal(validateWaitlist({ name: 'Ana', email: 'ana@example.com', tier: 'Q', deposit: 'yes' }).ok, false);
  assert.equal(validateWaitlist({ name: 'Ana', email: 'ana@example.com', tier: 'M', deposit: 'maybe' }).ok, false);
});

test('rent is $3 per square foot for every unit', async () => {
  const { RENT_PER_SQFT } = await import('../js/data.js');
  assert.equal(RENT_PER_SQFT, 3);
  assert.deepEqual(TIERS.map((t) => [t.id, t.areaSqft, t.monthly]), [['S', 200, 600], ['M', 300, 900], ['L', 600, 1800]]);
});

test('a share costs $3 and 120 shares make one square foot', () => {
  assert.equal(SHARE_SPLIT, 0.5);
  assert.equal(SHARE_PRICE, 3);
  assert.equal(SHARES_PER_SQFT, 120);
  assert.deepEqual(TIERS.map((t) => t.shares), [24000, 36000, 72000]);
  // the share half of 20 years of base rent buys exactly the whole tier, for every tier
  for (const t of TIERS) assert.equal(t.monthly * SHARE_SPLIT * 240, t.shares * SHARE_PRICE);
});

test('day-one buyout has no discount and leaves the running-cost half to pay', () => {
  assert.deepEqual(TIERS.map((t) => buyoutQuote(t, 0).cost), [72000, 108000, 216000]);
  const q = buyoutQuote(M, 0);
  assert.equal(q.monthlyAfter, 450);
  assert.equal(q.sharesToBuy, 36000);
});

test('buyout for an existing member only charges the shares still owed', () => {
  const q = buyoutQuote(M, 10080);
  assert.equal(q.sharesToBuy, 25920);
  assert.equal(q.cost, 25920 * 3);
  assert.equal(buyoutQuote(M, 36000).cost, 0);
});

test('share price = $3 × value index; the index starts at 1.00', () => {
  assert.equal(SHARE_VALUE_INDEX, 1);
  assert.equal(currentSharePrice(), 3);
  assert.equal(currentSharePrice(1.1), 3.3);
  assert.throws(() => currentSharePrice(0), RangeError);
});

test('buy prices follow the value index so buyers and sellers pay the same price', () => {
  assert.equal(buyoutQuote(M, 0, currentSharePrice(1.1)).cost, 36000 * 3.3);
});

test('sell quote: no exit fee after the holding period', () => {
  const q = sellQuote({ ownedShares: 10080, sharesToSell: 1000, yearsHeld: 4 });
  assert.equal(q.ok, true);
  assert.equal(q.pricePerShare, 3);
  assert.equal(q.gross, 3000);
  assert.equal(q.exitFee, 0);
  assert.equal(q.net, 3000);
  assert.equal(q.sharesLeft, 9080);
});

test('sell quote: 2% exit fee within 3 years, and the index moves the price', () => {
  assert.equal(EXIT_FEE_RATE, 0.02);
  assert.equal(EXIT_FEE_YEARS, 3);
  const q = sellQuote({ ownedShares: 10080, sharesToSell: 1000, yearsHeld: 2, index: 1.1 });
  assert.equal(q.gross, 3300);
  assert.equal(q.feeRate, 0.02);
  assert.equal(q.exitFee, 66);
  assert.equal(q.net, 3234);
});

test('sell quote: defaults to selling every share', () => {
  const q = sellQuote({ ownedShares: 10080, yearsHeld: 5 });
  assert.equal(q.sharesToSell, 10080);
  assert.equal(q.sharesLeft, 0);
});

test('sell quote rejects bad amounts', () => {
  assert.equal(sellQuote({ ownedShares: 100, sharesToSell: 0, yearsHeld: 5 }).ok, false);
  assert.equal(sellQuote({ ownedShares: 100, sharesToSell: 1.5, yearsHeld: 5 }).ok, false);
  assert.equal(sellQuote({ ownedShares: 100, sharesToSell: 101, yearsHeld: 5 }).ok, false);
  assert.equal(sellQuote({ ownedShares: 100, sharesToSell: 10, yearsHeld: -1 }).ok, false);
});
