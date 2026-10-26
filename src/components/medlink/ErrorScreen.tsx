import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

export function ErrorScreen({
  code,
  title,
  message,
  onRetry,
  action,
}: {
  code: string;
  title: string;
  message: string;
  onRetry?: () => void;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Logo className="mb-10" />
      <div className="card-surface w-full max-w-md p-8 text-center">
        <p className="font-display text-5xl font-semibold text-primary">{code}</p>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onRetry && <Button onClick={onRetry}>Réessayer</Button>}
          <Button variant={onRetry ? "outline" : "default"} asChild>
            <Link to={action?.to ?? "/"}>{action?.label ?? "Retour à l'accueil"}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
