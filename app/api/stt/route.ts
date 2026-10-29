// Prepoznava slovenskega govora: ElevenLabs Scribe, Google Speech-to-Text ali Azure (kratki posnetki)
import { provider } from "@/lib/speech-provider";

export const runtime = "nodejs";

async function elevenStt(wav: ArrayBuffer, lang: string) {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", lang.split("-")[0] || "sl");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([wav], { type: "audio/wav" }), "govor.wav");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: form,
  });
  if (!r.ok) {
    console.error("ElevenLabs STT napaka", r.status, await r.text().catch(() => ""));
    return null;
  }
  const j = (await r.json()) as { text?: string };
  return (j.text ?? "").trim();
}

async function googleStt(wav: ArrayBuffer, lang: string) {
  const key = process.env.GOOGLE_API_KEY!;
  const pcm = Buffer.from(wav).subarray(44); // brez WAV glave: čisti 16-bitni PCM, 16 kHz
  const r = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: { encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: lang, enableAutomaticPunctuation: true, model: "default" },
      audio: { content: pcm.toString("base64") },
    }),
  });
  if (!r.ok) {
    console.error("Google STT napaka", r.status, await r.text().catch(() => ""));
    return null;
  }
  const j = (await r.json()) as { results?: { alternatives?: { transcript?: string }[] }[] };
  return (j.results ?? []).map((x) => x.alternatives?.[0]?.transcript ?? "").join(" ").trim();
}

async function azureStt(wav: ArrayBuffer, lang: string) {
  const r = await fetch(
    `https://${process.env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(lang)}&format=simple&profanity=raw`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        Accept: "application/json",
      },
      body: wav,
    },
  );
  if (!r.ok) {
    console.error("Azure STT napaka", r.status, await r.text().catch(() => ""));
    return null;
  }
  const j = (await r.json()) as { RecognitionStatus?: string; DisplayText?: string };
  return j.RecognitionStatus === "Success" ? j.DisplayText ?? "" : "";
}

export async function POST(req: Request) {
  const p = provider();
  if (!p) return Response.json({ error: "Govor ni nastavljen" }, { status: 503 });

  const wav = await req.arrayBuffer();
  if (wav.byteLength <= 44) return Response.json({ error: "Ni zvoka" }, { status: 400 });
  if (wav.byteLength > 4_000_000) return Response.json({ error: "Posnetek je predolg" }, { status: 413 });

  const lang = new URL(req.url).searchParams.get("lang") || "sl-SI";
  const text =
    p === "elevenlabs" ? await elevenStt(wav, lang) : p === "google" ? await googleStt(wav, lang) : await azureStt(wav, lang);
  if (text === null) return Response.json({ error: "Prepoznava ni uspela" }, { status: 502 });
  return Response.json({ text });
}
