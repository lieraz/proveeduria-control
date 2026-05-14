"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ContactosSection } from "../contactos-section";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string;
  notes: string | null;
  payment_terms: string | null;
  rfc: string | null;
};

type ClientFormState = {
  name: string;
  notes: string;
  payment_terms: string;
  rfc: string;
};

const emptyForm: ClientFormState = {
  name: "",
  notes: "",
  payment_terms: "",
  rfc: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function ClientesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContactsClient, setSelectedContactsClient] =
    useState<ClientRecord | null>(null);

  const loadClients = useCallback(
    async (activeCompanyId: string, searchValue: string) => {
      setErrorMessage("");

      const trimmedSearch = searchValue.trim();
      let query = supabase
        .from("clients")
        .select("id,name,rfc,payment_terms,notes")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (trimmedSearch) {
        query = query.ilike("name", `%${trimmedSearch}%`);
      }

      const { data, error } = await query;

      if (error) {
        setErrorMessage(error.message);
        setClients([]);
        return;
      }

      setClients(data ?? []);
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
      await loadClients(profile.company_id, "");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadClients, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadClients(companyId, search);
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
      setErrorMessage("El nombre del cliente es obligatorio.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      name,
      notes: cleanOptionalValue(form.notes),
      payment_terms: cleanOptionalValue(form.payment_terms),
      rfc: cleanOptionalValue(form.rfc),
    };

    const { error } = editingClientId
      ? await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingClientId)
          .eq("company_id", companyId)
      : await supabase
          .from("clients")
          .insert({ ...payload, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingClientId(null);
    setSelectedContactsClient((currentClient) =>
      currentClient?.id === editingClientId
        ? {
            ...currentClient,
            name,
          }
        : currentClient,
    );
    setForm(emptyForm);
    await loadClients(companyId, search);
  }

  function startEditing(client: ClientRecord) {
    setEditingClientId(client.id);
    setForm({
      name: client.name,
      notes: client.notes ?? "",
      payment_terms: client.payment_terms ?? "",
      rfc: client.rfc ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingClientId(null);
    setForm(emptyForm);
    setErrorMessage("");
  }

  async function deleteClient(client: ClientRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar el cliente "${client.name}"? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(client.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", client.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingClientId === client.id) {
      cancelEditing();
    }

    if (selectedContactsClient?.id === client.id) {
      setSelectedContactsClient(null);
    }

    await loadClients(companyId, search);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingClientId ? "Editar cliente" : "Nuevo cliente"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Los clientes se guardan automáticamente en la empresa de tu
              perfil.
            </p>
          </div>
          {editingClientId ? (
            <button
              className="h-10 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              onClick={cancelEditing}
              type="button"
            >
              Cancelar edición
            </button>
          ) : null}
        </div>

        <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSubmit}>
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
                : editingClientId
                  ? "Guardar cambios"
                  : "Crear cliente"}
            </button>
          </div>
        </form>
      </section>

      {selectedContactsClient ? (
        <ContactosSection
          key={selectedContactsClient.id}
          companyId={companyId}
          ownerId={selectedContactsClient.id}
          ownerIdColumn="client_id"
          ownerLabel="cliente"
          ownerName={selectedContactsClient.name}
          onClose={() => setSelectedContactsClient(null)}
        />
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Clientes registrados
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por nombre o revisa el catálogo completo.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="client-search">
                Buscar cliente por nombre
              </label>
              <input
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                disabled={isLoading || isSearching}
                id="client-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre"
                type="search"
                value={search}
              />
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
            Cargando clientes...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay clientes para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">RFC</th>
                  <th className="px-5 py-3">Términos de pago</th>
                  <th className="px-5 py-3">Notas</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {client.name}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {client.rfc || "Sin RFC"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {client.payment_terms || "Sin términos"}
                    </td>
                    <td className="max-w-xs px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {client.notes || "Sin notas"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === client.id}
                          onClick={() => setSelectedContactsClient(client)}
                          type="button"
                        >
                          Ver contactos
                        </button>
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === client.id}
                          onClick={() => startEditing(client)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === client.id}
                          onClick={() => deleteClient(client)}
                          type="button"
                        >
                          {isDeletingId === client.id
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
