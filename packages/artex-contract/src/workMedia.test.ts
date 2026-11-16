import { describe, expect, it } from "vitest";
import { WORK_MEDIA_MAX_ITEMS, readWorkMediaFocus, readWorkMediaItem, readWorkMediaList } from "./workMedia";

const image = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "image",
  url: `https://storage.googleapis.com/b/archive-mirrors/work-media/${id}.jpg`,
  ...extra,
});

describe("readWorkMediaItem", () => {
  it("keeps a hosted image with its dimensions and provenance", () => {
    expect(readWorkMediaItem(image("a", {
      width: 1200,
      height: 800,
      sourceUrl: "https://codame.dreamhosters.com/uploaded_images/Shybot-1.jpg",
      role: "work",
      isCover: true,
    }))).toEqual({
      id: "a",
      kind: "image",
      url: "https://storage.googleapis.com/b/archive-mirrors/work-media/a.jpg",
      width: 1200,
      height: 800,
      sourceUrl: "https://codame.dreamhosters.com/uploaded_images/Shybot-1.jpg",
      role: "work",
      display: true,
      isCover: true,
    });
  });

  it("never lets an embed play on Display", () => {
    const item = readWorkMediaItem({
      id: "v",
      kind: "embed",
      provider: "vimeo",
      url: "https://vimeo.com/201505425",
      display: true,
    });
    expect(item?.display).toBe(false);
    expect(item?.provider).toBe("vimeo");
  });

  it("refuses an embed whose URL is not on its provider's hosts", () => {
    expect(readWorkMediaItem({ id: "e", kind: "embed", provider: "youtube", url: "https://evil.example/x" })).toBeNull();
    expect(readWorkMediaItem({ id: "e", kind: "embed", provider: "vimeo", url: "https://www.youtube.com/watch?v=a" })).toBeNull();
    expect(readWorkMediaItem({ id: "e", kind: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=L4rbfNRSN7s" })).not.toBeNull();
    expect(readWorkMediaItem({ id: "e", kind: "embed", provider: "vimeo", url: "https://player.vimeo.com/video/1" })).not.toBeNull();
  });

  it("refuses an embed with no known provider, and anything not https", () => {
    expect(readWorkMediaItem({ id: "x", kind: "embed", url: "https://sketchfab.com/models/1/embed" })).toBeNull();
    expect(readWorkMediaItem({ id: "x", kind: "embed", provider: "dailymotion", url: "https://x.example" })).toBeNull();
    expect(readWorkMediaItem({ id: "x", kind: "image", url: "http://codame.dreamhosters.com/a.jpg" })).toBeNull();
  });

  it("refuses an item with no id, an unknown kind, or nothing to load", () => {
    expect(readWorkMediaItem({ kind: "image", url: "https://a.example/x.jpg" })).toBeNull();
    expect(readWorkMediaItem({ id: "m", kind: "model", url: "https://a.example/x.glb" })).toBeNull();
    expect(readWorkMediaItem({ id: "m", kind: "image" })).toBeNull();
    expect(readWorkMediaItem("https://a.example/x.jpg")).toBeNull();
  });

  it("drops unknown keys and half dimensions", () => {
    const item = readWorkMediaItem(image("a", { width: 100, rogue: "<script>" }));
    expect(item).not.toHaveProperty("rogue");
    expect(item).not.toHaveProperty("width");
  });

  it("keeps both rendition formats and the writer's bookkeeping", () => {
    const item = readWorkMediaItem(image("a", {
      renditions: {
        w480: "https://x/a-480.webp",
        avif960: "https://x/a-960.avif",
        poster: "http://x/insecure.jpg",
        v: 2,
        source: "archive-mirrors/work-media/a.gif",
        frames: 344,
        pixels: 123_840_000,
        junk: "https://x/j",
      },
    }));
    expect(item?.renditions).toEqual({
      w480: "https://x/a-480.webp",
      avif960: "https://x/a-960.avif",
      v: 2,
      source: "archive-mirrors/work-media/a.gif",
      frames: 344,
      pixels: 123_840_000,
    });
  });
});

describe("readWorkMediaList", () => {
  it("is null for an absent or empty list", () => {
    expect(readWorkMediaList(undefined)).toBeNull();
    expect(readWorkMediaList(null)).toBeNull();
    expect(readWorkMediaList([])).toBeNull();
    expect(readWorkMediaList([{ id: "bad" }])).toBeNull();
  });

  it("keeps order, drops duplicates and keeps one cover", () => {
    const list = readWorkMediaList([
      image("a", { isCover: true }),
      image("b", { isCover: true }),
      image("a"),
      image("c"),
    ]);
    expect(list?.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(list?.filter((item) => item.isCover).map((item) => item.id)).toEqual(["a"]);
  });

  it("caps the list", () => {
    const list = readWorkMediaList(Array.from({ length: WORK_MEDIA_MAX_ITEMS + 5 }, (_, i) => image(`i${String(i)}`)));
    expect(list).toHaveLength(WORK_MEDIA_MAX_ITEMS);
  });
});

describe("an item's focal point", () => {
  it("keeps a point inside the item, rounded to 3 places", () => {
    expect(readWorkMediaItem(image("a", { focus: { x: 0.12345, y: 1 } }))?.focus).toEqual({ x: 0.123, y: 1 });
    expect(readWorkMediaFocus({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("reads anything else as no focal point (the centre), and never keeps one on an embed", () => {
    for (const focus of [{ x: 1.5, y: 0 }, { x: "0.5", y: 0.5 }, { x: 0.5 }, null, 0.5]) {
      expect(readWorkMediaItem(image("a", { focus }))?.focus).toBeUndefined();
    }
    const embed = readWorkMediaItem({ id: "v", kind: "embed", provider: "vimeo", url: "https://vimeo.com/851899423", focus: { x: 0.2, y: 0.2 } });
    expect(embed?.focus).toBeUndefined();
  });
});
