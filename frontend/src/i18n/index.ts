import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { registerSuperProperties } from '../lib/analytics';

import en from './locales/en.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';

export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      uk: { translation: uk },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru', 'uk'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Attach the UI language to every event so any metric can be split by it.
// $browser_language is the browser's setting, which the user may have overridden.
const registerLanguage = (lng: string) => registerSuperProperties({ ui_language: lng });
if (i18n.language) registerLanguage(i18n.language);
i18n.on('languageChanged', registerLanguage);

export default i18n;
