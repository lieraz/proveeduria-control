import { DashboardShell } from "../../dashboard-shell";
import { ProcessTrace } from "../../process-trace";
import { FacturacionDetalleClient } from "./facturacion-detalle-client";

type FacturacionDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function FacturacionDetallePage({
  params,
}: FacturacionDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Consulta, actualiza, imprime y adjunta archivos de seguimiento fiscal y cobranza."
      eyebrow="Compras"
      title="Detalle de facturación"
    >
      <ProcessTrace startingEntityId={id} startingEntityType="billing" />
      <FacturacionDetalleClient billingId={id} />
    </DashboardShell>
  );
}
