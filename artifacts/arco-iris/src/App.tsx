import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/dashboard";
import Professionals from "@/pages/professionals";
import ProfessionalDetail from "@/pages/professional-detail";
import Patients from "@/pages/patients";
import PatientDetail from "@/pages/patient-detail";
import Reception from "@/pages/reception";
import WaitingList from "@/pages/waiting-list";
import Agenda from "@/pages/agenda";
import AgendaProfissionais from "@/pages/agenda-profissionais";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/agenda-profissionais" component={AgendaProfissionais} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/professionals" component={Professionals} />
            <Route path="/professionals/:id" component={ProfessionalDetail} />
            <Route path="/patients" component={Patients} />
            <Route path="/patients/:id" component={PatientDetail} />
            <Route path="/reception" component={Reception} />
            <Route path="/waiting-list" component={WaitingList} />
            <Route path="/agenda" component={Agenda} />
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
