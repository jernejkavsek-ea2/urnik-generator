// Prepoznava slovenskega govora prek Azure Speech (kratki posnetki do 60 s)
export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return Response.json({ error: "Azure Speech ni nastavljen" }, { status: 503 });
  }

  const audio = await req.arrayBuffer();
  if (!audio.byteLength) return Response.json({ error: "Ni zvoka" }, { status: 400 });
  if (audio.byteLength > 4_000_000) return Response.json({ error: "Posnetek je predolg" }, { status: 413 });

  const lang = new URL(req.url).searchParams.get("lang") || "sl-SI";
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(lang)}&format=simple&profanity=raw`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: audio,
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("Azure STT napaka", r.status, detail);
    return Response.json({ error: "Prepoznava ni uspela" }, { status: 502 });
  }

  const j = (await r.json()) as { RecognitionStatus?: string; DisplayText?: string };
  const text = j.RecognitionStatus === "Success" ? j.DisplayText ?? "" : "";
  return Response.json({ text, status: j.RecognitionStatus ?? "Unknown" });
}
