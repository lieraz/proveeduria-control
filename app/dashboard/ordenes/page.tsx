import { DashboardShell } from "../dashboard-shell";
import { OrdenesClient } from "./ordenes-client";

export default function OrdenesPage() {
  return (
    <DashboardShell
      description="Crea órdenes internas desde cotizaciones o de forma manual, y prepara compras o recolecciones por proveedor."
      eyebrow="Operación"
      title="Órdenes"
    >
      <OrdenesClient />
    </DashboardShell>
  );
}
