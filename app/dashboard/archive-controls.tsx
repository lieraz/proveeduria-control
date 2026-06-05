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
