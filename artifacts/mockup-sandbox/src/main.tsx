import { createRoot } from "react-dom/client";
import App from "./App";
import { ChartWidget } from "../../../tbm-ai-bot-v2/src/chart-widget.ts";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

let liveChart: ChartWidget | null = null;

function mountLiveChart(): void {
  if (window.location.pathname.includes("/preview/")) {
    return;
  }

  const container = document.getElementById("btz-live-chart");
  if (!container) {
    window.requestAnimationFrame(mountLiveChart);
    return;
  }

  liveChart?.destroy();
  liveChart = new ChartWidget({
    containerId: "btz-live-chart",
    defaultAsset: "EUR/USD",
    timeframe: "M1",
  });
}

window.requestAnimationFrame(mountLiveChart);
