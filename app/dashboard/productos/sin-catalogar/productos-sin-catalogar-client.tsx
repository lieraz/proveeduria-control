"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { resolveCatalogProduct } from "@/src/lib/supabase/product-catalog";
import { linkSupplierPriceToProduct } from "@/src/lib/supabase/supplier-prices";
import { createClient } from "@/src/lib/supabase/client";

type SupplierPriceRecord = {
  id: string;
  product_description: string | null;
  supplier_id: string | null;
  cost: number | string | null;
  unit: string | null;
  quoted_at: string | null;
  notes: string | null;
  supplier?: { name: string | null }[] | { name: string | null } | null;
  suppliers: { name: string | null }[] | null;
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

function priceMatchesSearch(price: SupplierPriceRecord, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [price.product_description, price.suppliers?.[0]?.name].some((value) =>
    value?.toLowerCase().includes(normalizedSearch),
  );
}

function getPriceSupplierName(price: SupplierPriceRecord) {
  const supplier = price.suppliers ?? price.supplier ?? null;
  const supplierRecord = Array.isArray(supplier) ? supplier[0] : supplier;

  return supplierRecord?.name || (price.supplier_id ? "Proveedor no encontrado" : "Sin proveedor");
}

export function ProductosSinCatalogarClient() {
  const supabase = useMemo(() => createClient(), []);
  const [catalogingPriceId, setCatalogingPriceId] = useState<string | null>(
    null,
  );
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [prices, setPrices] = useState<SupplierPriceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const visiblePrices = useMemo(
    () => prices.filter((price) => priceMatchesSearch(price, search)),
    [prices, search],
  );

  const loadPrices = useCallback(
    async (activeCompanyId: string) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("supplier_prices")
        .select(
          "id,product_description,supplier_id,cost,unit,quoted_at,notes,suppliers(name)",
        )
        .eq("company_id", activeCompanyId)
        .is("product_id", null)
        .not("product_description", "is", null)
        .order("quoted_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setPrices([]);
        return;
      }

      setPrices((data ?? []) as SupplierPriceRecord[]);
    },
    [supabase],
  );

  useEffect(() => {
    async function loadInitialData() {
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
      await loadPrices(profile.company_id);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadPrices, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    setIsSearching(false);
  }

  async function addPriceProductToCatalog(price: SupplierPriceRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    setCatalogingPriceId(price.id);
    setErrorMessage("");
    setSuccessMessage("");

    const productResponse = await resolveCatalogProduct(supabase, {
      companyId,
      name: price.product_description,
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
      supplierId: price.supplier_id,
    });

    setCatalogingPriceId(null);

    if (linkResponse.error) {
      setErrorMessage(linkResponse.error.message);
      return;
    }

    setSuccessMessage(
      linkResponse.duplicated
        ? "Ya existía un registro equivalente. Se eliminó el duplicado."
        : "Producto agregado al catálogo.",
    );
    setPrices((currentPrices) =>
      currentPrices.filter((currentPrice) => currentPrice.id !== price.id),
    );
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
        <div className="border-b border-stone-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Artículos sin catalogar
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por descripción del artículo o proveedor.
              </p>
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <label className="sr-only" htmlFor="uncatalogued-search">
                Buscar artículo
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-72"
                  disabled={isLoading || isSearching}
                  id="uncatalogued-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar sin catalogar"
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

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando artículos sin catalogar...
          </div>
        ) : visiblePrices.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay artículos sin catalogar para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Artículo</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Proveedor</th>
                  <th className="px-5 py-3 text-right">Costo</th>
                  <th className="px-5 py-3">Fecha cotizada</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Notas</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {visiblePrices.map((price) => (
                  <tr key={price.id}>
                    <td className="min-w-64 px-5 py-4 font-medium text-stone-950">
                      {price.product_description || "Artículo sin descripción"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Sin catalogar
                      </span>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {getPriceSupplierName(price)}
                    </td>
                    <td className="px-5 py-4 text-right text-stone-700">
                      {formatMoney(price.cost)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {formatDate(price.quoted_at)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {price.unit || "pieza"}
                    </td>
                    <td className="max-w-sm px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {price.notes || "Sin notas"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
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
