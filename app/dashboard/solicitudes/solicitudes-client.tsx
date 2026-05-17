"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string;
};

type ContactRecord = {
  id: string;
  client_id: string | null;
  contact_name?: string | null;
  organization_area?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
};

type RequestRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
  requested_at: string | null;
  requested_by: string | null;
  channel: string | null;
  description: string | null;
  urgency: string | null;
  status: string | null;
  notes: string | null;
};

type RequestFormState = {
  client_id: string;
  contact_ref_id: string;
  requested_at: string;
  requested_by: string;
  channel: string;
  description: string;
  urgency: string;
  status: string;
  notes: string;
};

type RequestLineCountRecord = {
  client_request_id: string | null;
};

const channelOptions = ["whatsapp", "email", "telefono", "presencial", "otro"];
const urgencyOptions = ["normal", "urgente", "muy urgente"];
const statusOptions = [
  "nueva",
  "cotizando",
  "cotizada",
  "aprobada",
  "rechazada",
  "cerrada",
];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): RequestFormState {
  return {
    client_id: "",
    contact_ref_id: "",
    requested_at: todayDate(),
    requested_by: "",
    channel: "whatsapp",
    description: "",
    urgency: "normal",
    status: "nueva",
    notes: "",
  };
}

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) {
    return "Sin contacto";
  }

  const name = contact.contact_name ?? "Sin nombre";
  const details = [contact.organization_area, contact.position].filter(Boolean);

  return details.length > 0 ? `${name} - ${details.join(" - ")}` : name;
}

function ContactSummary({ contact }: { contact: ContactRecord | undefined }) {
  if (!contact) {
    return "Sin contacto";
  }

  return (
    <div className="space-y-1">
      <p className="font-medium text-stone-800">
        {contact.contact_name || "Sin nombre"}
      </p>
      {contact.organization_area ? (
        <p className="text-xs text-stone-500">{contact.organization_area}</p>
      ) : null}
      {contact.position ? (
        <p className="text-xs text-stone-500">{contact.position}</p>
      ) : null}
    </div>
  );
}

function sortContacts(contactsToSort: ContactRecord[]) {
  return [...contactsToSort].sort((firstContact, secondContact) =>
    contactLabel(firstContact).localeCompare(contactLabel(secondContact)),
  );
}

