import { DashboardShell } from "../../dashboard-shell";
import { OrdenDetalleClient } from "./orden-detalle-client";

type OrdenDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrdenDetallePage({ params }: OrdenDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Revisa partidas internas y genera corridas de compra o recolección agrupadas por proveedor."
      eyebrow="Operación"
      title="Detalle de orden"
    >
      <OrdenDetalleClient orderId={id} />
    </DashboardShell>
  );
}
