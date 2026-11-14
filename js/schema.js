// Field rules for the User, Portfolio and Community tables.
// Each validator returns { ok: true, value } with normalised fields, or { ok: false, errors }.

export const TIER_IDS = ['S', 'M', 'L'];
export const RISK_LABELS = { 1: 'Very low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very high' };
export const SAFETY_LABELS = { 1: 'Low', 2: 'Below average', 3: 'Average', 4: 'Good', 5: 'Excellent' };
export const MIN_AGE = 18;

const isLevel = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
const text = (v) => String(v ?? '').trim();
const result = (errors, value) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, value });

export function ageOn(dateOfBirth, now = new Date()) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth)) || Number.isNaN(dob.getTime())) return NaN;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth()
    || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

export function validateCommunity(input) {
  const errors = {};
  const id = text(input.id).toLowerCase();
  const location = text(input.location);
  const riskLevel = Number(input.riskLevel);
  const safetyLevel = Number(input.safetyLevel);
  const amenities = Array.isArray(input.amenities) ? input.amenities.map(text).filter(Boolean) : null;

  if (!/^[a-z0-9-]{2,40}$/.test(id)) errors.id = 'Use 2–40 lowercase letters, numbers or dashes.';
  if (location.length < 2 || location.length > 120) errors.location = 'Enter a location.';
  if (!isLevel(riskLevel)) errors.riskLevel = 'Risk level is 1–5.';
  if (!isLevel(safetyLevel)) errors.safetyLevel = 'Safety level is 1–5.';
  if (!amenities || amenities.length === 0) errors.amenities = 'List at least one amenity.';
  return result(errors, { id, location, riskLevel, safetyLevel, amenities });
}

export function validatePortfolio(input, { communities }) {
  const errors = {};
  const tier = text(input.tier).toUpperCase();
  const communityId = text(input.communityId);
  if (!TIER_IDS.includes(tier)) errors.tier = 'Tier is S, M or L.';
  if (!communities.some((c) => c.id === communityId)) errors.communityId = 'Unknown community.';
  return result(errors, { tier, communityId });
}

/**
 * @param ctx.portfolio  all portfolio rows
 * @param ctx.tiers      tier definitions (for the share cap)
 * @param ctx.isFree     (propertyId) => boolean, false when another user lives there
 */
export function validateUser(input, { portfolio, tiers, isFree, now = new Date() }) {
  const errors = {};
  const firstName = text(input.firstName);
  const lastName = text(input.lastName);
  const dateOfBirth = text(input.dateOfBirth);
  const shares = Number(input.shares);
  const propertyId = text(input.propertyId);

  if (firstName.length < 1 || firstName.length > 50) errors.firstName = 'Enter a first name.';
  if (lastName.length < 1 || lastName.length > 50) errors.lastName = 'Enter a last name.';

  const age = ageOn(dateOfBirth, now);
  if (Number.isNaN(age)) errors.dateOfBirth = 'Use a valid date (YYYY-MM-DD).';
  else if (age < MIN_AGE) errors.dateOfBirth = `Members must be ${MIN_AGE} or older.`;
  else if (age > 120) errors.dateOfBirth = 'Check the date of birth.';

  const property = portfolio.find((p) => p.id === propertyId);
  if (!property) errors.propertyId = 'Unknown property.';
  else if (!isFree(propertyId)) errors.propertyId = 'That home is already occupied.';

  const cap = property ? tiers.find((t) => t.id === property.tier)?.shares : Infinity;
  if (!Number.isInteger(shares) || shares < 0) errors.shares = 'Shares must be a whole number, 0 or more.';
  else if (shares > cap) errors.shares = `A Tier ${property.tier} home has ${cap} shares at most.`;

  return result(errors, { firstName, lastName, dateOfBirth, shares, propertyId });
}
