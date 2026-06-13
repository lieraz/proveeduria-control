"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardList, FilePlus2, FileText, Plus, ReceiptText, Truck } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string | null;
};

type SupplierRecord = {
  id: string;
  name: string | null;
};

type ContactRecord = {
  id: string;
  contact_name: string | null;
  organization_area: string | null;
  position: string | null;
};

type QuotationReference = {
  id: string;
  client_id: string | null;
  contact_ref_id?: string | null;
};

type InternalOrderReference = {
  id: string;
  folio: string | null;
  quotation_id?: string | null;
};

type DashboardRecord = {
  id: string;
  title: string;
  lines: string[];
  status: string;
  date: string | null;
  href: string;
};

type DashboardSection = {
  key: string;
  title: string;
  description: string;
  statuses: string[];
  total: number;
  countsByStatus: Record<string, number>;
  records: DashboardRecord[];
  error: string | null;
};

type RawRecord = Record<string, unknown>;

const requestStatuses = ["nueva", "cotizando", "cotizada", "aprobada", "rechazada", "cerrada"];
const quotationStatuses = ["borrador", "enviada", "aprobada", "rechazada", "cancelada"];
const orderStatuses = [
  "por comprar",
  "comprando",
  "comprado",
  "recibido",
  "entregado",
  "listo para facturar",
  "facturado",
  "cobrado",
  "cancelado",
];
const purchaseStatuses = [
  "pendiente",
  "asignada",
  "en camino",
  "comprado",
  "recogido",
  "entregado en oficina",
  "cancelado",
];
const deliveryStatuses = ["pendiente", "parcial", "entregado"];
const billingStatuses = ["pendiente de facturar", "facturado", "vencido", "pagado"];

const emptySections: DashboardSection[] = [
  sectionShell("solicitudes", "Requerimientos", "Entradas de clientes por atender.", requestStatuses),
  sectionShell("cotizaciones", "Cotizaciones", "Propuestas comerciales activas.", quotationStatuses),
  sectionShell("ordenes", "Órdenes", "Órdenes internas aprobadas y en proceso.", orderStatuses),
  sectionShell("compras", "Compras/Recolecciones", "Compras con proveedores y recolecciones.", purchaseStatuses),
  sectionShell("entregas", "Entregas", "Seguimiento de entregas al cliente.", deliveryStatuses),
  sectionShell("facturacion", "Facturación/Cobranza", "Facturas, vencimientos y cobranza.", billingStatuses),
];

function sectionShell(
  key: string,
  title: string,
  description: string,
  statuses: string[],
): DashboardSection {
  return {
    key,
    title,
    description,
    statuses,
    total: 0,
    countsByStatus: {},
    records: [],
    error: null,
  };
}

