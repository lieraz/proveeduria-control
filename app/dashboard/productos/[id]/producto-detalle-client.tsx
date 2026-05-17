"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  quoted_at: string | null;
  notes: string | null;
  suppliers: { name: string | null }[] | null;
};

type ProductoDetalleClientProps = {
  productId: string;
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

export function ProductoDetalleClient({
  productId,
}: ProductoDetalleClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [product, setProduct] = useState<ProductRecord | null>(null);

  useEffect(() => {
    async function loadProductDetail() {
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

      const [productResponse, pricesResponse] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,category,unit,description")
          .eq("company_id", profile.company_id)
          .eq("id", productId)
          .maybeSingle(),
        supabase
          .from("supplier_prices")
          .select("id,cost,quoted_at,notes,suppliers(name)")
          .eq("company_id", profile.company_id)
          .eq("product_id", productId)
          .order("quoted_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      const firstError = productResponse.error ?? pricesResponse.error;

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
      setPrices((pricesResponse.data ?? []) as SupplierPriceRecord[]);
      setIsLoading(false);
    }

    loadProductDetail();
  }, [productId, supabase]);

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
        <div className="border-b border-stone-200 p-5">
          <h3 className="text-lg font-semibold text-stone-950">
            Historial de precios por proveedor
          </h3>
        </div>

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
                  <th className="px-5 py-3">Fecha cotizada</th>
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
                      {formatDate(price.quoted_at)}
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
