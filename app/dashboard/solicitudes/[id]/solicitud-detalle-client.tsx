"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import type {
  ClientRequestLineInsert,
  ClientRequestLineRecord,
  SupplierOfferInsert,
  SupplierOfferRecord,
} from "@/src/lib/supabase/request-line-types";

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
  description: string | null;
  unit: string | null;
};

type SupplierRecord = {
  id: string;
  name: string;
};

type RequestRecord = {
  id: string;
  folio: string | null;
  client_id: string | null;
  contact_ref_id: string | null;
  requested_at: string | null;
  requested_by: string | null;
  channel: string | null;
  description: string | null;
  urgency: string | null;
  status: string | null;
  notes: string | null;
};

type LineFormState = {
  product_id: string;
  description: string;
  quantity: string;
  unit: string;
  priority: string;
  status: string;
  notes: string;
};

type OfferFormState = {
  supplier_id: string;
  supplier_description: string;
  unit_price: string;
  currency: string;
  lead_time_days: string;
  minimum_order_quantity: string;
  valid_until: string;
  notes: string;
};

type QuickSupplierFormState = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
};

type SolicitudDetalleClientProps = {
  requestId: string;
};

const unitOptions = [
  "pieza",
  "caja",
  "paquete",
  "litro",
  "metro",
  "servicio",
  "otro",
];
const priorityOptions = ["normal", "urgente", "muy urgente"];
const lineStatusOptions = [
  "pendiente",
  "cotizando",
  "cotizada",
  "aprobada",
  "rechazada",
  "cerrada",
];

const emptyLineForm: LineFormState = {
  product_id: "",
  description: "",
  quantity: "1",
  unit: "pieza",
  priority: "normal",
  status: "pendiente",
  notes: "",
};

const emptyOfferForm: OfferFormState = {
  supplier_id: "",
  supplier_description: "",
  unit_price: "",
  currency: "MXN",
  lead_time_days: "",
  minimum_order_quantity: "",
  valid_until: "",
  notes: "",
};

const emptyQuickSupplierForm: QuickSupplierFormState = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  notes: "",
};

const defaultTargetMargin = "0.40";

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
  const parsedValue = cleanedValue === null ? 0.4 : Number(cleanedValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const decimalValue = parsedValue > 1 ? parsedValue / 100 : parsedValue;
  return decimalValue >= 0 && decimalValue < 1 ? decimalValue : null;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const [date] = value.split("T");
  return date || value;
}

function formatQuantity(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return String(value);
  }

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

function formatMoney(
  value: number | string | null | undefined,
  currency: string | null | undefined,
) {
  return new Intl.NumberFormat("es-MX", {
    currency: currency || "MXN",
    style: "currency",
  }).format(toNumber(value));
}

function contactLabel(contact: ContactRecord | undefined) {
  if (!contact) {
    return "Sin contacto";
  }

  const name = contact.contact_name ?? "Sin nombre";
  const details = [contact.organization_area, contact.position].filter(Boolean);

  return details.length > 0 ? `${name} - ${details.join(" - ")}` : name;
}

