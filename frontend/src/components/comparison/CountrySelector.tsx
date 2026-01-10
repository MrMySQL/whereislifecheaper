import { Check, Plus } from 'lucide-react';
import type { Country } from '../../types';

interface CountrySelectorProps {
  countries: Country[];
  selectedCodes: string[];
  onToggle: (code: string) => void;
}

export default function CountrySelector({
  countries,
  selectedCodes,
  onToggle,
}: CountrySelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {countries.map((country) => {
        const isSelected = selectedCodes.includes(country.code);
        return (
          <button
            key={country.id}
            onClick={() => onToggle(country.code)}
            className={`
              group flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 text-sm
              ${
                isSelected
                  ? 'border-terracotta-400 bg-terracotta-50 text-terracotta-800 shadow-sm'
                  : 'border-cream-200 bg-white/80 text-charcoal-600 hover:border-cream-300 hover:bg-cream-50'
              }
            `}
          >
            <span className="text-base">{country.flag_emoji}</span>
            <span className="font-medium">{country.code}</span>
            <div
              className={`
                w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200
                ${
                  isSelected
                    ? 'bg-terracotta-500 text-white'
                    : 'bg-cream-200 text-cream-400 group-hover:bg-cream-300'
                }
              `}
            >
              {isSelected ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <Plus className="h-2.5 w-2.5" strokeWidth={2} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
