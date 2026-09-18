import { LENSES, type LensKey } from "@/lib/lenses";
import { ALL_CATEGORIES, SORTS, type CategoryOption, type SortKey } from "@/lib/projectSearch";

const selectClass =
  "h-10 rounded-lg border border-bp-muted bg-bp-surface px-3 text-sm text-bp-ink transition-colors hover:border-bp-secondary focus:border-bp-accent";

export function FilterBar({
  lens,
  onLens,
  counts,
  category,
  onCategory,
  categories,
  sort,
  onSort,
}: {
  lens: LensKey;
  onLens: (lens: LensKey) => void;
  counts: Record<LensKey, number>;
  category: string;
  onCategory: (category: string) => void;
  categories: CategoryOption[];
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {LENSES.map((option) => {
          const active = option.key === lens;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => onLens(option.key)}
              className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                active
                  ? "border-bp-ink bg-bp-ink text-bp-bg"
                  : "border-bp-muted text-bp-ink hover:border-bp-secondary hover:bg-bp-raised"
              }`}
            >
              {option.label}
              <span className={`font-bp-mono text-xs ${active ? "text-bp-bg" : "text-bp-secondary"}`}>
                {counts[option.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-bp-secondary">
          Category
          <select value={category} onChange={(event) => onCategory(event.target.value)} className={selectClass}>
            <option value={ALL_CATEGORIES}>All categories</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-bp-secondary">
          Sort
          <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)} className={selectClass}>
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
