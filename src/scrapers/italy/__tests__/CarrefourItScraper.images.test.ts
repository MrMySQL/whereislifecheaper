jest.mock('../../../config/env', () => ({ config: { scraper: {} } }));
jest.mock('../../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { logger: stub, scraperLogger: stub, createPrefixedLogger: () => stub };
});

import { parseTileImages } from '../CarrefourItScraper';

const STATIC = '/on/demandware.static/-/Sites-carrefour-master-catalog-IT/default';
const CDN = 'https://www.carrefour.it/dw/image/v2/BDWP_PRD';

/** Tile markup as served on carrefour.it category pages (trimmed). */
function tile(pid: string, file: string, srcsetFile: string, fallbackFile = file): string {
  const rendition = (w: number) => `${CDN}${STATIC}/${srcsetFile}?sw=${w}&amp;sfrm=jpg ${w}w`;
  return `
<div class="product-tile" data-pid="${pid}">
  <div class="image-container">
    <img class="tile-image lazyload "
      data-srcset="${rendition(260)},${rendition(110)},${rendition(64)},${STATIC}/${fallbackFile} 110w"
      data-sizes="(max-width: 1023px) 50vw, (min-width: 1024px) 110px"
      data-src="${STATIC}/${file}"
      alt="product" />
  </div>
</div>`;
}

describe('parseTileImages', () => {
  it('returns the single data-src file, never the srcset list', () => {
    // Real case: srcset names -1.png (404) while the stored file is -1.jpg
    const html = tile('8012666065202', 'dw21755817/large/Olive-8012666065202-1.jpg', 'dw21755817/large/Olive-8012666065202-1.png');

    expect(parseTileImages(html)).toEqual(new Map([
      ['8012666065202', `https://www.carrefour.it${STATIC}/dw21755817/large/Olive-8012666065202-1.jpg`],
    ]));
  });

  it('keeps each tile on its own image', () => {
    const html = tile('111', 'a/large/A-1.png', 'a/large/A-1.png') + tile('222', 'b/large/B-1.jpg', 'b/large/B-1.png');
    const images = parseTileImages(html);

    expect(images.get('111')).toBe(`https://www.carrefour.it${STATIC}/a/large/A-1.png`);
    expect(images.get('222')).toBe(`https://www.carrefour.it${STATIC}/b/large/B-1.jpg`);
    for (const url of images.values()) expect(url).not.toMatch(/[\s,?]|&amp;/);
  });

  it('reads plain src on eager-loaded tiles, which have no data-src', () => {
    const html = `
<div class="product-tile" data-pid="444">
  <img class="tile-image" src="${STATIC}/e/large/E-1.jpg" alt="product" />
</div>`;

    expect(parseTileImages(html).get('444')).toBe(`https://www.carrefour.it${STATIC}/e/large/E-1.jpg`);
  });

  it('decodes HTML-escaped ampersands in the image attribute', () => {
    const html = tile('555', 'f/large/Salt&amp;Pepper-1.jpg?sw=260&amp;sfrm=jpg', 'f/large/Salt&amp;Pepper-1.png');

    expect(parseTileImages(html).get('555'))
      .toBe(`https://www.carrefour.it${STATIC}/f/large/Salt&Pepper-1.jpg?sw=260&sfrm=jpg`);
  });

  it('skips tiles without an image', () => {
    expect(parseTileImages('<div data-pid="333"><span>no image</span></div>').size).toBe(0);
  });
});
