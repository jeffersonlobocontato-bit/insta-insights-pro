import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Images, Square, Smartphone } from "lucide-react";

export type Slide = {
  order: number;
  headline: string;
  body: string;
  image_prompt?: string;
  image_url?: string;
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
              className={`relative shrink-0 overflow-hidden rounded-xl bg-muted ${
                creative.format === "story" ? "w-40 aspect-[9/16]" : "w-40 aspect-square"
              }`}
            >
              {slide.image_url && urls[slide.image_url] && (
                <img
                  src={urls[slide.image_url]}
                  alt={slide.headline}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-background/20 p-3 flex flex-col justify-end">
                <p className="text-xs font-bold leading-tight">{slide.headline}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-3 mt-1">{slide.body}</p>
              </div>
            </div>
          ))}
        </div>

        {creative.caption && <p className="text-sm whitespace-pre-wrap">{creative.caption}</p>}
        {creative.hashtags?.length > 0 && (
          <p className="text-xs text-primary">{creative.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        )}

        {creative.status === "pending_review" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onReview(creative.id, "approved")}>
              <Check className="w-4 h-4 mr-1" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReview(creative.id, "rejected")}>
              <X className="w-4 h-4 mr-1" /> Rejeitar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
