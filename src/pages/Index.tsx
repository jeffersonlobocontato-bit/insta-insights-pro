import { useState } from "react";
import { AddProfileDialog } from "@/components/AddProfileDialog";
import { ProfileCard } from "@/components/ProfileCard";
import { StatsOverview } from "@/components/StatsOverview";
import { AnalysisSection } from "@/components/AnalysisSection";
import { Button } from "@/components/ui/button";
import { Instagram, Plus, TrendingUp } from "lucide-react";

const Index = () => {
  const [profiles, setProfiles] = useState<any[]>([]);

  const handleAddProfile = (url: string) => {
    // Mock profile data - In production, this would call an API
    const newProfile = {
      id: Date.now().toString(),
      username: url.split("/").pop() || "user",
      url,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      followers: Math.floor(Math.random() * 100000) + 1000,
      posts: Math.floor(Math.random() * 500) + 10,
      engagement: (Math.random() * 10 + 1).toFixed(2),
      addedAt: new Date().toISOString(),
    };
    setProfiles([...profiles, newProfile]);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Instagram className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  InstaAnalytics
                </h1>
                <p className="text-sm text-muted-foreground">Análise de Conteúdo Instagram</p>
              </div>
            </div>
            <AddProfileDialog onAdd={handleAddProfile}>
              <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Perfil
              </Button>
            </AddProfileDialog>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-card flex items-center justify-center mb-6 shadow-card">
              <TrendingUp className="w-12 h-12 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Comece a Análise</h2>
            <p className="text-muted-foreground max-w-md mb-8">
              Adicione perfis do Instagram para analisar métricas de engajamento, 
              identificar padrões de conteúdo e gerar insights valiosos.
            </p>
            <AddProfileDialog onAdd={handleAddProfile}>
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 transition-opacity">
                <Plus className="w-5 h-5 mr-2" />
                Adicionar Primeiro Perfil
              </Button>
            </AddProfileDialog>
          </div>
        ) : (
          <div className="space-y-8">
            <StatsOverview profiles={profiles} />
            
            <div>
              <h2 className="text-2xl font-bold mb-4">Perfis Monitorados</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profiles.map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} />
                ))}
              </div>
            </div>

            <AnalysisSection profiles={profiles} />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
