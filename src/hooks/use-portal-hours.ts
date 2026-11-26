import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_HOURS, type PortalHours } from "@/lib/portal-hours";

// US-49: opening hours set by the administrator (single row of public.portal_hours).
export function usePortalHours() {
  return useQuery({
    queryKey: ["portal-hours"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PortalHours> => {
      const { data } = await supabase
        .from("portal_hours")
        .select("open_hour,close_hour,enabled")
        .maybeSingle();
      return data ?? DEFAULT_HOURS;
    },
  });
}
