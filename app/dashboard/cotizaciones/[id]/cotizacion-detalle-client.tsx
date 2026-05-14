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
  position?: string | null;
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
  quoted_at: string | null;
  valid_until: string | null;
  status: string | null;
  notes: string | null;
};

type QuotationLineRecord = {
  id: string;
  product_id: string | null;
  custom_description: string | null;
  supplier_id: string | null;
  supplier_cost: number | string | null;
  target_margin: number | string | null;
  suggested_price: number | string | null;
  final_unit_price: number | string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  line_profit: number | string | null;
  real_margin: number | string | null;
  selected: boolean | null;
  notes: string | null;
};

type LineFormState = {
  product_id: string;
  custom_description: string;
  supplier_id: string;
  supplier_cost: string;
  target_margin: string;
  final_unit_price: string;
  quantity: string;
  selected: boolean;
  notes: string;
};

type CotizacionDetalleClientProps = {
  quotationId: string;
};

const emptyLineForm: LineFormState = {
  product_id: "",
  custom_description: "",
  supplier_id: "",
  supplier_cost: "",
  target_margin: "0.40",
  final_unit_price: "",
  quantity: "1",
  selected: false,
  notes: "",
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function optionalNumber(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  return cleanedValue === null ? null : Number(cleanedValue);
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

function formatPercent(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    style: "percent",
  }).format(toNumber(value));
}

function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) {
    return "Sin contacto";
  }

  const name = contact.contact_name ?? "Sin nombre";
  const details = [contact.organization_area, contact.position].filter(Boolean);

  return details.length > 0 ? `${name} - ${details.join(" - ")}` : name;
}

