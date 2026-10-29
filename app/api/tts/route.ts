// Naraven slovenski govor: ElevenLabs (Eleven v3), Google Chirp 3 HD ali Azure Neural
import { provider, voiceName } from "@/lib/speech-provider";

export const runtime = "nodejs";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function elevenTts(text: string, rate: number): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY!;
  const model = process.env.ELEVENLABS_MODEL || "eleven_v3";
  const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceName())}`;
  // /stream: zvok začne prihajati takoj, brskalnik ga predvaja sproti
  const url = `${base}/stream?output_format=mp3_44100_64`;
  const call = (extra: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        ...(extra
          ? { language_code: "sl", voice_settings: { speed: Math.min(1.2, Math.max(0.7, rate)) } }
          : {}),
      }),
    });
  let r = await call(true);
  if (r.status === 400 || r.status === 422) r = await call(false); // model ne sprejme dodatnih nastavitev
  if (!r.ok) {
    console.error("ElevenLabs TTS napaka", r.status, await r.text().catch(() => ""));
    return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
  }
  return new Response(r.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}

async function googleTts(text: string, rate: number): Promise<Response> {
  const key = process.env.GOOGLE_API_KEY!;
  const voice = voiceName();
  const languageCode = voice.split("-").slice(0, 2).join("-") || "sl-SI";
  const call = (withRate: boolean) =>
    fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voice },
        audioConfig: { audioEncoding: "MP3", ...(withRate ? { speakingRate: rate } : {}) },
      }),
    });
  let r = await call(true);
  if (r.status === 400) r = await call(false); // nekateri glasovi ne sprejmejo hitrosti
  if (!r.ok) {
    console.error("Google TTS napaka", r.status, await r.text().catch(() => ""));
    return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
  }
  const j = (await r.json()) as { audioContent?: string };
  if (!j.audioContent) return Response.json({ error: "Prazen odgovor" }, { status: 502 });
  return new Response(Buffer.from(j.audioContent, "base64"), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}

async function azureTts(text: string, rate: number): Promise<Response> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const ratePct = `${rate >= 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sl-SI">` +
    `<voice name="${esc(voiceName())}"><prosody rate="${ratePct}">${esc(text)}</prosody></voice></speak>`;
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
    console.error("Azure TTS napaka", r.status, await r.text().catch(() => ""));
    return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
  }
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
}

function speak(rawText: unknown, rawRate: unknown): Promise<Response> | Response {
  const p = provider();
  if (!p) return Response.json({ error: "Govor ni nastavljen" }, { status: 503 });
  const text = String(rawText ?? "").replace(/[»«]/g, "").trim().slice(0, 1500);
  if (!text) return Response.json({ error: "Prazno besedilo" }, { status: 400 });
  const rate = Math.min(1.5, Math.max(0.6, Number(rawRate) || 1));
  if (p === "elevenlabs") return elevenTts(text, rate);
  return p === "google" ? googleTts(text, rate) : azureTts(text, rate);
}

// GET /api/tts?t=besedilo&r=1 – brskalnik ga predvaja neposredno v <audio> (pretakanje + predpomnilnik)
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return speak(q.get("t"), q.get("r"));
}

export async function POST(req: Request) {
  let body: { text?: string; rate?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Neveljavna zahteva" }, { status: 400 });
  }
  return speak(body.text, body.rate);
}
