/** Conservative English checks after translation. These narrow a review queue, never auto-approve. */
const normalized = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ');
const produce: Record<string,string> = {apple:'apples',banana:'bananas',carrot:'carrots',onion:'onions',tomato:'tomatoes',cucumber:'cucumbers',potato:'potatoes'};
function coreName(value: string): string { return normalized(value).replace(/\b\d+(?:\s+\d+)?\s*(?:kg|g|l|ml)?\b/g,'').trim().replace(/\s+/g,' '); }
export function searchNames(canonical: string): string[] {
 const plain=coreName(canonical);
 const entry=Object.entries(produce).find(([one,many])=>new RegExp(`^(${one}|${many})$`).test(plain));
 return entry ? [canonical,entry[1][0].toUpperCase()+entry[1].slice(1)] : [canonical];
}
export function matchesGroceryType(canonical: string, translatedName: string): boolean {
 const target=coreName(canonical), name=normalized(translatedName).replace(/(\d)(kg|g|gr|ml|l)\b/g,'$1 $2');
 const has=(pattern:string)=>new RegExp(`\\b(?:${pattern})\\b`).test(name);
 const fruit=Object.entries(produce).find(([one,many])=>new RegExp(`^(${one}|${many})$`).test(target));
 if(fruit) {
  if(!has(`${fruit[0]}|${fruit[1]}`))return false;
  // Without taxonomy or a semantic model, accept only plain produce descriptions.
  // Unknown terms abstain: a short branded candy name can otherwise look exactly like fruit.
  const allowed=new Set((`${fruit[0]} ${fruit[1]} fresh loose whole organic bio red green yellow white golden delicious gala fuji smith granny pink lady royal cosmic kanzi melinda chiquita carrefour filiera qualita quality origin italy italian category class calibre caliber selected selection premium large small medium mini pack packet bag tray net value washed unwashed unpeeled kg g gr grams gram kilogram kilograms x sfuse sfusi vassoio i ii of from the country france spain`).split(' '));
  return name.split(' ').filter(word=>word && !/^\d+$/.test(word)).every(word=>allowed.has(word));
 }

 if(/^(milk|lactose free milk)$/.test(target)) {
  const lactoseFree=/lactose free/.test(target);
  return has('milk') && !has('almond|soy|soya|oat|coconut|rice|hazelnut|chocolate|cocoa|kefir|yogurt|yoghurt|powder|condensed|cheese|baby')
   && (!has('cream') || has('full cream'))
   && (lactoseFree ? has('lactose free|without lactose|no lactose') : !has('lactose free|without lactose|no lactose'));
 }
 if(/ground beef/.test(target))return has('beef|bovine|cattle|chianina')&&has('ground|minced|mince')&&!has('pork|pig|swine|mixed|broth|stock|soup|ravioli|bao|burger|burgers|vegetable|vegan');
 if(/chicken breast/.test(target))return has('chicken')&&has('breast|breasts')&&!has('nuggets|bites|breaded|battered|cooked|burger|sliced meat|roasted');
 if(/\bcola\b/.test(target))return has('cola');
 if(/orange juice/.test(target))return has('orange')&&has('juice')&&!has('mango|carrot|peach|cocktail');
 if(/\boil\b/.test(target))return has('oil')&&!has('body|hair|essential|cosmetic|massage|skin|tuna|sardines|mackerel|artichokes|tomatoes');
 if(/\bbutter\b/.test(target))return has('butter')&&!has('peanut|almond|croissant|croissants|cookies|biscuits|cake|pastry');
 if(/\bflour\b/.test(target))return has('flour')&&!has('mix|mixture|yeast|polenta|almond|coconut');
 if(target==='rice')return has('rice')&&!has('drink|milk|cakes|crackers|snack|prepared|ready|salad');
 if(target==='pasta')return has('pasta|spaghetti|penne|fusilli|rigatoni|macaroni|linguine|tagliatelle|farfalle')&&!has('pastry|pizza|mix|soup|beans|prepared|ready|pinsa|roll|fillo|phyllo|filo|kataifi|sliced');
 if(/\bwater\b/.test(target))return has('water')&&!has('flavored|flavoured|flavor|flavour|lemon|tonic|coconut');
 if(/\bsugar\b/.test(target))return has('sugar')&&!has('cake|candy|sweetener|icing|powdered');
 if(/\bmayonnaise\b/.test(target))return has('mayonnaise|mayo');
 if(/\beggs?\b/.test(target))return has('egg|eggs')&&!has('chocolate|liquid|powder|pasta|cooked');
 return true;
}
