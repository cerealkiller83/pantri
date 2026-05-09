import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { OfflineQueueRunner } from "./components/OfflineQueueRunner";
import { HouseholdProvider } from "./contexts/HouseholdContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuditPage } from "./pages/Audit";
import Home from "./pages/Home";
import { JoinHousehold } from "./pages/JoinHousehold";
import { NewHousehold } from "./pages/NewHousehold";
import { SettingsPage } from "./pages/Settings";
import { TrashPage } from "./pages/Trash";
import { KioskPage } from "./pages/Kiosk";
import { LoginPage } from "./pages/Login";
import ReceiptImport from "./pages/ReceiptImport";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route path="/households/new" component={NewHousehold} />
      <Route path="/households/:id/audit">
        {(params) => <AuditPage householdId={Number(params.id)} />}
      </Route>
      <Route path="/households/:id/settings">
        {(params) => <SettingsPage householdId={Number(params.id)} />}
      </Route>
      <Route path="/households/:id/trash">
        {(params) => <TrashPage householdId={Number(params.id)} />}
      </Route>
      <Route path="/households/:id/kiosk">
        {(params) => <KioskPage householdId={Number(params.id)} />}
      </Route>
      <Route path="/receipts/new" component={ReceiptImport} />
      <Route path="/join">{() => <JoinHousehold />}</Route>
      <Route path="/join/:code">
        {(params) => <JoinHousehold prefilledCode={params.code} />}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <HouseholdProvider>
          <TooltipProvider>
            <Toaster richColors closeButton />
            <OfflineQueueRunner />
            <Router />
          </TooltipProvider>
        </HouseholdProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
