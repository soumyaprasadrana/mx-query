/**
 * mxQuery shell: tenant lifecycle (picker / setup / warmup) plus the four
 * studio screens (home / wizard / builder / library).
 *
 * The URL is the source of truth (`src/lib/nav.ts`). Tenant id stays in
 * localStorage because it is a session, not a shareable resource. Wizard,
 * builder, and library stay mounted after first visit (hidden, not unmounted)
 * so browser Back restores in-progress work. Builder live-execute pauses
 * while that layer is hidden.
 */
import { ReactNode, useEffect, useState } from "react";
import Atmosphere from "./components/Atmosphere";
import Builder from "./components/builder/Builder";
import TenantPicker from "./components/TenantPicker";
import TenantSetup from "./components/TenantSetup";
import Warmup from "./components/Warmup";
import WizardHome from "./components/wizard/WizardHome";
import Wizard from "./components/wizard/Wizard";
import QueryLibrary from "./components/library/QueryLibrary";
import ThemeToggle from "./components/ThemeToggle";
import AdminButton from "./components/settings/AdminButton";
import TourPrompt from "./components/tour/TourPrompt";
import Walkthrough from "./components/tour/Walkthrough";
import { readTourMark, TourId } from "./lib/tour";
import { applyTitle, AppRoute, currentRoute, go, subscribe } from "./lib/nav";
import { getTenant, SavedQueryListItem } from "./api";
import { QueryDraft } from "./lib/queryDraft";
import { Tenant } from "./types";

const STORAGE_KEY = "mqb.tenantId";

type Phase = "loading" | "picker" | "setup" | "warmup" | "ready";
type Studio = "home" | "wizard" | "builder" | "library";
type ViewMode = "builder" | "results" | "report";
type Mounted = { wizard: boolean; builder: boolean; library: boolean };

function studioOf(route: AppRoute): Studio {
  if (route.screen === "wizard" || route.screen === "builder" || route.screen === "library") {
    return route.screen;
  }
  return "home";
}

