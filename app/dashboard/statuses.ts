export const INTERNAL_ORDER_LINE_STATUSES = [
  "pendiente",
  "por comprar",
  "comprado",
  "recibido",
  "entregado",
  "cancelado",
] as const;

export const PURCHASE_RUN_STATUSES = [
  "pendiente",
  "asignada",
  "en camino",
  "comprado",
  "recogido",
  "en tránsito",
  "entregado en oficina",
  "entregado en domicilio",
  "cancelado",
] as const;

export const PURCHASE_RUN_LINE_STATUSES = [
  "pendiente",
  "comprado",
  "no disponible",
  "sustituido",
  "cancelado",
] as const;

export const DELIVERY_STATUSES = [
  "pendiente",
  "parcial",
  "entregado",
] as const;

export const DELIVERY_TYPES = ["total", "parcial", "manual"] as const;
