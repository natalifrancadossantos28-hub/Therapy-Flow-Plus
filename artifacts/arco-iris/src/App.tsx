import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/Layout";
import AdminGuard from "@/components/AdminGuard";
import Portal from "@/pages/portal";
import Dashboard from "@/pages/dashboard";
import Professionals from "@/pages/professionals";
import ProfessionalDetail from "@/pages/professional-detail";
import Patients from "@/pages/patients";
import PatientDetail from "@/pages/patient-detail";
import Reception from "@/pages/reception";
import WaitingList from "@/pages/waiting-list";
import Agenda from "@/pages/agenda";
import AgendaMensal from "@/pages/agenda-mensal";
import AgendaProfissionais from "@/pages/agenda-profissionais";
import GestaoContratos from "@/pages/gestao-contratos";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/portal" component={Portal} />
      <Route path="/agenda-profissionais" component={AgendaProfissionais} />
      <Route>
        <Layout>
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
        </Layout>
      </Route>
    </Switch>
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
