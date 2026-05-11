import { DashboardShell } from "../dashboard-shell";
import { SolicitudesClient } from "./solicitudes-client";

export default function SolicitudesPage() {
  return (
    <DashboardShell
      description="Administra solicitudes de clientes, contactos, urgencias y estado de atención por empresa."
      eyebrow="Operación"
      title="Solicitudes"
    >
      <SolicitudesClient />
    </DashboardShell>
  );
}
