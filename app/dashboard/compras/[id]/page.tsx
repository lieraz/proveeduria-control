import { DashboardShell } from "../../dashboard-shell";
import { ProcessTrace } from "../../process-trace";
import { CompraDetalleClient } from "./compra-detalle-client";

type CompraDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompraDetallePage({ params }: CompraDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Edita el encabezado de compra y controla las partidas, costos reales y variación."
      eyebrow="Compras"
      title="Detalle de compra"
    >
      <ProcessTrace startingEntityId={id} startingEntityType="purchase_run" />
      <CompraDetalleClient purchaseRunId={id} />
    </DashboardShell>
  );
}
