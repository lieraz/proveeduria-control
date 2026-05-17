import { DashboardShell } from "../../dashboard-shell";
import { ProductosSinCatalogarClient } from "./productos-sin-catalogar-client";

export default function ProductosSinCatalogarPage() {
  return (
    <DashboardShell
      description="Revisa artículos cotizados por proveedores que todavía no están vinculados al catálogo."
      eyebrow="Catálogo"
      title="Productos sin catalogar"
    >
      <ProductosSinCatalogarClient />
    </DashboardShell>
  );
}
