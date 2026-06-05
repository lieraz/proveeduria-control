import { DashboardShell } from "./dashboard-shell";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <DashboardShell
      description="Vista operativa de registros activos por módulo, con estados y últimos movimientos para coordinar el trabajo diario."
      title="Panel operativo"
    >
      <DashboardClient />
    </DashboardShell>
  );
}
