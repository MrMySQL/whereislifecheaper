import i18n from '../i18n';

const localeMap: Record<string, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  uk: 'uk-UA',
};

export function getLocale(): string {
  return localeMap[i18n.language] || 'en-US';
}

export function formatDate(
  date: Date | string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(getLocale(), options);
}

export function formatDateTime(
  date: Date | string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return d.toLocaleString(getLocale(), options || defaultOptions);
}

export function formatShortDate(date: Date | string | null): string {
  return formatDate(date, { month: 'short', day: 'numeric' });
}

export function formatFullDate(date: Date | string | null): string {
  return formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return i18n.t('time.never');

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return i18n.t('time.justNow');
  if (diffMinutes < 60) return i18n.t('time.minutesAgo', { count: diffMinutes });
  if (diffHours < 24) return i18n.t('time.hoursAgo', { count: diffHours });
  if (diffDays === 1) return i18n.t('time.yesterday');
  if (diffDays < 7) return i18n.t('time.daysAgo', { count: diffDays });

  return formatShortDate(date);
}
