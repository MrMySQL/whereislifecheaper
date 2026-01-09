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
    <div className="flex flex-wrap gap-3">
      {countries.map((country) => {
        const isSelected = selectedCodes.includes(country.code);
        return (
          <button
            key={country.id}
            onClick={() => onToggle(country.code)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all
              ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }
            `}
          >
            <span className="text-lg">{country.flag_emoji}</span>
            <span className="font-medium">{country.code}</span>
            {isSelected ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        );
      })}
    </div>
  );
}
