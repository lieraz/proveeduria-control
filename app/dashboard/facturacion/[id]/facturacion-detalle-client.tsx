"use client";

import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { ArchiveBadge } from "@/app/dashboard/archive-controls";
import { AttachmentManager } from "@/app/dashboard/attachment-manager";
import { BILLING_STATUSES } from "@/app/dashboard/statuses";
import { calculateTaxLineAmounts, formatTaxRate, numericValue } from "@/src/lib/tax";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = { id: string; name: string | null };
type QuotationRecord = { id: string; folio: string | null; client_id: string | null };
type InternalOrderRecord = { id: string; folio: string | null; quotation_id: string | null };
type BillingRecord = {
  id: string;
  internal_order_id: string | null;
  delivery_id: string | null;
  delivered_at: string | null;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  total_amount: number | string | null;
  invoiced_amount: number | string | null;
  invoice_folio: string | null;
  invoiced_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  status: string | null;
  cfdi_url: string | null;
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};
type BillingLineRecord = {
  id: string;
  source_type: string | null;
  delivery_id: string | null;
  internal_order_id: string | null;
  description: string | null;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  total_amount: number | string | null;
  notes: string | null;
};
type DeliveryRecord = {
  id: string;
  internal_order_id: string | null;
  delivered_at: string | null;
  scheduled_date: string | null;
  status: string | null;
};
type DeliveryLineRecord = {
  id: string;
  internal_order_line_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | string | null;
  delivered_quantity: number | string | null;
  unit: string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
};
type InternalOrderLineRecord = {
  id: string;
  sale_unit_price: number | string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
};
type BillingFormState = {
  invoice_folio: string;
  invoiced_at: string;
  due_date: string;
  paid_at: string;
  status: string;
  cfdi_url: string;
  notes: string;
};

type FacturacionDetalleClientProps = { billingId: string };

