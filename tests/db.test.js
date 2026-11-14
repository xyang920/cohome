import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../js/db.js';
import { SEED } from '../js/seed.js';

const NOW = new Date('2026-11-14T00:00:00Z');
const fresh = () => createDb(SEED, { now: NOW });

test('seed loads all three tables', () => {
  const db = fresh();
  assert.equal(db.communities.findAll().length, 3);
  assert.equal(db.portfolio.findAll().length, 15);
  assert.ok(db.users.findAll().length >= 6);
});

test('resolveUser joins user → property → community → tier', () => {
  const r = fresh().resolveUser('u-001');
  assert.equal(r.user.firstName, 'Demo');
  assert.equal(r.property.id, 'GOW-M-01');
  assert.equal(r.community.id, 'gowanus');
  assert.equal(r.tier.id, 'M');
  assert.equal(r.age, 30);
});

test('findAll filters with a predicate; findById returns undefined when missing', () => {
  const db = fresh();
  assert.ok(db.portfolio.findAll((p) => p.tier === 'L').every((p) => p.tier === 'L'));
  assert.equal(db.users.findById('nope'), undefined);
});

test('rows are immutable snapshots', () => {
  const db = fresh();
  const u = db.users.findById('u-001');
  assert.throws(() => { u.shares = 1; }, TypeError);
});

test('freeUnits excludes occupied homes', () => {
  const db = fresh();
  const free = db.freeUnits({ communityId: 'gowanus', tier: 'M' });
  assert.deepEqual(free.map((p) => p.id), ['GOW-M-02']);
});

test('create user validates and assigns an id', () => {
  const db = fresh();
  const res = db.users.create({ firstName: ' Ana ', lastName: 'Diaz', dateOfBirth: '1997-04-02', shares: 10, propertyId: 'GOW-S-02' });
  assert.equal(res.ok, true);
  assert.match(res.value.id, /^u-\d{3}$/);
  assert.equal(res.value.firstName, 'Ana');
  assert.equal(db.users.findById(res.value.id).propertyId, 'GOW-S-02');
});

test('create user rejects bad input', () => {
  const db = fresh();
  const base = { firstName: 'Ana', lastName: 'Diaz', dateOfBirth: '1997-04-02', shares: 10, propertyId: 'GOW-S-02' };
  assert.ok(db.users.create({ ...base, firstName: '' }).errors.firstName);
  assert.ok(db.users.create({ ...base, dateOfBirth: '2015-01-01' }).errors.dateOfBirth); // under 18
  assert.ok(db.users.create({ ...base, dateOfBirth: 'not-a-date' }).errors.dateOfBirth);
  assert.ok(db.users.create({ ...base, shares: 201 }).errors.shares); // over Tier S total
  assert.ok(db.users.create({ ...base, shares: 1.5 }).errors.shares);
  assert.ok(db.users.create({ ...base, propertyId: 'XXX' }).errors.propertyId);
  assert.ok(db.users.create({ ...base, propertyId: 'GOW-M-01' }).errors.propertyId); // occupied
});

test('update user moves them to a free unit, never an occupied one', () => {
  const db = fresh();
  assert.equal(db.users.update('u-001', { propertyId: 'DTB-M-02' }).ok, true);
  assert.equal(db.resolveUser('u-001').community.id, 'downtown-bk');
  assert.equal(db.users.update('u-001', { propertyId: 'DTB-M-01' }).ok, false);
  assert.equal(db.users.update('missing', { shares: 1 }).ok, false);
});

test('remove enforces referential integrity', () => {
  const db = fresh();
  assert.equal(db.communities.remove('gowanus').ok, false); // has homes
  assert.equal(db.portfolio.remove('GOW-M-01').ok, false); // occupied
  assert.equal(db.portfolio.remove('GOW-M-02').ok, true);
  assert.equal(db.users.remove('u-002').ok, true);
  assert.equal(db.users.findById('u-002'), undefined);
});

test('portfolio and community validation', () => {
  const db = fresh();
  assert.ok(db.portfolio.create({ tier: 'XL', communityId: 'gowanus' }).errors.tier);
  assert.ok(db.portfolio.create({ tier: 'S', communityId: 'nowhere' }).errors.communityId);
  const p = db.portfolio.create({ tier: 'S', communityId: 'bushwick' });
  assert.equal(p.ok, true);
  assert.match(p.value.id, /^BUS-S-\d{2}$/);

  const bad = db.communities.create({ id: 'xy', riskLevel: 9, location: '', amenities: 'gym', safetyLevel: 0 });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amenities', 'location', 'riskLevel', 'safetyLevel']);
  assert.equal(db.communities.create({ id: 'astoria', riskLevel: 2, location: 'Astoria, Queens, NY', amenities: ['Gym'], safetyLevel: 4 }).ok, true);
  assert.equal(db.communities.create({ id: 'astoria', riskLevel: 2, location: 'Astoria, Queens, NY', amenities: ['Gym'], safetyLevel: 4 }).ok, false);
});

test('communityStats counts homes, occupancy and members', () => {
  const stats = fresh().communityStats();
  const gow = stats.find((s) => s.community.id === 'gowanus');
  assert.equal(gow.units, 5);
  assert.equal(gow.occupied, 2);
  assert.deepEqual(gow.byTier.M, { units: 2, free: 1 });
});

test('onChange receives a serialisable snapshot that can recreate the db', () => {
  let snap;
  const db = createDb(SEED, { now: NOW, onChange: (s) => { snap = s; } });
  db.users.update('u-001', { shares: 90 });
  const again = createDb(JSON.parse(JSON.stringify(snap)), { now: NOW });
  assert.equal(again.users.findById('u-001').shares, 90);
});
