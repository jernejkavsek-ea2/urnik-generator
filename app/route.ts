// Domača stran: aplikacijo (urnik.html) beremo neposredno z GitHuba (veja main).
// Tako se nova verzija HTML-ja objavi sama, ko jo naložimo na GitHub – brez ponovne objave na Vercelu.
// Če GitHub ni dosegljiv, se prikaže kopija iz te objave (public/urnik.html).
export const dynamic = "force-dynamic";

const SOURCE =
  process.env.URNIK_HTML_URL ||
  "https://raw.githubusercontent.com/jernejkavsek-ea2/urnik-generator/main/public/urnik.html";

export async function GET(req: Request) {
  try {
    const r = await fetch(SOURCE, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const html = await r.text();
    if (!html.includes("speech-bridge.js")) throw new Error("HTML brez speech-bridge");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Vercel CDN hrani kopijo 60 s, nato jo v ozadju osveži z GitHuba
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("Branje urnik.html z GitHuba ni uspelo:", e);
    return Response.redirect(new URL("/urnik.html", req.url), 307);
  }
}
