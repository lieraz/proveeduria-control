"use client";

import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { ArchiveBadge } from "@/app/dashboard/archive-controls";
import {
  PURCHASE_RUN_LINE_STATUSES,
  PURCHASE_RUN_STATUSES,
} from "@/app/dashboard/statuses";
import { createClient } from "@/src/lib/supabase/client";

type SupplierRecord = { id: string; name: string | null };
type ProductRecord = { id: string; name: string | null; brand: string | null; description: string | null; model: string | null; unit: string | null };
type InternalOrderRecord = { id: string; folio: string | null; status: string | null };
type PaymentMethodRecord = { id: string; name: string | null; bank_name: string | null; last_four: string | null };
type InternalOrderLineRecord = {
  id: string;
  product_id: string | null;
  brand: string | null;
  model: string | null;
  product_description: string | null;
  supplier_cost: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  status: string | null;
};
type PurchaseRunRecord = {
  id: string;
  supplier_id: string | null;
  internal_order_id: string | null;
  purchase_method: string | null;
  assigned_to: string | null;
  pickup_address: string | null;
  scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_to_office_at: string | null;
  marketplace_order_number: string | null;
  tracking_number: string | null;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  status: string | null;
  payment_method_id: string | null;
  payment_status: string | null;
  payment_reference: string | null;
  paid_amount: number | string | null;
  paid_by: string | null;
  supplier_invoice_number: string | null;
  purchase_total: number | string | null;
  receipt_url: string | null;
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};
type PurchaseRunLineRecord = {
  id: string;
  internal_order_line_id: string | null;
  product_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  quantity: number | string | null;
  unit: string | null;
  expected_unit_cost: number | string | null;
  actual_unit_cost: number | string | null;
  status: string | null;
  notes: string | null;
};
type HeaderFormState = {
  internal_order_id: string;
  supplier_id: string;
  purchase_method: string;
  assigned_to: string;
  pickup_address: string;
  scheduled_at: string;
  picked_up_at: string;
  delivered_to_office_at: string;
  marketplace_order_number: string;
  tracking_number: string;
  estimated_delivery_at: string;
  delivered_at: string;
  status: string;
  payment_method_id: string;
  payment_status: string;
  payment_reference: string;
  paid_amount: string;
  paid_by: string;
  supplier_invoice_number: string;
  purchase_total: string;
  receipt_url: string;
  notes: string;
};
type LineFormState = {
  internal_order_line_id: string;
  product_id: string;
  product_description: string;
  brand: string;
  model: string;
  quantity: string;
  unit: string;
  expected_unit_cost: string;
  actual_unit_cost: string;
  status: string;
  notes: string;
};

const purchaseMethods = [
  { value: "recoleccion", label: "Recolección" },
  { value: "domicilio", label: "Domicilio" },
  { value: "envio", label: "Envío" },
  { value: "digital", label: "Digital" },
  { value: "otro", label: "Otro" },
];
const paymentStatuses = ["pendiente", "parcial", "pagado"];
const inputClass = "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";

const emptyLineForm: LineFormState = {
  internal_order_line_id: "",
  product_id: "",
  product_description: "",
  brand: "",
  model: "",
  quantity: "1",
  unit: "pieza",
  expected_unit_cost: "",
  actual_unit_cost: "",
  status: "pendiente",
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
function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", { currency: "MXN", style: "currency" }).format(toNumber(value));
}
function formatPaidAmount(value: number | string | null | undefined) {
  return toNumber(value) > 0 ? formatMoney(value) : "Sin monto pagado";
}
function hasPaidWarning(paymentStatus: string | null | undefined, paidAmount: number | string | null | undefined) {
  return paymentStatus === "pagado" && toNumber(paidAmount) <= 0;
}
function methodLabel(value: string | null | undefined) {
  return purchaseMethods.find((method) => method.value === value)?.label ?? value ?? "Sin método";
}
function brandModelText(brand: string | null | undefined, model: string | null | undefined) {
  return [brand, model].filter(Boolean).join(" / ") || "Sin marca/modelo";
}
function badgeClass(value: string | null | undefined) {
  if (["pagado", "comprado", "recogido", "entregado en oficina", "entregado en domicilio"].includes(value ?? "")) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "cancelado" || value === "no disponible") return "border-red-200 bg-red-50 text-red-700";
  if (["parcial", "asignada", "en camino", "en tránsito", "sustituido"].includes(value ?? "")) return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function paymentMethodLabel(paymentMethod: PaymentMethodRecord | undefined) {
  if (!paymentMethod) return "Sin método de pago";
  const lastFour = paymentMethod.last_four ? `****${paymentMethod.last_four}` : null;
  return [paymentMethod.name, paymentMethod.bank_name, lastFour].filter(Boolean).join(" · ");
}
function productLabel(product: ProductRecord | undefined) {
  return product?.name ?? "Sin producto";
}
function lineTitle(line: PurchaseRunLineRecord, productsById: Map<string, ProductRecord>) {
  if (line.product_id) {
    const product = productsById.get(line.product_id);
    if (product?.name) return product.name;
  }
  return line.product_description || "Partida sin descripción";
}

