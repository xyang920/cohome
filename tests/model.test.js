import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTier, projectOwnership, memberSummary, upsizeOptions,
  validateSwapDates, matchSwap, portfolioAllocation, validateWaitlist,
} from '../js/model.js';
import { TIERS, BUILDINGS, SHARE_PRICE } from '../js/data.js';

const M = getTier(TIERS, 'M');
// Same values as user u-001 in js/seed.js (Tier M home, 84 shares).
const DEMO_MEMBER = Object.freeze({ tier: 'M', shares: 84 });

test('getTier finds a tier and rejects unknown ids', () => {
  assert.equal(M.shares, 300);
  assert.throws(() => getTier(TIERS, 'XL'), /Unknown tier/);
});

test('base fee owns the tier outright after 20 years', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 20 });
  assert.equal(r.sharesOwned, 300);
  assert.equal(r.equity, 75000);
  assert.equal(r.totalPaid, 216000);
  assert.equal(r.monthsToFullOwnership, 240);
});

test('ownership accrues evenly before 20 years', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 10 });
  assert.equal(r.sharesOwned, 150);
  assert.equal(r.equity, 37500);
});

test('paying above the base fee buys extra shares and shortens the path', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 1150, years: 5 });
  // 1.25 accrued + 1 extra (250/250) = 2.25 shares a month
  assert.equal(r.sharesOwned, 135);
  assert.equal(r.monthsToFullOwnership, Math.ceil(300 / 2.25));
});

test('shares never exceed the tier total', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 1900, years: 30 });
  assert.equal(r.sharesOwned, 300);
});

test('appreciation grows equity value, not share count', () => {
  const r = projectOwnership({ tier: M, monthlyFee: 900, years: 20, appreciation: 0.02 });
  assert.equal(r.sharesOwned, 300);
  assert.ok(Math.abs(r.equity - 75000 * 1.02 ** 20) < 1);
});

test('fee below the tier base fee is rejected', () => {
  assert.throws(() => projectOwnership({ tier: M, monthlyFee: 100, years: 5 }), RangeError);
});

test('member summary for the demo member', () => {
  const s = memberSummary(DEMO_MEMBER, TIERS);
  assert.equal(s.equity, 84 * SHARE_PRICE);
  assert.equal(s.remainingShares, 216);
  assert.equal(s.ownedPct, 28);
  assert.equal(s.yearsToFull, 14.4);
});

test('upsize M to L needs 300 more shares', () => {
  const u = upsizeOptions(DEMO_MEMBER, TIERS, 'L');
  assert.equal(u.sharesNeeded, 300);
  assert.equal(u.lumpSum, 75000);
  assert.equal(u.newMonthly, 1800);
  assert.equal(u.monthlyIncrease, 900);
  // lump: owns 384 of 600, accrues 2.5/month => 216/2.5/12 = 7.2 years
  assert.equal(u.lump.yearsToFull, 7.2);
  // monthly only: owns 84 of 600 => 516/2.5/12 = 17.2 years
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