export function CotizacionDetalleClient({
  quotationId,
}: CotizacionDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<LineFormState>(emptyLineForm);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lines, setLines] = useState<QuotationLineRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [quotation, setQuotation] = useState<QuotationRecord | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

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
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const selectedLines = useMemo(
    () => lines.filter((line) => Boolean(line.selected)),
    [lines],
  );
  const selectedSubtotal = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) => total + toNumber(line.line_total),
        0,
      ),
    [selectedLines],
  );
  const selectedProfit = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) => total + toNumber(line.line_profit),
        0,
      ),
    [selectedLines],
  );
  const selectedMargin =
    selectedSubtotal > 0 ? selectedProfit / selectedSubtotal : 0;

  const loadLines = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("quotation_lines")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("quotation_id", quotationId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setLines([]);
        return;
      }

      setLines((data ?? []) as QuotationLineRecord[]);
    },
    [quotationId, supabase],
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

      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select(
          "id,folio,client_id,contact_ref_id,quoted_at,valid_until,status,notes",
        )
        .eq("company_id", activeCompanyId)
        .eq("id", quotationId)
        .maybeSingle();

      if (quotationError) {
        setErrorMessage(quotationError.message);
        setIsLoading(false);
        return;
      }

      if (!quotationData) {
        setErrorMessage("No se encontró la cotización.");
        setIsLoading(false);
        return;
      }

      setQuotation(quotationData as QuotationRecord);

      const [
        clientsResponse,
        contactsResponse,
        productsResponse,
        suppliersResponse,
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("contacts")
          .select("id,client_id,contact_name,organization_area,position,phone,email")
          .eq("company_id", activeCompanyId)
          .eq("active", true),
        supabase
          .from("products")
          .select("id,name,description,unit")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
      ]);

      const firstError =
        clientsResponse.error ??
        contactsResponse.error ??
        productsResponse.error ??
        suppliersResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      setSuppliers((suppliersResponse.data ?? []) as SupplierRecord[]);

      await loadLines(activeCompanyId);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadLines, quotationId, supabase]);

  function lineDescription(line: QuotationLineRecord) {
    const productName = line.product_id
      ? productsById.get(line.product_id)?.name
      : null;

    return line.custom_description || productName || "Sin descripción";
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

    const payload = {
      custom_description: cleanOptionalValue(form.custom_description),
      final_unit_price: optionalNumber(form.final_unit_price),
      notes: cleanOptionalValue(form.notes),
      product_id: cleanOptionalValue(form.product_id),
      quantity,
      selected: form.selected,
      supplier_cost: optionalNumber(form.supplier_cost),
      supplier_id: cleanOptionalValue(form.supplier_id),
      target_margin: optionalNumber(form.target_margin) ?? 0.4,
    };

    const { error } = editingLineId
      ? await supabase
          .from("quotation_lines")
          .update(payload)
          .eq("id", editingLineId)
          .eq("company_id", companyId)
      : await supabase.from("quotation_lines").insert({
          ...payload,
          company_id: companyId,
          quotation_id: quotationId,
        });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingLineId(null);
    setForm(emptyLineForm);
    await loadLines(companyId);
  }

  function startEditing(line: QuotationLineRecord) {
    setEditingLineId(line.id);
    setForm({
      custom_description: line.custom_description ?? "",
      final_unit_price:
        line.final_unit_price === null || line.final_unit_price === undefined
          ? ""
          : String(line.final_unit_price),
      notes: line.notes ?? "",
      product_id: line.product_id ?? "",
      quantity: String(line.quantity ?? "1"),
      selected: Boolean(line.selected),
      supplier_cost:
        line.supplier_cost === null || line.supplier_cost === undefined
          ? ""
          : String(line.supplier_cost),
      supplier_id: line.supplier_id ?? "",
      target_margin: String(line.target_margin ?? "0.40"),
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingLineId(null);
    setForm(emptyLineForm);
    setErrorMessage("");
  }

  async function deleteLine(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar la partida "${lineDescription(line)}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(line.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotation_lines")
      .delete()
      .eq("id", line.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingLineId === line.id) {
      cancelEditing();
    }

    await loadLines(companyId);
  }

  async function applySuggestedPrice(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const suggestedPrice = toNumber(line.suggested_price);

    if (suggestedPrice <= 0) {
      setErrorMessage("La partida no tiene precio sugerido disponible.");
      return;
    }

    setErrorMessage("");
    const { error } = await supabase
      .from("quotation_lines")
      .update({ final_unit_price: suggestedPrice })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadLines(companyId);
  }

  async function toggleSelected(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const { error } = await supabase
      .from("quotation_lines")
      .update({ selected: !line.selected })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadLines(companyId);
  }

  const clientName = quotation?.client_id
    ? clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible"
    : "Sin cliente";
  const selectedContact = quotation?.contact_ref_id
    ? contactsById.get(quotation.contact_ref_id)
    : undefined;
  const contactName = quotation?.contact_ref_id
    ? contactLabel(selectedContact)
    : "Sin contacto";

  return (
    <>
      <div className="print-hidden space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
            href="/dashboard/cotizaciones"
          >
            Volver a cotizaciones
          </Link>
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={!quotation || isLoading}
            onClick={() => window.print()}
            type="button"
          >
            Exportar PDF
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          {isLoading || !quotation ? (
            <p className="text-sm font-medium text-stone-600">
              Cargando cotización...
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Folio
                </p>
                <p className="mt-1 text-base font-semibold text-stone-950">
                  {quotation.folio || "Sin folio"}
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
                  Dependencia/contacto
                </p>
                <div className="mt-1 space-y-1 text-sm text-stone-800">
                  <p>{contactName}</p>
                  {selectedContact?.phone ? (
                    <p className="text-xs text-stone-500">
                      Tel. {selectedContact.phone}
                    </p>
                  ) : null}
                  {selectedContact?.email ? (
                    <p className="text-xs text-stone-500">
                      {selectedContact.email}
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Fecha
                </p>
                <p className="mt-1 text-sm text-stone-800">
                  {formatDate(quotation.quoted_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Vigencia
                </p>
                <p className="mt-1 text-sm text-stone-800">
                  {formatDate(quotation.valid_until)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Estado
                </p>
                <p className="mt-1 text-sm text-stone-800">
                  {quotation.status || "borrador"}
                </p>
              </div>
              <div className="md:col-span-2 lg:col-span-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Notas
                </p>
                <p className="mt-1 text-sm text-stone-800">
                  {quotation.notes || "Sin notas"}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                {editingLineId ? "Editar partida" : "Nueva partida"}
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                El precio sugerido, total, utilidad y margen real los calcula la
                base de datos.
              </p>
            </div>
            {editingLineId ? (
              <button
                className="h-10 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={cancelEditing}
                type="button"
              >
                Cancelar edición
              </button>
            ) : null}
          </div>

          <form className="grid gap-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="product_id"
              >
                Producto
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
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
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="custom_description"
              >
                Descripción personalizada
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
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
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="supplier_id"
              >
                Proveedor
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
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
              ["target_margin", "Margen objetivo", form.target_margin],
              ["final_unit_price", "Precio final unitario", form.final_unit_price],
              ["quantity", "Cantidad", form.quantity],
            ].map(([id, label, value]) => (
              <div className="space-y-2" key={id}>
                <label className="text-sm font-medium text-stone-800" htmlFor={id}>
                  {label}
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isLoading || isSaving}
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
                  type="number"
                  value={value}
                />
              </div>
            ))}

            <label className="flex h-11 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800">
              <input
                checked={form.selected}
                className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                disabled={isLoading || isSaving}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    selected: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Elegida
            </label>

            <div className="space-y-2 lg:col-span-3">
              <label className="text-sm font-medium text-stone-800" htmlFor="notes">
                Notas
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
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
                disabled={isLoading || isSaving}
                type="submit"
              >
                {isSaving
                  ? "Guardando..."
                  : editingLineId
                    ? "Guardar cambios"
                    : "Agregar partida"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-stone-500">Total venta</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedSubtotal)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Utilidad total</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedProfit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Margen total</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatPercent(selectedMargin)}
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
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-5 py-3">Elegida</th>
                    <th className="px-5 py-3">Descripción</th>
                    <th className="px-5 py-3">Proveedor</th>
                    <th className="px-5 py-3 text-right">Costo</th>
                    <th className="px-5 py-3 text-right">Margen objetivo</th>
                    <th className="px-5 py-3 text-right">Sugerido</th>
                    <th className="px-5 py-3 text-right">Precio final</th>
                    <th className="px-5 py-3 text-right">Cantidad</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Utilidad</th>
                    <th className="px-5 py-3 text-right">Margen real</th>
                    <th className="px-5 py-3">Notas</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-5 py-4">
                        <input
                          checked={Boolean(line.selected)}
                          className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                          onChange={() => toggleSelected(line)}
                          type="checkbox"
                        />
                      </td>
                      <td className="min-w-64 px-5 py-4 font-medium text-stone-950">
                        {lineDescription(line)}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {line.supplier_id
                          ? suppliersById.get(line.supplier_id)?.name ??
                            "Proveedor no disponible"
                          : "Sin proveedor"}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.supplier_cost)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatPercent(line.target_margin)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.suggested_price)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(line.final_unit_price)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {toNumber(line.quantity)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(line.line_total)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.line_profit)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatPercent(line.real_margin)}
                      </td>
                      <td className="max-w-xs px-5 py-4 text-stone-700">
                        <span className="line-clamp-2">
                          {line.notes || "Sin notas"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === line.id}
                            onClick={() => applySuggestedPrice(line)}
                            type="button"
                          >
                            Usar precio sugerido
                          </button>
                          <button
                            className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === line.id}
                            onClick={() => startEditing(line)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === line.id}
                            onClick={() => deleteLine(line)}
                            type="button"
                          >
                            {isDeletingId === line.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {quotation ? (
        <section className="print-only bg-white text-stone-950">
          <div className="mb-8 flex items-start justify-between border-b border-stone-300 pb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-600">
                Mi Proveeduría
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Cotización</h1>
            </div>
            <div className="text-right text-sm text-stone-700">
              <p className="font-semibold text-stone-950">
                {quotation.folio || "Sin folio"}
              </p>
              <p>Fecha: {formatDate(quotation.quoted_at)}</p>
              <p>Vigencia: {formatDate(quotation.valid_until)}</p>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="font-semibold text-stone-950">Cliente</p>
              <p className="mt-1 text-stone-700">{clientName}</p>
            </div>
            <div>
              <p className="font-semibold text-stone-950">
                Dependencia/contacto
              </p>
              <div className="mt-1 space-y-1 text-stone-700">
                <p>{selectedContact?.contact_name || contactName}</p>
                {selectedContact?.organization_area ? (
                  <p>Área: {selectedContact.organization_area}</p>
                ) : null}
                {selectedContact?.position ? (
                  <p>Puesto: {selectedContact.position}</p>
                ) : null}
                {selectedContact?.phone ? (
                  <p>Teléfono: {selectedContact.phone}</p>
                ) : null}
                {selectedContact?.email ? (
                  <p>Correo: {selectedContact.email}</p>
                ) : null}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="py-3 pr-4">Descripción</th>
                <th className="py-3 pr-4 text-right">Cantidad</th>
                <th className="py-3 pr-4 text-right">Precio unitario</th>
                <th className="py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedLines.map((line) => (
                <tr className="border-b border-stone-200" key={line.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-stone-950">
                      {lineDescription(line)}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-stone-600">{line.notes}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {toNumber(line.quantity)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatMoney(line.final_unit_price)}
                  </td>
                  <td className="py-3 text-right">
                    {formatMoney(line.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-5 text-right font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="pt-5 text-right text-lg font-semibold">
                  {formatMoney(selectedSubtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}
    </>
  );
}
