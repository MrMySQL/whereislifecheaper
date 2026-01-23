import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LoadingProps {
  text?: string;
  fullScreen?: boolean;
}

export default function Loading({ text, fullScreen = false }: LoadingProps) {
  const { t } = useTranslation();
  const displayText = text || t('common.loading');
  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center gap-3"
    >
      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-terracotta-500 to-terracotta-600 flex items-center justify-center shadow-warm animate-pulse">
          <MapPin className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="absolute inset-0 rounded-xl border-2 border-terracotta-200 border-t-terracotta-500 animate-spin" aria-hidden="true" />
      </div>
      <p className="text-sm text-charcoal-600 font-medium">{displayText}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-cream-100/90 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-10">
      {content}
    </div>
  );
}
