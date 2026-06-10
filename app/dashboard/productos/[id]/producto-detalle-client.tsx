"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AttachmentManager } from "@/app/dashboard/attachment-manager";
import { createClient } from "@/src/lib/supabase/client";

type ProductRecord = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  model: string | null;
  unit: string | null;
  description: string | null;
  image_url: string | null;
  active: boolean;
};

type SupplierPriceRecord = {
  id: string;
  product_id: string | null;
  product_description: string | null;
  brand: string | null;
  model: string | null;
  supplier_id: string | null;
  cost: number | string | null;
  unit: string | null;
  quoted_at: string | null;
  valid_until: string | null;
  active: boolean | null;
  notes: string | null;
  supplier?: SupplierPriceSupplier | SupplierPriceSupplier[] | null;
  suppliers: SupplierPriceSupplier | SupplierPriceSupplier[] | null;
};

type SupplierRecord = {
  id: string;
  name: string;
};

type SupplierPriceSupplier = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
};

type SupplierPriceFormState = {
  supplier_id: string;
  cost: string;
  unit: string;
  quoted_at: string;
  valid_until: string;
  notes: string;
};

type ProductFormState = {
  name: string;
  brand: string;
  category: string;
  model: string;
  unit: string;
  description: string;
  image_url: string;
  active: boolean;
};

type ProductoDetalleClientProps = {
  productId: string;
};

