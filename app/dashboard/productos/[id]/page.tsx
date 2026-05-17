import { DashboardShell } from "../../dashboard-shell";
import { ProductoDetalleClient } from "./producto-detalle-client";

type ProductoDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductoDetallePage({
  params,
}: ProductoDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Consulta el historial de costos registrados para este producto por proveedor."
      eyebrow="Catálogo"
      title="Detalle de producto"
    >
      <ProductoDetalleClient productId={id} />
    </DashboardShell>
  );
}
