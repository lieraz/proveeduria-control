"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

export type ProcessTraceEntityType =
  | "client_request"
  | "quotation"
  | "internal_order"
  | "purchase_run"
  | "delivery"
  | "billing";

type ProcessTraceProps = {
  startingEntityType: ProcessTraceEntityType;
  startingEntityId: string;
};

type TraceRecord = {
  id: string;
  folio?: string | null;
  client_reference_folio?: string | null;
  invoice_folio?: string | null;
  client_id?: string | null;
  request_id?: string | null;
  quotation_id?: string | null;
  internal_order_id?: string | null;
  delivery_id?: string | null;
  requested_at?: string | null;
  quoted_at?: string | null;
  approved_at?: string | null;
  scheduled_at?: string | null;
  scheduled_date?: string | null;
  picked_up_at?: string | null;
  delivered_to_office_at?: string | null;
  delivered_at?: string | null;
  invoiced_at?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

type TraceData = {
  clientRequests: TraceRecord[];
  quotations: TraceRecord[];
  internalOrders: TraceRecord[];
  purchaseRuns: TraceRecord[];
  deliveries: TraceRecord[];
  billings: TraceRecord[];
};

type TraceStep = {
  key: keyof TraceData;
  label: string;
  emptyLabel: string;
  hrefBase: string;
};

const steps: TraceStep[] = [
  {
    emptyLabel: "Sin requerimiento",
    hrefBase: "/dashboard/solicitudes",
    key: "clientRequests",
    label: "Requerimiento",
  },
  {
    emptyLabel: "Sin cotización",
    hrefBase: "/dashboard/cotizaciones",
    key: "quotations",
    label: "Cotización",
  },
  {
    emptyLabel: "Sin orden",
    hrefBase: "/dashboard/ordenes",
    key: "internalOrders",
    label: "Orden",
  },
  {
    emptyLabel: "Sin compra / recolección",
    hrefBase: "/dashboard/compras",
    key: "purchaseRuns",
    label: "Compra / Recolección",
  },
  {
    emptyLabel: "Sin entrega",
    hrefBase: "/dashboard/entregas",
    key: "deliveries",
    label: "Entrega",
  },
  {
    emptyLabel: "Sin facturación",
    hrefBase: "/dashboard/facturacion",
    key: "billings",
    label: "Facturación",
  },
];

const emptyTraceData: TraceData = {
  billings: [],
  clientRequests: [],
  deliveries: [],
  internalOrders: [],
  purchaseRuns: [],
  quotations: [],
};

function uniqueById(records: TraceRecord[]) {
  return Array.from(new Map(records.map((record) => [record.id, record])).values());
}

function ids(records: TraceRecord[]) {
  return records.map((record) => record.id).filter(Boolean);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return value.replace("T", " ").slice(0, 16);
}

function recordDate(stepKey: keyof TraceData, record: TraceRecord) {
  if (stepKey === "clientRequests") return record.requested_at ?? record.created_at;
  if (stepKey === "quotations") return record.quoted_at ?? record.created_at;
  if (stepKey === "internalOrders") return record.approved_at ?? record.created_at;
  if (stepKey === "purchaseRuns") {
    return (
      record.scheduled_at ??
      record.picked_up_at ??
      record.delivered_to_office_at ??
      record.delivered_at ??
      record.created_at
    );
  }
  if (stepKey === "deliveries") return record.delivered_at ?? record.scheduled_date ?? record.created_at;
  return record.invoiced_at ?? record.due_date ?? record.delivered_at ?? record.created_at;
}

function recordTitle(step: TraceStep, record: TraceRecord) {
  if (step.key === "clientRequests") {
    return record.folio ? `${step.label} #${record.folio}` : "Requerimiento sin folio";
  }

  if (step.key === "billings") {
    return record.invoice_folio
      ? `${step.label} #${record.invoice_folio}`
      : step.label;
  }

  return record.folio ? `${step.label} #${record.folio}` : step.label;
}

function statusClass(status: string | null | undefined) {
  if (["aprobada", "aprobado", "comprado", "recogido", "entregado", "facturado", "pagado"].includes(status ?? "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (["cancelado", "cancelada", "rechazada", "vencido"].includes(status ?? "")) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (["parcial", "cotizando", "asignada", "en camino", "en tránsito"].includes(status ?? "")) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function recordSupportingText(stepKey: keyof TraceData, record: TraceRecord) {
  if (stepKey === "clientRequests" && record.client_reference_folio) {
    return `Folio cliente: ${record.client_reference_folio}`;
  }

  return null;
}

export function ProcessTrace({
  startingEntityId,
  startingEntityType,
}: ProcessTraceProps) {
  const supabase = useMemo(() => createClient(), []);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [traceData, setTraceData] = useState<TraceData>(emptyTraceData);

  useEffect(() => {
    let isMounted = true;

    async function loadTrace() {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (isMounted) {
          setErrorMessage("No se pudo validar la sesión activa.");
          setIsLoading(false);
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.company_id) {
        if (isMounted) {
          setErrorMessage(profileError?.message ?? "Tu perfil no tiene una empresa asignada.");
          setIsLoading(false);
        }
        return;
      }

      const companyId = profile.company_id as string;
      const nextData: TraceData = { ...emptyTraceData };

      async function fetchOne(table: string, select: string, id: string) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq("company_id", companyId)
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        return data as unknown as TraceRecord | null;
      }

      async function fetchManyByIds(table: string, select: string, recordIds: string[]) {
        if (recordIds.length === 0) return [];

        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq("company_id", companyId)
          .in("id", recordIds);

        if (error) throw error;
        return (data ?? []) as unknown as TraceRecord[];
      }

      try {
        let requestId: string | null = null;
        let quotationId: string | null = null;
        let orderId: string | null = null;
        let deliveryId: string | null = null;
        let billingId: string | null = null;

        if (startingEntityType === "client_request") {
          requestId = startingEntityId;
        }

        if (startingEntityType === "quotation") {
          const quotation = await fetchOne(
            "quotations",
            "id,folio,request_id,quoted_at,status,archived_at,created_at",
            startingEntityId,
          );
          quotationId = quotation?.id ?? startingEntityId;
          requestId = quotation?.request_id ?? null;
          if (quotation) nextData.quotations = [quotation];
        }

        if (startingEntityType === "internal_order") {
          const order = await fetchOne(
            "internal_orders",
            "id,folio,quotation_id,approved_at,status,archived_at,created_at",
            startingEntityId,
          );
          orderId = order?.id ?? startingEntityId;
          quotationId = order?.quotation_id ?? null;
          if (order) nextData.internalOrders = [order];
        }

        if (startingEntityType === "purchase_run") {
          const purchaseRun = await fetchOne(
            "purchase_runs",
            "id,internal_order_id,scheduled_at,picked_up_at,delivered_to_office_at,delivered_at,status,archived_at,created_at",
            startingEntityId,
          );
          orderId = purchaseRun?.internal_order_id ?? null;
          if (purchaseRun) nextData.purchaseRuns = [purchaseRun];
        }

        if (startingEntityType === "delivery") {
          const delivery = await fetchOne(
            "deliveries",
            "id,internal_order_id,scheduled_date,delivered_at,status,archived_at,created_at",
            startingEntityId,
          );
          orderId = delivery?.internal_order_id ?? null;
          deliveryId = delivery?.id ?? startingEntityId;
          if (delivery) nextData.deliveries = [delivery];
        }

        if (startingEntityType === "billing") {
          const billing = await fetchOne(
            "billing",
            "id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,delivered_at,status,archived_at,created_at",
            startingEntityId,
          );
          orderId = billing?.internal_order_id ?? null;
          deliveryId = billing?.delivery_id ?? null;
          billingId = billing?.id ?? startingEntityId;
          if (billing) nextData.billings = [billing];
        }

        if (deliveryId && !orderId) {
          const delivery = await fetchOne(
            "deliveries",
            "id,internal_order_id,scheduled_date,delivered_at,status,archived_at,created_at",
            deliveryId,
          );
          orderId = delivery?.internal_order_id ?? null;
          if (delivery) nextData.deliveries = uniqueById([...nextData.deliveries, delivery]);
        }

        if (orderId && !quotationId) {
          const order = await fetchOne(
            "internal_orders",
            "id,folio,quotation_id,approved_at,status,archived_at,created_at",
            orderId,
          );
          quotationId = order?.quotation_id ?? null;
          if (order) nextData.internalOrders = uniqueById([...nextData.internalOrders, order]);
        }

        if (quotationId && !requestId) {
          const quotation = await fetchOne(
            "quotations",
            "id,folio,request_id,quoted_at,status,archived_at,created_at",
            quotationId,
          );
          requestId = quotation?.request_id ?? null;
          if (quotation) nextData.quotations = uniqueById([...nextData.quotations, quotation]);
        }

        if (requestId) {
          const request = await fetchOne(
            "client_requests",
            "id,folio,client_reference_folio,status,requested_at,archived_at,client_id,created_at",
            requestId,
          );
          if (request) nextData.clientRequests = [request];
        }

        if (requestId) {
          const { data, error } = await supabase
            .from("quotations")
            .select("id,folio,request_id,quoted_at,status,archived_at,created_at")
            .eq("company_id", companyId)
            .eq("request_id", requestId)
            .order("quoted_at", { ascending: true, nullsFirst: false });

          if (error) throw error;
          nextData.quotations = uniqueById([
            ...nextData.quotations,
            ...((data ?? []) as unknown as TraceRecord[]),
          ]);
        }

        const quotationIds = uniqueById([
          ...nextData.quotations,
          ...(quotationId ? [{ id: quotationId }] : []),
        ]).map((record) => record.id);

        if (quotationIds.length > 0) {
          const { data, error } = await supabase
            .from("internal_orders")
            .select("id,folio,quotation_id,approved_at,status,archived_at,created_at")
            .eq("company_id", companyId)
            .in("quotation_id", quotationIds)
            .order("created_at", { ascending: true });

          if (error) throw error;
          nextData.internalOrders = uniqueById([
            ...nextData.internalOrders,
            ...((data ?? []) as unknown as TraceRecord[]),
          ]);
        }

        if (orderId) {
          const directOrders = await fetchManyByIds(
            "internal_orders",
            "id,folio,quotation_id,approved_at,status,archived_at,created_at",
            [orderId],
          );
          nextData.internalOrders = uniqueById([...nextData.internalOrders, ...directOrders]);
        }

        const orderIds = ids(nextData.internalOrders);

        if (orderIds.length > 0) {
          const [purchaseRunsResponse, deliveriesResponse, billingsByOrderResponse] =
            await Promise.all([
              supabase
                .from("purchase_runs")
                .select("id,internal_order_id,scheduled_at,picked_up_at,delivered_to_office_at,delivered_at,status,archived_at,created_at")
                .eq("company_id", companyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
              supabase
                .from("deliveries")
                .select("id,internal_order_id,scheduled_date,delivered_at,status,archived_at,created_at")
                .eq("company_id", companyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
              supabase
                .from("billing")
                .select("id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,delivered_at,status,archived_at,created_at")
                .eq("company_id", companyId)
                .in("internal_order_id", orderIds)
                .order("created_at", { ascending: true }),
            ]);

          const firstError =
            purchaseRunsResponse.error ??
            deliveriesResponse.error ??
            billingsByOrderResponse.error;

          if (firstError) throw firstError;

          nextData.purchaseRuns = uniqueById([
            ...nextData.purchaseRuns,
            ...((purchaseRunsResponse.data ?? []) as unknown as TraceRecord[]),
          ]);
          nextData.deliveries = uniqueById([
            ...nextData.deliveries,
            ...((deliveriesResponse.data ?? []) as unknown as TraceRecord[]),
          ]);
          nextData.billings = uniqueById([
            ...nextData.billings,
            ...((billingsByOrderResponse.data ?? []) as unknown as TraceRecord[]),
          ]);
        }

        const deliveryIds = ids(nextData.deliveries);
        if (deliveryIds.length > 0) {
          const { data, error } = await supabase
            .from("billing")
            .select("id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,delivered_at,status,archived_at,created_at")
            .eq("company_id", companyId)
            .in("delivery_id", deliveryIds)
            .order("created_at", { ascending: true });

          if (error) throw error;
          nextData.billings = uniqueById([
            ...nextData.billings,
            ...((data ?? []) as unknown as TraceRecord[]),
          ]);
        }

        if (billingId) {
          const directBillings = await fetchManyByIds(
            "billing",
            "id,internal_order_id,delivery_id,invoice_folio,invoiced_at,due_date,delivered_at,status,archived_at,created_at",
            [billingId],
          );
          nextData.billings = uniqueById([...nextData.billings, ...directBillings]);
        }

        if (isMounted) {
          setTraceData(nextData);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar la trazabilidad.");
          setTraceData(emptyTraceData);
          setIsLoading(false);
        }
      }
    }

    loadTrace();

    return () => {
      isMounted = false;
    };
  }, [startingEntityId, startingEntityType, supabase]);

  return (
    <section className="mb-6 rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-950">Trazabilidad del proceso</h2>
          <p className="text-sm text-stone-600">
            Requerimiento → Cotización → Orden → Compra/Recolección → Entrega → Facturación
          </p>
        </div>
        {isLoading ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Cargando
          </span>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-6">
        {steps.map((step) => {
          const records = traceData[step.key];

          return (
            <div key={step.key} className="min-w-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {step.label}
              </div>
              <div className="space-y-2">
                {records.length > 0 ? (
                  records.map((record) => (
                    <Link
                      className="block rounded-md border border-stone-200 bg-stone-50 p-3 text-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                      href={`${step.hrefBase}/${record.id}`}
                      key={record.id}
                    >
                      <div className="font-semibold text-stone-950">
                        {recordTitle(step, record)}
                      </div>
                      {recordSupportingText(step.key, record) ? (
                        <div className="mt-1 text-xs font-medium text-stone-700">
                          {recordSupportingText(step.key, record)}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(record.status)}`}>
                          {record.status || "Sin estado"}
                        </span>
                        {record.archived_at ? (
                          <span className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                            Archivado
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs text-stone-600">
                        {formatDate(recordDate(step.key, record))}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-stone-200 bg-stone-50 p-3 text-sm text-stone-500">
                    {isLoading ? "Buscando..." : step.emptyLabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
