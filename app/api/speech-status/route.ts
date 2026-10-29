// Brskalnik tu preveri, ali je govor na strežniku nastavljen (brez razkrivanja ključev)
import { provider, ttsProvider, voiceName } from "@/lib/speech-provider";

export const dynamic = "force-dynamic";

export function GET() {
  const p = provider();
  const tp = ttsProvider();
  return Response.json({
    tts: !!tp,
    ttsProvider: tp,
    // verzija glasu: ob menjavi ponudnika/glasu/modela brskalnik ne uporabi starih posnetkov iz predpomnilnika
    ttsVersion: [tp, process.env.TTS_PROVIDER, process.env.GEMINI_TTS_VOICE, process.env.GEMINI_TTS_MODEL, process.env.ELEVENLABS_VOICE_ID, process.env.ELEVENLABS_MODEL, "3"].map((x) => x || "").join("."),
    stt: !!p,
    // Pri ElevenLabs (brezplačni paket) za mikrofon raje uporabimo prepoznavo brskalnika,
    // kjer obstaja (Chrome, Edge) – tako se krediti porabijo samo za govor.
    preferNativeStt: p === "elevenlabs",
    provider: p,
    ai: Boolean(process.env.GEMINI_API_KEY),
    voice: p ? voiceName() : null,
  });
}
