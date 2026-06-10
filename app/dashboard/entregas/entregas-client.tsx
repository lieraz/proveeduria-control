"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  ArchiveBadge,
  ArchiveFilter,
  ArchiveFilterToggle,
  BulkArchiveActionBar,
} from "@/app/dashboard/archive-controls";
import { DELIVERY_STATUSES, DELIVERY_TYPES } from "@/app/dashboard/statuses";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = { id: string; name: string | null };
type ContactRecord = { id: string; client_id: string | null; contact_name: string | null; organization_area: string | null; phone: string | null; email: string | null };
type QuotationRecord = { id: string; folio: string | null; client_id: string | null };
type InternalOrderRecord = { id: string; folio: string | null; quotation_id: string | null; status: string | null; archived_at?: string | null };
type InternalOrderLineRecord = {
  id: string;
  internal_order_id: string | null;
  product_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | string | null;
  unit: string | null;
  notes: string | null;
};
type DeliveryRecord = {
  id: string;
  internal_order_id: string | null;
  delivery_type: string | null;
  scheduled_date: string | null;
  delivered_at: string | null;
  contact_id: string | null;
  delivery_address: string | null;
  delivered_by: string | null;
  received_by: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

type DeliveryFormState = {
  internal_order_id: string;
  delivery_type: string;
  scheduled_date: string;
  delivered_at: string;
  contact_id: string;
  delivery_address: string;
  delivered_by: string;
  received_by: string;
  status: string;
  notes: string;
};

type PartialLineState = Record<string, { deliveredQuantity: string; selected: boolean }>;

const emptyForm: DeliveryFormState = {
  internal_order_id: "",
  delivery_type: "total",
  scheduled_date: "",
  delivered_at: "",
  contact_id: "",
  delivery_address: "",
  delivered_by: "",
  received_by: "",
  status: "pendiente",
  notes: "",
};
const inputClass = "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}
function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
function optionalNumber(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  if (cleanedValue === null) return null;
  const parsedValue = Number(cleanedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return value.replace("T", " ").slice(0, 16);
}
function shortDeliveryId(value: string) {
  return `Entrega ${value.slice(0, 8)}`;
}
function normalize(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}
function badgeClass(value: string | null | undefined) {
  if (value === "entregado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "parcial") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function deliveryStatusFor(quantity: number, deliveredQuantity: number) {
  if (deliveredQuantity >= quantity && quantity > 0) return "entregado";
  if (deliveredQuantity > 0) return "parcial";
  return "pendiente";
}

export function EntregasClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<DeliveryFormState>(emptyForm);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [orderLines, setOrderLines] = useState<InternalOrderLineRecord[]>([]);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [partialLines, setPartialLines] = useState<PartialLineState>({});
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const quotationsById = useMemo(() => new Map(quotations.map((quotation) => [quotation.id, quotation])), [quotations]);
  const selectedOrder = form.internal_order_id ? ordersById.get(form.internal_order_id) : undefined;
  const selectedQuotation = selectedOrder?.quotation_id ? quotationsById.get(selectedOrder.quotation_id) : undefined;
  const selectedClientId = selectedQuotation?.client_id ?? null;
  const availableContacts = useMemo(
    () => contacts.filter((contact) => !selectedClientId || contact.client_id === selectedClientId),
    [contacts, selectedClientId],
  );
  const selectedDeliveries = useMemo(
    () => deliveries.filter((delivery) => selectedDeliveryIds.has(delivery.id)),
    [deliveries, selectedDeliveryIds],
  );
  const selectedArchivedDeliveryIds = useMemo(
    () => selectedDeliveries.filter((delivery) => delivery.archived_at).map((delivery) => delivery.id),
    [selectedDeliveries],
  );
  const selectedActiveDeliveryIds = useMemo(
    () => selectedDeliveries.filter((delivery) => !delivery.archived_at).map((delivery) => delivery.id),
    [selectedDeliveries],
  );
  const areAllVisibleDeliveriesSelected =
    deliveries.length > 0 && deliveries.every((delivery) => selectedDeliveryIds.has(delivery.id));

  const clientNameForOrder = useCallback((order: InternalOrderRecord | undefined) => {
    if (!order) return "Sin orden";
    if (!order.quotation_id) return "Orden manual";
    const quotation = quotationsById.get(order.quotation_id);
    return quotation?.client_id ? clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible" : "Cliente no disponible";
  }, [clientsById, quotationsById]);

  const filteredDeliveries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return deliveries;
    return deliveries.filter((delivery) => {
      const order = delivery.internal_order_id ? ordersById.get(delivery.internal_order_id) : undefined;
      const clientName = clientNameForOrder(order);
      return [
        delivery.id,
        order?.folio,
        clientName,
        delivery.received_by,
        delivery.delivered_by,
        delivery.status,
      ].some((value) => normalize(value).includes(normalizedSearch));
    });
  }, [clientNameForOrder, deliveries, ordersById, search]);

  const loadDeliveries = useCallback(async (activeCompanyId: string, activeArchiveFilter: ArchiveFilter) => {
    setErrorMessage("");
    let query = supabase
      .from("deliveries")
      .select("id,internal_order_id,delivery_type,scheduled_date,delivered_at,contact_id,delivery_address,delivered_by,received_by,status,notes,created_at,archived_at,archived_by,archive_reason")
      .eq("company_id", activeCompanyId)
      .order("created_at", { ascending: false });

    if (activeArchiveFilter === "active") query = query.is("archived_at", null);
    if (activeArchiveFilter === "archived") query = query.not("archived_at", "is", null);

    const { data, error } = await query;
    if (error) {
      setErrorMessage(error.message);
      setDeliveries([]);
      return;
    }
    setDeliveries((data ?? []) as DeliveryRecord[]);
  }, [supabase]);

  const loadOrderLines = useCallback(async (activeCompanyId: string, orderId: string) => {
    if (!orderId) {
      setOrderLines([]);
      setPartialLines({});
      return;
    }

    const { data, error } = await supabase
      .from("internal_order_lines")
      .select("id,internal_order_id,product_id,product_description,brand,model,quantity,unit,notes")
      .eq("company_id", activeCompanyId)
      .eq("internal_order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setOrderLines([]);
      setPartialLines({});
      return;
    }

    const loadedLines = (data ?? []) as InternalOrderLineRecord[];
    setOrderLines(loadedLines);
    setPartialLines(Object.fromEntries(loadedLines.map((line) => [line.id, { deliveredQuantity: String(toNumber(line.quantity)), selected: true }])));
  }, [supabase]);

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

      const { data: profile, error: profileError } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profileError || !profile?.company_id) {
        setErrorMessage(profileError?.message ?? "Tu perfil no tiene una empresa asignada.");
        setIsLoading(false);
        return;
      }

      const activeCompanyId = profile.company_id as string;
      setCompanyId(activeCompanyId);
      const [ordersResponse, quotationsResponse, clientsResponse, contactsResponse] = await Promise.all([
        supabase.from("internal_orders").select("id,folio,quotation_id,status,archived_at").eq("company_id", activeCompanyId).order("created_at", { ascending: false }),
        supabase.from("quotations").select("id,folio,client_id").eq("company_id", activeCompanyId),
        supabase.from("clients").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase.from("contacts").select("id,client_id,contact_name,organization_area,phone,email").eq("company_id", activeCompanyId).eq("active", true).order("contact_name", { ascending: true }),
      ]);
      const firstError = ordersResponse.error ?? quotationsResponse.error ?? clientsResponse.error ?? contactsResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      setQuotations((quotationsResponse.data ?? []) as QuotationRecord[]);
      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      await loadDeliveries(activeCompanyId, "active");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadDeliveries, supabase]);

  async function handleOrderChange(orderId: string) {
    setForm((currentForm) => ({ ...currentForm, contact_id: "", internal_order_id: orderId }));
    if (companyId) await loadOrderLines(companyId, orderId);
  }

  async function handleArchiveFilterChange(nextFilter: ArchiveFilter) {
    setArchiveFilter(nextFilter);
    setSelectedDeliveryIds(new Set());
    if (companyId) await loadDeliveries(companyId, nextFilter);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    if (companyId) await loadDeliveries(companyId, archiveFilter);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }
    if (!form.internal_order_id) {
      setErrorMessage("Selecciona una orden interna.");
      return;
    }
    if (form.delivery_type !== "manual" && orderLines.length === 0) {
      setErrorMessage("La orden no tiene partidas para copiar.");
      return;
    }

    const selectedLines = form.delivery_type === "total"
      ? orderLines
      : orderLines.filter((line) => partialLines[line.id]?.selected);
    if (form.delivery_type === "parcial" && selectedLines.length === 0) {
      setErrorMessage("Selecciona al menos una partida para la entrega parcial.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const headerPayload = {
      company_id: companyId,
      contact_id: cleanOptionalValue(form.contact_id),
      delivered_at: cleanOptionalValue(form.delivered_at),
      delivered_by: cleanOptionalValue(form.delivered_by),
      delivery_address: cleanOptionalValue(form.delivery_address),
      delivery_type: form.delivery_type,
      internal_order_id: form.internal_order_id,
      notes: cleanOptionalValue(form.notes),
      received_by: cleanOptionalValue(form.received_by),
      scheduled_date: cleanOptionalValue(form.scheduled_date),
      status: form.delivery_type === "total" ? "entregado" : form.status,
    };

    const { data: deliveryData, error: deliveryError } = await supabase
      .from("deliveries")
      .insert(headerPayload)
      .select("id")
      .single();

    if (deliveryError || !deliveryData) {
      setIsSaving(false);
      setErrorMessage(deliveryError?.message ?? "No se pudo crear la entrega.");
      return;
    }

    if (form.delivery_type !== "manual") {
      const { error: linesError } = await supabase.from("delivery_lines").insert(
        selectedLines.map((line) => {
          const quantity = toNumber(line.quantity);
          const deliveredQuantity = form.delivery_type === "total"
            ? quantity
            : optionalNumber(partialLines[line.id]?.deliveredQuantity ?? "") ?? 0;
          return {
            brand: line.brand,
            company_id: companyId,
            delivered_quantity: deliveredQuantity,
            delivery_id: deliveryData.id,
            internal_order_line_id: line.id,
            model: line.model,
            notes: line.notes,
            product_description: line.product_description,
            product_id: line.product_id,
            quantity,
            status: deliveryStatusFor(quantity, deliveredQuantity),
            unit: line.unit || "pieza",
          };
        }),
      );

      if (linesError) {
        setIsSaving(false);
        setErrorMessage(linesError.message);
        return;
      }
    }

    setIsSaving(false);
    setForm(emptyForm);
    setOrderLines([]);
    setPartialLines({});
    setShowCreateForm(false);
    setSuccessMessage("Entrega creada correctamente.");
    router.push(`/dashboard/entregas/${deliveryData.id}`);
  }

  async function archiveDeliveries(deliveryIds: string[]) {
    if (!companyId || deliveryIds.length === 0) return;
    const shouldArchive = window.confirm("¿Archivar las entregas seleccionadas?");
    if (!shouldArchive) return;
    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setIsArchiveUpdating(false);
      setErrorMessage("No se pudo validar la sesión activa.");
      return;
    }
    const { error } = await supabase
      .from("deliveries")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id, archive_reason: "Archivado manualmente" })
      .eq("company_id", companyId)
      .in("id", deliveryIds);
    setIsArchiveUpdating(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSelectedDeliveryIds(new Set());
    setSuccessMessage("Entrega archivada correctamente.");
    await loadDeliveries(companyId, archiveFilter);
  }

  async function restoreDeliveries(deliveryIds: string[]) {
    if (!companyId || deliveryIds.length === 0) return;
    const shouldRestore = window.confirm("¿Restaurar las entregas seleccionadas?");
    if (!shouldRestore) return;
    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase
      .from("deliveries")
      .update({ archived_at: null, archived_by: null, archive_reason: null })
      .eq("company_id", companyId)
      .in("id", deliveryIds);
    setIsArchiveUpdating(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSelectedDeliveryIds(new Set());
    setSuccessMessage("Entrega restaurada correctamente.");
    await loadDeliveries(companyId, archiveFilter);
  }

  function toggleDeliverySelection(deliveryId: string) {
    setSelectedDeliveryIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(deliveryId)) nextIds.delete(deliveryId);
      else nextIds.add(deliveryId);
      return nextIds;
    });
  }

  function toggleAllVisibleDeliveries() {
    setSelectedDeliveryIds((currentIds) => {
      if (areAllVisibleDeliveriesSelected) {
        const nextIds = new Set(currentIds);
        deliveries.forEach((delivery) => nextIds.delete(delivery.id));
        return nextIds;
      }
      return new Set([...currentIds, ...deliveries.map((delivery) => delivery.id)]);
    });
  }

  return (
    <div className="space-y-6">
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Nueva entrega</h3>
            <p className="mt-1 text-sm text-stone-600">Copia una orden completa, captura una entrega parcial o crea una entrega manual.</p>
          </div>
          <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} onClick={() => setShowCreateForm((isVisible) => !isVisible)} type="button">
            {showCreateForm ? "Ocultar formulario" : "Nueva entrega"}
          </button>
        </div>

        {showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <Field id="internal_order_id" label="Orden interna">
              <select className={inputClass} id="internal_order_id" required value={form.internal_order_id} onChange={(event) => handleOrderChange(event.target.value)}>
                <option value="">Selecciona orden</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.folio ? `Orden #${order.folio}` : `Orden ${order.id.slice(0, 8)}`} - {clientNameForOrder(order)}</option>)}
              </select>
            </Field>
            <Field id="delivery_type" label="Tipo de entrega">
              <select className={inputClass} id="delivery_type" value={form.delivery_type} onChange={(event) => setForm({ ...form, delivery_type: event.target.value, status: event.target.value === "total" ? "entregado" : form.status })}>
                {DELIVERY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field id="status" label="Estado">
              <select className={inputClass} id="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {DELIVERY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <DeliveryInput form={form} id="scheduled_date" label="Fecha programada" setForm={setForm} type="datetime-local" />
            <DeliveryInput form={form} id="delivered_at" label="Entregado el" setForm={setForm} type="datetime-local" />
            <Field id="contact_id" label="Contacto">
              <select className={inputClass} id="contact_id" value={form.contact_id} onChange={(event) => setForm({ ...form, contact_id: event.target.value })}>
                <option value="">Sin contacto</option>
                {availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>)}
              </select>
            </Field>
            <DeliveryInput form={form} id="delivery_address" label="Dirección de entrega" setForm={setForm} />
            <DeliveryInput form={form} id="delivered_by" label="Entregado por" setForm={setForm} />
            <DeliveryInput form={form} id="received_by" label="Recibido por" setForm={setForm} />
            <Field className="lg:col-span-3" id="notes" label="Notas">
              <textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>

            {form.delivery_type === "parcial" ? (
              <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4 lg:col-span-3">
                <h4 className="text-sm font-semibold text-stone-950">Partidas a entregar</h4>
                {orderLines.length === 0 ? <p className="text-sm text-stone-600">Selecciona una orden con partidas.</p> : orderLines.map((line) => (
                  <label className="grid gap-3 rounded-md border border-stone-200 bg-white p-3 text-sm md:grid-cols-[1fr_150px]" key={line.id}>
                    <span className="flex items-start gap-3">
                      <input className="mt-1 h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700" checked={partialLines[line.id]?.selected ?? false} onChange={(event) => setPartialLines((current) => ({ ...current, [line.id]: { deliveredQuantity: current[line.id]?.deliveredQuantity ?? String(toNumber(line.quantity)), selected: event.target.checked } }))} type="checkbox" />
                      <span>
                        <span className="block font-semibold text-stone-950">{line.product_description || `Partida ${line.id.slice(0, 8)}`}</span>
                        <span className="mt-1 block text-stone-600">{[line.brand, line.model].filter(Boolean).join(" / ") || "Sin marca/modelo"} · Solicitado {toNumber(line.quantity)} {line.unit || "pieza"}</span>
                      </span>
                    </span>
                    <input className={inputClass} min="0" step="0.01" type="number" value={partialLines[line.id]?.deliveredQuantity ?? ""} onChange={(event) => setPartialLines((current) => ({ ...current, [line.id]: { deliveredQuantity: event.target.value, selected: current[line.id]?.selected ?? true } }))} />
                  </label>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : "Crear entrega"}</button>
              <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={() => setShowCreateForm(false)}>Cancelar</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">Entregas registradas</h3>
              <p className="mt-1 text-sm text-stone-600">Busca por folio de orden, cliente, recibido, entregado o estado.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ArchiveFilterToggle disabled={isLoading} onChange={handleArchiveFilterChange} value={archiveFilter} />
              <form className="flex gap-2" onSubmit={handleSearch}>
                <input className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 sm:w-72" placeholder="Buscar entrega" value={search} onChange={(event) => setSearch(event.target.value)} />
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50" disabled={isSearching} type="submit"><Search className="h-4 w-4" /> {isSearching ? "Buscando..." : "Buscar"}</button>
              </form>
            </div>
          </div>
        </div>

        <BulkArchiveActionBar archivedCount={selectedArchivedDeliveryIds.length} disabled={isArchiveUpdating} filter={archiveFilter} onArchive={() => archiveDeliveries(selectedActiveDeliveryIds)} onRestore={() => restoreDeliveries(selectedArchivedDeliveryIds)} selectedCount={selectedDeliveries.length} />

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">Cargando entregas...</div>
        ) : filteredDeliveries.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">No hay entregas para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-10 px-5 py-3"><input checked={areAllVisibleDeliveriesSelected} onChange={toggleAllVisibleDeliveries} type="checkbox" /></th>
                  <th className="px-5 py-3">Entrega</th>
                  <th className="px-5 py-3">Orden</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Programada</th>
                  <th className="px-5 py-3">Entregada</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Recibió</th>
                  <th className="px-5 py-3">Entregó</th>
                  <th className="px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredDeliveries.map((delivery) => {
                  const order = delivery.internal_order_id ? ordersById.get(delivery.internal_order_id) : undefined;
                  return (
                    <tr className="align-top" key={delivery.id}>
                      <td className="px-5 py-4"><input checked={selectedDeliveryIds.has(delivery.id)} onChange={() => toggleDeliverySelection(delivery.id)} type="checkbox" /></td>
                      <td className="px-5 py-4 font-semibold text-stone-950"><Link className="text-emerald-800 hover:underline" href={`/dashboard/entregas/${delivery.id}`}>{shortDeliveryId(delivery.id)}</Link>{delivery.archived_at ? <span className="mt-2 block"><ArchiveBadge /></span> : null}</td>
                      <td className="px-5 py-4">{order?.folio ? `Orden #${order.folio}` : "Sin folio"}</td>
                      <td className="px-5 py-4">{clientNameForOrder(order)}</td>
                      <td className="px-5 py-4">{delivery.delivery_type || "manual"}</td>
                      <td className="px-5 py-4">{formatDate(delivery.scheduled_date)}</td>
                      <td className="px-5 py-4">{formatDate(delivery.delivered_at)}</td>
                      <td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(delivery.status)}`}>{delivery.status || "pendiente"}</span></td>
                      <td className="px-5 py-4">{delivery.received_by || "Sin dato"}</td>
                      <td className="px-5 py-4">{delivery.delivered_by || "Sin dato"}</td>
                      <td className="px-5 py-4"><Link className="text-sm font-semibold text-emerald-800 hover:underline" href={`/dashboard/entregas/${delivery.id}`}>Ver</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function contactLabel(contact: ContactRecord) {
  const details = [contact.organization_area, contact.email, contact.phone].filter(Boolean);
  return [contact.contact_name || "Sin nombre", ...details].join(" - ");
}
function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return <div className={`space-y-2 ${className}`}><label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>{children}</div>;
}
function DeliveryInput({ form, id, label, setForm, type = "text" }: { form: DeliveryFormState; id: keyof DeliveryFormState; label: string; setForm: Dispatch<SetStateAction<DeliveryFormState>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => ({ ...currentForm, [id]: event.target.value }))} /></Field>;
}
