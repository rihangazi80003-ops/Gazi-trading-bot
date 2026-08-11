export interface ChartWidgetConfig {
  containerId: string;
  defaultAsset: string;
  timeframe: string;
}

export class ChartWidget {
  private container: HTMLElement | null = null;
  private asset: string;
  private timeframe: string;

  constructor(config: ChartWidgetConfig) {
    this.asset = config.defaultAsset;
    this.timeframe = config.timeframe;
    this.container = document.getElementById(config.containerId);
  }

  public updateAsset(newAsset: string, newTimeframe: string) {
    this.asset = newAsset;
    this.timeframe = newTimeframe;
    this.render();
  }

  public render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="background: #111827; padding: 12px; border-radius: 8px; border: 1px solid #374151; color: #fff; margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 14px; font-weight: bold; color: #9333ea;">📊 Live Mini Chart (${this.timeframe})</span>
          <span style="font-size: 12px; background: #1f2937; padding: 2px 6px; border-radius: 4px; color: #10b981;">${this.asset} LIVE</span>
        </div>
        <div style="height: 120px; background: #0f172a; display: flex; align-items: flex-end; justify-content: space-around; padding: 8px; border-radius: 6px; border: 1px dashed #4b5563;">
          <div style="width: 8px; height: 40%; background: #ef4444; border-radius: 2px;"></div>
          <div style="width: 8px; height: 60%; background: #10b981; border-radius: 2px;"></div>
          <div style="width: 8px; height: 30%; background: #ef4444; border-radius: 2px;"></div>
          <div style="width: 8px; height: 80%; background: #10b981; border-radius: 2px;"></div>
          <div style="width: 8px; height: 50%; background: #10b981; border-radius: 2px;"></div>
          <div style="width: 8px; height: 70%; background: #ef4444; border-radius: 2px;"></div>
          <div style="width: 8px; height: 90%; background: #10b981; border-radius: 2px;"></div>
        </div>
        <div style="text-align: center; margin-top: 6px; font-size: 11px; color: #9ca3af;">
          Advanced AI Candle Signal Active (Ready for 30s Entry)
        </div>
      </div>
    `;
  }
}