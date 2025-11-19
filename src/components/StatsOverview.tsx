import { Card } from "@/components/ui/card";
import { Users, Image, TrendingUp, Target } from "lucide-react";

interface StatsOverviewProps {
  profiles: any[];
}

export const StatsOverview = ({ profiles }: StatsOverviewProps) => {
  const totalFollowers = profiles.reduce((sum, p) => sum + p.followers, 0);
  const totalPosts = profiles.reduce((sum, p) => sum + p.posts, 0);
  const avgEngagement = (
    profiles.reduce((sum, p) => sum + parseFloat(p.engagement), 0) / profiles.length
  ).toFixed(2);

  const stats = [
    {
      title: "Perfis Monitorados",
      value: profiles.length,
      icon: Target,
      color: "text-primary",
    },
    {
      title: "Total de Seguidores",
      value: totalFollowers.toLocaleString(),
      icon: Users,
      color: "text-accent",
    },
    {
      title: "Total de Posts",
      value: totalPosts,
      icon: Image,
      color: "text-primary",
    },
    {
      title: "Engajamento Médio",
      value: `${avgEngagement}%`,
      icon: TrendingUp,
      color: "text-accent",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card
            key={index}
            className="p-6 bg-gradient-card border-border hover:shadow-card transition-all duration-300"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl bg-background/50 ${stat.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
