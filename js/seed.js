// Seed rows for the three demo tables. All people and community scores are fictional demo data.
// riskLevel: 1 (very low) – 5 (very high) investment risk. safetyLevel: 1 (low) – 5 (excellent).

const units = (prefix, communityId) => [
  { id: `${prefix}-S-01`, tier: 'S', communityId },
  { id: `${prefix}-S-02`, tier: 'S', communityId },
  { id: `${prefix}-M-01`, tier: 'M', communityId },
  { id: `${prefix}-M-02`, tier: 'M', communityId },
  { id: `${prefix}-L-01`, tier: 'L', communityId },
];

export const SEED = Object.freeze({
  communities: [
    {
      id: 'gowanus', location: 'Gowanus, Brooklyn, NY', riskLevel: 2, safetyLevel: 4,
      amenities: ['Chef’s kitchen', 'Coworking', 'Fitness studio', 'Guest suites', 'Laundry'],
    },
    {
      id: 'downtown-bk', location: 'Downtown Brooklyn, NY', riskLevel: 1, safetyLevel: 4,
      amenities: ['Chef’s kitchen', 'Coworking + video booths', 'Fitness + yoga', 'Guest suites', 'Roof lounge'],
    },
    {
      id: 'bushwick', location: 'Bushwick, Brooklyn, NY', riskLevel: 3, safetyLevel: 3,
      amenities: ['Chef’s kitchen', 'Coworking', 'Maker space', 'Guest suite', 'Laundry'],
    },
  ],
  portfolio: [...units('GOW', 'gowanus'), ...units('DTB', 'downtown-bk'), ...units('BUS', 'bushwick')],
  users: [
    { id: 'u-001', firstName: 'Demo', lastName: 'Member', dateOfBirth: '1996-05-12', shares: 84, propertyId: 'GOW-M-01' },
    { id: 'u-002', firstName: 'Priya', lastName: 'Shah', dateOfBirth: '1993-02-03', shares: 150, propertyId: 'GOW-S-01' },
    { id: 'u-003', firstName: 'Marcus', lastName: 'Lee', dateOfBirth: '1990-09-21', shares: 410, propertyId: 'DTB-L-01' },
    { id: 'u-004', firstName: 'Sofia', lastName: 'Alvarez', dateOfBirth: '1998-11-30', shares: 60, propertyId: 'DTB-M-01' },
    { id: 'u-005', firstName: 'Jordan', lastName: 'Kim', dateOfBirth: '1995-07-14', shares: 120, propertyId: 'BUS-M-01' },
    { id: 'u-006', firstName: 'Elena', lastName: 'Petrova', dateOfBirth: '1992-03-08', shares: 95, propertyId: 'BUS-S-01' },
  ],
});
