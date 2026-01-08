import { ScraperConfig, CategoryConfig } from '../types/scraper.types';

/**
 * Default scraper configurations
 * These can be overridden by database configurations
 */

export const migrosCategories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/meyve-sebze-c-2' },
  { id: 'meat-fish', name: 'Meat, Chicken & Fish', url: '/et-tavuk-balik-c-3' },
  { id: 'dairy', name: 'Dairy & Breakfast', url: '/sut-kahvaltilik-c-4' },
  { id: 'staples', name: 'Staple Foods', url: '/temel-gida-c-5' },
  { id: 'beverages', name: 'Beverages', url: '/icecek-c-6' },
  { id: 'snacks', name: 'Snacks', url: '/atistirmalik-c-7' },
  { id: 'frozen', name: 'Frozen Foods', url: '/donuk-gida-c-8' },
];

export const migrosConfig: Partial<ScraperConfig> = {
  name: 'Migros',
  baseUrl: 'https://www.migros.com.tr',
  categories: migrosCategories,
  selectors: {
    productCard: 'mat-card',
    productName: 'img.product-image',  // Use alt attribute for name
    productPrice: '.price-container',
    productImage: 'img.product-image',
    productUrl: 'a[href*="-p-"]',
    productBrand: '.brand',
    productOriginalPrice: '.old-price',
    pagination: 'button[aria-label*="sayfa"]',
    nextPage: 'button[aria-label="Sonraki sayfa"]',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
    betweenPages: 3000,
  },
  maxRetries: 3,
  concurrentPages: 2,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export const a101Categories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/market/meyve-sebze' },
  { id: 'meat-fish', name: 'Meat, Chicken & Fish', url: '/market/et-tavuk-balik' },
  { id: 'dairy', name: 'Dairy Products', url: '/market/sut-urunleri' },
];

