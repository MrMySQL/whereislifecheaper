import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { supportedLanguages, type SupportedLanguage } from '../../i18n';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentLanguage = supportedLanguages.find(
    (lang) => lang.code === i18n.language
  ) || supportedLanguages[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus management when dropdown opens
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleLanguageChange = (langCode: SupportedLanguage) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev < supportedLanguages.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : supportedLanguages.length - 1
        );
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(supportedLanguages.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0) {
          handleLanguageChange(supportedLanguages[focusedIndex].code);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
    }
  }, [isOpen, focusedIndex]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setFocusedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium text-charcoal-600 hover:text-charcoal-900 hover:bg-cream-100 transition-colors"
        aria-label={t('common.changeLanguage')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="language-listbox"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline" aria-hidden="true">{currentLanguage.flag}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id="language-listbox"
          role="listbox"
          aria-label={t('common.selectLanguage')}
          aria-activedescendant={focusedIndex >= 0 ? `language-option-${supportedLanguages[focusedIndex].code}` : undefined}
          className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-cream-200 py-1 z-50"
          onKeyDown={handleKeyDown}
        >
          {supportedLanguages.map((lang, index) => (
            <button
              key={lang.code}
              id={`language-option-${lang.code}`}
              ref={(el) => { optionRefs.current[index] = el; }}
              role="option"
              aria-selected={lang.code === i18n.language}
              onClick={() => handleLanguageChange(lang.code)}
              onKeyDown={handleKeyDown}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-cream-50 transition-colors ${
                lang.code === i18n.language
                  ? 'text-terracotta-600 bg-terracotta-50/50'
                  : 'text-charcoal-700'
              } ${focusedIndex === index ? 'bg-cream-100 outline-none' : ''}`}
            >
              <span className="text-lg" aria-hidden="true">{lang.flag}</span>
              <span className="flex-1">{lang.nativeName}</span>
              {lang.code === i18n.language && (
                <Check className="h-4 w-4 text-terracotta-600" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
