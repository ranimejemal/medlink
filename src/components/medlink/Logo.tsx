import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";

export function Logo({
  className,
  inverted = false,
  subtitle = true,
}: {
  className?: string;
  inverted?: boolean;
  subtitle?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 w-9 shrink-0" />
      <div className="leading-tight">
        <p
          className={cn(
            "font-display text-[15px] font-bold tracking-[0.14em]",
            inverted ? "text-sidebar-accent-foreground" : "text-[#5B7FFF]",
          )}
        >
          MEDLINK
        </p>
        {subtitle && (
          <p
            className={cn(
              "text-[11px]",
              inverted ? "text-sidebar-foreground/70" : "text-muted-foreground",
            )}
          >
            Portail médical sécurisé
          </p>
        )}
      </div>
    </div>
  );
}
