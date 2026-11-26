// The package a media-only work plays from on Display
// (docs/runtime-player-contract.md, "The media block"; multi-media plan §3).
//
// A work with an ordered media list and no live piece (every BIAAF and CODAME
// archive import) has no package of its own, so Display could never play it.
// This is the precedent of `synthesizeFromLegacy`: a pure function derives a
// minimal V3 piece from data the platform already holds, here one `media`
// block over the work's Display-eligible items. The platform API writes that
// piece as an ordinary package zip (`.services/artex-platform-api/
// mediaWorkPackage.mjs`, which mirrors this file because the server cannot
// import the contract; its test imports this file and fails on drift).
//
// A live piece never gets one: it keeps its own package, and Display plays the
// piece only, never its media list.
//
// A dependency-free leaf on purpose (type-only imports, which Node's type
// stripping erases), so `scripts/` and the platform API's tests can load it.

import type { WorkMediaItem } from "./workMedia";
import type { MediaBlockItem, PieceConfig } from "./v3/types";

/** Bump when the synthesized package changes shape, so stored ones rebuild. */
export const MEDIA_WORK_PACKAGE_VERSION = 1;

/** The block's id inside the synthesized piece. */
export const MEDIA_WORK_BLOCK_ID = "work-media";

/** One file the package carries, and the hosted rendition its bytes come from. */
export interface MediaWorkPackageFile {
  path: string;
  sourceUrl: string;
  /** What the bytes are: a still or animated image, a video's poster, or a video rendition. */
  role: "image" | "poster" | "video";
}

export interface MediaWorkPackagePlan {
  /** The piece the package's config.json carries as `pieceConfigV3`. */
  pieceConfig: PieceConfig;
  /**
   * Bytes to bundle: every image rendition in item order, then every video's
   * poster, then every video rendition, so stills come first when the package
   * runs out of room.
   */
  files: MediaWorkPackageFile[];
  /**
   * The package's base artwork (`assets.baseImage`), the package contract's
   * one hard requirement. The first image; else, in a list of videos only,
   * the first poster; else the placeholder (`MEDIA_WORK_PLACEHOLDER_PATH`),
   * which nothing draws: the media block is the whole piece.
   */
  basePath: string;
  /**
   * Changes whenever what Display would play changes (an item added, removed,
   * reordered, hidden, or re-rendered). A stored package whose fingerprint no
   * longer matches is stale and is never offered to Display.
   */
  fingerprint: string;
}

const httpsOrNull = (value: unknown): string | null =>
  typeof value === "string" && /^https:\/\/\S+$/i.test(value.trim()) ? value.trim() : null;

const EMBED_HOST = /^https:\/\/([^/]*\.)?(vimeo\.com|youtube\.com|youtube-nocookie\.com|youtu\.be)(\/|$)/i;

/**
 * ARTEX's own storage buckets: production (its Firebase bucket and the legacy
 * default bucket) and staging. Exact names, never a prefix: bucket names are
 * global, so anyone can create an `artex-…` bucket.
 */
export const ARTEX_MEDIA_BUCKETS: readonly string[] = [
  "artex-490510.firebasestorage.app",
  "artex-490510.appspot.com",
  "artex-staging.firebasestorage.app",
];

/**
 * Whether a hosted video lives in one of ARTEX's own buckets. A Display
 * never hotlinks a third-party origin: a video anywhere else is left out.
 * Recognises the three ways a Cloud Storage object is addressed: path-style
 * (storage.googleapis.com/<bucket>/…), virtual-hosted
 * (<bucket>.storage.googleapis.com/…) and the Firebase download URL
 * (firebasestorage.googleapis.com/v0/b/<bucket>/o/…).
 */
export const isArtexHostedMediaUrl = (value: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  let bucket: string | null = null;
  if (host === "storage.googleapis.com") {
    bucket = parsed.pathname.split("/")[1] ?? null;
  } else if (host === "firebasestorage.googleapis.com") {
    bucket = /^\/v0\/b\/([^/]+)\/o\//.exec(parsed.pathname)?.[1] ?? null;
  } else if (host.endsWith(".storage.googleapis.com")) {
    bucket = host.slice(0, -".storage.googleapis.com".length);
  }
  if (!bucket) return false;
  try {
    return ARTEX_MEDIA_BUCKETS.includes(decodeURIComponent(bucket).toLowerCase());
  } catch {
    return false;
  }
};

