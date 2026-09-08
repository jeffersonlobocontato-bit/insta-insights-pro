import { forwardRef } from "react";

export type CanvasSlide = {
  order: number;
  headline: string;
  body: string;
  kicker?: string;
  emphasis?: string;
  image_url?: string;
  source_name?: string;
  source_link?: string;
};

type Props = {
  slide: CanvasSlide;
  format: "card" | "carousel" | "story";
  imageSrc?: string;
  /** largura de render em px — 1080 na exportação, menor na prévia */
  width?: number;
};

/** Aplica o gesto de assinatura: a expressão em destaque vira itálico âmbar. */
const withEmphasis = (headline: string, emphasis?: string) => {
  if (!emphasis) return <>{headline}</>;
  const index = headline.toLowerCase().indexOf(emphasis.toLowerCase());
  if (index < 0) return <>{headline}</>;
  return (
    <>
      {headline.slice(0, index)}
      <em className="italic" style={{ color: "#E29F65" }}>
        {headline.slice(index, index + emphasis.length)}
      </em>
      {headline.slice(index + emphasis.length)}
    </>
  );
};

export const CreativeCanvas = forwardRef<HTMLDivElement, Props>(
  ({ slide, format, imageSrc, width = 1080 }, ref) => {
    const height = format === "story" ? Math.round((width * 16) / 9) : width;
    const scale = width / 1080;
    const px = (v: number) => `${Math.round(v * scale)}px`;

    return (
      <div
        ref={ref}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#12201E",
          color: "#F2EEE4",
          fontFamily: "Manrope, system-ui, sans-serif",
        }}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {/* camada petróleo para legibilidade */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(18,32,30,0.72) 0%, rgba(18,32,30,0.86) 55%, rgba(18,32,30,0.97) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: px(88),
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: px(26),
              color: "#E29F65",
            }}
          >
            {slide.kicker ?? "Inteligência artificial · Marketing"}
          </div>

          <div>
            <h2
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: px(format === "story" ? 96 : 84),
                lineHeight: 1.04,
                margin: 0,
              }}
            >
              {withEmphasis(slide.headline, slide.emphasis)}
            </h2>

            <div
              style={{
                height: px(2),
                margin: `${px(36)} 0`,
                background:
                  "linear-gradient(90deg, rgba(226,159,101,0) 0%, rgba(226,159,101,0.85) 35%, rgba(226,159,101,0) 100%)",
              }}
            />

            <p
              style={{
                fontSize: px(34),
                lineHeight: 1.45,
                margin: 0,
                color: "rgba(242,238,228,0.88)",
                maxWidth: px(880),
              }}
            >
              {slide.body}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: px(24) }}>
            <div
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: px(format === "story" ? 40 : 38),
                whiteSpace: "nowrap",
              }}
            >
              Jefferson <em style={{ color: "#E29F65", fontStyle: "italic" }}>Lobo</em>
            </div>
            {slide.source_name && (
              <div
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontSize: px(20),
                  color: "rgba(242,238,228,0.55)",
                  textAlign: "right",
                }}
              >
                Imagem · {slide.source_name}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

CreativeCanvas.displayName = "CreativeCanvas";
