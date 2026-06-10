import { DashboardShell } from "../dashboard-shell";
import { EntregasClient } from "./entregas-client";

export default function EntregasPage() {
  return (
    <DashboardShell
      description="Registra lo que se entregó físicamente al cliente para que la facturación pueda partir de evidencias reales."
      eyebrow="Operación"
      title="Entregas"
    >
      <EntregasClient />
    </DashboardShell>
  );
}