const safeItemId = (itemId: string): string => itemId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

/** A package path for an item: safe characters only, always directly under art/. */
export const mediaWorkItemPath = (itemId: string): string => `art/media-${safeItemId(itemId)}.webp`;

/** Where a video's 1080p rendition is bundled. */
export const mediaWorkVideoPath = (itemId: string): string => `art/media-${safeItemId(itemId)}.mp4`;

/** Where a video's poster still is bundled. */
export const mediaWorkPosterPath = (itemId: string): string => `art/media-${safeItemId(itemId)}-poster.webp`;

/**
 * The base artwork of a package whose list is videos with no poster yet: a
 * 16 x 9 black lossless WebP. The package contract needs a base image, and a
 * video uploaded a minute ago has no still until the video rendition job
 * writes its poster. Nothing draws it: the media block is the whole piece.
 */
export const MEDIA_WORK_PLACEHOLDER_PATH = "art/media-base.webp";
export const MEDIA_WORK_PLACEHOLDER_WEBP_BASE64 = "UklGRhoAAABXRUJQVlA4TA4AAAAvDwACAAcQEf0PRET/Aw==";

/** A hosted file in one of ARTEX's own buckets, else null. */
const ownHostedOrNull = (value: unknown): string | null => {
  const url = httpsOrNull(value);
  return url && !EMBED_HOST.test(url) && isArtexHostedMediaUrl(url) ? url : null;
};

/**
 * A video's renditions, when they were derived from the file it holds now. A
 * replaced file keeps its old set only until the save drops it; never play a
 * rendition of a video the artist took out.
 */
const currentVideoRenditions = (item: WorkMediaItem): WorkMediaItem["renditions"] | null => {
  const renditions = item.renditions;
  if (!renditions) return null;
  const source = item.path ?? item.url ?? null;
  return renditions.source && renditions.source !== source ? null : renditions;
};

/**
 * Whether an item's rendition set is an animation. The rendition writer gives
 * an animated item a poster still and no AVIF rungs (animated WebP only), and a
 * still item every AVIF rung.
 */
const isAnimatedRenditionSet = (item: WorkMediaItem): boolean =>
  Boolean(item.renditions?.poster) && !item.renditions?.avif1920 && !item.renditions?.avif960;

/**
 * The items Display plays, as media block items, in the artist's order:
 * - images with a 1920w rendition (a still WebP or an animated WebP). An image
 *   with no rendition yet is left out: originals are never served to Display;
 * - videos with a hosted https file in ARTEX's own storage, never a Vimeo or
 *   YouTube page and never another origin (`isArtexHostedMediaUrl`): the
 *   1080p rendition once the video rendition job has written it (bundled
 *   under `path`, the 2160p as `uhdUrl`, the poster as `posterPath`/
 *   `posterUrl`), else the file as uploaded;
 * - never an embed, and never an item the artist set `display: false`.
 */
export const displayMediaBlockItems = (media: readonly WorkMediaItem[] | null | undefined): MediaBlockItem[] => {
  if (!media) return [];
  const items: MediaBlockItem[] = [];
  const seen = new Set<string>();
  for (const item of media) {
    if (item.display === false || item.kind === "embed" || seen.has(item.id)) continue;
    if (item.kind === "image") {
      const url = httpsOrNull(item.renditions?.w1920);
      if (!url) continue;
      const block: MediaBlockItem = { id: item.id, kind: "image", path: mediaWorkItemPath(item.id), url };
      if (isAnimatedRenditionSet(item)) block.animated = true;
      if (item.width && item.height) {
        block.width = item.width;
        block.height = item.height;
      }
      if (item.alt) block.alt = item.alt;
      items.push(block);
      seen.add(item.id);
    } else {
      // A video: hosted files only, never a third-party page. Its 1080p
      // rendition plays when it exists (and is bundled when it fits), else the
      // file as uploaded.
      const renditions = currentVideoRenditions(item);
      const rendition = ownHostedOrNull(renditions?.video1080);
      const url = rendition ?? ownHostedOrNull(item.url);
      if (!url) continue;
      const block: MediaBlockItem = { id: item.id, kind: "video", url };
      if (rendition) block.path = mediaWorkVideoPath(item.id);
      const uhd = rendition ? ownHostedOrNull(renditions?.video2160) : null;
      if (uhd) block.uhdUrl = uhd;
      const poster = ownHostedOrNull(renditions?.poster);
      if (poster) {
        block.posterPath = mediaWorkPosterPath(item.id);
        block.posterUrl = poster;
      }
      if (typeof item.durationSec === "number" && item.durationSec > 0) block.durationSec = item.durationSec;
      if (item.width && item.height) {
        block.width = item.width;
        block.height = item.height;
      }
      if (item.alt) block.alt = item.alt;
      items.push(block);
      seen.add(item.id);
    }
  }
  return items;
};

