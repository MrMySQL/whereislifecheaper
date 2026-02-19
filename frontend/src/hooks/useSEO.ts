import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  noIndex?: boolean;
  structuredData?: object;
}

const DEFAULT_TITLE = 'WhereIsLifeCheaper - Compare Grocery Prices Across Countries';
const DEFAULT_DESCRIPTION = 'Compare grocery prices across countries. Track daily prices from supermarkets in Turkey, Spain, Montenegro, Ukraine, Kazakhstan, Uzbekistan, and more. Find where life is cheaper.';
const SITE_NAME = 'WhereIsLifeCheaper';
const DEFAULT_OG_IMAGE = '/og-image.png';

export function useSEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  canonicalUrl,
  ogType = 'website',
  ogImage = DEFAULT_OG_IMAGE,
  noIndex = false,
  structuredData,
}: SEOProps = {}) {
  useEffect(() => {
    // Set page title
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    document.title = fullTitle;

    // Helper to update or create meta tag
    const setMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null;

      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // Helper to remove meta tag
    const removeMetaTag = (name: string, isProperty = false) => {
      const attribute = isProperty ? 'property' : 'name';
      const element = document.querySelector(`meta[${attribute}="${name}"]`);
      if (element) {
        element.remove();
      }
    };

    // Set basic meta tags
    setMetaTag('description', description);

    if (keywords) {
      setMetaTag('keywords', keywords);
    }

    // Robots meta
    if (noIndex) {
      setMetaTag('robots', 'noindex, nofollow');
    } else {
      setMetaTag('robots', 'index, follow');
    }

    // Open Graph tags
    setMetaTag('og:title', fullTitle, true);
    setMetaTag('og:description', description, true);
    setMetaTag('og:type', ogType, true);
    setMetaTag('og:site_name', SITE_NAME, true);
    setMetaTag('og:image', ogImage, true);
    setMetaTag('og:locale', 'en_US', true);

    if (canonicalUrl) {
      setMetaTag('og:url', canonicalUrl, true);
    }

    // Twitter Card tags
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', fullTitle);
    setMetaTag('twitter:description', description);
    setMetaTag('twitter:image', ogImage);

    // Canonical URL
    let canonicalElement = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonicalUrl) {
      if (!canonicalElement) {
        canonicalElement = document.createElement('link');
        canonicalElement.rel = 'canonical';
        document.head.appendChild(canonicalElement);
      }
      canonicalElement.href = canonicalUrl;
    } else if (canonicalElement) {
      canonicalElement.remove();
    }

    // Structured Data (JSON-LD)
    const existingScript = document.querySelector('script[data-seo="structured-data"]');
    if (existingScript) {
      existingScript.remove();
    }

    if (structuredData) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', 'structured-data');
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    // Cleanup function
    return () => {
      // Reset to defaults when component unmounts
      document.title = DEFAULT_TITLE;
      setMetaTag('description', DEFAULT_DESCRIPTION);
      removeMetaTag('keywords');
      setMetaTag('robots', 'index, follow');

      // Reset OG tags
      setMetaTag('og:title', DEFAULT_TITLE, true);
      setMetaTag('og:description', DEFAULT_DESCRIPTION, true);
      setMetaTag('og:type', 'website', true);
      removeMetaTag('og:url', true);

      // Reset Twitter tags
      setMetaTag('twitter:title', DEFAULT_TITLE);
      setMetaTag('twitter:description', DEFAULT_DESCRIPTION);

      // Remove structured data
      const script = document.querySelector('script[data-seo="structured-data"]');
      if (script) {
        script.remove();
      }
    };
  }, [title, description, keywords, canonicalUrl, ogType, ogImage, noIndex, structuredData]);
}

// Generate structured data for the website
export function generateWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: 'https://whereislifecheaper.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://whereislifecheaper.com/?search={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

// Generate structured data for a country page
export function generateCountrySchema(country: {
  name: string;
  code: string;
  productCount: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Grocery Prices in ${country.name}`,
    description: `Browse ${country.productCount.toLocaleString()} grocery products and prices in ${country.name}. Compare supermarket prices and find the best deals.`,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: 'https://whereislifecheaper.com',
    },
    about: {
      '@type': 'Country',
      name: country.name,
      identifier: country.code,
    },
  };
}

// Generate breadcrumb structured data
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Generate FAQ structured data
export function generateFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
