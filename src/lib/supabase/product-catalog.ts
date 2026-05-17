import type { createClient } from "@/src/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

type CatalogProductInput = {
  companyId: string;
  name: string | null | undefined;
  unit?: string | null;
};

type CatalogProductResult = {
  product: { id: string; name: string };
  error: null;
};

type CatalogProductError = {
  product: null;
  error: Error;
};

export async function resolveCatalogProduct(
  supabase: SupabaseBrowserClient,
  input: CatalogProductInput,
): Promise<CatalogProductResult | CatalogProductError> {
  const productName = input.name?.trim();

  if (!productName) {
    return {
      error: new Error("El artículo no tiene descripción para agregar al catálogo."),
      product: null,
    };
  }

  const existingProductResponse = await supabase
    .from("products")
    .select("id,name")
    .eq("company_id", input.companyId)
    .eq("name", productName)
    .limit(1)
    .maybeSingle();

  if (existingProductResponse.error) {
    return { error: existingProductResponse.error, product: null };
  }

  if (existingProductResponse.data) {
    return {
      error: null,
      product: existingProductResponse.data as { id: string; name: string },
    };
  }

  const newProductResponse = await supabase
    .from("products")
    .insert({
      active: true,
      company_id: input.companyId,
      description: productName,
      name: productName,
      unit: input.unit || "pieza",
    })
    .select("id,name")
    .single();

  if (newProductResponse.error || !newProductResponse.data) {
    return {
      error: newProductResponse.error ?? new Error("No se pudo crear el producto."),
      product: null,
    };
  }

  return {
    error: null,
    product: newProductResponse.data as { id: string; name: string },
  };
}
