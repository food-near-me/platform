/**
 * Shared Open Graph share-card (direction B — "The Tip Card").
 * Rendered by next/og (Satori): hex colors only, flex layout only, no CSS vars.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const C = {
  bg: "#f4f6f8",
  bg1: "#ffffff",
  line: "#e3e7ec",
  fg: "#1a1f27",
  fgDim: "#4b5563",
  fgMute: "#6b7280",
  accent: "#d24a3c",
  accentDim: "#b43d32",
  accentSoft: "#f8e3df",
};

export type ShareCardData = {
  name: string;
  meta: string;
  letter: string;
};

// Share cards carry NO allergy-safety grade/badge: this raster is the highest-
// distribution, cache-baked, sentinel-unreadable surface and can carry no scope
// disclaimer, so an affirmative safety badge here is a liability the invariant
// forbids. Name + needs + brand only.
export function ShareCard({ name, meta, letter }: ShareCardData) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, fontFamily: "Figtree" }}>
      {/* Left — brand */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1.15,
          padding: "0 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            color: C.accent,
            fontFamily: "Outfit",
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Allergy-aware dining
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Outfit",
            fontWeight: 800,
            fontSize: 80,
            color: C.fg,
            marginTop: 14,
            letterSpacing: -1,
          }}
        >
          foodnear<span style={{ color: C.accent }}>.</span>me
        </div>
        <div style={{ display: "flex", fontSize: 30, color: C.fgDim, fontWeight: 600, marginTop: 20, maxWidth: 520 }}>
          Curated, honest kitchen notes for people who can’t just eat anywhere.
        </div>
        <div style={{ display: "flex", fontSize: 22, color: C.fg, fontWeight: 700, marginTop: 22 }}>
          Miami · Jacksonville
        </div>
      </div>

      {/* Right — the tip card */}
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 56,
          background: "linear-gradient(160deg,#eef1f4,#e4e9ef)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 420,
            background: C.bg1,
            borderRadius: 24,
            border: `1px solid ${C.line}`,
            boxShadow: "0 16px 48px rgba(30,40,60,0.14)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              height: 170,
              background: "linear-gradient(135deg,#e08a4f,#cf4a3d)",
              alignItems: "flex-end",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 64, color: "rgba(255,255,255,0.92)" }}>
              {letter}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "20px 22px 24px" }}>
            <div style={{ display: "flex", fontFamily: "Outfit", fontWeight: 800, fontSize: 27, color: C.fg }}>{name}</div>
            <div style={{ display: "flex", marginTop: 12, color: C.fgMute, fontSize: 18, fontWeight: 600 }}>{meta}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FONT_FILES = [
  { name: "Outfit", weight: 800, url: "https://cdn.jsdelivr.net/npm/@fontsource/outfit/files/outfit-latin-800-normal.woff" },
  { name: "Outfit", weight: 700, url: "https://cdn.jsdelivr.net/npm/@fontsource/outfit/files/outfit-latin-700-normal.woff" },
  { name: "Figtree", weight: 600, url: "https://cdn.jsdelivr.net/npm/@fontsource/figtree/files/figtree-latin-600-normal.woff" },
  { name: "Figtree", weight: 700, url: "https://cdn.jsdelivr.net/npm/@fontsource/figtree/files/figtree-latin-700-normal.woff" },
] as const;

/** Load brand fonts for Satori; degrade to the default font if the CDN is unreachable. */
export async function ogFonts() {
  try {
    return await Promise.all(
      FONT_FILES.map(async (f) => ({
        name: f.name,
        weight: f.weight as 700 | 800,
        style: "normal" as const,
        data: await fetch(f.url).then((r) => {
          if (!r.ok) throw new Error(`font ${f.name} ${f.weight}`);
          return r.arrayBuffer();
        }),
      })),
    );
  } catch {
    return [];
  }
}
