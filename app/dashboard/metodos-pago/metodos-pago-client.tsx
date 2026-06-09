"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

const paymentMethodTypes = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta_debito", label: "Tarjeta débito" },
  { value: "tarjeta_credito", label: "Tarjeta crédito" },
  { value: "credito_proveedor", label: "Crédito proveedor" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "paypal", label: "PayPal" },
  { value: "otro", label: "Otro" },
] as const;

type PaymentMethodType = (typeof paymentMethodTypes)[number]["value"];

type PaymentMethodRecord = {
  id: string;
  name: string;
  type: PaymentMethodType;
  owner_name: string | null;
  last_four: string | null;
  bank_name: string | null;
  notes: string | null;
  active: boolean;
};

type PaymentMethodFormState = {
  name: string;
  type: PaymentMethodType;
  owner_name: string;
  last_four: string;
  bank_name: string;
  notes: string;
  active: boolean;
};

const emptyForm: PaymentMethodFormState = {
  name: "",
  type: "efectivo",
  owner_name: "",
  last_four: "",
  bank_name: "",
  notes: "",
  active: true,
};

function cleanOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeValue(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

function typeLabel(type: PaymentMethodType) {
  return (
    paymentMethodTypes.find((paymentType) => paymentType.value === type)
      ?.label ?? type
  );
}

function isCardType(type: PaymentMethodType) {
  return type === "tarjeta_debito" || type === "tarjeta_credito";
}

function paymentMethodLabel(paymentMethod: PaymentMethodRecord) {
  if (isCardType(paymentMethod.type)) {
    const cardKind =
      paymentMethod.type === "tarjeta_credito" ? "Crédito" : "Débito";
    const bankName = paymentMethod.bank_name?.trim();
    const lastFour = paymentMethod.last_four?.trim();

    return [
      "Tarjeta",
      bankName,
      cardKind,
      lastFour ? `****${lastFour}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return paymentMethod.name;
}

function paymentMethodMatchesSearch(
  paymentMethod: PaymentMethodRecord,
  searchValue: string,
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    paymentMethod.name,
    paymentMethod.type,
    typeLabel(paymentMethod.type),
    paymentMethod.owner_name,
    paymentMethod.bank_name,
    paymentMethod.last_four,
  ].some((value) => normalizeValue(value).includes(normalizedSearch));
}

export function MetodosPagoClient() {
  const supabase = useMemo(() => createClient(), []);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editingPaymentMethodId, setEditingPaymentMethodId] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<PaymentMethodFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<string | null>(
    null,
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRecord[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadPaymentMethods = useCallback(
    async (activeCompanyId: string, searchValue: string) => {
      setErrorMessage("");

      const { data, error } = await supabase
        .from("payment_methods")
        .select("id,name,type,owner_name,last_four,bank_name,notes,active")
        .eq("company_id", activeCompanyId)
        .order("name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setPaymentMethods([]);
        return;
      }

      setPaymentMethods(
        ((data ?? []) as PaymentMethodRecord[]).filter((paymentMethod) =>
          paymentMethodMatchesSearch(paymentMethod, searchValue),
        ),
      );
    },
    [supabase],
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

      setCompanyId(profile.company_id);
      await loadPaymentMethods(profile.company_id, "");
      setIsLoading(false);
    }

    loadInitialData();
  }, [loadPaymentMethods, supabase]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      return;
    }

    setIsSearching(true);
    await loadPaymentMethods(companyId, search);
    setIsSearching(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setErrorMessage("El nombre del método de pago es obligatorio.");
      return;
    }

    if (form.last_four.trim() && !isCardType(form.type)) {
      setErrorMessage("Los últimos 4 dígitos solo aplican para tarjetas.");
      return;
    }

    if (form.last_four.trim() && !/^\d{4}$/.test(form.last_four.trim())) {
      setErrorMessage("Los últimos 4 dígitos deben contener solo números.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    const payload = {
      name,
      type: form.type,
      owner_name: cleanOptionalValue(form.owner_name),
      last_four: isCardType(form.type)
        ? cleanOptionalValue(form.last_four)
        : null,
      bank_name: cleanOptionalValue(form.bank_name),
      notes: cleanOptionalValue(form.notes),
      active: form.active,
    };

    const { error } = editingPaymentMethodId
      ? await supabase
          .from("payment_methods")
          .update(payload)
          .eq("id", editingPaymentMethodId)
          .eq("company_id", companyId)
      : await supabase
          .from("payment_methods")
          .insert({ ...payload, company_id: companyId });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingPaymentMethodId(null);
    setShowCreateForm(false);
    setForm(emptyForm);
    await loadPaymentMethods(companyId, search);
  }

  function startEditing(paymentMethod: PaymentMethodRecord) {
    setEditingPaymentMethodId(paymentMethod.id);
    setShowCreateForm(false);
    setForm({
      name: paymentMethod.name,
      type: paymentMethod.type,
      owner_name: paymentMethod.owner_name ?? "",
      last_four: paymentMethod.last_four ?? "",
      bank_name: paymentMethod.bank_name ?? "",
      notes: paymentMethod.notes ?? "",
      active: paymentMethod.active,
    });
    setErrorMessage("");
  }

  function cancelEditing() {
    setEditingPaymentMethodId(null);
    setForm(emptyForm);
    setErrorMessage("");
  }

  function toggleCreateForm() {
    if (showCreateForm) {
      setShowCreateForm(false);
      setForm(emptyForm);
      setErrorMessage("");
      return;
    }

    setEditingPaymentMethodId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setShowCreateForm(true);
  }

  function cancelCreate() {
    setShowCreateForm(false);
    setForm(emptyForm);
    setErrorMessage("");
  }

  async function togglePaymentMethodStatus(paymentMethod: PaymentMethodRecord) {
    if (!companyId) {
      setErrorMessage("No se encontró la empresa del usuario.");
      return;
    }

    const nextActiveStatus = !paymentMethod.active;
    const actionLabel = nextActiveStatus ? "reactivar" : "desactivar";
    const shouldContinue = window.confirm(
      `¿Quieres ${actionLabel} el método "${paymentMethodLabel(
        paymentMethod,
      )}"?`,
    );

    if (!shouldContinue) {
      return;
    }

    setIsUpdatingStatusId(paymentMethod.id);
    setErrorMessage("");

    const { error } = await supabase
      .from("payment_methods")
      .update({ active: nextActiveStatus })
      .eq("id", paymentMethod.id)
      .eq("company_id", companyId);

    setIsUpdatingStatusId(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadPaymentMethods(companyId, search);
  }

  const currentTypeAllowsLastFour = isCardType(form.type);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div
          className={`${editingPaymentMethodId || showCreateForm ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}
        >
          <div>
            <h3 className="text-lg font-semibold text-stone-950">
              {editingPaymentMethodId
                ? "Editar método de pago"
                : "Nuevo método de pago"}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Los métodos se guardan automáticamente en la empresa de tu perfil.
            </p>
          </div>
          {editingPaymentMethodId ? (
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
              {showCreateForm ? "Ocultar formulario" : "Nuevo método de pago"}
            </button>
          )}
        </div>

        {editingPaymentMethodId || showCreateForm ? (
          <form
            className="grid gap-4 rounded-lg border border-stone-200 p-4 lg:grid-cols-2"
            onSubmit={handleSubmit}
          >
            <div className="lg:col-span-2">
              <h4 className="text-base font-semibold text-stone-950">
                {editingPaymentMethodId
                  ? "Editar método de pago"
                  : "Nuevo registro"}
              </h4>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="name"
              >
                Nombre
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id="name"
                name="name"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
                required
                type="text"
                value={form.name}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="type"
              >
                Tipo
              </label>
              <select
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id="type"
                name="type"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    last_four: isCardType(
                      event.target.value as PaymentMethodType,
                    )
                      ? currentForm.last_four
                      : "",
                    type: event.target.value as PaymentMethodType,
                  }))
                }
                value={form.type}
              >
                {paymentMethodTypes.map((paymentType) => (
                  <option key={paymentType.value} value={paymentType.value}>
                    {paymentType.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="owner_name"
              >
                Titular
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id="owner_name"
                name="owner_name"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    owner_name: event.target.value,
                  }))
                }
                type="text"
                value={form.owner_name}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="bank_name"
              >
                Banco
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving}
                id="bank_name"
                name="bank_name"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    bank_name: event.target.value,
                  }))
                }
                placeholder="Ej. BBVA"
                type="text"
                value={form.bank_name}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="last_four"
              >
                Últimos 4 dígitos
              </label>
              <input
                className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100"
                disabled={isLoading || isSaving || !currentTypeAllowsLastFour}
                id="last_four"
                inputMode="numeric"
                maxLength={4}
                name="last_four"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    last_four: event.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
                pattern="\d{4}"
                placeholder={
                  currentTypeAllowsLastFour ? "1234" : "Solo para tarjetas"
                }
                type="text"
                value={form.last_four}
              />
            </div>

            <div className="flex items-center gap-3 rounded-md border border-stone-200 px-3 py-3">
              <input
                checked={form.active}
                className="h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700"
                disabled={isLoading || isSaving}
                id="active"
                name="active"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    active: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <label
                className="text-sm font-medium text-stone-800"
                htmlFor="active"
              >
                Método activo
              </label>
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
                name="notes"
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    notes: event.target.value,
                  }))
                }
                value={form.notes}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-2">
              <button
                className="h-11 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-stone-300"
                disabled={isLoading || isSaving}
                type="submit"
              >
                {isSaving
                  ? "Guardando..."
                  : editingPaymentMethodId
                    ? "Guardar cambios"
                    : "Crear método"}
              </button>
              {!editingPaymentMethodId ? (
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
                Métodos registrados
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                Busca por nombre, tipo, titular, banco o últimos 4 dígitos.
              </p>
            </div>

            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={handleSearch}
            >
              <label className="sr-only" htmlFor="payment-method-search">
                Buscar método de pago
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                />
                <input
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-stone-100 sm:w-80"
                  disabled={isLoading || isSearching}
                  id="payment-method-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar métodos"
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

        {errorMessage ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-5 text-sm font-medium text-stone-600">
            Cargando métodos de pago...
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="p-5 text-sm text-stone-600">
            No hay métodos de pago para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th className="px-5 py-3">Método</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Titular</th>
                  <th className="px-5 py-3">Banco</th>
                  <th className="px-5 py-3">Últimos 4</th>
                  <th className="px-5 py-3">Notas</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {paymentMethods.map((paymentMethod) => (
                  <tr key={paymentMethod.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-stone-950">
                        {paymentMethodLabel(paymentMethod)}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        {paymentMethod.name}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {typeLabel(paymentMethod.type)}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {paymentMethod.owner_name || "Sin titular"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {paymentMethod.bank_name || "Sin banco"}
                    </td>
                    <td className="px-5 py-4 text-stone-700">
                      {paymentMethod.last_four
                        ? `****${paymentMethod.last_four}`
                        : "No aplica"}
                    </td>
                    <td className="max-w-xs px-5 py-4 text-stone-700">
                      <span className="line-clamp-2">
                        {paymentMethod.notes || "Sin notas"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold ${
                          paymentMethod.active
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
                        }`}
                      >
                        {paymentMethod.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="h-9 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isSaving || isUpdatingStatusId === paymentMethod.id
                          }
                          onClick={() => startEditing(paymentMethod)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className={`h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            paymentMethod.active
                              ? "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
                          }`}
                          disabled={
                            isSaving || isUpdatingStatusId === paymentMethod.id
                          }
                          onClick={() => togglePaymentMethodStatus(paymentMethod)}
                          type="button"
                        >
                          {isUpdatingStatusId === paymentMethod.id
                            ? "Actualizando..."
                            : paymentMethod.active
                              ? "Desactivar"
                              : "Reactivar"}
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
