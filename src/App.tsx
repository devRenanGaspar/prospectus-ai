import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import { lazy, Suspense } from "react";
import LoadingState from "@/components/LoadingState";
import FrontendRouteObserver from "@/components/FrontendRouteObserver";
import TelemetryConsentGate from "@/components/TelemetryConsentGate";

import Login from "./pages/Login";
import CheckEmail from "./pages/CheckEmail";
import ResetPassword from "./pages/ResetPassword";
import Privacy from "./pages/Privacy";
import About from "./pages/About";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

// Lazy-loaded routes for performance
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const Context = lazy(() => import("./pages/Context"));
const LeadsBoard = lazy(() => import("./pages/LeadsBoard"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const BillingPlans = lazy(() => import("./pages/BillingPlans"));
const BillingUsage = lazy(() => import("./pages/BillingUsage"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPlans = lazy(() => import("./pages/AdminPlans"));
const AdminCosts = lazy(() => import("./pages/AdminCosts"));
const AdminWebhooks = lazy(() => import("./pages/AdminWebhooks"));
const AdminLeadPool = lazy(() => import("./pages/AdminLeadPool"));
const AdminMaintenance = lazy(() => import("./pages/AdminMaintenance"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminSystemHealth = lazy(() => import("./pages/AdminSystemHealth"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const SuspenseFallback = () => (
  <div className="p-6 lg:p-8">
    <LoadingState variant="page" count={4} />
  </div>
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <FrontendRouteObserver />
          <AuthProvider>
            {/* Inside the provider on purpose: it needs the profile to resolve
                the analytics consent. The route observer above cannot, which
                is why the collector holds its queue until this runs. */}
            <TelemetryConsentGate />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/check-email" element={<CheckEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/about" element={<About />} />
              <Route path="/lp" element={<Landing />} />
              <Route path="/vendas" element={<Landing />} />
              <Route path="/" element={<ProtectedRoute publicFallback={<Landing />}><AppShell /></ProtectedRoute>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Suspense fallback={<SuspenseFallback />}><Dashboard /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<SuspenseFallback />}><Settings /></Suspense>} />
                <Route path="context" element={<Suspense fallback={<SuspenseFallback />}><Context /></Suspense>} />
                <Route path="leads/board" element={<Suspense fallback={<SuspenseFallback />}><LeadsBoard /></Suspense>} />
                <Route path="leads/:leadId" element={<Suspense fallback={<SuspenseFallback />}><LeadDetail /></Suspense>} />
                <Route path="billing/plans" element={<Suspense fallback={<SuspenseFallback />}><BillingPlans /></Suspense>} />
                <Route path="billing/usage" element={<Suspense fallback={<SuspenseFallback />}><BillingUsage /></Suspense>} />
                <Route path="admin/users" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminUsers /></Suspense></ProtectedRoute>} />
                <Route path="admin/plans" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminPlans /></Suspense></ProtectedRoute>} />
                <Route path="admin/costs" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminCosts /></Suspense></ProtectedRoute>} />
                <Route path="admin/webhooks" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminWebhooks /></Suspense></ProtectedRoute>} />
                <Route path="admin/lead-pool" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminLeadPool /></Suspense></ProtectedRoute>} />
                <Route path="admin/maintenance" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminMaintenance /></Suspense></ProtectedRoute>} />
                <Route path="admin/announcements" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminAnnouncements /></Suspense></ProtectedRoute>} />
                <Route path="admin/system-health" element={<ProtectedRoute requiredRole="ADMIN"><Suspense fallback={<SuspenseFallback />}><AdminSystemHealth /></Suspense></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
