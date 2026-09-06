import { interpretProductQuantity } from '../productQuantity';

describe('interpretProductQuantity', () => {
  test('uses a 5 L bottle title as contents when the raw selling unit is one piece', () => {
    expect(
      interpretProductQuantity({
        name: 'Spring water bottle 5 L',
        description: 'Still mineral water',
        unit: 'piece',
        unitQuantity: 1,
        price: 4.5,
      }),
    ).toEqual({
      version: 1,
      status: 'verified',
      contentQuantity: 5,
      contentUnit: 'l',
      priceBasis: 'package',
      comparablePrice: 0.9,
      evidence: ['name: 5 L', 'raw unit: 1 piece (selling unit)'],
    });
  });

  test('normalizes a 5 kg bag sold as one piece', () => {
    expect(
      interpretProductQuantity({
        name: 'Premium rice 5kg bag',
        unit: 'piece',
        unitQuantity: 1,
        price: 12.5,
      }),
    ).toMatchObject({
      status: 'verified',
      contentQuantity: 5,
      contentUnit: 'kg',
      priceBasis: 'package',
      comparablePrice: 2.5,
    });
  });

  test.each([
    ['Water 6 x 1.5L', 18, 9, 'l', 2],
    ['Tomato cans 2x500g', 6, 1, 'kg', 6],
  ])('totals multipack contents for %s', (name, price, quantity, unit, comparablePrice) => {
    expect(interpretProductQuantity({ name, price })).toMatchObject({
      status: 'verified',
      contentQuantity: quantity,
      contentUnit: unit,
      comparablePrice,
    });
  });

  test('treats raw piece count as pack metadata when dimensional contents are explicit', () => {
    expect(
      interpretProductQuantity({
        name: 'Water 6 x 1.5 L',
        unit: 'pieces',
        unitQuantity: 6,
        price: 18,
      }),
    ).toMatchObject({
      status: 'verified',
      contentQuantity: 9,
      contentUnit: 'l',
      comparablePrice: 2,
    });
  });

  test('keeps an explicit loose per-kg price as already normalized', () => {
    expect(
      interpretProductQuantity({
        name: 'Loose Gala apples',
        unit: 'kg',
        price: 3.2,
        priceBasis: 'kg',
      }),
    ).toEqual({
      version: 1,
      status: 'verified',
      contentQuantity: 1,
      contentUnit: 'kg',
      priceBasis: 'kg',
      comparablePrice: 3.2,
      evidence: ['price basis: kg', 'raw unit: kg'],
    });
  });

  test('does not divide an explicit per-kg quote by the package weight', () => {
    expect(
      interpretProductQuantity({
        name: 'Potatoes bag 5 kg',
        price: 2.4,
        priceBasis: 'kg',
      }),
    ).toMatchObject({
      status: 'verified',
      contentQuantity: 5,
      contentUnit: 'kg',
      priceBasis: 'kg',
      comparablePrice: 2.4,
    });
  });

  test('normalizes a counted egg package by piece', () => {
    const result = interpretProductQuantity({
      name: 'Free range eggs 12 pieces',
      price: 4.8,
    });

    expect(result).toMatchObject({
      status: 'verified',
      contentQuantity: 12,
      contentUnit: 'pieces',
      priceBasis: 'package',
    });
    expect(result.comparablePrice).toBeCloseTo(0.4);
  });

  test.each(['Eggs 12 pieces', 'Cotton pads 12 pieces'])(
    'uses the explicit count in %s when the raw unit describes one package',
    (name) => {
      const result = interpretProductQuantity({ name, unit: 'piece', unitQuantity: 1, price: 6 });
      expect(result).toMatchObject({
        status: 'verified', contentQuantity: 12, contentUnit: 'pieces', comparablePrice: 0.5,
      });
      expect(result.evidence).toContain('raw unit: 1 piece (selling unit)');
    },
  );

  test('still rejects conflicting explicit and raw package counts larger than one', () => {
    expect(interpretProductQuantity({
      name: 'Eggs 12 pieces', unit: 'pieces', unitQuantity: 6, price: 6,
    })).toMatchObject({ status: 'conflict', comparablePrice: null });
  });

  test.each([
    ['dimensional quantity', `${'9'.repeat(400)} L`],
    ['piece count', `${'9'.repeat(400)} pieces`],
    ['multipack count', `${'9'.repeat(400)} x 1 L`],
    ['multipack unit quantity', `2 x ${'9'.repeat(400)} L`],
    ['multipack total', `${'1' + '0'.repeat(200)} x ${'1' + '0'.repeat(200)} L`],
  ])('rejects a nonfinite %s', (_label, quantity) => {
    expect(interpretProductQuantity({ name: `Water ${quantity}`, price: 6 })).toMatchObject({
      status: 'unknown', contentQuantity: null, contentUnit: null, comparablePrice: null,
    });
  });

  test.each([
    ['zero pack count', 'Water 0 x 1.5 L'],
    ['zero pack size', 'Water 2 x 0 L'],
  ])('does not verify raw metadata when the multipack has a %s', (_label, name) => {
    expect(interpretProductQuantity({ name, unit: 'l', unitQuantity: 1.5, price: 6 })).toMatchObject({
      status: 'unknown', comparablePrice: null,
    });
  });

  test('does not verify raw metadata when the explicit text quantity overflows', () => {
    expect(interpretProductQuantity({
      name: `Water ${'9'.repeat(400)} L`, unit: 'l', unitQuantity: 1, price: 6,
    })).toMatchObject({ status: 'unknown', contentQuantity: 1, comparablePrice: null });
  });

  test('does not guess the weight of an item sold as one piece', () => {
    expect(
      interpretProductQuantity({
        name: 'Fresh avocado',
        unit: 'piece',
        unitQuantity: 1,
        price: 1.5,
      }),
    ).toMatchObject({
      status: 'unknown',
      contentQuantity: null,
      contentUnit: null,
      priceBasis: 'package',
      comparablePrice: null,
    });
  });

  test('reports a conflict when raw weight and title weight disagree', () => {
    const result = interpretProductQuantity({
      name: 'Flour 1 kg',
      unit: 'g',
      unitQuantity: 500,
      price: 2,
    });

    expect(result).toMatchObject({
      status: 'conflict',
      contentQuantity: null,
      contentUnit: null,
      comparablePrice: null,
    });
    expect(result.evidence).toEqual(expect.arrayContaining(['name: 1 kg', 'raw unit: 500 g']));
  });

  test('reports a dimensional conflict between a volume title and raw weight', () => {
    expect(
      interpretProductQuantity({
        name: 'Water 5 L',
        unit: 'kg',
        unitQuantity: 5,
        price: 5,
      }),
    ).toMatchObject({ status: 'conflict', contentQuantity: null, comparablePrice: null });
  });

  test('does not let source preference hide an ambiguous package-weight mismatch', () => {
    expect(
      interpretProductQuantity({
        name: 'Apples 5kg bag',
        unit: 'kg',
        unitQuantity: 1,
        price: 4,
      }),
    ).toMatchObject({ status: 'conflict', contentQuantity: null, comparablePrice: null });
  });

  test('accepts a package quantity alongside an explicit per-kg quote without dividing twice', () => {
    expect(
      interpretProductQuantity({
        name: '1 bag 5 kg potatoes',
        price: 2.25,
        priceBasis: 'kg',
      }),
    ).toMatchObject({
      status: 'verified',
      contentQuantity: 5,
      contentUnit: 'kg',
      comparablePrice: 2.25,
    });
  });

  test('reports a conflict when title and description package quantities disagree', () => {
    expect(
      interpretProductQuantity({
        name: 'Olive oil 1 L',
        description: 'Bottle size 750 ml',
        price: 8,
      }),
    ).toMatchObject({ status: 'conflict', comparablePrice: null });
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid price %s without producing a comparable price',
    (price) => {
      expect(interpretProductQuantity({ name: 'Milk 1 L', price })).toMatchObject({
        status: 'unknown',
        contentQuantity: 1,
        contentUnit: 'l',
        comparablePrice: null,
      });
    },
  );

  test('ignores nutrition serving quantities in descriptions', () => {
    expect(
      interpretProductQuantity({
        name: 'Crunchy breakfast cereal',
        description: 'Energy per 100g: 380 kcal',
        unit: 'piece',
        unitQuantity: 1,
        price: 4,
      }),
    ).toMatchObject({
      status: 'unknown',
      contentQuantity: null,
      contentUnit: null,
      comparablePrice: null,
    });
  });

  test('ignores bilingual nutrition reference quantities in descriptions', () => {
    expect(
      interpretProductQuantity({
        name: 'Breakfast cereal',
        description: 'Nährwerte je 100 g. Пищевая ценность на 100 г.',
        unit: 'piece',
        unitQuantity: 1,
        price: 4,
      }),
    ).toMatchObject({ status: 'unknown', contentQuantity: null, comparablePrice: null });
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, -2, 0])(
    'rejects invalid raw quantity %s',
    (unitQuantity) => {
      expect(
        interpretProductQuantity({ name: 'Mystery bulk item', unit: 'kg', unitQuantity, price: 3 }),
      ).toMatchObject({ status: 'unknown', contentQuantity: null, comparablePrice: null });
    },
  );

  test('does not verify textual contents when a supplied raw quantity is invalid', () => {
    expect(
      interpretProductQuantity({
        name: 'Water 5 L',
        unit: 'l',
        unitQuantity: Number.POSITIVE_INFINITY,
        price: 5,
      }),
    ).toMatchObject({
      status: 'unknown',
      contentQuantity: 5,
      contentUnit: 'l',
      comparablePrice: null,
    });
  });

  test('parses direct fractional milliliter quantities', () => {
    expect(interpretProductQuantity({ name: 'Vanilla extract 12.5 ml', price: 5 })).toMatchObject({
      status: 'verified',
      contentQuantity: 0.0125,
      contentUnit: 'l',
      comparablePrice: 400,
    });
  });

  test('parses a leading-decimal package quantity without shifting it by ten', () => {
    expect(interpretProductQuantity({ name: 'Milk .5 L', price: 2 })).toMatchObject({
      status: 'verified',
      contentQuantity: 0.5,
      contentUnit: 'l',
      comparablePrice: 4,
    });
  });

  test('abstains from ambiguous three-digit separator quantities', () => {
    expect(interpretProductQuantity({ name: 'Water 1.000 ml', price: 2 })).toMatchObject({
      status: 'unknown',
      contentQuantity: null,
      contentUnit: null,
      comparablePrice: null,
    });
  });

  test('does not let raw metadata override an ambiguous textual quantity', () => {
    expect(
      interpretProductQuantity({
        name: 'Water 1.000 ml',
        unit: 'ml',
        unitQuantity: 1000,
        price: 2,
      }),
    ).toMatchObject({ status: 'unknown', comparablePrice: null });
  });

  test('detects conflicting quantities within the title', () => {
    expect(interpretProductQuantity({ name: 'Flour 1 kg / 500 g', price: 2 })).toMatchObject({
      status: 'conflict',
      contentQuantity: null,
      comparablePrice: null,
    });
  });

  test('abstains when a free additive introduces a second package quantity', () => {
    expect(interpretProductQuantity({ name: 'Oil 1L + 250ml free', price: 5 })).toMatchObject({
      status: 'conflict',
      contentQuantity: null,
      comparablePrice: null,
    });
  });

  test('accepts equivalent quantities repeated in different units', () => {
    expect(interpretProductQuantity({ name: 'Oil 1 L / 1000 ml', price: 5 })).toMatchObject({
      status: 'verified',
      contentQuantity: 1,
      contentUnit: 'l',
      comparablePrice: 5,
    });
  });

  test('does not match unit prefixes inside ordinary words', () => {
    expect(interpretProductQuantity({ name: 'Apple 5 lime pack', price: 3 })).toMatchObject({
      status: 'unknown',
      contentQuantity: null,
      comparablePrice: null,
    });
  });

  test('does not treat an unexplained raw piece count as comparable contents', () => {
    expect(
      interpretProductQuantity({
        name: 'Assorted produce pack',
        unit: 'pieces',
        unitQuantity: 6,
        price: 5,
      }),
    ).toMatchObject({ status: 'unknown', contentQuantity: null, comparablePrice: null });
  });

  test('uses raw piece count when the product itself supplies count-category evidence', () => {
    expect(
      interpretProductQuantity({ name: 'Free range eggs', unit: 'pieces', unitQuantity: 12, price: 4.8 }),
    ).toMatchObject({
      status: 'verified',
      contentQuantity: 12,
      contentUnit: 'pieces',
      priceBasis: 'package',
    });
  });

  test.each([
    ['Мука 500 г', 4, 0.5, 'kg', 8],
    ['Молоко 750 мл', 3, 0.75, 'l', 4],
    ['Вода 6 x 1,5 л', 18, 9, 'l', 2],
    ['Yumurta 10 adet', 5, 10, 'pieces', 0.5],
    ['Яйца 10 шт', 5, 10, 'pieces', 0.5],
  ])(
    'normalizes target-market quantity vocabulary in %s',
    (name, price, contentQuantity, contentUnit, comparablePrice) => {
      expect(interpretProductQuantity({ name, price })).toMatchObject({
        status: 'verified',
        contentQuantity,
        contentUnit,
        comparablePrice,
      });
    },
  );

  test('recognizes a Cyrillic loose kilogram raw unit', () => {
    expect(interpretProductQuantity({ name: 'Яблоки', unit: 'кг', price: 3 })).toMatchObject({
      status: 'verified',
      contentQuantity: 1,
      contentUnit: 'kg',
      priceBasis: 'kg',
      comparablePrice: 3,
    });
  });
});
