"use client";

import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { AttachmentManager } from "@/app/dashboard/attachment-manager";
import { ArchiveBadge } from "@/app/dashboard/archive-controls";
import { DELIVERY_STATUSES, DELIVERY_TYPES } from "@/app/dashboard/statuses";
import { formatTaxRate } from "@/src/lib/tax";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = { id: string; name: string | null };
type ContactRecord = { id: string; client_id: string | null; contact_name: string | null; organization_area: string | null; phone: string | null; email: string | null };
type ProductRecord = { id: string; name: string | null; brand: string | null; description: string | null; model: string | null; unit: string | null };
type QuotationRecord = { id: string; folio: string | null; client_id: string | null };
type InternalOrderRecord = { id: string; folio: string | null; quotation_id: string | null; status: string | null };
type InternalOrderLineRecord = {
  id: string;
  product_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | string | null;
  unit: string | null;
  status: string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
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
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};
type DeliveryLineRecord = {
  id: string;
  delivery_id: string | null;
  internal_order_line_id: string | null;
  product_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | string | null;
  delivered_quantity: number | string | null;
  unit: string | null;
  status: string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
  notes: string | null;
};
type HeaderFormState = {
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
type LineFormState = {
  internal_order_line_id: string;
  product_id: string;
  product_description: string;
  brand: string;
  model: string;
  quantity: string;
  delivered_quantity: string;
  unit: string;
  status: string;
  tax_included: boolean;
  tax_rate: string;
  notes: string;
};

type EntregaDetalleClientProps = { deliveryId: string };

const inputClass = "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";
const emptyLineForm: LineFormState = {
  internal_order_line_id: "",
  product_id: "",
  product_description: "",
  brand: "",
  model: "",
  quantity: "1",
  delivered_quantity: "0",
  unit: "pieza",
  status: "pendiente",
  tax_included: false,
  tax_rate: "0.16",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}
function optionalNumber(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  if (cleanedValue === null) return null;
  const parsedValue = Number(cleanedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return value.replace("T", " ").slice(0, 16);
}
function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 16);
}
function badgeClass(value: string | null | undefined) {
  if (value === "entregado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "parcial") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function brandModelText(brand: string | null | undefined, model: string | null | undefined) {
  return [brand, model].filter(Boolean).join(" / ") || "Sin marca/modelo";
}
function deliveryStatusFor(quantity: number, deliveredQuantity: number) {
  if (deliveredQuantity >= quantity && quantity > 0) return "entregado";
  if (deliveredQuantity > 0) return "parcial";
  return "pendiente";
}
function productLabel(product: ProductRecord | undefined) {
  return product?.name ?? "Sin producto";
}
function lineTitle(line: DeliveryLineRecord, productsById: Map<string, ProductRecord>) {
  if (line.product_id) {
    const product = productsById.get(line.product_id);
    if (product?.name) return product.name;
  }
  return line.product_description || "Partida sin descripción";
}
function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) return "Sin contacto";
  const details = [contact.organization_area, contact.email, contact.phone].filter(Boolean);
  return [contact.contact_name || "Sin nombre", ...details].join(" - ");
}

