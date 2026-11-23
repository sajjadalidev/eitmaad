// Order state transitions and corrections (blueprint section 3.3).

import { TERMINAL_STATUSES, type OrderStatus } from "./domain";
import { err, ok, type Result } from "./result";

export const CORRECTION_WINDOW_DAYS = 14;

// PLACED and DISPATCHED are optional, so later states can be reached directly.
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ["DISPATCHED", "DELIVERED", "PARTIALLY_DELIVERED", "FAILED_DELIVERY", "RETURNED_POST_DELIVERY", "CANCELLED"],
  DISPATCHED: ["DELIVERED", "PARTIALLY_DELIVERED", "FAILED_DELIVERY", "RETURNED_POST_DELIVERY", "CANCELLED"],
  DELIVERED: ["RETURNED_POST_DELIVERY"],
  PARTIALLY_DELIVERED: ["RETURNED_POST_DELIVERY"],
  FAILED_DELIVERY: [],
  RETURNED_POST_DELIVERY: [],
  CANCELLED: [],
};

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface TransitionInput {
  // Current order state, or null for a new order.
  current: { status: OrderStatus; lastTerminalAt: Date | null } | null;
  next: OrderStatus;
  isCorrection: boolean;
  now: Date;
}

export type TransitionError = "INVALID_TRANSITION" | "CORRECTION_WINDOW_EXPIRED";

export function checkTransition(input: TransitionInput): Result<void, TransitionError> {
  const { current, next, isCorrection, now } = input;

  if (current === null) {
    // A correction needs an existing order. Any first status is allowed.
    return isCorrection ? err("INVALID_TRANSITION") : ok(undefined);
  }

  if (isCorrection) {
    // Corrections change a terminal outcome to another terminal outcome.
    if (!isTerminal(current.status) || current.lastTerminalAt === null || !isTerminal(next)) {
      return err("INVALID_TRANSITION");
    }
    const ageMs = now.getTime() - current.lastTerminalAt.getTime();
    if (ageMs > CORRECTION_WINDOW_DAYS * 86_400_000) return err("CORRECTION_WINDOW_EXPIRED");
    return ok(undefined);
  }

  return ALLOWED_TRANSITIONS[current.status].includes(next) ? ok(undefined) : err("INVALID_TRANSITION");
}
