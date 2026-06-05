export type ArchiveFilter = "active" | "archived" | "all";

type ArchiveFilterToggleProps = {
  disabled?: boolean;
  onChange: (filter: ArchiveFilter) => void;
  value: ArchiveFilter;
};

const archiveFilterOptions: { label: string; value: ArchiveFilter }[] = [
  { label: "Activos", value: "active" },
  { label: "Archivados", value: "archived" },
  { label: "Todos", value: "all" },
];

export function ArchiveFilterToggle({
  disabled = false,
  onChange,
  value,
}: ArchiveFilterToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-1">
      {archiveFilterOptions.map((option) => {
        const isSelected = option.value === value;

        return (
          <button
            className={`h-8 rounded px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "bg-white text-emerald-800 shadow-sm"
                : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
            }`}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ArchiveBadge() {
  return (
    <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
      Archivado
    </span>
  );
}

type BulkArchiveActionBarProps = {
  archivedCount: number;
  disabled?: boolean;
  filter: ArchiveFilter;
  onArchive: () => void;
  onRestore: () => void;
  selectedCount: number;
};

export function BulkArchiveActionBar({
  archivedCount,
  disabled = false,
  filter,
  onArchive,
  onRestore,
  selectedCount,
}: BulkArchiveActionBarProps) {
  const activeCount = selectedCount - archivedCount;
  const canArchive = filter === "active" || filter === "all";
  const canRestore = filter === "archived" || filter === "all";

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="print:hidden border-b border-stone-200 bg-emerald-50 px-5 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-emerald-900">
          {selectedCount} seleccionados
        </p>
        <div className="flex flex-wrap gap-2">
          {canArchive && activeCount > 0 ? (
            <button
              className="h-9 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={disabled}
              onClick={onArchive}
              type="button"
            >
              Archivar seleccionados
            </button>
          ) : null}
          {canRestore && archivedCount > 0 ? (
            <button
              className="h-9 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              onClick={onRestore}
              type="button"
            >
              Restaurar seleccionados
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
