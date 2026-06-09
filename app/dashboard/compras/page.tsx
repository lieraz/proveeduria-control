import { DashboardShell } from "../dashboard-shell";
import { ComprasClient } from "./compras-client";

export default function ComprasPage() {
  return (
    <DashboardShell
      description="Administra compras, recolecciones y envíos por proveedor, con seguimiento de pago y entrega."
      eyebrow="Compras"
      title="Compras / Recolecciones"
    >
      <ComprasClient />
    </DashboardShell>
  );
}
