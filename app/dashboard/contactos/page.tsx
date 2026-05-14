import { DashboardShell } from "../dashboard-shell";
import { ContactosClient } from "./contactos-client";

export default function ContactosPage() {
  return (
    <DashboardShell
      description="Administra los contactos de clientes y proveedores asociados a tu empresa."
      eyebrow="Catálogo"
      title="Contactos"
    >
      <ContactosClient />
    </DashboardShell>
  );
}
