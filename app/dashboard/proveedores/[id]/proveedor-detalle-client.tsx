"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { resolveCatalogProduct } from "@/src/lib/supabase/product-catalog";
import { linkSupplierPriceToProduct } from "@/src/lib/supabase/supplier-prices";
import { createClient } from "@/src/lib/supabase/client";

type SupplierRecord = {
  id: string;
  name: string;
  rfc: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};

type SupplierPriceRecord = {
  id: string;
  product_id: string | null;
  product_description: string | null;
  supplier_id: string | null;
  unit: string | null;
  cost: number | string | null;
  quoted_at: string | null;
  valid_until: string | null;
  active: boolean | null;
  notes: string | null;
  product?: SupplierPriceProduct | SupplierPriceProduct[] | null;
  products: SupplierPriceProduct | SupplierPriceProduct[] | null;
};

type ProveedorDetalleClientProps = {
  supplierId: string;
};

type SupplierPriceProduct = {
  id: string;
  category: string | null;
  image_url: string | null;
  name: string | null;
  unit: string | null;
};

type CatalogProductRecord = {
  id: string;
  active: boolean | null;
  category: string | null;
  description: string | null;
  name: string | null;
  unit: string | null;
};

type PriceStatus =
  | "linked"
  | "missing-description"
  | "missing-product"
  | "unlinked";

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

function getPriceProduct(price: SupplierPriceRecord) {
  const product = price.products ?? price.product ?? null;

  return Array.isArray(product) ? product[0] : product;
}

function getPriceStatus(price: SupplierPriceRecord): PriceStatus {
  const product = getPriceProduct(price);

  if (price.product_id && product) {
    return "linked";
  }

  if (price.product_id) {
    return "missing-product";
  }

  if (price.product_description) {
    return "unlinked";
  }

  return "missing-description";
}

function getPriceDisplayName(price: SupplierPriceRecord) {
  const product = getPriceProduct(price);

  return product?.name || price.product_description || "Sin descripción";
}

function getStatusLabel(status: PriceStatus) {
  if (status === "linked") {
    return "En catálogo";
  }

  if (status === "missing-product") {
    return "Producto no encontrado";
  }

  if (status === "missing-description") {
    return "Sin descripción";
  }

  return "Sin vincular";
}

function getStatusClasses(status: PriceStatus) {
  if (status === "linked") {
    return "bg-emerald-50 text-emerald-800";
  }

  if (status === "missing-product") {
    return "bg-red-50 text-red-700";
  }

  if (status === "missing-description") {
    return "bg-stone-100 text-stone-600";
  }

  return "bg-amber-50 text-amber-800";
}

