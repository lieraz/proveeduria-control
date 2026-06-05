"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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

type ProductFormState = {
  name: string;
  brand: string;
  category: string;
  model: string;
  unit: string;
  description: string;
  image_url: string;
};

const emptyForm: ProductFormState = {
  name: "",
  brand: "",
  category: "",
  model: "",
  unit: "pieza",
  description: "",
  image_url: "",
};

const unitOptions = [
  "pieza",
  "caja",
  "paquete",
  "litro",
  "metro",
  "servicio",
  "otro",
];

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function productMatchesSearch(product: ProductRecord, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    product.name,
    product.brand,
    product.category,
    product.model,
    product.unit,
    product.description,
  ].some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function ProductThumbnail({ product }: { product: ProductRecord }) {
  if (product.image_url) {
    return (
      <div
        aria-label={product.name}
        className="h-12 w-12 rounded-md border border-stone-200 object-cover"
        role="img"
        style={{
          backgroundImage: `url("${product.image_url}")`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
    );
  }

  return (
    <div
      aria-label="Sin imagen"
      className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-xs font-semibold text-stone-400"
      role="img"
    >
      IMG
    </div>
  );
}

export function ProductosClient() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadProducts = useCallback(
    async (activeCompanyId: string, searchValue: string) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,category,model,unit,description,image_url,active")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setProducts([]);
        return;
      }

      setProducts(
        (data ?? []).filter((product) =>
          productMatchesSearch(product, searchValue),
        ),
      );
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
      await loadProducts(profile.company_id, "");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadProducts, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadProducts(companyId, search);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setErrorMessage("El nombre del producto es obligatorio.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      name,
      brand: cleanOptionalValue(form.brand),
      category: cleanOptionalValue(form.category),
      model: cleanOptionalValue(form.model),
      unit: form.unit,
      description: cleanOptionalValue(form.description),
      image_url: cleanOptionalValue(form.image_url),
    };

    const { error } = editingProductId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProductId)
          .eq("company_id", companyId)
      : await supabase
          .from("products")
          .insert({ ...payload, active: true, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingProductId(null);
    setShowCreateForm(false);
    setForm(emptyForm);
    await loadProducts(companyId, search);
  }

  function startEditing(product: ProductRecord) {
    setEditingProductId(product.id);
    setShowCreateForm(false);
    setForm({
      name: product.name,
      brand: product.brand ?? "",
      category: product.category ?? "",
      model: product.model ?? "",
      unit: unitOptions.includes(product.unit ?? "") ? product.unit ?? "pieza" : "otro",
      description: product.description ?? "",
      image_url: product.image_url ?? "",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingProductId(null);
    setForm(emptyForm);
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyForm);
      setErrorMessage("");
      return;
    }

    setEditingProductId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyForm);
    setErrorMessage("");
  }

  async function toggleProductStatus(product: ProductRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const nextActiveStatus = !product.active;
    const actionLabel = nextActiveStatus ? "reactivar" : "desactivar";
    const shouldContinue = window.confirm(
      `¿Quieres ${actionLabel} el producto "${product.name}"?`,
    );

    if (!shouldContinue) {
      return;
    }

    setIsUpdatingStatusId(product.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("products")
      .update({ active: nextActiveStatus })
      .eq("id", product.id)
      .eq("company_id", companyId);

    setIsUpdatingStatusId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadProducts(companyId, search);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingProductId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingProductId ? "Editar producto" : "Nuevo producto"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Los productos se guardan automáticamente en la empresa de tu
              perfil.
            </p>
          </div>
          {editingProductId ? (
            <button
              className="h-10 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              onClick={cancelEditing}
              type="button"
            >
              Cancelar edición
            </button>
          ) : (
            <button
              className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isSaving}
              onClick={toggleCreateForm}
              type="button"
            >
              {showCreateForm ? "Ocultar formulario" : "Nuevo producto"}
            </button>
          )}
        </div>

        {editingProductId || showCreateForm ? (
          <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="lg:col-span-2">
            <h4 className="text-base font-semibold text-stone-950">
              {editingProductId ? "Editar producto" : "Nuevo registro"}
            </h4>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="name">
              Nombre
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="name"
              name="name"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  name: event.target.value,
                }))
              }
              required
              type="text"
              value={form.name}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="category"
            >
              Categoría
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="category"
              name="category"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  category: event.target.value,
                }))
              }
              placeholder="Ej. limpieza, papelería, ferretería"
              type="text"
              value={form.category}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="brand"
            >
              Marca
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="brand"
              name="brand"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  brand: event.target.value,
                }))
              }
              placeholder="Ej. 3M, Truper, HP"
              type="text"
              value={form.brand}
            />
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="model"
            >
              Modelo
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="model"
              name="model"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  model: event.target.value,
                }))
              }
              placeholder="Modelo, serie o presentación"
              type="text"
              value={form.model}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="unit">
              Unidad
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="unit"
              name="unit"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  unit: event.target.value,
                }))
              }
              value={form.unit}
            >
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="image_url"
            >
              URL de imagen
            </label>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="image_url"
              name="image_url"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  image_url: event.target.value,
                }))
              }
              placeholder="https://..."
              type="url"
              value={form.image_url}
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="description"
            >
              Descripción
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="description"
              name="description"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  description: event.target.value,
                }))
              }
              value={form.description}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:col-span-2">
            <button
              className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving
                ? "Guardando..."
                : editingProductId
                  ? "Guardar cambios"
                  : "Crear producto"}
            </button>
            {!editingProductId ? (
              <button
                className="h-11 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                onClick={cancelCreate}
                type="button"
              >
                Cancelar
              </button>
            ) : null}
          </div>
          </form>
        ) : null}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Productos registrados
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por nombre, marca, modelo, categoría, unidad o descripción.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-200 px-4 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                href="/dashboard/productos/sin-catalogar"
              >
                Sin catalogar
              </Link>
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
                <label className="sr-only" htmlFor="product-search">
                  Buscar producto
                </label>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  />
                  <input
                    className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                    disabled={isLoading || isSearching}
                    id="product-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar productos"
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
        </div>

        {errorMessage ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando productos...
          </div>
        ) : products.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay productos para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-5 py-3">Marca/modelo</th>
                  <th className="px-5 py-3">Categoría</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Descripción</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="px-5 py-4">
                      <div className="flex min-w-60 items-center gap-3">
                        <ProductThumbnail product={product} />
                        <p className="font-medium text-stone-950">
                          {product.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {[product.brand, product.model].filter(Boolean).join(" / ") ||
                        "Sin marca/modelo"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {product.category || "Sin categoría"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {product.unit || "Sin unidad"}
                    </td>
                    <td className="max-w-xs px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {product.description || "Sin descripción"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          product.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-stone-200 bg-stone-100 text-stone-600"
                        }`}
                      >
                        {product.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                          href={`/dashboard/productos/${product.id}`}
                        >
                          Ver historial
                        </Link>
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isSaving || isUpdatingStatusId === product.id
                          }
                          onClick={() => startEditing(product)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className={`h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            product.active
                              ? "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                          }`}
                          disabled={
                            isSaving || isUpdatingStatusId === product.id
                          }
                          onClick={() => toggleProductStatus(product)}
                          type="button"
                        >
                          {isUpdatingStatusId === product.id
                            ? "Actualizando..."
                            : product.active
                              ? "Desactivar"
                              : "Reactivar"}
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
  );
}
