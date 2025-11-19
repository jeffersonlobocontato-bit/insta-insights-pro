import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Instagram } from "lucide-react";

interface AddProfileDialogProps {
  children: React.ReactNode;
  onAdd: (url: string) => void;
}

export const AddProfileDialog = ({ children, onAdd }: AddProfileDialogProps) => {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.includes("instagram.com")) {
      toast.error("Por favor, insira uma URL válida do Instagram");
      return;
    }

    onAdd(url);
    toast.success("Perfil adicionado com sucesso!");
    setUrl("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="w-5 h-5 text-primary" />
            Adicionar Perfil do Instagram
          </DialogTitle>
          <DialogDescription>
            Cole o link do perfil do Instagram que você deseja analisar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="https://instagram.com/username"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              ⚠️ <strong>Nota:</strong> Para escanear perfis reais, você precisará de uma API de terceiros 
              (como Apify Instagram Scraper). Esta é uma versão demo com dados simulados.
            </p>
          </div>
          <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90">
            Adicionar Perfil
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
