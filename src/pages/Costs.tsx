import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Download, ChevronDown } from "lucide-react";

type Run = {
  id: string;
  run_date: string;
  status: string;
  topic_title: string | null;
  cost_usd: number;
  cost_brl: number;
  tokens_total: number;
  image_count: number;
  created_at: string;
};

type UsageEvent = {
  id: string;
  run_id: string | null;
  step: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  images: number;
  cost_usd: number;
  cost_brl: number;
  duration_ms: number;
  success: boolean;
  created_at: string;
};

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const brl = (v: number) => `R$ ${Number(v ?? 0).toFixed(2)}`;
const usd = (v: number) => `US$ ${Number(v ?? 0).toFixed(3)}`;

const Costs = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [days, setDays] = useState(30);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [{ data: runsData }, { data: eventsData }] = await Promise.all([
      supabase.from("instagram_runs").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("ai_usage_events").select("*").gte("created_at", since).order("created_at", { ascending: false }),
    ]);
    setRuns((runsData ?? []) as unknown as Run[]);
    setEvents((eventsData ?? []) as unknown as UsageEvent[]);
  }, [days]);

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

  const totals = useMemo(() => {
    const totalBrl = runs.reduce((s, r) => s + Number(r.cost_brl ?? 0), 0);
    const totalUsd = runs.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    return {
      totalBrl,
      totalUsd,
      runs: runs.length,
      avgBrl: runs.length ? totalBrl / runs.length : 0,
      images: runs.reduce((s, r) => s + (r.image_count ?? 0), 0),
    };
  }, [runs]);

  const exportCsv = () => {
    const header = "data,rodada,tema,etapa,modelo,tokens_entrada,tokens_saida,imagens,custo_usd,custo_brl\n";
    const byRun = new Map(runs.map((r) => [r.id, r]));
    const rows = events.map((e) => {
      const run = e.run_id ? byRun.get(e.run_id) : undefined;
      const topic = (run?.topic_title ?? "").replace(/"/g, "'");
      return `${e.created_at},${e.run_id ?? ""},"${topic}",${e.step},${e.model},${e.input_tokens},${e.output_tokens},${e.images},${e.cost_usd},${e.cost_brl}`;
    });
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custos-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              <h1 className="text-xl font-bold">Extrato de custos</h1>
              <p className="text-xs text-muted-foreground">Quanto custou cada ciclo de criação</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.days}
                size="sm"
                variant={days === p.days ? "default" : "outline"}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total no período</CardDescription></CardHeader>
            <CardContent className="text-2xl font-bold">{brl(totals.totalBrl)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Em dólar</CardDescription></CardHeader>
            <CardContent className="text-2xl font-bold">{usd(totals.totalUsd)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Média por rodada</CardDescription></CardHeader>
            <CardContent className="text-2xl font-bold">{brl(totals.avgBrl)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Rodadas / imagens</CardDescription></CardHeader>
            <CardContent className="text-2xl font-bold">{totals.runs} / {totals.images}</CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Rodadas</h2>
          {runs.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma rodada registrada neste período.</p>
          )}
          {runs.map((run) => {
            const rows = events.filter((e) => e.run_id === run.id);
            const expanded = open === run.id;
            return (
              <Card key={run.id}>
                <CardHeader className="cursor-pointer" onClick={() => setOpen(expanded ? null : run.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{run.topic_title ?? "Rodada sem tema"}</CardTitle>
                      <CardDescription>
                        {new Date(run.created_at).toLocaleString("pt-BR")} · {run.tokens_total} tokens · {run.image_count} imagens
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{run.status}</Badge>
                      <span className="font-bold">{brl(run.cost_brl)}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </CardHeader>
                {expanded && (
                  <CardContent className="space-y-1 text-sm">
                    {rows.length === 0 && <p className="text-muted-foreground">Sem detalhamento para esta rodada.</p>}
                    {rows.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5">
                        <span className="font-mono text-xs uppercase">{e.step}</span>
                        <span className="text-muted-foreground text-xs flex-1 truncate px-2">{e.model}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.images > 0 ? `${e.images} img` : `${e.input_tokens}/${e.output_tokens} tk`}
                        </span>
                        <span className="text-xs text-muted-foreground">{(e.duration_ms / 1000).toFixed(1)}s</span>
                        <span className="font-medium w-20 text-right">{brl(e.cost_brl)}</span>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default Costs;
