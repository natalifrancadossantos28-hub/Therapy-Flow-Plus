import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/Layout";
import AdminGuard from "@/components/AdminGuard";

// ── Lazy-loaded pages (code-splitting) ──────────────────────────────────────
const Portal = lazy(() => import("@/pages/portal"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Professionals = lazy(() => import("@/pages/professionals"));
const ProfessionalDetail = lazy(() => import("@/pages/professional-detail"));
const Patients = lazy(() => import("@/pages/patients"));
const PatientDetail = lazy(() => import("@/pages/patient-detail"));
const Reception = lazy(() => import("@/pages/reception"));
const WaitingList = lazy(() => import("@/pages/waiting-list"));
const Agenda = lazy(() => import("@/pages/agenda"));
const AgendaMensal = lazy(() => import("@/pages/agenda-mensal"));
const AgendaProfissionais = lazy(() => import("@/pages/agenda-profissionais"));
const GestaoContratos = lazy(() => import("@/pages/gestao-contratos"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/portal" component={Portal} />
        <Route path="/agenda-profissionais" component={AgendaProfissionais} />
        <Route>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/">{() => <AdminGuard><Dashboard /></AdminGuard>}</Route>
                <Route path="/professionals">{() => <AdminGuard><Professionals /></AdminGuard>}</Route>
                <Route path="/professionals/:id">{(params) => <AdminGuard><ProfessionalDetail /></AdminGuard>}</Route>
                <Route path="/patients">{() => <AdminGuard><Patients /></AdminGuard>}</Route>
                <Route path="/patients/:id">{(params) => <AdminGuard><PatientDetail /></AdminGuard>}</Route>
                <Route path="/reception">{() => <AdminGuard requiredScope="reception"><Reception /></AdminGuard>}</Route>
                <Route path="/waiting-list">{() => <AdminGuard requiredScope="reception"><WaitingList /></AdminGuard>}</Route>
                <Route path="/agenda" component={Agenda} />
                <Route path="/agenda-mensal">{() => <AdminGuard><AgendaMensal /></AdminGuard>}</Route>
                <Route path="/gestao-contratos">{() => <AdminGuard><GestaoContratos /></AdminGuard>}</Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Layout>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
