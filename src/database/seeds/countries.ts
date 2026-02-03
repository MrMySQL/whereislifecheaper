import { query } from '../index';

export interface CountrySeedData {
  name: string;
  code: string;
  currency_code: string;
  flag_emoji: string;
}

export const countriesData: CountrySeedData[] = [
  {
    name: 'Turkey',
    code: 'TR',
    currency_code: 'TRY',
    flag_emoji: '🇹🇷',
  },
  {
    name: 'Montenegro',
    code: 'ME',
    currency_code: 'EUR',
    flag_emoji: '🇲🇪',
  },
  {
    name: 'Spain',
    code: 'ES',
    currency_code: 'EUR',
    flag_emoji: '🇪🇸',
  },
  {
    name: 'Uzbekistan',
    code: 'UZ',
    currency_code: 'UZS',
    flag_emoji: '🇺🇿',
  },
  {
    name: 'Ukraine',
    code: 'UA',
    currency_code: 'UAH',
    flag_emoji: '🇺🇦',
  },
  {
    name: 'Kazakhstan',
    code: 'KZ',
    currency_code: 'KZT',
    flag_emoji: '🇰🇿',
  },
  {
    name: 'Germany',
    code: 'DE',
    currency_code: 'EUR',
    flag_emoji: '🇩🇪',
  },
  {
    name: 'Malaysia',
    code: 'MY',
    currency_code: 'MYR',
    flag_emoji: '🇲🇾',
  },
  {
    name: 'Albania',
    code: 'AL',
    currency_code: 'ALL',
    flag_emoji: '🇦🇱',
  },
  {
    name: 'Austria',
    code: 'AT',
    currency_code: 'EUR',
    flag_emoji: '🇦🇹',
  },
  {
    name: 'Russia',
    code: 'RU',
    currency_code: 'RUB',
    flag_emoji: '🇷🇺',
  },
];

export async function seedCountries(): Promise<void> {
  console.log('Seeding countries...');

  for (const country of countriesData) {
    await query(
      `INSERT INTO countries (name, code, currency_code, flag_emoji)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           currency_code = EXCLUDED.currency_code,
           flag_emoji = EXCLUDED.flag_emoji`,
      [country.name, country.code, country.currency_code, country.flag_emoji]
    );
    console.log(`✓ Seeded country: ${country.name}`);
  }

  console.log('Countries seeded successfully');
}