function normalizeSearch(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getProductOptionLabel(product: CatalogProductRecord) {
  const details = [product.category, product.unit].filter(Boolean).join(" - ");

  return details
    ? `${product.name || "Sin nombre"} - ${details}`
    : product.name || "Sin nombre";
}

function getMatchScore(product: CatalogProductRecord, priceDescription: string) {
  if (!priceDescription) {
    return 0;
  }

  const productName = normalizeSearch(product.name);
  const productCategory = normalizeSearch(product.category);
  const productDescription = normalizeSearch(product.description);

  if (productName === priceDescription) {
    return 3;
  }

  if (
    productName &&
    (productName.includes(priceDescription) ||
      priceDescription.includes(productName))
  ) {
    return 2;
  }

  if (
    productCategory.includes(priceDescription) ||
    productDescription.includes(priceDescription)
  ) {
    return 1;
  }

  return 0;
}

export function ProveedorDetalleClient({
  supplierId,
}: ProveedorDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [catalogingPriceId, setCatalogingPriceId] = useState<string | null>(
    null,
  );
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [linkingPriceId, setLinkingPriceId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkingProductId, setLinkingProductId] = useState("");
  const [products, setProducts] = useState<CatalogProductRecord[]>([]);
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);

  const loadSupplierPrices = useCallback(
    async (activeCompanyId: string) => {
      const pricesResponse = await supabase
        .from("supplier_prices")
        .select(
          "id,product_id,product_description,supplier_id,cost,unit,quoted_at,valid_until,active,notes,products:product_id(id,name,category,unit,image_url)",
        )
        .eq("company_id", activeCompanyId)
        .eq("supplier_id", supplierId)
        .order("quoted_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (pricesResponse.error) {
        setErrorMessage(pricesResponse.error.message);
        return false;
      }

      setPrices((pricesResponse.data ?? []) as SupplierPriceRecord[]);
      return true;
    },
    [supplierId, supabase],
  );

  useEffect(() => {
    async function loadSupplierDetail() {
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

      const [supplierResponse, productsResponse] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id,name,rfc,contact_name,phone,email")
          .eq("company_id", profile.company_id)
          .eq("id", supplierId)
          .maybeSingle(),
        supabase
          .from("products")
          .select("id,name,category,unit,description,active")
          .eq("company_id", profile.company_id)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      const firstError = supplierResponse.error ?? productsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      if (!supplierResponse.data) {
        setErrorMessage("No se encontró el proveedor.");
        setIsLoading(false);
        return;
      }

      setSupplier(supplierResponse.data as SupplierRecord);
      setProducts((productsResponse.data ?? []) as CatalogProductRecord[]);
      await loadSupplierPrices(profile.company_id);
      setIsLoading(false);
    }

    loadSupplierDetail();
  }, [loadSupplierPrices, supplierId, supabase]);

  function closeLinkingForm() {
    setLinkingPriceId(null);
    setLinkSearch("");
    setLinkingProductId("");
  }

  function openLinkingForm(price: SupplierPriceRecord) {
    setErrorMessage("");
    setSuccessMessage("");
    setLinkingPriceId(price.id);
    setLinkSearch("");
    setLinkingProductId("");
  }

  function getFilteredProducts(price: SupplierPriceRecord) {
    const query = normalizeSearch(linkSearch);
    const priceDescription = normalizeSearch(price.product_description);

    return products
      .filter((product) => {
        if (!query) {
          return true;
        }

        return [product.name, product.category, product.description].some(
          (value) => normalizeSearch(value).includes(query),
        );
      })
      .sort((firstProduct, secondProduct) => {
        const scoreDifference =
          getMatchScore(secondProduct, priceDescription) -
          getMatchScore(firstProduct, priceDescription);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (firstProduct.name || "").localeCompare(
          secondProduct.name || "",
          "es",
        );
      });
  }

  async function addPriceProductToCatalog(price: SupplierPriceRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const productName = price.product_description?.trim();

    if (!productName) {
      setErrorMessage("El artículo no tiene descripción para agregar al catálogo.");
      return;
    }

    setCatalogingPriceId(price.id);
    setErrorMessage("");
    setSuccessMessage("");

    const productResponse = await resolveCatalogProduct(supabase, {
      companyId,
      name: productName,
      unit: price.unit,
    });

    if (productResponse.error) {
      setCatalogingPriceId(null);
      setErrorMessage("No se pudo preparar el producto para vincularlo.");
      return;
    }

    const linkResponse = await linkSupplierPriceToProduct(supabase, {
      companyId,
      cost: price.cost,
      id: price.id,
      productId: productResponse.product.id,
      quotedAt: price.quoted_at,
      supplierId,
    });

    setCatalogingPriceId(null);

    if (linkResponse.error) {
      setErrorMessage(linkResponse.error.message);
      return;
    }

    if (linkResponse.duplicated) {
      setSuccessMessage(
        "Ya existía un registro equivalente. Se eliminó el duplicado.",
      );
      closeLinkingForm();
      await loadSupplierPrices(companyId);
      return;
    }

    setSuccessMessage("Producto agregado al catálogo.");
    closeLinkingForm();
    await loadSupplierPrices(companyId);
  }

  async function linkPriceToSelectedProduct(price: SupplierPriceRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (!linkingProductId) {
      setErrorMessage("Selecciona un producto para vincular.");
      return;
    }

    const product = products.find(
      (currentProduct) => currentProduct.id === linkingProductId,
    );

    if (!product) {
      setErrorMessage("No se encontró el producto seleccionado.");
      return;
    }

    setCatalogingPriceId(price.id);
    setErrorMessage("");
    setSuccessMessage("");

    const linkResponse = await linkSupplierPriceToProduct(supabase, {
      companyId,
      cost: price.cost,
      id: price.id,
      productId: product.id,
      quotedAt: price.quoted_at,
      supplierId,
    });

    setCatalogingPriceId(null);

    if (linkResponse.error) {
      setErrorMessage(linkResponse.error.message);
      return;
    }

    if (linkResponse.duplicated) {
      setSuccessMessage(
        "Ya existía un registro equivalente. Se eliminó el duplicado.",
      );
      closeLinkingForm();
      await loadSupplierPrices(companyId);
      return;
    }

    setSuccessMessage("Producto vinculado.");
    closeLinkingForm();
    await loadSupplierPrices(companyId);
  }

  return (
    <div className="space-y-6">
      <Link
        className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
        href="/dashboard/proveedores"
      >
        Volver a proveedores
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
        {isLoading || !supplier ? (
          <p className="text-sm font-medium text-stone-600">
            Cargando proveedor...
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Proveedor
              </p>
              <p className="mt-1 text-base font-semibold text-stone-950">
                {supplier.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                RFC
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {supplier.rfc || "Sin RFC"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Contacto
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {supplier.contact_name || "Sin contacto"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Datos
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {supplier.email || supplier.phone || "Sin datos"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 p-5">
          <h3 className="text-lg font-semibold text-stone-950">
            Artículos cotizados por este proveedor
          </h3>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando artículos cotizados...
          </div>
        ) : prices.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay artículos cotizados por este proveedor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Artículo</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Costo</th>
                  <th className="px-5 py-3">Fecha cotizada</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {prices.map((price) => {
                  const status = getPriceStatus(price);
                  const isLinkingPrice = linkingPriceId === price.id;
                  const filteredProducts = isLinkingPrice
                    ? getFilteredProducts(price)
                    : [];

                  return (
                    <Fragment key={price.id}>
                      <tr>
                        <td className="px-5 py-4 font-medium text-stone-950">
                          {getPriceDisplayName(price)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                              status,
                            )}`}
                          >
                            {getStatusLabel(status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-stone-700">
                          {formatMoney(price.cost)}
                        </td>
                        <td className="px-5 py-4 text-stone-700">
                          {formatDate(price.quoted_at)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {!price.product_id ? (
                              <>
                                <button
                                  className="h-9 rounded-md border border-stone-200 px-3 text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={catalogingPriceId === price.id}
                                  onClick={() => openLinkingForm(price)}
                                  type="button"
                                >
                                  Vincular producto existente
                                </button>
                                <button
                                  className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={catalogingPriceId === price.id}
                                  onClick={() => addPriceProductToCatalog(price)}
                                  type="button"
                                >
                                  {catalogingPriceId === price.id
                                    ? "Agregando..."
                                    : "Agregar al catálogo"}
                                </button>
                              </>
                            ) : status === "linked" ? (
                              <Link
                                className="inline-flex h-9 items-center rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50"
                                href={`/dashboard/productos/${price.product_id}`}
                              >
                                Editar producto
                              </Link>
                            ) : (
                              <span className="text-sm text-stone-500">
                                Sin acciones
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isLinkingPrice ? (
                        <tr>
                          <td className="bg-stone-50 px-5 py-4" colSpan={5}>
                            <form
                              className="grid gap-4 rounded-lg border border-stone-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                              onSubmit={(event) => {
                                event.preventDefault();
                                linkPriceToSelectedProduct(price);
                              }}
                            >
                              <div className="space-y-2">
                                <label
                                  className="text-sm font-medium text-stone-800"
                                  htmlFor={`product-search-${price.id}`}
                                >
                                  Buscar producto
                                </label>
                                <input
                                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                  disabled={catalogingPriceId === price.id}
                                  id={`product-search-${price.id}`}
                                  onChange={(event) => {
                                    setLinkSearch(event.target.value);
                                    setLinkingProductId("");
                                  }}
                                  placeholder="Buscar producto"
                                  type="search"
                                  value={linkSearch}
                                />
                              </div>

                              <div className="space-y-2">
                                <label
                                  className="text-sm font-medium text-stone-800"
                                  htmlFor={`product-select-${price.id}`}
                                >
                                  Producto del catálogo
                                </label>
                                <select
                                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                  disabled={catalogingPriceId === price.id}
                                  id={`product-select-${price.id}`}
                                  onChange={(event) =>
                                    setLinkingProductId(event.target.value)
                                  }
                                  value={linkingProductId}
                                >
                                  <option value="">Selecciona un producto</option>
                                  {filteredProducts.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {getProductOptionLabel(product)}
                                    </option>
                                  ))}
                                </select>
                                {products.length === 0 ? (
                                  <p className="text-xs text-stone-500">
                                    No hay productos activos en el catálogo.
                                  </p>
                                ) : filteredProducts.length === 0 ? (
                                  <p className="text-xs text-stone-500">
                                    No hay productos activos con esa búsqueda.
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-end justify-end gap-2">
                                <button
                                  className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                                  disabled={
                                    catalogingPriceId === price.id ||
                                    !linkingProductId
                                  }
                                  type="submit"
                                >
                                  {catalogingPriceId === price.id
                                    ? "Vinculando..."
                                    : "Vincular"}
                                </button>
                                <button
                                  className="h-10 rounded-md border border-stone-200 px-4 text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={catalogingPriceId === price.id}
                                  onClick={closeLinkingForm}
                                  type="button"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
