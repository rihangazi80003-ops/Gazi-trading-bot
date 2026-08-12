import { useEffect, useState, type ComponentType } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

function _resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) {
          return;
        }
        const name = componentPath.split("/").pop()!;
        const comp = _resolveComponent(mod, name);
        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\nMake sure the file has at least one exported function component.`,
          );
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre style={{ color: "red", padding: "2rem", fontFamily: "system-ui" }}>
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function getPreviewExamplePath(): string {
  const basePath = getBasePath();
  return `${basePath}/preview/ComponentName`;
}

function Dashboard() {
  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-sm font-black tracking-tight text-violet-300 ring-1 ring-violet-400/20">
              BTZ
            </div>
            <div>
              <div className="text-sm font-bold tracking-[0.18em] text-slate-100">
                SIGNAL AI
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Broker intelligence workspace
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
            SYSTEM ONLINE
          </div>
        </header>

        <main className="flex-1 py-8">
          <div className="mb-8">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-300">
              Live command center
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Market signal workspace
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Monitor the selected assistant pair, read the current market
              structure, and review the next-candle pre-signal before entry.
            </p>
          </div>

          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["BROKER", "Pocket Option", "Connected"],
              ["MARKET TYPE", "Real Markets", "EUR/USD"],
              ["ASSISTANT PAIR", "EUR / USD", "M1 timeframe"],
            ].map(([label, value, meta]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-800 bg-[#0b1322] p-4 shadow-[0_12px_35px_rgba(0,0,0,0.18)]"
              >
                <div className="text-[10px] font-bold tracking-[0.16em] text-slate-500">
                  {label}
                </div>
                <div className="mt-2 text-sm font-bold text-slate-100">
                  {value}
                </div>
                <div className="mt-1 text-xs text-slate-500">{meta}</div>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-[#0c1424] to-[#0a111e] p-5 shadow-[0_18px_50px_rgba(76,29,149,0.16)]">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-violet-300">
                  SIGNAL ENGINE STATUS
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_#34d399]" />
                  <h2 className="text-xl font-black text-white">
                    GENERATE AI SIGNAL
                  </h2>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Candle structure, momentum, and indicator agreement are being
                  evaluated for the next 30-second entry window.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-violet-500 px-5 py-3 text-xs font-black tracking-[0.12em] text-white shadow-[0_8px_22px_rgba(139,92,246,0.3)] transition hover:bg-violet-400"
              >
                ANALYZE NOW
              </button>
            </div>
          </section>

          <section className="mt-6">
            <div id="btz-live-chart" aria-label="BTZ live market chart" />
          </section>
        </main>

        <footer className="border-t border-slate-800/80 py-4 text-xs text-slate-600">
          Simulated market feed active · Connect a broker candle adapter to
          replace the local feed.
        </footer>
      </div>
    </div>
  );
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const previewPath = getPreviewPath();

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  return <Dashboard />;
}

export default App;