export const a101Config: Partial<ScraperConfig> = {
  name: 'A101',
  baseUrl: 'https://www.a101.com.tr',
  categories: a101Categories,
  selectors: {
    productCard: '.product-item',
    productName: '.product-title',
    productPrice: '.price-tag',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 2,
};

export const voliCategories: CategoryConfig[] = [
  // Pića - Bezalkoholna pića (Non-alcoholic drinks)
  { id: '127', name: 'Gazirani sokovi', url: '/kategorije/127' },
  { id: '128', name: 'Energetska pića', url: '/kategorije/128' },
  { id: '129', name: 'Negazirani sokovi', url: '/kategorije/129' },
  { id: '130', name: 'Ledeni čaj i napici', url: '/kategorije/130' },
  { id: '131', name: 'Voda', url: '/kategorije/131' },
  { id: '132', name: 'Instant sokovi u prahu i suplementi', url: '/kategorije/132' },
  { id: '133', name: 'Sirupi', url: '/kategorije/133' },
  { id: '134', name: 'Hladna kafa', url: '/kategorije/134' },
  // Pića - Topli napici (Hot drinks)
  { id: '143', name: 'Kafa', url: '/kategorije/143' },
  { id: '144', name: 'Čaj', url: '/kategorije/144' },
  { id: '145', name: 'Topla čokolada', url: '/kategorije/145' },
  // Mliječni proizvodi i jaja (Dairy and eggs)
  { id: '22', name: 'Mlijeko', url: '/kategorije/22' },
  { id: '23', name: 'Jogurt, kefir i slično', url: '/kategorije/23' },
  { id: '24', name: 'Pavlake', url: '/kategorije/24' },
  { id: '25', name: 'Čokoladno mlijeko', url: '/kategorije/25' },
  { id: '26', name: 'Jaja', url: '/kategorije/26' },
  { id: '27', name: 'Mliječni deserti', url: '/kategorije/27' },
  { id: '28', name: 'Maslac i margarin', url: '/kategorije/28' },
  { id: '29', name: 'Majonez i prelivi', url: '/kategorije/29' },
  { id: '30', name: 'Edamer, gauda emental', url: '/kategorije/30' },
  { id: '31', name: 'Feta, domaći i drugi bijeli sirevi', url: '/kategorije/31' },
  { id: '32', name: 'Sirni namaz i kajmak', url: '/kategorije/32' },
  { id: '33', name: 'Parmezan i sirevi sa plijesnima', url: '/kategorije/33' },
  { id: '34', name: 'Mozzarella i drugi meki sirevi', url: '/kategorije/34' },
  { id: '35', name: 'Ostali delikatesni sirevi', url: '/kategorije/35' },
  { id: '36', name: 'Kozji i ovčiji sir', url: '/kategorije/36' },
  { id: '37', name: 'Tost i topljeni sirevi', url: '/kategorije/37' },
  { id: '38', name: 'Dimljeni sirevi', url: '/kategorije/38' },
  { id: '39', name: 'Biljni sirevi', url: '/kategorije/39' },
  { id: '40', name: 'Surutka', url: '/kategorije/40' },
  // Voće i povrće (Fruits and vegetables)
  { id: '146', name: 'Voće', url: '/kategorije/146' },
  { id: '147', name: 'Povrće', url: '/kategorije/147' },
  { id: '248', name: 'Pakovane salate i svježe začinsko bilje', url: '/kategorije/248' },
  { id: '148', name: 'Organsko voće i povrće', url: '/kategorije/148' },
  { id: '149', name: 'Pečurke', url: '/kategorije/149' },
  { id: '150', name: 'Orašasti plodovi i sjemenke', url: '/kategorije/150' },
  { id: '151', name: 'Dehidrirano voće', url: '/kategorije/151' },
  { id: '152', name: 'Zimnica', url: '/kategorije/152' },
  { id: '153', name: 'Sosevi i pelati', url: '/kategorije/153' },
  { id: '154', name: 'Kečap', url: '/kategorije/154' },
  { id: '155', name: 'Masline', url: '/kategorije/155' },
  { id: '156', name: 'Namazi', url: '/kategorije/156' },
  { id: '157', name: 'Kompoti', url: '/kategorije/157' },
  // Sve za doručak (Breakfast)
  { id: '43', name: 'Kremovi', url: '/kategorije/43' },
  { id: '44', name: 'Cerealije (musli, corn flakes)', url: '/kategorije/44' },
  { id: '45', name: 'Džemovi i marmelade', url: '/kategorije/45' },
  { id: '46', name: 'Med', url: '/kategorije/46' },
  { id: '47', name: 'Dodaci za mliječne napitke', url: '/kategorije/47' },
  // Mesara i ribara (Butcher and fish - excluding Svinjetina)
  { id: '158', name: 'Roštilj', url: '/kategorije/158' },
  { id: '160', name: 'Junetina', url: '/kategorije/160' },
  { id: '161', name: 'Piletina', url: '/kategorije/161' },
  { id: '162', name: 'Jagnjetina', url: '/kategorije/162' },
  { id: '163', name: 'Ćuretina', url: '/kategorije/163' },
  { id: '164', name: 'Teletina', url: '/kategorije/164' },
  { id: '165', name: 'Smrznuta piletina', url: '/kategorije/165' },
  { id: '166', name: 'Smrznuta ćuretina', url: '/kategorije/166' },
  { id: '243', name: 'Smrznuta junetina', url: '/kategorije/243' },
  { id: '167', name: 'Morska riba smrznuto', url: '/kategorije/167' },
  { id: '168', name: 'Plodovi mora smrznuto', url: '/kategorije/168' },
  { id: '169', name: 'Panirani riblji proizvodi smrznuto', url: '/kategorije/169' },
  { id: '170', name: 'Slatkovodna riba', url: '/kategorije/170' },
  { id: '171', name: 'Morska riba', url: '/kategorije/171' },
  // Suhomesnati proizvodi i konzerve (Cured meats and canned goods)
  { id: '172', name: 'Trajni suhomesnati proizvodi', url: '/kategorije/172' },
  { id: '173', name: 'Trajne kobasice', url: '/kategorije/173' },
  { id: '174', name: 'Šunke i mortadele', url: '/kategorije/174' },
  { id: '175', name: 'Viršle i kobasice', url: '/kategorije/175' },
  { id: '176', name: 'Bareni suhomesnati proizvodi', url: '/kategorije/176' },
  { id: '177', name: 'Parizeri i salame', url: '/kategorije/177' },
  { id: '178', name: 'Paštete', url: '/kategorije/178' },
  { id: '179', name: 'Mesni naresci', url: '/kategorije/179' },
  { id: '180', name: 'Gotova jela', url: '/kategorije/180' },
  { id: '181', name: 'Tuna', url: '/kategorije/181' },
  { id: '182', name: 'Tuna salata', url: '/kategorije/182' },
  { id: '183', name: 'Sardine', url: '/kategorije/183' },
  { id: '184', name: 'Riblje paštete i namazi', url: '/kategorije/184' },
  { id: '185', name: 'Skuša', url: '/kategorije/185' },
  { id: '186', name: 'Ostali riblji proizvodi', url: '/kategorije/186' },
  { id: '187', name: 'Inćun', url: '/kategorije/187' },
  // // Slatkiši i slaniši (Sweets and snacks)
  // { id: '52', name: 'Čokolade', url: '/kategorije/52' },
  // { id: '53', name: 'Barovi i impulsi', url: '/kategorije/53' },
  // { id: '54', name: 'Bomboni i karamele', url: '/kategorije/54' },
  // { id: '55', name: 'Biskviti i medenjaci', url: '/kategorije/55' },
  // { id: '56', name: 'Keks', url: '/kategorije/56' },
  // { id: '57', name: 'Vafel-napolitanke', url: '/kategorije/57' },
  // { id: '58', name: 'Integralni keks', url: '/kategorije/58' },
  // { id: '59', name: 'Bombonjere', url: '/kategorije/59' },
  // { id: '60', name: 'Kroasani', url: '/kategorije/60' },
  // { id: '61', name: 'Rolati i tortice', url: '/kategorije/61' },
  // { id: '62', name: 'Žvake', url: '/kategorije/62' },
  // { id: '63', name: 'Žele i lokum', url: '/kategorije/63' },
  // { id: '64', name: 'Čips', url: '/kategorije/64' },
  // { id: '65', name: 'Kokice', url: '/kategorije/65' },
  // { id: '66', name: 'Flips', url: '/kategorije/66' },
  // { id: '67', name: 'Apetisani', url: '/kategorije/67' },
  // { id: '68', name: 'Slaniši', url: '/kategorije/68' },
  // // Zdrava hrana (Healthy food)
  // { id: '69', name: 'Gluten free', url: '/kategorije/69' },
  // { id: '70', name: 'Biljni napitak', url: '/kategorije/70' },
  // { id: '71', name: 'Dijabet', url: '/kategorije/71' },
  // { id: '72', name: 'Organski proizvodi', url: '/kategorije/72' },
  // { id: '73', name: 'Diet', url: '/kategorije/73' },
  // { id: '74', name: 'Soja', url: '/kategorije/74' },
  // // Osnovne namirnice (Staple foods)
  // { id: '75', name: 'Tjestenina', url: '/kategorije/75' },
  // { id: '76', name: 'Maslinovo i druga ulja', url: '/kategorije/76' },
  // { id: '77', name: 'Pirinač', url: '/kategorije/77' },
  // { id: '78', name: 'Suncokretovo ulje', url: '/kategorije/78' },
  // { id: '79', name: 'Brašno', url: '/kategorije/79' },
  // { id: '80', name: 'Šećer i so', url: '/kategorije/80' },
  // { id: '81', name: 'Sirće', url: '/kategorije/81' },
  // // Pekara (Bakery)
  // { id: '82', name: 'Tost i dvopek hljeb', url: '/kategorije/82' },
  // { id: '83', name: 'Kore za pitu, pizzu i tortilje', url: '/kategorije/83' },
  // { id: '84', name: 'Gotove torte i kolači', url: '/kategorije/84' },
  // { id: '85', name: 'Kifle i peciva', url: '/kategorije/85' },
  // { id: '86', name: 'Hljeb', url: '/kategorije/86' },
  // { id: '87', name: 'Prezla', url: '/kategorije/87' },
  // // Priprema poslastica (Dessert preparation)
  // { id: '88', name: 'Sastojci', url: '/kategorije/88' },
  // { id: '89', name: 'Čokolada za kuvanje', url: '/kategorije/89' },
  // { id: '90', name: 'Šlag', url: '/kategorije/90' },
  // { id: '91', name: 'Puding', url: '/kategorije/91' },
  // { id: '92', name: 'Kore i oblande', url: '/kategorije/92' },
  // { id: '93', name: 'Piškote', url: '/kategorije/93' },
  // { id: '94', name: 'Šećer u prahu', url: '/kategorije/94' },
  // { id: '95', name: 'Prelivi za dezerte', url: '/kategorije/95' },
  // { id: '96', name: 'Smjese za kolače', url: '/kategorije/96' },
  // { id: '97', name: 'Sladoled priprema', url: '/kategorije/97' },
  // { id: '98', name: 'Kvasac', url: '/kategorije/98' },
  // // Supe i začini (Soups and spices)
  // { id: '99', name: 'Supe', url: '/kategorije/99' },
  // { id: '100', name: 'Mješavine začina', url: '/kategorije/100' },
  // { id: '101', name: 'Ostali začini', url: '/kategorije/101' },
  // { id: '102', name: 'Paprika', url: '/kategorije/102' },
  // { id: '103', name: 'Biber', url: '/kategorije/103' },
  // { id: '104', name: 'Krompir pire', url: '/kategorije/104' },
  // // Smrznuti proizvodi (Frozen products)
  // { id: '105', name: 'Sladoled i druge poslastice', url: '/kategorije/105' },
  // { id: '106', name: 'Smrznuto povrće', url: '/kategorije/106' },
  // { id: '107', name: 'Smrznuto voće', url: '/kategorije/107' },
  // { id: '108', name: 'Smrznuta tijesta', url: '/kategorije/108' },
  // // Baby svijet (Baby world)
  // { id: '109', name: 'Mljeveni keks i baby cerealije', url: '/kategorije/109' },
  // { id: '110', name: 'Kašice i sokići', url: '/kategorije/110' },
  // { id: '111', name: 'Pelene', url: '/kategorije/111' },
  // { id: '112', name: 'Vlažne maramice', url: '/kategorije/112' },
  // { id: '113', name: 'Baby kozmetika', url: '/kategorije/113' },
  // { id: '114', name: 'Za zubiće', url: '/kategorije/114' },
  // { id: '115', name: 'Mlijeko za bebe', url: '/kategorije/115' },
  // { id: '116', name: 'Voda i čajevi', url: '/kategorije/116' },
  // { id: '117', name: 'Preventiva - sunčanje i insekti', url: '/kategorije/117' },
  // // Higijena - Lična higijena (Personal hygiene)
  // { id: '188', name: 'Oralna higijena', url: '/kategorije/188' },
  // { id: '189', name: 'Sapuni', url: '/kategorije/189' },
  // { id: '190', name: 'Vlažne i paprine maramice', url: '/kategorije/190' },
  // { id: '191', name: 'Papirne salvete i ubrusi', url: '/kategorije/191' },
  // { id: '192', name: 'Toalet papir', url: '/kategorije/192' },
  // { id: '193', name: 'Štapići za uši', url: '/kategorije/193' },
  // { id: '194', name: 'Poklon setovi', url: '/kategorije/194' },
  // { id: '195', name: 'Pelene za odrasle', url: '/kategorije/195' },
  // // Higijena - Sve za nju (For her)
  // { id: '196', name: 'Šamponi i njega kose', url: '/kategorije/196' },
  // { id: '197', name: 'Farbanje kose', url: '/kategorije/197' },
  // { id: '198', name: 'Lak i pjena za kosu', url: '/kategorije/198' },
  // { id: '199', name: 'Kupke', url: '/kategorije/199' },
  // { id: '200', name: 'DEO žene', url: '/kategorije/200' },
  // { id: '201', name: 'Kreme, losioni, mlijeka za tijelo', url: '/kategorije/201' },
  // { id: '202', name: 'Njega lica', url: '/kategorije/202' },
  // { id: '203', name: 'Depil program', url: '/kategorije/203' },
  // { id: '204', name: 'Pedikir i manikir', url: '/kategorije/204' },
  // { id: '205', name: 'Vlažne maramice i intima', url: '/kategorije/205' },
  // { id: '206', name: 'Ulošci i vata', url: '/kategorije/206' },
  // // Higijena - Sve za njega (For him)
  // { id: '207', name: 'Kupke i šamponi', url: '/kategorije/207' },
  // { id: '241', name: 'DEO muškarci', url: '/kategorije/241' },
  // { id: '208', name: 'Gel za kosu', url: '/kategorije/208' },
  // { id: '209', name: 'Brijači', url: '/kategorije/209' },
  // { id: '210', name: 'Pjene i gelovi za brijanje', url: '/kategorije/210' },
  // { id: '211', name: 'Aftershave', url: '/kategorije/211' },
  // { id: '212', name: 'Prezervativi', url: '/kategorije/212' },
  // // Kućne potrebe - Kućna higijena (Home hygiene)
  // { id: '213', name: 'Pranje veša', url: '/kategorije/213' },
  // { id: '214', name: 'Pranje suđa', url: '/kategorije/214' },
  // { id: '215', name: 'Krpe i sunđeri', url: '/kategorije/215' },
  // { id: '216', name: 'Čišćenje kuhinje', url: '/kategorije/216' },
  // { id: '217', name: 'Čišćenje toaleta', url: '/kategorije/217' },
  // { id: '218', name: 'WC osvježivači', url: '/kategorije/218' },
  // { id: '219', name: 'Osvježivači prostora', url: '/kategorije/219' },
  // { id: '220', name: 'Čišćenje podova', url: '/kategorije/220' },
  // { id: '221', name: 'Džogeri, metle', url: '/kategorije/221' },
  // { id: '222', name: 'Čišćenje prozora', url: '/kategorije/222' },
  // { id: '223', name: 'Čišćenje ostalih površina', url: '/kategorije/223' },
  // { id: '224', name: 'Univerzalna sredstva', url: '/kategorije/224' },
  // // Kućne potrebe - Sve za domaćinstvo (Household)
  // { id: '225', name: 'Folije, kese i papir', url: '/kategorije/225' },
  // { id: '226', name: 'Kese za smeće', url: '/kategorije/226' },
  // { id: '227', name: 'Jednokratni pribor za jelo', url: '/kategorije/227' },
  // { id: '228', name: 'Baterije', url: '/kategorije/228' },
  // { id: '229', name: 'Sijalice', url: '/kategorije/229' },
  // { id: '230', name: 'Sredstva za potpalu vatre', url: '/kategorije/230' },
  // { id: '231', name: 'Plin', url: '/kategorije/231' },
  // { id: '232', name: 'Sredstva za obuću', url: '/kategorije/232' },
  // { id: '233', name: 'Ostalo kućne potrebe', url: '/kategorije/233' },
  // { id: '234', name: 'Svijeće', url: '/kategorije/234' },
  // { id: '235', name: 'Vreće za čuvanje robe', url: '/kategorije/235' },
  // // Hrana za ljubimce (Pet food)
  // { id: '123', name: 'Kuce', url: '/kategorije/123' },
  // { id: '124', name: 'Mace', url: '/kategorije/124' },
  // // Ostalo (Other)
  // { id: '125', name: 'Sezona', url: '/kategorije/125' },
  // { id: '238', name: 'Cigarete i elektronske cigarete', url: '/kategorije/238' },
  // { id: '239', name: 'Cigarilosi i tompusi', url: '/kategorije/239' },
  // { id: '240', name: 'Upaljači, pribor i papir za duvan', url: '/kategorije/240' },
  // { id: '244', name: 'Dnevna štampa', url: '/kategorije/244' },
  // { id: '236', name: 'Insekticidi', url: '/kategorije/236' },
  // { id: '249', name: 'Program za kuću', url: '/kategorije/249' },
  // { id: '250', name: 'Program za djecu', url: '/kategorije/250' },
  // { id: '251', name: 'Party program', url: '/kategorije/251' },
  // { id: '252', name: 'Tehnika i električni uređaji', url: '/kategorije/252' },
  // { id: '237', name: 'Školski pribor', url: '/kategorije/237' },
  // { id: '246', name: 'Kese, čestitke, ukrasni papir', url: '/kategorije/246' },
  // { id: '245', name: 'KK Budućnost Voli', url: '/kategorije/245' },
  // { id: '253', name: 'Ostalo', url: '/kategorije/253' },
];

export const voliConfig: Partial<ScraperConfig> = {
  name: 'Voli',
  baseUrl: 'https://voli.me',
  categories: voliCategories,
  selectors: {
    productCard: 'a[href*="/proizvod/"]',
    productName: 'img',  // Use alt attribute for name
    productPrice: '.price',
    productImage: 'img',
    productUrl: 'a[href*="/proizvod/"]',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 2000,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export const mercadonaCategories: CategoryConfig[] = [
  // Aceite, especias y salsas (Oil, spices and sauces)
  { id: '112', name: 'Aceite, vinagre y sal', url: '/categories/112/' },
  { id: '115', name: 'Especias', url: '/categories/115/' },
  { id: '116', name: 'Mayonesa, ketchup y mostaza', url: '/categories/116/' },
  { id: '117', name: 'Otras salsas', url: '/categories/117/' },
  // Agua y refrescos (Water and soft drinks)
  { id: '156', name: 'Agua', url: '/categories/156/' },
  { id: '163', name: 'Isotónico y energético', url: '/categories/163/' },
  { id: '158', name: 'Refresco de cola', url: '/categories/158/' },
  { id: '159', name: 'Refresco de naranja y de limón', url: '/categories/159/' },
  { id: '161', name: 'Tónica y bitter', url: '/categories/161/' },
  { id: '162', name: 'Refresco de té y sin gas', url: '/categories/162/' },
  // Aperitivos (Snacks)
  { id: '135', name: 'Aceitunas y encurtidos', url: '/categories/135/' },
  { id: '133', name: 'Frutos secos y fruta desecada', url: '/categories/133/' },
  { id: '132', name: 'Patatas fritas y snacks', url: '/categories/132/' },
  // Arroz, legumbres y pasta (Rice, legumes and pasta)
  { id: '118', name: 'Arroz', url: '/categories/118/' },
  { id: '121', name: 'Legumbres', url: '/categories/121/' },
  { id: '120', name: 'Pasta y fideos', url: '/categories/120/' },
  // Azúcar, caramelos y chocolate (Sugar, candy and chocolate)
  { id: '89', name: 'Azúcar y edulcorante', url: '/categories/89/' },
  { id: '95', name: 'Chicles y caramelos', url: '/categories/95/' },
  { id: '92', name: 'Chocolate', url: '/categories/92/' },
  { id: '97', name: 'Golosinas', url: '/categories/97/' },
  { id: '90', name: 'Mermelada y miel', url: '/categories/90/' },
  { id: '833', name: 'Turrones', url: '/categories/833/' },
  // Bebé (Baby)
  { id: '216', name: 'Alimentación infantil', url: '/categories/216/' },
  { id: '219', name: 'Biberón y chupete', url: '/categories/219/' },
  { id: '218', name: 'Higiene y cuidado', url: '/categories/218/' },
  { id: '217', name: 'Toallitas y pañales', url: '/categories/217/' },
  // Bodega (Wine cellar)
  { id: '164', name: 'Cerveza', url: '/categories/164/' },
  { id: '166', name: 'Cerveza sin alcohol', url: '/categories/166/' },
  { id: '181', name: 'Licores', url: '/categories/181/' },
  { id: '174', name: 'Sidra y cava', url: '/categories/174/' },
  { id: '168', name: 'Tinto de verano y sangría', url: '/categories/168/' },
  { id: '170', name: 'Vino blanco', url: '/categories/170/' },
  { id: '173', name: 'Vino lambrusco y espumoso', url: '/categories/173/' },
  { id: '171', name: 'Vino rosado', url: '/categories/171/' },
  { id: '169', name: 'Vino tinto', url: '/categories/169/' },
  // Cacao, café e infusiones (Coffee and tea)
  { id: '86', name: 'Cacao soluble y chocolate a la taza', url: '/categories/86/' },
  { id: '81', name: 'Café cápsula y monodosis', url: '/categories/81/' },
  { id: '83', name: 'Café molido y en grano', url: '/categories/83/' },
  { id: '84', name: 'Café soluble y otras bebidas', url: '/categories/84/' },
  { id: '88', name: 'Té e infusiones', url: '/categories/88/' },
  // Carne (Meat)
  { id: '46', name: 'Arreglos', url: '/categories/46/' },
  { id: '38', name: 'Aves y pollo', url: '/categories/38/' },
  { id: '47', name: 'Carne congelada', url: '/categories/47/' },
  { id: '37', name: 'Cerdo', url: '/categories/37/' },
  { id: '42', name: 'Conejo y cordero', url: '/categories/42/' },
  { id: '43', name: 'Embutido', url: '/categories/43/' },
  { id: '44', name: 'Hamburguesas y picadas', url: '/categories/44/' },
  { id: '40', name: 'Vacuno', url: '/categories/40/' },
  { id: '45', name: 'Empanados y elaborados', url: '/categories/45/' },
  // Cereales y galletas (Cereals and cookies)
  { id: '78', name: 'Cereales', url: '/categories/78/' },
  { id: '80', name: 'Galletas', url: '/categories/80/' },
  { id: '79', name: 'Tortitas', url: '/categories/79/' },
  // Charcutería y quesos (Deli and cheese)
  { id: '48', name: 'Aves y jamón cocido', url: '/categories/48/' },
  { id: '52', name: 'Bacón y salchichas', url: '/categories/52/' },
  { id: '49', name: 'Chopped y mortadela', url: '/categories/49/' },
  { id: '51', name: 'Embutido curado', url: '/categories/51/' },
  { id: '50', name: 'Jamón serrano', url: '/categories/50/' },
  { id: '58', name: 'Paté y sobrasada', url: '/categories/58/' },
  { id: '54', name: 'Queso curado, semicurado y tierno', url: '/categories/54/' },
  { id: '56', name: 'Queso lonchas, rallado y en porciones', url: '/categories/56/' },
  { id: '53', name: 'Queso untable, fresco y especialidades', url: '/categories/53/' },
  // Congelados (Frozen)
  { id: '147', name: 'Arroz y pasta', url: '/categories/147/' },
  { id: '148', name: 'Carne', url: '/categories/148/' },
  { id: '154', name: 'Helados', url: '/categories/154/' },
  { id: '155', name: 'Hielo', url: '/categories/155/' },
  { id: '150', name: 'Marisco', url: '/categories/150/' },
  { id: '149', name: 'Pescado', url: '/categories/149/' },
  { id: '151', name: 'Pizzas', url: '/categories/151/' },
  { id: '884', name: 'Rebozados', url: '/categories/884/' },
  { id: '152', name: 'Tartas y churros', url: '/categories/152/' },
  { id: '145', name: 'Verdura', url: '/categories/145/' },
  // Conservas, caldos y cremas (Canned goods, broths and soups)
  { id: '122', name: 'Atún y otras conservas de pescado', url: '/categories/122/' },
  { id: '123', name: 'Berberechos y mejillones', url: '/categories/123/' },
  { id: '127', name: 'Conservas de verdura y frutas', url: '/categories/127/' },
  { id: '130', name: 'Gazpacho y cremas', url: '/categories/130/' },
  { id: '129', name: 'Sopa y caldo', url: '/categories/129/' },
  { id: '126', name: 'Tomate', url: '/categories/126/' },
  // Cuidado del cabello (Hair care)
  { id: '201', name: 'Acondicionador y mascarilla', url: '/categories/201/' },
  { id: '199', name: 'Champú', url: '/categories/199/' },
  { id: '203', name: 'Coloración cabello', url: '/categories/203/' },
  { id: '202', name: 'Fijación cabello', url: '/categories/202/' },
  // Cuidado facial y corporal (Facial and body care)
  { id: '192', name: 'Afeitado y cuidado para hombre', url: '/categories/192/' },
  { id: '189', name: 'Cuidado corporal', url: '/categories/189/' },
  { id: '185', name: 'Cuidado e higiene facial', url: '/categories/185/' },
  { id: '191', name: 'Depilación', url: '/categories/191/' },
  { id: '188', name: 'Desodorante', url: '/categories/188/' },
  { id: '187', name: 'Gel y jabón de manos', url: '/categories/187/' },
  { id: '186', name: 'Higiene bucal', url: '/categories/186/' },
  { id: '190', name: 'Higiene íntima', url: '/categories/190/' },
  { id: '194', name: 'Manicura y pedicura', url: '/categories/194/' },
  { id: '196', name: 'Perfume y colonia', url: '/categories/196/' },
  { id: '198', name: 'Protector solar y aftersun', url: '/categories/198/' },
  // Fitoterapia y parafarmacia (Herbal and parapharmacy)
  { id: '213', name: 'Fitoterapia', url: '/categories/213/' },
  { id: '214', name: 'Parafarmacia', url: '/categories/214/' },
  // Fruta y verdura (Fruits and vegetables)
  { id: '27', name: 'Fruta', url: '/categories/27/' },
  { id: '28', name: 'Lechuga y ensalada preparada', url: '/categories/28/' },
  { id: '29', name: 'Verdura', url: '/categories/29/' },
  // Huevos, leche y mantequilla (Eggs, milk and butter)
  { id: '77', name: 'Huevos', url: '/categories/77/' },
  { id: '72', name: 'Leche y bebidas vegetales', url: '/categories/72/' },
  { id: '75', name: 'Mantequilla y margarina', url: '/categories/75/' },
  // Limpieza y hogar (Cleaning and home)
  { id: '226', name: 'Detergente y suavizante ropa', url: '/categories/226/' },
  { id: '237', name: 'Estropajo, bayeta y guantes', url: '/categories/237/' },
  { id: '241', name: 'Insecticida y ambientador', url: '/categories/241/' },
  { id: '234', name: 'Lejía y líquidos fuertes', url: '/categories/234/' },
  { id: '235', name: 'Limpiacristales', url: '/categories/235/' },
  { id: '233', name: 'Limpiahogar y friegasuelos', url: '/categories/233/' },
  { id: '231', name: 'Limpieza baño y WC', url: '/categories/231/' },
  { id: '230', name: 'Limpieza cocina', url: '/categories/230/' },
  { id: '232', name: 'Limpieza muebles y multiusos', url: '/categories/232/' },
  { id: '229', name: 'Limpieza vajilla', url: '/categories/229/' },
  { id: '243', name: 'Menaje y conservación de alimentos', url: '/categories/243/' },
  { id: '238', name: 'Papel higiénico y celulosa', url: '/categories/238/' },
  { id: '239', name: 'Pilas y bolsas de basura', url: '/categories/239/' },
  { id: '244', name: 'Utensilios de limpieza y calzado', url: '/categories/244/' },
  // Maquillaje (Makeup)
  { id: '206', name: 'Bases de maquillaje y corrector', url: '/categories/206/' },
  { id: '207', name: 'Colorete y polvos', url: '/categories/207/' },
  { id: '208', name: 'Labios', url: '/categories/208/' },
  { id: '210', name: 'Ojos', url: '/categories/210/' },
  { id: '212', name: 'Pinceles y brochas', url: '/categories/212/' },
  // Marisco y pescado (Seafood and fish)
  { id: '32', name: 'Marisco', url: '/categories/32/' },
  { id: '34', name: 'Pescado congelado', url: '/categories/34/' },
  { id: '31', name: 'Pescado fresco', url: '/categories/31/' },
  { id: '36', name: 'Salazones y ahumados', url: '/categories/36/' },
  // Mascotas (Pets)
  { id: '222', name: 'Gato', url: '/categories/222/' },
  { id: '221', name: 'Perro', url: '/categories/221/' },
  { id: '225', name: 'Otros', url: '/categories/225/' },
  // Panadería y pastelería (Bakery and pastry)
  { id: '65', name: 'Bollería de horno', url: '/categories/65/' },
  { id: '66', name: 'Bollería envasada', url: '/categories/66/' },
  { id: '69', name: 'Harina y preparado repostería', url: '/categories/69/' },
  { id: '59', name: 'Pan de horno', url: '/categories/59/' },
  { id: '60', name: 'Pan de molde y otras especialidades', url: '/categories/60/' },
  { id: '62', name: 'Pan tostado y rallado', url: '/categories/62/' },
  { id: '64', name: 'Picos, rosquilletas y picatostes', url: '/categories/64/' },
  { id: '68', name: 'Tartas y pasteles', url: '/categories/68/' },
  { id: '71', name: 'Velas y decoración', url: '/categories/71/' },
  // Pizzas y platos preparados (Pizzas and prepared dishes)
  { id: '897', name: 'Listo para Comer', url: '/categories/897/' },
  { id: '138', name: 'Pizzas', url: '/categories/138/' },
  { id: '140', name: 'Platos preparados calientes', url: '/categories/140/' },
  { id: '142', name: 'Platos preparados fríos', url: '/categories/142/' },
  // Postres y yogures (Desserts and yogurt)
  { id: '105', name: 'Bífidus', url: '/categories/105/' },
  { id: '110', name: 'Flan y natillas', url: '/categories/110/' },
  { id: '111', name: 'Gelatina y otros postres', url: '/categories/111/' },
  { id: '106', name: 'Postres de soja', url: '/categories/106/' },
  { id: '103', name: 'Yogures desnatados', url: '/categories/103/' },
  { id: '109', name: 'Yogures griegos', url: '/categories/109/' },
  { id: '108', name: 'Yogures líquidos', url: '/categories/108/' },
  { id: '104', name: 'Yogures naturales y sabores', url: '/categories/104/' },
  { id: '107', name: 'Yogures y postres infantiles', url: '/categories/107/' },
  // Zumos (Juices)
  { id: '99', name: 'Fruta variada', url: '/categories/99/' },
  { id: '100', name: 'Melocotón y piña', url: '/categories/100/' },
  { id: '143', name: 'Naranja', url: '/categories/143/' },
  { id: '98', name: 'Tomate y otros sabores', url: '/categories/98/' },
];

export const mercadonaConfig: Partial<ScraperConfig> = {
  name: 'Mercadona',
  baseUrl: 'https://tienda.mercadona.es',
  categories: mercadonaCategories,
  selectors: {
    // Not used for API-based scraping, kept for compatibility
    productCard: '.product-cell',
    productName: '.product-title',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 3000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 1,
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export const korzinkaCategories: CategoryConfig[] = [
  { id: 'fruits-vegetables', name: 'Fruits & Vegetables', url: '/mevalar-va-sabzavotlar' },
  { id: 'meat-fish', name: 'Meat & Fish', url: '/go-sht-va-baliq' },
  { id: 'dairy', name: 'Dairy Products', url: '/sut-mahsulotlari' },
];

export const korzinkaConfig: Partial<ScraperConfig> = {
  name: 'Korzinka',
  baseUrl: 'https://korzinka.uz',
  categories: korzinkaCategories,
  selectors: {
    productCard: '.product-card',
    productName: '.product-name',
    productPrice: '.product-price',
    productImage: '.product-image img',
    productUrl: 'a',
  },
  waitTimes: {
    pageLoad: 5000,
    dynamicContent: 2000,
    betweenRequests: 1500,
  },
  maxRetries: 3,
  concurrentPages: 2,
};

/**
 * Get default configuration for a scraper by name
 */
export function getScraperConfig(name: string): Partial<ScraperConfig> | undefined {
  const configs: Record<string, Partial<ScraperConfig>> = {
    MigrosScraper: migrosConfig,
    A101Scraper: a101Config,
    VoliScraper: voliConfig,
    MercadonaScraper: mercadonaConfig,
    KorzinkaScraper: korzinkaConfig,
  };

  return configs[name];
}

/**
 * Get available categories for a scraper
 */
export function getScraperCategories(name: string): CategoryConfig[] {
  const categories: Record<string, CategoryConfig[]> = {
    MigrosScraper: migrosCategories,
    A101Scraper: a101Categories,
    VoliScraper: voliCategories,
    MercadonaScraper: mercadonaCategories,
    KorzinkaScraper: korzinkaCategories,
  };

  return categories[name] || [];
}
