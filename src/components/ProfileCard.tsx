import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Image, TrendingUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileCardProps {
  profile: {
    id: string;
    username: string;
    url: string;
    avatar: string;
    followers: number;
    posts: number;
    engagement: string;
  };
}

export const ProfileCard = ({ profile }: ProfileCardProps) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <Card className="p-6 bg-gradient-card border-border hover:shadow-glow transition-all duration-300">
      <div className="flex items-start gap-4 mb-4">
        <Avatar className="w-16 h-16 border-2 border-primary">
          <AvatarImage src={profile.avatar} alt={profile.username} />
          <AvatarFallback>{profile.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">@{profile.username}</h3>
          <Badge variant="secondary" className="mb-2">
            <TrendingUp className="w-3 h-3 mr-1" />
            {profile.engagement}% engajamento
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            Seguidores
          </span>
          <span className="font-semibold">{formatNumber(profile.followers)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Image className="w-4 h-4" />
            Posts
          </span>
          <span className="font-semibold">{profile.posts}</span>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full mt-4"
        onClick={() => window.open(profile.url, "_blank")}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Ver Perfil
      </Button>
    </Card>
  );
};
