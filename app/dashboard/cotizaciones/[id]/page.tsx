import { DashboardShell } from "../../dashboard-shell";
import { CotizacionDetalleClient } from "./cotizacion-detalle-client";

type CotizacionDetallePageProps = {
  params: Promise<{ id: string }>;
};

export default async function CotizacionDetallePage({
  params,
}: CotizacionDetallePageProps) {
  const { id } = await params;

  return (
    <DashboardShell
      description="Revisa la cotización, captura alternativas por proveedor y exporta la propuesta seleccionada."
      eyebrow="Comercial"
      title="Detalle de cotización"
    >
      <CotizacionDetalleClient quotationId={id} />
    </DashboardShell>
  );
}