const emptyProductForm: ProductFormState = {
  active: true,
  brand: "",
  category: "",
  description: "",
  image_url: "",
  model: "",
  name: "",
  unit: "pieza",
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

function productFormFromRecord(product: ProductRecord): ProductFormState {
  return {
    active: product.active,
    brand: product.brand ?? "",
    category: product.category ?? "",
    description: product.description ?? "",
    image_url: product.image_url ?? "",
    model: product.model ?? "",
    name: product.name,
    unit: product.unit ?? "pieza",
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

function getPriceSupplier(price: SupplierPriceRecord) {
  const supplier = price.suppliers ?? price.supplier ?? null;

  return Array.isArray(supplier) ? supplier[0] : supplier;
}

function getSupplierDisplayName(price: SupplierPriceRecord) {
  const supplier = getPriceSupplier(price);

  return supplier?.name || (price.supplier_id ? "Proveedor no encontrado" : "Sin proveedor");
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
  const [isProductSaving, setIsProductSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [linkingSupplierPriceId, setLinkingSupplierPriceId] = useState<
    string | null
  >(null);
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [productForm, setProductForm] =
    useState<ProductFormState>(emptyProductForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [supplierLinkSelections, setSupplierLinkSelections] = useState<
    Record<string, string>
  >({});
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const loadSupplierPrices = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("supplier_prices")
        .select(
          "id,product_id,product_description,brand,model,supplier_id,cost,unit,quoted_at,valid_until,active,notes,suppliers:supplier_id(id,name,phone,email)",
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
          .select("id,name,brand,category,model,unit,description,image_url,active")
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

      const loadedProduct = productResponse.data as ProductRecord;
      setProduct(loadedProduct);
      setProductForm(productFormFromRecord(loadedProduct));
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

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const name = productForm.name.trim();
    const unit = productForm.unit.trim();

    if (!name) {
      setErrorMessage("El nombre del producto es obligatorio.");
      return;
    }

    if (!unit) {
      setErrorMessage("La unidad es obligatoria.");
      return;
    }

    setIsProductSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload = {
      active: productForm.active,
      brand: cleanOptionalValue(productForm.brand),
      category: cleanOptionalValue(productForm.category),
      description: cleanOptionalValue(productForm.description),
      image_url: cleanOptionalValue(productForm.image_url),
      model: cleanOptionalValue(productForm.model),
      name,
      unit,
    };

    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", productId)
      .eq("company_id", companyId)
      .select("id,name,brand,category,model,unit,description,image_url,active")
      .single();

    setIsProductSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const updatedProduct = data as ProductRecord;
    setProduct(updatedProduct);
    setProductForm(productFormFromRecord(updatedProduct));
    setForm((currentForm) => ({
      ...currentForm,
      unit: currentForm.unit || updatedProduct.unit || "pieza",
    }));
    setSuccessMessage("Producto actualizado.");
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
      brand: cleanOptionalValue(productForm.brand),
      company_id: companyId,
      cost: parsedCost,
      model: cleanOptionalValue(productForm.model),
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

  async function linkPriceToSupplier(price: SupplierPriceRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const supplierId = supplierLinkSelections[price.id];

    if (!supplierId) {
      setErrorMessage("Selecciona un proveedor para vincular.");
      return;
    }

    setLinkingSupplierPriceId(price.id);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("supplier_prices")
      .update({ supplier_id: supplierId })
      .eq("id", price.id)
      .eq("company_id", companyId)
      .eq("product_id", productId);

    setLinkingSupplierPriceId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Proveedor vinculado al precio.");
    setSupplierLinkSelections((currentSelections) => {
      const nextSelections = { ...currentSelections };
      delete nextSelections[price.id];
      return nextSelections;
    });
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

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        {isLoading || !product ? (
          <p className="p-5 text-sm font-medium text-stone-600">
            Cargando producto...
          </p>
        ) : (
          <form className="space-y-5 p-5" onSubmit={handleProductSubmit}>
            <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">
                  Editar producto
                </h3>
                <p className="mt-1 text-sm text-stone-600">
                  Actualiza la información del catálogo.
                </p>
              </div>
              <span
                className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  productForm.active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-stone-200 bg-stone-100 text-stone-600"
                }`}
              >
                {productForm.active ? "Activo" : "Inactivo"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-name"
                >
                  Nombre
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-name"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      name: event.target.value,
                    }))
                  }
                  required
                  value={productForm.name}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-brand"
                >
                  Marca
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-brand"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      brand: event.target.value,
                    }))
                  }
                  value={productForm.brand}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-model"
                >
                  Modelo
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-model"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      model: event.target.value,
                    }))
                  }
                  value={productForm.model}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-category"
                >
                  Categoría
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-category"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      category: event.target.value,
                    }))
                  }
                  value={productForm.category}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-unit"
                >
                  Unidad
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-unit"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      unit: event.target.value,
                    }))
                  }
                  required
                  value={productForm.unit}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-image-url"
                >
                  URL de imagen
                </label>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-image-url"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      image_url: event.target.value,
                    }))
                  }
                  type="url"
                  value={productForm.image_url}
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-stone-800">
                  Estado
                </span>
                <label className="flex h-11 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800">
                  <input
                    checked={productForm.active}
                    className="h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700"
                    disabled={isProductSaving}
                    onChange={(event) =>
                      setProductForm((currentForm) => ({
                        ...currentForm,
                        active: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Producto activo
                </label>
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="product-description"
                >
                  Descripción
                </label>
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isProductSaving}
                  id="product-description"
                  onChange={(event) =>
                    setProductForm((currentForm) => ({
                      ...currentForm,
                      description: event.target.value,
                    }))
                  }
                  value={productForm.description}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProductSaving}
                type="submit"
              >
                {isProductSaving ? "Guardando..." : "Guardar producto"}
              </button>
              <button
                className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProductSaving}
                onClick={() => setProductForm(productFormFromRecord(product))}
                type="button"
              >
                Descartar cambios
              </button>
            </div>
          </form>
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
	                  <th className="px-5 py-3">Marca/modelo</th>
	                  <th className="px-5 py-3 text-right">Costo</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Fecha cotizada</th>
                  <th className="px-5 py-3">Vigencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {prices.map((price) => {
                  const supplier = getPriceSupplier(price);
                  const supplierName = getSupplierDisplayName(price);
                  const hasMissingSupplier = Boolean(
                    price.supplier_id && !supplier,
                  );

                  return (
                  <tr key={price.id}>
                    <td className="min-w-56 px-5 py-4 font-medium text-stone-950">
                      <div className="space-y-2">
                        <p>{supplierName}</p>
                        {supplier ? (
                          <Link
                            className="inline-flex h-8 items-center rounded-md border border-emerald-200 px-3 text-xs font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                            href={`/dashboard/proveedores/${price.supplier_id}`}
                          >
                            Ver proveedor
                          </Link>
                        ) : hasMissingSupplier ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <select
                              className="h-9 min-w-48 rounded-md border border-stone-300 bg-white px-3 text-xs text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                              disabled={
                                linkingSupplierPriceId === price.id ||
                                suppliers.length === 0
                              }
                              onChange={(event) =>
                                setSupplierLinkSelections(
                                  (currentSelections) => ({
                                    ...currentSelections,
                                    [price.id]: event.target.value,
                                  }),
                                )
                              }
                              value={supplierLinkSelections[price.id] ?? ""}
                            >
                              <option value="">
                                {suppliers.length === 0
                                  ? "No hay proveedores"
                                  : "Selecciona proveedor"}
                              </option>
                              {suppliers.map((supplierOption) => (
                                <option
                                  key={supplierOption.id}
                                  value={supplierOption.id}
                                >
                                  {supplierOption.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="h-9 rounded-md border border-stone-200 px-3 text-xs font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                linkingSupplierPriceId === price.id ||
                                suppliers.length === 0
                              }
                              onClick={() => linkPriceToSupplier(price)}
                              type="button"
                            >
                              {linkingSupplierPriceId === price.id
                                ? "Vinculando..."
                                : "Vincular proveedor"}
                            </button>
                          </div>
                        ) : null}
                      </div>
	                    </td>
	                    <td className="px-5 py-4 text-stone-700">
	                      {[price.brand, price.model].filter(Boolean).join(" / ") ||
	                        [product?.brand, product?.model].filter(Boolean).join(" / ") ||
	                        "Sin marca/modelo"}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {companyId && product ? (
        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 border-b border-stone-200 pb-4">
            <h3 className="text-lg font-semibold text-stone-950">
              Imágenes y fichas técnicas
            </h3>
          </div>
          <AttachmentManager
            companyId={companyId}
            entityId={productId}
            entityType="product"
          />
        </section>
      ) : null}
    </div>
  );
}
