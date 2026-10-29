// Slovenski nevronski govor prek Azure Speech (sl-SI-PetraNeural / sl-SI-RokNeural)
export const runtime = "nodejs";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return Response.json({ error: "Azure Speech ni nastavljen" }, { status: 503 });
  }

  let body: { text?: string; rate?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Neveljavna zahteva" }, { status: 400 });
  }

  const text = String(body.text ?? "").replace(/[»«]/g, "").trim().slice(0, 1500);
  if (!text) return Response.json({ error: "Prazno besedilo" }, { status: 400 });

  const voice = process.env.AZURE_TTS_VOICE || "sl-SI-PetraNeural";
  const rate = Math.min(1.5, Math.max(0.6, Number(body.rate) || 1));
  const ratePct = `${rate >= 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sl-SI">` +
    `<voice name="${esc(voice)}"><prosody rate="${ratePct}">${esc(text)}</prosody></voice></speak>`;

  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "urnik-generator",
    },
    body: ssml,
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("Azure TTS napaka", r.status, detail);
    return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
  }

  return new Response(r.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
