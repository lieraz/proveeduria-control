import { DashboardShell } from "../../dashboard-shell";
import { TrazabilidadClient } from "./trazabilidad-client";

export default function TrazabilidadPage() {
  return (
    <DashboardShell
      description="Consulta y exporta la relación completa desde requerimientos hasta facturación."
      eyebrow="Reportes"
      title="Trazabilidad"
    >
      <TrazabilidadClient />
    </DashboardShell>
  );
}
