"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AttachmentManager } from "@/app/dashboard/attachment-manager";
import { INTERNAL_ORDER_LINE_STATUSES } from "@/app/dashboard/statuses";
import { calculateTaxLineAmounts, formatTaxRate } from "@/src/lib/tax";
import { resolveCatalogProduct } from "@/src/lib/supabase/product-catalog";
import { createClient } from "@/src/lib/supabase/client";

type ClientRecord = {
  id: string;
  name: string;
};

type ContactRecord = {
  id: string;
  client_id: string | null;
  contact_name?: string | null;
  organization_area?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ProductRecord = {
  id: string;
  name: string;
  brand: string | null;
  description: string | null;
  model: string | null;
  unit: string | null;
};

type SupplierRecord = {
  id: string;
  name: string;
};

type QuotationRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
  quoted_at: string | null;
  valid_until: string | null;
  status: string | null;
  notes: string | null;
};

type QuotationLineRecord = {
  id: string;
  company_id: string | null;
  product_id: string | null;
  brand: string | null;
  custom_description: string | null;
  model: string | null;
  supplier_id: string | null;
  supplier_cost: number | string | null;
  target_margin: number | string | null;
  suggested_price: number | string | null;
  final_unit_price: number | string | null;
  quantity: number | string | null;
  line_total: number | string | null;
  line_profit: number | string | null;
  real_margin: number | string | null;
  selected: boolean | null;
  tax_included: boolean | null;
  tax_rate: number | string | null;
  notes: string | null;
};

type InternalOrderRecord = {
  id: string;
  folio: string | null;
  quotation_id: string | null;
  status: string | null;
  archived_at: string | null;
};

type OrderCreationMode = "selected_lines" | "all_lines";

type LineFormState = {
  product_id: string;
  brand: string;
  custom_description: string;
  model: string;
  supplier_id: string;
  supplier_cost: string;
  target_margin: string;
  final_unit_price: string;
  quantity: string;
  selected: boolean;
  tax_included: boolean;
  tax_rate: string;
  notes: string;
};

type QuickSupplierFormState = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
};

type CotizacionDetalleClientProps = {
  quotationId: string;
};

const emptyLineForm: LineFormState = {
  product_id: "",
  brand: "",
  custom_description: "",
  model: "",
  supplier_id: "",
  supplier_cost: "",
  target_margin: "0.40",
  final_unit_price: "",
  quantity: "1",
  selected: false,
  tax_included: false,
  tax_rate: "0.16",
  notes: "",
};

const emptyQuickSupplierForm: QuickSupplierFormState = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  notes: "",
};

const defaultTargetMargin = 0.4;

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function optionalNumber(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  return cleanedValue === null ? null : Number(cleanedValue);
}

function targetMarginDecimal(value: string) {
  const cleanedValue = cleanOptionalValue(value);
  const parsedValue =
    cleanedValue === null ? defaultTargetMargin : Number(cleanedValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const decimalValue = parsedValue > 1 ? parsedValue / 100 : parsedValue;
  return decimalValue >= 0 && decimalValue < 1
    ? roundMargin(decimalValue)
    : null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function orderSaleUnitPrice(line: QuotationLineRecord) {
  const saleUnitPrice = Number(
    line.final_unit_price ?? line.suggested_price ?? 0,
  );

  return Number.isFinite(saleUnitPrice) ? saleUnitPrice : 0;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    style: "currency",
  }).format(toNumber(value));
}

function formatPercent(value: number | string | null | undefined) {
  const numericValue = toNumber(value);
  const percentValue =
    Math.abs(numericValue) > 1 ? numericValue / 100 : numericValue;

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
    style: "percent",
  }).format(percentValue);
}

function formatSummaryPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) {
    return "Sin contacto";
  }

  const name = contact.contact_name ?? "Sin nombre";
  const details = [contact.organization_area, contact.position].filter(Boolean);

  return details.length > 0 ? `${name} - ${details.join(" - ")}` : name;
}

