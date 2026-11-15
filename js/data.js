// Mock data for the CoHome hackathon demo.
// Pricing values come from the product spec (sections 5 and 11).
// Anything marked `illustrative` is demo data, not a market figure.

export const MONTHS_TO_OWN = 240; // 20 years of payments => shares fully owned
export const RENT_PER_SQFT = 3; // USD per square foot per month, same for every unit
export const SHARE_SPLIT = 0.5; // share of each monthly payment that buys shares; the rest covers running costs
// One share costs $3. The share part of 20 years of rent on one square foot is
// $3 × 50% × 240 months = $360, so each square foot is worth 120 shares and a home is
// fully owned after 20 years. A day-one buyout costs shares × SHARE_PRICE (no discount).
export const SHARE_PRICE = 3;
export const SHARES_PER_SQFT = (RENT_PER_SQFT * SHARE_SPLIT * MONTHS_TO_OWN) / SHARE_PRICE; // 120

// Buy and sell price = SHARE_PRICE × SHARE_VALUE_INDEX, so buyers and sellers always pay the same price.
// The index starts at 1.00 and is reset once a year from an appraisal of the network's buildings
// (illustrative: no appraisal yet). Rent keeps buying shares on the fixed 20-year schedule.
export const SHARE_VALUE_INDEX = 1;
export const EXIT_FEE_RATE = 0.02; // charged on sales within EXIT_FEE_YEARS of joining, to discourage flipping
export const EXIT_FEE_YEARS = 3;

// Priority points decide contested swaps. Earn 1 per monthly payment and 1 per SHARES_PER_SQFT extra
// shares bought; lose them in proportion when selling shares; winning a contested swap spends half.
export const POINTS_PER_PAYMENT = 1;
export const SWAP_POINT_SPEND = 0.5;

// `areaSqft` is the area the rent is charged on; `sqft` is the size range shown to visitors.
// Monthly rent = areaSqft × RENT_PER_SQFT; shares = areaSqft × SHARES_PER_SQFT.
const withRent = (tier) => Object.freeze({
  ...tier,
  monthly: tier.areaSqft * RENT_PER_SQFT,
  shares: tier.areaSqft * SHARES_PER_SQFT,
});

export const TIERS = Object.freeze([
  {
    id: 'S',
    name: 'Private Pod',
    sqft: '195–235',
    areaSqft: 200,
    audience: 'Single professionals',
    image: 'assets/web/tier-s.webp',
    imageAlt: 'Cutaway render of the Private Pod: platform bed with storage, desk by the window, glass-walled bath and kitchenette',
    features: ['Fold-away or platform bed', '3-piece acoustic bath', 'Built-in work desk', 'Dry kitchenette'],
  },
  {
    id: 'M',
    name: 'Flex Suite',
    sqft: '260–300',
    areaSqft: 300,
    audience: 'A separate living nook, or couples',
    image: 'assets/web/tier-m.webp',
    imageAlt: 'Cutaway render of the Flex Suite: sleeping alcove behind a slatted screen, sofa lounge, work niche, kitchenette and bath',
    features: ['Separate sleeping alcove', 'Work niche', 'Extra storage', 'Kitchenette + 3-piece bath'],
  },
  {
    id: 'L',
    name: 'One bedroom + flex',
    sqft: '~600',
    areaSqft: 600,
    audience: 'Growing households',
    image: 'assets/web/tier-l.webp',
    imageAlt: 'Cutaway render of the one bedroom + flex: bedroom, flexible room with daybed and desk, open living and dining, full kitchen and bath',
    features: ['Separate bedroom', 'Flexible room', 'Full kitchenette', 'Larger storage'],
  },
].map(withRent));

// Rent per person per month, derived in the spec from the investor deck (2024 ACS PUMS).
export const MARKET_RENT = Object.freeze([
  { geo: 'Brooklyn (launch)', renters: '231,900', annual: '$4.53B', monthly: 1630 },
  { geo: 'New York City', renters: '620,900', annual: '$13.55B', monthly: 1820 },
  { geo: 'Eight dense US cities', renters: '1.64M', annual: '$32.35B', monthly: 1640 },
  { geo: 'United States', renters: '11.07M', annual: '$154.75B', monthly: 1165 },
]);