export function EntregaDetalleClient({ deliveryId }: EntregaDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(new Set());
  const [headerForm, setHeaderForm] = useState<HeaderFormState | null>(null);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isHeaderSaving, setIsHeaderSaving] = useState(false);
  const [isLineSaving, setIsLineSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lineForm, setLineForm] = useState<LineFormState>(emptyLineForm);
  const [lines, setLines] = useState<DeliveryLineRecord[]>([]);
  const [orderLines, setOrderLines] = useState<InternalOrderLineRecord[]>([]);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const orderLinesById = useMemo(() => new Map(orderLines.map((line) => [line.id, line])), [orderLines]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const quotationsById = useMemo(() => new Map(quotations.map((quotation) => [quotation.id, quotation])), [quotations]);

  const order = delivery?.internal_order_id ? ordersById.get(delivery.internal_order_id) : undefined;
  const quotation = order?.quotation_id ? quotationsById.get(order.quotation_id) : undefined;
  const client = quotation?.client_id ? clientsById.get(quotation.client_id) : undefined;
  const contact = delivery?.contact_id ? contactsById.get(delivery.contact_id) : undefined;
  const clientName = !order?.quotation_id ? "Orden manual" : client?.name ?? "Cliente no disponible";
  const availableContacts = useMemo(
    () => contacts.filter((record) => !quotation?.client_id || record.client_id === quotation.client_id),
    [contacts, quotation?.client_id],
  );
  const totals = useMemo(() => lines.reduce(
    (summary, line) => {
      const quantity = toNumber(line.quantity);
      const delivered = toNumber(line.delivered_quantity);
      return {
        delivered: summary.delivered + delivered,
        pending: summary.pending + Math.max(quantity - delivered, 0),
        quantity: summary.quantity + quantity,
      };
    },
    { delivered: 0, pending: 0, quantity: 0 },
  ), [lines]);

  const loadLines = useCallback(async (activeCompanyId: string) => {
    const { data, error } = await supabase
      .from("delivery_lines")
      .select("*")
      .eq("company_id", activeCompanyId)
      .eq("delivery_id", deliveryId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLines([]);
      return;
    }
    setLines((data ?? []) as DeliveryLineRecord[]);
  }, [deliveryId, supabase]);

  const loadOrderLines = useCallback(async (activeCompanyId: string, orderId: string | null | undefined) => {
    if (!orderId) {
      setOrderLines([]);
      return;
    }
    const { data, error } = await supabase
      .from("internal_order_lines")
      .select("id,product_id,product_description,brand,model,quantity,unit,status,tax_rate,tax_included")
      .eq("company_id", activeCompanyId)
      .eq("internal_order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) {
      setErrorMessage(error.message);
      setOrderLines([]);
      return;
    }
    setOrderLines((data ?? []) as InternalOrderLineRecord[]);
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
      const [deliveryResponse, ordersResponse, quotationsResponse, clientsResponse, contactsResponse, productsResponse] = await Promise.all([
        supabase.from("deliveries").select("*").eq("company_id", activeCompanyId).eq("id", deliveryId).maybeSingle(),
        supabase.from("internal_orders").select("id,folio,quotation_id,status").eq("company_id", activeCompanyId).order("created_at", { ascending: false }),
        supabase.from("quotations").select("id,folio,client_id").eq("company_id", activeCompanyId),
        supabase.from("clients").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase.from("contacts").select("id,client_id,contact_name,organization_area,phone,email").eq("company_id", activeCompanyId).eq("active", true).order("contact_name", { ascending: true }),
        supabase.from("products").select("id,name,brand,description,model,unit").eq("company_id", activeCompanyId).order("name", { ascending: true }),
      ]);
      const firstError = deliveryResponse.error ?? ordersResponse.error ?? quotationsResponse.error ?? clientsResponse.error ?? contactsResponse.error ?? productsResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }
      if (!deliveryResponse.data) {
        setErrorMessage("No se encontró la entrega.");
        setIsLoading(false);
        return;
      }

      const loadedDelivery = deliveryResponse.data as DeliveryRecord;
      setDelivery(loadedDelivery);
      setHeaderForm(headerFormFromDelivery(loadedDelivery));
      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      setQuotations((quotationsResponse.data ?? []) as QuotationRecord[]);
      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      await loadLines(activeCompanyId);
      await loadOrderLines(activeCompanyId, loadedDelivery.internal_order_id);
      setIsLoading(false);
    }

    loadInitialData();
  }, [deliveryId, loadLines, loadOrderLines, supabase]);

  function headerFormFromDelivery(record: DeliveryRecord): HeaderFormState {
    return {
      internal_order_id: record.internal_order_id ?? "",
      delivery_type: record.delivery_type ?? "manual",
      scheduled_date: formatDateInput(record.scheduled_date),
      delivered_at: formatDateInput(record.delivered_at),
      contact_id: record.contact_id ?? "",
      delivery_address: record.delivery_address ?? "",
      delivered_by: record.delivered_by ?? "",
      received_by: record.received_by ?? "",
      status: record.status ?? "pendiente",
      notes: record.notes ?? "",
    };
  }

  async function handleHeaderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || !headerForm) return;
    if (!headerForm.internal_order_id) {
      setErrorMessage("Selecciona una orden interna.");
      return;
    }
    setIsHeaderSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      contact_id: cleanOptionalValue(headerForm.contact_id),
      delivered_at: cleanOptionalValue(headerForm.delivered_at),
      delivered_by: cleanOptionalValue(headerForm.delivered_by),
      delivery_address: cleanOptionalValue(headerForm.delivery_address),
      delivery_type: headerForm.delivery_type,
      internal_order_id: headerForm.internal_order_id,
      notes: cleanOptionalValue(headerForm.notes),
      received_by: cleanOptionalValue(headerForm.received_by),
      scheduled_date: cleanOptionalValue(headerForm.scheduled_date),
      status: headerForm.status || "pendiente",
    };
    const { data, error } = await supabase.from("deliveries").update(payload).eq("company_id", companyId).eq("id", deliveryId).select("*").single();
    setIsHeaderSaving(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo actualizar la entrega.");
      return;
    }
    const updatedDelivery = data as DeliveryRecord;
    setDelivery(updatedDelivery);
    setHeaderForm(headerFormFromDelivery(updatedDelivery));
    await loadOrderLines(companyId, updatedDelivery.internal_order_id);
    setShowHeaderForm(false);
    setSuccessMessage("Entrega actualizada.");
  }

  function handleOrderLineChange(orderLineId: string) {
    const orderLine = orderLineId ? orderLinesById.get(orderLineId) : undefined;
    setLineForm((currentForm) => {
      const quantity = orderLine?.quantity === null || orderLine?.quantity === undefined ? currentForm.quantity : String(orderLine.quantity);
      return {
        ...currentForm,
        brand: orderLine?.brand ?? currentForm.brand,
        delivered_quantity: quantity,
        internal_order_line_id: orderLineId,
        model: orderLine?.model ?? currentForm.model,
        product_description: orderLine?.product_description ?? currentForm.product_description,
        product_id: orderLine?.product_id ?? currentForm.product_id,
        quantity,
        status: deliveryStatusFor(toNumber(quantity), toNumber(quantity)),
        tax_included: Boolean(orderLine?.tax_included),
        tax_rate: String(orderLine?.tax_rate ?? currentForm.tax_rate),
        unit: orderLine?.unit ?? currentForm.unit,
      };
    });
  }

  function handleProductChange(productId: string) {
    const product = productId ? productsById.get(productId) : undefined;
    setLineForm((currentForm) => ({
      ...currentForm,
      brand: product?.brand ?? currentForm.brand,
      model: product?.model ?? currentForm.model,
      product_description: product?.description || product?.name || currentForm.product_description,
      product_id: productId,
      unit: product?.unit ?? currentForm.unit,
    }));
  }

  function updateLineQuantity(key: "quantity" | "delivered_quantity", value: string) {
    setLineForm((currentForm) => {
      const nextForm = { ...currentForm, [key]: value };
      const suggestedStatus = deliveryStatusFor(toNumber(nextForm.quantity), toNumber(nextForm.delivered_quantity));
      return { ...nextForm, status: suggestedStatus };
    });
  }

  async function handleLineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    if (!lineForm.product_id && !lineForm.product_description.trim()) {
      setErrorMessage("Selecciona un producto o captura una descripción.");
      return;
    }
    const quantity = optionalNumber(lineForm.quantity);
    const deliveredQuantity = optionalNumber(lineForm.delivered_quantity);
    if (quantity === null || quantity <= 0) {
      setErrorMessage("La cantidad debe ser mayor a cero.");
      return;
    }
    if (deliveredQuantity === null || deliveredQuantity < 0) {
      setErrorMessage("La cantidad entregada no puede ser negativa.");
      return;
    }

    setIsLineSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      brand: cleanOptionalValue(lineForm.brand),
      company_id: companyId,
      delivered_quantity: deliveredQuantity,
      delivery_id: deliveryId,
      internal_order_line_id: cleanOptionalValue(lineForm.internal_order_line_id),
      model: cleanOptionalValue(lineForm.model),
      notes: cleanOptionalValue(lineForm.notes),
      product_description: cleanOptionalValue(lineForm.product_description),
      product_id: cleanOptionalValue(lineForm.product_id),
      quantity,
      status: lineForm.status || deliveryStatusFor(quantity, deliveredQuantity),
      tax_included: lineForm.tax_included,
      tax_rate: lineForm.tax_rate === "exempt" ? 0 : optionalNumber(lineForm.tax_rate) ?? 0,
      unit: cleanOptionalValue(lineForm.unit) ?? "pieza",
    };
    const query = editingLineId
      ? supabase.from("delivery_lines").update(payload).eq("company_id", companyId).eq("id", editingLineId)
      : supabase.from("delivery_lines").insert(payload);
    const { error } = await query;
    setIsLineSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setLineForm(emptyLineForm);
    setEditingLineId(null);
    setShowLineForm(false);
    await loadLines(companyId);
    setSuccessMessage(editingLineId ? "Partida actualizada." : "Partida agregada.");
  }

  function startEditingLine(line: DeliveryLineRecord) {
    setEditingLineId(line.id);
    setLineForm({
      brand: line.brand ?? "",
      delivered_quantity: line.delivered_quantity === null || line.delivered_quantity === undefined ? "0" : String(line.delivered_quantity),
      internal_order_line_id: line.internal_order_line_id ?? "",
      model: line.model ?? "",
      notes: line.notes ?? "",
      product_description: line.product_description ?? "",
      product_id: line.product_id ?? "",
      quantity: line.quantity === null || line.quantity === undefined ? "1" : String(line.quantity),
      status: line.status ?? "pendiente",
      tax_included: Boolean(line.tax_included),
      tax_rate: String(line.tax_rate ?? "0.16"),
      unit: line.unit ?? "pieza",
    });
    setShowLineForm(true);
  }

  function resetLineForm() {
    setEditingLineId(null);
    setLineForm(emptyLineForm);
    setShowLineForm(false);
  }

  async function deleteLine(line: DeliveryLineRecord) {
    if (!companyId) return;
    const shouldDelete = window.confirm("¿Eliminar esta partida?");
    if (!shouldDelete) return;
    const { error } = await supabase.from("delivery_lines").delete().eq("company_id", companyId).eq("id", line.id);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await loadLines(companyId);
    setSuccessMessage("Partida eliminada.");
  }

  async function archiveDelivery() {
    if (!companyId || !delivery) return;
    const shouldArchive = window.confirm("¿Archivar esta entrega?");
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
    const { data, error } = await supabase
      .from("deliveries")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id, archive_reason: "Archivado manualmente" })
      .eq("company_id", companyId)
      .eq("id", delivery.id)
      .select("*")
      .single();
    setIsArchiveUpdating(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo archivar la entrega.");
      return;
    }
    const updatedDelivery = data as DeliveryRecord;
    setDelivery(updatedDelivery);
    setHeaderForm(headerFormFromDelivery(updatedDelivery));
    setSuccessMessage("Entrega archivada.");
  }

  async function restoreDelivery() {
    if (!companyId || !delivery) return;
    const shouldRestore = window.confirm("¿Restaurar esta entrega?");
    if (!shouldRestore) return;
    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { data, error } = await supabase
      .from("deliveries")
      .update({ archived_at: null, archived_by: null, archive_reason: null })
      .eq("company_id", companyId)
      .eq("id", delivery.id)
      .select("*")
      .single();
    setIsArchiveUpdating(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo restaurar la entrega.");
      return;
    }
    const updatedDelivery = data as DeliveryRecord;
    setDelivery(updatedDelivery);
    setHeaderForm(headerFormFromDelivery(updatedDelivery));
    setSuccessMessage("Entrega restaurada.");
  }

  function cancelHeaderEdit() {
    setHeaderForm(delivery ? headerFormFromDelivery(delivery) : null);
    setShowHeaderForm(false);
  }

  return (
    <>
      {delivery ? (
        <PrintableDelivery
          clientName={clientName}
          contact={contact}
          delivery={delivery}
          lines={lines}
          order={order}
          productsById={productsById}
        />
      ) : null}
      <div className="space-y-6 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline" href="/dashboard/entregas">Volver a entregas</Link>
          <div className="flex flex-wrap gap-2">
            {delivery?.archived_at ? (
              <button className="h-10 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || isArchiveUpdating || !delivery} onClick={restoreDelivery} type="button">Restaurar</button>
            ) : (
              <button className="h-10 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || isArchiveUpdating || !delivery} onClick={archiveDelivery} type="button">Archivar</button>
            )}
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || !delivery} onClick={() => window.print()} type="button"><Printer className="h-4 w-4" aria-hidden="true" /> Imprimir entrega</button>
          </div>
        </div>

        {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          {isLoading || !delivery ? (
            <p className="text-sm font-medium text-stone-600">Cargando entrega...</p>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-stone-950">Entrega {delivery.id.slice(0, 8)}</h3>
                    {delivery.archived_at ? <ArchiveBadge /> : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} · {clientName}</p>
                </div>
                <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isHeaderSaving} onClick={() => { if (!showHeaderForm) setHeaderForm(headerFormFromDelivery(delivery)); setShowHeaderForm((isVisible) => !isVisible); }} type="button">
                  {showHeaderForm ? "Ocultar edición" : "Editar entrega"}
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Info label="Orden interna" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
                <Info label="Cliente" value={clientName} />
                <Info label="Tipo" value={delivery.delivery_type || "manual"} />
                <Info label="Estado" value={delivery.status || "pendiente"} badge />
                <Info label="Programada" value={formatDate(delivery.scheduled_date)} />
                <Info label="Entregado el" value={formatDate(delivery.delivered_at)} />
                <Info label="Entregado por" value={delivery.delivered_by || "Sin dato"} />
                <Info label="Recibido por" value={delivery.received_by || "Sin dato"} />
                <Info label="Contacto" value={contactLabel(contact)} />
                <Info label="Cantidad total" value={String(totals.quantity)} />
                <Info label="Entregado" value={String(totals.delivered)} />
                <Info label="Pendiente" value={String(totals.pending)} />
                <div className="md:col-span-2 lg:col-span-4"><Info label="Dirección de entrega" value={delivery.delivery_address || "Sin dirección"} /></div>
                <div className="md:col-span-2 lg:col-span-4"><Info label="Notas" value={delivery.notes || "Sin notas"} /></div>
              </div>
            </>
          )}
        </section>

        {showHeaderForm && headerForm ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleHeaderSubmit}>
              <HeaderFormFields contacts={availableContacts} form={headerForm} isSaving={isHeaderSaving} orders={orders} setForm={setHeaderForm} />
              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
                <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isHeaderSaving} type="submit">{isHeaderSaving ? "Guardando..." : "Guardar"}</button>
                <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={cancelHeaderEdit}>Cancelar</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className={`${showLineForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
            <div>
              <h3 className="text-lg font-semibold text-stone-950">{editingLineId ? "Editar partida" : "Agregar partida"}</h3>
              <p className="mt-1 text-sm text-stone-600">Puedes ligar una partida de orden o capturar una partida manual.</p>
            </div>
            <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isLineSaving} onClick={() => setShowLineForm((isVisible) => !isVisible)} type="button">
              {showLineForm ? "Ocultar formulario" : "Agregar partida"}
            </button>
          </div>
          {showLineForm ? (
            <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleLineSubmit}>
              <Field id="internal_order_line_id" label="Partida de orden">
                <select className={inputClass} id="internal_order_line_id" value={lineForm.internal_order_line_id} onChange={(event) => handleOrderLineChange(event.target.value)}>
                  <option value="">Sin partida ligada</option>
                  {orderLines.map((line) => <option key={line.id} value={line.id}>{line.product_description || `Partida ${line.id.slice(0, 8)}`}</option>)}
                </select>
              </Field>
              <Field id="product_id" label="Producto">
                <select className={inputClass} id="product_id" value={lineForm.product_id} onChange={(event) => handleProductChange(event.target.value)}>
                  <option value="">Sin producto</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name ?? "Producto sin nombre"}</option>)}
                </select>
              </Field>
              <LineInput form={lineForm} id="product_description" label="Descripción" setForm={setLineForm} />
              <LineInput form={lineForm} id="brand" label="Marca" setForm={setLineForm} />
              <LineInput form={lineForm} id="model" label="Modelo" setForm={setLineForm} />
              <Field id="quantity" label="Cantidad"><input className={inputClass} min="0.01" step="0.01" type="number" value={lineForm.quantity} onChange={(event) => updateLineQuantity("quantity", event.target.value)} /></Field>
              <Field id="delivered_quantity" label="Cantidad entregada"><input className={inputClass} min="0" step="0.01" type="number" value={lineForm.delivered_quantity} onChange={(event) => updateLineQuantity("delivered_quantity", event.target.value)} /></Field>
              <LineInput form={lineForm} id="unit" label="Unidad" setForm={setLineForm} />
              <Field id="tax_rate" label="IVA">
                <select className={inputClass} id="tax_rate" value={lineForm.tax_rate} onChange={(event) => setLineForm({ ...lineForm, tax_rate: event.target.value })}>
                  <option value="0.16">16%</option>
                  <option value="0">0%</option>
                  <option value="exempt">Exento / sin IVA</option>
                </select>
              </Field>
              <label className="flex h-11 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800">
                <input className="h-4 w-4 rounded border-stone-300 text-emerald-800" checked={lineForm.tax_included} onChange={(event) => setLineForm({ ...lineForm, tax_included: event.target.checked })} type="checkbox" />
                Precio incluye IVA
              </label>
              <Field id="line_status" label="Estado">
                <select className={inputClass} id="line_status" value={lineForm.status} onChange={(event) => setLineForm({ ...lineForm, status: event.target.value })}>
                  {DELIVERY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <Field className="lg:col-span-3" id="line_notes" label="Notas">
                <textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="line_notes" value={lineForm.notes} onChange={(event) => setLineForm({ ...lineForm, notes: event.target.value })} />
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
                <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isLineSaving} type="submit">{isLineSaving ? "Guardando..." : editingLineId ? "Guardar partida" : "Agregar partida"}</button>
                <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={resetLineForm}>Cancelar</button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h3 className="text-lg font-semibold text-stone-950">Partidas entregadas</h3>
            <p className="mt-1 text-sm text-stone-600">{lines.length} partidas registradas.</p>
          </div>
          {lines.length === 0 ? (
            <div className="p-5 text-sm text-stone-600">No hay partidas para mostrar.</div>
          ) : (
            <div className="space-y-3 p-5">
              {lines.map((line) => {
                const isExpanded = expandedLineIds.has(line.id);
                const quantity = toNumber(line.quantity);
                const deliveredQuantity = toNumber(line.delivered_quantity);
                const pendingQuantity = Math.max(quantity - deliveredQuantity, 0);
                const linkedOrderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
                return (
                  <article className="rounded-lg border border-stone-200 bg-white" key={line.id}>
                    <button className="flex w-full flex-col gap-3 px-4 py-4 text-left lg:flex-row lg:items-center lg:justify-between" onClick={() => setExpandedLineIds((currentIds) => { const nextIds = new Set(currentIds); if (nextIds.has(line.id)) nextIds.delete(line.id); else nextIds.add(line.id); return nextIds; })} type="button">
                      <span className="min-w-0">
                        <span className="block font-semibold text-stone-950">{lineTitle(line, productsById)}</span>
                        <span className="mt-1 block text-sm text-stone-600">{brandModelText(line.brand, line.model)} · Cantidad {quantity} · Entregada {deliveredQuantity} · Pendiente {pendingQuantity} {line.unit || "pieza"}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(line.status)}`}>{line.status || "pendiente"}</span>
                        <span className="text-sm font-medium text-emerald-800">{isExpanded ? "Ocultar" : "Ver"}</span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="grid gap-4 border-t border-stone-200 px-4 py-4 text-sm md:grid-cols-3">
                        <Info label="Producto" value={line.product_id ? productLabel(productsById.get(line.product_id)) : "Sin producto"} />
                        <Info label="Partida ligada" value={linkedOrderLine?.product_description || (line.internal_order_line_id ? "Partida no disponible" : "Sin liga")} />
                        <Info label="Estado sugerido" value={deliveryStatusFor(quantity, deliveredQuantity)} badge />
                        <Info label="IVA" value={formatTaxRate(line.tax_rate)} />
                        <Info label="Precio incluye IVA" value={line.tax_included ? "Sí" : "No"} />
                        <div className="md:col-span-3"><Info label="Notas" value={line.notes || "Sin notas"} /></div>
                        <div className="flex flex-wrap gap-2 md:col-span-3">
                          <button className="h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50" type="button" onClick={() => startEditingLine(line)}>Editar</button>
                          <button className="h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50" type="button" onClick={() => deleteLine(line)}>Eliminar</button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {companyId && delivery ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="mb-5 border-b border-stone-200 pb-4">
              <h3 className="text-lg font-semibold text-stone-950">Evidencias de entrega</h3>
              <p className="mt-1 text-sm text-stone-600">Categorías sugeridas: evidencia, recibido firmado, foto producto o general.</p>
            </div>
            <AttachmentManager companyId={companyId} entityId={deliveryId} entityType="delivery" />
          </section>
        ) : null}
      </div>
    </>
  );
}

