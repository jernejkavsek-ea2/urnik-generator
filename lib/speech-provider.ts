// Kateri ponudnik govora je nastavljen: ElevenLabs, Google ali Azure (prvi nastavljeni)
export type Provider = "elevenlabs" | "google" | "azure" | null;

export function provider(): Provider {
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.GOOGLE_API_KEY) return "google";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  return null;
}

// Privzeti ElevenLabs glas: "Sarah" (premade, večjezični). Zamenjate ga z ELEVENLABS_VOICE_ID.
export const ELEVEN_DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

export function voiceName(): string {
  const p = provider();
  if (p === "elevenlabs") return process.env.ELEVENLABS_VOICE_ID || ELEVEN_DEFAULT_VOICE;
  if (p === "google") return process.env.GOOGLE_TTS_VOICE || "sl-SI-Chirp3-HD-Kore";
  return process.env.AZURE_TTS_VOICE || "sl-SI-PetraNeural";
}
