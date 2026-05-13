import { DashboardShell } from "../dashboard-shell";
import { CotizacionesClient } from "./cotizaciones-client";

export default function CotizacionesPage() {
  return (
    <DashboardShell
      description="Administra cotizaciones por cliente, solicitud, vigencia, estado y total seleccionado."
      eyebrow="Comercial"
      title="Cotizaciones"
    >
      <CotizacionesClient />
    </DashboardShell>
  );
}
