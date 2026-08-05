/**
 * Risk and position-sizing extension point.
 *
 * No martingale calculations or execution behavior belong in the initial build.
 */

export interface MartingalePolicy {
  readonly name: string;
}