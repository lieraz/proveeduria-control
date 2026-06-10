import { DashboardShell } from "../dashboard-shell";
import { FacturacionClient } from "./facturacion-client";

export default function FacturacionPage() {
  return (
    <DashboardShell
      description="Genera cobranza desde entregas reales y da seguimiento al estado operativo y fiscal de cada factura."
      eyebrow="Compras"
      title="Facturación / Cobranza"
    >
      <FacturacionClient />
    </DashboardShell>
  );
}
