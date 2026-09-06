export interface QuantityInput {
  name: string;
  description?: string | null;
  unit?: string | null;
  unitQuantity?: number | null;
  price: number;
  priceBasis?: 'package' | 'kg' | 'l' | 'piece' | 'unknown';
}

export interface QuantityInterpretation {
  version: 1;
  status: 'verified' | 'unknown' | 'conflict';
  contentQuantity: number | null;
  contentUnit: 'kg' | 'l' | 'pieces' | null;
  priceBasis: 'package' | 'kg' | 'l' | 'piece' | 'unknown';
  comparablePrice: number | null;
  evidence: string[];
}

type ContentUnit = NonNullable<QuantityInterpretation['contentUnit']>;

interface Candidate {
  quantity: number;
  unit: ContentUnit;
  evidence: string;
}

const UNIT_PATTERN =
  '(kg|kilograms?|kilos?|g|gr|grams?|l|liters?|litres?|ml|milliliters?|millilitres?|кг|мл|г|л)';
const NUMBER_PATTERN = '(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';

interface TextCandidates {
  candidates: Candidate[];
  evidence: string[];
  ambiguous: boolean;
  invalid: boolean;
}

function normalizedUnit(unit: string): { unit: ContentUnit; factor: number } | null {
  const value = unit.toLowerCase().replace(/\.$/, '');
  if (value === 'kg' || value.startsWith('kilo')) return { unit: 'kg', factor: 1 };
  if (value === 'кг') return { unit: 'kg', factor: 1 };
  if (value === 'g' || value === 'gr' || value === 'г' || value.startsWith('gram')) {
    return { unit: 'kg', factor: 0.001 };
  }
  if (value === 'l' || value === 'л' || value.startsWith('liter') || value.startsWith('litre')) {
    return { unit: 'l', factor: 1 };
  }
  if (
    value === 'ml' ||
    value === 'мл' ||
    value.startsWith('milliliter') ||
    value.startsWith('millilitre')
  ) {
    return { unit: 'l', factor: 0.001 };
  }
  if (/^(piece|pieces|pc|pcs|count|ct|egg|eggs|adet|шт)$/.test(value)) {
    return { unit: 'pieces', factor: 1 };
  }
  return null;
}

function textCandidates(
  text: string | null | undefined,
  source: 'name' | 'description',
): TextCandidates {
  if (!text) return { candidates: [], evidence: [], ambiguous: false, invalid: false };

  const candidates: Candidate[] = [];
  const evidence: string[] = [];
  let ambiguous = false;
  let invalid = false;
  const multipackRanges: Array<[number, number]> = [];
  const multipackRe = new RegExp(
    `(?<![\\d.,])(\\d+)\\s*[x×]\\s*(${NUMBER_PATTERN})\\s*${UNIT_PATTERN}(?!\\p{L})`,
    'giu',
  );
  for (const match of text.matchAll(multipackRe)) {
    const count = Number(match[1]);
    const eachToken = match[2];
    const each = Number(eachToken.replace(',', '.'));
    const normalized = normalizedUnit(match[3]);
    const quantity = normalized ? count * each * normalized.factor : null;
    const start = match.index!;
    multipackRanges.push([start, start + match[0].length]);
    // A non-positive pack total is malformed, and it must not silently drop the quantity:
    // this range is excluded from the plain scan below, so raw metadata would win unchallenged.
    if (
      !Number.isFinite(count) ||
      !Number.isFinite(each) ||
      quantity === null ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      invalid = true;
      evidence.push(`${source}: invalid quantity ${match[0]}`);
    } else if (isAmbiguousSeparatedNumber(eachToken)) {
      ambiguous = true;
      evidence.push(`${source}: ambiguous quantity ${match[0]}`);
    } else if (normalized) {
      const candidate = {
        quantity,
        unit: normalized.unit,
        evidence: `${source}: ${match[0]}`,
      };
      candidates.push(candidate);
      evidence.push(candidate.evidence);
    }
  }

  const quantityRe = new RegExp(
    `(?<![\\d.,])(${NUMBER_PATTERN})\\s*${UNIT_PATTERN}(?!\\p{L})`,
    'giu',
  );
  for (const match of text.matchAll(quantityRe)) {
    const start = match.index!;
    if (multipackRanges.some(([from, to]) => start >= from && start < to)) continue;
    const token = match[1];
    const value = Number(token.replace(',', '.'));
    if (!Number.isFinite(value)) {
      invalid = true;
      evidence.push(`${source}: invalid quantity ${match[0]}`);
      continue;
    }
    if (isNutritionReference(text, start, value, source)) continue;
    if (isAmbiguousSeparatedNumber(token)) {
      ambiguous = true;
      evidence.push(`${source}: ambiguous quantity ${match[0]}`);
      continue;
    }
    const normalized = normalizedUnit(match[2]);
    if (normalized && value > 0) {
      const candidate = {
        quantity: value * normalized.factor,
        unit: normalized.unit,
        evidence: `${source}: ${match[0]}`,
      };
      candidates.push(candidate);
      evidence.push(candidate.evidence);
    }
  }

  const piecesRe = /(\d+)\s*(?:pcs?|pieces?|count|ct|eggs?|adet|шт)(?!\p{L})/giu;
  for (const match of text.matchAll(piecesRe)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
      invalid = true;
      evidence.push(`${source}: invalid quantity ${match[0]}`);
      continue;
    }
    if (value > 0) {
      const candidate = { quantity: value, unit: 'pieces' as const, evidence: `${source}: ${match[0]}` };
      candidates.push(candidate);
      evidence.push(candidate.evidence);
    }
  }
  return { candidates, evidence, ambiguous, invalid };
}

