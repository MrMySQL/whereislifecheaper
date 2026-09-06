import { matchesGroceryType, searchNames } from '../mappingSemantics';
test.each([
 ['Cola 0.5L','Baileys Chocolate 500 ml',false],['Cola 0.5L','Coca-Cola Original 500 ml',true],
 ['Apple 1 kg','Apple fruit snack bar 40 g',false],['Apple 1 kg','Gala Apples 1 kg',true],
 ['Banana 1 kg','Banana chocolate dessert',false],['Banana 1 kg','Chiquita Bananas loose',true],
 ['Oil 1L','Energizing body oil 100 ml',false],['Oil 1L','Extra virgin olive oil 750 ml',true],
 ['Ground beef','Beef broth 1 L',false],['Ground beef','Minced beef value pack',true],['Ground beef','Mixed ground pork and beef',false],
 ['Chicken breast (1kg)','Frozen chicken nuggets 1 kg',false],['Chicken breast (1kg)','Chicken breast 1000 g',true],
 ['Lactose-free milk 1L','Semi skimmed milk 1L',false],['Lactose-free milk 1L','Lactose-free semi skimmed milk 1L',true],
 ['Milk 1L','Almond drink 1L',false],['Milk 1L','Whole milk 1L',true],
 ['Pasta','Shortcrust pastry roll',false],['Pasta','Barilla Spaghetti 500 g',true],
 ['Cucumber 1 kg','Pickled cucumbers 300 g',false],['Tomato 1kg','Tomato pulp in tomato juice',false],
])('%s versus %s => %s',(canonical,name,expected)=>expect(matchesGroceryType(canonical,name)).toBe(expected));
test('search names include plural produce vocabulary for cold countries',()=>expect(searchNames('Apple 1 kg')).toContain('Apples'));
test.each([
 ['Milk 1L','Full cream milk 1L',true],['Apple juice 1L','Apple juice 1L',true],['Rice milk 1L','Rice milk 1L',true],
 ['Carrot 1 kg','Tuna and carrot paté 100g',false],['Tomato 1kg','Tomato focaccia',false],
 ['Potatoes','Potato starch 250g',false],['Apple 1 kg','Small apple strudel 200g',false],
 ['Cucumber 1 kg','Tzatziki with cucumbers 175g',false],['Banana 1 kg','Haribo Bananas 175g',false],
 ['Banana 1 kg','Yomo Banana 2 x 125g',false],['Onion 1kg','Sour Cream and Onion 175g',false],
])('product form regression %s / %s',(canonical,name,expected)=>expect(matchesGroceryType(canonical,name)).toBe(expected));

test('does not classify translated pastry dough or prepared onion as staples',()=>{expect(matchesGroceryType('Pasta','Sliced pasta 200 g')).toBe(false);expect(matchesGroceryType('Onion 1kg','Sliced onion')).toBe(false);});
test.each(['Gala apples 1kg','Gala apples 500g'])('produce compact quantity %s remains valid',name=>expect(matchesGroceryType('Apple 1kg',name)).toBe(true));

test.each(['Apple 6 pieces','Apple 6pcs','Apple pack of 6','Apple 6 pack'])('piece and pack canonical %s gets plural search vocabulary',canonical=>expect(searchNames(canonical)).toContain('Apples'));
test.each([
 ['Apple 6 pieces','Fresh apples 6 pieces',true],['Banana 1kg','Bananas bunch 1kg',true],
 ['Whole milk 1L','Almond drink 1L',false],['Whole milk 1L','Whole milk 1L',true],
 ['Red apples 1kg','Haribo Bananas 175g',false],['Red apples 1kg','Red apples 1kg',true],
 ['Red apples 1kg','Red apple juice 1L',false],['Organic banana 1kg','Haribo Bananas 175g',false],
])('descriptive canonical and count listings %s / %s',(canonical,name,expected)=>expect(matchesGroceryType(canonical,name)).toBe(expected));
