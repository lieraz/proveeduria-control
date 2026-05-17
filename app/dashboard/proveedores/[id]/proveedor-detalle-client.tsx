"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  unit: string | null;
  cost: number | string | null;
  quoted_at: string | null;
  products: { name: string | null }[] | null;
};

type ProveedorDetalleClientProps = {
  supplierId: string;
};

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
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);

  useEffect(() => {
    async function loadSupplierDetail() {
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
            "id,product_id,product_description,unit,cost,quoted_at,products(name)",
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

    const { data: productData, error: productError } = await supabase
      .from("products")
      .insert({
        active: true,
        company_id: companyId,
        description: productName,
        name: productName,
        unit: price.unit || "pieza",
      })
      .select("id,name")
      .single();

    if (productError || !productData) {
      setCatalogingPriceId(null);
      setErrorMessage(productError?.message ?? "No se pudo crear el producto.");
      return;
    }

    const { error: priceError } = await supabase
      .from("supplier_prices")
      .update({ product_id: productData.id })
      .eq("id", price.id)
      .eq("company_id", companyId);

    setCatalogingPriceId(null);

    if (priceError) {
      setErrorMessage(priceError.message);
      return;
    }

    setPrices((currentPrices) =>
      currentPrices.map((currentPrice) =>
        currentPrice.id === price.id
          ? {
              ...currentPrice,
              product_id: productData.id,
              products: [{ name: productData.name }],
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
                {prices.map((price) => (
                  <tr key={price.id}>
                    <td className="px-5 py-4 font-medium text-stone-950">
                      {price.product_id
                        ? price.products?.[0]?.name || "Producto no disponible"
                        : price.product_description || "Artículo sin descripción"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          price.product_id
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {price.product_id ? "En catálogo" : "Sin catalogar"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-stone-700">
                      {formatMoney(price.cost)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(price.quoted_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        {!price.product_id ? (
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
                        ) : (
                          <span className="text-sm text-stone-500">
                            Sin acciones
                          </span>
                        )}
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
