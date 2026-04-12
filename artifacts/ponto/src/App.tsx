import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import KioskPage from "./pages/kiosk";
import AdminLogin from "./pages/admin/login";
import EmployeesList from "./pages/admin/employees/index";
import EmployeeForm from "./pages/admin/employees/form";
import EmployeeBadge from "./pages/admin/employees/badge";
import RecordsList from "./pages/admin/records/index";
import SummaryList from "./pages/admin/summary/index";

import { AdminGuard } from "./components/AdminGuard";
import { AdminLayout } from "./components/AdminLayout";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Public Kiosk Route */}
      <Route path="/" component={KioskPage} />
      
      {/* Admin Login Route */}
      <Route path="/admin/login" component={AdminLogin} />
      
      {/* Protected Admin Routes */}
      <Route path="/admin/*">
        <AdminGuard>
          <AdminLayout>
            <Switch>
              <Route path="/admin/employees" component={EmployeesList} />
              <Route path="/admin/employees/new" component={EmployeeForm} />
              <Route path="/admin/employees/:id" component={EmployeeForm} />
              <Route path="/admin/employees/:id/badge" component={EmployeeBadge} />
              <Route path="/admin/records" component={RecordsList} />
              <Route path="/admin/summary" component={SummaryList} />
              <Route component={NotFound} />
            </Switch>
          </AdminLayout>
        </AdminGuard>
      </Route>

      <Route component={NotFound} />
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
