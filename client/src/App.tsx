import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { type ComponentType, LazyExoticComponent, Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
const Home = lazy(() => import("./pages/Home"));
const EduconnectApp = lazy(() => import("./pages/EduconnectApp"));
const CertificateVerification = lazy(() => import("./pages/CertificateVerification"));
const SharedComparisonView = lazy(() => import("./pages/SharedComparisonView"));

function LazyPage({ Component }: { Component: LazyExoticComponent<ComponentType> }) {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading Educonnect…</div>}><Component /></Suspense>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"}>{() => <LazyPage Component={Home} />}</Route>
      <Route path={"/app"}>{() => <LazyPage Component={EduconnectApp} />}</Route>
      <Route path={"/verify/certificate/:token"}>{() => <LazyPage Component={CertificateVerification} />}</Route>
      <Route path={"/shared/comparison/:token"}>{() => <LazyPage Component={SharedComparisonView} />}</Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
