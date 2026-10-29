// Naraven slovenski govor: ElevenLabs (Eleven v3), Google Chirp 3 HD ali Azure Neural
import { provider, ttsProvider, voiceName } from "@/lib/speech-provider";

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
  const speed = Math.min(1.2, Math.max(0.7, rate));
  const call = (opts: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, ...opts }),
    });
  // Slovenščina mora biti vedno vsiljena (sicer model prvi stavek včasih prebere angleško).
  // Če model ne sprejme hitrosti, poskusimo brez nje – jezik pa ostane.
  const attempts: Record<string, unknown>[] = [
    { language_code: "sl", voice_settings: { speed } },
    { language_code: "sl" },
    { language_code: "slv" },
    {},
  ];
  let r = await call(attempts[0]);
  for (let i = 1; i < attempts.length && (r.status === 400 || r.status === 422); i++) {
    console.warn("ElevenLabs zavrnil nastavitve", JSON.stringify(attempts[i - 1]), (await r.text().catch(() => "")).slice(0, 300));
    r = await call(attempts[i]);
  }
  if (!r.ok) {
    console.error("ElevenLabs TTS napaka", r.status, await r.text().catch(() => ""));
    return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
  }
  return new Response(r.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
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
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
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
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" } });
}

// Gemini TTS: vrne surov PCM (24 kHz, 16-bit) – zavijemo ga v WAV
function pcmToWav(pcm: Buffer, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function geminiTts(text: string, _rate: number): Promise<Response> {
  const key = process.env.GEMINI_API_KEY!;
  const voice = process.env.GEMINI_TTS_VOICE || "Kore";
  const models = [process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }], // samo besedilo – vsako navodilo bi model prebral na glas
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (!r.ok) {
      console.error("Gemini TTS napaka", model, r.status, (await r.text().catch(() => "")).slice(0, 300));
      continue;
    }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) continue;
    const m = /rate=(\d+)/.exec(part.mimeType || "");
    return new Response(pcmToWav(Buffer.from(part.data, "base64"), m ? +m[1] : 24000), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  }
  return Response.json({ error: "Govora ni bilo mogoče ustvariti" }, { status: 502 });
}

function speak(rawText: unknown, rawRate: unknown): Promise<Response> | Response {
  const p = ttsProvider();
  if (!p) return Response.json({ error: "Govor ni nastavljen" }, { status: 503 });
  const text = String(rawText ?? "").replace(/[»«]/g, "").trim().slice(0, 1500);
  if (!text) return Response.json({ error: "Prazno besedilo" }, { status: 400 });
  const rate = Math.min(1.5, Math.max(0.6, Number(rawRate) || 1));
  if (p === "gemini") return geminiTts(text, rate);
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