function requestMatchesSearch(
  request: RequestRecord,
  searchValue: string,
  clientsById: Map<string, ClientRecord>,
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const clientName = request.client_id
    ? clientsById.get(request.client_id)?.name
    : null;

  return [
    request.folio,
    clientName,
    request.requested_by,
    request.description,
    request.status,
  ].some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function SolicitudesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingFolio, setEditingFolio] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<RequestFormState>(emptyForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [lineCountsByRequestId, setLineCountsByRequestId] = useState<
    Map<string, number>
  >(new Map());
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );
  const filteredContacts = useMemo(
    () =>
      contacts.filter((contact) => contact.client_id === form.client_id),
    [contacts, form.client_id],
  );

  const loadRequests = useCallback(
    async (
      activeCompanyId: string,
      searchValue: string,
      activeClientsById: Map<string, ClientRecord>,
    ) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("client_requests")
        .select(
          "id,folio,client_id,contact_ref_id,requested_at,requested_by,channel,description,urgency,status,notes",
        )
        .eq("company_id", activeCompanyId)
        .order("requested_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setRequests([]);
        setLineCountsByRequestId(new Map());
        return;
      }

      const loadedRequests = ((data ?? []) as RequestRecord[]).filter((request) =>
          requestMatchesSearch(request, searchValue, activeClientsById),
      );
      setRequests(loadedRequests);

      const requestIds = loadedRequests.map((request) => request.id);

      if (requestIds.length === 0) {
        setLineCountsByRequestId(new Map());
        return;
      }

      const { data: linesData, error: linesError } = await supabase
        .from("client_request_lines")
        .select("client_request_id")
        .eq("company_id", activeCompanyId)
        .in("client_request_id", requestIds);

      if (linesError) {
        setErrorMessage(linesError.message);
        setLineCountsByRequestId(new Map());
        return;
      }

      const nextCounts = new Map<string, number>();
      ((linesData ?? []) as RequestLineCountRecord[]).forEach((line) => {
        if (!line.client_request_id) {
          return;
        }

        nextCounts.set(
          line.client_request_id,
          (nextCounts.get(line.client_request_id) ?? 0) + 1,
        );
      });
      setLineCountsByRequestId(nextCounts);
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

      const activeCompanyId = profile.company_id;
      setCompanyId(activeCompanyId);

      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("id,name")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (clientsError) {
        setErrorMessage(clientsError.message);
        setIsLoading(false);
        return;
      }

      const loadedClients = (clientsData ?? []) as ClientRecord[];
      const loadedClientsById = new Map(
        loadedClients.map((client) => [client.id, client]),
      );
      setClients(loadedClients);

      const clientIds = loadedClients.map((client) => client.id);

      if (clientIds.length > 0) {
        const { data: contactsData, error: contactsError } = await supabase
          .from("contacts")
          .select("id,client_id,contact_name,organization_area,position,email,phone")
          .eq("company_id", activeCompanyId)
          .eq("active", true)
          .in("client_id", clientIds);

        if (contactsError) {
          setErrorMessage(contactsError.message);
          setIsLoading(false);
          return;
        }

        setContacts(sortContacts((contactsData ?? []) as ContactRecord[]));
      } else {
        setContacts([]);
      }

      await loadRequests(activeCompanyId, "", loadedClientsById);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadRequests, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadRequests(companyId, search, clientsById);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (!form.client_id) {
      setErrorMessage("El cliente es obligatorio.");
      return;
    }

    if (!form.requested_at) {
      setErrorMessage("La fecha de solicitud es obligatoria.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      client_id: form.client_id,
      contact_ref_id: cleanOptionalValue(form.contact_ref_id),
      requested_at: form.requested_at,
      requested_by: cleanOptionalValue(form.requested_by),
      channel: form.channel,
      description: cleanOptionalValue(form.description),
      urgency: form.urgency,
      status: form.status,
      notes: cleanOptionalValue(form.notes),
    };

    const { error } = editingRequestId
      ? await supabase
          .from("client_requests")
          .update(payload)
          .eq("id", editingRequestId)
          .eq("company_id", companyId)
      : await supabase
          .from("client_requests")
          .insert({ ...payload, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingRequestId(null);
    setEditingFolio(null);
    setShowCreateForm(false);
    setForm(emptyForm());
    await loadRequests(companyId, search, clientsById);
  }

  function startEditing(request: RequestRecord) {
    setEditingRequestId(request.id);
    setEditingFolio(request.folio);
    setShowCreateForm(false);
    setForm({
      client_id: request.client_id ?? "",
      contact_ref_id: request.contact_ref_id ?? "",
      requested_at: formatDate(request.requested_at),
      requested_by: request.requested_by ?? "",
      channel: channelOptions.includes(request.channel ?? "")
        ? request.channel ?? "whatsapp"
        : "otro",
      description: request.description ?? "",
      urgency: urgencyOptions.includes(request.urgency ?? "")
        ? request.urgency ?? "normal"
        : "normal",
      status: statusOptions.includes(request.status ?? "")
        ? request.status ?? "nueva"
        : "nueva",
      notes: request.notes ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingRequestId(null);
    setEditingFolio(null);
    setForm(emptyForm());
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyForm());
      setErrorMessage("");
      return;
    }

    setEditingRequestId(null);
    setEditingFolio(null);
    setForm(emptyForm());
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyForm());
    setErrorMessage("");
  }

  async function deleteRequest(request: RequestRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const requestLabel = request.folio || "sin folio";
    const shouldDelete = window.confirm(
      `¿Eliminar la solicitud "${requestLabel}"? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(request.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("client_requests")
      .delete()
      .eq("id", request.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingRequestId === request.id) {
      cancelEditing();
    }

    await loadRequests(companyId, search, clientsById);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingRequestId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingRequestId ? "Editar solicitud" : "Nueva solicitud"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Las solicitudes se guardan automáticamente en la empresa de tu
              perfil.
            </p>
          </div>
          {editingRequestId ? (
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
              {showCreateForm ? "Ocultar formulario" : "Nueva solicitud"}
            </button>
          )}
        </div>

        {editingRequestId || showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="lg:col-span-2">
            <h4 className="text-base font-semibold text-stone-950">
              {editingRequestId ? "Editar solicitud" : "Nuevo registro"}
            </h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="folio">
              Folio
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-stone-100 px-3 text-sm text-stone-600 outline-none disabled:cursor-not-allowed"
              disabled
              id="folio"
              name="folio"
              readOnly
              type="text"
              value={editingFolio ?? "Se generará al guardar"}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="requested_at"
            >
              Fecha de solicitud
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="requested_at"
              name="requested_at"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  requested_at: event.target.value,
                }))
              }
              required
              type="date"
              value={form.requested_at}
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
                  contact_ref_id: "",
                }))
              }
              required
              value={form.client_id}
            >
              <option value="">Selecciona un cliente</option>
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
              htmlFor="contact_ref_id"
            >
              Dependencia/contacto
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving || !form.client_id}
              id="contact_ref_id"
              name="contact_ref_id"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  contact_ref_id: event.target.value,
                }))
              }
              value={form.contact_ref_id}
            >
              <option value="">Sin contacto</option>
              {filteredContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="requested_by"
            >
              Solicitado por
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="requested_by"
              name="requested_by"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  requested_by: event.target.value,
                }))
              }
              type="text"
              value={form.requested_by}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="channel"
            >
              Canal
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="channel"
              name="channel"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  channel: event.target.value,
                }))
              }
              value={form.channel}
            >
              {channelOptions.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="urgency"
            >
              Urgencia
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="urgency"
              name="urgency"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  urgency: event.target.value,
                }))
              }
              value={form.urgency}
            >
              {urgencyOptions.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {urgency}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="status"
            >
              Estado
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="status"
              name="status"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  status: event.target.value,
                }))
              }
              value={form.status}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="description"
            >
              Descripción
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="description"
              name="description"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  description: event.target.value,
                }))
              }
              value={form.description}
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
                : editingRequestId
                  ? "Guardar cambios"
                  : "Crear solicitud"}
            </button>
            {!editingRequestId ? (
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
                Solicitudes registradas
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por folio, cliente, solicitante, descripción o estado.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="request-search">
                Buscar solicitud
              </label>
              <input
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                disabled={isLoading || isSearching}
                id="request-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar solicitudes"
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
            Cargando solicitudes...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay solicitudes para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Folio</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Dependencia/contacto</th>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Solicitado por</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-5 py-3">Urgencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Partidas</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      <Link
                        className="text-emerald-800 hover:text-emerald-950 hover:underline"
                        href={`/dashboard/solicitudes/${request.id}`}
                      >
                        {request.folio || "Sin folio"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {request.client_id
                        ? clientsById.get(request.client_id)?.name ??
                          "Cliente no disponible"
                        : "Sin cliente"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <ContactSummary
                        contact={
                          request.contact_ref_id
                            ? contactsById.get(request.contact_ref_id)
                            : undefined
                        }
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(request.requested_at)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {request.requested_by || "Sin solicitante"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {request.channel || "Sin canal"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          request.urgency === "muy urgente"
                            ? "bg-red-50 text-red-700"
                            : request.urgency === "urgente"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {request.urgency || "normal"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                        {request.status || "nueva"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {lineCountsByRequestId.get(request.id) ?? 0}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                          href={`/dashboard/solicitudes/${request.id}`}
                        >
                          Ver detalle
                        </Link>
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === request.id}
                          onClick={() => startEditing(request)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === request.id}
                          onClick={() => deleteRequest(request)}
                          type="button"
                        >
                          {isDeletingId === request.id
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