/** FNV-1a, 32-bit, as 8 hex digits. Not security: a change detector. */
const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * A video's 2160p rendition and poster are appended only when it has either,
 * so every package built before videos had renditions keeps its fingerprint
 * and stays on Display without a rebuild.
 */
const fingerprintRow = (item: MediaBlockItem): unknown[] => {
  const row: unknown[] = [item.id, item.kind, item.url ?? null, item.path ?? null, item.animated === true];
  return item.uhdUrl || item.posterUrl ? [...row, item.uhdUrl ?? null, item.posterUrl ?? null] : row;
};

export const mediaWorkPackageFingerprint = (items: readonly MediaBlockItem[]): string =>
  `v${MEDIA_WORK_PACKAGE_VERSION}-${fnv1a(JSON.stringify(items.map(fingerprintRow)))}`;

/**
 * The package a media-only work plays from, or null when it has nothing
 * Display can play. A list of videos alone gets one too: a poster, or the
 * placeholder, stands in for the base artwork the package contract requires.
 */
export const planMediaWorkPackage = (work: {
  id: string;
  title?: string | null;
  media?: readonly WorkMediaItem[] | null;
}): MediaWorkPackagePlan | null => {
  const items = displayMediaBlockItems(work.media);
  if (items.length === 0) return null;
  const images = items
    .filter((item) => item.kind === "image" && item.path && item.url)
    .map((item): MediaWorkPackageFile => ({ path: item.path as string, sourceUrl: item.url as string, role: "image" }));
  const posters = items
    .filter((item) => item.kind === "video" && item.posterPath && item.posterUrl)
    .map((item): MediaWorkPackageFile => ({ path: item.posterPath as string, sourceUrl: item.posterUrl as string, role: "poster" }));
  const videos = items
    .filter((item) => item.kind === "video" && item.path && item.url)
    .map((item): MediaWorkPackageFile => ({ path: item.path as string, sourceUrl: item.url as string, role: "video" }));
  const files = [...images, ...posters, ...videos];
  const basePath = images.length > 0 ? images[0].path : posters.length > 0 ? posters[0].path : MEDIA_WORK_PLACEHOLDER_PATH;
  const title = typeof work.title === "string" && work.title.trim() ? work.title.trim() : "Untitled";
  const pieceConfig: PieceConfig = {
    version: 3,
    id: work.id,
    title,
    renderer: { primary: "media" },
    composition: [{ kind: "media", id: MEDIA_WORK_BLOCK_ID, config: { items } }],
  };
  return { pieceConfig, files, basePath, fingerprint: mediaWorkPackageFingerprint(items) };
};

/**
 * The package's config.json: the minimum the package contract requires
 * (`validateConfigJson`), its base artwork (`basePath`), and the piece.
 * Nothing in it animates the base: the media block is the whole piece.
 */
export const mediaWorkConfigJson = (
  work: { id: string; title?: string | null },
  plan: Pick<MediaWorkPackagePlan, "pieceConfig" | "basePath">,
): Record<string, unknown> => ({
  version: 1,
  artworkId: work.id,
  title: plan.pieceConfig.title,
  story: "",
  layers: { base: { parallaxDepth: 0, breathingIntensity: 0, textureDrift: 0 } },
  animation: { baseSpeed: 0, breathingEnabled: false, parallaxEnabled: false, colorShiftEnabled: false },
  evolution: { mode: "timeBased", durationDays: 1, phases: [{ startDay: 0, label: "still", colorTemperatureShift: 0, noiseIntensity: 0, brightnessShift: 0 }] },
  interaction: { supportsProximity: false, supportsAmbientLight: false, events: [] },
  constraints: { protectedRegions: [] },
  assets: { baseImage: plan.basePath },
  pieceConfigV3: plan.pieceConfig,
});
