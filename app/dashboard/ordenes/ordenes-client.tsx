"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  ArchiveBadge,
  ArchiveFilter,
  ArchiveFilterToggle,
  BulkArchiveActionBar,
} from "@/app/dashboard/archive-controls";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string;
};

type QuotationRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  status: string | null;
};

type QuotationLineRecord = {
  id: string;
  quotation_id: string | null;
  product_id: string | null;
  brand: string | null;
  custom_description: string | null;
  model: string | null;
  supplier_id: string | null;
  supplier_cost: number | string | null;
  final_unit_price: number | string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  selected: boolean | null;
  notes: string | null;
};

type ProductRecord = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  model: string | null;
  unit: string | null;
};

type InternalOrderRecord = {
  id: string;
  folio: string | null;
  quotation_id: string | null;
  approved_at: string | null;
  status: string | null;
  responsible: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

type InternalOrderLineRecord = {
  internal_order_id: string | null;
  line_total: number | string | null;
};

type SourceMode = "manual" | "full_quotation" | "selected_lines";

type OrderFormState = {
  sourceMode: SourceMode;
  quotation_id: string;
  notes: string;
};

const emptyForm: OrderFormState = {
  sourceMode: "manual",
  quotation_id: "",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(toNumber(value));
}

function lineDescription(line: QuotationLineRecord) {
  return line.custom_description || "Partida sin descripción";
}

function clientLabelForOrder(
  order: InternalOrderRecord,
  quotationsById: Map<string, QuotationRecord>,
  clientsById: Map<string, ClientRecord>,
) {
  if (!order.quotation_id) {
    return "Orden manual";
  }

  const quotation = quotationsById.get(order.quotation_id);
  if (!quotation?.client_id) {
    return "Cliente no disponible";
  }

  return clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible";
}

function orderMatchesSearch(
  order: InternalOrderRecord,
  searchValue: string,
  quotationsById: Map<string, QuotationRecord>,
  clientsById: Map<string, ClientRecord>,
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const quotation = order.quotation_id
    ? quotationsById.get(order.quotation_id)
    : undefined;
  const clientName = clientLabelForOrder(order, quotationsById, clientsById);

  return [
    order.folio,
    order.status,
    order.responsible,
    order.notes,
    quotation?.folio,
    clientName,
  ].some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function OrdenesClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<OrderFormState>(emptyForm);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingArchiveId, setIsUpdatingArchiveId] = useState<string | null>(
    null,
  );
  const [orders, setOrders] = useState<InternalOrderRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [quotationLines, setQuotationLines] = useState<QuotationLineRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [totalsByOrderId, setTotalsByOrderId] = useState<Map<string, number>>(
    new Map(),
  );

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const quotationsById = useMemo(
    () => new Map(quotations.map((quotation) => [quotation.id, quotation])),
    [quotations],
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const selectedQuotation = useMemo(
    () => quotations.find((quotation) => quotation.id === form.quotation_id),
    [form.quotation_id, quotations],
  );
  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.has(order.id)),
    [orders, selectedOrderIds],
  );
  const selectedArchivedOrderIds = useMemo(
    () =>
      selectedOrders
        .filter((order) => order.archived_at)
        .map((order) => order.id),
    [selectedOrders],
  );
  const selectedActiveOrderIds = useMemo(
    () =>
      selectedOrders
        .filter((order) => !order.archived_at)
        .map((order) => order.id),
    [selectedOrders],
  );
  const areAllVisibleOrdersSelected =
    orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));

  const loadOrders = useCallback(
    async (
      activeCompanyId: string,
      searchValue: string,
      activeQuotationsById: Map<string, QuotationRecord>,
      activeClientsById: Map<string, ClientRecord>,
      activeArchiveFilter: ArchiveFilter,
    ) => {
      setErrorMessage("");

      let query = supabase
        .from("internal_orders")
        .select(
          "id,folio,quotation_id,approved_at,status,responsible,notes,created_at,updated_at,archived_at,archived_by,archive_reason",
        )
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (activeArchiveFilter === "active") {
        query = query.is("archived_at", null);
      }

      if (activeArchiveFilter === "archived") {
        query = query.not("archived_at", "is", null);
      }

      const { data, error } = await query;

      if (error) {
        setErrorMessage(error.message);
        setOrders([]);
        setTotalsByOrderId(new Map());
        return;
      }

      const loadedOrders = ((data ?? []) as InternalOrderRecord[]).filter(
        (order) =>
          orderMatchesSearch(
            order,
            searchValue,
            activeQuotationsById,
            activeClientsById,
          ),
      );
      setOrders(loadedOrders);

      const orderIds = loadedOrders.map((order) => order.id);
      if (orderIds.length === 0) {
        setTotalsByOrderId(new Map());
        return;
      }

      const { data: linesData, error: linesError } = await supabase
        .from("internal_order_lines")
        .select("internal_order_id,line_total")
        .eq("company_id", activeCompanyId)
        .in("internal_order_id", orderIds);

      if (linesError) {
        setErrorMessage(linesError.message);
        setTotalsByOrderId(new Map());
        return;
      }

      const nextTotals = new Map<string, number>();
      ((linesData ?? []) as InternalOrderLineRecord[]).forEach((line) => {
        if (!line.internal_order_id) {
          return;
        }

        nextTotals.set(
          line.internal_order_id,
          (nextTotals.get(line.internal_order_id) ?? 0) +
            toNumber(line.line_total),
        );
      });
      setTotalsByOrderId(nextTotals);
    },
    [supabase],
  );

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

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

      const [clientsResponse, productsResponse, quotationsResponse] =
        await Promise.all([
        supabase
          .from("clients")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select("id,name,brand,description,model,unit")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("quotations")
          .select("id,folio,client_id,status")
          .eq("company_id", activeCompanyId)
          .is("archived_at", null)
          .order("created_at", { ascending: false }),
      ]);

      const firstError =
        clientsResponse.error ?? productsResponse.error ?? quotationsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedClients = (clientsResponse.data ?? []) as ClientRecord[];
      const loadedProducts = (productsResponse.data ?? []) as ProductRecord[];
      const loadedQuotations = (quotationsResponse.data ?? []) as QuotationRecord[];
      setClients(loadedClients);
      setProducts(loadedProducts);
      setQuotations(loadedQuotations);

      await loadOrders(
        activeCompanyId,
        "",
        new Map(loadedQuotations.map((quotation) => [quotation.id, quotation])),
        new Map(loadedClients.map((client) => [client.id, client])),
        "active",
      );
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadOrders, supabase]);

  async function loadQuotationLines(quotationId: string, sourceMode: SourceMode) {
    if (!companyId || !quotationId) {
      setQuotationLines([]);
      setSelectedLineIds(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("quotation_lines")
      .select(
        "id,quotation_id,product_id,brand,custom_description,model,supplier_id,supplier_cost,final_unit_price,quantity,line_total,selected,notes",
      )
      .eq("company_id", companyId)
      .eq("quotation_id", quotationId)
      .order("created_at", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setQuotationLines([]);
      setSelectedLineIds(new Set());
      return;
    }

    const loadedLines = (data ?? []) as QuotationLineRecord[];
    setQuotationLines(loadedLines);
    setSelectedLineIds(
      new Set(
        loadedLines
          .filter((line) =>
            sourceMode === "full_quotation" ? true : Boolean(line.selected),
          )
          .map((line) => line.id),
      ),
    );
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    setSelectedOrderIds(new Set());
    await loadOrders(companyId, search, quotationsById, clientsById, archiveFilter);
    setIsSearching(false);
  }

  async function handleArchiveFilterChange(nextFilter: ArchiveFilter) {
    setArchiveFilter(nextFilter);
    setSelectedOrderIds(new Set());

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadOrders(companyId, search, quotationsById, clientsById, nextFilter);
    setIsSearching(false);
  }

  async function archiveOrder(order: InternalOrderRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldArchive = window.confirm("¿Archivar este registro?");

    if (!shouldArchive) {
      return;
    }

    setIsUpdatingArchiveId(order.id);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsUpdatingArchiveId(null);
      setErrorMessage("No se pudo validar la sesión activa.");
      return;
    }

    const { error } = await supabase
      .from("internal_orders")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: null,
      })
      .eq("id", order.id)
      .eq("company_id", companyId);

    setIsUpdatingArchiveId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadOrders(companyId, search, quotationsById, clientsById, archiveFilter);
  }

  async function restoreOrder(order: InternalOrderRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    setIsUpdatingArchiveId(order.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("internal_orders")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("id", order.id)
      .eq("company_id", companyId);

    setIsUpdatingArchiveId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadOrders(companyId, search, quotationsById, clientsById, archiveFilter);
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(orderId)) {
        nextIds.delete(orderId);
      } else {
        nextIds.add(orderId);
      }
      return nextIds;
    });
  }

  function toggleAllVisibleOrders() {
    setSelectedOrderIds((currentIds) => {
      if (areAllVisibleOrdersSelected) {
        const nextIds = new Set(currentIds);
        orders.forEach((order) => nextIds.delete(order.id));
        return nextIds;
      }

      return new Set([...currentIds, ...orders.map((order) => order.id)]);
    });
  }

  async function bulkArchiveOrders() {
    if (!companyId || selectedActiveOrderIds.length === 0) {
      return;
    }

    const shouldArchive = window.confirm(
      "¿Archivar los registros seleccionados?",
    );

    if (!shouldArchive) {
      return;
    }

    setIsBulkUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsBulkUpdating(false);
      setErrorMessage("No se pudo validar la sesión activa.");
      return;
    }

    const { error } = await supabase
      .from("internal_orders")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: "Archivado en lote",
      })
      .eq("company_id", companyId)
      .in("id", selectedActiveOrderIds);

    setIsBulkUpdating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedOrderIds(new Set());
    setSuccessMessage("Órdenes archivadas correctamente.");
    await loadOrders(companyId, search, quotationsById, clientsById, archiveFilter);
  }

  async function bulkRestoreOrders() {
    if (!companyId || selectedArchivedOrderIds.length === 0) {
      return;
    }

    const shouldRestore = window.confirm(
      "¿Restaurar los registros seleccionados?",
    );

    if (!shouldRestore) {
      return;
    }

    setIsBulkUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("internal_orders")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("company_id", companyId)
      .in("id", selectedArchivedOrderIds);

    setIsBulkUpdating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedOrderIds(new Set());
    setSuccessMessage("Órdenes restauradas correctamente.");
    await loadOrders(companyId, search, quotationsById, clientsById, archiveFilter);
  }

  async function handleSourceModeChange(sourceMode: SourceMode) {
    setForm((currentForm) => ({
      ...currentForm,
      sourceMode,
      quotation_id: sourceMode === "manual" ? "" : currentForm.quotation_id,
    }));

    if (sourceMode === "manual") {
      setQuotationLines([]);
      setSelectedLineIds(new Set());
      return;
    }

    await loadQuotationLines(form.quotation_id, sourceMode);
  }

  async function handleQuotationChange(quotationId: string) {
    setForm((currentForm) => ({
      ...currentForm,
      quotation_id: quotationId,
    }));

    await loadQuotationLines(quotationId, form.sourceMode);
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyForm);
      setQuotationLines([]);
      setSelectedLineIds(new Set());
      setErrorMessage("");
      return;
    }

    setForm(emptyForm);
    setQuotationLines([]);
    setSelectedLineIds(new Set());
    setErrorMessage("");
    setSuccessMessage("");
    setShowCreateForm(true);
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(lineId)) {
        nextIds.delete(lineId);
      } else {
        nextIds.add(lineId);
      }
      return nextIds;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (form.sourceMode !== "manual" && !form.quotation_id) {
      setErrorMessage("Selecciona una cotización.");
      return;
    }

    const linesToCopy =
      form.sourceMode === "manual"
        ? []
        : quotationLines.filter((line) => selectedLineIds.has(line.id));

    if (form.sourceMode !== "manual" && linesToCopy.length === 0) {
      setErrorMessage("Selecciona al menos una partida de la cotización.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data: orderData, error: orderError } = await supabase
      .from("internal_orders")
      .insert({
        company_id: companyId,
        notes: cleanOptionalValue(form.notes),
        quotation_id:
          form.sourceMode === "manual" ? null : cleanOptionalValue(form.quotation_id),
      })
      .select("id")
      .single();

    if (orderError || !orderData) {
      setIsSaving(false);
      setErrorMessage(orderError?.message ?? "No se pudo crear la orden.");
      return;
    }

    if (linesToCopy.length > 0) {
      const { error: linesError } = await supabase
        .from("internal_order_lines")
        .insert(
          linesToCopy.map((line) => ({
            company_id: companyId,
            brand: line.brand,
            internal_order_id: orderData.id,
            model: line.model,
            notes: line.notes,
            product_id: line.product_id,
            product_description:
              line.custom_description ||
              (line.product_id
                ? productsById.get(line.product_id)?.description ||
                  productsById.get(line.product_id)?.name
                : null),
            quantity: toNumber(line.quantity) || 1,
            quotation_line_id: line.id,
            supplier_cost: line.supplier_cost,
            supplier_id: line.supplier_id,
            unit: line.product_id ? productsById.get(line.product_id)?.unit : null,
          })),
        );

      if (linesError) {
        setIsSaving(false);
        setErrorMessage(linesError.message);
        return;
      }
    }

    router.push(`/dashboard/ordenes/${orderData.id}`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              Crear orden interna
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              La orden define lo que se debe surtir al cliente; las compras se generan después.
            </p>
          </div>
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isSaving}
            onClick={toggleCreateForm}
            type="button"
          >
            {showCreateForm ? "Ocultar formulario" : "Nueva orden"}
          </button>
        </div>

        {showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="sourceMode">
                Origen
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="sourceMode"
                onChange={(event) =>
                  handleSourceModeChange(event.target.value as SourceMode)
                }
                value={form.sourceMode}
              >
                <option value="manual">Manual</option>
                <option value="full_quotation">Cotización completa</option>
                <option value="selected_lines">Partidas seleccionadas</option>
              </select>
            </div>

            {form.sourceMode !== "manual" ? (
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-medium text-stone-800" htmlFor="quotation_id">
                  Cotización
                </label>
                <select
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id="quotation_id"
                  onChange={(event) => handleQuotationChange(event.target.value)}
                  value={form.quotation_id}
                >
                  <option value="">Selecciona una cotización</option>
                  {quotations.map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>
                      {quotation.folio || "Sin folio"} - {quotation.status || "sin estado"}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 lg:col-span-2">
                Cliente: Orden manual
              </div>
            )}

            <div className="space-y-2 lg:col-span-3">
              <label className="text-sm font-medium text-stone-800" htmlFor="notes">
                Notas
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="notes"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    notes: event.target.value,
                  }))
                }
                value={form.notes}
              />
            </div>

            {form.sourceMode !== "manual" && form.quotation_id ? (
              <div className="lg:col-span-3">
                <div className="rounded-lg border border-stone-200">
                  <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-sm font-semibold text-stone-900">
                      Partidas de {selectedQuotation?.folio || "cotización"}
                    </p>
                  </div>
                  <div className="divide-y divide-stone-200">
                    {quotationLines.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-stone-600">
                        No hay partidas para copiar.
                      </p>
                    ) : (
                      quotationLines.map((line) => (
                        <label
                          className="flex items-start gap-3 px-4 py-3 text-sm"
                          key={line.id}
                        >
                          <input
                            checked={selectedLineIds.has(line.id)}
                            className="mt-1 h-4 w-4 rounded border-stone-300 text-emerald-800"
                            disabled={form.sourceMode === "full_quotation"}
                            onChange={() => toggleLine(line.id)}
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-stone-950">
                              {lineDescription(line)}
                            </span>
                            <span className="mt-1 block text-stone-600">
                              Cantidad {toNumber(line.quantity)} · {formatMoney(line.line_total)}
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button
                className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Creando..." : "Crear orden"}
              </button>
              <button
                className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={toggleCreateForm}
                type="button"
              >
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
              <h3 className="text-lg font-semibold text-stone-950">
                Órdenes internas
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por folio, cotización, cliente, responsable, estado o notas.
              </p>
              <div className="mt-3">
                <ArchiveFilterToggle
                  disabled={isLoading || isSearching}
                  onChange={handleArchiveFilterChange}
                  value={archiveFilter}
                />
              </div>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="order-search">
                Buscar orden
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 sm:w-72"
                  disabled={isLoading || isSearching}
                  id="order-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar órdenes"
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

        {successMessage ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}

        <BulkArchiveActionBar
          archivedCount={selectedArchivedOrderIds.length}
          disabled={isBulkUpdating}
          filter={archiveFilter}
          onArchive={bulkArchiveOrders}
          onRestore={bulkRestoreOrders}
          selectedCount={selectedOrders.length}
        />

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando órdenes...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay órdenes para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="print:hidden px-5 py-3">
                    <input
                      aria-label="Seleccionar órdenes visibles"
                      checked={areAllVisibleOrdersSelected}
                      className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                      onChange={toggleAllVisibleOrders}
                      type="checkbox"
                    />
                  </th>
                  <th className="px-5 py-3">Folio</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Cotización</th>
                  <th className="px-5 py-3">Responsable</th>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {orders.map((order) => {
                  const quotation = order.quotation_id
                    ? quotationsById.get(order.quotation_id)
                    : undefined;

                  return (
                    <tr key={order.id}>
                      <td className="print:hidden px-5 py-4">
                        <input
                          aria-label={`Seleccionar orden ${order.folio || "sin folio"}`}
                          checked={selectedOrderIds.has(order.id)}
                          className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                          onChange={() => toggleOrderSelection(order.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-5 py-4 font-medium text-stone-950">
                        <Link
                          className="text-emerald-800 hover:text-emerald-950 hover:underline"
                          href={`/dashboard/ordenes/${order.id}`}
                        >
                          {order.folio || "Sin folio"}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {clientLabelForOrder(order, quotationsById, clientsById)}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {quotation?.folio || "Sin cotización"}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {order.responsible || "Sin responsable"}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            {order.status || "abierta"}
                          </span>
                          {order.archived_at ? <ArchiveBadge /> : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(totalsByOrderId.get(order.id) ?? 0)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            className="inline-flex h-9 items-center rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                            href={`/dashboard/ordenes/${order.id}`}
                          >
                            Ver detalle
                          </Link>
                          {order.archived_at ? (
                            <button
                              className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isUpdatingArchiveId === order.id}
                              onClick={() => restoreOrder(order)}
                              type="button"
                            >
                              {isUpdatingArchiveId === order.id
                                ? "Restaurando..."
                                : "Restaurar"}
                            </button>
                          ) : (
                            <button
                              className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isUpdatingArchiveId === order.id}
                              onClick={() => archiveOrder(order)}
                              type="button"
                            >
                              {isUpdatingArchiveId === order.id
                                ? "Archivando..."
                                : "Archivar"}
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