export const PROBLEM_STATS = Object.freeze([
  { value: '71%', label: 'of adults aged 25–34 did not own a home in 2024', source: 'Sustainaprise', href: 'https://www.sustainaprise.com/#idea' },
  { value: '66%', label: 'of renters say saving for a down payment is a hurdle', source: 'NeighborWorks America, 2025 Renters’ Reality', href: null },
  { value: '15×', label: 'median net worth of homeowners vs. renters under 35 ($151,000 vs. $10,000, 2022)', source: 'Sustainaprise', href: 'https://www.sustainaprise.com/#idea' },
]);

// Network buildings. Brooklyn neighborhoods are the business plan's target areas;
// availability and value index are illustrative demo data. In the member app, `units` is
// replaced by the number of free homes in the portfolio database; `requests` and
// `cutoffPoints` model demand from other members.
export const BUILDINGS = Object.freeze([
  {
    id: 'gowanus', name: 'Gowanus', city: 'Brooklyn', status: 'live', lat: 40.6733, lng: -73.9903, valueIndex: 100,
    availability: { S: { units: 2, requests: 1, cutoffPoints: 0 }, M: { units: 1, requests: 3, cutoffPoints: 150 }, L: { units: 0, requests: 2, cutoffPoints: 0 } },
    guestSuites: 2,
  },
  {
    id: 'downtown-bk', name: 'Downtown Brooklyn', city: 'Brooklyn', status: 'live', lat: 40.6928, lng: -73.9874, valueIndex: 112,
    availability: { S: { units: 3, requests: 2, cutoffPoints: 0 }, M: { units: 2, requests: 1, cutoffPoints: 0 }, L: { units: 1, requests: 2, cutoffPoints: 110 } },
    guestSuites: 3,
  },
  {
    id: 'bushwick', name: 'Bushwick', city: 'Brooklyn', status: 'live', lat: 40.6944, lng: -73.9213, valueIndex: 88,
    availability: { S: { units: 1, requests: 4, cutoffPoints: 180 }, M: { units: 2, requests: 1, cutoffPoints: 0 }, L: { units: 1, requests: 1, cutoffPoints: 0 } },
    guestSuites: 1,
  },
  { id: 'manhattan', name: 'Manhattan', city: 'New York', status: 'planned', lat: 40.7831, lng: -73.9712 },
  { id: 'boston', name: 'Boston', city: 'Boston', status: 'future', lat: 42.3601, lng: -71.0589 },
  { id: 'philadelphia', name: 'Philadelphia', city: 'Philadelphia', status: 'future', lat: 39.9526, lng: -75.1652 },
  { id: 'dc', name: 'Washington, D.C.', city: 'Washington', status: 'future', lat: 38.9072, lng: -77.0369 },
  { id: 'chicago', name: 'Chicago', city: 'Chicago', status: 'future', lat: 41.8781, lng: -87.6298 },
  { id: 'sf', name: 'San Francisco', city: 'San Francisco', status: 'future', lat: 37.7749, lng: -122.4194 },
  { id: 'seattle', name: 'Seattle', city: 'Seattle', status: 'future', lat: 47.6062, lng: -122.3321 },
  { id: 'la', name: 'Los Angeles', city: 'Los Angeles', status: 'future', lat: 34.0522, lng: -118.2437 },
]);

// App-only member fields. Name, shares, home and tier come from the user database (js/seed.js, u-001).
// 120 points = 48 monthly payments + 72 from extra shares bought earlier (8,640 shares).
export const DEMO_MEMBER = Object.freeze({
  userId: 'u-001',
  points: 120,
  monthsPaid: 48,
});

export const PROPOSALS = Object.freeze([
  { id: 'bushwick-2', title: 'Bushwick phase 2', detail: 'Convert a second Class B office floor next to the Bushwick building.' },
  { id: 'manhattan-les', title: 'Manhattan pilot (SPV Pilot 2)', detail: 'Open the planned Manhattan building as the next network site.' },
  { id: 'partner-coop', title: 'Partner co-op license', detail: 'License the platform to an existing co-op so its members join the network.' },
]);
