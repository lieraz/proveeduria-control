"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  ArchiveBadge,
  ArchiveFilter,
  ArchiveFilterToggle,
  BulkArchiveActionBar,
} from "@/app/dashboard/archive-controls";
import { BILLING_STATUSES } from "@/app/dashboard/statuses";
import { calculateTaxLineAmounts, numericValue } from "@/src/lib/tax";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = { id: string; name: string | null };
type QuotationRecord = { id: string; folio: string | null; client_id: string | null };
type InternalOrderRecord = { id: string; folio: string | null; quotation_id: string | null; status?: string | null };
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
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  billingLineCount?: number;
  billingLineSourceType?: string | null;
};
type DeliveryRecord = {
  id: string;
  internal_order_id: string | null;
  delivered_at: string | null;
  scheduled_date: string | null;
  status: string | null;
  archived_at: string | null;
};
type ConsolidationSource = {
  id: string;
  sourceType: "delivery" | "internal_order";
  orderId: string | null;
  orderFolio: string | null;
  clientName: string;
  date: string | null;
  status: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  alreadyBilled: boolean;
  duplicateReason: string | null;
};
type BillingLineReference = {
  billing_id: string | null;
  source_type: string | null;
  delivery_id: string | null;
  internal_order_id: string | null;
};
type DeliveryLineRecord = {
  id: string;
  delivery_id?: string | null;
  internal_order_line_id: string | null;
  delivered_quantity: number | string | null;
  quantity: number | string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
  product_description: string | null;
};
type InternalOrderLineRecord = {
  id: string;
  quantity?: number | string | null;
  sale_unit_price: number | string | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
};
type ConsolidationOrderLineRecord = InternalOrderLineRecord & {
  internal_order_id: string | null;
};
type BillingSummary = {
  lineCount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
};
type ManualLineFormState = {
  description: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  notes: string;
};

const inputClass = "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";
const emptyManualLineForm: ManualLineFormState = {
  description: "",
  notes: "",
  subtotal: "",
  tax_amount: "",
  total_amount: "",
};

