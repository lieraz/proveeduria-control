"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string | null;
};

type ClientRequestRecord = {
  id: string;
  folio: string | null;
  client_reference_folio: string | null;
  client_id: string | null;
  requested_at: string | null;
  status: string | null;
  created_at: string | null;
};

type QuotationRecord = {
  id: string;
  folio: string | null;
  request_id: string | null;
  quoted_at: string | null;
  status: string | null;
  created_at: string | null;
};

type InternalOrderRecord = {
  id: string;
  folio: string | null;
  quotation_id: string | null;
  approved_at: string | null;
  status: string | null;
  created_at: string | null;
};

type PurchaseRunRecord = {
  id: string;
  internal_order_id: string | null;
  scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_to_office_at: string | null;
  delivered_at: string | null;
  status: string | null;
  created_at: string | null;
};

type DeliveryRecord = {
  id: string;
  internal_order_id: string | null;
  scheduled_date: string | null;
  delivered_at: string | null;
  status: string | null;
  created_at: string | null;
};

type BillingRecord = {
  id: string;
  internal_order_id: string | null;
  delivery_id: string | null;
  invoice_folio: string | null;
  invoiced_at: string | null;
  due_date: string | null;
  status: string | null;
  created_at: string | null;
};

type TraceLink = {
  href: string;
  label: string;
  status: string | null;
  date: string | null;
};

type TraceabilityRow = {
  id: string;
  request: ClientRequestRecord;
  clientName: string;
  quotation: QuotationRecord | null;
  order: InternalOrderRecord | null;
  purchaseRuns: PurchaseRunRecord[];
  deliveries: DeliveryRecord[];
  billings: BillingRecord[];
  currentStatus: string;
  currentStatusDate: string | null;
};

type Filters = {
  startDate: string;
  endDate: string;
  clientId: string;
  status: string;
};

const emptyFilters: Filters = {
  clientId: "",
  endDate: "",
  startDate: "",
  status: "",
};

const inputClass =
  "h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

const reportColumns = [
  "Requerimiento folio",
  "Folio del cliente",
  "Cliente",
  "Cotización folio",
  "Orden folio",
  "Compra/Recolección",
  "Entrega",
  "Facturación",
  "Status actual",
];

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const [date] = value.split("T");
  return date || value;
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim() || "Sin status";
}

