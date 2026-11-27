/**
 * Matchbox Asks: a person says what they need (a role, what for, a city or
 * remote) and anyone signed in can answer it (docs/plans/matchbox-asks-plan.md,
 * owner decisions 2026-11-24).
 *
 * This file is the single source of truth for the fixed role list and the
 * limits. The platform API cannot import this package, so
 * `.services/artex-platform-api/matchboxAsks.mjs` mirrors the role ids and the
 * limits, and its test reads this file and fails on drift.
 *
 * Role ids are stable and never recycled: stored Asks and filters key off them.
 * Labels are display copy (brand-voice skill: sentence case, no "users").
 */

export const MATCHBOX_ASK_ROLES = [
  { id: "musician", label: "Musician" },
  { id: "producer", label: "Producer" },
  { id: "sound_designer", label: "Sound designer" },
  { id: "visual_artist", label: "Visual artist" },
  { id: "creative_technologist", label: "Creative technologist" },
  { id: "developer", label: "Developer" },
  { id: "designer", label: "Designer" },
  { id: "vj", label: "VJ" },
  { id: "photographer_filmmaker", label: "Photographer or filmmaker" },
  { id: "performer", label: "Performer" },
  { id: "curator", label: "Curator" },
  { id: "venue_space", label: "Venue or space" },
  { id: "other", label: "Other" },
] as const;

export type MatchboxAskRoleId = (typeof MATCHBOX_ASK_ROLES)[number]["id"];

/** Longest "what for", in characters. */
export const MATCHBOX_ASK_BODY_MAX_CHARS = 280;
/** Longest label for the Other role. */
export const MATCHBOX_ASK_ROLE_OTHER_MAX_CHARS = 40;
/** Longest city name. */
export const MATCHBOX_ASK_PLACE_MAX_CHARS = 80;
/** Open Asks one person may have at once. */
export const MATCHBOX_ASK_OPEN_MAX = 3;
/** Asks one person may post in a day, closed ones included. */
export const MATCHBOX_ASK_POSTS_PER_DAY = 5;
/** Asks one person may answer in a day (new threads only; replying in one is free). */
export const MATCHBOX_ASK_REPLIES_PER_DAY = 10;
/** Days an Ask stays open before it closes itself. */
export const MATCHBOX_ASK_LIFETIME_DAYS = 30;

export type MatchboxAskStatus = "open" | "closed" | "expired";

export interface MatchboxAskPlace {
  kind: "city" | "remote";
  /** The city as the poster wrote it; empty for remote. */
  label: string;
}

/** One answer to the viewer's own Ask, as Mine lists it. Never the replier's id. */
export interface MatchboxAskReply {
  conversationId: string;
  /** Null once the replier has left ARTEX. */
  name: string | null;
  lastMessageAt: string | null;
  unread: number;
}

/** An Ask as the browse list and Mine show it. Never the poster's id. */
export interface MatchboxAskView {
  id: string;
  role: MatchboxAskRoleId;
  /** The poster's own label when `role` is "other". */
  roleOther: string | null;
  body: string;
  place: MatchboxAskPlace;
  /** A calendar date (YYYY-MM-DD), or null. */
  neededBy: string | null;
  status: MatchboxAskStatus;
  posterName: string | null;
  /** True on the viewer's own Asks. */
  mine: boolean;
  replyCount: number;
  createdAt: string | null;
  expiresAt: string | null;
  /** Browse only: the viewer's conversation on this Ask, if they answered it. */
  answeredConversationId?: string | null;
  /** Mine only: the answers, newest first. */
  replies?: MatchboxAskReply[];
}

/** The label a role id shows, or null for an unknown id. */
export const matchboxAskRoleLabel = (id: string): string | null => (
  MATCHBOX_ASK_ROLES.find((role) => role.id === id)?.label ?? null
);
