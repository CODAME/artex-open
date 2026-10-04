/**
 * Early access — the window in which a work is purchasable by Collection
 * members before it opens to everyone.
 *
 * This is a PROGRAM CAPABILITY, not a Print Club feature and not a Collection
 * feature: any program can configure a window, and the gate reads the window
 * plus the buyer's collector tier, never a `programType` and never an org slug.
 * Print Club is simply the first program to turn it on.
 *
 * Two rules shape the whole module and neither is negotiable:
 *
 * 1. **The window gates the purchase, never the work's existence.** Every phase
 *    is publicly visible and publicly described. A visitor always sees the work,
 *    who made it, and when they can buy it. Hiding the work would make the
 *    catalog lie and would deindex live pages, which is the soft-404 defect this
 *    codebase has already paid for once.
 * 2. **An org that opts out is not penalized.** `hours: 0` is a first-class
 *    configuration meaning "opens to everyone at once", treated exactly like the
 *    external-ticketing opt-out in R9 — never deprioritized, never hidden, never
 *    nudged.
 *
 * Neutrality (R5): the bounds here are the whole policy, so CODAME's own
 * programs are bound by the same 0-168 range as any other org. There is no
 * platform-owned escape hatch, which is what "enforced in config, not
 * convention" means.
 *
 * PURE and dependency-light like its neighbours: the platform API is standalone
 * `.mjs` and cannot import this package, so the logic is mirrored in
 * `.services/artex-platform-api/earlyAccess.mjs`. Keep the two (and their tests)
 * in sync.
 *
 * See docs/collection-tier-definition.md.
 */

/** The default window an org gets when it turns early access on. */
export const COLLECTION_EARLY_ACCESS_HOURS = 48;

/**
 * The longest window any program may set, CODAME's included. Seven days.
 *
 * 48 hours is the default because it spans time zones and a weekend without
 * meaningfully delaying general availability. A week is the ceiling: past that
 * the "opens to everyone" promise stops being credible to a visitor looking at
 * the work today.
 */
export const EARLY_ACCESS_MAX_HOURS = 168;

/** Zero is opting out, and is a valid, unpenalized configuration. */
export const EARLY_ACCESS_MIN_HOURS = 0;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Per-program early access configuration. */
export interface ProgramEarlyAccessConfig {
  /**
   * Hours before general availability that Collection members may purchase.
   * `0` means the program has opted out and everything opens to everyone at
   * once. Clamped to [0, 168]; see `normalizeEarlyAccessHours`.
   */
  hours: number;
}

/**
 * Where a work sits relative to its window.
 *
 * - `scheduled` — before even the member window. Nobody can buy yet.
 * - `early-access` — members can buy; everyone else sees the countdown.
 * - `open` — general availability. Everybody can buy.
 *
 * A work with no general-availability timestamp is `open`: that is the
 * behaviour of everything that shipped before this capability existed, so an
 * absent field never gates a sale that used to work.
 */
export type EarlyAccessPhase = "scheduled" | "early-access" | "open";

export interface EarlyAccessState {
  phase: EarlyAccessPhase;
  /** May THIS buyer purchase right now? */
  canPurchase: boolean;
  /** Epoch ms general availability begins, or null when there is no schedule. */
  opensToEveryoneAt: number | null;
  /** Epoch ms the member window begins, or null when there is no schedule. */
  opensToMembersAt: number | null;
  /**
   * Milliseconds until general availability, or null when already open or
   * unscheduled. What the public countdown renders.
   */
  msUntilOpen: number | null;
  /**
   * True when a window is configured AND currently running. The one flag a
   * surface needs to decide whether to explain early access at all — false for
   * an opted-out program, so its pages never mention a perk it does not offer.
   */
  windowActive: boolean;
}

export interface EarlyAccessInput {
  /**
   * Epoch ms at which the work opens to everyone. Null/absent = no schedule,
   * so it is simply open.
   */
  generalAvailabilityAt?: number | null;
  /** The owning program's configured window. Absent = opted out (0 hours). */
  earlyAccessHours?: number | null;
  /** Does this buyer hold an active collector-access tier? */
  hasCollectorTier?: boolean | null;
}

/**
 * Clamp an authored window to the published bounds.
 *
 * Anything unusable (absent, non-finite, negative) becomes 0 rather than the
 * 48-hour default: a program that has not configured early access has not opted
 * IN to it, and silently granting a window would gate purchases the org never
 * agreed to gate. The default belongs at the point an org turns the capability
 * on, not in the resolver.
 *
 * Fractional hours are floored, so a stored 47.9 can never round up past a
 * bound.
 */
