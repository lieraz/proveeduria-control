import { DashboardShell } from "../../dashboard-shell";
import { ProcessTrace } from "../../process-trace";
import { SolicitudDetalleClient } from "./solicitud-detalle-client";

type SolicitudDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function SolicitudDetallePage({
  params,
}: SolicitudDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Revisa el requerimiento del cliente y administra las partidas solicitadas antes de preparar cotizaciones."
      eyebrow="Comercial"
      title="Requerimiento"
    >
      <ProcessTrace startingEntityId={id} startingEntityType="client_request" />
      <SolicitudDetalleClient requestId={id} />
    </DashboardShell>
  );
}
