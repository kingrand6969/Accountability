export type FoodHit = {
  name: string;
  brand: string | null;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
};

/**
 * Free-text food search against the public Open Food Facts database
 * (no API key). Returns per-100g nutrition. Throws on network/availability
 * issues so the UI can fall back to manual entry.
 */
export async function searchFoods(query: string): Promise<FoodHit[]> {
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25' +
    `&fields=product_name,brands,nutriments&search_terms=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'AccountabilityApp/0.1 (accountability app)' },
  });
  if (!res.ok) {
    throw new Error('Food database is busy right now — try again or add it manually.');
  }
  const json = await res.json();
  const products = Array.isArray(json.products) ? json.products : [];
  const num = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  return products
    .map((p: any): FoodHit => ({
      name: (p.product_name || '').trim(),
      brand: (p.brands || '').trim() || null,
      per100: {
        kcal: Math.round(num(p.nutriments?.['energy-kcal_100g'])),
        protein: num(p.nutriments?.['proteins_100g']),
        carbs: num(p.nutriments?.['carbohydrates_100g']),
        fat: num(p.nutriments?.['fat_100g']),
      },
    }))
    .filter((f: FoodHit) => f.name.length > 0 && f.per100.kcal > 0)
    .slice(0, 20);
}
