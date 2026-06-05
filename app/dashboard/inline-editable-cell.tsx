"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useRef,
  useState,
} from "react";

type InlineEditableCellProps = {
  value: string | null;
  emptyLabel: string;
  label: string;
  onSave: (value: string | null) => Promise<void>;
  options?: string[];
  required?: boolean;
  textarea?: boolean;
  type?: "email" | "tel" | "text";
};

type InlineBooleanCellProps = {
  value: boolean;
  label: string;
  onSave: (value: boolean) => Promise<void>;
};

const editableDisplayClass =
  "min-h-9 min-w-28 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-stone-200 hover:bg-stone-50 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100";

const fieldClass =
  "w-full min-w-32 rounded-md border border-emerald-700 bg-white px-2 py-1.5 text-sm text-stone-950 outline-none ring-2 ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";

function normalizeTextValue(value: string | null) {
  return value ?? "";
}

function toPayloadValue(value: string, required: boolean) {
  const trimmedValue = value.trim();
  return required || trimmedValue.length > 0 ? trimmedValue : null;
}

export function InlineEditableCell({
  value,
  emptyLabel,
  label,
  onSave,
  options,
  required = false,
  textarea = false,
  type = "text",
}: InlineEditableCellProps) {
  const [draftValue, setDraftValue] = useState(normalizeTextValue(value));
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const didCancelRef = useRef(false);

  async function saveDraft() {
    if (isSaving || didCancelRef.current) {
      return;
    }

    const nextValue = toPayloadValue(draftValue, required);
    const currentValue = required ? normalizeTextValue(value) : value;

    if (nextValue === currentValue) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);

    try {
      await onSave(nextValue);
      setIsEditing(false);
    } catch {
      setDraftValue(normalizeTextValue(value));
    } finally {
      setIsSaving(false);
    }
  }

  function cancelEdit() {
    didCancelRef.current = true;
    setDraftValue(normalizeTextValue(value));
    setIsEditing(false);
    window.setTimeout(() => {
      didCancelRef.current = false;
    }, 0);
  }

  function startEditing() {
    setDraftValue(normalizeTextValue(value));
    setIsEditing(true);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }

    if (event.key === "Enter" && !textarea) {
      event.preventDefault();
      void saveDraft();
    }
  }

  if (isEditing) {
    if (options) {
      return (
        <div className="space-y-1">
          <select
            aria-label={label}
            autoFocus
            className={fieldClass}
            disabled={isSaving}
            onBlur={() => void saveDraft()}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setDraftValue(event.target.value)
            }
            onKeyDown={handleKeyDown}
            value={draftValue}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {isSaving ? (
            <p className="text-xs font-medium text-emerald-700">Guardando...</p>
          ) : null}
        </div>
      );
    }

    if (textarea) {
      return (
        <div className="space-y-1">
          <textarea
            aria-label={label}
            autoFocus
            className={`${fieldClass} min-h-20 resize-y`}
            disabled={isSaving}
            onBlur={() => void saveDraft()}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={handleKeyDown}
            value={draftValue}
          />
          {isSaving ? (
            <p className="text-xs font-medium text-emerald-700">Guardando...</p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <input
          aria-label={label}
          autoFocus
          className={fieldClass}
          disabled={isSaving}
          onBlur={() => void saveDraft()}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={handleKeyDown}
          type={type}
          value={draftValue}
        />
        {isSaving ? (
          <p className="text-xs font-medium text-emerald-700">Guardando...</p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      aria-label={`Editar ${label}`}
      className={editableDisplayClass}
      onClick={startEditing}
      onDoubleClick={startEditing}
      type="button"
    >
      <span className={value ? "text-stone-700" : "text-stone-400"}>
        {value || emptyLabel}
      </span>
    </button>
  );
}

export function InlineBooleanCell({
  value,
  label,
  onSave,
}: InlineBooleanCellProps) {
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(nextValue: boolean) {
    if (isSaving || nextValue === value) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave(nextValue);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <label className="inline-flex min-w-28 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-stone-200 hover:bg-stone-50">
      <input
        aria-label={label}
        checked={value}
        className="h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700 disabled:cursor-not-allowed"
        disabled={isSaving}
        onChange={(event) => void handleChange(event.target.checked)}
        type="checkbox"
      />
      <span className="text-sm font-medium text-stone-700">
        {isSaving ? "Guardando..." : value ? "Activo" : "Inactivo"}
      </span>
    </label>
  );
}
