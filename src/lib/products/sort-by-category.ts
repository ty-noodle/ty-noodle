/**
 * Sorts products by category sort_order, then by product display_order within the same category.
 * Products with no category come last, sorted by display_order.
 *
 * This is the single source of truth for product ordering across the app.
 * Apply at the data-fetching layer so every consumer receives pre-sorted products.
 *
 * @param products  Any array of objects that have `id`, `categoryIds`, `name`, and optionally `display_order`.
 * @param categories  The category list with `id` and `sortOrder` — order determines display order.
 */
export function sortProductsByCategory<
  T extends { id: string; categoryIds: string[]; name: string; display_order?: number },
>(products: T[], categories: { id: string; sortOrder: number }[]): T[] {
  const sortOrderById = new Map<string, number>(
    categories.map((c) => [c.id, c.sortOrder]),
  );

  function minSortOrder(p: T): number {
    if (p.categoryIds.length === 0) return Infinity;
    return Math.min(
      ...p.categoryIds.map((id) => sortOrderById.get(id) ?? Infinity),
    );
  }

  return [...products].sort((a, b) => {
    const diff = minSortOrder(a) - minSortOrder(b);
    if (diff !== 0) return diff;
    
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    
    return a.name.localeCompare(b.name, "th");
  });
}