export function normalizeEarlyAccessHours(hours: unknown): number {
  if (typeof hours !== "number" || !Number.isFinite(hours)) return EARLY_ACCESS_MIN_HOURS;
  const floored = Math.floor(hours);
  if (floored < EARLY_ACCESS_MIN_HOURS) return EARLY_ACCESS_MIN_HOURS;
  if (floored > EARLY_ACCESS_MAX_HOURS) return EARLY_ACCESS_MAX_HOURS;
  return floored;
}

/** Is this a window value a program may store? Used by server-side validation. */
export function isValidEarlyAccessHours(hours: unknown): boolean {
  return (
    typeof hours === "number"
    && Number.isInteger(hours)
    && hours >= EARLY_ACCESS_MIN_HOURS
    && hours <= EARLY_ACCESS_MAX_HOURS
  );
}

/** Has this program opted out of offering a window at all? */
export function isEarlyAccessOptedOut(config: ProgramEarlyAccessConfig | null | undefined): boolean {
  return normalizeEarlyAccessHours(config?.hours) === EARLY_ACCESS_MIN_HOURS;
}

/**
 * Resolve where a work sits in its window and whether this buyer may purchase.
 *
 * The buyer's tier only ever ADDS the early-access phase. It cannot open a
 * `scheduled` work, because a member's perk is going first, not going early
 * without limit.
 */
export function resolveEarlyAccessState(
  input: EarlyAccessInput,
  nowMs: number,
): EarlyAccessState {
  const openAt = input.generalAvailabilityAt;
  const scheduled = typeof openAt === "number" && Number.isFinite(openAt);

  // Nothing scheduled: open to everyone, exactly as before this capability.
  if (!scheduled) {
    return {
      phase: "open",
      canPurchase: true,
      opensToEveryoneAt: null,
      opensToMembersAt: null,
      msUntilOpen: null,
      windowActive: false,
    };
  }

  const hours = normalizeEarlyAccessHours(input.earlyAccessHours);
  const membersAt = openAt - hours * MS_PER_HOUR;

  if (nowMs >= openAt) {
    return {
      phase: "open",
      canPurchase: true,
      opensToEveryoneAt: openAt,
      opensToMembersAt: hours > 0 ? membersAt : null,
      msUntilOpen: null,
      windowActive: false,
    };
  }

  const msUntilOpen = openAt - nowMs;

  if (hours > 0 && nowMs >= membersAt) {
    return {
      phase: "early-access",
      canPurchase: input.hasCollectorTier === true,
      opensToEveryoneAt: openAt,
      opensToMembersAt: membersAt,
      msUntilOpen,
      windowActive: true,
    };
  }

  return {
    phase: "scheduled",
    canPurchase: false,
    opensToEveryoneAt: openAt,
    opensToMembersAt: hours > 0 ? membersAt : null,
    msUntilOpen,
    windowActive: false,
  };
}

/** Whole hours remaining until general availability, rounded up. For copy. */
export function hoursUntilOpen(state: EarlyAccessState): number | null {
  return state.msUntilOpen == null ? null : Math.ceil(state.msUntilOpen / MS_PER_HOUR);
}

/**
 * The public line a visitor reads about a scheduled work, or null when there is
 * nothing to say because it is already open.
 *
 * Never names a phase value, and never mentions Collection for a program that
 * opted out: a page must not advertise a perk its org does not offer. The work
 * itself is always visible; this only ever describes WHEN it can be bought.
 */
export function describeEarlyAccess(state: EarlyAccessState): string | null {
  if (state.phase === "open") return null;
  const hours = hoursUntilOpen(state);
  const when = hours == null ? "soon" : `in ${hours}h`;
  if (state.phase === "early-access") {
    return `Opens to everyone ${when}. ARTEX Collection members can buy it now.`;
  }
  return `Opens ${when}.`;
}

/**
 * The label for the buy action given the state. A blocked buyer gets a disabled
 * control that still says what it is waiting for, rather than a missing button
 * that reads as the work being gone.
 */
export function earlyAccessActionLabel(state: EarlyAccessState, openLabel: string): string {
  if (state.canPurchase) return openLabel;
  if (state.phase === "early-access") return "Members only for now";
  return "Not open yet";
}
