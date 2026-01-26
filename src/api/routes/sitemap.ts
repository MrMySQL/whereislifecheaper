import { Router } from 'express';
import pool from '../../config/database';

const router = Router();

const BASE_URL = process.env.BASE_URL || 'https://whereislifecheaper.com';

// Generate XML sitemap
router.get('/sitemap.xml', async (_req, res) => {
  try {
    // Fetch all countries
    const countriesResult = await pool.query(`
      SELECT code, name, updated_at
      FROM countries
      ORDER BY name
    `);
    const countries = countriesResult.rows;

    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${BASE_URL}/" />
    <xhtml:link rel="alternate" hreflang="ru" href="${BASE_URL}/?lang=ru" />
    <xhtml:link rel="alternate" hreflang="uk" href="${BASE_URL}/?lang=uk" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/" />
  </url>

  <!-- Request Country Page -->
  <url>
    <loc>${BASE_URL}/request-country</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`;

    // Add country pages
    for (const country of countries) {
      const countryLastMod = country.updated_at
        ? new Date(country.updated_at).toISOString().split('T')[0]
        : today;

      xml += `
  <!-- ${country.name} -->
  <url>
    <loc>${BASE_URL}/country/${country.code.toLowerCase()}</loc>
    <lastmod>${countryLastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

// Generate robots.txt dynamically (alternative to static file)
router.get('/robots.txt', (_req, res) => {
  const robots = `# Robots.txt for WhereIsLifeCheaper
# ${BASE_URL}

User-agent: *
Allow: /

# Allow all major search engine crawlers
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Yandex
Allow: /

# Disallow admin and auth pages
Disallow: /admin/
Disallow: /login
Disallow: /api/

# Sitemap location
Sitemap: ${BASE_URL}/sitemap.xml
`;

  res.header('Content-Type', 'text/plain');
  res.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.send(robots);
});

export default router;
