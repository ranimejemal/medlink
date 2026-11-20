// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { base64 } = await req.json();
    if (!base64) {
      return Response.json({ error: "base64 manquant" }, { status: 400, headers: corsHeaders });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY non configurée" }, { status: 500, headers: corsHeaders });
    }

    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } }],
      }),
    });

    if (!res.ok) {
      return Response.json({ error: "Échec modération" }, { status: 502, headers: corsHeaders });
    }

    const json = await res.json();
    const r = json.results?.[0];
    const sexual = r?.category_scores?.sexual ?? 0;
    const violence = r?.category_scores?.["violence/graphic"] ?? 0;

    return Response.json(
      { flagged: sexual > 0.6 || violence > 0.8, sexual, violence },
      { headers: corsHeaders },
    );
  } catch (_e) {
    return Response.json({ error: "Erreur serveur" }, { status: 500, headers: corsHeaders });
  }
});