"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type ContactRecord = {
  id: string;
  department: string | null;
  contact_name: string | null;
  position: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string | null;
};

type ContactFormState = {
  department: string;
  contact_name: string;
  position: string;
  phone: string;
  whatsapp: string;
  email: string;
  notes: string;
};

type ContactosSectionProps = {
  companyId: string | null;
  includeDepartment?: boolean;
  ownerId: string;
  ownerIdColumn: "client_id" | "supplier_id";
  ownerLabel: "cliente" | "proveedor";
  ownerName: string;
  tableName: "client_contacts" | "supplier_contacts";
  onClose: () => void;
};

const emptyContactForm: ContactFormState = {
  department: "",
  contact_name: "",
  position: "",
  phone: "",
  whatsapp: "",
  email: "",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function ContactosSection({
  companyId,
  includeDepartment = false,
  ownerId,
  ownerIdColumn,
  ownerLabel,
  ownerName,
  tableName,
  onClose,
}: ContactosSectionProps) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<ContactFormState>(emptyContactForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!companyId) {
      setContacts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const selectColumns = includeDepartment
      ? "id,department,contact_name,position,phone,whatsapp,email,notes"
      : "id,contact_name,position,phone,whatsapp,email,notes";

    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .eq("company_id", companyId)
      .eq(ownerIdColumn, ownerId)
      .order("contact_name", { ascending: true });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      setContacts([]);
      return;
    }

    const contactRows = (data ?? []) as Partial<ContactRecord>[];

    setContacts(
      contactRows.map((contact) => ({
        department: null,
        ...contact,
      })) as ContactRecord[],
    );
  }, [companyId, includeDepartment, ownerId, ownerIdColumn, supabase, tableName]);

  useEffect(() => {
    async function loadInitialContacts() {
      await loadContacts();
    }

    loadInitialContacts();
  }, [loadContacts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const contactName = form.contact_name.trim();

    if (!contactName) {
      setErrorMessage("El nombre del contacto es obligatorio.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      contact_name: contactName,
      position: cleanOptionalValue(form.position),
      phone: cleanOptionalValue(form.phone),
      whatsapp: cleanOptionalValue(form.whatsapp),
      email: cleanOptionalValue(form.email),
      notes: cleanOptionalValue(form.notes),
      ...(includeDepartment
        ? { department: cleanOptionalValue(form.department) }
        : {}),
    };

    const { error } = editingContactId
      ? await supabase
          .from(tableName)
          .update(payload)
          .eq("id", editingContactId)
          .eq("company_id", companyId)
          .eq(ownerIdColumn, ownerId)
      : await supabase.from(tableName).insert({
          ...payload,
          company_id: companyId,
          [ownerIdColumn]: ownerId,
        });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingContactId(null);
    setForm(emptyContactForm);
    await loadContacts();
  }

  function startEditing(contact: ContactRecord) {
    setEditingContactId(contact.id);
    setForm({
      department: contact.department ?? "",
      contact_name: contact.contact_name ?? "",
      position: contact.position ?? "",
      phone: contact.phone ?? "",
      whatsapp: contact.whatsapp ?? "",
      email: contact.email ?? "",
      notes: contact.notes ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingContactId(null);
    setForm(emptyContactForm);
    setErrorMessage("");
  }

  async function deleteContact(contact: ContactRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar el contacto "${contact.contact_name}"? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(contact.id);
    setErrorMessage("");

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", contact.id)
      .eq("company_id", companyId)
      .eq(ownerIdColumn, ownerId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingContactId === contact.id) {
      cancelEditing();
    }

    await loadContacts();
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              Contactos de {ownerName}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Administra contactos asociados a este {ownerLabel}.
            </p>
          </div>
          <button
            className="h-10 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            onClick={onClose}
            type="button"
          >
            Cerrar contactos
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(280px,380px)_1fr]">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <h4 className="text-base font-semibold text-stone-950">
              {editingContactId ? "Editar contacto" : "Nuevo contacto"}
            </h4>
            <p className="mt-1 text-sm text-stone-600">
              Se guardará automáticamente en la empresa de tu perfil.
            </p>
          </div>

          {includeDepartment ? (
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor={`${tableName}-department`}
              >
                Departamento
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id={`${tableName}-department`}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    department: event.target.value,
                  }))
                }
                type="text"
                value={form.department}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor={`${tableName}-contact-name`}
            >
              Nombre del contacto
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id={`${tableName}-contact-name`}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  contact_name: event.target.value,
                }))
              }
              required
              type="text"
              value={form.contact_name}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor={`${tableName}-position`}
              >
                Puesto
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id={`${tableName}-position`}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    position: event.target.value,
                  }))
                }
                type="text"
                value={form.position}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor={`${tableName}-phone`}
              >
                Teléfono
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id={`${tableName}-phone`}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    phone: event.target.value,
                  }))
                }
                type="tel"
                value={form.phone}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor={`${tableName}-whatsapp`}
              >
                WhatsApp
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id={`${tableName}-whatsapp`}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    whatsapp: event.target.value,
                  }))
                }
                type="tel"
                value={form.whatsapp}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor={`${tableName}-email`}
              >
                Correo
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id={`${tableName}-email`}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    email: event.target.value,
                  }))
                }
                type="email"
                value={form.email}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor={`${tableName}-notes`}
            >
              Notas
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id={`${tableName}-notes`}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  notes: event.target.value,
                }))
              }
              value={form.notes}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <button
              className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving
                ? "Guardando..."
                : editingContactId
                  ? "Guardar cambios"
                  : "Crear contacto"}
            </button>
            {editingContactId ? (
              <button
                className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={cancelEditing}
                type="button"
              >
                Cancelar edición
              </button>
            ) : null}
          </div>
        </form>

        <div className="min-w-0">
          {isLoading ? (
            <div className="rounded-md border border-stone-200 p-4 text-sm font-medium text-stone-600">
              Cargando contactos...
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-md border border-stone-200 p-4 text-sm text-stone-600">
              No hay contactos para mostrar.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    {includeDepartment ? (
                      <th className="px-4 py-3">Departamento</th>
                    ) : null}
                    <th className="px-4 py-3">Contacto</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">WhatsApp</th>
                    <th className="px-4 py-3">Correo</th>
                    <th className="px-4 py-3">Notas</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      {includeDepartment ? (
                        <td className="px-4 py-3 text-stone-700">
                          {contact.department || "Sin departamento"}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-stone-700">
                        <div className="space-y-1">
                          <p className="font-medium text-stone-950">
                            {contact.contact_name || "Sin nombre"}
                          </p>
                          <p className="text-xs text-stone-500">
                            {contact.position || "Sin puesto"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {contact.phone || "Sin teléfono"}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {contact.whatsapp || "Sin WhatsApp"}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {contact.email || "Sin correo"}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-stone-700">
                        <span className="line-clamp-2">
                          {contact.notes || "Sin notas"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === contact.id}
                            onClick={() => startEditing(contact)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === contact.id}
                            onClick={() => deleteContact(contact)}
                            type="button"
                          >
                            {isDeletingId === contact.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
