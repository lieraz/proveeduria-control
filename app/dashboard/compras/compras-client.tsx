"use client";

import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ArchiveBadge, ArchiveFilter } from "@/app/dashboard/archive-controls";
import { PURCHASE_RUN_STATUSES } from "@/app/dashboard/statuses";
import { createClient } from "@/src/lib/supabase/client";

type SupplierRecord = { id: string; name: string | null };
type InternalOrderRecord = { id: string; folio: string | null; status: string | null; archived_at?: string | null };
type PaymentMethodRecord = {
  id: string;
  name: string | null;
  type: string | null;
  owner_name: string | null;
  last_four: string | null;
  bank_name: string | null;
  notes: string | null;
  active: boolean | null;
};
type PurchaseRunRecord = {
  id: string;
  supplier_id: string | null;
  internal_order_id: string | null;
  purchase_method: string | null;
  assigned_to: string | null;
  pickup_address: string | null;
  scheduled_at: string | null;
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
  notes: string | null;
  created_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

type PurchaseFormState = {
  internal_order_id: string;
  supplier_id: string;
  purchase_method: string;
  assigned_to: string;
  pickup_address: string;
  scheduled_at: string;
  marketplace_order_number: string;
  tracking_number: string;
  estimated_delivery_at: string;
  delivered_at: string;
  payment_method_id: string;
  payment_status: string;
  payment_reference: string;
  paid_amount: string;
  paid_by: string;
  supplier_invoice_number: string;
  notes: string;
};

type PaymentFormState = {
  name: string;
  type: string;
  owner_name: string;
  last_four: string;
  bank_name: string;
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
const paymentTypes = [
  "efectivo",
  "transferencia",
  "tarjeta_debito",
  "tarjeta_credito",
  "credito_proveedor",
  "mercado_pago",
  "paypal",
  "otro",
];
const inputClass =
  "h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100";

const emptyForm: PurchaseFormState = {
  internal_order_id: "",
  supplier_id: "",
  purchase_method: "recoleccion",
  assigned_to: "",
  pickup_address: "",
  scheduled_at: "",
  marketplace_order_number: "",
  tracking_number: "",
  estimated_delivery_at: "",
  delivered_at: "",
  payment_method_id: "",
  payment_status: "pendiente",
  payment_reference: "",
  paid_amount: "",
  paid_by: "",
  supplier_invoice_number: "",
  notes: "",
};
const emptyPaymentForm: PaymentFormState = {
  name: "",
  type: "efectivo",
  owner_name: "",
  last_four: "",
  bank_name: "",
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

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", { currency: "MXN", style: "currency" }).format(toNumber(value));
}

function badgeClass(value: string | null | undefined) {
  if (["pagado", "comprado", "recogido", "entregado en oficina", "entregado en domicilio"].includes(value ?? "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["cancelado"].includes(value ?? "")) return "border-red-200 bg-red-50 text-red-700";
  if (["parcial", "asignada", "en camino", "en tránsito"].includes(value ?? "")) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function methodLabel(value: string | null | undefined) {
  return purchaseMethods.find((method) => method.value === value)?.label ?? value ?? "Sin método";
}

function paymentMethodLabel(paymentMethod: PaymentMethodRecord | undefined) {
  if (!paymentMethod) return "Sin método de pago";
  const lastFour = paymentMethod.last_four ? `****${paymentMethod.last_four}` : null;
  return [paymentMethod.name, paymentMethod.bank_name, lastFour].filter(Boolean).join(" · ");
}

function normalize(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

export function ComprasClient() {
  const supabase = useMemo(() => createClient(), []);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<PurchaseFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isArchiveUpdating, setIsArchiveUpdating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>([]);
  const [purchaseRunTotals, setPurchaseRunTotals] = useState<Map<string, number>>(new Map());
  const [purchaseRuns, setPurchaseRuns] = useState<PurchaseRunRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPurchaseRunIds, setSelectedPurchaseRunIds] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const suppliersById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const paymentMethodsById = useMemo(
    () => new Map(paymentMethods.map((paymentMethod) => [paymentMethod.id, paymentMethod])),
    [paymentMethods],
  );

  const filteredRuns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return purchaseRuns;

    return purchaseRuns.filter((run) => {
      const supplier = run.supplier_id ? suppliersById.get(run.supplier_id) : undefined;
      const order = run.internal_order_id ? ordersById.get(run.internal_order_id) : undefined;
      return [
        supplier?.name,
        run.assigned_to,
        run.tracking_number,
        run.marketplace_order_number,
        run.payment_reference,
        run.supplier_invoice_number,
        run.status,
        run.payment_status,
        order?.folio,
      ].some((value) => normalize(value).includes(normalizedSearch));
    });
  }, [ordersById, purchaseRuns, search, suppliersById]);

  const selectedPurchaseRuns = useMemo(
    () => purchaseRuns.filter((run) => selectedPurchaseRunIds.has(run.id)),
    [purchaseRuns, selectedPurchaseRunIds],
  );
  const selectedArchivedPurchaseRunIds = useMemo(
    () =>
      selectedPurchaseRuns
        .filter((run) => run.archived_at)
        .map((run) => run.id),
    [selectedPurchaseRuns],
  );
  const selectedActivePurchaseRunIds = useMemo(
    () =>
      selectedPurchaseRuns
        .filter((run) => !run.archived_at)
        .map((run) => run.id),
    [selectedPurchaseRuns],
  );
  const areAllVisiblePurchaseRunsSelected =
    filteredRuns.length > 0 &&
    filteredRuns.every((run) => selectedPurchaseRunIds.has(run.id));

  const loadPaymentMethods = useCallback(async (activeCompanyId: string) => {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("id,name,type,owner_name,last_four,bank_name,notes,active")
      .eq("company_id", activeCompanyId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setPaymentMethods([]);
      return [];
    }

    const loadedPaymentMethods = (data ?? []) as PaymentMethodRecord[];
    setPaymentMethods(loadedPaymentMethods);
    return loadedPaymentMethods;
  }, [supabase]);

  const loadRuns = useCallback(
    async (activeCompanyId: string, activeArchiveFilter: ArchiveFilter) => {
      setErrorMessage("");
      let query = supabase
        .from("purchase_runs")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (activeArchiveFilter === "active") query = query.is("archived_at", null);
      if (activeArchiveFilter === "archived") query = query.not("archived_at", "is", null);

      const { data, error } = await query;
      if (error) {
        setErrorMessage(error.message);
        setPurchaseRunTotals(new Map());
        setPurchaseRuns([]);
        return;
      }

      const loadedRuns = (data ?? []) as PurchaseRunRecord[];
      setPurchaseRuns(loadedRuns);

      const runIds = loadedRuns.map((run) => run.id);
      if (runIds.length === 0) {
        setPurchaseRunTotals(new Map());
        return;
      }

      const { data: linesData, error: linesError } = await supabase
        .from("purchase_run_lines")
        .select("purchase_run_id,quantity,actual_unit_cost")
        .eq("company_id", activeCompanyId)
        .in("purchase_run_id", runIds);

      if (linesError) {
        setErrorMessage(linesError.message);
        setPurchaseRunTotals(new Map());
        return;
      }

      const totals = new Map(runIds.map((runId) => [runId, 0]));
      (linesData ?? []).forEach((line) => {
        const purchaseRunId = line.purchase_run_id as string | null;
        if (!purchaseRunId) return;
        const lineTotal =
          toNumber(line.quantity as number | string | null) *
          toNumber(line.actual_unit_cost as number | string | null);
        totals.set(purchaseRunId, (totals.get(purchaseRunId) ?? 0) + lineTotal);
      });
      setPurchaseRunTotals(totals);
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
      if (profileError || !profile?.company_id) {
        setErrorMessage(profileError?.message ?? "Tu perfil no tiene una empresa asignada.");
        setIsLoading(false);
        return;
      }

      const activeCompanyId = profile.company_id as string;
      setCompanyId(activeCompanyId);
      const [suppliersResponse, ordersResponse] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("company_id", activeCompanyId).order("name", { ascending: true }),
        supabase
          .from("internal_orders")
          .select("id,folio,status,archived_at")
          .eq("company_id", activeCompanyId)
          .order("created_at", { ascending: false }),
      ]);

      const firstError = suppliersResponse.error ?? ordersResponse.error;
      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setSuppliers((suppliersResponse.data ?? []) as SupplierRecord[]);
      setOrders((ordersResponse.data ?? []) as InternalOrderRecord[]);
      await loadPaymentMethods(activeCompanyId);
      await loadRuns(activeCompanyId, "active");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadPaymentMethods, loadRuns, supabase]);

  async function handleArchiveFilterChange(nextFilter: ArchiveFilter) {
    setArchiveFilter(nextFilter);
    setSelectedPurchaseRunIds(new Set());
    if (companyId) await loadRuns(companyId, nextFilter);
  }

  async function archivePurchaseRuns(purchaseRunIds: string[]) {
    if (!companyId || purchaseRunIds.length === 0) return;
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

    const { error } = await supabase
      .from("purchase_runs")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: "Archivado manualmente",
      })
      .eq("company_id", companyId)
      .in("id", purchaseRunIds);

    setIsArchiveUpdating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedPurchaseRunIds(new Set());
    setSuccessMessage(
      purchaseRunIds.length === 1
        ? "Compra/recolección archivada."
        : "Compras/recolecciones archivadas.",
    );
    await loadRuns(companyId, archiveFilter);
  }

  async function restorePurchaseRuns(purchaseRunIds: string[]) {
    if (!companyId || purchaseRunIds.length === 0) return;
    const shouldRestore = window.confirm("¿Restaurar esta compra/recolección?");
    if (!shouldRestore) return;

    setIsArchiveUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("purchase_runs")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("company_id", companyId)
      .in("id", purchaseRunIds);

    setIsArchiveUpdating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedPurchaseRunIds(new Set());
    setSuccessMessage(
      purchaseRunIds.length === 1
        ? "Compra/recolección restaurada."
        : "Compras/recolecciones restauradas.",
    );
    await loadRuns(companyId, archiveFilter);
  }

  function togglePurchaseRunSelection(purchaseRunId: string) {
    setSelectedPurchaseRunIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(purchaseRunId)) {
        nextIds.delete(purchaseRunId);
      } else {
        nextIds.add(purchaseRunId);
      }
      return nextIds;
    });
  }

  function toggleAllVisiblePurchaseRuns() {
    setSelectedPurchaseRunIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (areAllVisiblePurchaseRunsSelected) {
        filteredRuns.forEach((run) => nextIds.delete(run.id));
      } else {
        filteredRuns.forEach((run) => nextIds.add(run.id));
      }
      return nextIds;
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    setIsSearching(true);
    await loadRuns(companyId, archiveFilter);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }
    if (!form.supplier_id) {
      setErrorMessage("Selecciona un proveedor.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const payload = {
      company_id: companyId,
      internal_order_id: cleanOptionalValue(form.internal_order_id),
      supplier_id: form.supplier_id,
      purchase_method: form.purchase_method,
      assigned_to: cleanOptionalValue(form.assigned_to),
      pickup_address: cleanOptionalValue(form.pickup_address),
      scheduled_at: cleanOptionalValue(form.scheduled_at),
      marketplace_order_number: cleanOptionalValue(form.marketplace_order_number),
      tracking_number: cleanOptionalValue(form.tracking_number),
      estimated_delivery_at: cleanOptionalValue(form.estimated_delivery_at),
      delivered_at: cleanOptionalValue(form.delivered_at),
      payment_method_id: cleanOptionalValue(form.payment_method_id),
      payment_status: form.payment_status || "pendiente",
      payment_reference: cleanOptionalValue(form.payment_reference),
      paid_amount: optionalNumber(form.paid_amount),
      paid_by: cleanOptionalValue(form.paid_by),
      supplier_invoice_number: cleanOptionalValue(form.supplier_invoice_number),
      notes: cleanOptionalValue(form.notes),
      status: PURCHASE_RUN_STATUSES[0],
    };

    const { error } = await supabase.from("purchase_runs").insert(payload);
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setForm(emptyForm);
    setShowCreateForm(false);
    setSuccessMessage("Compra creada correctamente.");
    await loadRuns(companyId, archiveFilter);
  }

  async function handleQuickPaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    const name = paymentForm.name.trim();
    if (!name) {
      setErrorMessage("El nombre del método de pago es obligatorio.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    const { data, error } = await supabase
      .from("payment_methods")
      .insert({
        company_id: companyId,
        name,
        type: paymentForm.type,
        owner_name: cleanOptionalValue(paymentForm.owner_name),
        last_four: cleanOptionalValue(paymentForm.last_four),
        bank_name: cleanOptionalValue(paymentForm.bank_name),
        notes: cleanOptionalValue(paymentForm.notes),
        active: true,
      })
      .select("id")
      .single();

    setIsSaving(false);
    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo crear el método de pago.");
      return;
    }

    await loadPaymentMethods(companyId);
    setForm((currentForm) => ({ ...currentForm, payment_method_id: data.id }));
    setPaymentForm(emptyPaymentForm);
    setShowPaymentForm(false);
    setSuccessMessage("Método de pago agregado.");
  }

  const showPickupFields = form.purchase_method === "recoleccion";
  const showDeliveryFields = form.purchase_method === "domicilio" || form.purchase_method === "envio";
  const showDigitalFields = form.purchase_method === "digital";

  return (
    <div className="space-y-6">
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div> : null}
      {successMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">{successMessage}</div> : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">Nueva compra</h3>
            <p className="mt-1 text-sm text-stone-600">Registra compras, recolecciones, envíos o compras digitales.</p>
          </div>
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isSaving}
            onClick={() => setShowCreateForm((isVisible) => !isVisible)}
            type="button"
          >
            {showCreateForm ? "Ocultar formulario" : "Nueva compra"}
          </button>
        </div>

        {showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <Field label="Orden interna" id="internal_order_id">
              <select className={inputClass} id="internal_order_id" value={form.internal_order_id} onChange={(event) => setForm({ ...form, internal_order_id: event.target.value })}>
                <option value="">Sin orden interna</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.folio ? `Orden #${order.folio}` : "Orden sin folio"}</option>
                ))}
              </select>
            </Field>
            <Field label="Proveedor" id="supplier_id">
              <select className={inputClass} id="supplier_id" required value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}>
                <option value="">Selecciona proveedor</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name ?? "Proveedor sin nombre"}</option>)}
              </select>
            </Field>
            <Field label="Tipo de compra" id="purchase_method">
              <select className={inputClass} id="purchase_method" value={form.purchase_method} onChange={(event) => setForm({ ...form, purchase_method: event.target.value })}>
                {purchaseMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select>
            </Field>

            {showPickupFields ? (
              <>
                <TextInput form={form} id="assigned_to" label="Asignado a" setForm={setForm} />
                <TextInput form={form} id="pickup_address" label="Dirección de recolección" setForm={setForm} />
                <TextInput form={form} id="scheduled_at" label="Fecha programada" setForm={setForm} type="datetime-local" />
              </>
            ) : null}
            {showDeliveryFields ? (
              <>
                <TextInput form={form} id="marketplace_order_number" label="Orden marketplace" setForm={setForm} />
                <TextInput form={form} id="tracking_number" label="Guía / rastreo" setForm={setForm} />
                <TextInput form={form} id="estimated_delivery_at" label="Entrega estimada" setForm={setForm} type="datetime-local" />
                <TextInput form={form} id="delivered_at" label="Entregado el" setForm={setForm} type="datetime-local" />
              </>
            ) : null}
            {showDigitalFields ? <TextInput form={form} id="marketplace_order_number" label="Orden marketplace" setForm={setForm} /> : null}

            <Field label="Método de pago" id="payment_method_id">
              <select className={inputClass} id="payment_method_id" value={form.payment_method_id} onChange={(event) => setForm({ ...form, payment_method_id: event.target.value })}>
                <option value="">Sin método de pago</option>
                {paymentMethods.map((paymentMethod) => <option key={paymentMethod.id} value={paymentMethod.id}>{paymentMethodLabel(paymentMethod)}</option>)}
              </select>
            </Field>
            <Field label="Estado de pago" id="payment_status">
              <select className={inputClass} id="payment_status" value={form.payment_status} onChange={(event) => setForm({ ...form, payment_status: event.target.value })}>
                {paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <TextInput form={form} id="payment_reference" label="Referencia de pago" setForm={setForm} />
            <TextInput form={form} id="paid_amount" label="Monto pagado" setForm={setForm} type="number" />
            <TextInput form={form} id="paid_by" label="Pagado por" setForm={setForm} />
            <TextInput form={form} id="supplier_invoice_number" label="Factura proveedor" setForm={setForm} />
            <Field className="lg:col-span-3" label="Notas" id="notes">
              <textarea className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100" id="notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </Field>

            <div className="lg:col-span-3">
              <button className="text-sm font-semibold text-emerald-800 hover:text-emerald-950 hover:underline" type="button" onClick={() => setShowPaymentForm((isVisible) => !isVisible)}>
                {showPaymentForm ? "Ocultar método de pago" : "Nuevo método de pago"}
              </button>
            </div>

            {showPaymentForm ? (
              <div className="grid gap-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 lg:col-span-3 lg:grid-cols-3">
                <QuickPaymentForm form={paymentForm} isSaving={isSaving} onSubmit={handleQuickPaymentSubmit} setForm={setPaymentForm} />
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} type="submit">
                {isSaving ? "Guardando..." : "Crear compra"}
              </button>
              <button className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50" type="button" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">Compras registradas</h3>
              <p className="mt-1 text-sm text-stone-600">Busca por proveedor, asignado, guía, folios, pago o estado.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-md border border-stone-200 bg-stone-50 p-1">
                {[
                  ["active", "Activas"],
                  ["archived", "Archivadas"],
                  ["all", "Todas"],
                ].map(([value, label]) => {
                  const isSelected = archiveFilter === value;

                  return (
                    <button
                      className={`h-8 rounded px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected
                          ? "bg-white text-emerald-800 shadow-sm"
                          : "text-stone-600 hover:bg-white/70 hover:text-stone-900"
                      }`}
                      disabled={isLoading}
                      key={value}
                      onClick={() => handleArchiveFilterChange(value as ArchiveFilter)}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <form className="flex gap-2" onSubmit={handleSearch}>
                <input className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 sm:w-72" placeholder="Buscar compra" value={search} onChange={(event) => setSearch(event.target.value)} />
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50" disabled={isSearching} type="submit">
                  <Search className="h-4 w-4" /> {isSearching ? "Buscando..." : "Buscar"}
                </button>
              </form>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">Cargando compras...</div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">No hay compras para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            {selectedPurchaseRuns.length > 0 ? (
              <div className="border-b border-stone-200 bg-emerald-50 px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-emerald-900">
                    {selectedPurchaseRuns.length} seleccionadas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedActivePurchaseRunIds.length > 0 ? (
                      <button
                        className="h-9 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                        disabled={isArchiveUpdating}
                        onClick={() => archivePurchaseRuns(selectedActivePurchaseRunIds)}
                        type="button"
                      >
                        Archivar seleccionadas
                      </button>
                    ) : null}
                    {selectedArchivedPurchaseRunIds.length > 0 ? (
                      <button
                        className="h-9 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isArchiveUpdating}
                        onClick={() => restorePurchaseRuns(selectedArchivedPurchaseRunIds)}
                        type="button"
                      >
                        Restaurar seleccionadas
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      aria-label="Seleccionar compras visibles"
                      checked={areAllVisiblePurchaseRunsSelected}
                      className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                      onChange={toggleAllVisiblePurchaseRuns}
                      type="checkbox"
                    />
                  </th>
                  {["Proveedor", "Tipo", "Orden", "Asignado", "Programada", "Estado", "Pago", "Estado pago", "Costo real", "Acción"].map((header) => (
                    <th className="px-4 py-3" key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredRuns.map((run) => {
                  const supplier = run.supplier_id ? suppliersById.get(run.supplier_id) : undefined;
                  const order = run.internal_order_id ? ordersById.get(run.internal_order_id) : undefined;
                  const actualTotal = purchaseRunTotals.get(run.id) ?? 0;
                  return (
                    <tr className="hover:bg-stone-50" key={run.id}>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Seleccionar compra ${supplier?.name ?? run.id}`}
                          checked={selectedPurchaseRunIds.has(run.id)}
                          className="h-4 w-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                          onChange={() => togglePurchaseRunSelection(run.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-950">
                        <Link className="text-emerald-800 hover:text-emerald-950 hover:underline" href={`/dashboard/compras/${run.id}`}>
                          {supplier?.name ?? "Sin proveedor"}
                        </Link>
                        {run.archived_at ? <span className="mt-2 block"><ArchiveBadge /></span> : null}
                      </td>
                      <td className="px-4 py-3"><span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">{methodLabel(run.purchase_method)}</span></td>
                      <td className="px-4 py-3 text-stone-700">{order?.folio ? `Orden #${order.folio}` : "Sin orden"}</td>
                      <td className="px-4 py-3 text-stone-700">{run.assigned_to || "Sin asignar"}</td>
                      <td className="px-4 py-3 text-stone-700">{formatDate(run.scheduled_at)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(run.status)}`}>{run.status || "pendiente"}</span></td>
                      <td className="px-4 py-3 text-stone-700">{paymentMethodLabel(run.payment_method_id ? paymentMethodsById.get(run.payment_method_id) : undefined)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(run.payment_status)}`}>{run.payment_status || "pendiente"}</span></td>
                      <td className="px-4 py-3 font-semibold text-stone-950">{formatMoney(actualTotal)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                          href={`/dashboard/compras/${run.id}`}
                        >
                          Ver detalle
                        </Link>
                        {run.archived_at ? (
                          <button
                            className="h-9 rounded-md border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isArchiveUpdating}
                            onClick={() => restorePurchaseRuns([run.id])}
                            type="button"
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            className="h-9 rounded-md border border-stone-300 px-3 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isArchiveUpdating}
                            onClick={() => archivePurchaseRuns([run.id])}
                            type="button"
                          >
                            Archivar
                          </button>
                        )}
                        </div>
                      </td>
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

function Field({ children, className = "", id, label }: { children: ReactNode; className?: string; id: string; label: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-stone-800" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ form, id, label, setForm, type = "text" }: { form: PurchaseFormState; id: keyof PurchaseFormState; label: string; setForm: Dispatch<SetStateAction<PurchaseFormState>>; type?: string }) {
  return (
    <Field id={id} label={label}>
      <input className={inputClass} id={id} step={type === "number" ? "0.01" : undefined} type={type} value={form[id]} onChange={(event) => setForm((currentForm) => ({ ...currentForm, [id]: event.target.value }))} />
    </Field>
  );
}

function QuickPaymentForm({ form, isSaving, onSubmit, setForm }: { form: PaymentFormState; isSaving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; setForm: Dispatch<SetStateAction<PaymentFormState>> }) {
  return (
    <form className="contents" onSubmit={onSubmit}>
      <Field id="quick_name" label="Nombre">
        <input className={inputClass} id="quick_name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </Field>
      <Field id="quick_type" label="Tipo">
        <select className={inputClass} id="quick_type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
          {paymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field id="quick_owner_name" label="Titular">
        <input className={inputClass} id="quick_owner_name" value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} />
      </Field>
      <Field id="quick_last_four" label="Últimos 4">
        <input className={inputClass} id="quick_last_four" maxLength={4} value={form.last_four} onChange={(event) => setForm({ ...form, last_four: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
      </Field>
      <Field id="quick_bank_name" label="Banco">
        <input className={inputClass} id="quick_bank_name" value={form.bank_name} onChange={(event) => setForm({ ...form, bank_name: event.target.value })} />
      </Field>
      <Field id="quick_notes" label="Notas">
        <input className={inputClass} id="quick_notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Field>
      <div className="lg:col-span-3">
        <button className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={isSaving} type="submit">
          {isSaving ? "Guardando..." : "Agregar método"}
        </button>
      </div>
    </form>
  );
}
