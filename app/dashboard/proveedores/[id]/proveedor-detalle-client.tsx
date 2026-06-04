"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);

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

      const [supplierResponse, pricesResponse] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id,name,rfc,contact_name,phone,email")
          .eq("company_id", profile.company_id)
          .eq("id", supplierId)
          .maybeSingle(),
        supabase
          .from("supplier_prices")
          .select(
            "id,product_id,product_description,supplier_id,cost,unit,quoted_at,valid_until,active,notes,products:product_id(id,name,category,unit,image_url)",
          )
          .eq("company_id", profile.company_id)
          .eq("supplier_id", supplierId)
          .order("quoted_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      const firstError = supplierResponse.error ?? pricesResponse.error;

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
      setPrices((pricesResponse.data ?? []) as SupplierPriceRecord[]);
      setIsLoading(false);
    }

    loadSupplierDetail();
  }, [supplierId, supabase]);

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
      setPrices((currentPrices) =>
        currentPrices.filter((currentPrice) => currentPrice.id !== price.id),
      );
      return;
    }

    setSuccessMessage("Producto agregado al catálogo.");
    setPrices((currentPrices) =>
      currentPrices.map((currentPrice) =>
        currentPrice.id === price.id
          ? {
              ...currentPrice,
              product_id: productResponse.product.id,
              products: {
                category: null,
                id: productResponse.product.id,
                image_url: null,
                name: productResponse.product.name,
                unit: currentPrice.unit,
              },
            }
          : currentPrice,
      ),
    );
  }

  async function linkPriceToExistingProduct(price: SupplierPriceRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const productName = price.product_description?.trim();

    if (!productName) {
      setErrorMessage("El artículo no tiene descripción para vincular.");
      return;
    }

    setCatalogingPriceId(price.id);
    setErrorMessage("");
    setSuccessMessage("");

    const productResponse = await supabase
      .from("products")
      .select("id,name,category,unit,image_url")
      .eq("company_id", companyId)
      .eq("name", productName)
      .limit(1)
      .maybeSingle();

    if (productResponse.error) {
      setCatalogingPriceId(null);
      setErrorMessage("No se pudo buscar el producto existente.");
      return;
    }

    if (!productResponse.data) {
      setCatalogingPriceId(null);
      setErrorMessage("No se encontró un producto existente con esa descripción.");
      return;
    }

    const product = productResponse.data as { id: string } & SupplierPriceProduct;
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
      setPrices((currentPrices) =>
        currentPrices.filter((currentPrice) => currentPrice.id !== price.id),
      );
      return;
    }

    setSuccessMessage("Producto vinculado al catálogo.");
    setPrices((currentPrices) =>
      currentPrices.map((currentPrice) =>
        currentPrice.id === price.id
          ? {
              ...currentPrice,
              product_id: product.id,
              products: {
                category: product.category,
                id: product.id,
                image_url: product.image_url,
                name: product.name,
                unit: product.unit,
              },
            }
          : currentPrice,
      ),
    );
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

                  return (
                    <tr key={price.id}>
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
                                onClick={() => linkPriceToExistingProduct(price)}
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
                          ) : status === "missing-product" ? (
                            <button
                              className="h-9 rounded-md border border-stone-200 px-3 text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={catalogingPriceId === price.id}
                              onClick={() => linkPriceToExistingProduct(price)}
                              type="button"
                            >
                              Vincular otro producto
                            </button>
                          ) : (
                            <span className="text-sm text-stone-500">
                              Sin acciones
                            </span>
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
