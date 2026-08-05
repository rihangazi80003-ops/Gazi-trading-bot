import type { Signal } from "../types/index.js";

/**
 * Future home for signal orchestration.
 * Trading and signal-generation logic is intentionally not implemented.
 */
export interface SignalEngine {
  evaluate(): Promise<Signal[]>;
}

export function createSignalEngine(): SignalEngine {
  return {
    async evaluate(): Promise<Signal[]> {
      return [];
    },
  };
}