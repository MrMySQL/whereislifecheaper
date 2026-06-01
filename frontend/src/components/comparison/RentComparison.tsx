import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rentApi } from '../../services/api';
import { convertToEUR, formatPrice } from '../../utils/currency';
import type { CountryRent } from '../../types';

// Columns: studio (0BR) through 3BR. 3BR is flagged low-confidence per the pilot.
const SIZES = [0, 1, 2, 3];

function eurForBucket(country: CountryRent, bedrooms: number): { eur: number; n: number } | null {
  const bucket = country.buckets.find((b) => b.bedrooms === bedrooms);
  if (!bucket) return null;
  return { eur: convertToEUR(bucket.median, country.currency), n: bucket.n_listings };
}

export default function RentComparison() {
  const { t } = useTranslation();
  const { data: rents = [], isLoading } = useQuery({
    queryKey: ['rent'],
    queryFn: rentApi.getAll,
  });

  if (isLoading || rents.length === 0) return null;

  return (
    <section className="card !p-4 space-y-3">
      <div>
        <h2 className="text-lg font-display font-bold text-charcoal-900">{t('rent.title')}</h2>
        <p className="text-xs text-charcoal-500">{t('rent.subtitle')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-charcoal-500">
              <th className="py-2 pr-4 font-medium">{t('common.countries')}</th>
              {SIZES.map((s) => (
                <th key={s} className="py-2 px-3 font-medium whitespace-nowrap">
                  {s === 0 ? t('rent.studio') : t('rent.nBr', { count: s })}
                  {s === 3 && <span className="ml-1 text-charcoal-400" title={t('rent.lowConfidence')}>*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rents.map((country) => (
              <tr key={country.country.code} className="border-t border-cream-200">
                <td className="py-2 pr-4 font-medium text-charcoal-800">{country.country.name}</td>
                {SIZES.map((s) => {
                  const cell = eurForBucket(country, s);
                  return (
                    <td key={s} className="py-2 px-3 whitespace-nowrap">
                      {cell ? (
                        <span>
                          <span className="font-semibold text-charcoal-900">
                            {formatPrice(Math.round(cell.eur), 'EUR')}
                          </span>
                          <span className="block text-xs text-charcoal-400">
                            {t('rent.listings', { count: cell.n })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-charcoal-300">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-charcoal-400">{t('rent.lowConfidence')}</p>
    </section>
  );
}
