"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type AttachmentManagerProps = {
  companyId: string;
  entityId: string;
  entityType: string;
};

type AttachmentRecord = {
  id: string;
  category: string | null;
  created_at: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  notes: string | null;
};

const attachmentCategories = [
  "general",
  "ticket",
  "factura proveedor",
  "comprobante de pago",
  "evidencia",
  "foto producto",
  "requisición",
  "cotización proveedor",
  "recibido firmado",
  "ficha técnica",
];

const bucketName = "attachments";

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function sanitizeFileName(fileName: string) {
  const normalizedName = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalizedName || "archivo";
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) {
    return "Tamaño no disponible";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fileTypeLabel(value: string | null) {
  if (!value) {
    return "Tipo no disponible";
  }

  if (value === "application/pdf") {
    return "PDF";
  }

  if (value.startsWith("image/")) {
    return `Imagen ${value.replace("image/", "").toUpperCase()}`;
  }

  return value;
}

export function AttachmentManager({
  companyId,
  entityId,
  entityType,
}: AttachmentManagerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [category, setCategory] = useState(attachmentCategories[0]);
  const [errorMessage, setErrorMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningId, setIsOpeningId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const loadAttachments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("attachments")
      .select("id,file_name,file_path,file_type,file_size,category,notes,created_at")
      .eq("company_id", companyId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setAttachments([]);
      setIsLoading(false);
      return;
    }

    setAttachments((data ?? []) as AttachmentRecord[]);
    setIsLoading(false);
  }, [companyId, entityId, entityType, supabase]);

  useEffect(() => {
    async function loadInitialAttachments() {
      await loadAttachments();
    }

    loadInitialAttachments();
  }, [loadAttachments]);

  function resetForm() {
    setCategory(attachmentCategories[0]);
    setFile(null);
    setNotes("");
  }

  function cancelUpload() {
    resetForm();
    setErrorMessage("");
    setShowForm(false);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setErrorMessage("Selecciona un archivo para subir.");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("No se pudo validar la sesión activa.");
      setIsUploading(false);
      return;
    }

    const sanitizedFileName = sanitizeFileName(file.name);
    const filePath = `${companyId}/${entityType}/${entityId}/${Date.now()}-${sanitizedFileName}`;
    const uploadResponse = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadResponse.error) {
      setErrorMessage(uploadResponse.error.message);
      setIsUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from("attachments").insert({
      category,
      company_id: companyId,
      entity_id: entityId,
      entity_type: entityType,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type || "application/octet-stream",
      notes: cleanOptionalValue(notes),
      uploaded_by: user.id,
    });

    if (insertError) {
      await supabase.storage.from(bucketName).remove([filePath]);
      setErrorMessage(insertError.message);
      setIsUploading(false);
      return;
    }

    resetForm();
    setShowForm(false);
    setSuccessMessage("Archivo subido correctamente.");
    setIsUploading(false);
    await loadAttachments();
  }

  async function openAttachment(attachment: AttachmentRecord) {
    setIsOpeningId(attachment.id);
    setErrorMessage("");

    const signedResponse = await supabase.storage
      .from(bucketName)
      .createSignedUrl(attachment.file_path, 60 * 5);

    const url =
      signedResponse.data?.signedUrl ??
      supabase.storage.from(bucketName).getPublicUrl(attachment.file_path).data
        .publicUrl;

    if (!url) {
      setErrorMessage("No se pudo generar la liga del archivo.");
      setIsOpeningId(null);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    setIsOpeningId(null);
  }

  async function downloadAttachment(attachment: AttachmentRecord) {
    setIsDownloadingId(attachment.id);
    setErrorMessage("");

    const signedResponse = await supabase.storage
      .from(bucketName)
      .createSignedUrl(attachment.file_path, 60 * 5, {
        download: attachment.file_name,
      });

    const url =
      signedResponse.data?.signedUrl ??
      supabase.storage.from(bucketName).getPublicUrl(attachment.file_path).data
        .publicUrl;

    if (!url) {
      setErrorMessage("No se pudo generar la descarga del archivo.");
      setIsDownloadingId(null);
      return;
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = attachment.file_name;
    downloadLink.rel = "noopener noreferrer";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setIsDownloadingId(null);
  }

  async function deleteAttachment(attachment: AttachmentRecord) {
    const shouldDelete = window.confirm(
      `¿Eliminar el archivo "${attachment.file_name}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(attachment.id);
    setErrorMessage("");
    setSuccessMessage("");

    const removeResponse = await supabase.storage
      .from(bucketName)
      .remove([attachment.file_path]);

    if (removeResponse.error) {
      setErrorMessage(removeResponse.error.message);
      setIsDeletingId(null);
      return;
    }

    const { error } = await supabase
      .from("attachments")
      .delete()
      .eq("company_id", companyId)
      .eq("id", attachment.id);

    if (error) {
      setErrorMessage(error.message);
      setIsDeletingId(null);
      return;
    }

    setAttachments((currentAttachments) =>
      currentAttachments.filter((currentAttachment) => {
        return currentAttachment.id !== attachment.id;
      }),
    );
    setSuccessMessage("Archivo eliminado correctamente.");
    setIsDeletingId(null);
  }

  return (
    <div className="space-y-5">
      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-600">
          {isLoading
            ? "Cargando archivos..."
            : `${attachments.length} archivo${attachments.length === 1 ? "" : "s"}`}
        </p>
        {!showForm ? (
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isLoading}
            onClick={() => {
              setSuccessMessage("");
              setShowForm(true);
            }}
            type="button"
          >
            Agregar archivo
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 md:grid-cols-2"
          onSubmit={handleUpload}
        >
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor={`${entityType}-${entityId}-attachment-file`}
            >
              Archivo
            </label>
            <input
              className="block h-11 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-800 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isUploading}
              id={`${entityType}-${entityId}-attachment-file`}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
              type="file"
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor={`${entityType}-${entityId}-attachment-category`}
            >
              Categoría
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isUploading}
              id={`${entityType}-${entityId}-attachment-category`}
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              {attachmentCategories.map((attachmentCategory) => (
                <option key={attachmentCategory} value={attachmentCategory}>
                  {attachmentCategory}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor={`${entityType}-${entityId}-attachment-notes`}
            >
              Notas
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isUploading}
              id={`${entityType}-${entityId}-attachment-notes`}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row md:col-span-2">
            <button
              className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isUploading}
              type="submit"
            >
              {isUploading ? "Subiendo..." : "Subir archivo"}
            </button>
            <button
              className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUploading}
              onClick={cancelUpload}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm font-medium text-stone-600">
          Cargando archivos...
        </div>
      ) : attachments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
          No hay archivos cargados.
        </div>
      ) : (
        <div className="divide-y divide-stone-200 overflow-hidden rounded-lg border border-stone-200">
          {attachments.map((attachment) => (
            <article
              className="flex flex-col gap-4 bg-white p-4 lg:flex-row lg:items-start lg:justify-between"
              key={attachment.id}
            >
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="break-words text-sm font-semibold text-stone-950">
                    {attachment.file_name}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {fileTypeLabel(attachment.file_type)} ·{" "}
                    {formatFileSize(attachment.file_size)} ·{" "}
                    {formatDateTime(attachment.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                    {attachment.category || "general"}
                  </span>
                </div>
                {attachment.notes ? (
                  <p className="break-words text-sm text-stone-700">
                    {attachment.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                <button
                  className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isOpeningId === attachment.id}
                  onClick={() => openAttachment(attachment)}
                  type="button"
                >
                  {isOpeningId === attachment.id ? "Abriendo..." : "Abrir"}
                </button>
                <button
                  className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDownloadingId === attachment.id}
                  onClick={() => downloadAttachment(attachment)}
                  type="button"
                >
                  {isDownloadingId === attachment.id
                    ? "Descargando..."
                    : "Descargar"}
                </button>
                <button
                  className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDeletingId === attachment.id}
                  onClick={() => deleteAttachment(attachment)}
                  type="button"
                >
                  {isDeletingId === attachment.id
                    ? "Eliminando..."
                    : "Eliminar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