const inputClass = "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return value.replace("T", " ").slice(0, 16);
}
function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 16);
}
function formatDateOnlyInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}
function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(numericValue(value));
}
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function badgeClass(value: string | null | undefined) {
  if (value === "pagado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "facturado") return "border-sky-200 bg-sky-50 text-sky-800";
  if (value === "vencido") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function brandModelText(brand: string | null | undefined, model: string | null | undefined) {
  return [brand, model].filter(Boolean).join(" / ") || "Sin marca/modelo";
}
function lineTitle(line: DeliveryLineRecord) {
  return line.product_description || "Partida sin descripción";
}
function deliveryLabel(delivery: DeliveryRecord | null, billing: BillingRecord) {
  if (delivery) return `Entrega ${delivery.id.slice(0, 8)}`;
  if (billing.delivered_at) return `Entrega sin liga · ${formatDate(billing.delivered_at)}`;
  return "Sin entrega ligada";
}
function billingSourceLabel(billing: BillingRecord, billingLines: BillingLineRecord[] = []) {
  if (billingLines.length > 1) return "Consolidada";
  if (billingLines[0]?.source_type === "manual") return "Manual";
  if (billingLines[0]?.source_type === "delivery") return "Desde entrega";
  if (billingLines[0]?.source_type === "internal_order") return "Generada desde orden";
  return billing.delivery_id ? "Desde entrega" : "Generada desde orden";
}
function billingLineSourceLabel(sourceType: string | null) {
  if (sourceType === "delivery") return "Desde entrega";
  if (sourceType === "internal_order") return "Desde orden";
  if (sourceType === "manual") return "Manual";
  return "Sin origen";
}
function billingLineHref(line: BillingLineRecord) {
  if (line.source_type === "delivery" && line.delivery_id) return `/dashboard/entregas/${line.delivery_id}`;
  if (line.source_type === "internal_order" && line.internal_order_id) return `/dashboard/ordenes/${line.internal_order_id}`;
  if (line.delivery_id) return `/dashboard/entregas/${line.delivery_id}`;
  if (line.internal_order_id) return `/dashboard/ordenes/${line.internal_order_id}`;
  return null;
}

export function FacturacionDetalleClient({ billingId }: FacturacionDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [billing, setBilling] = useState<BillingRecord | null>(null);
  const [billingLines, setBillingLines] = useState<BillingLineRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<BillingFormState | null>(null);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lines, setLines] = useState<DeliveryLineRecord[]>([]);
  const [orderLines, setOrderLines] = useState<InternalOrderLineRecord[]>([]);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const orderLinesById = useMemo(() => new Map(orderLines.map((line) => [line.id, line])), [orderLines]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const quotationsById = useMemo(() => new Map(quotations.map((quotation) => [quotation.id, quotation])), [quotations]);

  const effectiveOrderId = billing?.internal_order_id ?? delivery?.internal_order_id ?? null;
  const order = effectiveOrderId ? ordersById.get(effectiveOrderId) : undefined;
  const quotation = order?.quotation_id ? quotationsById.get(order.quotation_id) : undefined;
  const client = quotation?.client_id ? clientsById.get(quotation.client_id) : undefined;
  const clientName = !order?.quotation_id ? "Orden manual" : client?.name ?? "Cliente no disponible";

  const calculatedSummary = useMemo(
    () => lines.reduce(
      (summary, line) => {
        const orderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
        const amounts = calculateTaxLineAmounts({
          quantity: line.delivered_quantity ?? line.quantity,
          taxIncluded: line.tax_included ?? orderLine?.tax_included,
          taxRate: line.tax_rate ?? orderLine?.tax_rate,
          unitPrice: orderLine?.sale_unit_price,
        });
        return {
          subtotal: summary.subtotal + amounts.subtotal,
          taxAmount: summary.taxAmount + amounts.tax,
          totalAmount: summary.totalAmount + amounts.total,
        };
      },
      { subtotal: 0, taxAmount: 0, totalAmount: 0 },
    ),
    [lines, orderLinesById],
  );

  const subtotal = billing?.subtotal ?? roundMoney(calculatedSummary.subtotal);
  const taxAmount = billing?.tax_amount ?? roundMoney(calculatedSummary.taxAmount);
  const totalAmount = billing?.total_amount ?? roundMoney(calculatedSummary.totalAmount);

  const loadBillingLines = useCallback(async (activeCompanyId: string) => {
    const { data, error } = await supabase
      .from("billing_lines")
      .select("id,source_type,delivery_id,internal_order_id,description,subtotal,tax_amount,total_amount,notes")
      .eq("company_id", activeCompanyId)
      .eq("billing_id", billingId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setBillingLines([]);
      return;
    }
    setBillingLines((data ?? []) as BillingLineRecord[]);
  }, [billingId, supabase]);

  const loadLines = useCallback(async (activeCompanyId: string, deliveryId: string | null | undefined) => {
    if (!deliveryId) {
      setLines([]);
      setOrderLines([]);
      return;
    }
    const { data, error } = await supabase
      .from("delivery_lines")
      .select("id,internal_order_line_id,product_description,brand,model,quantity,delivered_quantity,unit,tax_included,tax_rate")
      .eq("company_id", activeCompanyId)
      .eq("delivery_id", deliveryId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLines([]);
      setOrderLines([]);
      return;
    }

    const loadedLines = (data ?? []) as DeliveryLineRecord[];
    setLines(loadedLines);
    const orderLineIds = loadedLines
      .map((line) => line.internal_order_line_id)
      .filter((id): id is string => Boolean(id));

    if (orderLineIds.length === 0) {
      setOrderLines([]);
      return;
    }

    const { data: orderLineData, error: orderLineError } = await supabase
      .from("internal_order_lines")
      .select("id,sale_unit_price,tax_included,tax_rate")
      .eq("company_id", activeCompanyId)
      .in("id", orderLineIds);

    if (orderLineError) {
      setErrorMessage(orderLineError.message);
      setOrderLines([]);
      return;
    }
    setOrderLines((orderLineData ?? []) as InternalOrderLineRecord[]);
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
      const [billingResponse, ordersResponse, quotationsResponse, clientsResponse] = await Promise.all([
        supabase.from("billing").select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,cfdi_url,notes,archived_at,archived_by,archive_reason").eq("company_id", activeCompanyId).eq("id", billingId).maybeSingle(),
        supabase.from("internal_orders").select("id,folio,quotation_id").eq("company_id", activeCompanyId).order("created_at", { ascending: false }),
        supabase.from("quotations").select("id,folio,client_id").eq("company_id", activeCompanyId),
        supabase.from("clients").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
      ]);
      const firstError = billingResponse.error ?? ordersResponse.error ?? quotationsResponse.error ?? clientsResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }
      if (!billingResponse.data) {
        setErrorMessage("No se encontró el registro de facturación.");
        setIsLoading(false);
        return;
      }

      const loadedBilling = billingResponse.data as BillingRecord;
      setBilling(loadedBilling);
      setForm(formFromBilling(loadedBilling));
      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      setQuotations((quotationsResponse.data ?? []) as QuotationRecord[]);
      setClients((clientsResponse.data ?? []) as ClientRecord[]);

      let resolvedDelivery: DeliveryRecord | null = null;
      if (loadedBilling.delivery_id) {
        const { data: deliveryData, error: deliveryError } = await supabase
          .from("deliveries")
          .select("id,internal_order_id,delivered_at,scheduled_date,status")
          .eq("company_id", activeCompanyId)
          .eq("id", loadedBilling.delivery_id)
          .maybeSingle();
        if (deliveryError) {
          setErrorMessage(deliveryError.message);
        } else {
          resolvedDelivery = (deliveryData ?? null) as DeliveryRecord | null;
        }
      } else if (loadedBilling.internal_order_id) {
        const { data: deliveryData, error: deliveryError } = await supabase
          .from("deliveries")
          .select("id,internal_order_id,delivered_at,scheduled_date,status")
          .eq("company_id", activeCompanyId)
          .eq("internal_order_id", loadedBilling.internal_order_id)
          .order("delivered_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (deliveryError) {
          setErrorMessage(deliveryError.message);
        } else {
          resolvedDelivery = (deliveryData ?? null) as DeliveryRecord | null;
        }
      }

      setDelivery(resolvedDelivery);
      await loadLines(activeCompanyId, loadedBilling.delivery_id ?? resolvedDelivery?.id);
      await loadBillingLines(activeCompanyId);
      setIsLoading(false);
    }

    loadInitialData();
  }, [billingId, loadBillingLines, loadLines, supabase]);

  function formFromBilling(record: BillingRecord): BillingFormState {
    return {
      cfdi_url: record.cfdi_url ?? "",
      due_date: formatDateOnlyInput(record.due_date),
      invoice_folio: record.invoice_folio ?? "",
      invoiced_at: formatDateInput(record.invoiced_at),
      notes: record.notes ?? "",
      paid_at: formatDateInput(record.paid_at),
      status: record.status ?? BILLING_STATUSES[0],
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || !form) return;

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("billing")
      .update({
        cfdi_url: cleanOptionalValue(form.cfdi_url),
        due_date: cleanOptionalValue(form.due_date),
        invoice_folio: cleanOptionalValue(form.invoice_folio),
        invoiced_at: cleanOptionalValue(form.invoiced_at),
        notes: cleanOptionalValue(form.notes),
        paid_at: cleanOptionalValue(form.paid_at),
        status: form.status || BILLING_STATUSES[0],
      })
      .eq("company_id", companyId)
      .eq("id", billingId)
      .select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,cfdi_url,notes,archived_at,archived_by,archive_reason")
      .single();

    setIsSaving(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo actualizar facturación.");
      return;
    }
    const updatedBilling = data as BillingRecord;
    setBilling(updatedBilling);
    setForm(formFromBilling(updatedBilling));
    setShowForm(false);
    setSuccessMessage("Facturación actualizada.");
  }

  async function archiveBilling() {
    if (!companyId || !billing) return;
    const shouldArchive = window.confirm("¿Archivar este registro de facturación?");
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
      .from("billing")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id, archive_reason: "Archivado manualmente" })
      .eq("company_id", companyId)
      .eq("id", billing.id)
      .select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,cfdi_url,notes,archived_at,archived_by,archive_reason")
      .single();
    setIsArchiveUpdating(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo archivar facturación.");
      return;
    }
    const updatedBilling = data as BillingRecord;
    setBilling(updatedBilling);
    setForm(formFromBilling(updatedBilling));
    setSuccessMessage("Facturación archivada.");
  }

  async function restoreBilling() {
    if (!companyId || !billing) return;
    const shouldRestore = window.confirm("¿Restaurar este registro de facturación?");
    if (!shouldRestore) return;
    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { data, error } = await supabase
      .from("billing")
      .update({ archived_at: null, archived_by: null, archive_reason: null })
      .eq("company_id", companyId)
      .eq("id", billing.id)
      .select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,cfdi_url,notes,archived_at,archived_by,archive_reason")
      .single();
    setIsArchiveUpdating(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo restaurar facturación.");
      return;
    }
    const updatedBilling = data as BillingRecord;
    setBilling(updatedBilling);
    setForm(formFromBilling(updatedBilling));
    setSuccessMessage("Facturación restaurada.");
  }

  function cancelEdit() {
    setForm(billing ? formFromBilling(billing) : null);
    setShowForm(false);
  }

  async function syncBillingTotalsFromLines(activeCompanyId: string, nextLines: BillingLineRecord[]) {
    if (!billing) return;
    const nextSubtotal = roundMoney(nextLines.reduce((sum, line) => sum + numericValue(line.subtotal), 0));
    const nextTaxAmount = roundMoney(nextLines.reduce((sum, line) => sum + numericValue(line.tax_amount), 0));
    const nextTotalAmount = roundMoney(nextSubtotal + nextTaxAmount);
    const { data, error } = await supabase
      .from("billing")
      .update({
        invoiced_amount: nextTotalAmount,
        subtotal: nextSubtotal,
        tax_amount: nextTaxAmount,
        total_amount: nextTotalAmount,
      })
      .eq("company_id", activeCompanyId)
      .eq("id", billing.id)
      .select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,cfdi_url,notes,archived_at,archived_by,archive_reason")
      .single();
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudieron recalcular los totales.");
      return;
    }
    const updatedBilling = data as BillingRecord;
    setBilling(updatedBilling);
    setForm(formFromBilling(updatedBilling));
  }

  async function deleteBillingLine(line: BillingLineRecord) {
    if (!companyId) return;
    const shouldDelete = window.confirm("¿Eliminar este concepto de facturación?");
    if (!shouldDelete) return;

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase
      .from("billing_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("id", line.id);
    if (error) {
      setIsSaving(false);
      setErrorMessage(error.message);
      return;
    }
    const nextLines = billingLines.filter((billingLine) => billingLine.id !== line.id);
    setBillingLines(nextLines);
    await syncBillingTotalsFromLines(companyId, nextLines);
    setIsSaving(false);
    setSuccessMessage("Concepto eliminado y totales recalculados.");
  }

  return (
    <>
      {billing ? (
        <PrintableBilling
          billing={billing}
          clientName={clientName}
          delivery={delivery}
          lines={lines}
          order={order}
          orderLinesById={orderLinesById}
          subtotal={subtotal}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          billingLines={billingLines}
        />
      ) : null}
      <div className="space-y-6 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline" href="/dashboard/facturacion">Volver a facturación</Link>
          <div className="flex flex-wrap gap-2">
            {billing?.archived_at ? (
              <button className="h-10 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || isArchiveUpdating || !billing} onClick={restoreBilling} type="button">Restaurar</button>
            ) : (
              <button className="h-10 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || isArchiveUpdating || !billing} onClick={archiveBilling} type="button">Archivar</button>
            )}
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || !billing} onClick={() => window.print()} type="button"><Printer className="h-4 w-4" aria-hidden="true" /> Imprimir resumen</button>
          </div>
        </div>

        {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          {isLoading || !billing ? (
            <p className="text-sm font-medium text-stone-600">Cargando facturación...</p>
          ) : (
            <>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-stone-950">{billing.invoice_folio || "Pendiente de facturar"}</h3>
                    {billing.archived_at ? <ArchiveBadge /> : null}
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} · {clientName}</p>
                </div>
                <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} onClick={() => { if (!showForm) setForm(formFromBilling(billing)); setShowForm((isVisible) => !isVisible); }} type="button">
                  {showForm ? "Ocultar edición" : "Editar facturación"}
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Info label="Cliente" value={clientName} />
                <Info label="Orden" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
                <Info label="Origen" value={billingSourceLabel(billing, billingLines)} />
                <Info label="Entrega" value={deliveryLabel(delivery, billing)} />
                <Info label="Estado" value={billing.status || BILLING_STATUSES[0]} badge />
                <Info label="Subtotal" value={formatMoney(subtotal)} />
                <Info label="IVA" value={formatMoney(taxAmount)} />
                <Info label="Total" value={formatMoney(totalAmount)} />
                <Info label="Importe facturado" value={formatMoney(billing.invoiced_amount ?? totalAmount)} />
                <Info label="Folio factura" value={billing.invoice_folio || "Pendiente de facturar"} />
                <Info label="Facturado el" value={formatDate(billing.invoiced_at)} />
                <Info label="Vence" value={formatDate(billing.due_date)} />
                <Info label="Pagado el" value={formatDate(billing.paid_at)} />
                <Info label="Entregado el" value={formatDate(billing.delivered_at ?? delivery?.delivered_at)} />
                <div className="md:col-span-2 lg:col-span-3"><Info label="CFDI URL" value={billing.cfdi_url || "Sin URL"} /></div>
                <div className="md:col-span-2 lg:col-span-4"><Info label="Notas" value={billing.notes || "Sin notas"} /></div>
              </div>
            </>
          )}
        </section>

        {showForm && form ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
              <BillingInput form={form} id="invoice_folio" label="Folio factura" setForm={setForm} />
              <BillingInput form={form} id="invoiced_at" label="Facturado el" setForm={setForm} type="datetime-local" />
              <BillingInput form={form} id="due_date" label="Fecha de vencimiento" setForm={setForm} type="date" />
              <BillingInput form={form} id="paid_at" label="Pagado el" setForm={setForm} type="datetime-local" />
              <Field id="status" label="Estado">
                <select className={inputClass} id="status" value={form.status} onChange={(event) => setForm((currentForm) => currentForm ? { ...currentForm, status: event.target.value } : currentForm)}>
                  {BILLING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Field>
              <BillingInput form={form} id="cfdi_url" label="CFDI URL" setForm={setForm} type="url" />
              <Field className="lg:col-span-3" id="notes" label="Notas">
                <textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="notes" value={form.notes} onChange={(event) => setForm((currentForm) => currentForm ? { ...currentForm, notes: event.target.value } : currentForm)} />
              </Field>
              <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
                <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : "Guardar"}</button>
                <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={cancelEdit}>Cancelar</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h3 className="text-lg font-semibold text-stone-950">Conceptos consolidados</h3>
            <p className="mt-1 text-sm text-stone-600">{billingLines.length} conceptos ligados a esta factura.</p>
          </div>
          {billingLines.length === 0 ? (
            <div className="p-5 text-sm text-stone-600">No hay conceptos consolidados registrados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-3">Origen</th>
                    <th className="px-5 py-3">Descripción</th>
                    <th className="px-5 py-3">Subtotal</th>
                    <th className="px-5 py-3">IVA</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Detalle</th>
                    <th className="px-5 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {billingLines.map((line) => (
                    <tr className="align-top" key={line.id}>
                      <td className="px-5 py-4">{billingLineSourceLabel(line.source_type)}</td>
                      <td className="px-5 py-4"><span className="font-semibold text-stone-950">{line.description || "Concepto sin descripción"}</span>{line.notes ? <span className="mt-1 block text-stone-600">{line.notes}</span> : null}</td>
                      <td className="px-5 py-4">{formatMoney(line.subtotal)}</td>
                      <td className="px-5 py-4">{formatMoney(line.tax_amount)}</td>
                      <td className="px-5 py-4 font-semibold text-stone-950">{formatMoney(line.total_amount)}</td>
                      <td className="px-5 py-4">{billingLineHref(line) ? <Link className="font-semibold text-emerald-800 hover:underline" href={billingLineHref(line)!}>Ver</Link> : "Sin liga"}</td>
                      <td className="px-5 py-4"><button className="font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-stone-400" disabled={isSaving} onClick={() => deleteBillingLine(line)} type="button">Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h3 className="text-lg font-semibold text-stone-950">Partidas facturables</h3>
            <p className="mt-1 text-sm text-stone-600">{lines.length} partidas tomadas desde la entrega.</p>
          </div>
          {lines.length === 0 ? (
            <div className="p-5 text-sm text-stone-600">No hay partidas para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-3">Partida</th>
                    <th className="px-5 py-3">Cantidad entregada</th>
                    <th className="px-5 py-3">Precio unitario</th>
                    <th className="px-5 py-3">IVA</th>
                    <th className="px-5 py-3">Subtotal</th>
                    <th className="px-5 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {lines.map((line) => {
                    const orderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
                    const amounts = calculateTaxLineAmounts({
                      quantity: line.delivered_quantity ?? line.quantity,
                      taxIncluded: line.tax_included ?? orderLine?.tax_included,
                      taxRate: line.tax_rate ?? orderLine?.tax_rate,
                      unitPrice: orderLine?.sale_unit_price,
                    });
                    return (
                      <tr className="align-top" key={line.id}>
                        <td className="px-5 py-4"><span className="font-semibold text-stone-950">{lineTitle(line)}</span><span className="mt-1 block text-stone-600">{brandModelText(line.brand, line.model)}</span></td>
                        <td className="px-5 py-4">{numericValue(line.delivered_quantity ?? line.quantity)} {line.unit || "pieza"}</td>
                        <td className="px-5 py-4">{formatMoney(orderLine?.sale_unit_price)}</td>
                        <td className="px-5 py-4">{formatTaxRate(line.tax_rate ?? orderLine?.tax_rate)}</td>
                        <td className="px-5 py-4">{formatMoney(amounts.subtotal)}</td>
                        <td className="px-5 py-4 font-semibold text-stone-950">{formatMoney(amounts.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {companyId && billing ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="mb-5 border-b border-stone-200 pb-4">
              <h3 className="text-lg font-semibold text-stone-950">Archivos de facturación</h3>
              <p className="mt-1 text-sm text-stone-600">Adjunta PDF, comprobantes de pago, notas o evidencia relacionada.</p>
            </div>
            <AttachmentManager companyId={companyId} entityId={billingId} entityType="billing" />
          </section>
        ) : null}
      </div>
    </>
  );
}

function PrintableBilling({ billing, billingLines, clientName, delivery, lines, order, orderLinesById, subtotal, taxAmount, totalAmount }: { billing: BillingRecord; billingLines: BillingLineRecord[]; clientName: string; delivery: DeliveryRecord | null; lines: DeliveryLineRecord[]; order: InternalOrderRecord | undefined; orderLinesById: Map<string, InternalOrderLineRecord>; subtotal: number | string | null; taxAmount: number | string | null; totalAmount: number | string | null }) {
  return (
    <section className="hidden print:block print:bg-white print:p-8 print:text-stone-950">
      <div className="border-b border-stone-300 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Facturación / Cobranza</p>
        <h1 className="mt-1 text-2xl font-semibold">Resumen de facturación</h1>
        <p className="mt-1 text-sm">{billing.invoice_folio || "Pendiente de facturar"} · {clientName}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-stone-300 py-5 text-sm">
        <PrintInfo label="Cliente" value={clientName} />
        <PrintInfo label="Orden" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
        <PrintInfo label="Origen" value={billingSourceLabel(billing, billingLines)} />
        <PrintInfo label="Entrega" value={deliveryLabel(delivery, billing)} />
        <PrintInfo label="Estado" value={billing.status || BILLING_STATUSES[0]} />
        <PrintInfo label="Facturado el" value={formatDate(billing.invoiced_at)} />
        <PrintInfo label="Vence" value={formatDate(billing.due_date)} />
        <PrintInfo label="Pagado el" value={formatDate(billing.paid_at)} />
        <PrintInfo label="Entregado el" value={formatDate(billing.delivered_at ?? delivery?.delivered_at)} />
      </div>
      <table className="mt-5 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-300">
            <th className="py-2 pr-3 font-semibold">Partida</th>
            <th className="py-2 pr-3 text-right font-semibold">Entregada</th>
            <th className="py-2 pr-3 text-right font-semibold">Precio</th>
            <th className="py-2 pr-3 text-right font-semibold">Subtotal</th>
            <th className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const orderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
            const amounts = calculateTaxLineAmounts({
              quantity: line.delivered_quantity ?? line.quantity,
              taxIncluded: line.tax_included ?? orderLine?.tax_included,
              taxRate: line.tax_rate ?? orderLine?.tax_rate,
              unitPrice: orderLine?.sale_unit_price,
            });
            return (
              <tr className="border-b border-stone-200 align-top" key={line.id}>
                <td className="py-3 pr-3">{lineTitle(line)}</td>
                <td className="py-3 pr-3 text-right">{numericValue(line.delivered_quantity ?? line.quantity)} {line.unit || "pieza"}</td>
                <td className="py-3 pr-3 text-right">{formatMoney(orderLine?.sale_unit_price)}</td>
                <td className="py-3 pr-3 text-right">{formatMoney(amounts.subtotal)}</td>
                <td className="py-3 text-right">{formatMoney(amounts.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ml-auto mt-6 w-80 space-y-2 border-t border-stone-300 pt-4 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
        <div className="flex justify-between"><span>IVA</span><strong>{formatMoney(taxAmount)}</strong></div>
        <div className="flex justify-between text-base"><span>Total</span><strong>{formatMoney(totalAmount)}</strong></div>
      </div>
      <div className="mt-6 border-t border-stone-300 pt-4 text-sm">
        <PrintInfo label="Notas" value={billing.notes || "Sin notas"} />
      </div>
    </section>
  );
}

function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return <div className={`space-y-2 ${className}`}><label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>{children}</div>;
}
function BillingInput({ form, id, label, setForm, type = "text" }: { form: BillingFormState; id: keyof BillingFormState; label: string; setForm: Dispatch<SetStateAction<BillingFormState | null>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => currentForm ? { ...currentForm, [id]: event.target.value } : currentForm)} /></Field>;
}
function Info({ badge = false, label, value }: { badge?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>{badge ? <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(value)}`}>{value}</span> : <p className="mt-1 break-words text-sm text-stone-800">{value}</p>}</div>;
}
function PrintInfo({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1">{value}</p></div>;
}
