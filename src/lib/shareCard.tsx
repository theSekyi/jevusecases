import { ImageResponse } from "next/og";

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

const BG = "#0f1318";
const INK = "#f1f3f6";
const SECONDARY = "#b3b9c2";
const MUTED = "#8a919b";
const ACCENT = "#fe843d";

/** Cuts text to a length that fits the card, at a word boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, "")}…`;
}

interface ShareCardProps {
  eyebrow: string;
  title: string;
  /** The big number or claim, in the accent colour. */
  highlight?: { label: string; value: string };
  body?: string;
  footerLeft?: string;
  footerRight: string;
}

/** The 1200x630 preview image X, Slack and others show for a link. */
export function shareCard({ eyebrow, title, highlight, body, footerLeft, footerRight }: ShareCardProps) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BG, color: INK, padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: BG }}>
            J
          </div>
          <div style={{ fontSize: 28, color: SECONDARY }}>jevusecases</div>
          <div style={{ fontSize: 24, color: MUTED, marginLeft: "auto" }}>{clip(eyebrow, 40)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, flex: 1 }}>
          <div style={{ fontSize: title.length > 32 ? 60 : 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{clip(title, 60)}</div>
          {highlight ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
              <div style={{ fontSize: 26, color: MUTED }}>{highlight.label}</div>
              <div style={{ fontSize: highlight.value.length > 30 ? 46 : 60, fontWeight: 700, color: ACCENT, lineHeight: 1.1, marginTop: 6 }}>
                {clip(highlight.value, 64)}
              </div>
            </div>
          ) : body ? (
            <div style={{ fontSize: 34, color: SECONDARY, lineHeight: 1.35, marginTop: 32 }}>{clip(body, 150)}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: SECONDARY }}>
          <div style={{ display: "flex" }}>{footerLeft ?? ""}</div>
          <div style={{ display: "flex", marginLeft: "auto", color: MUTED }}>{footerRight}</div>
        </div>
      </div>
    ),
    SHARE_CARD_SIZE,
  );
}
