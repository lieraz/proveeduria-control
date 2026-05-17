"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ContactosSection } from "../contactos-section";
import { createClient } from "@/src/lib/supabase/client";

type SupplierRecord = {
  id: string;
  name: string;
  rfc: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  categories: string[] | null;
  payment_terms: string | null;
  notes: string | null;
};

type SupplierFormState = {
  name: string;
  rfc: string;
  contact_name: string;
  phone: string;
  email: string;
  categories: string;
  payment_terms: string;
  notes: string;
};

const emptyForm: SupplierFormState = {
  name: "",
  rfc: "",
  contact_name: "",
  phone: "",
  email: "",
  categories: "",
  payment_terms: "",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function parseCategories(value: string) {
  const categories = value
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);

  return categories.length > 0 ? categories : null;
}

function formatCategories(categories: string[] | null) {
  return categories?.join(", ") ?? "";
}

function categoryLabel(categories: string[] | null) {
  return categories && categories.length > 0
    ? categories.join(", ")
    : "Sin categorías";
}

function supplierMatchesSearch(supplier: SupplierRecord, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    supplier.name,
    supplier.contact_name,
    supplier.rfc,
    ...(supplier.categories ?? []),
  ].some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function ProveedoresClient() {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<SupplierFormState>(emptyForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContactsSupplier, setSelectedContactsSupplier] =
    useState<SupplierRecord | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadSuppliers = useCallback(
    async (activeCompanyId: string, searchValue: string) => {
      setErrorMessage("");

      const query = supabase
        .from("suppliers")
        .select(
          "id,name,rfc,contact_name,phone,email,categories,payment_terms,notes",
        )
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      const { data, error } = await query;

      if (error) {
        setErrorMessage(error.message);
        setSuppliers([]);
        return;
      }

      setSuppliers(
        (data ?? []).filter((supplier) =>
          supplierMatchesSearch(supplier, searchValue),
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

      setCompanyId(profile.company_id);
      await loadSuppliers(profile.company_id, "");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadSuppliers, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadSuppliers(companyId, search);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setErrorMessage("El nombre del proveedor es obligatorio.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      name,
      rfc: cleanOptionalValue(form.rfc),
      contact_name: cleanOptionalValue(form.contact_name),
      phone: cleanOptionalValue(form.phone),
      email: cleanOptionalValue(form.email),
      categories: parseCategories(form.categories),
      payment_terms: cleanOptionalValue(form.payment_terms),
      notes: cleanOptionalValue(form.notes),
    };

    const { error } = editingSupplierId
      ? await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", editingSupplierId)
          .eq("company_id", companyId)
      : await supabase
          .from("suppliers")
          .insert({ ...payload, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingSupplierId(null);
    setShowCreateForm(false);
    setSelectedContactsSupplier((currentSupplier) =>
      currentSupplier?.id === editingSupplierId
        ? {
            ...currentSupplier,
            name,
          }
        : currentSupplier,
    );
    setForm(emptyForm);
    await loadSuppliers(companyId, search);
  }

  function startEditing(supplier: SupplierRecord) {
    setEditingSupplierId(supplier.id);
    setShowCreateForm(false);
    setForm({
      name: supplier.name,
      rfc: supplier.rfc ?? "",
      contact_name: supplier.contact_name ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      categories: formatCategories(supplier.categories),
      payment_terms: supplier.payment_terms ?? "",
      notes: supplier.notes ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingSupplierId(null);
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

    setEditingSupplierId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyForm);
    setErrorMessage("");
  }

  async function deleteSupplier(supplier: SupplierRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar el proveedor "${supplier.name}"? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(supplier.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", supplier.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingSupplierId === supplier.id) {
      cancelEditing();
    }

    if (selectedContactsSupplier?.id === supplier.id) {
      setSelectedContactsSupplier(null);
    }

    await loadSuppliers(companyId, search);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingSupplierId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingSupplierId ? "Editar proveedor" : "Nuevo proveedor"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Los proveedores se guardan automáticamente en la empresa de tu
              perfil.
            </p>
          </div>
          {editingSupplierId ? (
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
              {showCreateForm ? "Ocultar formulario" : "Nuevo proveedor"}
            </button>
          )}
        </div>

        {editingSupplierId || showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="lg:col-span-2">
            <h4 className="text-base font-semibold text-stone-950">
              {editingSupplierId ? "Editar proveedor" : "Nuevo registro"}
            </h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="name">
              Nombre
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="name"
              name="name"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  name: event.target.value,
                }))
              }
              required
              type="text"
              value={form.name}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="rfc">
              RFC
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm uppercase text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="rfc"
              name="rfc"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  rfc: event.target.value.toUpperCase(),
                }))
              }
              type="text"
              value={form.rfc}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="contact_name"
            >
              Contacto
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
              type="text"
              value={form.contact_name}
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
              htmlFor="categories"
            >
              Categorías
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="categories"
              name="categories"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  categories: event.target.value,
                }))
              }
              placeholder="Ej. papelería, limpieza, ferretería"
              type="text"
              value={form.categories}
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="payment_terms"
            >
              Términos de pago
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="payment_terms"
              name="payment_terms"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  payment_terms: event.target.value,
                }))
              }
              placeholder="Ej. 30 días, contado, anticipo 50%"
              type="text"
              value={form.payment_terms}
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="notes"
            >
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
                : editingSupplierId
                  ? "Guardar cambios"
                  : "Crear proveedor"}
            </button>
            {!editingSupplierId ? (
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

      {selectedContactsSupplier ? (
        <ContactosSection
          key={selectedContactsSupplier.id}
          companyId={companyId}
          ownerId={selectedContactsSupplier.id}
          ownerIdColumn="supplier_id"
          ownerLabel="proveedor"
          ownerName={selectedContactsSupplier.name}
          onClose={() => setSelectedContactsSupplier(null)}
        />
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Proveedores registrados
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por nombre, contacto, categoría o RFC.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="supplier-search">
                Buscar proveedor
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                  disabled={isLoading || isSearching}
                  id="supplier-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar proveedores"
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
            Cargando proveedores...
          </div>
        ) : suppliers.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay proveedores para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">RFC</th>
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3">Categorías</th>
                  <th className="px-5 py-3">Términos</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {supplier.name}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {supplier.rfc || "Sin RFC"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <div className="space-y-1">
                        <p>{supplier.contact_name || "Sin contacto"}</p>
                        <p className="text-xs text-stone-500">
                          {supplier.email || supplier.phone || "Sin datos"}
                        </p>
                      </div>
                    </td>
                    <td className="max-w-xs px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {categoryLabel(supplier.categories)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {supplier.payment_terms || "Sin términos"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                          href={`/dashboard/proveedores/${supplier.id}`}
                        >
                          Ver cotizados
                        </Link>
                        <button
                          className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === supplier.id}
                          onClick={() => setSelectedContactsSupplier(supplier)}
                          type="button"
                        >
                          Ver contactos
                        </button>
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === supplier.id}
                          onClick={() => startEditing(supplier)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === supplier.id}
                          onClick={() => deleteSupplier(supplier)}
                          type="button"
                        >
                          {isDeletingId === supplier.id
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
      </section>
    </div>
  );
}
