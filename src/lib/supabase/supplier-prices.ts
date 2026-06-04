import type { createClient } from "@/src/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

type SupplierPriceLinkInput = {
  companyId: string;
  cost: number | string | null;
  id: string;
  productId: string;
  quotedAt: string | null;
  supplierId: string | null;
};

type SupplierPriceLinkResult =
  | { duplicated: boolean; error: null }
  | { duplicated: false; error: Error };

function addNullableFilter<Query>(
  query: Query,
  column: string,
  value: string | number | null,
) {
  const filterableQuery = query as Query & {
    eq: (column: string, value: string | number) => Query;
    is: (column: string, value: null) => Query;
  };

  return value === null
    ? filterableQuery.is(column, null)
    : filterableQuery.eq(column, value);
}

export async function linkSupplierPriceToProduct(
  supabase: SupabaseBrowserClient,
  input: SupplierPriceLinkInput,
): Promise<SupplierPriceLinkResult> {
  const equivalentQuery = supabase
    .from("supplier_prices")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("product_id", input.productId)
    .neq("id", input.id)
    .limit(1);

  const withSupplier = addNullableFilter(
    equivalentQuery,
    "supplier_id",
    input.supplierId,
  );
  const withCost = addNullableFilter(withSupplier, "cost", input.cost);
  const equivalentResponse = await addNullableFilter(
    withCost,
    "quoted_at",
    input.quotedAt,
  ).maybeSingle();

  if (equivalentResponse.error) {
    return {
      duplicated: false,
      error: new Error("No se pudo verificar si ya existía el registro."),
    };
  }

  if (equivalentResponse.data) {
    const { error: deleteError } = await supabase
      .from("supplier_prices")
      .delete()
      .eq("id", input.id)
      .eq("company_id", input.companyId)
      .is("product_id", null);

    if (deleteError) {
      return {
        duplicated: false,
        error: new Error("No se pudo eliminar el registro duplicado."),
      };
    }

    return { duplicated: true, error: null };
  }

  const { error: updateError } = await supabase
    .from("supplier_prices")
    .update({ product_id: input.productId })
    .eq("id", input.id)
    .eq("company_id", input.companyId)
    .is("product_id", null);

  if (updateError) {
    return {
      duplicated: false,
      error: new Error("No se pudo vincular el producto existente."),
    };
  }

  return { duplicated: false, error: null };
}
