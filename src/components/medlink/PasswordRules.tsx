import { z } from "zod";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const RULES: [string, (v: string) => boolean][] = [
  ["12 caractères minimum", (v) => v.length >= 12],
  ["Une majuscule", (v) => /[A-Z]/.test(v)],
  ["Une minuscule", (v) => /[a-z]/.test(v)],
  ["Un chiffre", (v) => /\d/.test(v)],
  ["Un caractère spécial", (v) => /[^A-Za-z0-9]/.test(v)],
];

export const passwordSchema = z
  .string()
  .max(128)
  .refine(
    (v) => RULES.every(([, t]) => t(v)),
    "Le mot de passe ne respecte pas les règles de sécurité",
  );

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
      {RULES.map(([label, test]) => {
        const ok = test(value);
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
          </li>
        );
      })}
    </ul>
  );
}
