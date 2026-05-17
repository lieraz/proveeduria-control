import { DashboardShell } from "../../dashboard-shell";
import { ProveedorDetalleClient } from "./proveedor-detalle-client";

type ProveedorDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProveedorDetallePage({
  params,
}: ProveedorDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Consulta los productos cotizados por este proveedor y su historial de costos."
      eyebrow="Catálogo"
      title="Detalle de proveedor"
    >
      <ProveedorDetalleClient supplierId={id} />
    </DashboardShell>
  );
}
