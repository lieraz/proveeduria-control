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
};

type RequestRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
  description?: string | null;
};

type QuotationRecord = {
  id: string;
  folio: string | null;
  request_id: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
  quoted_at: string | null;
  valid_until: string | null;
  status: string | null;
};

type QuotationLineRecord = {
  quotation_id: string | null;
  line_total: number | string | null;
  selected: boolean | null;
};

type QuotationFormState = {
  request_id: string;
  client_id: string;
  contact_ref_id: string;
  quoted_at: string;
  valid_until: string;
  status: string;
};

const statusOptions = [
  "borrador",
  "enviada",
  "aprobada",
  "rechazada",
  "cancelada",
];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): QuotationFormState {
  return {
    request_id: "",
    client_id: "",
    contact_ref_id: "",
    quoted_at: todayDate(),
    valid_until: "",
    status: "borrador",
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(value);
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
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

function requestLabel(request: RequestRecord) {
  const description = request.description ? ` - ${request.description}` : "";
  return `${request.folio || "Sin folio"}${description}`;
}

function quotationMatchesSearch(
  quotation: QuotationRecord,
  searchValue: string,
  clientsById: Map<string, ClientRecord>,
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const clientName = quotation.client_id
    ? clientsById.get(quotation.client_id)?.name
    : null;

  return [quotation.folio, clientName, quotation.status].some((value) =>
    value?.toLowerCase().includes(normalizedSearch),
  );
}

export function CotizacionesClient() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingFolio, setEditingFolio] = useState<string | null>(null);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<QuotationFormState>(emptyForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [search, setSearch] = useState("");
  const [totalsByQuotationId, setTotalsByQuotationId] = useState<
    Map<string, number>
  >(new Map());
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
    () => contacts.filter((contact) => contact.client_id === form.client_id),
    [contacts, form.client_id],
  );

  const loadQuotations = useCallback(
    async (
      activeCompanyId: string,
      searchValue: string,
      activeClientsById: Map<string, ClientRecord>,
    ) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("quotations")
        .select(
          "id,folio,request_id,client_id,contact_ref_id,quoted_at,valid_until,status",
        )
        .eq("company_id", activeCompanyId)
        .order("quoted_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setQuotations([]);
        setTotalsByQuotationId(new Map());
        return;
      }

      const loadedQuotations = ((data ?? []) as QuotationRecord[]).filter(
        (quotation) =>
          quotationMatchesSearch(quotation, searchValue, activeClientsById),
      );
      setQuotations(loadedQuotations);

      const quotationIds = loadedQuotations.map((quotation) => quotation.id);

      if (quotationIds.length === 0) {
        setTotalsByQuotationId(new Map());
        return;
      }

      const { data: linesData, error: linesError } = await supabase
        .from("quotation_lines")
        .select("quotation_id,line_total,selected")
        .eq("company_id", activeCompanyId)
        .in("quotation_id", quotationIds);

      if (linesError) {
        setErrorMessage(linesError.message);
        setTotalsByQuotationId(new Map());
        return;
      }

      const nextTotals = new Map<string, number>();
      ((linesData ?? []) as QuotationLineRecord[]).forEach((line) => {
        if (!line.selected || !line.quotation_id) {
          return;
        }

        nextTotals.set(
          line.quotation_id,
          (nextTotals.get(line.quotation_id) ?? 0) + toNumber(line.line_total),
        );
      });
      setTotalsByQuotationId(nextTotals);
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
          .select("id,client_id,contact_name,organization_area,position")
          .eq("company_id", activeCompanyId)
          .eq("active", true)
          .in("client_id", clientIds);

        if (contactsError) {
          setErrorMessage(contactsError.message);
          setIsLoading(false);
          return;
        }

        setContacts((contactsData ?? []) as ContactRecord[]);
      }

      const { data: requestsData, error: requestsError } = await supabase
        .from("client_requests")
        .select("id,folio,client_id,contact_ref_id,description")
        .eq("company_id", activeCompanyId)
        .order("requested_at", { ascending: false });

      if (requestsError) {
        setErrorMessage(requestsError.message);
        setIsLoading(false);
        return;
      }

      setRequests((requestsData ?? []) as RequestRecord[]);
      await loadQuotations(activeCompanyId, "", loadedClientsById);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadQuotations, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadQuotations(companyId, search, clientsById);
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

    if (!form.quoted_at) {
      setErrorMessage("La fecha de cotización es obligatoria.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      client_id: form.client_id,
      contact_ref_id: cleanOptionalValue(form.contact_ref_id),
      quoted_at: form.quoted_at,
      request_id: cleanOptionalValue(form.request_id),
      status: form.status,
      valid_until: cleanOptionalValue(form.valid_until),
    };

    const { error } = editingQuotationId
      ? await supabase
          .from("quotations")
          .update(payload)
          .eq("id", editingQuotationId)
          .eq("company_id", companyId)
      : await supabase
          .from("quotations")
          .insert({ ...payload, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingQuotationId(null);
    setEditingFolio(null);
    setShowCreateForm(false);
    setForm(emptyForm());
    await loadQuotations(companyId, search, clientsById);
  }

  function handleRequestChange(requestId: string) {
    const selectedRequest = requests.find((request) => request.id === requestId);

    setForm((currentForm) => ({
      ...currentForm,
      request_id: requestId,
      client_id: selectedRequest?.client_id ?? currentForm.client_id,
      contact_ref_id: selectedRequest?.contact_ref_id ?? "",
    }));
  }

  function startEditing(quotation: QuotationRecord) {
    setEditingQuotationId(quotation.id);
    setEditingFolio(quotation.folio);
    setShowCreateForm(false);
    setForm({
      request_id: quotation.request_id ?? "",
      client_id: quotation.client_id ?? "",
      contact_ref_id: quotation.contact_ref_id ?? "",
      quoted_at: formatDate(quotation.quoted_at),
      valid_until: quotation.valid_until ? formatDate(quotation.valid_until) : "",
      status: statusOptions.includes(quotation.status ?? "")
        ? quotation.status ?? "borrador"
        : "borrador",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingQuotationId(null);
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

    setEditingQuotationId(null);
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

  async function deleteQuotation(quotation: QuotationRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const quotationLabel = quotation.folio || "sin folio";
    const shouldDelete = window.confirm(
      `¿Eliminar la cotización "${quotationLabel}"? Esta acción no se puede deshacer.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(quotation.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotations")
      .delete()
      .eq("id", quotation.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingQuotationId === quotation.id) {
      cancelEditing();
    }

    await loadQuotations(companyId, search, clientsById);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingQuotationId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingQuotationId ? "Editar cotización" : "Nueva cotización"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              El folio y la empresa se asignan automáticamente al guardar.
            </p>
          </div>
          {editingQuotationId ? (
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
              {showCreateForm ? "Ocultar formulario" : "Nueva cotización"}
            </button>
          )}
        </div>

        {editingQuotationId || showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="lg:col-span-2">
            <h4 className="text-base font-semibold text-stone-950">
              {editingQuotationId ? "Editar cotización" : "Nuevo registro"}
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
              readOnly
              type="text"
              value={editingFolio ?? "Se generará al guardar"}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="request_id"
            >
              Solicitud relacionada
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="request_id"
              onChange={(event) => handleRequestChange(event.target.value)}
              value={form.request_id}
            >
              <option value="">Sin solicitud</option>
              {requests.map((request) => (
                <option key={request.id} value={request.id}>
                  {requestLabel(request)}
                </option>
              ))}
            </select>
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
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  client_id: event.target.value,
                  contact_ref_id: "",
                  request_id: "",
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
              htmlFor="quoted_at"
            >
              Fecha de cotización
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="quoted_at"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  quoted_at: event.target.value,
                }))
              }
              required
              type="date"
              value={form.quoted_at}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="valid_until"
            >
              Vigencia
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="valid_until"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  valid_until: event.target.value,
                }))
              }
              type="date"
              value={form.valid_until}
            />
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

          <div className="flex flex-col gap-3 sm:flex-row lg:col-span-2">
            <button
              className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving
                ? "Guardando..."
                : editingQuotationId
                  ? "Guardar cambios"
                  : "Crear cotización"}
            </button>
            {!editingQuotationId ? (
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
                Cotizaciones registradas
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por folio, cliente o estado.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="quotation-search">
                Buscar cotización
              </label>
              <input
                className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                disabled={isLoading || isSearching}
                id="quotation-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cotizaciones"
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
            Cargando cotizaciones...
          </div>
        ) : quotations.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay cotizaciones para mostrar.
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
                  <th className="px-5 py-3">Vigencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {quotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      <Link
                        className="text-emerald-800 hover:text-emerald-950 hover:underline"
                        href={`/dashboard/cotizaciones/${quotation.id}`}
                      >
                        {quotation.folio || "Sin folio"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {quotation.client_id
                        ? clientsById.get(quotation.client_id)?.name ??
                          "Cliente no disponible"
                        : "Sin cliente"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      <ContactSummary
                        contact={
                          quotation.contact_ref_id
                            ? contactsById.get(quotation.contact_ref_id)
                            : undefined
                        }
                      />
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(quotation.quoted_at)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(quotation.valid_until)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                        {quotation.status || "borrador"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-stone-950">
                      {formatMoney(totalsByQuotationId.get(quotation.id) ?? 0)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                          href={`/dashboard/cotizaciones/${quotation.id}`}
                        >
                          Ver detalle
                        </Link>
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === quotation.id}
                          onClick={() => startEditing(quotation)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeletingId === quotation.id}
                          onClick={() => deleteQuotation(quotation)}
                          type="button"
                        >
                          {isDeletingId === quotation.id
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