function StudioLayer({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="studio-layer" hidden={!show} aria-hidden={!show}>
      {children}
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [route, setRoute] = useState<AppRoute>(currentRoute);
  const [draft, setDraft] = useState<QueryDraft | null>(null);
  const [autoExecute, setAutoExecute] = useState(false);
  const [importPayload, setImportPayload] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("builder");
  const [loadedQuery, setLoadedQuery] = useState<SavedQueryListItem | null>(null);
  const [builderNonce, setBuilderNonce] = useState(0);
  const [warmupKind, setWarmupKind] = useState<"create" | "resync">("create");
  const [tourAsk, setTourAsk] = useState(() => readTourMark() == null);
  const [tourRun, setTourRun] = useState<TourId | null>(null);
  const [mounted, setMounted] = useState<Mounted>({ wizard: false, builder: false, library: false });

  const studio = studioOf(route);

  function resetBuilder(opts?: {
    draft?: QueryDraft | null;
    autoExecute?: boolean;
    importPayload?: string | null;
    viewMode?: ViewMode;
    loadedQuery?: SavedQueryListItem | null;
  }) {
    setDraft(opts?.draft ?? null);
    setAutoExecute(!!opts?.autoExecute);
    setImportPayload(opts?.importPayload ?? null);
    setViewMode(opts?.viewMode ?? "builder");
    setLoadedQuery(opts?.loadedQuery ?? null);
    setBuilderNonce((n) => n + 1);
  }

  function forgetStudios() {
    setMounted({ wizard: false, builder: false, library: false });
    resetBuilder();
  }

  function goBuilder() {
    resetBuilder();
    go({ screen: "builder" });
  }

  function goHome() {
    go({ screen: "home" });
  }

  function startTour(id: TourId) {
    setTourAsk(false);
    resetBuilder();
    go({ screen: "home" });
    setTourRun(id);
  }

  function goStudio(id: TourId) {
    resetBuilder();
    go({ screen: id });
  }

  useEffect(() => subscribe(() => setRoute(currentRoute())), []);

  useEffect(() => {
    applyTitle(route);
  }, [route]);

  useEffect(() => {
    const studioAttr = phase !== "ready" ? phase : studio;
    document.documentElement.dataset.studio = studioAttr;
  }, [phase, studio]);

  // Keep wizard / builder / library alive after first visit so Back restores them.
  useEffect(() => {
    if (phase !== "ready") return;
    if (studio === "wizard" || studio === "builder" || studio === "library") {
      setMounted((m) => (m[studio] ? m : { ...m, [studio]: true }));
    }
  }, [phase, studio]);

  useEffect(() => {
    if (route.screen === "builder" && route.view === "report") setViewMode("report");
  }, [route]);

  // Browser Back from /setup returns to the picker without a dedicated button path.
  useEffect(() => {
    if (phase === "loading" || phase === "warmup" || phase === "ready") return;
    if (route.screen === "setup" && phase !== "setup") setPhase("setup");
    if (route.screen !== "setup" && phase === "setup") setPhase("picker");
  }, [route, phase]);

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    const boot = currentRoute();
    if (!savedId) {
      if (boot.screen === "setup") {
        setPhase("setup");
      } else {
        setPhase("picker");
        if (boot.screen !== "home") go({ screen: "home" }, "replace");
      }
      return;
    }
    getTenant(savedId)
      .then((t) => {
        setTenant(t);
        setPhase("warmup");
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setPhase("picker");
        if (boot.screen !== "home" && boot.screen !== "setup") go({ screen: "home" }, "replace");
      });
  }, []);

  function selectTenant(t: Tenant) {
    localStorage.setItem(STORAGE_KEY, t.id);
    setTenant(t);
    setWarmupKind("create");
    setPhase("warmup");
  }

  function handleCancelled() {
    localStorage.removeItem(STORAGE_KEY);
    setTenant(null);
    forgetStudios();
    setPhase("picker");
    go({ screen: "home" }, "replace");
  }

  function handleWarmupCancel() {
    if (warmupKind === "resync") {
      setPhase("ready");
      return;
    }
    handleCancelled();
  }

  function beginResync() {
    setWarmupKind("resync");
    setPhase("warmup");
  }

  function switchTenant() {
    localStorage.removeItem(STORAGE_KEY);
    setTenant(null);
    forgetStudios();
    setPhase("picker");
    go({ screen: "home" }, "replace");
  }

  function onWarmupReady() {
    setPhase("ready");
    const here = currentRoute();
    if (here.screen === "setup") go({ screen: "home" }, "replace");
  }

  let view: ReactNode = null;
  if (phase === "picker") {
    view = (
      <>
        <div className="theme-float"><AdminButton /><ThemeToggle /></div>
        <TenantPicker
          onSelect={selectTenant}
          onAddNew={() => {
            go({ screen: "setup" });
            setPhase("setup");
          }}
        />
      </>
    );
  } else if (phase === "setup") {
    view = (
      <>
        <div className="theme-float"><AdminButton /><ThemeToggle /></div>
        <TenantSetup
          onCreated={selectTenant}
          onBack={() => {
            go({ screen: "home" }, "replace");
            setPhase("picker");
          }}
        />
      </>
    );
  } else if (phase === "warmup" && tenant) {
    view = (
      <>
        <div className="theme-float"><AdminButton /><ThemeToggle /></div>
        <Warmup tenant={tenant} variant={warmupKind} onReady={onWarmupReady} onCancel={handleWarmupCancel} />
      </>
    );
  } else if (tenant && phase === "ready") {
    view = (
      <>
        <StudioLayer show={studio === "home"}>
          <WizardHome
            tenant={tenant}
            onWizard={() => go({ screen: "wizard" })}
            onBuilder={goBuilder}
            onLibrary={() => go({ screen: "library" })}
            onSwitchTenant={switchTenant}
            onResync={beginResync}
            onTour={() => startTour("builder")}
          />
        </StudioLayer>
        {mounted.library && (
          <StudioLayer show={studio === "library"}>
            <QueryLibrary
              tenant={tenant}
              onHome={goHome}
              onSwitchTenant={switchTenant}
              onResync={beginResync}
              onOpen={(query, mode) => {
                resetBuilder({
                  importPayload: JSON.stringify(query.payload),
                  viewMode: mode,
                  autoExecute: mode !== "builder",
                  loadedQuery: query,
                });
                go({ screen: "builder", view: mode === "report" ? "report" : undefined });
              }}
            />
          </StudioLayer>
        )}
        {mounted.wizard && (
          <StudioLayer show={studio === "wizard"}>
            <Wizard
              tenant={tenant}
              onHome={goHome}
              onResync={beginResync}
              onOpenBuilder={(next, execute) => {
                resetBuilder({ draft: next, autoExecute: !!execute });
                go({ screen: "builder" });
              }}
            />
          </StudioLayer>
        )}
        {mounted.builder && (
          <StudioLayer show={studio === "builder"}>
            <Builder
              key={builderNonce}
              tenant={tenant}
              paused={studio !== "builder"}
              onSwitchTenant={switchTenant}
              onResync={beginResync}
              onHome={goHome}
              initialDraft={draft}
              autoExecute={autoExecute}
              initialImport={importPayload}
              viewMode={viewMode}
              initialLoaded={loadedQuery}
            />
          </StudioLayer>
        )}
      </>
    );
  } else if (phase !== "loading") {
    view = (
      <TenantPicker
        onSelect={selectTenant}
        onAddNew={() => {
          go({ screen: "setup" });
          setPhase("setup");
        }}
      />
    );
  }

  return (
    <>
      <Atmosphere />
      {view}
      {tenant && phase === "ready" && studio === "home" && tourAsk && !tourRun && (
        <TourPrompt
          replay={readTourMark() != null}
          onPick={() => startTour("builder")}
          onSkip={() => setTourAsk(false)}
        />
      )}
      {tourRun && (
        <Walkthrough tourId={tourRun} onGo={goStudio} onFinished={() => setTourRun(null)} />
      )}
    </>
  );
}
