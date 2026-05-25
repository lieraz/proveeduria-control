"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";

type ProductRecord = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  description: string | null;
};

type SupplierPriceRecord = {
  id: string;
  cost: number | string | null;
  unit: string | null;
  quoted_at: string | null;
  valid_until: string | null;
  active: boolean | null;
  notes: string | null;
  suppliers: { name: string | null }[] | null;
};

type SupplierRecord = {
  id: string;
  name: string;
};

type SupplierPriceFormState = {
  supplier_id: string;
  cost: string;
  unit: string;
  quoted_at: string;
  valid_until: string;
  notes: string;
};

type ProductoDetalleClientProps = {
  productId: string;
};

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function supplierPriceFormDefault(unit?: string | null): SupplierPriceFormState {
  return {
    supplier_id: "",
    cost: "",
    unit: unit || "pieza",
    quoted_at: todayDateValue(),
    valid_until: "",
    notes: "",
  };
}

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function formatMoney(value: number | string | null | undefined) {
  const parsedValue = Number(value ?? 0);

  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0);
}

export function ProductoDetalleClient({
  productId,
}: ProductoDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<SupplierPriceFormState>(
    supplierPriceFormDefault(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const loadSupplierPrices = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("supplier_prices")
        .select(
          "id,cost,unit,quoted_at,valid_until,active,notes,suppliers(name)",
        )
        .eq("company_id", activeCompanyId)
        .eq("product_id", productId)
        .order("quoted_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setPrices([]);
        return false;
      }

      setPrices((data ?? []) as SupplierPriceRecord[]);
      return true;
    },
    [productId, supabase],
  );

  useEffect(() => {
    async function loadProductDetail() {
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

      setCompanyId(profile.company_id);

      const [productResponse, suppliersResponse] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,category,unit,description")
          .eq("company_id", profile.company_id)
          .eq("id", productId)
          .maybeSingle(),
        supabase
          .from("suppliers")
          .select("id,name")
          .eq("company_id", profile.company_id)
          .order("name", { ascending: true }),
      ]);

      const firstError = productResponse.error ?? suppliersResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      if (!productResponse.data) {
        setErrorMessage("No se encontró el producto.");
        setIsLoading(false);
        return;
      }

      setProduct(productResponse.data as ProductRecord);
      setForm(supplierPriceFormDefault(productResponse.data.unit));
      setSuppliers((suppliersResponse.data ?? []) as SupplierRecord[]);
      await loadSupplierPrices(profile.company_id);
      setIsLoading(false);
    }

    loadProductDetail();
  }, [loadSupplierPrices, productId, supabase]);

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(supplierPriceFormDefault(product?.unit));
      setErrorMessage("");
      return;
    }

    setForm(supplierPriceFormDefault(product?.unit));
    setErrorMessage("");
    setSuccessMessage("");
    setShowCreateForm(true);
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

    const parsedCost = Number(form.cost);

    if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
      setErrorMessage("El costo debe ser mayor a cero.");
      return;
    }

    const unit = form.unit.trim();

    if (!unit) {
      setErrorMessage("La unidad es obligatoria.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("supplier_prices").insert({
      active: true,
      company_id: companyId,
      cost: parsedCost,
      notes: cleanOptionalValue(form.notes),
      product_id: productId,
      quoted_at: form.quoted_at,
      supplier_id: form.supplier_id,
      unit,
      valid_until: cleanOptionalValue(form.valid_until),
    });

    setIsSaving(false);

    if (error) {
      setErrorMessage(
        error.code === "23505"
          ? "Ya existe un precio registrado para este proveedor con esos datos."
          : error.message,
      );
      return;
    }

    setSuccessMessage("Proveedor agregado al historial de precios.");
    setShowCreateForm(false);
    setForm(supplierPriceFormDefault(product?.unit));
    await loadSupplierPrices(companyId);
  }

  return (
    <div className="space-y-6">
      <Link
        className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
        href="/dashboard/productos"
      >
        Volver a productos
      </Link>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        {isLoading || !product ? (
          <p className="text-sm font-medium text-stone-600">
            Cargando producto...
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Producto
              </p>
              <p className="mt-1 text-base font-semibold text-stone-950">
                {product.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Categoría
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {product.category || "Sin categoría"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Unidad
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {product.unit || "Sin unidad"}
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Descripción
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {product.description || "Sin descripción"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-stone-950">
            Proveedores y precios
          </h3>
          <button
            className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || !product}
            onClick={toggleCreateForm}
            type="button"
          >
            {showCreateForm ? "Cerrar" : "Agregar proveedor"}
          </button>
        </div>

        {showCreateForm ? (
          <form
            className="grid gap-4 border-b border-stone-200 bg-stone-50 p-5 md:grid-cols-2 lg:grid-cols-3"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="supplier_id"
              >
                Proveedor
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving || suppliers.length === 0}
                id="supplier_id"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    supplier_id: event.target.value,
                  }))
                }
                required
                value={form.supplier_id}
              >
                <option value="">
                  {suppliers.length === 0
                    ? "No hay proveedores registrados"
                    : "Selecciona un proveedor"}
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="cost"
              >
                Costo
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving}
                id="cost"
                min="0"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    cost: event.target.value,
                  }))
                }
                required
                step="0.01"
                type="number"
                value={form.cost}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="unit"
              >
                Unidad
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving}
                id="unit"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    unit: event.target.value,
                  }))
                }
                required
                value={form.unit}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="quoted_at"
              >
                Fecha cotizada
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving}
                id="quoted_at"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    quoted_at: event.target.value,
                  }))
                }
                required
                type="date"
                value={form.quoted_at}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="valid_until"
              >
                Vigencia
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving}
                id="valid_until"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    valid_until: event.target.value,
                  }))
                }
                type="date"
                value={form.valid_until}
              />
            </div>

            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="notes"
              >
                Notas
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isSaving}
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

            <div className="flex gap-3 md:col-span-2 lg:col-span-3">
              <button
                className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || suppliers.length === 0}
                type="submit"
              >
                {isSaving ? "Guardando..." : "Guardar proveedor"}
              </button>
              <button
                className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={toggleCreateForm}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando historial...
          </div>
        ) : prices.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay precios históricos para este producto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Proveedor</th>
                  <th className="px-5 py-3 text-right">Costo</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Fecha cotizada</th>
                  <th className="px-5 py-3">Vigencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {prices.map((price) => (
                  <tr key={price.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {price.suppliers?.[0]?.name || "Proveedor no disponible"}
                    </td>
                    <td className="px-5 py-4 text-right text-stone-700">
                      {formatMoney(price.cost)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {price.unit || "Sin unidad"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(price.quoted_at)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(price.valid_until)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          price.active
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {price.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="max-w-sm px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {price.notes || "Sin notas"}
                      </span>
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