function statusClass(status: string) {
  if (["aprobada", "aprobado", "comprado", "recogido", "entregado", "facturado", "pagado"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (["cancelado", "cancelada", "rechazada", "vencido"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (["parcial", "cotizando", "asignada", "en camino", "en tránsito"].includes(status)) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function byCreatedAt<T extends { created_at: string | null }>(records: T[]) {
  return [...records].sort((firstRecord, secondRecord) =>
    (firstRecord.created_at ?? "").localeCompare(secondRecord.created_at ?? ""),
  );
}

function groupBy<T>(records: T[], getKey: (record: T) => string) {
  const groupedRecords = new Map<string, T[]>();

  records.forEach((record) => {
    const key = getKey(record);
    groupedRecords.set(key, [...(groupedRecords.get(key) ?? []), record]);
  });

  return groupedRecords;
}

function latestByDate<T>(records: T[], getDate: (record: T) => string | null) {
  return [...records].sort((firstRecord, secondRecord) =>
    (getDate(secondRecord) ?? "").localeCompare(getDate(firstRecord) ?? ""),
  )[0];
}

function purchaseRunDate(record: PurchaseRunRecord) {
  return (
    record.delivered_at ??
    record.delivered_to_office_at ??
    record.picked_up_at ??
    record.scheduled_at ??
    record.created_at
  );
}

function deliveryDate(record: DeliveryRecord) {
  return record.delivered_at ?? record.scheduled_date ?? record.created_at;
}

function billingDate(record: BillingRecord) {
  return record.invoiced_at ?? record.due_date ?? record.created_at;
}

function currentStatusForRow(row: Omit<TraceabilityRow, "currentStatus" | "currentStatusDate">) {
  const billing = latestByDate(row.billings, billingDate);
  if (billing) {
    return { date: billingDate(billing), status: normalizeStatus(billing.status) };
  }

  const delivery = latestByDate(row.deliveries, deliveryDate);
  if (delivery) {
    return { date: deliveryDate(delivery), status: normalizeStatus(delivery.status) };
  }

  const purchaseRun = latestByDate(row.purchaseRuns, purchaseRunDate);
  if (purchaseRun) {
    return { date: purchaseRunDate(purchaseRun), status: normalizeStatus(purchaseRun.status) };
  }

  if (row.order) {
    return { date: row.order.approved_at ?? row.order.created_at, status: normalizeStatus(row.order.status) };
  }

  if (row.quotation) {
    return { date: row.quotation.quoted_at ?? row.quotation.created_at, status: normalizeStatus(row.quotation.status) };
  }

  return {
    date: row.request.requested_at ?? row.request.created_at,
    status: normalizeStatus(row.request.status),
  };
}

function purchaseRunLabel(purchaseRun: PurchaseRunRecord) {
  return `Compra/Recolección · ${formatDate(purchaseRunDate(purchaseRun))}`;
}

function deliveryLabel(delivery: DeliveryRecord) {
  return `Entrega · ${formatDate(deliveryDate(delivery))}`;
}

function billingLabel(billing: BillingRecord) {
  return billing.invoice_folio ? `Factura #${billing.invoice_folio}` : "Facturación pendiente";
}

function csvEscape(value: string) {
  const escapedValue = value.replace(/"/g, '""');
  return /[",\n]/.test(escapedValue) ? `"${escapedValue}"` : escapedValue;
}

function joinLabels(values: string[]) {
  return values.length > 0 ? values.join(" | ") : "";
}

function rowCsvValues(row: TraceabilityRow) {
  return [
    row.request.folio ?? "",
    row.request.client_reference_folio ?? "",
    row.clientName,
    row.quotation?.folio ?? "",
    row.order?.folio ?? "",
    joinLabels(row.purchaseRuns.map(purchaseRunLabel)),
    joinLabels(row.deliveries.map(deliveryLabel)),
    joinLabels(row.billings.map(billingLabel)),
    row.currentStatus,
  ];
}

function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="font-semibold text-emerald-800 hover:underline" href={href}>
      {children}
    </Link>
  );
}

function MultiLinkCell({ emptyLabel, links }: { emptyLabel: string; links: TraceLink[] }) {
  if (links.length === 0) {
    return <span className="text-stone-400">{emptyLabel}</span>;
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div key={link.href}>
          <CellLink href={link.href}>{link.label}</CellLink>
          <p className="mt-0.5 text-xs text-stone-500">
            {normalizeStatus(link.status)} · {formatDate(link.date)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function TrazabilidadClient() {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [rows, setRows] = useState<TraceabilityRow[]>([]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.currentStatus))).sort(),
    [rows],
  );

  const filteredRows = useMemo(
    () =>
      filters.status
        ? rows.filter((row) => row.currentStatus === filters.status)
        : rows,
    [filters.status, rows],
  );

  const loadReport = useCallback(
    async (
      activeCompanyId: string,
      activeFilters: Filters,
      activeClients: ClientRecord[],
    ) => {
      setErrorMessage("");

      let requestQuery = supabase
        .from("client_requests")
        .select("id,folio,client_reference_folio,client_id,requested_at,status,created_at")
        .eq("company_id", activeCompanyId)
        .order("requested_at", { ascending: false, nullsFirst: false });

      if (activeFilters.startDate) {
        requestQuery = requestQuery.gte("requested_at", activeFilters.startDate);
      }

      if (activeFilters.endDate) {
        requestQuery = requestQuery.lt("requested_at", nextDate(activeFilters.endDate));
      }

      if (activeFilters.clientId) {
        requestQuery = requestQuery.eq("client_id", activeFilters.clientId);
      }

      const { data: requestData, error: requestError } = await requestQuery;

      if (requestError) {
        setErrorMessage(requestError.message);
        setRows([]);
        return;
      }

      const requests = (requestData ?? []) as ClientRequestRecord[];
      const requestIds = requests.map((request) => request.id);

      if (requestIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select("id,folio,request_id,quoted_at,status,created_at")
        .eq("company_id", activeCompanyId)
        .in("request_id", requestIds)
        .order("created_at", { ascending: true });

      if (quotationError) {
        setErrorMessage(quotationError.message);
        setRows([]);
        return;
      }

      const quotations = (quotationData ?? []) as QuotationRecord[];
      const quotationIds = quotations.map((quotation) => quotation.id);

      const { data: orderData, error: orderError } =
        quotationIds.length > 0
          ? await supabase
              .from("internal_orders")
              .select("id,folio,quotation_id,approved_at,status,created_at")
              .eq("company_id", activeCompanyId)
              .in("quotation_id", quotationIds)
              .order("created_at", { ascending: true })
          : { data: [], error: null };

      if (orderError) {
        setErrorMessage(orderError.message);
        setRows([]);
        return;
      }

      const orders = (orderData ?? []) as InternalOrderRecord[];
      const orderIds = orders.map((order) => order.id);

      const [purchaseRunsResponse, deliveriesResponse, billingsByOrderResponse] =
        orderIds.length > 0
          ? await Promise.all([
              supabase
                .from("purchase_runs")
                .select("id,internal_order_id,scheduled_at,picked_up_at,delivered_to_office_at,delivered_at,status,created_at")
                .eq("company_id", activeCompanyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
              supabase
                .from("deliveries")
                .select("id,internal_order_id,scheduled_date,delivered_at,status,created_at")
                .eq("company_id", activeCompanyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
              supabase
                .from("billing")
                .select("id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,status,created_at")
                .eq("company_id", activeCompanyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
            ];

      const relationError =
        purchaseRunsResponse.error ??
        deliveriesResponse.error ??
        billingsByOrderResponse.error;

      if (relationError) {
        setErrorMessage(relationError.message);
        setRows([]);
        return;
      }

      const purchaseRuns = (purchaseRunsResponse.data ?? []) as PurchaseRunRecord[];
      const deliveries = (deliveriesResponse.data ?? []) as DeliveryRecord[];
      const billingsByOrder = (billingsByOrderResponse.data ?? []) as BillingRecord[];
      const deliveryIds = deliveries.map((delivery) => delivery.id);

      const { data: billingsByDeliveryData, error: billingsByDeliveryError } =
        deliveryIds.length > 0
          ? await supabase
              .from("billing")
              .select("id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,status,created_at")
              .eq("company_id", activeCompanyId)
              .in("delivery_id", deliveryIds)
              .order("created_at", { ascending: true })
          : { data: [], error: null };

      if (billingsByDeliveryError) {
        setErrorMessage(billingsByDeliveryError.message);
        setRows([]);
        return;
      }

      const billings = Array.from(
        new Map(
          [...billingsByOrder, ...((billingsByDeliveryData ?? []) as BillingRecord[])].map((billing) => [
            billing.id,
            billing,
          ]),
        ).values(),
      );

      const clientsById = new Map(activeClients.map((client) => [client.id, client]));
      const quotationsByRequestId = groupBy(quotations, (quotation) => quotation.request_id ?? "");
      const ordersByQuotationId = groupBy(orders, (order) => order.quotation_id ?? "");
      const purchaseRunsByOrderId = groupBy(purchaseRuns, (purchaseRun) => purchaseRun.internal_order_id ?? "");
      const deliveriesByOrderId = groupBy(deliveries, (delivery) => delivery.internal_order_id ?? "");
      const billingsByOrderId = groupBy(billings, (billing) => billing.internal_order_id ?? "");
      const billingsByDeliveryId = groupBy(billings, (billing) => billing.delivery_id ?? "");

      const nextRows = requests.flatMap((request) => {
        const requestQuotations = quotationsByRequestId.get(request.id) ?? [];
        const rowQuotations = requestQuotations.length > 0 ? byCreatedAt(requestQuotations) : [null];

        return rowQuotations.flatMap((quotation) => {
          const quotationOrders = quotation ? ordersByQuotationId.get(quotation.id) ?? [] : [];
          const rowOrders = quotationOrders.length > 0 ? byCreatedAt(quotationOrders) : [null];

          return rowOrders.map((order) => {
            const rowDeliveries = order ? deliveriesByOrderId.get(order.id) ?? [] : [];
            const rowBillingsByDelivery = rowDeliveries.flatMap((delivery) => billingsByDeliveryId.get(delivery.id) ?? []);
            const baseRow = {
              billings: order
                ? byCreatedAt(
                    Array.from(
                      new Map(
                        [...(billingsByOrderId.get(order.id) ?? []), ...rowBillingsByDelivery].map((billing) => [
                          billing.id,
                          billing,
                        ]),
                      ).values(),
                    ),
                  )
                : [],
              clientName: request.client_id ? clientsById.get(request.client_id)?.name ?? "Cliente no disponible" : "Sin cliente",
              deliveries: order ? byCreatedAt(rowDeliveries) : [],
              id: `${request.id}-${quotation?.id ?? "sin-cotizacion"}-${order?.id ?? "sin-orden"}`,
              order,
              purchaseRuns: order ? byCreatedAt(purchaseRunsByOrderId.get(order.id) ?? []) : [],
              quotation,
              request,
            };
            const currentStatus = currentStatusForRow(baseRow);

            return {
              ...baseRow,
              currentStatus: currentStatus.status,
              currentStatusDate: currentStatus.date,
            };
          });
        });
      });

      setRows(nextRows);
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

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id,name")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (clientError) {
        setErrorMessage(clientError.message);
        setIsLoading(false);
        return;
      }

      const loadedClients = (clientData ?? []) as ClientRecord[];
      setClients(loadedClients);
      await loadReport(activeCompanyId, emptyFilters, loadedClients);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadReport, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    setIsSearching(true);
    await loadReport(companyId, filters, clients);
    setIsSearching(false);
  }

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function exportCsv() {
    const csvRows = [
      reportColumns,
      ...filteredRows.map(rowCsvValues),
    ].map((row) => row.map(csvEscape).join(","));
    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trazabilidad-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-5 lg:items-end" onSubmit={handleSearch}>
          <Field id="startDate" label="Fecha inicial">
            <input
              className={inputClass}
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(event) => updateFilter("startDate", event.target.value)}
            />
          </Field>
          <Field id="endDate" label="Fecha final">
            <input
              className={inputClass}
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(event) => updateFilter("endDate", event.target.value)}
            />
          </Field>
          <Field id="clientId" label="Cliente">
            <select
              className={inputClass}
              id="clientId"
              value={filters.clientId}
              onChange={(event) => updateFilter("clientId", event.target.value)}
            >
              <option value="">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name ?? "Cliente sin nombre"}
                </option>
              ))}
            </select>
          </Field>
          <Field id="status" label="Status">
            <select
              className={inputClass}
              id="status"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="">Todos los status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isSearching || isLoading}
              type="submit"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {isSearching ? "Buscando..." : "Filtrar"}
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || filteredRows.length === 0}
              onClick={exportCsv}
              type="button"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar CSV
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">Reporte de trazabilidad</h3>
              <p className="mt-1 text-sm text-stone-600">
                {filteredRows.length} registro{filteredRows.length === 1 ? "" : "s"} para mostrar.
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <p className="m-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">Cargando trazabilidad...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">No hay registros para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  {reportColumns.map((column) => (
                    <th className="px-5 py-3" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {filteredRows.map((row) => (
                  <tr className="align-top" key={row.id}>
                    <td className="px-5 py-4">
                      <CellLink href={`/dashboard/solicitudes/${row.request.id}`}>
                        {row.request.folio ?? "Sin folio"}
                      </CellLink>
                    </td>
                    <td className="px-5 py-4">
                      {row.request.client_reference_folio ? (
                        <CellLink href={`/dashboard/solicitudes/${row.request.id}`}>
                          {row.request.client_reference_folio}
                        </CellLink>
                      ) : (
                        <span className="text-stone-400">Sin folio</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-medium text-stone-800">{row.clientName}</td>
                    <td className="px-5 py-4">
                      {row.quotation ? (
                        <CellLink href={`/dashboard/cotizaciones/${row.quotation.id}`}>
                          {row.quotation.folio ?? "Sin folio"}
                        </CellLink>
                      ) : (
                        <span className="text-stone-400">Sin cotización</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {row.order ? (
                        <CellLink href={`/dashboard/ordenes/${row.order.id}`}>
                          {row.order.folio ?? "Sin folio"}
                        </CellLink>
                      ) : (
                        <span className="text-stone-400">Sin orden</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <MultiLinkCell
                        emptyLabel="Sin compra/recolección"
                        links={row.purchaseRuns.map((purchaseRun) => ({
                          date: purchaseRunDate(purchaseRun),
                          href: `/dashboard/compras/${purchaseRun.id}`,
                          label: purchaseRunLabel(purchaseRun),
                          status: purchaseRun.status,
                        }))}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <MultiLinkCell
                        emptyLabel="Sin entrega"
                        links={row.deliveries.map((delivery) => ({
                          date: deliveryDate(delivery),
                          href: `/dashboard/entregas/${delivery.id}`,
                          label: deliveryLabel(delivery),
                          status: delivery.status,
                        }))}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <MultiLinkCell
                        emptyLabel="Sin facturación"
                        links={row.billings.map((billing) => ({
                          date: billingDate(billing),
                          href: `/dashboard/facturacion/${billing.id}`,
                          label: billingLabel(billing),
                          status: billing.status,
                        }))}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.currentStatus)}`}>
                        {row.currentStatus}
                      </span>
                      <p className="mt-2 text-xs text-stone-500">{formatDate(row.currentStatusDate)}</p>
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

function Field({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-stone-800" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