function normalize(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}
function shortId(value: string) {
  return value.slice(0, 8);
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return value.replace("T", " ").slice(0, 16);
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
function sourceKey(source: Pick<ConsolidationSource, "id" | "sourceType">) {
  return `${source.sourceType}:${source.id}`;
}
function badgeClass(value: string | null | undefined) {
  if (value === "pagado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "facturado") return "border-sky-200 bg-sky-50 text-sky-800";
  if (value === "vencido") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function billingSourceLabel(billing: BillingRecord) {
  if ((billing.billingLineCount ?? 0) > 1) return "Consolidada";
  if (billing.billingLineSourceType === "manual") return "Manual";
  if (billing.billingLineSourceType === "delivery") return "Desde entrega";
  if (billing.billingLineSourceType === "internal_order") return "Desde orden";
  if (billing.delivery_id) return "Desde entrega";
  if (billing.internal_order_id) return "Desde orden";
  return "Manual";
}
function totalsFromLines(lines: DeliveryLineRecord[], orderLinesById: Map<string, InternalOrderLineRecord>) {
  return lines.reduce(
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
  );
}
function totalsFromOrderLines(lines: InternalOrderLineRecord[]) {
  return lines.reduce(
    (summary, line) => {
      const amounts = calculateTaxLineAmounts({
        quantity: line.quantity,
        taxIncluded: line.tax_included,
        taxRate: line.tax_rate,
        unitPrice: line.sale_unit_price,
      });
      return {
        subtotal: summary.subtotal + amounts.subtotal,
        taxAmount: summary.taxAmount + amounts.tax,
        totalAmount: summary.totalAmount + amounts.total,
      };
    },
    { subtotal: 0, taxAmount: 0, totalAmount: 0 },
  );
}

export function FacturacionClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [consolidationSources, setConsolidationSources] = useState<ConsolidationSource[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [deliveryLines, setDeliveryLines] = useState<DeliveryLineRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isConsolidationLoading, setIsConsolidationLoading] = useState(false);
  const [isConsolidationSaving, setIsConsolidationSaving] = useState(false);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [orderLines, setOrderLines] = useState<InternalOrderLineRecord[]>([]);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedBillingIds, setSelectedBillingIds] = useState<Set<string>>(new Set());
  const [selectedConsolidationSourceKeys, setSelectedConsolidationSourceKeys] = useState<Set<string>>(new Set());
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showConsolidationForm, setShowConsolidationForm] = useState(false);
  const [manualLineForm, setManualLineForm] = useState<ManualLineFormState>(emptyManualLineForm);
  const [successMessage, setSuccessMessage] = useState("");

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const deliveriesById = useMemo(() => new Map(deliveries.map((delivery) => [delivery.id, delivery])), [deliveries]);
  const orderLinesById = useMemo(() => new Map(orderLines.map((line) => [line.id, line])), [orderLines]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const quotationsById = useMemo(() => new Map(quotations.map((quotation) => [quotation.id, quotation])), [quotations]);
  const selectedDelivery = selectedDeliveryId ? deliveriesById.get(selectedDeliveryId) : undefined;
  const selectedBillings = useMemo(
    () => billings.filter((billing) => selectedBillingIds.has(billing.id)),
    [billings, selectedBillingIds],
  );
  const selectedArchivedBillingIds = useMemo(
    () => selectedBillings.filter((billing) => billing.archived_at).map((billing) => billing.id),
    [selectedBillings],
  );
  const selectedActiveBillingIds = useMemo(
    () => selectedBillings.filter((billing) => !billing.archived_at).map((billing) => billing.id),
    [selectedBillings],
  );
  const areAllVisibleBillingsSelected =
    billings.length > 0 && billings.every((billing) => selectedBillingIds.has(billing.id));
  const selectedConsolidationSources = useMemo(
    () => consolidationSources.filter((source) => selectedConsolidationSourceKeys.has(sourceKey(source))),
    [consolidationSources, selectedConsolidationSourceKeys],
  );
  const manualLineSubtotal = numericValue(manualLineForm.subtotal);
  const manualLineTaxAmount = numericValue(manualLineForm.tax_amount);
  const manualLineTotalAmount = manualLineForm.total_amount.trim()
    ? numericValue(manualLineForm.total_amount)
    : manualLineSubtotal + manualLineTaxAmount;
  const hasManualLine = manualLineForm.description.trim().length > 0 || manualLineSubtotal > 0 || manualLineTaxAmount > 0 || manualLineTotalAmount > 0;
  const consolidationSummary = useMemo(
    () => {
      const selectedSummary = selectedConsolidationSources.reduce(
        (summary, source) => ({
          subtotal: summary.subtotal + source.subtotal,
          taxAmount: summary.taxAmount + source.taxAmount,
          totalAmount: summary.totalAmount + source.totalAmount,
        }),
        { subtotal: 0, taxAmount: 0, totalAmount: 0 },
      );
      if (!hasManualLine) return selectedSummary;
      return {
        subtotal: selectedSummary.subtotal + manualLineSubtotal,
        taxAmount: selectedSummary.taxAmount + manualLineTaxAmount,
        totalAmount: selectedSummary.totalAmount + manualLineTotalAmount,
      };
    },
    [hasManualLine, manualLineSubtotal, manualLineTaxAmount, manualLineTotalAmount, selectedConsolidationSources],
  );

  const clientNameForOrder = useCallback((order: InternalOrderRecord | undefined) => {
    if (!order) return "Sin orden";
    if (!order.quotation_id) return "Orden manual";
    const quotation = quotationsById.get(order.quotation_id);
    return quotation?.client_id ? clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible" : "Cliente no disponible";
  }, [clientsById, quotationsById]);

  const billingSummary = useMemo(
    () => deliveryLines.reduce<BillingSummary>((summary, line) => {
      const orderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
      const lineAmounts = calculateTaxLineAmounts({
        quantity: line.delivered_quantity ?? line.quantity,
        taxIncluded: line.tax_included ?? orderLine?.tax_included,
        taxRate: line.tax_rate ?? orderLine?.tax_rate,
        unitPrice: orderLine?.sale_unit_price,
      });
      return {
        lineCount: summary.lineCount + 1,
        subtotal: summary.subtotal + lineAmounts.subtotal,
        taxAmount: summary.taxAmount + lineAmounts.tax,
        totalAmount: summary.totalAmount + lineAmounts.total,
      };
    }, { lineCount: 0, subtotal: 0, taxAmount: 0, totalAmount: 0 }),
    [deliveryLines, orderLinesById],
  );

  const filteredBillings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return billings;
    return billings.filter((billing) => {
      const order = billing.internal_order_id ? ordersById.get(billing.internal_order_id) : undefined;
      return [
        billing.invoice_folio,
        clientNameForOrder(order),
        order?.folio,
        billing.status,
      ].some((value) => normalize(value).includes(normalizedSearch));
    });
  }, [billings, clientNameForOrder, ordersById, search]);

  const loadBillings = useCallback(async (activeCompanyId: string, activeArchiveFilter: ArchiveFilter) => {
    setErrorMessage("");
    let query = supabase
      .from("billing")
      .select("id,internal_order_id,delivery_id,delivered_at,subtotal,tax_amount,total_amount,invoiced_amount,invoice_folio,invoiced_at,due_date,paid_at,status,archived_at,archived_by,archive_reason")
      .eq("company_id", activeCompanyId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (activeArchiveFilter === "active") query = query.is("archived_at", null);
    if (activeArchiveFilter === "archived") query = query.not("archived_at", "is", null);

    const { data, error } = await query;
    if (error) {
      setErrorMessage(error.message);
      setBillings([]);
      return;
    }
    const loadedBillings = (data ?? []) as BillingRecord[];
    const billingIds = loadedBillings.map((billing) => billing.id);
    if (billingIds.length === 0) {
      setBillings([]);
      return;
    }

    const { data: billingLinesData, error: billingLinesError } = await supabase
      .from("billing_lines")
      .select("billing_id,source_type,delivery_id,internal_order_id")
      .eq("company_id", activeCompanyId)
      .in("billing_id", billingIds);

    if (billingLinesError) {
      setErrorMessage(billingLinesError.message);
      setBillings(loadedBillings);
      return;
    }

    const lineReferences = (billingLinesData ?? []) as BillingLineReference[];
    const lineCountsByBillingId = new Map<string, number>();
    const firstSourceByBillingId = new Map<string, string | null>();
    lineReferences.forEach((line) => {
      if (!line.billing_id) return;
      lineCountsByBillingId.set(line.billing_id, (lineCountsByBillingId.get(line.billing_id) ?? 0) + 1);
      if (!firstSourceByBillingId.has(line.billing_id)) firstSourceByBillingId.set(line.billing_id, line.source_type);
    });

    setBillings(loadedBillings.map((billing) => ({
      ...billing,
      billingLineCount: lineCountsByBillingId.get(billing.id) ?? 0,
      billingLineSourceType: firstSourceByBillingId.get(billing.id) ?? null,
    })));
  }, [supabase]);

  async function loadDeliveryLines(activeCompanyId: string, deliveryId: string) {
    setDeliveryLines([]);
    setOrderLines([]);
    if (!deliveryId) return;

    const { data, error } = await supabase
      .from("delivery_lines")
      .select("id,internal_order_line_id,delivered_quantity,quantity,tax_included,tax_rate,product_description")
      .eq("company_id", activeCompanyId)
      .eq("delivery_id", deliveryId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const loadedLines = (data ?? []) as DeliveryLineRecord[];
    setDeliveryLines(loadedLines);
    const orderLineIds = loadedLines
      .map((line) => line.internal_order_line_id)
      .filter((id): id is string => Boolean(id));

    if (orderLineIds.length === 0) return;
    const { data: orderLineData, error: orderLineError } = await supabase
      .from("internal_order_lines")
      .select("id,sale_unit_price,tax_included,tax_rate")
      .eq("company_id", activeCompanyId)
      .in("id", orderLineIds);

    if (orderLineError) {
      setErrorMessage(orderLineError.message);
      return;
    }
    setOrderLines((orderLineData ?? []) as InternalOrderLineRecord[]);
  }

  const loadConsolidationSources = useCallback(async (activeCompanyId: string) => {
    setIsConsolidationLoading(true);
    setErrorMessage("");

    const [deliveriesResponse, ordersResponse, billingResponse, billingLinesResponse] = await Promise.all([
      supabase
        .from("deliveries")
        .select("id,internal_order_id,delivered_at,scheduled_date,status,archived_at")
        .eq("company_id", activeCompanyId)
        .is("archived_at", null)
        .order("delivered_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("internal_orders")
        .select("id,folio,quotation_id,status")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("billing")
        .select("delivery_id,internal_order_id,archived_at")
        .eq("company_id", activeCompanyId),
      supabase
        .from("billing_lines")
        .select("source_type,delivery_id,internal_order_id")
        .eq("company_id", activeCompanyId),
    ]);

    const firstError = deliveriesResponse.error ?? ordersResponse.error ?? billingResponse.error ?? billingLinesResponse.error;
    if (firstError) {
      setErrorMessage(firstError.message);
      setConsolidationSources([]);
      setIsConsolidationLoading(false);
      return;
    }

    const loadedDeliveries = (deliveriesResponse.data ?? []) as DeliveryRecord[];
    const loadedOrders = (ordersResponse.data ?? []) as InternalOrderRecord[];
    setDeliveries(loadedDeliveries);
    setOrders(loadedOrders);

    const deliveryIds = loadedDeliveries.map((delivery) => delivery.id);
    const orderIds = loadedOrders.map((order) => order.id);
    const [deliveryLinesResponse, deliveryOrderLinesResponse, orderLinesResponse] = await Promise.all([
      deliveryIds.length > 0
        ? supabase
          .from("delivery_lines")
          .select("id,delivery_id,internal_order_line_id,delivered_quantity,quantity,tax_included,tax_rate,product_description")
          .eq("company_id", activeCompanyId)
          .in("delivery_id", deliveryIds)
        : Promise.resolve({ data: [], error: null }),
      deliveryIds.length > 0
        ? supabase
          .from("internal_order_lines")
          .select("id,quantity,sale_unit_price,tax_included,tax_rate")
          .eq("company_id", activeCompanyId)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? supabase
          .from("internal_order_lines")
          .select("id,internal_order_id,quantity,sale_unit_price,tax_included,tax_rate")
          .eq("company_id", activeCompanyId)
          .in("internal_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const linesError = deliveryLinesResponse.error ?? deliveryOrderLinesResponse.error ?? orderLinesResponse.error;
    if (linesError) {
      setErrorMessage(linesError.message);
      setConsolidationSources([]);
      setIsConsolidationLoading(false);
      return;
    }

    const billedDeliveryIds = new Set<string>();
    const billedDirectOrderIds = new Set<string>();
    ((billingResponse.data ?? []) as Array<{ delivery_id: string | null; internal_order_id: string | null; archived_at: string | null }>).forEach((billing) => {
      if (billing.delivery_id) billedDeliveryIds.add(billing.delivery_id);
      if (!billing.delivery_id && !billing.archived_at && billing.internal_order_id) billedDirectOrderIds.add(billing.internal_order_id);
    });
    ((billingLinesResponse.data ?? []) as Array<{ source_type: string | null; delivery_id: string | null; internal_order_id: string | null }>).forEach((line) => {
      if (line.delivery_id) billedDeliveryIds.add(line.delivery_id);
      if (line.source_type === "internal_order" && line.internal_order_id) billedDirectOrderIds.add(line.internal_order_id);
    });

    const loadedDeliveryLines = (deliveryLinesResponse.data ?? []) as DeliveryLineRecord[];
    const deliveryLinesByDeliveryId = new Map<string, DeliveryLineRecord[]>();
    loadedDeliveryLines.forEach((line) => {
      if (!line.delivery_id) return;
      deliveryLinesByDeliveryId.set(line.delivery_id, [...(deliveryLinesByDeliveryId.get(line.delivery_id) ?? []), line]);
    });
    const deliveryOrderLinesById = new Map(((deliveryOrderLinesResponse.data ?? []) as InternalOrderLineRecord[]).map((line) => [line.id, line]));

    const orderLinesByOrderId = new Map<string, ConsolidationOrderLineRecord[]>();
    ((orderLinesResponse.data ?? []) as ConsolidationOrderLineRecord[]).forEach((line) => {
      if (!line.internal_order_id) return;
      orderLinesByOrderId.set(line.internal_order_id, [...(orderLinesByOrderId.get(line.internal_order_id) ?? []), line]);
    });

    const orderMap = new Map(loadedOrders.map((order) => [order.id, order]));
    const deliverySources = loadedDeliveries.map((delivery) => {
      const order = delivery.internal_order_id ? orderMap.get(delivery.internal_order_id) : undefined;
      const totals = totalsFromLines(deliveryLinesByDeliveryId.get(delivery.id) ?? [], deliveryOrderLinesById);
      return {
        alreadyBilled: billedDeliveryIds.has(delivery.id),
        clientName: clientNameForOrder(order),
        date: delivery.delivered_at ?? delivery.scheduled_date,
        duplicateReason: billedDeliveryIds.has(delivery.id) ? "Ya facturada" : null,
        id: delivery.id,
        orderFolio: order?.folio ?? null,
        orderId: delivery.internal_order_id,
        sourceType: "delivery" as const,
        status: delivery.status,
        subtotal: roundMoney(totals.subtotal),
        taxAmount: roundMoney(totals.taxAmount),
        totalAmount: roundMoney(totals.totalAmount),
      };
    });
    const orderSources = loadedOrders.map((order) => {
      const totals = totalsFromOrderLines(orderLinesByOrderId.get(order.id) ?? []);
      return {
        alreadyBilled: billedDirectOrderIds.has(order.id),
        clientName: clientNameForOrder(order),
        date: null,
        duplicateReason: billedDirectOrderIds.has(order.id) ? "Ya facturada desde orden" : null,
        id: order.id,
        orderFolio: order.folio,
        orderId: order.id,
        sourceType: "internal_order" as const,
        status: order.status ?? null,
        subtotal: roundMoney(totals.subtotal),
        taxAmount: roundMoney(totals.taxAmount),
        totalAmount: roundMoney(totals.totalAmount),
      };
    });

    setConsolidationSources([...deliverySources, ...orderSources]);
    setSelectedConsolidationSourceKeys(new Set());
    setIsConsolidationLoading(false);
  }, [clientNameForOrder, supabase]);

  async function toggleConsolidationForm() {
    const shouldShow = !showConsolidationForm;
    setShowConsolidationForm(shouldShow);
    setErrorMessage("");
    setSuccessMessage("");
    if (shouldShow && companyId) await loadConsolidationSources(companyId);
  }

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
      const [ordersResponse, quotationsResponse, clientsResponse, deliveriesResponse] = await Promise.all([
        supabase.from("internal_orders").select("id,folio,quotation_id").eq("company_id", activeCompanyId).order("created_at", { ascending: false }),
        supabase.from("quotations").select("id,folio,client_id").eq("company_id", activeCompanyId),
        supabase.from("clients").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase.from("deliveries").select("id,internal_order_id,delivered_at,scheduled_date,status,archived_at").eq("company_id", activeCompanyId).is("archived_at", null).order("delivered_at", { ascending: false, nullsFirst: false }),
      ]);
      const firstError = ordersResponse.error ?? quotationsResponse.error ?? clientsResponse.error ?? deliveriesResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      setQuotations((quotationsResponse.data ?? []) as QuotationRecord[]);
      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setDeliveries((deliveriesResponse.data ?? []) as DeliveryRecord[]);
      await loadBillings(activeCompanyId, "active");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadBillings, supabase]);

  async function handleArchiveFilterChange(nextFilter: ArchiveFilter) {
    setArchiveFilter(nextFilter);
    setSelectedBillingIds(new Set());
    if (companyId) await loadBillings(companyId, nextFilter);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    if (companyId) await loadBillings(companyId, archiveFilter);
    setIsSearching(false);
  }

  async function handleDeliveryChange(deliveryId: string) {
    setSelectedDeliveryId(deliveryId);
    setErrorMessage("");
    if (companyId) await loadDeliveryLines(companyId, deliveryId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }
    if (!selectedDelivery) {
      setErrorMessage("Selecciona una entrega.");
      return;
    }
    if (!selectedDelivery.internal_order_id) {
      setErrorMessage("La entrega seleccionada no tiene una orden interna ligada.");
      return;
    }
    if (deliveryLines.length === 0) {
      setErrorMessage("La entrega seleccionada no tiene partidas entregadas.");
      return;
    }

    const subtotal = roundMoney(billingSummary.subtotal);
    const taxAmount = roundMoney(billingSummary.taxAmount);
    const totalAmount = roundMoney(billingSummary.totalAmount);
    if (totalAmount <= 0) {
      setErrorMessage("No se pudo calcular un total facturable mayor a cero. Revisa los precios de venta de la orden.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("billing")
      .insert({
        company_id: companyId,
        delivered_at: selectedDelivery.delivered_at,
        delivery_id: selectedDelivery.id,
        internal_order_id: selectedDelivery.internal_order_id,
        invoiced_amount: totalAmount,
        status: "pendiente de facturar",
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      })
      .select("id")
      .single();

    setIsSaving(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo crear el registro de facturación.");
      return;
    }

    setSelectedDeliveryId("");
    setDeliveryLines([]);
    setOrderLines([]);
    setShowCreateForm(false);
    setSuccessMessage("Factura / cobranza creada correctamente.");
    router.push(`/dashboard/facturacion/${data.id}`);
  }

  function toggleConsolidationSource(source: ConsolidationSource) {
    if (source.alreadyBilled) return;
    setSelectedConsolidationSourceKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      const key = sourceKey(source);
      if (nextKeys.has(key)) nextKeys.delete(key);
      else nextKeys.add(key);
      return nextKeys;
    });
  }

  async function createConsolidatedBilling() {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }
    if (selectedConsolidationSources.length === 0 && !hasManualLine) {
      setErrorMessage("Selecciona al menos una entrega, orden o línea manual.");
      return;
    }
    if (hasManualLine && !manualLineForm.description.trim()) {
      setErrorMessage("Captura la descripción de la línea manual.");
      return;
    }

    const subtotal = roundMoney(consolidationSummary.subtotal);
    const taxAmount = roundMoney(consolidationSummary.taxAmount);
    const totalAmount = roundMoney(consolidationSummary.totalAmount);
    if (totalAmount <= 0) {
      setErrorMessage("El total consolidado debe ser mayor a cero.");
      return;
    }

    setIsConsolidationSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const deliveryIds = selectedConsolidationSources.filter((source) => source.sourceType === "delivery").map((source) => source.id);
    const orderIds = selectedConsolidationSources.filter((source) => source.sourceType === "internal_order").map((source) => source.id);
    const [existingDeliveryLinesResponse, existingOrderLinesResponse, existingBillingDeliveriesResponse, existingBillingOrdersResponse] = await Promise.all([
      deliveryIds.length > 0
        ? supabase.from("billing_lines").select("delivery_id").eq("company_id", companyId).in("delivery_id", deliveryIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? supabase.from("billing_lines").select("internal_order_id").eq("company_id", companyId).eq("source_type", "internal_order").in("internal_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      deliveryIds.length > 0
        ? supabase.from("billing").select("delivery_id").eq("company_id", companyId).in("delivery_id", deliveryIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length > 0
        ? supabase.from("billing").select("internal_order_id").eq("company_id", companyId).is("delivery_id", null).is("archived_at", null).in("internal_order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const duplicateError = existingDeliveryLinesResponse.error ?? existingOrderLinesResponse.error ?? existingBillingDeliveriesResponse.error ?? existingBillingOrdersResponse.error;
    if (duplicateError) {
      setIsConsolidationSaving(false);
      setErrorMessage(duplicateError.message);
      return;
    }
    const hasDuplicates =
      (existingDeliveryLinesResponse.data ?? []).length > 0 ||
      (existingOrderLinesResponse.data ?? []).length > 0 ||
      (existingBillingDeliveriesResponse.data ?? []).length > 0 ||
      (existingBillingOrdersResponse.data ?? []).length > 0;
    if (hasDuplicates) {
      setIsConsolidationSaving(false);
      setErrorMessage("Una o más fuentes ya fueron facturadas. Actualiza la lista e intenta de nuevo.");
      await loadConsolidationSources(companyId);
      return;
    }

    const singleSource = selectedConsolidationSources.length === 1 && !hasManualLine ? selectedConsolidationSources[0] : null;
    const { data: billingData, error: billingError } = await supabase
      .from("billing")
      .insert({
        company_id: companyId,
        delivery_id: null,
        internal_order_id: singleSource?.orderId ?? null,
        invoiced_amount: totalAmount,
        notes: "Factura consolidada",
        status: "pendiente de facturar",
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      })
      .select("id")
      .single();

    if (billingError || !billingData) {
      setIsConsolidationSaving(false);
      setErrorMessage(billingError?.message ?? "No se pudo crear la factura consolidada.");
      return;
    }

    const billingId = billingData.id as string;
    const billingLinesPayload = [
      ...selectedConsolidationSources.map((source) => ({
        billing_id: billingId,
        company_id: companyId,
        delivery_id: source.sourceType === "delivery" ? source.id : null,
        description: source.sourceType === "delivery"
          ? `Entrega / Orden #${source.orderFolio || source.orderId || source.id.slice(0, 8)}`
          : `Orden #${source.orderFolio || source.id.slice(0, 8)}`,
        internal_order_id: source.orderId,
        source_type: source.sourceType,
        subtotal: source.subtotal,
        tax_amount: source.taxAmount,
        total_amount: source.totalAmount,
      })),
      ...(hasManualLine ? [{
        billing_id: billingId,
        company_id: companyId,
        delivery_id: null,
        description: manualLineForm.description.trim(),
        internal_order_id: null,
        notes: manualLineForm.notes.trim() || null,
        source_type: "manual",
        subtotal: roundMoney(manualLineSubtotal),
        tax_amount: roundMoney(manualLineTaxAmount),
        total_amount: roundMoney(manualLineTotalAmount),
      }] : []),
    ];

    const { error: billingLinesError } = await supabase.from("billing_lines").insert(billingLinesPayload);
    setIsConsolidationSaving(false);
    if (billingLinesError) {
      setErrorMessage(billingLinesError.message);
      return;
    }

    setManualLineForm(emptyManualLineForm);
    setSelectedConsolidationSourceKeys(new Set());
    setShowConsolidationForm(false);
    setSuccessMessage("Factura consolidada creada correctamente.");
    await loadBillings(companyId, archiveFilter);
    router.push(`/dashboard/facturacion/${billingId}`);
  }

  async function archiveBillings(billingIds: string[]) {
    if (!companyId || billingIds.length === 0) return;
    const shouldArchive = window.confirm("¿Archivar los registros seleccionados?");
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
      .from("billing")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id, archive_reason: "Archivado manualmente" })
      .eq("company_id", companyId)
      .in("id", billingIds);
    setIsArchiveUpdating(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSelectedBillingIds(new Set());
    setSuccessMessage("Registro archivado correctamente.");
    await loadBillings(companyId, archiveFilter);
  }

  async function restoreBillings(billingIds: string[]) {
    if (!companyId || billingIds.length === 0) return;
    const shouldRestore = window.confirm("¿Restaurar los registros seleccionados?");
    if (!shouldRestore) return;
    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { error } = await supabase
      .from("billing")
      .update({ archived_at: null, archived_by: null, archive_reason: null })
      .eq("company_id", companyId)
      .in("id", billingIds);
    setIsArchiveUpdating(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSelectedBillingIds(new Set());
    setSuccessMessage("Registro restaurado correctamente.");
    await loadBillings(companyId, archiveFilter);
  }

  function toggleBillingSelection(billingId: string) {
    setSelectedBillingIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(billingId)) nextIds.delete(billingId);
      else nextIds.add(billingId);
      return nextIds;
    });
  }

  function toggleAllVisibleBillings() {
    setSelectedBillingIds((currentIds) => {
      if (areAllVisibleBillingsSelected) {
        const nextIds = new Set(currentIds);
        billings.forEach((billing) => nextIds.delete(billing.id));
        return nextIds;
      }
      return new Set([...currentIds, ...billings.map((billing) => billing.id)]);
    });
  }

  return (
    <div className="space-y-6">
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Nueva factura / cobranza</h3>
            <p className="mt-1 text-sm text-stone-600">Selecciona una entrega para calcular los importes facturables desde sus partidas entregadas.</p>
          </div>
          <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} onClick={() => setShowCreateForm((isVisible) => !isVisible)} type="button">
            {showCreateForm ? "Ocultar formulario" : "Nueva factura / cobranza"}
          </button>
        </div>

        {showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <div className="space-y-2 lg:col-span-3">
              <label className="text-sm font-medium text-stone-800" htmlFor="delivery_id">Entrega</label>
              <select className={inputClass} id="delivery_id" required value={selectedDeliveryId} onChange={(event) => handleDeliveryChange(event.target.value)}>
                <option value="">Selecciona entrega</option>
                {deliveries.map((delivery) => {
                  const order = delivery.internal_order_id ? ordersById.get(delivery.internal_order_id) : undefined;
                  return <option key={delivery.id} value={delivery.id}>Entrega {shortId(delivery.id)} - {order?.folio ? `Orden #${order.folio}` : "Sin folio"} - {clientNameForOrder(order)}</option>;
                })}
              </select>
            </div>
            <Info label="Entrega" value={selectedDelivery ? `Entrega ${shortId(selectedDelivery.id)}` : "Sin selección"} />
            <Info label="Orden" value={selectedDelivery?.internal_order_id ? ordersById.get(selectedDelivery.internal_order_id)?.folio ? `Orden #${ordersById.get(selectedDelivery.internal_order_id)?.folio}` : "Orden sin folio" : "Sin orden"} />
            <Info label="Entregado el" value={formatDate(selectedDelivery?.delivered_at)} />
            <Info label="Subtotal" value={formatMoney(billingSummary.subtotal)} />
            <Info label="IVA" value={formatMoney(billingSummary.taxAmount)} />
            <Info label="Total" value={formatMoney(billingSummary.totalAmount)} />
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 lg:col-span-3">
              <p className="text-sm font-semibold text-stone-950">Partidas detectadas: {billingSummary.lineCount}</p>
              <p className="mt-1 text-sm text-stone-600">El cálculo usa cantidad entregada, IVA y precio de venta de la orden interna ligada.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} type="submit">{isSaving ? "Guardando..." : "Crear factura / cobranza"}</button>
              <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={() => setShowCreateForm(false)}>Cancelar</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showConsolidationForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Factura consolidada</h3>
            <p className="mt-1 text-sm text-stone-600">Agrupa varias entregas, órdenes excepcionales o un concepto manual en una sola cobranza.</p>
          </div>
          <button className="h-10 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isConsolidationSaving} onClick={toggleConsolidationForm} type="button">
            {showConsolidationForm ? "Ocultar consolidación" : "Consolidar factura"}
          </button>
        </div>

        {showConsolidationForm ? (
          <div className="space-y-5 rounded-lg border border-stone-200 p-4">
            {isConsolidationLoading ? (
              <p className="text-sm font-medium text-stone-600">Cargando fuentes disponibles...</p>
            ) : (
              <>
                <ConsolidationSourceTable
                  emptyText="No hay entregas para consolidar."
                  onToggle={toggleConsolidationSource}
                  selectedKeys={selectedConsolidationSourceKeys}
                  sources={consolidationSources.filter((source) => source.sourceType === "delivery")}
                  title="Entregas"
                />
                <ConsolidationSourceTable
                  emptyText="No hay órdenes para consolidar."
                  onToggle={toggleConsolidationSource}
                  selectedKeys={selectedConsolidationSourceKeys}
                  sources={consolidationSources.filter((source) => source.sourceType === "internal_order")}
                  title="Órdenes"
                />

                <div className="grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 lg:grid-cols-4">
                  <div className="space-y-2 lg:col-span-4">
                    <h4 className="text-sm font-semibold text-stone-950">Línea manual</h4>
                    <p className="text-sm text-stone-600">Úsala para cargos operativos que no vienen de una entrega u orden.</p>
                  </div>
                  <Field id="manual_description" label="Descripción">
                    <input className={inputClass} id="manual_description" value={manualLineForm.description} onChange={(event) => setManualLineForm((current) => ({ ...current, description: event.target.value }))} />
                  </Field>
                  <Field id="manual_subtotal" label="Subtotal">
                    <input className={inputClass} id="manual_subtotal" min="0" step="0.01" type="number" value={manualLineForm.subtotal} onChange={(event) => setManualLineForm((current) => ({ ...current, subtotal: event.target.value, total_amount: current.total_amount || String(numericValue(event.target.value) + numericValue(current.tax_amount)) }))} />
                  </Field>
                  <Field id="manual_tax" label="IVA">
                    <input className={inputClass} id="manual_tax" min="0" step="0.01" type="number" value={manualLineForm.tax_amount} onChange={(event) => setManualLineForm((current) => ({ ...current, tax_amount: event.target.value, total_amount: current.total_amount || String(numericValue(current.subtotal) + numericValue(event.target.value)) }))} />
                  </Field>
                  <Field id="manual_total" label="Total">
                    <input className={inputClass} id="manual_total" min="0" step="0.01" type="number" value={manualLineForm.total_amount} onChange={(event) => setManualLineForm((current) => ({ ...current, total_amount: event.target.value }))} />
                  </Field>
                  <Field className="lg:col-span-4" id="manual_notes" label="Notas">
                    <textarea className="min-h-20 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="manual_notes" value={manualLineForm.notes} onChange={(event) => setManualLineForm((current) => ({ ...current, notes: event.target.value }))} />
                  </Field>
                </div>

                <div className="grid gap-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 md:grid-cols-4">
                  <Info label="Fuentes seleccionadas" value={String(selectedConsolidationSources.length)} />
                  <Info label="Subtotal" value={formatMoney(consolidationSummary.subtotal)} />
                  <Info label="IVA" value={formatMoney(consolidationSummary.taxAmount)} />
                  <Info label="Total" value={formatMoney(consolidationSummary.totalAmount)} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isConsolidationSaving} onClick={createConsolidatedBilling} type="button">{isConsolidationSaving ? "Creando..." : "Crear factura consolidada"}</button>
                  <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={() => setShowConsolidationForm(false)}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">Facturación registrada</h3>
              <p className="mt-1 text-sm text-stone-600">Busca por folio de factura, cliente, orden o estado.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ArchiveFilterToggle disabled={isLoading} onChange={handleArchiveFilterChange} value={archiveFilter} />
              <form className="flex gap-2" onSubmit={handleSearch}>
                <input className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 sm:w-72" placeholder="Buscar facturación" value={search} onChange={(event) => setSearch(event.target.value)} />
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50" disabled={isSearching} type="submit"><Search className="h-4 w-4" /> {isSearching ? "Buscando..." : "Buscar"}</button>
              </form>
            </div>
          </div>
        </div>

        <BulkArchiveActionBar archivedCount={selectedArchivedBillingIds.length} disabled={isArchiveUpdating} filter={archiveFilter} onArchive={() => archiveBillings(selectedActiveBillingIds)} onRestore={() => restoreBillings(selectedArchivedBillingIds)} selectedCount={selectedBillings.length} />

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">Cargando facturación...</div>
        ) : filteredBillings.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">No hay registros para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-10 px-5 py-3"><input checked={areAllVisibleBillingsSelected} onChange={toggleAllVisibleBillings} type="checkbox" /></th>
                  <th className="px-5 py-3">Factura</th>
                  <th className="px-5 py-3">Origen</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Orden</th>
                  <th className="px-5 py-3">Subtotal</th>
                  <th className="px-5 py-3">IVA</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Vence</th>
                  <th className="px-5 py-3">Pagado</th>
                  <th className="px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredBillings.map((billing) => {
                  const order = billing.internal_order_id ? ordersById.get(billing.internal_order_id) : undefined;
                  return (
                    <tr className="align-top" key={billing.id}>
                      <td className="px-5 py-4"><input checked={selectedBillingIds.has(billing.id)} onChange={() => toggleBillingSelection(billing.id)} type="checkbox" /></td>
                      <td className="px-5 py-4 font-semibold text-stone-950"><Link className="text-emerald-800 hover:underline" href={`/dashboard/facturacion/${billing.id}`}>{billing.invoice_folio || "Pendiente de facturar"}</Link>{billing.archived_at ? <span className="mt-2 block"><ArchiveBadge /></span> : null}</td>
                      <td className="px-5 py-4"><span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700">{billingSourceLabel(billing)}</span></td>
                      <td className="px-5 py-4">{clientNameForOrder(order)}</td>
                      <td className="px-5 py-4">{order?.folio ? `Orden #${order.folio}` : "Sin folio"}</td>
                      <td className="px-5 py-4">{formatMoney(billing.subtotal)}</td>
                      <td className="px-5 py-4">{formatMoney(billing.tax_amount)}</td>
                      <td className="px-5 py-4 font-semibold text-stone-950">{formatMoney(billing.total_amount)}</td>
                      <td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(billing.status)}`}>{billing.status || BILLING_STATUSES[0]}</span></td>
                      <td className="px-5 py-4">{formatDate(billing.due_date)}</td>
                      <td className="px-5 py-4">{formatDate(billing.paid_at)}</td>
                      <td className="px-5 py-4"><Link className="text-sm font-semibold text-emerald-800 hover:underline" href={`/dashboard/facturacion/${billing.id}`}>Ver</Link></td>
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

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 break-words text-sm text-stone-800">{value}</p></div>;
}
function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return <div className={`space-y-2 ${className}`}><label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>{children}</div>;
}
function ConsolidationSourceTable({ emptyText, onToggle, selectedKeys, sources, title }: { emptyText: string; onToggle: (source: ConsolidationSource) => void; selectedKeys: Set<string>; sources: ConsolidationSource[]; title: string }) {
  return (
    <div className="rounded-lg border border-stone-200">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
        <h4 className="text-sm font-semibold text-stone-950">{title}</h4>
      </div>
      {sources.length === 0 ? (
        <p className="p-4 text-sm text-stone-600">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="w-10 px-4 py-3">Sel.</th>
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Disponibilidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-white">
              {sources.map((source) => {
                const key = sourceKey(source);
                return (
                  <tr className={source.alreadyBilled ? "bg-stone-50 text-stone-400" : "align-top"} key={key}>
                    <td className="px-4 py-3"><input checked={selectedKeys.has(key)} disabled={source.alreadyBilled} onChange={() => onToggle(source)} type="checkbox" /></td>
                    <td className="px-4 py-3">{source.orderFolio ? `Orden #${source.orderFolio}` : "Sin folio"}</td>
                    <td className="px-4 py-3">{source.clientName}</td>
                    <td className="px-4 py-3">{formatDate(source.date)}</td>
                    <td className="px-4 py-3">{source.status || "Sin estado"}</td>
                    <td className="px-4 py-3 font-semibold text-stone-950">{formatMoney(source.totalAmount)}</td>
                    <td className="px-4 py-3">{source.duplicateReason || "Disponible"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
