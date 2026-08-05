export type SignalDirection = "long" | "short";

export interface Signal {
  readonly symbol: string;
  readonly direction: SignalDirection;
  readonly createdAt: Date;
}