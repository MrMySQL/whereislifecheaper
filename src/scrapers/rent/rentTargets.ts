export interface RentTarget {
  countryCode: string;
  city: string;
}

export const RENT_TARGETS: RentTarget[] = [
  { countryCode: 'UA', city: 'Kyiv' },
  { countryCode: 'AU', city: 'Sydney' },
];
