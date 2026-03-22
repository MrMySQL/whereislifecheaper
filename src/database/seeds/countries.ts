import { query } from '../index';

export interface CountrySeedData {
  name: string;
  code: string;
  currency_code: string;
  flag_emoji: string;
  language_code: string;
}

export const countriesData: CountrySeedData[] = [
  {
    name: 'Turkey',
    code: 'TR',
    currency_code: 'TRY',
    flag_emoji: '🇹🇷',
    language_code: 'tr',
  },
  {
    name: 'Montenegro',
    code: 'ME',
    currency_code: 'EUR',
    flag_emoji: '🇲🇪',
    language_code: 'sr',
  },
  {
    name: 'Spain',
    code: 'ES',
    currency_code: 'EUR',
    flag_emoji: '🇪🇸',
    language_code: 'es',
  },
  {
    name: 'Uzbekistan',
    code: 'UZ',
    currency_code: 'UZS',
    flag_emoji: '🇺🇿',
    language_code: 'uz',
  },
  {
    name: 'Ukraine',
    code: 'UA',
    currency_code: 'UAH',
    flag_emoji: '🇺🇦',
    language_code: 'uk',
  },
  {
    name: 'Kazakhstan',
    code: 'KZ',
    currency_code: 'KZT',
    flag_emoji: '🇰🇿',
    language_code: 'ru',
  },
  {
    name: 'Germany',
    code: 'DE',
    currency_code: 'EUR',
    flag_emoji: '🇩🇪',
    language_code: 'de',
  },
  {
    name: 'Malaysia',
    code: 'MY',
    currency_code: 'MYR',
    flag_emoji: '🇲🇾',
    language_code: 'ms',
  },
  {
    name: 'Albania',
    code: 'AL',
    currency_code: 'ALL',
    flag_emoji: '🇦🇱',
    language_code: 'sq',
  },
  {
    name: 'Austria',
    code: 'AT',
    currency_code: 'EUR',
    flag_emoji: '🇦🇹',
    language_code: 'de',
  },
  {
    name: 'Russia',
    code: 'RU',
    currency_code: 'RUB',
    flag_emoji: '🇷🇺',
    language_code: 'ru',
  },
  {
    name: 'Vietnam',
    code: 'VN',
    currency_code: 'VND',
    flag_emoji: '🇻🇳',
    language_code: 'vi',
  },
  {
    name: 'Romania',
    code: 'RO',
    currency_code: 'RON',
    flag_emoji: '🇷🇴',
    language_code: 'ro',
  },
  {
    name: 'Italy',
    code: 'IT',
    currency_code: 'EUR',
    flag_emoji: '🇮🇹',
    language_code: 'it',
  },
];

export async function seedCountries(): Promise<void> {
  console.log('Seeding countries...');

  for (const country of countriesData) {
    await query(
      `INSERT INTO countries (name, code, currency_code, flag_emoji, language_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           currency_code = EXCLUDED.currency_code,
           flag_emoji = EXCLUDED.flag_emoji,
           language_code = EXCLUDED.language_code`,
      [country.name, country.code, country.currency_code, country.flag_emoji, country.language_code]
    );
    console.log(`✓ Seeded country: ${country.name}`);
  }

  console.log('Countries seeded successfully');
}
