import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";

// Lazy-loaded pages — each becomes a separate JS chunk (~100-200KB each)
// Browser only downloads the chunk for the page the user actually visits
const Admin = lazy(() => import("@/pages/Admin"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Markets = lazy(() => import("@/pages/Markets"));
const LighterStrategies = lazy(() => import("@/pages/LighterStrategies"));
const Trades = lazy(() => import("@/pages/Trades"));
const Logs = lazy(() => import("@/pages/Logs"));
const Settings = lazy(() => import("@/pages/Settings"));
const AIAdvisor = lazy(() => import("@/pages/AIAdvisor"));
const ExtendedStrategies = lazy(() => import("@/pages/ExtendedStrategies"));
const EtherealStrategies = lazy(() => import("@/pages/EtherealStrategies"));
const NotFound = lazy(() => import("@/pages/not-found"));
const AppLayout = lazy(() =>
  import("@/components/layout/AppLayout").then((m) => ({ default: m.AppLayout }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground animate-pulse">Memuat...</div>
    </div>
  );
}

function AuthenticatedRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;

  if (!isAuthenticated) return <Login />;

  return (
    <Suspense fallback={<PageLoader />}>
      <AppLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/markets" component={Markets} />
          <Route path="/lighter" component={LighterStrategies} />
          <Route path="/trades" component={Trades} />
          <Route path="/logs" component={Logs} />
          <Route path="/settings" component={Settings} />
          <Route path="/ai-advisor" component={AIAdvisor} />
          <Route path="/extended" component={ExtendedStrategies} />
          <Route path="/ethereal" component={EtherealStrategies} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin">
        <Suspense fallback={<PageLoader />}>
          <Admin />
        </Suspense>
      </Route>
      <Route>
        <AuthenticatedRouter />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
