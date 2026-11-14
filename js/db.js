// In-memory database for the demo: users, portfolio (homes) and communities.
// Repository pattern (findAll, findById, create, update, remove); every write replaces rows
// with new frozen objects, so callers can never mutate stored data.
import { TIERS } from './data.js';
import { validateUser, validatePortfolio, validateCommunity, ageOn } from './schema.js';

const freezeRows = (rows) => Object.freeze(rows.map((r) => Object.freeze({ ...r, ...(r.amenities ? { amenities: Object.freeze([...r.amenities]) } : {}) })));
const fail = (errors) => ({ ok: false, errors });

export function createDb(seed, { now = new Date(), tiers = TIERS, onChange } = {}) {
  let tables = {
    communities: freezeRows(seed.communities ?? []),
    portfolio: freezeRows(seed.portfolio ?? []),
    users: freezeRows(seed.users ?? []),
  };

  const snapshot = () => JSON.parse(JSON.stringify(tables));
  const commit = (name, rows) => {
    tables = { ...tables, [name]: freezeRows(rows) };
    onChange?.(snapshot());
  };

  const occupantOf = (propertyId) => tables.users.find((u) => u.propertyId === propertyId);
  const isFreeFor = (userId) => (propertyId) => {
    const occ = occupantOf(propertyId);
    return !occ || occ.id === userId;
  };

  const nextUserId = () => {
    const max = tables.users.reduce((m, u) => Math.max(m, Number(u.id.split('-')[1]) || 0), 0);
    return `u-${String(max + 1).padStart(3, '0')}`;
  };
  const nextPropertyId = (communityId, tier) => {
    const prefix = communityId.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
    const n = tables.portfolio.filter((p) => p.id.startsWith(`${prefix}-${tier}-`)).length + 1;
    return `${prefix}-${tier}-${String(n).padStart(2, '0')}`;
  };

  const base = (name) => ({
    findAll: (pred = () => true) => tables[name].filter(pred),
    findById: (id) => tables[name].find((r) => r.id === id),
  });

  const users = {
    ...base('users'),
    create(input) {
      const v = validateUser(input, { portfolio: tables.portfolio, tiers, isFree: isFreeFor(null), now });
      if (!v.ok) return v;
      const row = { id: nextUserId(), ...v.value };
      commit('users', [...tables.users, row]);
      return { ok: true, value: users.findById(row.id) };
    },
    update(id, patch) {
      const current = users.findById(id);
      if (!current) return fail({ id: 'User not found.' });
      const v = validateUser({ ...current, ...patch }, { portfolio: tables.portfolio, tiers, isFree: isFreeFor(id), now });
      if (!v.ok) return v;
      commit('users', tables.users.map((u) => (u.id === id ? { id, ...v.value } : u)));
      return { ok: true, value: users.findById(id) };
    },
    remove(id) {
      if (!users.findById(id)) return fail({ id: 'User not found.' });
      commit('users', tables.users.filter((u) => u.id !== id));
      return { ok: true };
    },
  };

  const portfolio = {
    ...base('portfolio'),
    create(input) {
      const v = validatePortfolio(input, { communities: tables.communities });
      if (!v.ok) return v;
      const row = { id: nextPropertyId(v.value.communityId, v.value.tier), ...v.value };
      commit('portfolio', [...tables.portfolio, row]);
      return { ok: true, value: portfolio.findById(row.id) };
    },
    update(id, patch) {
      const current = portfolio.findById(id);
      if (!current) return fail({ id: 'Property not found.' });
      if (occupantOf(id)) return fail({ id: 'Move the occupant out before changing this home.' });
      const v = validatePortfolio({ ...current, ...patch }, { communities: tables.communities });
      if (!v.ok) return v;
      commit('portfolio', tables.portfolio.map((p) => (p.id === id ? { id, ...v.value } : p)));
      return { ok: true, value: portfolio.findById(id) };
    },
    remove(id) {
      if (!portfolio.findById(id)) return fail({ id: 'Property not found.' });
      if (occupantOf(id)) return fail({ id: 'This home is occupied.' });
      commit('portfolio', tables.portfolio.filter((p) => p.id !== id));
      return { ok: true };
    },
  };

  const communities = {
    ...base('communities'),
    create(input) {
      const v = validateCommunity(input);
      if (!v.ok) return v;
      if (communities.findById(v.value.id)) return fail({ id: 'A community with this id exists.' });
      commit('communities', [...tables.communities, v.value]);
      return { ok: true, value: communities.findById(v.value.id) };
    },
    update(id, patch) {
      const current = communities.findById(id);
      if (!current) return fail({ id: 'Community not found.' });
      const v = validateCommunity({ ...current, ...patch, id });
      if (!v.ok) return v;
      commit('communities', tables.communities.map((c) => (c.id === id ? v.value : c)));
      return { ok: true, value: communities.findById(id) };
    },
    remove(id) {
      if (!communities.findById(id)) return fail({ id: 'Community not found.' });
      if (tables.portfolio.some((p) => p.communityId === id)) return fail({ id: 'Remove its homes first.' });
      commit('communities', tables.communities.filter((c) => c.id !== id));
      return { ok: true };
    },
  };

  /** Join a user to their home, community and tier. */
  function resolveUser(userId) {
    const user = users.findById(userId);
    if (!user) return undefined;
    const property = portfolio.findById(user.propertyId);
    return {
      user,
      property,
      community: property && communities.findById(property.communityId),
      tier: property && tiers.find((t) => t.id === property.tier),
      age: ageOn(user.dateOfBirth, now),
    };
  }

  const freeUnits = ({ communityId, tier }) =>
    tables.portfolio.filter((p) => (!communityId || p.communityId === communityId) && (!tier || p.tier === tier) && !occupantOf(p.id));

  function communityStats() {
    return tables.communities.map((community) => {
      const homes = tables.portfolio.filter((p) => p.communityId === community.id);
      const residents = homes.map((p) => occupantOf(p.id)).filter(Boolean);
      const byTier = Object.fromEntries(tiers.map((t) => {
        const ofTier = homes.filter((p) => p.tier === t.id);
        return [t.id, { units: ofTier.length, free: ofTier.filter((p) => !occupantOf(p.id)).length }];
      }));
      return {
        community,
        units: homes.length,
        occupied: residents.length,
        members: residents.length,
        totalShares: residents.reduce((s, u) => s + u.shares, 0),
        byTier,
      };
    });
  }

  return { users, portfolio, communities, resolveUser, freeUnits, occupantOf, communityStats, snapshot };
}
