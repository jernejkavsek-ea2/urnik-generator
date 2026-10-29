// Brskalnik tu preveri, ali je Azure Speech nastavljen (brez razkrivanja ključa)
export const dynamic = "force-dynamic";

export function GET() {
  const ok = Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
  return Response.json({ tts: ok, stt: ok, voice: process.env.AZURE_TTS_VOICE || "sl-SI-PetraNeural" });
}