function isAmbiguousSeparatedNumber(token: string): boolean {
  const match = token.match(/^(\d+)[.,](\d{3})$/);
  return Boolean(match && Number(match[1]) !== 0);
}

function isNutritionReference(
  text: string,
  quantityIndex: number,
  value: number,
  source: 'name' | 'description',
): boolean {
  if (source !== 'description') return false;
  const prefix = text.slice(Math.max(0, quantityIndex - 48), quantityIndex).toLowerCase();
  return (
    /(?:per|pro|je|за|на|\/)\s*$/u.test(prefix) ||
    (Math.abs(value - 100) < 1e-9 && /nutrition|energy|nährwert|пищев/u.test(prefix))
  );
}

function rawCandidate(input: QuantityInput): Candidate | null {
  if (
    !input.unit ||
    input.unitQuantity == null ||
    !Number.isFinite(input.unitQuantity) ||
    input.unitQuantity <= 0
  ) {
    return null;
  }
  const normalized = normalizedUnit(input.unit);
  if (!normalized) return null;
  return {
    quantity: input.unitQuantity * normalized.factor,
    unit: normalized.unit,
    evidence: `raw unit: ${String(input.unitQuantity)} ${input.unit}`,
  };
}

function sameContent(left: Candidate, right: Candidate): boolean {
  return left.unit === right.unit && Math.abs(left.quantity - right.quantity) < 1e-9;
}

function resolvePriceBasis(input: QuantityInput): QuantityInterpretation['priceBasis'] {
  if (input.priceBasis) return input.priceBasis;
  const text = `${input.name} ${input.description ?? ''}`;
  if (/(?:per\s*|\/\s*)kg\b/i.test(text)) return 'kg';
  if (/(?:per\s*|\/\s*)l(?:iter|itre)?\b/i.test(text)) return 'l';
  const rawUnit = input.unit ? normalizedUnit(input.unit) : null;
  if (rawUnit?.unit === 'kg' && input.unitQuantity == null) return 'kg';
  if (rawUnit?.unit === 'l' && input.unitQuantity == null) return 'l';
  return 'package';
}

export function interpretProductQuantity(input: QuantityInput): QuantityInterpretation {
  const evidence: string[] = [];
  const priceBasis = resolvePriceBasis(input);
  if (input.priceBasis) evidence.push(`price basis: ${input.priceBasis}`);

  const named = textCandidates(input.name, 'name');
  const described = textCandidates(input.description, 'description');
  const raw = rawCandidate(input);
  evidence.push(...named.evidence, ...described.evidence);

  const textualContent = named.candidates[0] ?? described.candidates[0];
  const hasCountCategoryEvidence = /\beggs?\b/i.test(`${input.name} ${input.description ?? ''}`);
  const rawIsSellingPiece =
    raw?.unit === 'pieces' &&
    ((textualContent?.unit !== 'pieces' && !hasCountCategoryEvidence) ||
      (raw.quantity === 1 && textualContent?.unit === 'pieces' && textualContent.quantity !== 1));
  if (raw) {
    evidence.push(rawIsSellingPiece ? `${raw.evidence} (selling unit)` : raw.evidence);
  } else if (input.unit) {
    const invalidRawQuantity =
      input.unitQuantity != null &&
      (!Number.isFinite(input.unitQuantity) || input.unitQuantity <= 0);
    evidence.push(invalidRawQuantity ? `invalid raw quantity: ${String(input.unitQuantity)}` : `raw unit: ${input.unit}`);
  }

  const candidates = [...named.candidates, ...described.candidates, rawIsSellingPiece ? null : raw].filter(
    (candidate): candidate is Candidate => candidate !== null,
  );
  const selected = candidates[0] ?? null;
  const conflict = selected !== null && candidates.some((candidate) => !sameContent(selected, candidate));

  if (conflict) {
    return {
      version: 1,
      status: 'conflict',
      contentQuantity: null,
      contentUnit: null,
      priceBasis,
      comparablePrice: null,
      evidence,
    };
  }

  let content = selected;
  const invalidRawQuantity =
    input.unitQuantity != null &&
    (!Number.isFinite(input.unitQuantity) || input.unitQuantity <= 0);
  if (!content && !invalidRawQuantity && (priceBasis === 'kg' || priceBasis === 'l')) {
    content = { quantity: 1, unit: priceBasis, evidence: `price basis: ${priceBasis}` };
  }

  const validPrice = Number.isFinite(input.price) && input.price > 0;
  if (!validPrice) evidence.push('invalid price');
  const compatibleBasis = Boolean(
    content &&
      (priceBasis === 'package' ||
        priceBasis === content.unit ||
        (priceBasis === 'piece' && content.unit === 'pieces')),
  );
  const hasAmbiguousText = named.ambiguous || described.ambiguous;
  const hasInvalidText = named.invalid || described.invalid;
  const status: QuantityInterpretation['status'] =
    content && validPrice && compatibleBasis && !invalidRawQuantity && !hasAmbiguousText && !hasInvalidText
      ? 'verified'
      : 'unknown';

  let comparablePrice: number | null = null;
  if (status === 'verified' && content) {
    comparablePrice = priceBasis === 'package' ? input.price / content.quantity : input.price;
  }

  return {
    version: 1,
    status,
    contentQuantity: content?.quantity ?? null,
    contentUnit: content?.unit ?? null,
    priceBasis,
    comparablePrice,
    evidence,
  };
}
