import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * US-16: the patient deletes his account.
 * 1. delete_my_account() runs with the patient's own token: it checks the role and the confirmation,
 *    cancels future appointments, removes identifying data and returns the files to delete.
 * 2. With the service role, the files are removed from Storage and the login is deleted.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("SUPPRIMER") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("delete_my_account", {
      _confirm: data.confirm,
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const files = ((result as { files?: string[] } | null)?.files ?? []).filter(
      (f): f is string => typeof f === "string" && f.startsWith(`${context.userId}/`),
    );
    if (files.length) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("patient-documents")
        .remove(files);
      if (storageError) console.error("[privacy] storage cleanup", storageError);
    }
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (authError) {
      console.error("[privacy] auth deletion", authError);
      throw new Error("DELETE_FAILED");
    }
    return { ok: true as const };
  });
