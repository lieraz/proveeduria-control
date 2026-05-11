import { DashboardShell } from "../dashboard-shell";
import { ProveedoresClient } from "./proveedores-client";

export default function ProveedoresPage() {
  return (
    <DashboardShell
      description="Administra proveedores, contactos, categorías, términos de pago y notas internas por empresa."
      eyebrow="Catálogo"
      title="Proveedores"
    >
      <ProveedoresClient />
    </DashboardShell>
  );
}
