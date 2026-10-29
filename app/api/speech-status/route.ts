// Brskalnik tu preveri, ali je govor na strežniku nastavljen (brez razkrivanja ključev)
import { provider, voiceName } from "@/lib/speech-provider";

export const dynamic = "force-dynamic";

export function GET() {
  const p = provider();
  return Response.json({
    tts: !!p,
    stt: !!p,
    // Pri ElevenLabs (brezplačni paket) za mikrofon raje uporabimo prepoznavo brskalnika,
    // kjer obstaja (Chrome, Edge) – tako se krediti porabijo samo za govor.
    preferNativeStt: p === "elevenlabs",
    provider: p,
    ai: Boolean(process.env.GEMINI_API_KEY),
    voice: p ? voiceName() : null,
  });
}
