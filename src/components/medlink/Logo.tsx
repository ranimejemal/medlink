import { cn } from "@/lib/utils";

export function Logo({ className, inverted = false, subtitle = true }: { className?: string; inverted?: boolean; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", inverted ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground")}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className={cn("font-display text-[15px] font-bold tracking-[0.14em]", inverted ? "text-sidebar-accent-foreground" : "text-primary")}>MEDLINK</p>
        {subtitle && <p className={cn("text-[11px]", inverted ? "text-sidebar-foreground/70" : "text-muted-foreground")}>Portail médical sécurisé</p>}
      </div>
    </div>
  );
}
