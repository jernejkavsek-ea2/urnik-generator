// Brskalnik tu preveri, ali je govor na strežniku nastavljen (brez razkrivanja ključev)
import { provider, voiceName } from "@/lib/speech-provider";

export const dynamic = "force-dynamic";

export function GET() {
  const p = provider();
  return Response.json({ tts: !!p, stt: !!p, provider: p, voice: p ? voiceName() : null });
}
