import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

const FALLBACK_TITLE = "Your digital identity, amplified.";
const MAX_LARGE_TITLE = 56;

export async function GET(request: NextRequest) {
  const heading = request.nextUrl.searchParams.get("title") ?? FALLBACK_TITLE;
  const isLongTitle = heading.length > MAX_LARGE_TITLE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #4c1d95 100%)",
          padding: "80px 90px",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #3b82f6, #9333ea)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: "#ffffff" }}>A</div>
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.5px" }}>
            Amped.Bio
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              width: 96,
              height: 10,
              borderRadius: 999,
              background: "linear-gradient(90deg, #3b82f6, #9333ea)",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: isLongTitle ? 54 : 72,
              lineHeight: 1.15,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-1px",
            }}
          >
            {heading}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#a5b4fc" }}>
            Your digital identity, amplified.
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#c7d2fe" }}>
            amped.bio
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