function textValue(value: unknown) {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function folioLabel(kind: string, folio: unknown, fallback: string) {
  const cleanFolio = textValue(folio);
  return cleanFolio ? `${kind} #${cleanFolio}` : fallback;
}

function orderFolioLabel(order: InternalOrderReference | null | undefined) {
  const folio = textValue(order?.folio);
  return folio ? `Orden #${folio}` : null;
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function contactSummary(contact: ContactRecord | undefined) {
  if (!contact) {
    return null;
  }

  return joinParts([
    textValue(contact.contact_name),
    textValue(contact.organization_area),
    textValue(contact.position),
  ]);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function formatMoney(value: unknown) {
  const amount = numberValue(value);

  if (amount === null) {
    return null;
  }

  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(amount);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "aprobada":
    case "aprobado":
    case "pagado":
    case "cobrado":
    case "entregado":
    case "entregado en oficina":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "cotizando":
    case "enviada":
    case "comprando":
    case "asignada":
    case "en camino":
    case "parcial":
    case "facturado":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "cotizada":
    case "recibido":
    case "comprado":
    case "recogido":
    case "listo para facturar":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "rechazada":
    case "cancelada":
    case "cancelado":
    case "vencido":
      return "border-red-200 bg-red-50 text-red-700";
    case "cerrada":
      return "border-stone-200 bg-stone-100 text-stone-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function buildSection(
  shell: DashboardSection,
  records: DashboardRecord[],
): DashboardSection {
  const countsByStatus = records.reduce<Record<string, number>>((counts, record) => {
    counts[record.status] = (counts[record.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    ...shell,
    total: records.length,
    countsByStatus,
    records: records.slice(0, 5),
    error: null,
  };
}

function errorSection(shell: DashboardSection, error: unknown): DashboardSection {
  return {
    ...shell,
    error: error instanceof Error ? error.message : "No se pudo cargar esta seccion.",
  };
}

async function fetchWithFallback(
  supabase: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
  selectStatements: string[],
  orderColumn: string,
) {
  let lastError: Error | null = null;

  for (const selectStatement of selectStatements) {
    const { data, error } = await supabase
      .from(table)
      .select(selectStatement)
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order(orderColumn, { ascending: false, nullsFirst: false });

    if (!error) {
      return (data ?? []) as unknown as RawRecord[];
    }

    lastError = new Error(error.message);
  }

  throw lastError ?? new Error("No se pudo cargar la informacion.");
}

export function DashboardClient() {
  const supabase = useMemo(() => createClient(), []);
  const [sections, setSections] = useState<DashboardSection[]>(emptySections);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setPageError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setPageError("No se pudo validar la sesion activa.");
      setIsLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      setPageError(profileError.message);
      setIsLoading(false);
      return;
    }

    if (!profile?.company_id) {
      setPageError("Tu perfil no tiene una empresa asignada.");
      setIsLoading(false);
      return;
    }

    const companyId = profile.company_id as string;
    const [clientsResponse, suppliersResponse, contactsResponse] = await Promise.all([
      supabase.from("clients").select("id,name").eq("company_id", companyId),
      supabase.from("suppliers").select("id,name").eq("company_id", companyId),
      supabase
        .from("contacts")
        .select("id,contact_name,organization_area,position")
        .eq("company_id", companyId),
    ]);

    const clientsById = new Map(
      ((clientsResponse.data ?? []) as ClientRecord[]).map((client) => [
        client.id,
        client.name ?? "Cliente no especificado",
      ]),
    );
    const suppliersById = new Map(
      ((suppliersResponse.data ?? []) as SupplierRecord[]).map((supplier) => [
        supplier.id,
        supplier.name ?? "Proveedor no especificado",
      ]),
    );
    const contactsById = new Map(
      ((contactsResponse.data ?? []) as ContactRecord[]).map((contact) => [
        contact.id,
        contact,
      ]),
    );

    async function loadQuotationsById(ids: string[]) {
      const uniqueIds = [...new Set(ids)];

      if (uniqueIds.length === 0) {
        return new Map<string, QuotationReference>();
      }

      const { data, error } = await supabase
        .from("quotations")
        .select("id,client_id,contact_ref_id")
        .eq("company_id", companyId)
        .in("id", uniqueIds);

      if (error) {
        throw new Error(error.message);
      }

      return new Map(
        ((data ?? []) as QuotationReference[]).map((quotation) => [
          quotation.id,
          quotation,
        ]),
      );
    }

    async function loadOrdersById(ids: string[]) {
      const uniqueIds = [...new Set(ids)];

      if (uniqueIds.length === 0) {
        return new Map<string, InternalOrderReference>();
      }

      const { data, error } = await supabase
        .from("internal_orders")
        .select("id,folio,quotation_id")
        .eq("company_id", companyId)
        .in("id", uniqueIds);

      if (error) {
        throw new Error(error.message);
      }

      return new Map(
        ((data ?? []) as InternalOrderReference[]).map((order) => [
          order.id,
          order,
        ]),
      );
    }

    async function loadOrderContext(ids: string[]) {
      const ordersById = await loadOrdersById(ids);
      const quotationIds = [...ordersById.values()]
        .map((order) => textValue(order.quotation_id))
        .filter((id): id is string => Boolean(id));
      const quotationsById = await loadQuotationsById(quotationIds);

      return { ordersById, quotationsById };
    }

    const sectionResults = await Promise.all(
      emptySections.map(async (shell) => {
        try {
          if (shell.key === "solicitudes") {
            const rows = await fetchWithFallback(
              supabase,
              "client_requests",
              companyId,
              ["id,folio,client_id,contact_ref_id,requested_by,requested_at,status,archived_at"],
              "requested_at",
            );
            return buildSection(
              shell,
              rows.map((row) => {
                const id = String(row.id);
                const clientId = textValue(row.client_id);
                const contactId = textValue(row.contact_ref_id);
                const contact = contactId ? contactsById.get(contactId) : undefined;
                const requester = textValue(row.requested_by);
                const contactText = contactSummary(contact);
                return {
                  id,
                  title: folioLabel("Requerimiento", row.folio, "Requerimiento sin folio"),
                  lines: [
                    clientId
                      ? clientsById.get(clientId) ?? "Cliente no especificado"
                      : "Cliente no especificado",
                    joinParts([
                      requester ? `Solicita: ${requester}` : null,
                      contactText ?? (contactId ? "Contacto no especificado" : null),
                    ]),
                  ].filter((line): line is string => Boolean(line)),
                  status: textValue(row.status) ?? "nueva",
                  date: textValue(row.requested_at),
                  href: `/dashboard/solicitudes/${id}`,
                };
              }),
            );
          }

          if (shell.key === "cotizaciones") {
            const rows = await fetchWithFallback(
              supabase,
              "quotations",
              companyId,
              ["id,folio,client_id,contact_ref_id,quoted_at,status,archived_at"],
              "quoted_at",
            );
            return buildSection(
              shell,
              rows.map((row) => {
                const id = String(row.id);
                const clientId = textValue(row.client_id);
                const contactId = textValue(row.contact_ref_id);
                const contact = contactId ? contactsById.get(contactId) : undefined;
                const contactText = contactSummary(contact);
                return {
                  id,
                  title: folioLabel("Cotización", row.folio, "Cotización sin folio"),
                  lines: [
                    clientId
                      ? clientsById.get(clientId) ?? "Cliente no especificado"
                      : "Cliente no especificado",
                    contactText
                      ? `Contacto: ${contactText}`
                      : contactId
                        ? "Contacto no especificado"
                        : null,
                  ].filter((line): line is string => Boolean(line)),
                  status: textValue(row.status) ?? "borrador",
                  date: textValue(row.quoted_at),
                  href: `/dashboard/cotizaciones/${id}`,
                };
              }),
            );
          }

          if (shell.key === "ordenes") {
            const rows = await fetchWithFallback(
              supabase,
              "internal_orders",
              companyId,
              ["id,folio,quotation_id,approved_at,status,responsible,archived_at"],
              "approved_at",
            );
            const quotationIds = rows
              .map((row) => textValue(row.quotation_id))
              .filter((id): id is string => Boolean(id));
            const quotationsById = await loadQuotationsById(quotationIds);

            return buildSection(
              shell,
              rows.map((row) => {
                const id = String(row.id);
                const quotationId = textValue(row.quotation_id);
                const quotation = quotationId ? quotationsById.get(quotationId) : null;
                const clientName = quotation?.client_id
                  ? clientsById.get(quotation.client_id) ?? "Cliente no especificado"
                  : "Orden manual";
                const contactText = quotation?.contact_ref_id
                  ? contactSummary(contactsById.get(quotation.contact_ref_id)) ??
                    "Contacto no especificado"
                  : null;
                const responsible = textValue(row.responsible);
                return {
                  id,
                  title: folioLabel("Orden", row.folio, "Orden sin folio"),
                  lines: [
                    clientName,
                    responsible ? `Responsable: ${responsible}` : contactText,
                  ].filter((line): line is string => Boolean(line)),
                  status: textValue(row.status) ?? "por comprar",
                  date: textValue(row.approved_at),
                  href: `/dashboard/ordenes/${id}`,
                };
              }),
            );
          }

          if (shell.key === "compras") {
            const rows = await fetchWithFallback(
              supabase,
              "purchase_runs",
              companyId,
              [
                "id,supplier_id,internal_order_id,status,scheduled_at,assigned_to,created_at,archived_at",
                "id,supplier_id,internal_order_id,status,created_at,archived_at",
              ],
              "created_at",
            );
            const orderIds = rows
              .map((row) => textValue(row.internal_order_id))
              .filter((id): id is string => Boolean(id));
            const ordersById = await loadOrdersById(orderIds);

            return buildSection(
              shell,
              rows.map((row) => {
                const id = String(row.id);
                const supplierId = textValue(row.supplier_id);
                const orderId = textValue(row.internal_order_id);
                const order = orderId ? ordersById.get(orderId) : null;
                const assignedTo = textValue(row.assigned_to);
                const orderLabel = orderFolioLabel(order);
                return {
                  id,
                  title: supplierId
                    ? suppliersById.get(supplierId) ?? "Proveedor no especificado"
                    : "Compra/Recolección",
                  lines: [
                    joinParts([
                      orderLabel ?? (order ? "Orden sin folio" : null),
                      assignedTo ? `Repartidor: ${assignedTo}` : null,
                    ]),
                    supplierId ? null : "Proveedor no especificado",
                  ].filter((line): line is string => Boolean(line)),
                  status: textValue(row.status) ?? "pendiente",
                  date: textValue(row.scheduled_at) ?? textValue(row.created_at),
                  href: `/dashboard/compras/${id}`,
                };
              }),
            );
          }

          if (shell.key === "entregas") {
            const rows = await fetchWithFallback(
              supabase,
              "deliveries",
              companyId,
              [
                "id,status,scheduled_date,delivered_at,internal_order_id,received_by,archived_at",
                "id,status,scheduled_date,delivered_at,internal_order_id,archived_at",
              ],
              "scheduled_date",
            );
            const orderIds = rows
              .map((row) => textValue(row.internal_order_id))
              .filter((id): id is string => Boolean(id));
            const { ordersById, quotationsById } = await loadOrderContext(orderIds);

            return buildSection(
              shell,
              rows.map((row) => {
                const id = String(row.id);
                const orderId = textValue(row.internal_order_id);
                const order = orderId ? ordersById.get(orderId) : null;
                const quotation = order?.quotation_id ? quotationsById.get(order.quotation_id) : null;
                const orderLabel = orderFolioLabel(order);
                const clientName = quotation?.client_id
                  ? clientsById.get(quotation.client_id) ?? "Cliente no especificado"
                  : "Cliente no especificado";
                const receivedBy = textValue(row.received_by);
                return {
                  id,
                  title: orderLabel ? `Entrega · ${orderLabel}` : "Entrega",
                  lines: [
                    clientName,
                    receivedBy ? `Recibe: ${receivedBy}` : null,
                    order && !orderLabel ? "Orden sin folio" : null,
                  ].filter((line): line is string => Boolean(line)),
                  status: textValue(row.status) ?? "pendiente",
                  date: textValue(row.delivered_at) ?? textValue(row.scheduled_date),
                  href: `/dashboard/entregas/${id}`,
                };
              }),
            );
          }

          const rows = await fetchWithFallback(
            supabase,
            "billing",
            companyId,
            [
              "id,invoice_folio,status,invoiced_at,due_date,invoiced_amount,total_amount,internal_order_id,delivery_id,archived_at",
            ],
            "due_date",
          );
          const orderIds = rows
            .map((row) => textValue(row.internal_order_id))
            .filter((id): id is string => Boolean(id));
          const { ordersById, quotationsById } = await loadOrderContext(orderIds);

          return buildSection(
            shell,
            rows.map((row) => {
              const id = String(row.id);
              const orderId = textValue(row.internal_order_id);
              const order = orderId ? ordersById.get(orderId) : null;
              const quotation = order?.quotation_id ? quotationsById.get(order.quotation_id) : null;
              const orderLabel = orderFolioLabel(order);
              const clientName = quotation?.client_id
                ? clientsById.get(quotation.client_id) ?? "Cliente no especificado"
                : "Cliente no especificado";
              const amount = formatMoney(row.total_amount ?? row.invoiced_amount);
              return {
                id,
                title: textValue(row.invoice_folio)
                  ? `Factura ${textValue(row.invoice_folio)}`
                  : "Pendiente de facturar",
                lines: [
                  joinParts([
                    clientName,
                    orderLabel ?? (order ? "Orden sin folio" : null),
                  ]),
                  joinParts([amount, textValue(row.due_date) ? `Vence: ${formatDate(textValue(row.due_date))}` : null]),
                ].filter((line): line is string => Boolean(line)),
                status: textValue(row.status) ?? "pendiente de facturar",
                date: textValue(row.invoiced_at) ?? textValue(row.due_date),
                href: `/dashboard/facturacion/${id}`,
              };
            }),
          );
        } catch (error) {
          return errorSection(shell, error);
        }
      }),
    );

    setSections(sectionResults);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard();
    });
  }, [loadDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <QuickAction href="/dashboard/solicitudes" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          Nuevo requerimiento
        </QuickAction>
        <QuickAction href="/dashboard/cotizaciones" icon={<FilePlus2 className="h-4 w-4" aria-hidden="true" />}>
          Nueva cotización
        </QuickAction>
        <QuickAction href="/dashboard/ordenes" icon={<Boxes className="h-4 w-4" aria-hidden="true" />}>
          Nueva orden
        </QuickAction>
      </div>

      {pageError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {pageError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <SectionCard isLoading={isLoading} key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}

function QuickAction({
  children,
  href,
  icon,
}: {
  children: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
      href={href}
    >
      {icon}
      {children}
    </Link>
  );
}

function SectionCard({
  isLoading,
  section,
}: {
  isLoading: boolean;
  section: DashboardSection;
}) {
  const Icon =
    section.key === "solicitudes"
      ? ClipboardList
      : section.key === "cotizaciones"
        ? FileText
        : section.key === "ordenes"
          ? Boxes
          : section.key === "compras"
            ? Truck
            : section.key === "entregas"
              ? Truck
              : ReceiptText;

  return (
    <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold text-stone-950">{section.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-5 text-stone-600">{section.description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-stone-950">
            {isLoading ? "-" : section.total}
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Activos</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((item) => (
            <div className="h-12 animate-pulse rounded-lg bg-stone-100" key={item} />
          ))}
        </div>
      ) : section.error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {section.error}
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {section.statuses.map((status) => (
              <span
                className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700"
                key={status}
              >
                {status}: {section.countsByStatus[status] ?? 0}
              </span>
            ))}
          </div>

          <div className="mt-5 divide-y divide-stone-100">
            {section.records.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm font-medium text-stone-500">
                Sin registros activos
              </div>
            ) : (
              section.records.map((record) => (
                <Link
                  className="flex items-center justify-between gap-4 py-3 transition hover:bg-stone-50"
                  href={record.href}
                  key={record.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">{record.title}</p>
                    {record.lines.slice(0, 2).map((line) => (
                      <p className="mt-1 truncate text-xs text-stone-500" key={line}>
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(record.status)}`}
                    >
                      {record.status}
                    </span>
                    <span className="text-xs text-stone-500">{formatDate(record.date)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </article>
  );
}
