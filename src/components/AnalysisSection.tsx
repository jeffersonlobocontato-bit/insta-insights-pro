import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MessageSquare, Lightbulb, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnalysisSectionProps {
  profiles: any[];
}

export const AnalysisSection = ({ profiles }: AnalysisSectionProps) => {
  const mockInsights = [
    {
      type: "Melhor Horário",
      description: "Posts entre 18h-20h têm 45% mais engajamento",
      impact: "high",
    },
    {
      type: "Tipo de Conteúdo",
      description: "Carrosséis geram 3x mais saves que posts únicos",
      impact: "high",
    },
    {
      type: "Hashtags",
      description: "Use entre 8-12 hashtags para melhor alcance",
      impact: "medium",
    },
    {
      type: "Frequência",
      description: "Postar 4-5x por semana mantém o engajamento estável",
      impact: "medium",
    },
  ];

  const mockComments = [
    { text: "Amei! 😍", sentiment: "positive", count: 234 },
    { text: "Onde comprar?", sentiment: "neutral", count: 89 },
    { text: "Incrível!", sentiment: "positive", count: 156 },
    { text: "Qual preço?", sentiment: "neutral", count: 67 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Análise de Conteúdo</h2>

      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="insights">
            <Lightbulb className="w-4 h-4 mr-2" />
            Insights
          </TabsTrigger>
          <TabsTrigger value="engagement">
            <TrendingUp className="w-4 h-4 mr-2" />
            Engajamento
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="w-4 h-4 mr-2" />
            Comentários
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockInsights.map((insight, index) => (
              <Card key={index} className="p-6 bg-gradient-card border-border">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{insight.type}</h3>
                  <Badge
                    variant={insight.impact === "high" ? "default" : "secondary"}
                    className={
                      insight.impact === "high"
                        ? "bg-gradient-primary"
                        : ""
                    }
                  >
                    {insight.impact === "high" ? "Alto Impacto" : "Médio Impacto"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{insight.description}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="engagement">
          <Card className="p-6 bg-gradient-card border-border">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg">Padrões de Engajamento</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                <span className="text-sm">Taxa de Curtidas Média</span>
                <span className="font-bold text-primary">8.5%</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                <span className="text-sm">Taxa de Comentários</span>
                <span className="font-bold text-accent">2.3%</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                <span className="text-sm">Taxa de Saves</span>
                <span className="font-bold text-primary">4.1%</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg">
                <span className="text-sm">Taxa de Shares</span>
                <span className="font-bold text-accent">1.8%</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card className="p-6 bg-gradient-card border-border">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg">Análise de Comentários</h3>
            </div>
            <div className="space-y-3">
              {mockComments.map((comment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-background/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {comment.sentiment === "positive" ? "😊" : "💭"}
                    </span>
                    <span>{comment.text}</span>
                  </div>
                  <Badge variant="outline">{comment.count} vezes</Badge>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="p-6 bg-gradient-primary text-white">
        <div className="flex items-start gap-4">
          <Lightbulb className="w-8 h-8 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-xl mb-2">Próximos Passos</h3>
            <p className="text-white/90 mb-4">
              Para funcionar com dados reais, você precisará integrar uma API de scraping do Instagram:
            </p>
            <ul className="space-y-2 text-sm text-white/80">
              <li>• <strong>Apify Instagram Scraper</strong> - Recomendado (pago)</li>
              <li>• <strong>RapidAPI Instagram APIs</strong> - Várias opções disponíveis</li>
              <li>• <strong>Phantombuster</strong> - Automação e scraping</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};