function brandModelText(
  brand: string | null | undefined,
  model: string | null | undefined,
) {
  return [brand, model].filter(Boolean).join(" / ") || "Sin marca/modelo";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundMargin(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function numberInputValue(value: number) {
  return String(value);
}

function calculateFinalUnitPrice(supplierCost: number, targetMargin: number) {
  return roundMoney(supplierCost / (1 - targetMargin));
}

function calculateTargetMargin(supplierCost: number, finalUnitPrice: number) {
  return roundMargin((finalUnitPrice - supplierCost) / finalUnitPrice);
}

function parseNumberInput(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function CotizacionDetalleClient({
  quotationId,
}: CotizacionDetalleClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [catalogingLineId, setCatalogingLineId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [existingOrders, setExistingOrders] = useState<InternalOrderRecord[]>([]);
  const [form, setForm] = useState<LineFormState>(emptyLineForm);
  const [isCheckingOrders, setIsCheckingOrders] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isRestoringOrder, setIsRestoringOrder] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [lines, setLines] = useState<QuotationLineRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [quickSupplierForm, setQuickSupplierForm] =
    useState<QuickSupplierFormState>(emptyQuickSupplierForm);
  const [orderCreationMode, setOrderCreationMode] =
    useState<OrderCreationMode>("selected_lines");
  const [quotation, setQuotation] = useState<QuotationRecord | null>(null);
  const [showOrderOptions, setShowOrderOptions] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showQuickSupplierForm, setShowQuickSupplierForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const activeExistingOrder = useMemo(
    () => existingOrders.find((order) => !order.archived_at) ?? null,
    [existingOrders],
  );
  const archivedExistingOrders = useMemo(
    () => existingOrders.filter((order) => order.archived_at),
    [existingOrders],
  );
  const archivedOrderForAction = archivedExistingOrders[0] ?? null;

  const selectedLines = useMemo(
    () => lines.filter((line) => Boolean(line.selected)),
    [lines],
  );
  const selectedSubtotal = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) =>
          total +
          calculateTaxLineAmounts({
            quantity: line.quantity,
            taxIncluded: line.tax_included,
            taxRate: line.tax_rate,
            unitPrice: line.final_unit_price,
          }).subtotal,
        0,
      ),
    [selectedLines],
  );
  const selectedTax = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) =>
          total +
          calculateTaxLineAmounts({
            quantity: line.quantity,
            taxIncluded: line.tax_included,
            taxRate: line.tax_rate,
            unitPrice: line.final_unit_price,
          }).tax,
        0,
      ),
    [selectedLines],
  );
  const selectedTotal = selectedSubtotal + selectedTax;
  const selectedProfit = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) => total + toNumber(line.line_profit),
        0,
      ),
    [selectedLines],
  );
  const selectedMargin =
    selectedSubtotal > 0 ? selectedProfit / selectedSubtotal : 0;
  const quotationSummary = useMemo(() => {
    const summary = lines.reduce(
      (currentSummary, line) => {
        const quantity = toNumber(line.quantity);
        const lineCost = quantity * toNumber(line.supplier_cost);
        const lineAmounts = calculateTaxLineAmounts({
          quantity: line.quantity,
          taxIncluded: line.tax_included,
          taxRate: line.tax_rate,
          unitPrice: line.final_unit_price,
        });

        return {
          costTotal: currentSummary.costTotal + lineCost,
          saleSubtotal: currentSummary.saleSubtotal + lineAmounts.subtotal,
          saleTax: currentSummary.saleTax + lineAmounts.tax,
          saleTotal: currentSummary.saleTotal + lineAmounts.total,
        };
      },
      { costTotal: 0, saleSubtotal: 0, saleTax: 0, saleTotal: 0 },
    );
    const grossProfit = summary.saleSubtotal - summary.costTotal;
    const realMargin =
      summary.saleSubtotal > 0 ? grossProfit / summary.saleSubtotal : 0;

    return {
      ...summary,
      grossProfit,
      realMargin,
    };
  }, [lines]);

  const loadLines = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("quotation_lines")
        .select(
          "id,company_id,quotation_id,product_id,brand,custom_description,model,supplier_id,supplier_cost,target_margin,suggested_price,final_unit_price,quantity,line_total,line_profit,real_margin,selected,tax_rate,tax_included,notes",
        )
        .eq("company_id", activeCompanyId)
        .eq("quotation_id", quotationId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setLines([]);
        return;
      }

      setLines((data ?? []) as QuotationLineRecord[]);
    },
    [quotationId, supabase],
  );

  const loadSuppliers = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setSuppliers([]);
        return { error, suppliers: [] };
      }

      const loadedSuppliers = (data ?? []) as SupplierRecord[];
      setSuppliers(loadedSuppliers);
      return { error: null, suppliers: loadedSuppliers };
    },
    [supabase],
  );

  const loadExistingOrders = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("internal_orders")
        .select("id,folio,quotation_id,status,archived_at")
        .eq("company_id", activeCompanyId)
        .eq("quotation_id", quotationId)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setExistingOrders([]);
        return { error, orders: [] };
      }

      const loadedOrders = (data ?? []) as InternalOrderRecord[];
      setExistingOrders(loadedOrders);
      return { error: null, orders: loadedOrders };
    },
    [quotationId, supabase],
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

      const activeCompanyId = profile.company_id;
      setCompanyId(activeCompanyId);

      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select(
          "id,folio,client_id,contact_ref_id,quoted_at,valid_until,status,notes",
        )
        .eq("company_id", activeCompanyId)
        .eq("id", quotationId)
        .maybeSingle();

      if (quotationError) {
        setErrorMessage(quotationError.message);
        setIsLoading(false);
        return;
      }

      if (!quotationData) {
        setErrorMessage("No se encontró la cotización.");
        setIsLoading(false);
        return;
      }

      setQuotation(quotationData as QuotationRecord);

      const [
        existingOrderResponse,
        clientsResponse,
        contactsResponse,
        productsResponse,
        suppliersResponse,
      ] = await Promise.all([
        loadExistingOrders(activeCompanyId),
        supabase
          .from("clients")
          .select("id,name")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        supabase
          .from("contacts")
          .select("id,client_id,contact_name,organization_area,position,phone,email")
          .eq("company_id", activeCompanyId)
          .eq("active", true),
        supabase
          .from("products")
          .select("id,name,brand,description,model,unit")
          .eq("company_id", activeCompanyId)
          .order("name", { ascending: true }),
        loadSuppliers(activeCompanyId),
      ]);

      const firstError =
        existingOrderResponse.error ??
        clientsResponse.error ??
        contactsResponse.error ??
        productsResponse.error ??
        suppliersResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      setSuppliers(suppliersResponse.suppliers);

      await loadLines(activeCompanyId);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadExistingOrders, loadLines, loadSuppliers, quotationId, supabase]);

  function lineDescription(line: QuotationLineRecord) {
    const productName = line.product_id
      ? productsById.get(line.product_id)?.name
      : null;

    return line.custom_description || productName || "Sin descripción";
  }

  function orderLineDescription(line: QuotationLineRecord) {
    const productName = line.product_id
      ? productsById.get(line.product_id)?.name
      : null;

    return productName || line.custom_description || "Sin descripción";
  }

  function archivedOrderNeedsNewOrderConfirmation(order: InternalOrderRecord) {
    return ["facturado", "cobrado", "cancelado"].includes(
      (order.status ?? "").toLowerCase(),
    );
  }

  function archivedOrderConfirmationStatus(order: InternalOrderRecord) {
    switch ((order.status ?? "").toLowerCase()) {
      case "facturado":
        return "facturada";
      case "cobrado":
        return "cobrada";
      case "cancelado":
        return "cancelada";
      default:
        return order.status ?? "archivada";
    }
  }

  function handleProductChange(productId: string) {
    const selectedProduct = productsById.get(productId);

    setForm((currentForm) => ({
      ...currentForm,
      brand: currentForm.brand || selectedProduct?.brand || "",
      custom_description:
        currentForm.custom_description || selectedProduct?.description || "",
      model: currentForm.model || selectedProduct?.model || "",
      product_id: productId,
    }));
  }

  function handleSupplierCostChange(value: string) {
    const supplierCost = parseNumberInput(value);

    setForm((currentForm) => {
      const targetMargin = targetMarginDecimal(currentForm.target_margin);
      const nextForm = {
        ...currentForm,
        supplier_cost: value,
      };

      if (
        supplierCost !== null &&
        supplierCost >= 0 &&
        targetMargin !== null
      ) {
        nextForm.final_unit_price = numberInputValue(
          calculateFinalUnitPrice(supplierCost, targetMargin),
        );
      }

      return nextForm;
    });
  }

  function handleTargetMarginChange(value: string) {
    const targetMargin = targetMarginDecimal(value);

    setForm((currentForm) => {
      const supplierCost = parseNumberInput(currentForm.supplier_cost);
      const nextForm = {
        ...currentForm,
        target_margin: value,
      };

      if (
        supplierCost !== null &&
        supplierCost >= 0 &&
        targetMargin !== null
      ) {
        nextForm.final_unit_price = numberInputValue(
          calculateFinalUnitPrice(supplierCost, targetMargin),
        );
      }

      return nextForm;
    });
  }

  function handleFinalUnitPriceChange(value: string) {
    const finalUnitPrice = parseNumberInput(value);

    setForm((currentForm) => {
      const supplierCost = parseNumberInput(currentForm.supplier_cost);
      const nextForm = {
        ...currentForm,
        final_unit_price: value,
      };

      if (
        supplierCost !== null &&
        supplierCost >= 0 &&
        finalUnitPrice !== null &&
        finalUnitPrice > 0
      ) {
        nextForm.target_margin = numberInputValue(
          calculateTargetMargin(supplierCost, finalUnitPrice),
        );
      }

      return nextForm;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (!form.product_id && !form.custom_description.trim()) {
      setErrorMessage("Selecciona un producto o captura una descripción.");
      return;
    }

    const quantity = optionalNumber(form.quantity);

    if (!quantity || quantity <= 0) {
      setErrorMessage("La cantidad debe ser mayor a cero.");
      return;
    }

    const supplierCost = optionalNumber(form.supplier_cost);

    if (
      supplierCost !== null &&
      (!Number.isFinite(supplierCost) || supplierCost < 0)
    ) {
      setErrorMessage("El costo proveedor no puede ser negativo.");
      return;
    }

    const targetMargin = targetMarginDecimal(form.target_margin);

    if (targetMargin === null) {
      setErrorMessage(
        "El margen objetivo debe ser mayor o igual a 0 y menor a 100%.",
      );
      return;
    }

    const finalUnitPrice = optionalNumber(form.final_unit_price);

    if (
      finalUnitPrice !== null &&
      (!Number.isFinite(finalUnitPrice) || finalUnitPrice < 0)
    ) {
      setErrorMessage("El precio final unitario no puede ser negativo.");
      return;
    }

    const taxRate =
      form.tax_rate === "exempt" ? 0 : optionalNumber(form.tax_rate) ?? 0;

    if (!Number.isFinite(taxRate) || taxRate < 0) {
      setErrorMessage("El IVA debe ser 16%, 0% o exento.");
      return;
    }

    const syncedFinalUnitPrice =
      finalUnitPrice !== null
        ? roundMoney(finalUnitPrice)
        : supplierCost !== null
          ? calculateFinalUnitPrice(supplierCost, targetMargin)
          : null;
    const syncedTargetMargin =
      syncedFinalUnitPrice !== null &&
      syncedFinalUnitPrice > 0 &&
      supplierCost !== null
        ? calculateTargetMargin(supplierCost, syncedFinalUnitPrice)
        : targetMargin;

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      brand: cleanOptionalValue(form.brand),
      custom_description: cleanOptionalValue(form.custom_description),
      model: cleanOptionalValue(form.model),
      final_unit_price: syncedFinalUnitPrice,
      notes: cleanOptionalValue(form.notes),
      product_id: cleanOptionalValue(form.product_id),
      quantity,
      selected: form.selected,
      supplier_cost: supplierCost === null ? null : roundMoney(supplierCost),
      supplier_id: cleanOptionalValue(form.supplier_id),
      tax_included: form.tax_included,
      tax_rate: taxRate,
      target_margin: syncedTargetMargin,
    };

    const { error } = editingLineId
      ? await supabase
          .from("quotation_lines")
          .update(payload)
          .eq("id", editingLineId)
          .eq("company_id", companyId)
      : await supabase.from("quotation_lines").insert({
          ...payload,
          company_id: companyId,
          quotation_id: quotationId,
        });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingLineId(null);
    setShowCreateForm(false);
    cancelQuickSupplier();
    setForm(emptyLineForm);
    await loadLines(companyId);
  }

  function startEditing(line: QuotationLineRecord) {
    const supplierCost = parseNumberInput(String(line.supplier_cost ?? ""));
    const targetMargin = targetMarginDecimal(String(line.target_margin ?? ""));
    const savedFinalUnitPrice =
      line.final_unit_price === null || line.final_unit_price === undefined
        ? ""
        : String(line.final_unit_price);
    const finalUnitPrice =
      savedFinalUnitPrice ||
      (supplierCost !== null && targetMargin !== null
        ? numberInputValue(calculateFinalUnitPrice(supplierCost, targetMargin))
        : "");

    setEditingLineId(line.id);
    setShowCreateForm(false);
    cancelQuickSupplier();
    setForm({
      brand: line.brand ?? "",
      custom_description: line.custom_description ?? "",
      model: line.model ?? "",
      final_unit_price: finalUnitPrice,
      notes: line.notes ?? "",
      product_id: line.product_id ?? "",
      quantity: String(line.quantity ?? "1"),
      selected: Boolean(line.selected),
      supplier_cost:
        line.supplier_cost === null || line.supplier_cost === undefined
          ? ""
          : String(line.supplier_cost),
      supplier_id: line.supplier_id ?? "",
      tax_included: Boolean(line.tax_included),
      tax_rate: String(line.tax_rate ?? "0.16"),
      target_margin: String(line.target_margin ?? "0.40"),
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingLineId(null);
    setForm(emptyLineForm);
    cancelQuickSupplier();
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyLineForm);
      cancelQuickSupplier();
      setErrorMessage("");
      return;
    }

    setEditingLineId(null);
    setForm(emptyLineForm);
    cancelQuickSupplier();
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyLineForm);
    cancelQuickSupplier();
    setErrorMessage("");
  }

  function toggleQuickSupplier() {
    if (showQuickSupplierForm) {
      cancelQuickSupplier();
      return;
    }

    setShowQuickSupplierForm(true);
    setQuickSupplierForm(emptyQuickSupplierForm);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelQuickSupplier() {
    setShowQuickSupplierForm(false);
    setQuickSupplierForm(emptyQuickSupplierForm);
  }

  async function saveQuickSupplier() {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      setSuccessMessage("");
      return;
    }

    const supplierName = quickSupplierForm.name.trim();

    if (!supplierName) {
      setErrorMessage("El nombre del proveedor es obligatorio.");
      setSuccessMessage("");
      return;
    }

    setIsSavingSupplier(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        company_id: companyId,
        contact_name: cleanOptionalValue(quickSupplierForm.contact_name),
        email: cleanOptionalValue(quickSupplierForm.email),
        name: supplierName,
        notes: cleanOptionalValue(quickSupplierForm.notes),
        phone: cleanOptionalValue(quickSupplierForm.phone),
      })
      .select("id,name")
      .single();

    setIsSavingSupplier(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? "No se pudo guardar el proveedor.");
      return;
    }

    await loadSuppliers(companyId);
    setForm((currentForm) => ({
      ...currentForm,
      supplier_id: data.id,
    }));
    cancelQuickSupplier();
    setSuccessMessage("Proveedor agregado.");
  }

  async function deleteLine(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar la partida "${lineDescription(line)}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingId(line.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("quotation_lines")
      .delete()
      .eq("id", line.id)
      .eq("company_id", companyId);

    setIsDeletingId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingLineId === line.id) {
      cancelEditing();
    }

    await loadLines(companyId);
  }

  async function applySuggestedPrice(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const suggestedPrice = toNumber(line.suggested_price);

    if (suggestedPrice <= 0) {
      setErrorMessage("La partida no tiene precio sugerido disponible.");
      return;
    }

    const supplierCost = toNumber(line.supplier_cost);
    const targetMargin = calculateTargetMargin(supplierCost, suggestedPrice);

    if (supplierCost < 0 || targetMargin < 0 || targetMargin >= 1) {
      setErrorMessage(
        "El precio sugerido no permite calcular un margen objetivo válido.",
      );
      return;
    }

    setErrorMessage("");
    const { error } = await supabase
      .from("quotation_lines")
      .update({
        final_unit_price: roundMoney(suggestedPrice),
        target_margin: targetMargin,
      })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadLines(companyId);
  }

  async function toggleSelected(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const { error } = await supabase
      .from("quotation_lines")
      .update({ selected: !line.selected })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadLines(companyId);
  }

  async function addLineProductToCatalog(line: QuotationLineRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    setCatalogingLineId(line.id);
    setErrorMessage("");
    setSuccessMessage("");

    const productResponse = await resolveCatalogProduct(supabase, {
      brand: line.brand,
      companyId,
      model: line.model,
      name: line.custom_description,
      unit: "pieza",
    });

    if (productResponse.error) {
      setCatalogingLineId(null);
      setErrorMessage(productResponse.error.message);
      return;
    }

    const { error } = await supabase
      .from("quotation_lines")
      .update({ product_id: productResponse.product.id })
      .eq("id", line.id)
      .eq("company_id", companyId);

    setCatalogingLineId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Producto agregado al catálogo.");
    setProducts((currentProducts) =>
      currentProducts.some((product) => product.id === productResponse.product.id)
        ? currentProducts
        : [
            ...currentProducts,
            {
              description: line.custom_description,
              brand: line.brand,
              id: productResponse.product.id,
              model: line.model,
              name: productResponse.product.name,
              unit: "pieza",
            },
          ],
    );
    await loadLines(companyId);
  }

  async function prepareOrderCreationOptions() {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (showOrderOptions) {
      setShowOrderOptions(false);
      return;
    }

    setIsCheckingOrders(true);
    setOrderCreationMode("selected_lines");
    setErrorMessage("");
    setSuccessMessage("");

    await loadExistingOrders(companyId);

    setShowOrderOptions(true);
    setIsCheckingOrders(false);
  }

  async function restoreArchivedOrder() {
    if (!companyId || !archivedOrderForAction) {
      setErrorMessage("No se encontró una orden archivada para restaurar.");
      return;
    }

    setIsRestoringOrder(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("internal_orders")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("company_id", companyId)
      .eq("id", archivedOrderForAction.id);

    setIsRestoringOrder(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push(`/dashboard/ordenes/${archivedOrderForAction.id}`);
  }

  async function createOrderFromQuotation(allowArchivedDuplicate = false) {
    if (!companyId || !quotation) {
      setErrorMessage("No se encontró la empresa o la cotización.");
      setSuccessMessage("");
      return;
    }

    setIsCreatingOrder(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { orders: refreshedOrders, error: duplicateError } =
      await loadExistingOrders(companyId);

    if (duplicateError) {
      setIsCreatingOrder(false);
      return;
    }

    const activeOrder =
      refreshedOrders.find((order) => !order.archived_at) ?? null;
    const archivedOrders = refreshedOrders.filter((order) => order.archived_at);
    const firstArchivedOrder = archivedOrders[0] ?? null;

    if (activeOrder) {
      setIsCreatingOrder(false);
      setErrorMessage("Ya existe una orden activa para esta cotización.");
      setShowOrderOptions(true);
      return;
    }

    if (firstArchivedOrder && !allowArchivedDuplicate) {
      setIsCreatingOrder(false);
      setShowOrderOptions(true);
      return;
    }

    if (
      firstArchivedOrder &&
      archivedOrderNeedsNewOrderConfirmation(firstArchivedOrder) &&
      !window.confirm(
        `La orden anterior estaba ${archivedOrderConfirmationStatus(firstArchivedOrder)}. ¿Seguro que deseas crear una nueva orden?`,
      )
    ) {
      setIsCreatingOrder(false);
      return;
    }

    const linesToCopy =
      orderCreationMode === "all_lines" ? lines : selectedLines;

    if (linesToCopy.length === 0) {
      setIsCreatingOrder(false);
      setErrorMessage(
        orderCreationMode === "selected_lines"
          ? "No hay líneas elegidas para crear la orden."
          : "No hay líneas para crear la orden.",
      );
      return;
    }

    const linesWithoutFinalPrice = linesToCopy.filter(
      (line) => toNumber(line.final_unit_price) <= 0,
    );

    if (
      linesWithoutFinalPrice.length > 0 &&
      !window.confirm(
        "Hay partidas sin precio final. La orden puede quedar con venta en cero.",
      )
    ) {
      setIsCreatingOrder(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsCreatingOrder(false);
      setErrorMessage("No se pudo validar la sesión activa.");
      return;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("internal_orders")
      .insert({
        approved_at: new Date().toISOString().slice(0, 10),
        company_id: companyId,
        notes: `Generada desde cotización #${quotation.folio || "sin folio"}`,
        quotation_id: quotationId,
        responsible: user.email ?? null,
        status: "por comprar",
      })
      .select("id,folio,quotation_id")
      .single();

    if (orderError || !orderData) {
      setIsCreatingOrder(false);
      setErrorMessage(orderError?.message ?? "No se pudo crear la orden.");
      return;
    }

    const { error: linesError } = await supabase
      .from("internal_order_lines")
      .insert(
        linesToCopy.map((line) => {
          const product = line.product_id
            ? productsById.get(line.product_id)
            : undefined;

          return {
            brand: line.brand,
            company_id: line.company_id ?? companyId,
            internal_order_id: orderData.id,
            model: line.model,
            notes: line.notes,
            product_description: orderLineDescription(line),
            product_id: line.product_id,
            quantity: toNumber(line.quantity) || 1,
            quotation_line_id: line.id,
            sale_unit_price: orderSaleUnitPrice(line),
            status: INTERNAL_ORDER_LINE_STATUSES[1],
            supplier_cost: line.supplier_cost,
            supplier_id: line.supplier_id,
            tax_included: Boolean(line.tax_included),
            tax_rate: toNumber(line.tax_rate),
            unit: product?.unit || "pieza",
          };
        }),
      );

    setIsCreatingOrder(false);

    if (linesError) {
      setErrorMessage(linesError.message);
      return;
    }

    router.push(`/dashboard/ordenes/${orderData.id}`);
  }

  const clientName = quotation?.client_id
    ? clientsById.get(quotation.client_id)?.name ?? "Cliente no disponible"
    : "Sin cliente";
  const formSupplierCost = parseNumberInput(form.supplier_cost);
  const formFinalUnitPrice = parseNumberInput(form.final_unit_price);
  const formRealMargin =
    formSupplierCost !== null &&
    formFinalUnitPrice !== null &&
    formSupplierCost >= 0 &&
    formFinalUnitPrice > 0
      ? calculateTargetMargin(formSupplierCost, formFinalUnitPrice)
      : null;
  const selectedContact = quotation?.contact_ref_id
    ? contactsById.get(quotation.contact_ref_id)
    : undefined;
  const contactName = quotation?.contact_ref_id
    ? contactLabel(selectedContact)
    : "Sin contacto";

  return (
    <>
      <div className="print-hidden space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
            href="/dashboard/cotizaciones"
          >
            Volver a cotizaciones
          </Link>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="h-10 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!quotation || isLoading || isCheckingOrders}
              onClick={prepareOrderCreationOptions}
              type="button"
            >
              {isCheckingOrders ? "Revisando..." : "Crear orden"}
            </button>
            <button
              className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={!quotation || isLoading}
              onClick={() => window.print()}
              type="button"
            >
              Exportar PDF
            </button>
          </div>
        </div>

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

        {activeExistingOrder ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            Ya existe una orden activa para esta cotización.{" "}
            <Link
              className="font-semibold underline"
              href={`/dashboard/ordenes/${activeExistingOrder.id}`}
            >
              Ver orden
            </Link>
            .
          </div>
        ) : null}

        {showOrderOptions ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-stone-950">
                  Crear orden desde cotización
                </h3>
                {activeExistingOrder ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold">
                      Ya existe una orden activa para esta cotización.
                    </p>
                    <Link
                      className="mt-2 inline-flex h-9 items-center rounded-md border border-amber-300 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
                      href={`/dashboard/ordenes/${activeExistingOrder.id}`}
                    >
                      Ver orden
                    </Link>
                  </div>
                ) : null}
                {!activeExistingOrder && archivedOrderForAction ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold">
                      Ya existe una orden archivada para esta cotización.
                    </p>
                    <p className="mt-1">
                      Orden #{archivedOrderForAction.folio || "sin folio"}
                      {archivedOrderForAction.status
                        ? ` · ${archivedOrderForAction.status}`
                        : ""}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        className="h-9 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                        disabled={isRestoringOrder || isCreatingOrder}
                        onClick={restoreArchivedOrder}
                        type="button"
                      >
                        {isRestoringOrder
                          ? "Restaurando..."
                          : "Restaurar orden archivada"}
                      </button>
                      <button
                        className="h-9 rounded-md border border-amber-300 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isRestoringOrder || isCreatingOrder}
                        onClick={() => createOrderFromQuotation(true)}
                        type="button"
                      >
                        {isCreatingOrder ? "Creando..." : "Crear nueva orden"}
                      </button>
                      <button
                        className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isRestoringOrder || isCreatingOrder}
                        onClick={() => setShowOrderOptions(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 text-sm text-stone-800 sm:flex-row">
                  <label className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2">
                    <input
                      checked={orderCreationMode === "selected_lines"}
                      className="h-4 w-4 border-stone-300 text-emerald-800"
                      disabled={isCreatingOrder || Boolean(activeExistingOrder)}
                      onChange={() => setOrderCreationMode("selected_lines")}
                      type="radio"
                    />
                    Solo líneas elegidas
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2">
                    <input
                      checked={orderCreationMode === "all_lines"}
                      className="h-4 w-4 border-stone-300 text-emerald-800"
                      disabled={isCreatingOrder || Boolean(activeExistingOrder)}
                      onChange={() => setOrderCreationMode("all_lines")}
                      type="radio"
                    />
                    Todas las líneas
                  </label>
                </div>
                <p className="text-sm text-stone-600">
                  Se copiarán{" "}
                  {orderCreationMode === "all_lines"
                    ? lines.length
                    : selectedLines.length}{" "}
                  partidas a Órdenes.
                </p>
              </div>
              <button
                className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={
                  isCreatingOrder ||
                  isRestoringOrder ||
                  Boolean(activeExistingOrder) ||
                  Boolean(archivedOrderForAction)
                }
                onClick={() => createOrderFromQuotation()}
                type="button"
              >
                {isCreatingOrder ? "Creando..." : "Crear orden"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          {isLoading || !quotation ? (
            <p className="text-sm font-medium text-stone-600">
              Cargando cotización...
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Folio
                  </p>
                  <p className="mt-1 text-base font-semibold text-stone-950">
                    {quotation.folio || "Sin folio"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Cliente
                  </p>
                  <p className="mt-1 text-sm text-stone-800">{clientName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Dependencia/contacto
                  </p>
                  <div className="mt-1 space-y-1 text-sm text-stone-800">
                    <p>{contactName}</p>
                    {selectedContact?.phone ? (
                      <p className="text-xs text-stone-500">
                        Tel. {selectedContact.phone}
                      </p>
                    ) : null}
                    {selectedContact?.email ? (
                      <p className="text-xs text-stone-500">
                        {selectedContact.email}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Fecha
                  </p>
                  <p className="mt-1 text-sm text-stone-800">
                    {formatDate(quotation.quoted_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Vigencia
                  </p>
                  <p className="mt-1 text-sm text-stone-800">
                    {formatDate(quotation.valid_until)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Estado
                  </p>
                  <p className="mt-1 text-sm text-stone-800">
                    {quotation.status || "borrador"}
                  </p>
                </div>
                <div className="md:col-span-2 lg:col-span-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Notas
                  </p>
                  <p className="mt-1 text-sm text-stone-800">
                    {quotation.notes || "Sin notas"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 border-t border-stone-200 pt-5 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Subtotal
                  </p>
                  <p className="mt-2 text-xl font-semibold text-stone-950">
                    {formatMoney(quotationSummary.saleSubtotal)}
                  </p>
                </div>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    IVA
                  </p>
                  <p className="mt-2 text-xl font-semibold text-stone-950">
                    {formatMoney(quotationSummary.saleTax)}
                  </p>
                </div>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Total
                  </p>
                  <p className="mt-2 text-xl font-semibold text-stone-950">
                    {formatMoney(quotationSummary.saleTotal)}
                  </p>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Costo Total
                  </p>
                  <p className="mt-2 text-xl font-semibold text-amber-950">
                    {formatMoney(quotationSummary.costTotal)}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Utilidad Bruta
                  </p>
                  <p className="mt-2 text-xl font-semibold text-emerald-950">
                    {formatMoney(quotationSummary.grossProfit)}
                  </p>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Margen Real
                  </p>
                  <p className="mt-2 text-xl font-semibold text-blue-950">
                    {formatSummaryPercent(quotationSummary.realMargin)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className={`${editingLineId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                {editingLineId ? "Editar línea" : "Agregar línea"}
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                El precio sugerido, total, utilidad y margen real los calcula la
                base de datos.
              </p>
            </div>
            {editingLineId ? (
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
                {showCreateForm ? "Ocultar formulario" : "Agregar línea"}
              </button>
            )}
          </div>

          {editingLineId || showCreateForm ? (
            <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
            <div className="lg:col-span-3">
              <h4 className="text-base font-semibold text-stone-950">
                {editingLineId ? "Editar línea" : "Nuevo registro"}
              </h4>
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="product_id"
              >
                Producto
              </label>
                <select
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isLoading || isSaving || isSavingSupplier}
                  id="product_id"
                  onChange={(event) => handleProductChange(event.target.value)}
                  value={form.product_id}
              >
                <option value="">Sin producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="custom_description"
              >
                Descripción personalizada
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="custom_description"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    custom_description: event.target.value,
                  }))
                }
                value={form.custom_description}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="brand">
                Marca
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="brand"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    brand: event.target.value,
                  }))
                }
                value={form.brand}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-800" htmlFor="model">
                Modelo
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="model"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    model: event.target.value,
                  }))
                }
                value={form.model}
              />
            </div>

            <div className="space-y-2 lg:col-span-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label
                    className="text-sm font-medium text-stone-800"
                    htmlFor="supplier_id"
                  >
                    Proveedor
                  </label>
                  <select
                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                    disabled={isLoading || isSaving || isSavingSupplier}
                    id="supplier_id"
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        supplier_id: event.target.value,
                      }))
                    }
                    value={form.supplier_id}
                  >
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  aria-expanded={showQuickSupplierForm}
                  className="h-10 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || isSaving || isSavingSupplier}
                  onClick={toggleQuickSupplier}
                  type="button"
                >
                  Nuevo proveedor
                </button>
              </div>

              {showQuickSupplierForm ? (
                <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2 md:col-span-2 lg:col-span-4">
                    <h5 className="text-sm font-semibold text-stone-950">
                      Nuevo proveedor
                    </h5>
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-stone-800"
                      htmlFor="quick_supplier_name"
                    >
                      Nombre
                    </label>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={isSavingSupplier}
                      id="quick_supplier_name"
                      onChange={(event) =>
                        setQuickSupplierForm((currentForm) => ({
                          ...currentForm,
                          name: event.target.value,
                        }))
                      }
                      required
                      type="text"
                      value={quickSupplierForm.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-stone-800"
                      htmlFor="quick_supplier_contact"
                    >
                      Contacto
                    </label>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={isSavingSupplier}
                      id="quick_supplier_contact"
                      onChange={(event) =>
                        setQuickSupplierForm((currentForm) => ({
                          ...currentForm,
                          contact_name: event.target.value,
                        }))
                      }
                      type="text"
                      value={quickSupplierForm.contact_name}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-stone-800"
                      htmlFor="quick_supplier_phone"
                    >
                      Teléfono
                    </label>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={isSavingSupplier}
                      id="quick_supplier_phone"
                      onChange={(event) =>
                        setQuickSupplierForm((currentForm) => ({
                          ...currentForm,
                          phone: event.target.value,
                        }))
                      }
                      type="tel"
                      value={quickSupplierForm.phone}
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-stone-800"
                      htmlFor="quick_supplier_email"
                    >
                      Correo
                    </label>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={isSavingSupplier}
                      id="quick_supplier_email"
                      onChange={(event) =>
                        setQuickSupplierForm((currentForm) => ({
                          ...currentForm,
                          email: event.target.value,
                        }))
                      }
                      type="email"
                      value={quickSupplierForm.email}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2 lg:col-span-4">
                    <label
                      className="text-sm font-medium text-stone-800"
                      htmlFor="quick_supplier_notes"
                    >
                      Notas
                    </label>
                    <textarea
                      className="min-h-20 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={isSavingSupplier}
                      id="quick_supplier_notes"
                      onChange={(event) =>
                        setQuickSupplierForm((currentForm) => ({
                          ...currentForm,
                          notes: event.target.value,
                        }))
                      }
                      value={quickSupplierForm.notes}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row md:col-span-2 lg:col-span-4">
                    <button
                      className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                      disabled={isSavingSupplier}
                      onClick={saveQuickSupplier}
                      type="button"
                    >
                      {isSavingSupplier
                        ? "Guardando..."
                        : "Guardar proveedor"}
                    </button>
                    <button
                      className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSavingSupplier}
                      onClick={cancelQuickSupplier}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="supplier_cost"
              >
                Costo proveedor
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="supplier_cost"
                min="0"
                onChange={(event) => handleSupplierCostChange(event.target.value)}
                step="0.01"
                type="number"
                value={form.supplier_cost}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="target_margin"
              >
                Margen objetivo
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="target_margin"
                max="99.99"
                min="0"
                onChange={(event) => handleTargetMarginChange(event.target.value)}
                step="0.0001"
                type="number"
                value={form.target_margin}
              />
              <p className="text-xs text-stone-500">
                Ejemplo: 40% se guarda como margen 0.40
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="final_unit_price"
              >
                Precio final unitario
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="final_unit_price"
                min="0"
                onChange={(event) =>
                  handleFinalUnitPriceChange(event.target.value)
                }
                step="0.01"
                type="number"
                value={form.final_unit_price}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="tax_rate"
              >
                IVA
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="tax_rate"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    tax_rate: event.target.value,
                  }))
                }
                value={form.tax_rate}
              >
                <option value="0.16">16%</option>
                <option value="0">0%</option>
                <option value="exempt">Exento / sin IVA</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="real_margin"
              >
                Margen real
              </label>
              <div
                className="flex h-11 items-center rounded-md border border-stone-200 bg-stone-50 px-3 text-sm font-medium text-stone-700"
                id="real_margin"
              >
                {formRealMargin === null ? "Sin precio final" : formatPercent(formRealMargin)}
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="quantity"
              >
                Cantidad
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="quantity"
                min="0.01"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    quantity: event.target.value,
                  }))
                }
                required
                step="0.01"
                type="number"
                value={form.quantity}
              />
            </div>

            <label className="flex h-11 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800">
              <input
                checked={form.selected}
                className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                disabled={isLoading || isSaving || isSavingSupplier}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    selected: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Elegida
            </label>

            <label className="flex h-11 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800">
              <input
                checked={form.tax_included}
                className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                disabled={isLoading || isSaving || isSavingSupplier}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    tax_included: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Precio incluye IVA
            </label>

            <div className="space-y-2 lg:col-span-3">
              <label className="text-sm font-medium text-stone-800" htmlFor="notes">
                Notas
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || isSavingSupplier}
                id="notes"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    notes: event.target.value,
                  }))
                }
                value={form.notes}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-3">
              <button
                className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isLoading || isSaving || isSavingSupplier}
                type="submit"
              >
                {isSaving
                  ? "Guardando..."
                  : editingLineId
                    ? "Guardar cambios"
                    : "Agregar línea"}
              </button>
              {!editingLineId ? (
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
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div>
                <p className="text-sm text-stone-500">Subtotal</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedSubtotal)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">IVA</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedTax)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Total</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedTotal)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Utilidad total</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatMoney(selectedProfit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Margen total</p>
                <p className="mt-1 text-xl font-semibold text-stone-950">
                  {formatPercent(selectedMargin)}
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-5 text-sm font-medium text-stone-600">
              Cargando partidas...
            </div>
          ) : lines.length === 0 ? (
            <div className="p-5 text-sm text-stone-600">
              No hay partidas para mostrar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
                <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                  <tr>
                    <th className="px-5 py-3">Elegida</th>
                    <th className="px-5 py-3">Descripción</th>
                    <th className="px-5 py-3">Marca/modelo</th>
                    <th className="px-5 py-3">Proveedor</th>
                    <th className="px-5 py-3 text-right">Costo</th>
                    <th className="px-5 py-3 text-right">Margen objetivo</th>
                    <th className="px-5 py-3 text-right">Sugerido</th>
                    <th className="px-5 py-3 text-right">Precio final</th>
                    <th className="px-5 py-3 text-right">IVA</th>
                    <th className="px-5 py-3">Incluye IVA</th>
                    <th className="px-5 py-3 text-right">Cantidad</th>
                    <th className="px-5 py-3 text-right">Subtotal</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Utilidad</th>
                    <th className="px-5 py-3 text-right">Margen real</th>
                    <th className="px-5 py-3">Notas</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {lines.map((line) => {
                    const lineAmounts = calculateTaxLineAmounts({
                      quantity: line.quantity,
                      taxIncluded: line.tax_included,
                      taxRate: line.tax_rate,
                      unitPrice: line.final_unit_price,
                    });

                    return (
                    <tr key={line.id}>
                      <td className="px-5 py-4">
                        <input
                          checked={Boolean(line.selected)}
                          className="h-4 w-4 rounded border-stone-300 text-emerald-800"
                          onChange={() => toggleSelected(line)}
                          type="checkbox"
                        />
                      </td>
                      <td className="min-w-64 px-5 py-4 font-medium text-stone-950">
                        <div className="space-y-2">
                          <p>{lineDescription(line)}</p>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              line.product_id
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {line.product_id ? "En catálogo" : "Sin catalogar"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {brandModelText(line.brand, line.model)}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {line.supplier_id
                          ? suppliersById.get(line.supplier_id)?.name ??
                            "Proveedor no encontrado"
                          : "Sin proveedor"}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.supplier_cost)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatPercent(line.target_margin)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.suggested_price)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(line.final_unit_price)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatTaxRate(line.tax_rate)}
                      </td>
                      <td className="px-5 py-4 text-stone-700">
                        {line.tax_included ? "Sí" : "No"}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {toNumber(line.quantity)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(lineAmounts.subtotal)}
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-stone-950">
                        {formatMoney(lineAmounts.total)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatMoney(line.line_profit)}
                      </td>
                      <td className="px-5 py-4 text-right text-stone-700">
                        {formatPercent(line.real_margin)}
                      </td>
                      <td className="max-w-xs px-5 py-4 text-stone-700">
                        <span className="line-clamp-2">
                          {line.notes || "Sin notas"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {!line.product_id && line.custom_description ? (
                            <button
                              className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                isSaving ||
                                isDeletingId === line.id ||
                                catalogingLineId === line.id
                              }
                              onClick={() => addLineProductToCatalog(line)}
                              type="button"
                            >
                              {catalogingLineId === line.id
                                ? "Agregando..."
                                : "Agregar al catálogo"}
                            </button>
                          ) : null}
                          {toNumber(line.suggested_price) > 0 ? (
                            <button
                              className="h-9 rounded-md border border-stone-200 px-3 text-sm font-medium text-stone-500 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isSaving || isDeletingId === line.id}
                              onClick={() => applySuggestedPrice(line)}
                              type="button"
                            >
                              Aplicar sugerido
                            </button>
                          ) : null}
                          <button
                            className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === line.id}
                            onClick={() => startEditing(line)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSaving || isDeletingId === line.id}
                            onClick={() => deleteLine(line)}
                            type="button"
                          >
                            {isDeletingId === line.id
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
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

        {companyId && quotation ? (
          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="mb-5 border-b border-stone-200 pb-4">
              <h3 className="text-lg font-semibold text-stone-950">
                Archivos de cotización
              </h3>
            </div>
            <AttachmentManager
              companyId={companyId}
              entityId={quotationId}
              entityType="quotation"
            />
          </section>
        ) : null}
      </div>

      {quotation ? (
        <section className="print-only bg-white text-stone-950">
          <div className="mb-8 flex items-start justify-between border-b border-stone-300 pb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-600">
                Mi Proveeduría
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Cotización</h1>
            </div>
            <div className="text-right text-sm text-stone-700">
              <p className="font-semibold text-stone-950">
                {quotation.folio || "Sin folio"}
              </p>
              <p>Fecha: {formatDate(quotation.quoted_at)}</p>
              <p>Vigencia: {formatDate(quotation.valid_until)}</p>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="font-semibold text-stone-950">Cliente</p>
              <p className="mt-1 text-stone-700">{clientName}</p>
            </div>
            <div>
              <p className="font-semibold text-stone-950">
                Dependencia/contacto
              </p>
              <div className="mt-1 space-y-1 text-stone-700">
                <p>{selectedContact?.contact_name || contactName}</p>
                {selectedContact?.organization_area ? (
                  <p>Área: {selectedContact.organization_area}</p>
                ) : null}
                {selectedContact?.position ? (
                  <p>Puesto: {selectedContact.position}</p>
                ) : null}
                {selectedContact?.phone ? (
                  <p>Teléfono: {selectedContact.phone}</p>
                ) : null}
                {selectedContact?.email ? (
                  <p>Correo: {selectedContact.email}</p>
                ) : null}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="py-3 pr-4">Descripción</th>
                <th className="py-3 pr-4">Marca/modelo</th>
                <th className="py-3 pr-4 text-right">Cantidad</th>
                <th className="py-3 pr-4 text-right">Precio unitario</th>
                <th className="py-3 pr-4 text-right">IVA</th>
                <th className="py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedLines.map((line) => {
                const lineAmounts = calculateTaxLineAmounts({
                  quantity: line.quantity,
                  taxIncluded: line.tax_included,
                  taxRate: line.tax_rate,
                  unitPrice: line.final_unit_price,
                });

                return (
                <tr className="border-b border-stone-200" key={line.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-stone-950">
                      {lineDescription(line)}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-stone-600">{line.notes}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-stone-700">
                    {brandModelText(line.brand, line.model)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {toNumber(line.quantity)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatMoney(line.final_unit_price)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatTaxRate(line.tax_rate)}
                  </td>
                  <td className="py-3 text-right">
                    {formatMoney(lineAmounts.total)}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-5 text-right font-semibold" colSpan={5}>
                  Subtotal
                </td>
                <td className="pt-5 text-right text-lg font-semibold">
                  {formatMoney(selectedSubtotal)}
                </td>
              </tr>
              <tr>
                <td className="pt-2 text-right font-semibold" colSpan={5}>
                  IVA
                </td>
                <td className="pt-2 text-right text-lg font-semibold">
                  {formatMoney(selectedTax)}
                </td>
              </tr>
              <tr>
                <td className="pt-2 text-right font-semibold" colSpan={5}>
                  Total
                </td>
                <td className="pt-2 text-right text-lg font-semibold">
                  {formatMoney(selectedTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}
    </>
  );
}
