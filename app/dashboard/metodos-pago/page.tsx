import { DashboardShell } from "../dashboard-shell";
import { MetodosPagoClient } from "./metodos-pago-client";

export default function MetodosPagoPage() {
  return (
    <DashboardShell
      description="Administra efectivo, transferencias, tarjetas y otros métodos de pago disponibles para la operación."
      eyebrow="Catálogo"
      title="Métodos de pago"
    >
      <MetodosPagoClient />
    </DashboardShell>
  );
}
