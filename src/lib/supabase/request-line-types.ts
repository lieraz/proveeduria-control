export type ClientRequestLineRecord = {
  id: string;
  company_id: string;
  client_request_id: string | null;
  product_id: string | null;
  brand: string | null;
  description: string | null;
  model: string | null;
  quantity: number | string | null;
  unit: string | null;
  priority: string | null;
  status: string | null;
  notes: string | null;
};

export type ClientRequestLineInsert = {
  company_id: string;
  client_request_id: string;
  product_id: string | null;
  brand: string | null;
  description: string;
  model: string | null;
  quantity: number;
  unit: string;
  priority: string;
  status: string;
  notes: string | null;
};

export type SupplierOfferRecord = {
  id: string;
  company_id: string;
  client_request_line_id: string | null;
  supplier_id: string | null;
  brand: string | null;
  model: string | null;
  supplier_description: string | null;
  unit_price: number | string | null;
  currency: string | null;
  lead_time_days: number | string | null;
  minimum_order_quantity: number | string | null;
  valid_until: string | null;
  notes: string | null;
  is_selected: boolean | null;
};

export type SupplierOfferInsert = {
  company_id: string;
  client_request_line_id: string;
  supplier_id: string;
  brand: string | null;
  model: string | null;
  supplier_description: string | null;
  unit_price: number;
  currency: string;
  lead_time_days: number | null;
  minimum_order_quantity: number | null;
  valid_until: string | null;
  notes: string | null;
  is_selected?: boolean;
};
