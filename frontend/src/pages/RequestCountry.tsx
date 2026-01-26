import { useEffect } from 'react';
import { Globe2 } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

export default function RequestCountry() {
  // Set SEO meta tags for request country page
  useSEO({
    title: 'Request a Country',
    description: 'Request a new country to be added to WhereIsLifeCheaper. Help us prioritize which countries to add next for grocery price comparison.',
    keywords: 'request country, add country, grocery prices, price comparison, new country',
    canonicalUrl: 'https://whereislifecheaper.com/request-country',
  });

  useEffect(() => {
    // Load Tally embed script
    const script = document.createElement('script');
    script.src = 'https://tally.so/widgets/embed.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Globe2 className="w-6 h-6 text-terracotta-500" />
          <h1 className="text-xl font-display font-bold">Request a Country</h1>
        </div>
        <p className="text-charcoal-600 mb-6">
          Which country would you like us to add next? Your feedback helps us prioritize.
        </p>
        <iframe
          data-tally-src="https://tally.so/embed/Np7VbB?alignLeft=1&hideTitle=1"
          width="100%"
          height="400"
          frameBorder="0"
          title="Request a Country"
        />
      </div>
    </div>
  );
}
