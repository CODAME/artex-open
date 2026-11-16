/**
 * Screen question bands: the paid allowance for "Ask the artist" on an
 * organization's verified venue screens (docs/pricing-business-model-v2.md,
 * R15; owner decision 2026-11-12). A question asked at a screen the org holds
 * is metered to the org instead of the artist, and counted against one monthly
 * allowance shared by every screen the org holds.
 *
 * Every org gets SCREEN_QUESTIONS_INCLUDED a month. A band raises that
 * allowance; it does not stack on top of it. When the allowance is spent the
 * screen offers a QR code so the visitor asks on their own phone instead.
 *
 * Band IDs are stable and never recycled (Stripe Prices key off them). This
 * file is the single source of truth for prices. The platform-api mirrors it in
 * .services/artex-platform-api/screenQuestions.mjs (it cannot import this
 * package); a test there asserts the two agree.
 */
export type ArtexScreenQuestionBandId = "screen_2500" | "screen_10k" | "screen_50k";

export interface ArtexScreenQuestionBand {
  id: ArtexScreenQuestionBandId;
  name: string;
  description: string;
  /** Questions per calendar month, shared by all of the org's screens. */
  questions: number;
  monthlyPriceCents: number;
  /** Annual = 10 x monthly (two months free, the platform-wide annual rule). */
  annualPriceCents: number;
  /**
   * False while a band is defined but not sold. The 50,000 band waits until
   * the chat runs on a model whose cost per question leaves it a margin
   * (owner decision 2026-11-12).
   */
  onSale: boolean;
}

/**
 * Whether an org can buy a band at all. Off until a Display can sign in by
 * itself (owner decision 2026-11-12): today a screen counts questions only
 * while a manager is signed in on it, so a band would sell an allowance most
 * screens cannot use. The included questions and the counting run regardless.
 */
export const SCREEN_QUESTION_CHECKOUT_OPEN = false;

/** Questions a month every org gets on its screens before buying a band. */
export const SCREEN_QUESTIONS_INCLUDED = 100;

/**
 * The most questions one screen answers in a day, whatever the allowance. An
 * abuse ceiling, not a price: it stops one screen, or a script posing as one,
 * from draining the month in an afternoon.
 */
export const SCREEN_QUESTIONS_PER_SCREEN_PER_DAY = 500;

const annual = (monthlyCents: number): number => monthlyCents * 10;

export const ARTEX_SCREEN_QUESTION_BANDS: Record<ArtexScreenQuestionBandId, ArtexScreenQuestionBand> = {
  screen_2500: {
    id: "screen_2500",
    name: "Screens 2,500",
    description: "Visitors can ask 2,500 questions a month across your screens",
    questions: 2_500,
    monthlyPriceCents: 2500,
    annualPriceCents: annual(2500),
    onSale: true,
  },
  screen_10k: {
    id: "screen_10k",
    name: "Screens 10,000",
    description: "Visitors can ask 10,000 questions a month across your screens",
    questions: 10_000,
    monthlyPriceCents: 7900,
    annualPriceCents: annual(7900),
    onSale: true,
  },
  screen_50k: {
    id: "screen_50k",
    name: "Screens 50,000",
    description: "Visitors can ask 50,000 questions a month across your screens",
    questions: 50_000,
    monthlyPriceCents: 29900,
    annualPriceCents: annual(29900),
    onSale: false,
  },
};

/** All band IDs, smallest first. */
export const SCREEN_QUESTION_BAND_IDS: ArtexScreenQuestionBandId[] = ["screen_2500", "screen_10k", "screen_50k"];

/** Narrow a stored or requested value to a known band id. */
export function isScreenQuestionBandId(value: unknown): value is ArtexScreenQuestionBandId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ARTEX_SCREEN_QUESTION_BANDS, value);
}

/**
 * The org's monthly screen allowance: the included questions, or its active
 * band if that is larger. An unknown band id counts as no band.
 */
export function resolveScreenQuestionAllowance(
  bandId: ArtexScreenQuestionBandId | (string & {}) | null | undefined,
): number {
  const band = isScreenQuestionBandId(bandId) ? ARTEX_SCREEN_QUESTION_BANDS[bandId].questions : 0;
  return Math.max(SCREEN_QUESTIONS_INCLUDED, band);
}

/** Price in cents for a band and period. */
export function screenQuestionBandPriceCents(
  bandId: ArtexScreenQuestionBandId,
  period: "monthly" | "annual",
): number {
  const band = ARTEX_SCREEN_QUESTION_BANDS[bandId];
  return period === "annual" ? band.annualPriceCents : band.monthlyPriceCents;
}