function PrintableDelivery({ clientName, contact, delivery, lines, order, productsById }: { clientName: string; contact: ContactRecord | undefined; delivery: DeliveryRecord; lines: DeliveryLineRecord[]; order: InternalOrderRecord | undefined; productsById: Map<string, ProductRecord> }) {
  return (
    <section className="hidden print:block print:bg-white print:p-8 print:text-stone-950">
      <div className="border-b border-stone-300 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Entregas</p>
        <h1 className="mt-1 text-2xl font-semibold">Comprobante de entrega</h1>
        <p className="mt-1 text-sm">{order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} · {clientName}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-stone-300 py-5 text-sm">
        <PrintInfo label="Orden interna" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
        <PrintInfo label="Cliente" value={clientName} />
        <PrintInfo label="Contacto / recibió" value={[contactLabel(contact), delivery.received_by].filter((value) => value && value !== "Sin contacto").join(" / ") || "Sin dato"} />
        <PrintInfo label="Dirección de entrega" value={delivery.delivery_address || "Sin dirección"} />
        <PrintInfo label="Entregado por" value={delivery.delivered_by || "Sin dato"} />
        <PrintInfo label="Entregado el" value={formatDate(delivery.delivered_at)} />
        <div className="col-span-2"><PrintInfo label="Notas" value={delivery.notes || "Sin notas"} /></div>
      </div>
      <table className="mt-5 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-300">
            <th className="py-2 pr-3 font-semibold">Producto</th>
            <th className="py-2 pr-3 font-semibold">Marca</th>
            <th className="py-2 pr-3 font-semibold">Modelo</th>
            <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
            <th className="py-2 pr-3 text-right font-semibold">Entregada</th>
            <th className="py-2 text-right font-semibold">Unidad</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr className="border-b border-stone-200 align-top" key={line.id}>
              <td className="py-3 pr-3">{lineTitle(line, productsById)}</td>
              <td className="py-3 pr-3">{line.brand || "Sin marca"}</td>
              <td className="py-3 pr-3">{line.model || "Sin modelo"}</td>
              <td className="py-3 pr-3 text-right">{toNumber(line.quantity)}</td>
              <td className="py-3 pr-3 text-right">{toNumber(line.delivered_quantity)}</td>
              <td className="py-3 text-right">{line.unit || "pieza"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-16 flex justify-end">
        <div className="w-80 border-t border-stone-500 pt-3 text-center text-sm font-semibold">Nombre y firma de recibido</div>
      </div>
    </section>
  );
}

function HeaderFormFields({ contacts, form, isSaving, orders, setForm }: { contacts: ContactRecord[]; form: HeaderFormState; isSaving: boolean; orders: InternalOrderRecord[]; setForm: Dispatch<SetStateAction<HeaderFormState | null>> }) {
  const update = (key: keyof HeaderFormState, value: string) => setForm((currentForm) => currentForm ? { ...currentForm, [key]: value } : currentForm);
  return (
    <>
      <Field id="header_order" label="Orden interna"><select className={inputClass} disabled={isSaving} id="header_order" required value={form.internal_order_id} onChange={(event) => update("internal_order_id", event.target.value)}><option value="">Selecciona orden</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.folio ? `Orden #${order.folio}` : `Orden ${order.id.slice(0, 8)}`}</option>)}</select></Field>
      <Field id="header_type" label="Tipo"><select className={inputClass} disabled={isSaving} id="header_type" value={form.delivery_type} onChange={(event) => update("delivery_type", event.target.value)}>{DELIVERY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
      <Field id="header_status" label="Estado"><select className={inputClass} disabled={isSaving} id="header_status" value={form.status} onChange={(event) => update("status", event.target.value)}>{DELIVERY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
      <HeaderInput form={form} id="scheduled_date" label="Fecha programada" setForm={setForm} type="datetime-local" />
      <HeaderInput form={form} id="delivered_at" label="Entregado el" setForm={setForm} type="datetime-local" />
      <Field id="header_contact" label="Contacto"><select className={inputClass} disabled={isSaving} id="header_contact" value={form.contact_id} onChange={(event) => update("contact_id", event.target.value)}><option value="">Sin contacto</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>)}</select></Field>
      <HeaderInput form={form} id="delivery_address" label="Dirección de entrega" setForm={setForm} />
      <HeaderInput form={form} id="delivered_by" label="Entregado por" setForm={setForm} />
      <HeaderInput form={form} id="received_by" label="Recibido por" setForm={setForm} />
      <Field className="lg:col-span-3" id="header_notes" label="Notas"><textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" disabled={isSaving} id="header_notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></Field>
    </>
  );
}
function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return <div className={`space-y-2 ${className}`}><label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>{children}</div>;
}
function HeaderInput({ form, id, label, setForm, type = "text" }: { form: HeaderFormState; id: keyof HeaderFormState; label: string; setForm: Dispatch<SetStateAction<HeaderFormState | null>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => currentForm ? { ...currentForm, [id]: event.target.value } : currentForm)} /></Field>;
}
function LineInput({ form, id, label, setForm, type = "text" }: { form: LineFormState; id: keyof LineFormState; label: string; setForm: Dispatch<SetStateAction<LineFormState>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} type={type} value={String(form[id])} onChange={(event) => setForm((currentForm) => ({ ...currentForm, [id]: event.target.value }))} /></Field>;
}
function Info({ badge = false, label, value }: { badge?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>{badge ? <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(value)}`}>{value}</span> : <p className="mt-1 break-words text-sm text-stone-800">{value}</p>}</div>;
}
function PrintInfo({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1">{value}</p></div>;
}
