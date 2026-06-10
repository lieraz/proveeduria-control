import { DashboardShell } from "../../dashboard-shell";
import { EntregaDetalleClient } from "./entrega-detalle-client";

type EntregaDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EntregaDetallePage({
  params,
}: EntregaDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Consulta, edita, imprime y adjunta evidencias de lo entregado al cliente."
      eyebrow="Operación"
      title="Detalle de entrega"
    >
      <EntregaDetalleClient deliveryId={id} />
    </DashboardShell>
  );
}
