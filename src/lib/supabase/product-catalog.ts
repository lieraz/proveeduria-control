import type { createClient } from "@/src/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

type CatalogProductInput = {
  brand?: string | null;
  companyId: string;
  model?: string | null;
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
  const brand = input.brand?.trim() || null;
  const model = input.model?.trim() || null;

  if (!productName) {
    return {
      error: new Error("El artículo no tiene descripción para agregar al catálogo."),
      product: null,
    };
  }

  const existingProductResponse = await supabase
    .from("products")
    .select("id,name,brand,model")
    .eq("company_id", input.companyId)
    .eq("name", productName)
    .limit(1)
    .maybeSingle();

  if (existingProductResponse.error) {
    return { error: existingProductResponse.error, product: null };
  }

  if (existingProductResponse.data) {
    const existingProduct = existingProductResponse.data as {
      brand: string | null;
      id: string;
      model: string | null;
      name: string;
    };
    const productPatch: { brand?: string; model?: string } = {};

    if (!existingProduct.brand && brand) {
      productPatch.brand = brand;
    }

    if (!existingProduct.model && model) {
      productPatch.model = model;
    }

    if (Object.keys(productPatch).length > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update(productPatch)
        .eq("id", existingProduct.id)
        .eq("company_id", input.companyId);

      if (updateError) {
        return { error: updateError, product: null };
      }
    }

    return {
      error: null,
      product: { id: existingProduct.id, name: existingProduct.name },
    };
  }

  const newProductResponse = await supabase
    .from("products")
    .insert({
      active: true,
      brand,
      company_id: input.companyId,
      description: productName,
      model,
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
