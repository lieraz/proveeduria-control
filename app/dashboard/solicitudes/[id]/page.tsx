import { DashboardShell } from "../../dashboard-shell";
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
      description="Revisa la solicitud del cliente y administra las partidas solicitadas antes de preparar cotizaciones."
      eyebrow="Comercial"
      title="Detalle de solicitud"
    >
      <SolicitudDetalleClient requestId={id} />
    </DashboardShell>
  );
}
