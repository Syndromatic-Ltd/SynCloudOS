/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "../DFXQueue";
import type { DFXQoS } from "../DFXQoS";
import { objectState } from "./queueState";

export interface ExecutionFrame {
  readonly chain: readonly DFXQueue[];
  readonly qos: DFXQoS;
  readonly barrier: boolean;
  readonly appId: string | null;
}
const stack: ExecutionFrame[] = [];
export function currentExecution(): ExecutionFrame | undefined { return stack.at(-1); }
export function withExecution<R>(frame: ExecutionFrame, run: () => R): R {
  stack.push(frame);
  try { return run(); } finally { stack.pop(); }
}
export function isExecuting(queue: DFXQueue, barrier = false): boolean {
  return stack.some(frame => frame.chain.includes(queue) && (!barrier || (
    !objectState(queue).global && (!objectState(queue).concurrent || (frame.chain[0] === queue && frame.barrier))
  )));
}
