"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  InlineBooleanCell,
  InlineEditableCell,
} from "../inline-editable-cell";
import { createClient } from "@/src/lib/supabase/client";

type RelatedRecord = {
  id: string;
  name: string;
};

type ContactRecord = {
  id: string;
  contact_name: string;
  organization_area: string | null;
  position: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  client_id: string | null;
  supplier_id: string | null;
  notes: string | null;
  active: boolean;
};

type ContactFormState = {
  contact_name: string;
  organization_area: string;
  position: string;
  phone: string;
  whatsapp: string;
  email: string;
  client_id: string;
  supplier_id: string;
  notes: string;
};

type ContactInlineField =
  | "active"
  | "contact_name"
  | "email"
  | "organization_area"
  | "phone"
  | "position"
  | "whatsapp";

const emptyForm: ContactFormState = {
  contact_name: "",
  organization_area: "",
  position: "",
  phone: "",
  whatsapp: "",
  email: "",
  client_id: "",
  supplier_id: "",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeValue(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

function contactMatchesSearch(
  contact: ContactRecord,
  searchValue: string,
  clientsById: Map<string, string>,
  suppliersById: Map<string, string>,
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const clientName = contact.client_id
    ? clientsById.get(contact.client_id)
    : null;
  const supplierName = contact.supplier_id
    ? suppliersById.get(contact.supplier_id)
    : null;

  return [
    contact.contact_name,
    contact.organization_area,
    contact.position,
    contact.phone,
    contact.whatsapp,
    contact.email,
    clientName,
    supplierName,
  ].some((value) => normalizeValue(value).includes(normalizedSearch));
}

function relatedLabel(id: string | null, recordsById: Map<string, string>) {
  if (!id) {
    return "Sin asignar";
  }

  return recordsById.get(id) ?? "No disponible";
}

export function ContactosClient() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<RelatedRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState<RelatedRecord[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client.name])),
    [clients],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );

  const loadContacts = useCallback(
    async (
      activeCompanyId: string,
      searchValue: string,
      currentClientsById: Map<string, string>,
      currentSuppliersById: Map<string, string>,
    ) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id,contact_name,organization_area,position,phone,whatsapp,email,client_id,supplier_id,notes,active",
        )
        .eq("company_id", activeCompanyId)
        .order("contact_name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setContacts([]);
        return;
      }

      setContacts(
        ((data ?? []) as ContactRecord[]).filter((contact) =>
          contactMatchesSearch(
            contact,
            searchValue,
            currentClientsById,
            currentSuppliersById,
          ),
        ),
      );
    },
    [supabase],
  );

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("No se pudo validar la sesión activa.");
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
        setIsLoading(false);
        return;
      }

      if (!profile?.company_id) {
        setErrorMessage("Tu perfil no tiene una empresa asignada.");
        setIsLoading(false);
        return;
      }

      const activeCompanyId = profile.company_id as string;

      const [clientsResult, suppliersResult] = await Promise.all([
        supabase
          .from("clients")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
      ]);

      if (clientsResult.error) {
        setErrorMessage(clientsResult.error.message);
        setIsLoading(false);
        return;
      }

      if (suppliersResult.error) {
        setErrorMessage(suppliersResult.error.message);
        setIsLoading(false);
        return;
      }

      const loadedClients = (clientsResult.data ?? []) as RelatedRecord[];
      const loadedSuppliers = (suppliersResult.data ?? []) as RelatedRecord[];
      const loadedClientsById = new Map(
        loadedClients.map((client) => [client.id, client.name]),
      );
      const loadedSuppliersById = new Map(
        loadedSuppliers.map((supplier) => [supplier.id, supplier.name]),
      );

      setCompanyId(activeCompanyId);
      setClients(loadedClients);
      setSuppliers(loadedSuppliers);
      await loadContacts(activeCompanyId, "", loadedClientsById, loadedSuppliersById);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadContacts, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadContacts(companyId, search, clientsById, suppliersById);
    setIsSearching(false);
  }

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

    if (!form.client_id && !form.supplier_id) {
      setErrorMessage("Selecciona al menos un cliente o un proveedor.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      contact_name: contactName,
      organization_area: cleanOptionalValue(form.organization_area),
      position: cleanOptionalValue(form.position),
      phone: cleanOptionalValue(form.phone),
      whatsapp: cleanOptionalValue(form.whatsapp),
      email: cleanOptionalValue(form.email),
      client_id: form.client_id || null,
      supplier_id: form.supplier_id || null,
      notes: cleanOptionalValue(form.notes),
    };

    const { error } = editingContactId
      ? await supabase
          .from("contacts")
          .update(payload)
          .eq("id", editingContactId)
          .eq("company_id", companyId)
      : await supabase
          .from("contacts")
          .insert({ ...payload, active: true, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingContactId(null);
    setShowCreateForm(false);
    setForm(emptyForm);
    await loadContacts(companyId, search, clientsById, suppliersById);
  }

  function startEditing(contact: ContactRecord) {
    setEditingContactId(contact.id);
    setShowCreateForm(false);
    setForm({
      contact_name: contact.contact_name,
      organization_area: contact.organization_area ?? "",
      position: contact.position ?? "",
      phone: contact.phone ?? "",
      whatsapp: contact.whatsapp ?? "",
      email: contact.email ?? "",
      client_id: contact.client_id ?? "",
      supplier_id: contact.supplier_id ?? "",
      notes: contact.notes ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingContactId(null);
    setForm(emptyForm);
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyForm);
      setErrorMessage("");
      return;
    }

    setEditingContactId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyForm);
    setErrorMessage("");
  }

  async function toggleContactStatus(contact: ContactRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const nextActiveStatus = !contact.active;
    const actionLabel = nextActiveStatus ? "reactivar" : "desactivar";
    const shouldContinue = window.confirm(
      `¿Quieres ${actionLabel} el contacto "${contact.contact_name}"?`,
    );

    if (!shouldContinue) {
      return;
    }

    setIsUpdatingStatusId(contact.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("contacts")
      .update({ active: nextActiveStatus })
      .eq("id", contact.id)
      .eq("company_id", companyId);

    setIsUpdatingStatusId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadContacts(companyId, search, clientsById, suppliersById);
  }

  async function updateContactInline(
    rowId: string,
    field: ContactInlineField,
    value: boolean | string | null,
  ) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      throw new Error("No se encontró la empresa del usuario.");
    }

    setErrorMessage("");

    const { error } = await supabase
      .from("contacts")
      .update({ [field]: value })
      .eq("id", rowId)
      .eq("company_id", companyId);

    if (error) {
      setErrorMessage(error.message);
      throw error;
    }

    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
        contact.id === rowId ? { ...contact, [field]: value } : contact,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingContactId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingContactId ? "Editar contacto" : "Nuevo contacto"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Los contactos se guardan automáticamente en la empresa de tu
              perfil.
            </p>
          </div>
          {editingContactId ? (
            <button
              className="h-10 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              onClick={cancelEditing}
              type="button"
            >
              Cancelar edición
            </button>
          ) : (
            <button
              className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isSaving}
              onClick={toggleCreateForm}
              type="button"
            >
              {showCreateForm ? "Ocultar formulario" : "Nuevo contacto"}
            </button>
          )}
        </div>

        {editingContactId || showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="lg:col-span-2">
            <h4 className="text-base font-semibold text-stone-950">
              {editingContactId ? "Editar contacto" : "Nuevo registro"}
            </h4>
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="contact_name"
            >
              Nombre del contacto
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="contact_name"
              name="contact_name"
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

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="organization_area"
            >
              Área
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="organization_area"
              name="organization_area"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  organization_area: event.target.value,
                }))
              }
              type="text"
              value={form.organization_area}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="position"
            >
              Puesto
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="position"
              name="position"
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
            <label className="text-sm font-medium text-stone-800" htmlFor="phone">
              Teléfono
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="phone"
              name="phone"
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
              htmlFor="whatsapp"
            >
              WhatsApp
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="whatsapp"
              name="whatsapp"
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
            <label className="text-sm font-medium text-stone-800" htmlFor="email">
              Correo
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="email"
              name="email"
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

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="client_id"
            >
              Cliente
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="client_id"
              name="client_id"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  client_id: event.target.value,
                }))
              }
              value={form.client_id}
            >
              <option value="">Sin cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="supplier_id"
            >
              Proveedor
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="supplier_id"
              name="supplier_id"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  supplier_id: event.target.value,
                }))
              }
              value={form.supplier_id}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="notes">
              Notas
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="notes"
              name="notes"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  notes: event.target.value,
                }))
              }
              value={form.notes}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:col-span-2">
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
            {!editingContactId ? (
              <button
                className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={cancelCreate}
                type="button"
              >
                Cancelar
              </button>
            ) : null}
          </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Contactos registrados
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por contacto, área, puesto, teléfono, correo, cliente o
                proveedor.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="contact-search">
                Buscar contacto
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-80"
                  disabled={isLoading || isSearching}
                  id="contact-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar contactos"
                  type="search"
                  value={search}
                />
              </div>
              <button
                className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading || isSearching}
                type="submit"
              >
                {isSearching ? "Buscando..." : "Buscar"}
              </button>
            </form>
          </div>
        </div>

        {errorMessage ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando contactos...
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay contactos para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3">Área</th>
                  <th className="px-5 py-3">Puesto</th>
                  <th className="px-5 py-3">Teléfono</th>
                  <th className="px-5 py-3">WhatsApp</th>
                  <th className="px-5 py-3">Correo</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Proveedor</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      <InlineEditableCell
                        emptyLabel="Sin nombre"
                        label="nombre del contacto"
                        onSave={(value) =>
                          updateContactInline(
                            contact.id,
                            "contact_name",
                            value ?? "",
                          )
                        }
                        required
                        value={contact.contact_name}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <InlineEditableCell
                        emptyLabel="Sin área"
                        label="área"
                        onSave={(value) =>
                          updateContactInline(
                            contact.id,
                            "organization_area",
                            value,
                          )
                        }
                        value={contact.organization_area}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <InlineEditableCell
                        emptyLabel="Sin puesto"
                        label="puesto"
                        onSave={(value) =>
                          updateContactInline(contact.id, "position", value)
                        }
                        value={contact.position}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <InlineEditableCell
                        emptyLabel="Sin teléfono"
                        label="teléfono"
                        onSave={(value) =>
                          updateContactInline(contact.id, "phone", value)
                        }
                        type="tel"
                        value={contact.phone}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <InlineEditableCell
                        emptyLabel="Sin WhatsApp"
                        label="WhatsApp"
                        onSave={(value) =>
                          updateContactInline(contact.id, "whatsapp", value)
                        }
                        type="tel"
                        value={contact.whatsapp}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <InlineEditableCell
                        emptyLabel="Sin correo"
                        label="correo"
                        onSave={(value) =>
                          updateContactInline(contact.id, "email", value)
                        }
                        type="email"
                        value={contact.email}
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {relatedLabel(contact.client_id, clientsById)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {relatedLabel(contact.supplier_id, suppliersById)}
                    </td>
                    <td className="px-5 py-4">
                      <InlineBooleanCell
                        label="estado del contacto"
                        onSave={(value) =>
                          updateContactInline(contact.id, "active", value)
                        }
                        value={contact.active}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isSaving || isUpdatingStatusId === contact.id
                          }
                          onClick={() => startEditing(contact)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className={`h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            contact.active
                              ? "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                          }`}
                          disabled={
                            isSaving || isUpdatingStatusId === contact.id
                          }
                          onClick={() => toggleContactStatus(contact)}
                          type="button"
                        >
                          {isUpdatingStatusId === contact.id
                            ? "Actualizando..."
                            : contact.active
                              ? "Desactivar"
                              : "Reactivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
