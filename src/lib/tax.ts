export type TaxLineAmounts = {
  subtotal: number;
  tax: number;
  total: number;
};

export function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function calculateTaxLineAmounts({
  quantity,
  taxIncluded,
  taxRate,
  unitPrice,
}: {
  quantity: number | string | null | undefined;
  taxIncluded: boolean | null | undefined;
  taxRate: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
}): TaxLineAmounts {
  const lineBase = numericValue(quantity) * numericValue(unitPrice);
  const rate = Math.max(numericValue(taxRate), 0);

  if (taxIncluded) {
    const subtotal = rate > 0 ? lineBase / (1 + rate) : lineBase;
    return {
      subtotal,
      tax: lineBase - subtotal,
      total: lineBase,
    };
  }

  const tax = lineBase * rate;
  return {
    subtotal: lineBase,
    tax,
    total: lineBase + tax,
  };
}

export function formatTaxRate(value: number | string | null | undefined) {
  const rate = numericValue(value);

  if (rate <= 0) {
    return "0% / Exento";
  }

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    style: "percent",
  }).format(rate);
}
