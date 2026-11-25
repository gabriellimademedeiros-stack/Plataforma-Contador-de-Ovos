import { Suspense } from "react";
import { requireUser } from "@/server/auth/session";
import { getFarm, getRefDate } from "@/server/repositories/reference";
import { countOpenAlerts } from "@/server/repositories/alerts";
import { getScope } from "@/server/services/context";
import { ROLE_LABEL } from "@/server/permissions";
import { SimulatedBanner } from "@/components/layout/simulated-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AssistantDock } from "@/components/assistant/assistant-dock";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [farm, refDate, scope] = await Promise.all([getFarm(), getRefDate(), getScope()]);
  const openAlerts = await countOpenAlerts(scope);
  return (
    <div className="min-h-screen bg-slate-50">
      <SimulatedBanner />
      <div className="flex">
        <Sidebar role={user.role} openAlerts={openAlerts} />
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="h-14 border-b bg-white" />}>
            <Topbar
              farmName={farm?.name ?? "Granja"}
              refDate={refDate}
              userName={user.name}
              roleLabel={ROLE_LABEL[user.role]}
              role={user.role}
              openAlerts={openAlerts}
            />
          </Suspense>
          <main className="mx-auto w-full max-w-[1600px] p-3 md:p-5">{children}</main>
        </div>
      </div>
      <AssistantDock canSeeFinance={scope.canSeeFinance} />
    </div>
  );
}