export function SolicitudDetalleClient({
  requestId,
}: SolicitudDetalleClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<LineFormState>(emptyLineForm);
  const [offerForm, setOfferForm] = useState<OfferFormState>(emptyOfferForm);
  const [offerFormLineId, setOfferFormLineId] = useState<string | null>(null);
  const [quickSupplierForm, setQuickSupplierForm] =
    useState<QuickSupplierFormState>(emptyQuickSupplierForm);
  const [quickSupplierLineId, setQuickSupplierLineId] = useState<string | null>(
    null,
  );
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingOfferId, setIsDeletingOfferId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingQuotation, setIsGeneratingQuotation] = useState(false);
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSelectingOfferId, setIsSelectingOfferId] = useState<string | null>(
    null,
  );
  const [lines, setLines] = useState<ClientRequestLineRecord[]>([]);
  const [offers, setOffers] = useState<SupplierOfferRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [targetMargin, setTargetMargin] = useState(defaultTargetMargin);
  const [warningMessage, setWarningMessage] = useState("");

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
  const offersByLineId = useMemo(() => {
    const nextOffersByLineId = new Map<string, SupplierOfferRecord[]>();

    offers.forEach((offer) => {
      if (!offer.client_request_line_id) {
        return;
      }

      const lineOffers = nextOffersByLineId.get(offer.client_request_line_id);

      if (lineOffers) {
        lineOffers.push(offer);
      } else {
        nextOffersByLineId.set(offer.client_request_line_id, [offer]);
      }
    });

    return nextOffersByLineId;
  }, [offers]);

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
        return [];
      }

      const loadedSuppliers = (data ?? []) as SupplierRecord[];
      setSuppliers(loadedSuppliers);
      return loadedSuppliers;
    },
    [supabase],
  );

  const loadOffers = useCallback(
    async (activeCompanyId: string, lineIds: string[]) => {
      if (lineIds.length === 0) {
        setOffers([]);
        return;
      }

      const { data, error } = await supabase
        .from("supplier_offers")
        .select(
          "id,company_id,client_request_line_id,supplier_id,supplier_description,unit_price,currency,lead_time_days,minimum_order_quantity,valid_until,notes,is_selected",
        )
        .eq("company_id", activeCompanyId)
        .in("client_request_line_id", lineIds)
        .order("is_selected", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setOffers([]);
        return;
      }

      setOffers((data ?? []) as SupplierOfferRecord[]);
    },
    [supabase],
  );

  const loadLines = useCallback(
    async (activeCompanyId: string) => {
      const { data, error } = await supabase
        .from("client_request_lines")
        .select(
          "id,company_id,client_request_id,product_id,description,quantity,unit,priority,status,notes",
        )
        .eq("company_id", activeCompanyId)
        .eq("client_request_id", requestId)
        .order("created_at", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setLines([]);
        return;
      }

      const loadedLines = (data ?? []) as ClientRequestLineRecord[];
      setLines(loadedLines);
      await loadOffers(
        activeCompanyId,
        loadedLines.map((line) => line.id),
      );
    },
    [loadOffers, requestId, supabase],
  );

  useEffect(() => {
    async function loadInitialData() {
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

      const activeCompanyId = profile.company_id;
      setCompanyId(activeCompanyId);

      const { data: requestData, error: requestError } = await supabase
        .from("client_requests")
        .select(
          "id,folio,client_id,contact_ref_id,requested_at,requested_by,channel,description,urgency,status,notes",
        )
        .eq("company_id", activeCompanyId)
        .eq("id", requestId)
        .maybeSingle();

      if (requestError) {
        setErrorMessage(requestError.message);
        setIsLoading(false);
        return;
      }

      if (!requestData) {
        setErrorMessage("No se encontró la solicitud.");
        setIsLoading(false);
        return;
      }

      setRequest(requestData as RequestRecord);

      const [clientsResponse, contactsResponse, productsResponse] =
        await Promise.all([
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
            .select("id,name,description,unit")
            .eq("company_id", activeCompanyId)
            .eq("active", true)
            .order("name", { ascending: true }),
        ]);

      const firstError =
        clientsResponse.error ??
        contactsResponse.error ??
        productsResponse.error;

      if (firstError) {
        setErrorMessage(firstError.message);
        setIsLoading(false);
        return;
      }

      setClients((clientsResponse.data ?? []) as ClientRecord[]);
      setContacts((contactsResponse.data ?? []) as ContactRecord[]);
      setProducts((productsResponse.data ?? []) as ProductRecord[]);
      await loadSuppliers(activeCompanyId);

      await loadLines(activeCompanyId);
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadLines, loadSuppliers, requestId, supabase]);

  function lineDescription(line: ClientRequestLineRecord) {
    const productName = line.product_id
      ? productsById.get(line.product_id)?.name
      : null;

    return line.description || productName || "Sin descripción";
  }

  function selectedOrBestOffer(lineOffers: SupplierOfferRecord[]) {
    const selectedOffer = lineOffers.find((offer) => offer.is_selected);

    if (selectedOffer) {
      return selectedOffer;
    }

    return [...lineOffers]
      .filter((offer) => toNumber(offer.unit_price) > 0)
      .sort((firstOffer, secondOffer) => {
        return toNumber(firstOffer.unit_price) - toNumber(secondOffer.unit_price);
      })[0];
  }

  function toggleLineDetails(line: ClientRequestLineRecord) {
    const isCollapsing = expandedLineId === line.id;

    setExpandedLineId(isCollapsing ? null : line.id);

    if (isCollapsing || editingLineId !== line.id) {
      cancelEditing();
    }

    if (isCollapsing || offerFormLineId !== line.id) {
      cancelOfferEditing();
    }
  }

  function handleProductChange(productId: string) {
    const selectedProduct = productsById.get(productId);

    setForm((currentForm) => ({
      ...currentForm,
      description:
        currentForm.description || selectedProduct?.description || selectedProduct?.name || "",
      product_id: productId,
      unit:
        currentForm.unit === "pieza" && selectedProduct?.unit
          ? selectedProduct.unit
          : currentForm.unit,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const description = form.description.trim();

    if (!description) {
      setErrorMessage("La descripción de la partida es obligatoria.");
      return;
    }

    const quantity = optionalNumber(form.quantity);

    if (!quantity || quantity <= 0) {
      setErrorMessage("La cantidad debe ser mayor a cero.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload: ClientRequestLineInsert = {
      company_id: companyId,
      client_request_id: requestId,
      description,
      notes: cleanOptionalValue(form.notes),
      priority: form.priority,
      product_id: cleanOptionalValue(form.product_id),
      quantity,
      status: form.status,
      unit: form.unit,
    };

    const { error } = editingLineId
      ? await supabase
          .from("client_request_lines")
          .update({
            description: payload.description,
            notes: payload.notes,
            priority: payload.priority,
            product_id: payload.product_id,
            quantity: payload.quantity,
            status: payload.status,
            unit: payload.unit,
          })
          .eq("id", editingLineId)
          .eq("company_id", companyId)
      : await supabase.from("client_request_lines").insert(payload);

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingLineId(null);
    setShowCreateForm(false);
    setForm(emptyLineForm);
    await loadLines(companyId);
  }

  function startEditing(line: ClientRequestLineRecord) {
    setEditingLineId(line.id);
    setExpandedLineId(line.id);
    setShowCreateForm(false);
    cancelOfferEditing();
    setForm({
      description: line.description ?? "",
      notes: line.notes ?? "",
      priority: priorityOptions.includes(line.priority ?? "")
        ? line.priority ?? "normal"
        : "normal",
      product_id: line.product_id ?? "",
      quantity: String(line.quantity ?? "1"),
      status: lineStatusOptions.includes(line.status ?? "")
        ? line.status ?? "pendiente"
        : "pendiente",
      unit: unitOptions.includes(line.unit ?? "") ? line.unit ?? "pieza" : "otro",
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingLineId(null);
    setForm(emptyLineForm);
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyLineForm);
      setErrorMessage("");
      return;
    }

    setEditingLineId(null);
    cancelOfferEditing();
    setForm(emptyLineForm);
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyLineForm);
    setErrorMessage("");
  }

  async function deleteLine(line: ClientRequestLineRecord) {
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
      .from("client_request_lines")
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

    if (expandedLineId === line.id) {
      setExpandedLineId(null);
    }

    await loadLines(companyId);
  }

  function startAddingOffer(line: ClientRequestLineRecord) {
    setEditingLineId(null);
    setExpandedLineId(line.id);
    setShowCreateForm(false);
    setEditingOfferId(null);
    setOfferFormLineId(line.id);
    cancelQuickSupplier();
    setOfferForm({
      ...emptyOfferForm,
      supplier_description: lineDescription(line),
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function startEditingOffer(offer: SupplierOfferRecord) {
    setEditingLineId(null);
    setExpandedLineId(offer.client_request_line_id);
    setShowCreateForm(false);
    setEditingOfferId(offer.id);
    setOfferFormLineId(offer.client_request_line_id);
    cancelQuickSupplier();
    setOfferForm({
      currency: offer.currency || "MXN",
      lead_time_days:
        offer.lead_time_days === null || offer.lead_time_days === undefined
          ? ""
          : String(offer.lead_time_days),
      minimum_order_quantity:
        offer.minimum_order_quantity === null ||
        offer.minimum_order_quantity === undefined
          ? ""
          : String(offer.minimum_order_quantity),
      notes: offer.notes ?? "",
      supplier_description: offer.supplier_description ?? "",
      supplier_id: offer.supplier_id ?? "",
      unit_price:
        offer.unit_price === null || offer.unit_price === undefined
          ? ""
          : String(offer.unit_price),
      valid_until: offer.valid_until ?? "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelOfferEditing() {
    setEditingOfferId(null);
    setOfferFormLineId(null);
    setOfferForm(emptyOfferForm);
    cancelQuickSupplier();
    setErrorMessage("");
  }

  function toggleQuickSupplier(lineId: string) {
    if (quickSupplierLineId === lineId) {
      cancelQuickSupplier();
      return;
    }

    setQuickSupplierLineId(lineId);
    setQuickSupplierForm(emptyQuickSupplierForm);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelQuickSupplier() {
    setQuickSupplierLineId(null);
    setQuickSupplierForm(emptyQuickSupplierForm);
  }

  async function saveQuickSupplier(lineId: string) {
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
    setOfferForm((currentForm) => ({
      ...currentForm,
      supplier_id: data.id,
    }));
    setQuickSupplierLineId((currentLineId) =>
      currentLineId === lineId ? null : currentLineId,
    );
    setQuickSupplierForm(emptyQuickSupplierForm);
    setSuccessMessage("Proveedor agregado.");
  }

  async function handleOfferSubmit(
    line: ClientRequestLineRecord,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const supplierId = cleanOptionalValue(offerForm.supplier_id);
    const unitPrice = optionalNumber(offerForm.unit_price);

    if (!supplierId) {
      setErrorMessage("Selecciona un proveedor para la oferta.");
      return;
    }

    if (!unitPrice || unitPrice <= 0) {
      setErrorMessage("El precio unitario debe ser mayor a cero.");
      return;
    }

    setIsSavingOffer(true);
    setErrorMessage("");

    const payload: SupplierOfferInsert = {
      client_request_line_id: line.id,
      company_id: companyId,
      currency: cleanOptionalValue(offerForm.currency)?.toUpperCase() ?? "MXN",
      is_selected: false,
      lead_time_days: optionalNumber(offerForm.lead_time_days),
      minimum_order_quantity: optionalNumber(offerForm.minimum_order_quantity),
      notes: cleanOptionalValue(offerForm.notes),
      supplier_description: cleanOptionalValue(offerForm.supplier_description),
      supplier_id: supplierId,
      unit_price: unitPrice,
      valid_until: cleanOptionalValue(offerForm.valid_until),
    };

    const offerResponse = editingOfferId
      ? await supabase
          .from("supplier_offers")
          .update({
            currency: payload.currency,
            lead_time_days: payload.lead_time_days,
            minimum_order_quantity: payload.minimum_order_quantity,
            notes: payload.notes,
            supplier_description: payload.supplier_description,
            supplier_id: payload.supplier_id,
            unit_price: payload.unit_price,
            valid_until: payload.valid_until,
          })
          .eq("id", editingOfferId)
          .eq("company_id", companyId)
          .select(
            "id,company_id,client_request_line_id,supplier_id,supplier_description,unit_price,currency,lead_time_days,minimum_order_quantity,valid_until,notes,is_selected",
          )
          .single()
      : await supabase
          .from("supplier_offers")
          .insert(payload)
          .select(
            "id,company_id,client_request_line_id,supplier_id,supplier_description,unit_price,currency,lead_time_days,minimum_order_quantity,valid_until,notes,is_selected",
          )
          .single();

    if (offerResponse.error) {
      setIsSavingOffer(false);
      setErrorMessage(offerResponse.error.message);
      return;
    }

    setIsSavingOffer(false);

    cancelOfferEditing();
    await loadLines(companyId);
  }

  async function deleteOffer(offer: SupplierOfferRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const supplierName = offer.supplier_id
      ? suppliersById.get(offer.supplier_id)?.name
      : null;
    const shouldDelete = window.confirm(
      `¿Eliminar la oferta de "${supplierName ?? "proveedor"}"?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeletingOfferId(offer.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("supplier_offers")
      .delete()
      .eq("id", offer.id)
      .eq("company_id", companyId);

    setIsDeletingOfferId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingOfferId === offer.id) {
      cancelOfferEditing();
    }

    await loadLines(companyId);
  }

  async function selectOffer(offer: SupplierOfferRecord) {
    if (!companyId || !offer.client_request_line_id) {
      setErrorMessage("No se encontró la empresa o partida de la oferta.");
      return;
    }

    setIsSelectingOfferId(offer.id);
    setErrorMessage("");

    const clearResponse = await supabase
      .from("supplier_offers")
      .update({ is_selected: false })
      .eq("company_id", companyId)
      .eq("client_request_line_id", offer.client_request_line_id);

    if (clearResponse.error) {
      setIsSelectingOfferId(null);
      setErrorMessage(clearResponse.error.message);
      return;
    }

    const selectResponse = await supabase
      .from("supplier_offers")
      .update({ is_selected: true })
      .eq("id", offer.id)
      .eq("company_id", companyId);

    setIsSelectingOfferId(null);

    if (selectResponse.error) {
      setErrorMessage(selectResponse.error.message);
      return;
    }

    await loadLines(companyId);
  }

  async function generateQuotation() {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    if (!request) {
      setErrorMessage("No se encontró la solicitud.");
      return;
    }

    if (!request.client_id) {
      setErrorMessage("La solicitud no tiene cliente asignado.");
      return;
    }

    if (lines.length === 0) {
      setErrorMessage("La solicitud no tiene partidas para cotizar.");
      return;
    }

    const selectedOffersByLineId = new Map<string, SupplierOfferRecord>();
    offers.forEach((offer) => {
      if (offer.client_request_line_id && offer.is_selected) {
        selectedOffersByLineId.set(offer.client_request_line_id, offer);
      }
    });

    const missingLines = lines.filter(
      (line) => !selectedOffersByLineId.has(line.id),
    );

    if (missingLines.length > 0) {
      setWarningMessage(
        `Selecciona una oferta de proveedor para: ${missingLines
          .map((line) => lineDescription(line))
          .join(", ")}.`,
      );
      setErrorMessage("");
      return;
    }

    const parsedTargetMargin = targetMarginDecimal(targetMargin);

    if (parsedTargetMargin === null) {
      setErrorMessage(
        "El margen objetivo debe ser mayor o igual a 0 y menor a 100%.",
      );
      setWarningMessage("");
      return;
    }

    const invalidLine = lines.find((line) => {
      const selectedOffer = selectedOffersByLineId.get(line.id);
      return (
        !selectedOffer ||
        !selectedOffer.supplier_id ||
        toNumber(selectedOffer.unit_price) <= 0 ||
        toNumber(line.quantity) <= 0
      );
    });

    if (invalidLine) {
      setErrorMessage(
        `La partida "${lineDescription(
          invalidLine,
        )}" debe tener oferta válida y cantidad mayor a cero.`,
      );
      setWarningMessage("");
      return;
    }

    const quotationLines = lines.map((line) => {
      const selectedOffer = selectedOffersByLineId.get(line.id)!;
      const supplierCost = roundMoney(toNumber(selectedOffer.unit_price));
      const quantity = toNumber(line.quantity);

      const suggestedPrice = roundMoney(
        supplierCost / (1 - parsedTargetMargin),
      );
      const finalUnitPrice = suggestedPrice;
      const notes = [
        `Generada desde oferta proveedor ${selectedOffer.id}.`,
        selectedOffer.lead_time_days
          ? `Tiempo de entrega: ${selectedOffer.lead_time_days} días.`
          : null,
        selectedOffer.notes ? `Notas oferta: ${selectedOffer.notes}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        company_id: companyId,
        custom_description: line.description,
        final_unit_price: finalUnitPrice,
        notes,
        product_id: line.product_id,
        quantity,
        selected: true,
        supplier_cost: supplierCost,
        supplier_id: selectedOffer.supplier_id,
        target_margin: parsedTargetMargin,
      };
    });

    setIsGeneratingQuotation(true);
    setErrorMessage("");
    setWarningMessage("");

    try {
      const currentDate = new Date();
      const validUntil = addDays(currentDate, 15);
      const notes = [
        `Cotización generada desde solicitud ${request.folio || request.id}.`,
        request.description ? `Descripción: ${request.description}` : null,
        request.notes ? `Notas solicitud: ${request.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .insert({
          client_id: request.client_id,
          company_id: companyId,
          contact_ref_id: request.contact_ref_id,
          notes,
          quoted_at: todayDate(),
          request_id: request.id,
          status: "borrador",
          valid_until: validUntil,
        })
        .select("id")
        .single();

      if (quotationError || !quotationData) {
        throw new Error(quotationError?.message ?? "No se pudo crear la cotización.");
      }

      const { error: linesError } = await supabase.from("quotation_lines").insert(
        quotationLines.map((line) => ({
          company_id: line.company_id,
          custom_description: line.custom_description,
          final_unit_price: line.final_unit_price,
          notes: line.notes,
          product_id: line.product_id,
          quantity: line.quantity,
          quotation_id: quotationData.id,
          selected: line.selected,
          supplier_cost: line.supplier_cost,
          supplier_id: line.supplier_id,
          target_margin: line.target_margin,
        })),
      );

      if (linesError) {
        throw new Error(linesError.message);
      }

      router.push(`/dashboard/cotizaciones/${quotationData.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo generar la cotización.",
      );
    } finally {
      setIsGeneratingQuotation(false);
    }
  }

  const clientName = request?.client_id
    ? clientsById.get(request.client_id)?.name ?? "Cliente no disponible"
    : "Sin cliente";
  const selectedContact = request?.contact_ref_id
    ? contactsById.get(request.contact_ref_id)
    : undefined;
  const contactName = request?.contact_ref_id
    ? contactLabel(selectedContact)
    : "Sin contacto";

  return (
    <div className="space-y-6">
      <Link
        className="text-sm font-medium text-emerald-800 hover:text-emerald-950 hover:underline"
        href="/dashboard/solicitudes"
      >
        Volver a solicitudes
      </Link>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {warningMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {warningMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        {isLoading || !request ? (
          <p className="text-sm font-medium text-stone-600">
            Cargando solicitud...
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Folio
              </p>
              <p className="mt-1 text-base font-semibold text-stone-950">
                {request.folio || "Sin folio"}
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
                {formatDate(request.requested_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Urgencia
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {request.urgency || "normal"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Estado
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {request.status || "nueva"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Solicitado por
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {request.requested_by || "Sin solicitante"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Canal
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {request.channel || "Sin canal"}
              </p>
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Notas
              </p>
              <p className="mt-1 text-sm text-stone-800">
                {request.notes || "Sin notas"}
              </p>
            </div>
            <div className="md:col-span-2 lg:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Descripción general
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800">
                {request.description || "Sin descripción"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className={`${editingLineId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingLineId ? "Editar partida" : "Agregar partida"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              El producto es opcional para artículos que todavía no están en el
              catálogo.
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
              {showCreateForm ? "Ocultar formulario" : "Agregar partida"}
            </button>
          )}
        </div>

        {editingLineId || showCreateForm ? (
        <form className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-3" onSubmit={handleSubmit}>
          <div className="lg:col-span-3">
            <h4 className="text-base font-semibold text-stone-950">
              {editingLineId ? "Editar partida" : "Nuevo registro"}
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
              disabled={isLoading || isSaving}
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
              htmlFor="description"
            >
              Descripción
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="description"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  description: event.target.value,
                }))
              }
              required
              value={form.description}
            />
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
              disabled={isLoading || isSaving}
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-800" htmlFor="unit">
              Unidad
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="unit"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  unit: event.target.value,
                }))
              }
              value={form.unit}
            >
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="priority"
            >
              Prioridad
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="priority"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  priority: event.target.value,
                }))
              }
              value={form.priority}
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="status"
            >
              Estado
            </label>
            <select
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
              id="status"
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  status: event.target.value,
                }))
              }
              value={form.status}
            >
              {lineStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label
              className="text-sm font-medium text-stone-800"
              htmlFor="notes"
            >
              Notas
            </label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
              disabled={isLoading || isSaving}
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
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving
                ? "Guardando..."
                : editingLineId
                  ? "Guardar cambios"
                  : "Guardar"}
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-950">
                Partidas solicitadas
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Lista de artículos o servicios requeridos por el cliente.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-stone-800"
                  htmlFor="target_margin"
                >
                  Margen objetivo
                </label>
                <input
                  className="h-10 w-36 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                  disabled={isLoading || isGeneratingQuotation}
                  id="target_margin"
                  max="99.99"
                  min="0"
                  onChange={(event) => setTargetMargin(event.target.value)}
                  step="0.01"
                  type="number"
                  value={targetMargin}
                />
              </div>
              <button
                className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isLoading || isGeneratingQuotation || lines.length === 0}
                onClick={generateQuotation}
                type="button"
              >
                {isGeneratingQuotation
                  ? "Generando..."
                  : "Generar cotización"}
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando partidas...
          </div>
        ) : lines.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            Esta solicitud todavía no tiene partidas.
          </div>
        ) : (
          <div className="grid gap-3 p-5">
            {lines.map((line) => {
              const lineOffers = offersByLineId.get(line.id) ?? [];
              const featuredOffer = selectedOrBestOffer(lineOffers);
              const isExpanded = expandedLineId === line.id;
              const isOfferFormOpen = offerFormLineId === line.id;
              const isQuickSupplierOpen = quickSupplierLineId === line.id;

              return (
                <article
                  className="rounded-lg border border-stone-200 bg-white shadow-sm"
                  key={line.id}
                >
                  <div className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="space-y-2">
                          <p className="font-semibold text-stone-950">
                            {lineDescription(line)}
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs text-stone-600">
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">
                              {formatQuantity(line.quantity)} {line.unit || ""}
                            </span>
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">
                              {line.status || "pendiente"}
                            </span>
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-700">
                              {lineOffers.length}{" "}
                              {lineOffers.length === 1 ? "oferta" : "ofertas"}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-stone-700">
                          {featuredOffer ? (
                            <p>
                              {featuredOffer.is_selected
                                ? "Oferta seleccionada"
                                : "Mejor oferta"}
                              :{" "}
                              <span className="font-semibold text-stone-950">
                                {formatMoney(
                                  featuredOffer.unit_price,
                                  featuredOffer.currency,
                                )}
                              </span>{" "}
                              <span className="text-stone-500">
                                (
                                {featuredOffer.supplier_id
                                  ? suppliersById.get(featuredOffer.supplier_id)
                                      ?.name ?? "Proveedor no disponible"
                                  : "Sin proveedor"}
                                )
                              </span>
                            </p>
                          ) : (
                            <p className="text-stone-500">
                              Sin oferta seleccionada.
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        aria-expanded={isExpanded}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                        onClick={() => toggleLineDetails(line)}
                        type="button"
                      >
                        {isExpanded ? (
                          <ChevronUp aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ChevronDown
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                        )}
                        {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="space-y-5 border-t border-stone-200 bg-stone-50/70 p-4">
                      <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                        <div className="md:col-span-2 lg:col-span-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Descripción
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-stone-800">
                            {lineDescription(line)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Producto
                          </p>
                          <p className="mt-1 text-stone-800">
                            {line.product_id
                              ? productsById.get(line.product_id)?.name ??
                                "Producto no disponible"
                              : "Sin producto"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Cantidad
                          </p>
                          <p className="mt-1 text-stone-800">
                            {formatQuantity(line.quantity)} {line.unit || ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Prioridad
                          </p>
                          <p className="mt-1">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                line.priority === "muy urgente"
                                  ? "bg-red-50 text-red-700"
                                  : line.priority === "urgente"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {line.priority || "normal"}
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Estado
                          </p>
                          <p className="mt-1">
                            <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-700">
                              {line.status || "pendiente"}
                            </span>
                          </p>
                        </div>
                        <div className="md:col-span-2 lg:col-span-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            Notas
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-stone-800">
                            {line.notes || "Sin notas"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-stone-950">
                            Opciones de proveedor
                          </h4>
                          <p className="mt-1 text-xs text-stone-600">
                            Ofertas de proveedor para esta partida.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
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
                          <button
                            className="h-9 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                            disabled={isSavingOffer}
                            onClick={() => startAddingOffer(line)}
                            type="button"
                          >
                            Agregar oferta de proveedor
                          </button>
                        </div>
                      </div>

                      {lineOffers.length === 0 ? (
                        <p className="rounded-md border border-dashed border-stone-300 bg-white px-4 py-3 text-sm text-stone-600">
                          Sin opciones de proveedor todavía.
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {lineOffers.map((offer) => (
                            <div
                              className={`rounded-md border bg-white p-4 ${
                                offer.is_selected
                                  ? "border-emerald-300 ring-2 ring-emerald-100"
                                  : "border-stone-200"
                              }`}
                              key={offer.id}
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-stone-950">
                                      {offer.supplier_id
                                        ? suppliersById.get(offer.supplier_id)
                                            ?.name ??
                                          "Proveedor no disponible"
                                        : "Sin proveedor"}
                                    </p>
                                    {offer.is_selected ? (
                                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                        Seleccionada
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm text-stone-700">
                                    {offer.supplier_description ||
                                      lineDescription(line)}
                                  </p>
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600">
                                    <span>
                                      Precio:{" "}
                                      <strong className="text-stone-900">
                                        {formatMoney(
                                          offer.unit_price,
                                          offer.currency,
                                        )}
                                      </strong>
                                    </span>
                                    <span>
                                      Entrega:{" "}
                                      {offer.lead_time_days
                                        ? `${offer.lead_time_days} días`
                                        : "Sin dato"}
                                    </span>
                                    <span>
                                      MOQ:{" "}
                                      {offer.minimum_order_quantity ??
                                        "Sin dato"}
                                    </span>
                                    <span>
                                      Vigencia: {formatDate(offer.valid_until)}
                                    </span>
                                  </div>
                                  {offer.notes ? (
                                    <p className="text-xs text-stone-500">
                                      {offer.notes}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                  <button
                                    className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={
                                      isSelectingOfferId === offer.id ||
                                      Boolean(offer.is_selected)
                                    }
                                    onClick={() => selectOffer(offer)}
                                    type="button"
                                  >
                                    {isSelectingOfferId === offer.id
                                      ? "Seleccionando..."
                                      : "Elegir"}
                                  </button>
                                  <button
                                    className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isSavingOffer}
                                    onClick={() => startEditingOffer(offer)}
                                    type="button"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isDeletingOfferId === offer.id}
                                    onClick={() => deleteOffer(offer)}
                                    type="button"
                                  >
                                    {isDeletingOfferId === offer.id
                                      ? "Eliminando..."
                                      : "Eliminar"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {isOfferFormOpen ? (
                              <form
                                className="grid gap-4 rounded-md border border-stone-200 bg-white p-4 lg:grid-cols-4"
                                onSubmit={(event) =>
                                  handleOfferSubmit(line, event)
                                }
                              >
                                <div className="space-y-2 lg:col-span-4">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                    <div className="flex-1 space-y-2">
                                      <label
                                        className="text-sm font-medium text-stone-800"
                                        htmlFor={`supplier_id_${line.id}`}
                                      >
                                        Proveedor
                                      </label>
                                      <select
                                        className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                        disabled={
                                          isSavingOffer || isSavingSupplier
                                        }
                                        id={`supplier_id_${line.id}`}
                                        onChange={(event) =>
                                          setOfferForm((currentForm) => ({
                                            ...currentForm,
                                            supplier_id: event.target.value,
                                          }))
                                        }
                                        required
                                        value={offerForm.supplier_id}
                                      >
                                        <option value="">
                                          Selecciona proveedor
                                        </option>
                                        {suppliers.map((supplier) => (
                                          <option
                                            key={supplier.id}
                                            value={supplier.id}
                                          >
                                            {supplier.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      aria-expanded={isQuickSupplierOpen}
                                      className="h-10 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={
                                        isSavingOffer || isSavingSupplier
                                      }
                                      onClick={() =>
                                        toggleQuickSupplier(line.id)
                                      }
                                      type="button"
                                    >
                                      Nuevo proveedor
                                    </button>
                                  </div>

                                  {isQuickSupplierOpen ? (
                                    <div className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 md:grid-cols-2 lg:grid-cols-4">
                                      <div className="space-y-2 md:col-span-2 lg:col-span-4">
                                        <h5 className="text-sm font-semibold text-stone-950">
                                          Nuevo proveedor
                                        </h5>
                                      </div>
                                      <div className="space-y-2">
                                        <label
                                          className="text-sm font-medium text-stone-800"
                                          htmlFor={`quick_supplier_name_${line.id}`}
                                        >
                                          Nombre
                                        </label>
                                        <input
                                          className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                          disabled={isSavingSupplier}
                                          id={`quick_supplier_name_${line.id}`}
                                          onChange={(event) =>
                                            setQuickSupplierForm(
                                              (currentForm) => ({
                                                ...currentForm,
                                                name: event.target.value,
                                              }),
                                            )
                                          }
                                          required
                                          type="text"
                                          value={quickSupplierForm.name}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <label
                                          className="text-sm font-medium text-stone-800"
                                          htmlFor={`quick_supplier_contact_${line.id}`}
                                        >
                                          Contacto
                                        </label>
                                        <input
                                          className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                          disabled={isSavingSupplier}
                                          id={`quick_supplier_contact_${line.id}`}
                                          onChange={(event) =>
                                            setQuickSupplierForm(
                                              (currentForm) => ({
                                                ...currentForm,
                                                contact_name:
                                                  event.target.value,
                                              }),
                                            )
                                          }
                                          type="text"
                                          value={quickSupplierForm.contact_name}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <label
                                          className="text-sm font-medium text-stone-800"
                                          htmlFor={`quick_supplier_phone_${line.id}`}
                                        >
                                          Teléfono
                                        </label>
                                        <input
                                          className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                          disabled={isSavingSupplier}
                                          id={`quick_supplier_phone_${line.id}`}
                                          onChange={(event) =>
                                            setQuickSupplierForm(
                                              (currentForm) => ({
                                                ...currentForm,
                                                phone: event.target.value,
                                              }),
                                            )
                                          }
                                          type="tel"
                                          value={quickSupplierForm.phone}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <label
                                          className="text-sm font-medium text-stone-800"
                                          htmlFor={`quick_supplier_email_${line.id}`}
                                        >
                                          Correo
                                        </label>
                                        <input
                                          className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                          disabled={isSavingSupplier}
                                          id={`quick_supplier_email_${line.id}`}
                                          onChange={(event) =>
                                            setQuickSupplierForm(
                                              (currentForm) => ({
                                                ...currentForm,
                                                email: event.target.value,
                                              }),
                                            )
                                          }
                                          type="email"
                                          value={quickSupplierForm.email}
                                        />
                                      </div>
                                      <div className="space-y-2 md:col-span-2 lg:col-span-4">
                                        <label
                                          className="text-sm font-medium text-stone-800"
                                          htmlFor={`quick_supplier_notes_${line.id}`}
                                        >
                                          Notas
                                        </label>
                                        <textarea
                                          className="min-h-20 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                          disabled={isSavingSupplier}
                                          id={`quick_supplier_notes_${line.id}`}
                                          onChange={(event) =>
                                            setQuickSupplierForm(
                                              (currentForm) => ({
                                                ...currentForm,
                                                notes: event.target.value,
                                              }),
                                            )
                                          }
                                          value={quickSupplierForm.notes}
                                        />
                                      </div>
                                      <div className="flex flex-col gap-2 sm:flex-row md:col-span-2 lg:col-span-4">
                                        <button
                                          className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                                          disabled={isSavingSupplier}
                                          onClick={() =>
                                            saveQuickSupplier(line.id)
                                          }
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

                                <div className="space-y-2 lg:col-span-3">
                                  <label
                                    className="text-sm font-medium text-stone-800"
                                    htmlFor={`supplier_description_${line.id}`}
                                  >
                                    Descripción proveedor
                                  </label>
                                  <input
                                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                    disabled={isSavingOffer}
                                    id={`supplier_description_${line.id}`}
                                    onChange={(event) =>
                                      setOfferForm((currentForm) => ({
                                        ...currentForm,
                                        supplier_description:
                                          event.target.value,
                                      }))
                                    }
                                    value={offerForm.supplier_description}
                                  />
                                </div>

                                {[
                                  [
                                    "unit_price",
                                    "Precio unitario",
                                    offerForm.unit_price,
                                    "0.01",
                                  ],
                                  [
                                    "lead_time_days",
                                    "Días entrega",
                                    offerForm.lead_time_days,
                                    "1",
                                  ],
                                  [
                                    "minimum_order_quantity",
                                    "MOQ",
                                    offerForm.minimum_order_quantity,
                                    "0.01",
                                  ],
                                ].map(([id, label, value, step]) => (
                                  <div className="space-y-2" key={id}>
                                    <label
                                      className="text-sm font-medium text-stone-800"
                                      htmlFor={`${id}_${line.id}`}
                                    >
                                      {label}
                                    </label>
                                    <input
                                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                      disabled={isSavingOffer}
                                      id={`${id}_${line.id}`}
                                      min="0"
                                      onChange={(event) =>
                                        setOfferForm((currentForm) => ({
                                          ...currentForm,
                                          [id]: event.target.value,
                                        }))
                                      }
                                      required={id === "unit_price"}
                                      step={step}
                                      type="number"
                                      value={value}
                                    />
                                  </div>
                                ))}

                                <div className="space-y-2">
                                  <label
                                    className="text-sm font-medium text-stone-800"
                                    htmlFor={`currency_${line.id}`}
                                  >
                                    Moneda
                                  </label>
                                  <input
                                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm uppercase text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                    disabled={isSavingOffer}
                                    id={`currency_${line.id}`}
                                    maxLength={3}
                                    onChange={(event) =>
                                      setOfferForm((currentForm) => ({
                                        ...currentForm,
                                        currency: event.target.value,
                                      }))
                                    }
                                    required
                                    value={offerForm.currency}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label
                                    className="text-sm font-medium text-stone-800"
                                    htmlFor={`valid_until_${line.id}`}
                                  >
                                    Vigencia
                                  </label>
                                  <input
                                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                    disabled={isSavingOffer}
                                    id={`valid_until_${line.id}`}
                                    onChange={(event) =>
                                      setOfferForm((currentForm) => ({
                                        ...currentForm,
                                        valid_until: event.target.value,
                                      }))
                                    }
                                    type="date"
                                    value={offerForm.valid_until}
                                  />
                                </div>

                                <div className="space-y-2 lg:col-span-3">
                                  <label
                                    className="text-sm font-medium text-stone-800"
                                    htmlFor={`offer_notes_${line.id}`}
                                  >
                                    Notas
                                  </label>
                                  <textarea
                                    className="min-h-20 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                                    disabled={isSavingOffer}
                                    id={`offer_notes_${line.id}`}
                                    onChange={(event) =>
                                      setOfferForm((currentForm) => ({
                                        ...currentForm,
                                        notes: event.target.value,
                                      }))
                                    }
                                    value={offerForm.notes}
                                  />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row lg:col-span-4">
                                  <button
                                    className="h-10 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                                    disabled={isSavingOffer}
                                    type="submit"
                                  >
                                    {isSavingOffer
                                      ? "Guardando..."
                                      : editingOfferId
                                        ? "Guardar oferta"
                                        : "Guardar"}
                                  </button>
                                  <button
                                    className="h-10 rounded-md border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={isSavingOffer}
                                    onClick={cancelOfferEditing}
                                    type="button"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                            </form>
                          ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
