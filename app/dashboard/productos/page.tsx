import { DashboardShell } from "../dashboard-shell";
import { ProductosClient } from "./productos-client";

export default function ProductosPage() {
  return (
    <DashboardShell
      description="Administra productos, unidades, categorías, estado e imágenes del catálogo por empresa."
      eyebrow="Catálogo"
      title="Productos"
    >
      <ProductosClient />
    </DashboardShell>
  );
}