type CompraDetalleClientProps = { purchaseRunId: string };

export function CompraDetalleClient({ purchaseRunId }: CompraDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(new Set());
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [headerForm, setHeaderForm] = useState<HeaderFormState | null>(null);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isHeaderSaving, setIsHeaderSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLineSaving, setIsLineSaving] = useState(false);
  const [lineForm, setLineForm] = useState<LineFormState>(emptyLineForm);
  const [lines, setLines] = useState<PurchaseRunLineRecord[]>([]);
  const [orderLines, setOrderLines] = useState<InternalOrderLineRecord[]>([]);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [purchaseRun, setPurchaseRun] = useState<PurchaseRunRecord | null>(null);
  const [showHeaderForm, setShowHeaderForm] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const suppliersById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const paymentMethodsById = useMemo(() => new Map(paymentMethods.map((method) => [method.id, method])), [paymentMethods]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const orderLinesById = useMemo(() => new Map(orderLines.map((line) => [line.id, line])), [orderLines]);

  const totals = useMemo(() => lines.reduce(
    (summary, line) => {
      const quantity = toNumber(line.quantity);
      const expected = quantity * toNumber(line.expected_unit_cost);
      const actual = quantity * toNumber(line.actual_unit_cost);
      return {
        expectedTotal: summary.expectedTotal + expected,
        actualTotal: summary.actualTotal + actual,
        difference: summary.difference + actual - expected,
      };
    },
    { expectedTotal: 0, actualTotal: 0, difference: 0 },
  ), [lines]);

  const loadLines = useCallback(async (activeCompanyId: string) => {
    const { data, error } = await supabase
      .from("purchase_run_lines")
      .select("*")
      .eq("company_id", activeCompanyId)
      .eq("purchase_run_id", purchaseRunId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLines([]);
      return [];
    }

    const loadedLines = (data ?? []) as PurchaseRunLineRecord[];
    setLines(loadedLines);
    return loadedLines;
  }, [purchaseRunId, supabase]);

  const refreshPurchaseTotal = useCallback(async (activeCompanyId: string, nextLines: PurchaseRunLineRecord[]) => {
    const actualTotal = nextLines.reduce((total, line) => total + toNumber(line.quantity) * toNumber(line.actual_unit_cost), 0);
    const { error } = await supabase
      .from("purchase_runs")
      .update({ purchase_total: actualTotal })
      .eq("company_id", activeCompanyId)
      .eq("id", purchaseRunId);

    if (!error) {
      setPurchaseRun((currentRun) => currentRun ? { ...currentRun, purchase_total: actualTotal } : currentRun);
      setHeaderForm((currentForm) => currentForm ? { ...currentForm, purchase_total: String(actualTotal) } : currentForm);
    }
  }, [purchaseRunId, supabase]);

  const loadOrderLines = useCallback(async (activeCompanyId: string, internalOrderId: string | null | undefined) => {
    if (!internalOrderId) {
      setOrderLines([]);
      return;
    }

    const { data, error } = await supabase
      .from("internal_order_lines")
      .select("id,product_id,brand,model,product_description,supplier_cost,quantity,unit,status")
      .eq("company_id", activeCompanyId)
      .eq("internal_order_id", internalOrderId)
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile?.company_id) {
        setErrorMessage(profileError?.message ?? "Tu perfil no tiene una empresa asignada.");
        setIsLoading(false);
        return;
      }

      const activeCompanyId = profile.company_id as string;
      setCompanyId(activeCompanyId);
      const [runResponse, suppliersResponse, productsResponse, ordersResponse, paymentMethodsResponse] = await Promise.all([
        supabase.from("purchase_runs").select("*").eq("company_id", activeCompanyId).eq("id", purchaseRunId).maybeSingle(),
        supabase.from("suppliers").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase.from("products").select("id,name,brand,description,model,unit").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase.from("internal_orders").select("id,folio,status").eq("company_id", activeCompanyId).order("created_at", { ascending: false }),
        supabase.from("payment_methods").select("id,name,bank_name,last_four").eq("company_id", activeCompanyId).eq("active", true).order("name", { ascending: true }),
      ]);

      const firstError = runResponse.error ?? suppliersResponse.error ?? productsResponse.error ?? ordersResponse.error ?? paymentMethodsResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }
      if (!runResponse.data) {
        setErrorMessage("No se encontró la compra.");
        setIsLoading(false);
        return;
      }

      const run = runResponse.data as PurchaseRunRecord;
      setPurchaseRun(run);
      setHeaderForm(headerFormFromRun(run));
      setSuppliers((suppliersResponse.data ?? []) as SupplierRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      setPaymentMethods((paymentMethodsResponse.data ?? []) as PaymentMethodRecord[]);
      const loadedLines = await loadLines(activeCompanyId);
      await loadOrderLines(activeCompanyId, run.internal_order_id);
      await refreshPurchaseTotal(activeCompanyId, loadedLines);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadLines, loadOrderLines, purchaseRunId, refreshPurchaseTotal, supabase]);

  function headerFormFromRun(run: PurchaseRunRecord): HeaderFormState {
    return {
      internal_order_id: run.internal_order_id ?? "",
      supplier_id: run.supplier_id ?? "",
      purchase_method: run.purchase_method ?? "recoleccion",
      assigned_to: run.assigned_to ?? "",
      pickup_address: run.pickup_address ?? "",
      scheduled_at: formatDateInput(run.scheduled_at),
      picked_up_at: formatDateInput(run.picked_up_at),
      delivered_to_office_at: formatDateInput(run.delivered_to_office_at),
      marketplace_order_number: run.marketplace_order_number ?? "",
      tracking_number: run.tracking_number ?? "",
      estimated_delivery_at: formatDateInput(run.estimated_delivery_at),
      delivered_at: formatDateInput(run.delivered_at),
      status: run.status ?? "pendiente",
      payment_method_id: run.payment_method_id ?? "",
      payment_status: run.payment_status ?? "pendiente",
      payment_reference: run.payment_reference ?? "",
      paid_amount: toNumber(run.paid_amount) > 0 ? String(run.paid_amount) : "",
      paid_by: run.paid_by ?? "",
      supplier_invoice_number: run.supplier_invoice_number ?? "",
      purchase_total: run.purchase_total === null || run.purchase_total === undefined ? "" : String(run.purchase_total),
      receipt_url: run.receipt_url ?? "",
      notes: run.notes ?? "",
    };
  }

  async function handleHeaderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || !headerForm) return;
    if (!headerForm.supplier_id) {
      setErrorMessage("Selecciona un proveedor.");
      return;
    }

    setIsHeaderSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      internal_order_id: cleanOptionalValue(headerForm.internal_order_id),
      supplier_id: headerForm.supplier_id,
      purchase_method: headerForm.purchase_method,
      assigned_to: cleanOptionalValue(headerForm.assigned_to),
      pickup_address: cleanOptionalValue(headerForm.pickup_address),
      scheduled_at: cleanOptionalValue(headerForm.scheduled_at),
      picked_up_at: cleanOptionalValue(headerForm.picked_up_at),
      delivered_to_office_at: cleanOptionalValue(headerForm.delivered_to_office_at),
      marketplace_order_number: cleanOptionalValue(headerForm.marketplace_order_number),
      tracking_number: cleanOptionalValue(headerForm.tracking_number),
      estimated_delivery_at: cleanOptionalValue(headerForm.estimated_delivery_at),
      delivered_at: cleanOptionalValue(headerForm.delivered_at),
      status: headerForm.status,
      payment_method_id: cleanOptionalValue(headerForm.payment_method_id),
      payment_status: headerForm.payment_status || "pendiente",
      payment_reference: cleanOptionalValue(headerForm.payment_reference),
      paid_amount: optionalNumber(headerForm.paid_amount) ?? 0,
      paid_by: cleanOptionalValue(headerForm.paid_by),
      supplier_invoice_number: cleanOptionalValue(headerForm.supplier_invoice_number),
      purchase_total: totals.actualTotal,
      receipt_url: cleanOptionalValue(headerForm.receipt_url),
      notes: cleanOptionalValue(headerForm.notes),
    };

    const { data, error } = await supabase
      .from("purchase_runs")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", purchaseRunId)
      .select("*")
      .single();

    setIsHeaderSaving(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo actualizar la compra.");
      return;
    }

    const updatedRun = data as PurchaseRunRecord;
    setPurchaseRun(updatedRun);
    setHeaderForm(headerFormFromRun(updatedRun));
    await loadOrderLines(companyId, updatedRun.internal_order_id);
    setShowHeaderForm(false);
    setSuccessMessage("Compra actualizada.");
  }

  function handleOrderLineChange(orderLineId: string) {
    const orderLine = orderLineId ? orderLinesById.get(orderLineId) : undefined;
    setLineForm((currentForm) => ({
      ...currentForm,
      internal_order_line_id: orderLineId,
      product_id: orderLine?.product_id ?? currentForm.product_id,
      product_description: orderLine?.product_description ?? currentForm.product_description,
      brand: orderLine?.brand ?? currentForm.brand,
      model: orderLine?.model ?? currentForm.model,
      quantity: orderLine?.quantity === null || orderLine?.quantity === undefined ? currentForm.quantity : String(orderLine.quantity),
      unit: orderLine?.unit ?? currentForm.unit,
      expected_unit_cost: orderLine?.supplier_cost === null || orderLine?.supplier_cost === undefined ? currentForm.expected_unit_cost : String(orderLine.supplier_cost),
      actual_unit_cost: orderLine?.supplier_cost === null || orderLine?.supplier_cost === undefined ? currentForm.actual_unit_cost : String(orderLine.supplier_cost),
    }));
  }

  function handleProductChange(productId: string) {
    const product = productId ? productsById.get(productId) : undefined;
    setLineForm((currentForm) => ({
      ...currentForm,
      product_id: productId,
      product_description: product?.description || product?.name || currentForm.product_description,
      brand: product?.brand ?? currentForm.brand,
      model: product?.model ?? currentForm.model,
      unit: product?.unit ?? currentForm.unit,
    }));
  }

  async function handleLineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    if (!lineForm.product_description.trim()) {
      setErrorMessage("La descripción de la partida es obligatoria.");
      return;
    }

    setIsLineSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      company_id: companyId,
      purchase_run_id: purchaseRunId,
      internal_order_line_id: cleanOptionalValue(lineForm.internal_order_line_id),
      product_id: cleanOptionalValue(lineForm.product_id),
      product_description: lineForm.product_description.trim(),
      brand: cleanOptionalValue(lineForm.brand),
      model: cleanOptionalValue(lineForm.model),
      quantity: optionalNumber(lineForm.quantity) ?? 1,
      unit: cleanOptionalValue(lineForm.unit) ?? "pieza",
      expected_unit_cost: optionalNumber(lineForm.expected_unit_cost),
      actual_unit_cost: optionalNumber(lineForm.actual_unit_cost),
      status: lineForm.status || PURCHASE_RUN_LINE_STATUSES[0],
      notes: cleanOptionalValue(lineForm.notes),
    };

    const query = editingLineId
      ? supabase.from("purchase_run_lines").update(payload).eq("company_id", companyId).eq("id", editingLineId)
      : supabase.from("purchase_run_lines").insert(payload);
    const { error } = await query;
    setIsLineSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setLineForm(emptyLineForm);
    setEditingLineId(null);
    setShowLineForm(false);
    const loadedLines = await loadLines(companyId);
    await refreshPurchaseTotal(companyId, loadedLines);
    setSuccessMessage(editingLineId ? "Partida actualizada." : "Partida agregada.");
  }

  function startEditingLine(line: PurchaseRunLineRecord) {
    setEditingLineId(line.id);
    setLineForm({
      internal_order_line_id: line.internal_order_line_id ?? "",
      product_id: line.product_id ?? "",
      product_description: line.product_description ?? "",
      brand: line.brand ?? "",
      model: line.model ?? "",
      quantity: line.quantity === null || line.quantity === undefined ? "1" : String(line.quantity),
      unit: line.unit ?? "pieza",
      expected_unit_cost: line.expected_unit_cost === null || line.expected_unit_cost === undefined ? "" : String(line.expected_unit_cost),
      actual_unit_cost: line.actual_unit_cost === null || line.actual_unit_cost === undefined ? "" : String(line.actual_unit_cost),
      status: line.status ?? "pendiente",
      notes: line.notes ?? "",
    });
    setShowLineForm(true);
  }

  async function deleteLine(line: PurchaseRunLineRecord) {
    if (!companyId) return;
    const shouldDelete = window.confirm("¿Eliminar esta partida?");
    if (!shouldDelete) return;
    setErrorMessage("");
    const { error } = await supabase
      .from("purchase_run_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("id", line.id);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    const loadedLines = await loadLines(companyId);
    await refreshPurchaseTotal(companyId, loadedLines);
    setSuccessMessage("Partida eliminada.");
  }

  function resetLineForm() {
    setEditingLineId(null);
    setLineForm(emptyLineForm);
    setShowLineForm(false);
  }

  function handlePrint() {
    window.print();
  }

  async function archivePurchaseRun() {
    if (!companyId || !purchaseRun) return;
    const shouldArchive = window.confirm("¿Archivar esta compra/recolección?");
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
      .from("purchase_runs")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: "Archivado manualmente",
      })
      .eq("company_id", companyId)
      .eq("id", purchaseRun.id)
      .select("*")
      .single();

    setIsArchiveUpdating(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo archivar la compra.");
      return;
    }

    const updatedRun = data as PurchaseRunRecord;
    setPurchaseRun(updatedRun);
    setHeaderForm(headerFormFromRun(updatedRun));
    setSuccessMessage("Compra/recolección archivada.");
  }

  async function restorePurchaseRun() {
    if (!companyId || !purchaseRun) return;
    const shouldRestore = window.confirm("¿Restaurar esta compra/recolección?");
    if (!shouldRestore) return;

    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("purchase_runs")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("company_id", companyId)
      .eq("id", purchaseRun.id)
      .select("*")
      .single();

    setIsArchiveUpdating(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo restaurar la compra.");
      return;
    }

    const updatedRun = data as PurchaseRunRecord;
    setPurchaseRun(updatedRun);
    setHeaderForm(headerFormFromRun(updatedRun));
    setSuccessMessage("Compra/recolección restaurada.");
  }

  function cancelHeaderEdit() {
    setHeaderForm(purchaseRun ? headerFormFromRun(purchaseRun) : null);
    setShowHeaderForm(false);
  }

  const supplier = purchaseRun?.supplier_id ? suppliersById.get(purchaseRun.supplier_id) : undefined;
  const order = purchaseRun?.internal_order_id ? ordersById.get(purchaseRun.internal_order_id) : undefined;
  const paymentMethod = purchaseRun?.payment_method_id ? paymentMethodsById.get(purchaseRun.payment_method_id) : undefined;

  return (
    <>
    {purchaseRun ? (
      <PrintablePurchaseRun
        lines={lines}
        order={order}
        paymentMethod={paymentMethod}
        productsById={productsById}
        purchaseRun={purchaseRun}
        supplier={supplier}
      />
    ) : null}
    <div className="space-y-6 print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline" href="/dashboard/compras">Volver a compras</Link>
        <div className="flex flex-wrap gap-2">
          {purchaseRun?.archived_at ? (
            <button
              className="h-10 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isArchiveUpdating || !purchaseRun}
              onClick={restorePurchaseRun}
              type="button"
            >
              Restaurar
            </button>
          ) : (
            <button
              className="h-10 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isArchiveUpdating || !purchaseRun}
              onClick={archivePurchaseRun}
              type="button"
            >
              Archivar
            </button>
          )}
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading || !purchaseRun} onClick={handlePrint} type="button">
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir recolección
          </button>
        </div>
      </div>
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        {isLoading || !purchaseRun ? (
          <p className="text-sm font-medium text-stone-600">Cargando compra...</p>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-stone-950">{supplier?.name ?? "Sin proveedor"}</h3>
                  {purchaseRun.archived_at ? <ArchiveBadge /> : null}
                </div>
                <p className="mt-1 text-sm text-stone-600">{order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} · {methodLabel(purchaseRun.purchase_method)}</p>
              </div>
              <button
                className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isHeaderSaving}
                onClick={() => {
                  if (!showHeaderForm) {
                    setHeaderForm(headerFormFromRun(purchaseRun));
                  }
                  setShowHeaderForm((isVisible) => !isVisible);
                }}
                type="button"
              >
                {showHeaderForm ? "Ocultar edición" : "Editar compra"}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Info label="Proveedor" value={supplier?.name ?? "Sin proveedor"} />
              <Info label="Orden interna" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
              <Info label="Tipo" value={methodLabel(purchaseRun.purchase_method)} />
              <Info label="Asignado a" value={purchaseRun.assigned_to || "Sin asignar"} />
              <Info label="Dirección recolección" value={purchaseRun.pickup_address || "Sin dirección"} />
              <Info label="Programada" value={formatDate(purchaseRun.scheduled_at)} />
              <Info label="Recogido el" value={formatDate(purchaseRun.picked_up_at)} />
              <Info label="Entregado oficina" value={formatDate(purchaseRun.delivered_to_office_at)} />
              <Info label="Orden marketplace" value={purchaseRun.marketplace_order_number || "Sin folio"} />
              <Info label="Guía / rastreo" value={purchaseRun.tracking_number || "Sin guía"} />
              <Info label="Entrega estimada" value={formatDate(purchaseRun.estimated_delivery_at)} />
              <Info label="Entregado el" value={formatDate(purchaseRun.delivered_at)} />
              <Info label="Estado" value={purchaseRun.status || "pendiente"} badge />
              <Info label="Método de pago" value={paymentMethodLabel(paymentMethod)} />
              <Info label="Estado de pago" value={purchaseRun.payment_status || "pendiente"} badge />
              <Info label="Referencia pago" value={purchaseRun.payment_reference || "Sin referencia"} />
              <Info label="Monto pagado" value={formatPaidAmount(purchaseRun.paid_amount)} />
              <Info label="Pagado por" value={purchaseRun.paid_by || "Sin dato"} />
              <Info label="Factura proveedor" value={purchaseRun.supplier_invoice_number || "Sin factura"} />
              <Info label="Total compra" value={formatMoney(totals.actualTotal)} />
              <Info label="Recibo" value={purchaseRun.receipt_url || "Sin recibo"} />
              <div className="md:col-span-2 lg:col-span-4"><Info label="Notas" value={purchaseRun.notes || "Sin notas"} /></div>
              {hasPaidWarning(purchaseRun.payment_status, purchaseRun.paid_amount) ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 md:col-span-2 lg:col-span-4">
                  Pago marcado como pagado sin monto capturado.
                </p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {showHeaderForm && headerForm ? (
        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleHeaderSubmit}>
            <HeaderFormFields form={headerForm} isSaving={isHeaderSaving} orders={orders} paymentMethods={paymentMethods} setForm={setHeaderForm} suppliers={suppliers} />
            {hasPaidWarning(headerForm.payment_status, headerForm.paid_amount) ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 lg:col-span-3">
                Pago marcado como pagado sin monto capturado.
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isHeaderSaving} type="submit">{isHeaderSaving ? "Guardando..." : "Guardar"}</button>
              <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={cancelHeaderEdit}>Cancelar</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <Kpi label="Costo estimado" value={formatMoney(totals.expectedTotal)} tone="amber" />
        <Kpi label="Costo real" value={formatMoney(totals.actualTotal)} tone="emerald" />
        <Kpi label="Variación" value={formatMoney(totals.difference)} tone={totals.difference > 0 ? "red" : "sky"} />
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showLineForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">{editingLineId ? "Editar partida" : "Agregar partida"}</h3>
            <p className="mt-1 text-sm text-stone-600">Puedes ligar una partida de orden interna o capturar una manual.</p>
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
            <LineInput form={lineForm} id="product_description" label="Descripción" required setForm={setLineForm} />
            <LineInput form={lineForm} id="brand" label="Marca" setForm={setLineForm} />
            <LineInput form={lineForm} id="model" label="Modelo" setForm={setLineForm} />
            <LineInput form={lineForm} id="quantity" label="Cantidad" required setForm={setLineForm} type="number" />
            <LineInput form={lineForm} id="unit" label="Unidad" setForm={setLineForm} />
            <LineInput form={lineForm} id="expected_unit_cost" label="Costo estimado unitario" setForm={setLineForm} type="number" />
            <LineInput form={lineForm} id="actual_unit_cost" label="Costo real unitario" setForm={setLineForm} type="number" />
            <Field id="line_status" label="Estado">
              <select className={inputClass} id="line_status" value={lineForm.status} onChange={(event) => setLineForm({ ...lineForm, status: event.target.value })}>
                {PURCHASE_RUN_LINE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
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
          <h3 className="text-lg font-semibold text-stone-950">Partidas de compra</h3>
          <p className="mt-1 text-sm text-stone-600">{lines.length} partidas registradas.</p>
        </div>
        {lines.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">No hay partidas para mostrar.</div>
        ) : (
          <div className="space-y-3 p-5">
            {lines.map((line) => {
              const isExpanded = expandedLineIds.has(line.id);
              const quantity = toNumber(line.quantity);
              const expectedTotal = quantity * toNumber(line.expected_unit_cost);
              const actualTotal = quantity * toNumber(line.actual_unit_cost);
              const linkedOrderLine = line.internal_order_line_id ? orderLinesById.get(line.internal_order_line_id) : undefined;
              return (
                <article className="rounded-lg border border-stone-200 bg-white" key={line.id}>
                  <button className="flex w-full flex-col gap-3 px-4 py-4 text-left lg:flex-row lg:items-center lg:justify-between" onClick={() => setExpandedLineIds((currentIds) => {
                    const nextIds = new Set(currentIds);
                    if (nextIds.has(line.id)) nextIds.delete(line.id);
                    else nextIds.add(line.id);
                    return nextIds;
                  })} type="button">
                    <span className="min-w-0">
                      <span className="block font-semibold text-stone-950">{lineTitle(line, productsById)}</span>
                      <span className="mt-1 block text-sm text-stone-600">{brandModelText(line.brand, line.model)} · {quantity} {line.unit || "pieza"} · costo estimado {formatMoney(line.expected_unit_cost)} · costo real {formatMoney(line.actual_unit_cost)}</span>
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
                      <Info label="Costo estimado" value={formatMoney(expectedTotal)} />
                      <Info label="Costo real" value={formatMoney(actualTotal)} />
                      <Info label="Variación" value={formatMoney(actualTotal - expectedTotal)} />
                      <Info label="Estado" value={line.status || "pendiente"} badge />
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
    </div>
    </>
  );
}

function PrintablePurchaseRun({ lines, order, paymentMethod, productsById, purchaseRun, supplier }: { lines: PurchaseRunLineRecord[]; order: InternalOrderRecord | undefined; paymentMethod: PaymentMethodRecord | undefined; productsById: Map<string, ProductRecord>; purchaseRun: PurchaseRunRecord; supplier: SupplierRecord | undefined }) {
  const totals = lines.reduce(
    (summary, line) => {
      const quantity = toNumber(line.quantity);
      const expected = quantity * toNumber(line.expected_unit_cost);
      const actual = quantity * toNumber(line.actual_unit_cost);
      return {
        actual: summary.actual + actual,
        difference: summary.difference + actual - expected,
        expected: summary.expected + expected,
      };
    },
    { actual: 0, difference: 0, expected: 0 },
  );

  return (
    <section className="hidden print:block print:bg-white print:p-8 print:text-stone-950">
      <div className="border-b border-stone-300 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Compras / Recolecciones</p>
        <h1 className="mt-1 text-2xl font-semibold">Orden para repartidor</h1>
        <p className="mt-1 text-sm">{supplier?.name ?? "Sin proveedor"}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-stone-300 py-5 text-sm">
        <PrintInfo label="Orden interna" value={order?.folio ? `Orden #${order.folio}` : "Sin orden interna"} />
        <PrintInfo label="Estado" value={purchaseRun.status || "pendiente"} />
        <PrintInfo label="Tipo" value={methodLabel(purchaseRun.purchase_method)} />
        <PrintInfo label="Asignado a" value={purchaseRun.assigned_to || "Sin asignar"} />
        <PrintInfo label="Programada" value={formatDate(purchaseRun.scheduled_at)} />
        <PrintInfo label="Recogido el" value={formatDate(purchaseRun.picked_up_at)} />
        <PrintInfo label="Entregado oficina" value={formatDate(purchaseRun.delivered_to_office_at)} />
        <PrintInfo label="Entrega estimada" value={formatDate(purchaseRun.estimated_delivery_at)} />
        <PrintInfo label="Orden marketplace" value={purchaseRun.marketplace_order_number || "Sin folio"} />
        <PrintInfo label="Guía / rastreo" value={purchaseRun.tracking_number || "Sin guía"} />
        <PrintInfo label="Método de pago" value={paymentMethodLabel(paymentMethod)} />
        <PrintInfo label="Estado de pago" value={purchaseRun.payment_status || "pendiente"} />
        <PrintInfo label="Monto pagado" value={formatPaidAmount(purchaseRun.paid_amount)} />
        <PrintInfo label="Factura proveedor" value={purchaseRun.supplier_invoice_number || "Sin factura"} />
        <div className="col-span-2">
          <PrintInfo label="Dirección recolección" value={purchaseRun.pickup_address || "Sin dirección"} />
        </div>
        <div className="col-span-2">
          <PrintInfo label="Notas" value={purchaseRun.notes || "Sin notas"} />
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-300">
            <th className="py-2 pr-3 font-semibold">Partida</th>
            <th className="py-2 pr-3 font-semibold">Marca/modelo</th>
            <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
            <th className="py-2 pr-3 text-right font-semibold">Costo real unitario</th>
            <th className="py-2 text-right font-semibold">Costo real</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const quantity = toNumber(line.quantity);
            const unitCost = toNumber(line.actual_unit_cost);
            return (
              <tr className="border-b border-stone-200 align-top" key={line.id}>
                <td className="py-3 pr-3">
                  <p className="font-medium">{lineTitle(line, productsById)}</p>
                  {line.notes ? <p className="mt-1 text-xs text-stone-600">{line.notes}</p> : null}
                </td>
                <td className="py-3 pr-3">{brandModelText(line.brand, line.model)}</td>
                <td className="py-3 pr-3 text-right">{quantity} {line.unit || "pieza"}</td>
                <td className="py-3 pr-3 text-right">{formatMoney(unitCost)}</td>
                <td className="py-3 text-right">{formatMoney(quantity * unitCost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <div className="w-72 border-t border-stone-300 pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <span>Costo estimado</span>
            <span>{formatMoney(totals.expected)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Costo real</span>
            <span>{formatMoney(totals.actual)}</span>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <span>Variación</span>
            <span>{formatMoney(totals.difference)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PrintInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function HeaderFormFields({ form, isSaving, orders, paymentMethods, setForm, suppliers }: { form: HeaderFormState; isSaving: boolean; orders: InternalOrderRecord[]; paymentMethods: PaymentMethodRecord[]; setForm: Dispatch<SetStateAction<HeaderFormState | null>>; suppliers: SupplierRecord[] }) {
  const update = (key: keyof HeaderFormState, value: string) => setForm((currentForm) => currentForm ? { ...currentForm, [key]: value } : currentForm);
  return (
    <>
      <Field id="header_order" label="Orden interna"><select className={inputClass} disabled={isSaving} id="header_order" value={form.internal_order_id} onChange={(event) => update("internal_order_id", event.target.value)}><option value="">Sin orden</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.folio ? `Orden #${order.folio}` : `Orden ${order.id.slice(0, 8)}`}</option>)}</select></Field>
      <Field id="header_supplier" label="Proveedor"><select className={inputClass} disabled={isSaving} id="header_supplier" required value={form.supplier_id} onChange={(event) => update("supplier_id", event.target.value)}><option value="">Selecciona proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name ?? "Proveedor sin nombre"}</option>)}</select></Field>
      <Field id="header_method" label="Tipo"><select className={inputClass} disabled={isSaving} id="header_method" value={form.purchase_method} onChange={(event) => update("purchase_method", event.target.value)}>{purchaseMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></Field>
      {(["assigned_to", "pickup_address", "scheduled_at", "picked_up_at", "delivered_to_office_at", "marketplace_order_number", "tracking_number", "estimated_delivery_at", "delivered_at"] as const).map((key) => <HeaderInput form={form} id={key} key={key} label={headerLabel(key)} setForm={setForm} type={key.endsWith("_at") ? "datetime-local" : "text"} />)}
      <Field id="header_status" label="Estado"><select className={inputClass} disabled={isSaving} id="header_status" value={form.status} onChange={(event) => update("status", event.target.value)}>{PURCHASE_RUN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
      <Field id="header_payment_method" label="Método de pago"><select className={inputClass} disabled={isSaving} id="header_payment_method" value={form.payment_method_id} onChange={(event) => update("payment_method_id", event.target.value)}><option value="">Sin método de pago</option>{paymentMethods.map((method) => <option key={method.id} value={method.id}>{paymentMethodLabel(method)}</option>)}</select></Field>
      <Field id="header_payment_status" label="Estado de pago"><select className={inputClass} disabled={isSaving} id="header_payment_status" value={form.payment_status} onChange={(event) => update("payment_status", event.target.value)}>{paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
      {(["payment_reference", "paid_amount", "paid_by", "supplier_invoice_number", "receipt_url"] as const).map((key) => <HeaderInput form={form} id={key} key={key} label={headerLabel(key)} placeholder={key === "paid_amount" ? "Monto pagado" : undefined} setForm={setForm} type={key === "paid_amount" ? "number" : "text"} />)}
      <Field className="lg:col-span-3" id="header_notes" label="Notas"><textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" disabled={isSaving} id="header_notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></Field>
    </>
  );
}

function headerLabel(key: keyof HeaderFormState) {
  const labels: Record<keyof HeaderFormState, string> = {
    internal_order_id: "Orden interna",
    supplier_id: "Proveedor",
    purchase_method: "Tipo",
    assigned_to: "Asignado a",
    pickup_address: "Dirección recolección",
    scheduled_at: "Fecha programada",
    picked_up_at: "Recogido el",
    delivered_to_office_at: "Entregado oficina",
    marketplace_order_number: "Orden marketplace",
    tracking_number: "Guía / rastreo",
    estimated_delivery_at: "Entrega estimada",
    delivered_at: "Entregado el",
    status: "Estado",
    payment_method_id: "Método de pago",
    payment_status: "Estado de pago",
    payment_reference: "Referencia pago",
    paid_amount: "Monto pagado",
    paid_by: "Pagado por",
    supplier_invoice_number: "Factura proveedor",
    purchase_total: "Total compra",
    receipt_url: "Recibo URL",
    notes: "Notas",
  };
  return labels[key];
}

function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return <div className={`space-y-2 ${className}`}><label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>{children}</div>;
}
function HeaderInput({ form, id, label, placeholder, setForm, type = "text" }: { form: HeaderFormState; id: keyof HeaderFormState; label: string; placeholder?: string; setForm: Dispatch<SetStateAction<HeaderFormState | null>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} placeholder={placeholder} step={type === "number" ? "0.01" : undefined} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => currentForm ? { ...currentForm, [id]: event.target.value } : currentForm)} /></Field>;
}
function LineInput({ form, id, label, required = false, setForm, type = "text" }: { form: LineFormState; id: keyof LineFormState; label: string; required?: boolean; setForm: Dispatch<SetStateAction<LineFormState>>; type?: string }) {
  return <Field id={id} label={label}><input className={inputClass} id={id} required={required} step={type === "number" ? "0.01" : undefined} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => ({ ...currentForm, [id]: event.target.value }))} /></Field>;
}
function Info({ badge = false, label, value }: { badge?: boolean; label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>{badge ? <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(value)}`}>{value}</span> : <p className="mt-1 break-words text-sm text-stone-800">{value}</p>}</div>;
}
function Kpi({ label, tone, value }: { label: string; tone: "amber" | "emerald" | "red" | "sky"; value: string }) {
  const classes = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    red: "border-red-200 bg-red-50 text-red-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
  };
  return <div className={`rounded-lg border p-5 shadow-sm ${classes[tone]}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
