import { useEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Images, Square, Smartphone, Loader2 } from "lucide-react";
import { CreativeCanvas } from "@/components/CreativeCanvas";
import { toast } from "sonner";

export type Slide = {
  order: number;
  headline: string;
  body: string;
  kicker?: string;
  emphasis?: string;
  image_prompt?: string;
  image_url?: string;
  source_name?: string;
  source_link?: string;
};

export type Creative = {
  id: string;
  format: "card" | "carousel" | "story";
  caption: string | null;
  hashtags: string[];
  slides: Slide[];
  status: "pending_review" | "approved" | "rejected";
};

const formatMeta = {
  card: { label: "Card", icon: Square },
  carousel: { label: "Carrossel", icon: Images },
  story: { label: "Story", icon: Smartphone },
} as const;

export const CreativeReviewCard = ({
  creative,
  onReview,
}: {
  creative: Creative;
  onReview: (id: string, status: "approved" | "rejected") => void;
}) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const exportRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const Icon = formatMeta[creative.format].icon;

  useEffect(() => {
    const paths = creative.slides.map((s) => s.image_url).filter(Boolean) as string[];
    if (paths.length === 0) return;
    supabase.storage
      .from("instagram-creatives")
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        setUrls(map);
      });
  }, [creative]);

  const approve = async () => {
    setExporting(true);
    try {
      const paths: string[] = [];
      for (const slide of creative.slides) {
        const node = exportRefs.current[slide.order];
        if (!node) continue;
        const blob = await toBlob(node, { pixelRatio: 1, cacheBust: true });
        if (!blob) continue;
        const path = `${creative.id}/final-${slide.order}.png`;
        const { error } = await supabase.storage
          .from("instagram-creatives")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      if (paths.length > 0) {
        await supabase.from("instagram_creatives").update({ final_image_urls: paths }).eq("id", creative.id);
      }
    } catch (err) {
      toast.error(`Não consegui montar a imagem final: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
    onReview(creative.id, "approved");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-4 h-4 text-primary" />
          {formatMeta[creative.format].label}
        </CardTitle>
        <Badge variant={creative.status === "pending_review" ? "secondary" : "outline"}>
          {creative.status === "pending_review"
            ? "Aguardando revisão"
            : creative.status === "approved"
              ? "Aprovado"
              : "Rejeitado"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {creative.slides.map((slide) => (
            <div
              key={slide.order}
              className="shrink-0 overflow-hidden rounded-xl shadow-soft"
              style={{ width: creative.format === "story" ? 158 : 220 }}
            >
              <CreativeCanvas
                slide={slide}
                format={creative.format}
                imageSrc={slide.image_url ? urls[slide.image_url] : undefined}
                width={creative.format === "story" ? 158 : 220}
              />
            </div>
          ))}
        </div>

        {creative.caption && <p className="text-sm whitespace-pre-wrap">{creative.caption}</p>}
        {creative.hashtags?.length > 0 && (
          <p className="text-xs text-primary">{creative.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        )}

        {creative.status === "pending_review" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={approve} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Aprovar
            </Button>
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => onReview(creative.id, "rejected")}>
              <X className="w-4 h-4 mr-1" /> Rejeitar
            </Button>
          </div>
        )}

        {/* Render em tamanho real (1080px), fora da tela, usado só na exportação */}
        <div style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }} aria-hidden>
          {creative.slides.map((slide) => (
            <CreativeCanvas
              key={slide.order}
              ref={(el) => {
                exportRefs.current[slide.order] = el;
              }}
              slide={slide}
              format={creative.format}
              imageSrc={slide.image_url ? urls[slide.image_url] : undefined}
              width={1080}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
