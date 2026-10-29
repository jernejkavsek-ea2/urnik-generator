// Kateri ponudnik govora je nastavljen: Google (prednost) ali Azure
export type Provider = "google" | "azure" | null;

export function provider(): Provider {
  if (process.env.GOOGLE_API_KEY) return "google";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  return null;
}

export function voiceName(): string {
  if (provider() === "google") return process.env.GOOGLE_TTS_VOICE || "sl-SI-Chirp3-HD-Kore";
  return process.env.AZURE_TTS_VOICE || "sl-SI-PetraNeural";
}
