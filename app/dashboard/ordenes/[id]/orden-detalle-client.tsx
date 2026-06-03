"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string;
};

type ContactRecord = {
  id: string;
  client_id: string | null;
  contact_name?: string | null;
  organization_area?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ProductRecord = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
};

type SupplierRecord = {
  id: string;
  name: string;
};

type QuotationRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
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
};

type InternalOrderLineRecord = {
  id: string;
  quotation_line_id: string | null;
  product_id: string | null;
  product_description: string | null;
  supplier_id: string | null;
  supplier_cost: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  line_total: number | string | null;
  notes: string | null;
  status: string | null;
};

type PurchaseRunRecord = {
  id: string;
  supplier_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
};

type PurchaseRunLineRecord = {
  id: string;
  purchase_run_id: string | null;
  internal_order_line_id: string | null;
  product_description: string | null;
  quantity: number | string | null;
  unit: string | null;
  status: string | null;
};

type LineFormState = {
  product_id: string;
  custom_description: string;
  supplier_id: string;
  supplier_cost: string;
  quantity: string;
  unit: string;
  notes: string;
};

type OrdenDetalleClientProps = {
  orderId: string;
};

const emptyLineForm: LineFormState = {
  product_id: "",
  custom_description: "",
  supplier_id: "",
  supplier_cost: "",
  quantity: "1",
  unit: "pieza",
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function optionalNumber(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  if (cleanedValue === null) {
    return null;
  }

  const parsedValue = Number(cleanedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
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

function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) {
    return "Sin contacto";
  }

  const name = contact.contact_name ?? "Sin nombre";
  const details = [contact.organization_area].filter(Boolean);
  return details.length > 0 ? `${name} - ${details.join(" - ")}` : name;
}

function lineStatusClass(status: string | null) {
  switch (status) {
    case "en_compra":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "completada":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

export function OrdenDetalleClient({ orderId }: OrdenDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<LineFormState>(emptyLineForm);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lines, setLines] = useState<InternalOrderLineRecord[]>([]);
  const [order, setOrder] = useState<InternalOrderRecord | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [purchaseRunLines, setPurchaseRunLines] = useState<
    PurchaseRunLineRecord[]
  >([]);
  const [purchaseRuns, setPurchaseRuns] = useState<PurchaseRunRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [warningMessage, setWarningMessage] = useState("");

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const quotationsById = useMemo(
    () => new Map(quotations.map((quotation) => [quotation.id, quotation])),
    [quotations],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const runLinesByRunId = useMemo(() => {
    const groupedLines = new Map<string, PurchaseRunLineRecord[]>();
    purchaseRunLines.forEach((line) => {
      if (!line.purchase_run_id) {
        return;
      }

      groupedLines.set(line.purchase_run_id, [
        ...(groupedLines.get(line.purchase_run_id) ?? []),
        line,
      ]);
    });
    return groupedLines;
  }, [purchaseRunLines]);

  const pendingLines = useMemo(
    () => lines.filter((line) => (line.status ?? "pendiente") === "pendiente"),
    [lines],
  );
  const orderTotal = useMemo(
    () => lines.reduce((total, line) => total + toNumber(line.line_total), 0),
    [lines],
  );

  const loadLines = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("internal_order_lines")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("internal_order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setLines([]);
        return false;
      }

      setLines((data ?? []) as InternalOrderLineRecord[]);
      return true;
    },
    [orderId, supabase],
  );

  const loadPurchaseRuns = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("purchase_runs")
        .select("id,supplier_id,status,notes,created_at")
        .eq("company_id", activeCompanyId)
        .eq("internal_order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setPurchaseRuns([]);
        setPurchaseRunLines([]);
        return false;
      }

      const loadedRuns = (data ?? []) as PurchaseRunRecord[];
      setPurchaseRuns(loadedRuns);

      const runIds = loadedRuns.map((run) => run.id);
      if (runIds.length === 0) {
        setPurchaseRunLines([]);
        return true;
      }

      const { data: linesData, error: linesError } = await supabase
        .from("purchase_run_lines")
        .select(
          "id,purchase_run_id,internal_order_line_id,product_description,quantity,unit,status",
        )
        .eq("company_id", activeCompanyId)
        .in("purchase_run_id", runIds);

      if (linesError) {
        setErrorMessage(linesError.message);
        setPurchaseRunLines([]);
        return false;
      }

      setPurchaseRunLines((linesData ?? []) as PurchaseRunLineRecord[]);
      return true;
    },
    [orderId, supabase],
  );

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setWarningMessage("");

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

      const [
        orderResponse,
        clientsResponse,
        contactsResponse,
        productsResponse,
        quotationsResponse,
        suppliersResponse,
      ] = await Promise.all([
        supabase
          .from("internal_orders")
          .select(
            "id,folio,quotation_id,approved_at,status,responsible,notes,created_at,updated_at",
          )
          .eq("company_id", activeCompanyId)
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("clients")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("contacts")
          .select("id,client_id,contact_name,organization_area,phone,email")
          .eq("company_id", activeCompanyId)
          .eq("active", true),
        supabase
          .from("products")
          .select("id,name,description,unit")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("quotations")
          .select("id,folio,client_id,contact_ref_id")
          .eq("company_id", activeCompanyId),
        supabase
          .from("suppliers")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
      ]);

      const firstError =
        orderResponse.error ??
        clientsResponse.error ??
        contactsResponse.error ??
        productsResponse.error ??
        quotationsResponse.error ??
        suppliersResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      if (!orderResponse.data) {
        setErrorMessage("No se encontró la orden.");
        setIsLoading(false);
        return;
      }

      setOrder(orderResponse.data as InternalOrderRecord);
      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      setQuotations((quotationsResponse.data ?? []) as QuotationRecord[]);
      setSuppliers((suppliersResponse.data ?? []) as SupplierRecord[]);

      await loadLines(activeCompanyId);
      await loadPurchaseRuns(activeCompanyId);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadLines, loadPurchaseRuns, orderId, supabase]);

  function lineDescription(line: InternalOrderLineRecord) {
    const productName = line.product_id
      ? productsById.get(line.product_id)?.name
      : null;

    return line.product_description || productName || "Sin descripción";
  }

  function toggleLineCard(lineId: string) {
    setExpandedLineIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(lineId)) {
        nextIds.delete(lineId);
      } else {
        nextIds.add(lineId);
      }
      return nextIds;
    });
  }

  function handleProductChange(productId: string) {
    const selectedProduct = productsById.get(productId);

    setForm((currentForm) => ({
      ...currentForm,
      custom_description:
        currentForm.custom_description || selectedProduct?.description || "",
      product_id: productId,
    }));
  }

  function toggleAddForm() {
    if (showAddForm) {
      setShowAddForm(false);
      setForm(emptyLineForm);
      setErrorMessage("");
      return;
    }

    setForm(emptyLineForm);
    setErrorMessage("");
    setSuccessMessage("");
    setShowAddForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (!form.product_id && !form.custom_description.trim()) {
      setErrorMessage("Selecciona un producto o captura una descripción.");
      return;
    }

    const quantity = optionalNumber(form.quantity);
    if (!quantity || quantity <= 0) {
      setErrorMessage("La cantidad debe ser mayor a cero.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("internal_order_lines").insert({
      company_id: companyId,
      internal_order_id: orderId,
      notes: cleanOptionalValue(form.notes),
      product_id: cleanOptionalValue(form.product_id),
      product_description: cleanOptionalValue(form.custom_description),
      quantity,
      supplier_cost: optionalNumber(form.supplier_cost),
      supplier_id: cleanOptionalValue(form.supplier_id),
      unit: cleanOptionalValue(form.unit) ?? "pieza",
    });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setShowAddForm(false);
    setForm(emptyLineForm);
    setSuccessMessage("Partida agregada a la orden.");
    await loadLines(companyId);
  }

  async function generatePurchaseRunsBySupplier() {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const linesWithoutSupplier = pendingLines.filter((line) => !line.supplier_id);
    const linesWithSupplier = pendingLines.filter((line) => line.supplier_id);

    if (linesWithoutSupplier.length > 0) {
      setWarningMessage("Esta partida no tiene proveedor asignado.");
    } else {
      setWarningMessage("");
    }

    if (linesWithSupplier.length === 0) {
      setErrorMessage("No hay partidas pendientes con proveedor para generar compra.");
      return;
    }

    const groupedLines = new Map<string, InternalOrderLineRecord[]>();
    linesWithSupplier.forEach((line) => {
      const supplierId = line.supplier_id!;
      groupedLines.set(supplierId, [...(groupedLines.get(supplierId) ?? []), line]);
    });

    setIsGenerating(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const createdRunCount = groupedLines.size;

      for (const [supplierId, supplierLines] of groupedLines) {
        const { data: runData, error: runError } = await supabase
          .from("purchase_runs")
          .insert({
            company_id: companyId,
            internal_order_id: orderId,
            notes: `Generada desde la orden ${order?.folio || orderId}.`,
            supplier_id: supplierId,
          })
          .select("id")
          .single();

        if (runError || !runData) {
          throw new Error(runError?.message ?? "No se pudo generar la compra.");
        }

        const { error: runLinesError } = await supabase
          .from("purchase_run_lines")
          .insert(
            supplierLines.map((line) => ({
              company_id: companyId,
              internal_order_line_id: line.id,
              product_id: line.product_id,
              product_description: lineDescription(line),
              purchase_run_id: runData.id,
              quantity: toNumber(line.quantity) || 1,
              unit: line.unit,
            })),
          );

        if (runLinesError) {
          throw new Error(runLinesError.message);
        }

        const { error: statusError } = await supabase
          .from("internal_order_lines")
          .update({ status: "en_compra" })
          .eq("company_id", companyId)
          .in(
            "id",
            supplierLines.map((line) => line.id),
          );

        if (statusError) {
          throw new Error(statusError.message);
        }
      }

      setSuccessMessage(
        createdRunCount === 1
          ? "Se generó 1 compra por proveedor."
          : `Se generaron ${createdRunCount} compras por proveedor.`,
      );
      await loadLines(companyId);
      await loadPurchaseRuns(companyId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron generar las compras por proveedor.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const quotation = order?.quotation_id
    ? quotationsById.get(order.quotation_id)
    : undefined;
  const clientName = !order?.quotation_id
    ? "Orden manual"
    : quotation?.client_id
      ? clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible"
      : "Cliente no disponible";
  const selectedContact = quotation?.contact_ref_id
    ? contactsById.get(quotation.contact_ref_id)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
          href="/dashboard/ordenes"
        >
          Volver a órdenes
        </Link>
        <button
          className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
          disabled={isLoading || isGenerating || pendingLines.length === 0}
          onClick={generatePurchaseRunsBySupplier}
          type="button"
        >
          {isGenerating ? "Generando..." : "Generar compra por proveedor"}
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {warningMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {warningMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        {isLoading || !order ? (
          <p className="text-sm font-medium text-stone-600">Cargando orden...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Folio
              </p>
              <p className="mt-1 text-base font-semibold text-stone-950">
                {order.folio || "Sin folio"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Cliente
              </p>
              <p className="mt-1 text-sm text-stone-800">{clientName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Cotización
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {quotation?.folio || "Sin cotización"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Fecha
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {formatDate(order.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Estado
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {order.status || "abierta"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Total interno
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {formatMoney(orderTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Contacto
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {contactLabel(selectedContact)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Responsable
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {order.responsible || "Sin responsable"}
              </p>
            </div>
            <div className="md:col-span-2 lg:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Notas
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {order.notes || "Sin notas"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${showAddForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              Agregar partida manual
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Agrega faltantes de la orden interna; esto no registra una compra completada.
            </p>
          </div>
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isSaving}
            onClick={toggleAddForm}
            type="button"
          >
            {showAddForm ? "Ocultar formulario" : "Agregar partida"}
          </button>
        </div>

        {showAddForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="product_id">
                Producto
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="product_id"
                onChange={(event) => handleProductChange(event.target.value)}
                value={form.product_id}
              >
                <option value="">Sin producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="custom_description">
                Descripción
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="custom_description"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    custom_description: event.target.value,
                  }))
                }
                value={form.custom_description}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="supplier_id">
                Proveedor
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="supplier_id"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    supplier_id: event.target.value,
                  }))
                }
                value={form.supplier_id}
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            {[
              ["supplier_cost", "Costo proveedor", form.supplier_cost],
              ["quantity", "Cantidad", form.quantity],
              ["unit", "Unidad", form.unit],
            ].map(([id, label, value]) => (
              <div className="space-y-2" key={id}>
                <label className="text-sm font-medium text-stone-800" htmlFor={id}>
                  {label}
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  id={id}
                  min={id === "quantity" ? "0.01" : undefined}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      [id]: event.target.value,
                    }))
                  }
                  required={id === "quantity"}
                  step="0.01"
                  type={id === "unit" ? "text" : "number"}
                  value={value}
                />
              </div>
            ))}

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

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button
                className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Guardando..." : "Agregar partida"}
              </button>
              <button
                className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={toggleAddForm}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Partidas de la orden
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Pendientes: {pendingLines.length} de {lines.length}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando partidas...
          </div>
        ) : lines.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay partidas para mostrar.
          </div>
        ) : (
          <div className="space-y-3 p-5">
            {lines.map((line) => {
              const isExpanded = expandedLineIds.has(line.id);
              const supplierName = line.supplier_id
                ? suppliersById.get(line.supplier_id)?.name ??
                  "Proveedor no disponible"
                : "Sin proveedor";

              return (
                <article
                  className="rounded-lg border border-stone-200 bg-white"
                  key={line.id}
                >
                  <button
                    className="flex w-full flex-col gap-3 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
                    onClick={() => toggleLineCard(line.id)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-stone-950">
                        {lineDescription(line)}
                      </span>
                      <span className="mt-1 block text-sm text-stone-600">
                        {supplierName} · Cantidad {toNumber(line.quantity)} · {formatMoney(line.line_total)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {!line.supplier_id ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Sin proveedor
                        </span>
                      ) : null}
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${lineStatusClass(line.status)}`}>
                        {line.status || "pendiente"}
                      </span>
                      <span className="text-sm font-medium text-emerald-800">
                        {isExpanded ? "Ocultar" : "Ver"}
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div className="grid gap-4 border-t border-stone-200 px-4 py-4 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Producto
                        </p>
                        <p className="mt-1 text-stone-800">
                          {line.product_id
                            ? productsById.get(line.product_id)?.name ??
                              "Producto no disponible"
                            : "Sin producto"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Proveedor
                        </p>
                        <p className="mt-1 text-stone-800">{supplierName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Línea cotización
                        </p>
                        <p className="mt-1 text-stone-800">
                          {line.quotation_line_id || "Manual"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Costo proveedor
                        </p>
                        <p className="mt-1 text-stone-800">
                          {formatMoney(line.supplier_cost)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Unidad
                        </p>
                        <p className="mt-1 text-stone-800">
                          {line.unit || "Sin unidad"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Total
                        </p>
                        <p className="mt-1 text-stone-800">
                          {formatMoney(line.line_total)}
                        </p>
                      </div>
                      <div className="md:col-span-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                          Notas
                        </p>
                        <p className="mt-1 text-stone-800">
                          {line.notes || "Sin notas"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <h3 className="text-lg font-semibold text-stone-950">
            Compras y recolecciones generadas
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            Cada registro está vinculado a esta orden interna.
          </p>
        </div>

        {purchaseRuns.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No se han generado compras por proveedor.
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {purchaseRuns.map((run) => {
              const runLines = runLinesByRunId.get(run.id) ?? [];
              const supplierName = run.supplier_id
                ? suppliersById.get(run.supplier_id)?.name ??
                  "Proveedor no disponible"
                : "Sin proveedor";

              return (
                <article className="p-5" key={run.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="font-semibold text-stone-950">
                        {supplierName}
                      </h4>
                      <p className="mt-1 text-sm text-stone-600">
                        Compra · {run.status || "generada"} · {formatDate(run.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                      {runLines.length} partidas
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2">
                    {runLines.map((line) => (
                      <div
                        className="rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-700"
                        key={line.id}
                      >
                        <span className="font-medium text-stone-950">
                          {line.product_description || "Sin descripción"}
                        </span>{" "}
                        · Cantidad {toNumber(line.quantity)} {line.unit || ""}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
