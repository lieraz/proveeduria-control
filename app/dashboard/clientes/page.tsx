import { DashboardShell } from "../dashboard-shell";
import { ClientesClient } from "./clientes-client";

export default function ClientesPage() {
  return (
    <DashboardShell
      description="Administra clientes, términos de pago y notas internas por empresa."
      eyebrow="Catálogo"
      title="Clientes"
    >
      <ClientesClient />
    </DashboardShell>
  );
}
