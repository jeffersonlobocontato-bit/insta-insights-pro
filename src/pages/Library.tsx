import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Download, Copy, Linkedin } from "lucide-react";
import { toast } from "sonner";

type ApprovedCreative = {
  id: string;
  format: "card" | "carousel" | "story";
  caption: string | null;
  hashtags: string[];
  final_image_urls: string[];
  reviewed_at: string | null;
  created_at: string;
};

const formatLabel = { card: "Card", carousel: "Carrossel", story: "Story" } as const;

const Library = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ApprovedCreative[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data } = await supabase
        .from("instagram_creatives")
        .select("id, format, caption, hashtags, final_image_urls, reviewed_at, created_at")
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (!active) return;
      const list = (data ?? []) as unknown as ApprovedCreative[];
      setItems(list);
      const paths = list.flatMap((i) => i.final_image_urls ?? []);
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("instagram-creatives")
          .createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        signed?.forEach((s) => {
          if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        });
        if (active) setUrls(map);
      }
      setLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [navigate]);

  const download = async (path: string, name: string) => {
    const url = urls[path];
    if (!url) return;
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const publishLinkedIn = async (item: ApprovedCreative) => {
    setPublishing(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-publish", {
        body: { creative_id: item.id },
      });
      if (error) throw error;
      const result = data as { with_image?: boolean; image_count?: number; image_error?: string | null };
      if (result?.with_image) {
        const n = result.image_count ?? 1;
        toast.success(n > 1 ? `Publicado no LinkedIn com ${n} imagens` : "Publicado no LinkedIn com a imagem");
      } else {
        toast.warning(
          result?.image_error
            ? `Publicado só o texto. A imagem falhou: ${result.image_error}`
            : "Publicado no LinkedIn (somente texto)",
          { duration: 12000 },
        );
      }
    } catch (err) {
      toast.error(`Não consegui publicar: ${(err as Error).message}`);
    } finally {
      setPublishing(null);
    }
  };



  const copyCaption = async (item: ApprovedCreative) => {
    const tags = (item.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    await navigator.clipboard.writeText([item.caption ?? "", tags].filter(Boolean).join("\n\n"));
    toast.success("Legenda copiada");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin" aria-label="Voltar para a fila de revisão">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">Biblioteca</h1>
              <p className="text-xs text-muted-foreground">Artes aprovadas, prontas para postar</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma arte aprovada ainda. Aprove peças na fila de revisão e elas aparecem aqui.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{formatLabel[item.format]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.reviewed_at ?? item.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>

                  {item.final_image_urls?.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {item.final_image_urls.map((path, i) => (
                        <div key={path} className="shrink-0 space-y-2">
                          <img
                            src={urls[path]}
                            alt={`Arte aprovada ${formatLabel[item.format]} ${i + 1}`}
                            loading="lazy"
                            className="rounded-xl shadow-soft"
                            style={{ width: item.format === "story" ? 140 : 200 }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => download(path, `${item.format}-${i + 1}.png`)}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" /> Baixar
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Esta peça foi aprovada antes da montagem final da imagem.
                    </p>
                  )}

                  {item.caption && <p className="text-sm whitespace-pre-wrap">{item.caption}</p>}
                  {item.hashtags?.length > 0 && (
                    <p className="text-xs text-primary">
                      {item.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => copyCaption(item)}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar legenda
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={publishing === item.id}
                      onClick={() => publishLinkedIn(item)}
                    >
                      {publishing === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : (
                        <Linkedin className="w-3.5 h-3.5 mr-1" />
                      )}
                      Publicar no LinkedIn
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Library;
