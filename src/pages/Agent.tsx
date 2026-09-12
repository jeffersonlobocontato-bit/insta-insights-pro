import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Sparkles, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";

type Preset = {
  id: string;
  name: string;
  instructions: string;
  provider: string;
  text_model: string;
  image_model: string;
  formats: string[];
  carousel_slides: number;
  image_budget: number;
  is_default: boolean;
};

const FORMATS = [
  { id: "card", label: "Card único" },
  { id: "carousel", label: "Carrossel" },
  { id: "story", label: "Story" },
];

const Agent = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [current, setCurrent] = useState<Preset | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("agent_presets").select("*").order("created_at");
    const rows = (data ?? []) as unknown as Preset[];
    setPresets(rows);
    setCurrent((prev) => rows.find((r) => r.id === prev?.id) ?? rows.find((r) => r.is_default) ?? rows[0] ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!active) return;
      const admin = (roles ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      setReady(true);
      if (admin) await load();
    };
    check();
    return () => {
      active = false;
    };
  }, [navigate, load]);

  const patch = (values: Partial<Preset>) => setCurrent((p) => (p ? { ...p, ...values } : p));

  const toggleFormat = (id: string) => {
    if (!current) return;
    const has = current.formats.includes(id);
    const next = has ? current.formats.filter((f) => f !== id) : [...current.formats, id];
    if (next.length === 0) return;
    patch({ formats: next });
  };

  const save = async () => {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase
      .from("agent_presets")
      .update({
        name: current.name,
        instructions: current.instructions,
        provider: current.provider,
        text_model: current.text_model,
        image_model: current.image_model,
        formats: current.formats,
        carousel_slides: current.carousel_slides,
        image_budget: current.image_budget,
      })
      .eq("id", current.id);
    setSaving(false);
    if (error) toast.error("Não consegui salvar: " + error.message);
    else {
      toast.success("Preset salvo");
      load();
    }
  };

  const run = async (sourceUrl?: string) => {
    if (!current) return;
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("instagram-content-fetch", {
      body: { preset_id: current.id, ...(sourceUrl ? { source_url: sourceUrl } : {}) },
    });
    setRunning(false);
    if (error) toast.error("Falhou: " + error.message);
    else {
      const cost = (data as { cost_brl?: number })?.cost_brl ?? 0;
      toast.success(`Criativos gerados. Custo estimado: R$ ${cost.toFixed(2)}`);
      if (sourceUrl) setLinkUrl("");
    }
  };

  const runFromLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast.error("Cole o endereço completo da página, começando com https://");
      return;
    }
    run(url);
  };


  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <Button variant="outline" asChild>
          <Link to="/admin">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">Agente de criação</h1>
              <p className="text-xs text-muted-foreground">Instruções e preferências das gerações</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={save} disabled={saving || !current}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
            <Button size="sm" onClick={run} disabled={running || !current}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Gerar agora
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Tabs defaultValue="preset" className="space-y-6">
          <TabsList>
            <TabsTrigger value="preset">Preset</TabsTrigger>
            <TabsTrigger value="library">Biblioteca</TabsTrigger>
          </TabsList>

          <TabsContent value="library">
            <KnowledgeLibrary presetId={current?.id ?? null} />
          </TabsContent>

          <TabsContent value="preset" className="space-y-6">
        {presets.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={current?.id === p.id ? "default" : "outline"}
                onClick={() => setCurrent(p)}
              >
                {p.name}
                {p.is_default && <Badge variant="secondary" className="ml-2">padrão</Badge>}
              </Button>
            ))}
          </div>
        )}

        {current && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Como o agente deve escrever</CardTitle>
                <CardDescription>Tom de voz, temas preferidos, o que evitar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do preset</Label>
                  <Input id="name" value={current.name} onChange={(e) => patch({ name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instruções</Label>
                  <Textarea
                    id="instructions"
                    rows={8}
                    value={current.instructions ?? ""}
                    onChange={(e) => patch({ instructions: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">O que gerar em cada rodada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((f) => (
                    <Button
                      key={f.id}
                      size="sm"
                      variant={current.formats.includes(f.id) ? "default" : "outline"}
                      onClick={() => toggleFormat(f.id)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="slides">Slides no carrossel</Label>
                    <Input
                      id="slides"
                      type="number"
                      min={2}
                      max={10}
                      value={current.carousel_slides}
                      onChange={(e) => patch({ carousel_slides: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget">Máximo de imagens criadas por IA</Label>
                    <Input
                      id="budget"
                      type="number"
                      min={0}
                      max={20}
                      value={current.image_budget}
                      onChange={(e) => patch({ image_budget: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Imagens das próprias notícias são usadas primeiro e não custam nada.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Modelos</CardTitle>
                <CardDescription>
                  Deixe em "lovable" para usar a IA já incluída. Escolha "openai" apenas se a sua chave própria
                  estiver configurada no sistema.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provedor</Label>
                  <select
                    id="provider"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={current.provider}
                    onChange={(e) => patch({ provider: e.target.value })}
                  >
                    <option value="lovable">lovable</option>
                    <option value="openai">openai</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="text_model">Modelo de texto</Label>
                  <Input id="text_model" value={current.text_model} onChange={(e) => patch({ text_model: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image_model">Modelo de imagem</Label>
                  <Input id="image_model" value={current.image_model} onChange={(e) => patch({ image_model: e.target.value })} />
                </div>
              </CardContent>
            </Card>
          </>
        )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Agent;
