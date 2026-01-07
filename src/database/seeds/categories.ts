import { query } from '../index';

export interface CategorySeedData {
  name: string;
  name_en: string;
  icon?: string;
}

export const categoriesData: CategorySeedData[] = [
  {
    name: 'Fruits & Vegetables',
    name_en: 'fruits_vegetables',
    icon: '🥬',
  },
  {
    name: 'Meat, Fish & Poultry',
    name_en: 'meat_fish_poultry',
    icon: '🍖',
  },
  {
    name: 'Dairy & Eggs',
    name_en: 'dairy_eggs',
    icon: '🥛',
  },
  {
    name: 'Bread & Bakery',
    name_en: 'bread_bakery',
    icon: '🍞',
  },
  {
    name: 'Beverages',
    name_en: 'beverages',
    icon: '🥤',
  },
  {
    name: 'Snacks & Sweets',
    name_en: 'snacks_sweets',
    icon: '🍪',
  },
  {
    name: 'Canned & Packaged Foods',
    name_en: 'canned_packaged',
    icon: '🥫',
  },
  {
    name: 'Pasta, Rice & Grains',
    name_en: 'pasta_rice_grains',
    icon: '🍚',
  },
  {
    name: 'Oils & Condiments',
    name_en: 'oils_condiments',
    icon: '🫒',
  },
  {
    name: 'Frozen Foods',
    name_en: 'frozen',
    icon: '🧊',
  },
  {
    name: 'Personal Care',
    name_en: 'personal_care',
    icon: '🧴',
  },
  {
    name: 'Household & Cleaning',
    name_en: 'household_cleaning',
    icon: '🧹',
  },
  {
    name: 'Baby & Kids',
    name_en: 'baby_kids',
    icon: '👶',
  },
  {
    name: 'Pet Supplies',
    name_en: 'pet_supplies',
    icon: '🐾',
  },
];

export async function seedCategories(): Promise<void> {
  console.log('Seeding categories...');

  for (const category of categoriesData) {
    await query(
      `INSERT INTO categories (name, name_en, icon)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
       SET name_en = EXCLUDED.name_en,
           icon = EXCLUDED.icon`,
      [category.name, category.name_en, category.icon]
    );
    console.log(`✓ Seeded category: ${category.name}`);
  }

  console.log('Categories seeded successfully');
}
