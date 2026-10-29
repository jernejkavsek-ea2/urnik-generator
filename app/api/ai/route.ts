// Pametni pogovor: ko vgrajeni razčlenjevalnik ukaza ne razume, vprašanje razloži Gemini.
// Vrne bodisi ukaz, ki ga aplikacija zna izvesti, bodisi kratek odgovor iz podatkov urnika.
export const runtime = "nodejs";

const SYSTEM = `Si glasovni pomočnik v urejevalniku šolskega urnika (eAsistent). Uporabnik je ravnatelj ali pripravljavec urnika.

Aplikacija zna izvesti SAMO te ukaze. Če uporabnik želi dejanje, ga pretvori v ENEGA od njih, natanko v tej obliki (sklanjaj predmet, dan in uro kot v primerih):
- prestavi <predmet> <oddelek> na <dan>, <N>. uro        npr. "prestavi matematiko 7.b na sredo, 3. uro"
- zakleni <predmet> <oddelek> v <dan>                     npr. "zakleni angleščino 8.a v petek"
- odkleni <predmet> <oddelek> v <dan>
- pokaži urnik <Ime Priimek>                              npr. "pokaži urnik Nine Kos"
- pokaži <oddelek>                                        npr. "pokaži 9.a"
- pokaži <prostor>                                        npr. "pokaži telovadnico"
- pokaži neskladja
- reši neskladja
- zakaj je <predmet> <oddelek> v <dan>                    npr. "zakaj je matematika 7.b v ponedeljek"
- zakaj ima <Priimek> vrzel
- <Ime Priimek> ne more v <dan>   /   <Ime Priimek> ima en prost dan   /   <oddelek> največ <N> ur na dan   (želje)
- odpri napoved realizacije
- objavi urnik
- razveljavi
- stanje urnika
- kaj je neskladje
- kaj vse znaš
Uporabi le imena učiteljev, oddelke in prostore iz podatkov. Oddelek piši kot "7.b".

Če uporabnik sprašuje nekaj, kar lahko odgovoriš iz podatkov urnika (kdaj ima kdo kaj, koliko ur, kje so neskladja, kaj je treba še urediti), odgovori sam v polju "answer".
Če bi mu po odgovoru koristil ukaz, ga dodaj v "chips" (največ 3, v obliki ukaza zgoraj, npr. "Pokaži neskladja", "Reši neskladja").
Če zahteva ni povezana z urnikom ali je ne moreš izpolniti, to vljudno povej in predlagaj, kaj znaš.

Pravila za "answer": slovenščina, vikanje, 1–3 kratki stavki (odgovor se tudi prebere na glas), brez klicajev, brez "Super" ali "Odlično", konkretne številke, brez tehničnega žargona, brez oznak markdown. Ne izmišljuj si podatkov, ki jih ni v kontekstu.
Vrni samo JSON: {"command": string|null, "answer": string|null, "chips": string[]}. Če vrneš command, je answer null.`;

type Out = { command: string | null; answer: string | null; chips: string[] };

async function gemini(model: string, key: string, user: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    // ključ v glavi deluje za stare (AIza…) in nove (AQ.…) ključe
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            command: { type: "STRING", nullable: true },
            answer: { type: "STRING", nullable: true },
            chips: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["command", "answer", "chips"],
        },
        ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "AI ni nastavljen" }, { status: 503 });

  let body: { text?: string; ctx?: unknown; history?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Neveljavna zahteva" }, { status: 400 });
  }
  const text = String(body.text ?? "").trim().slice(0, 500);
  if (!text) return Response.json({ error: "Prazno vprašanje" }, { status: 400 });

  const ctx = JSON.stringify(body.ctx ?? {}).slice(0, 60000);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8).join("\n").slice(0, 3000);
  const user = `PODATKI URNIKA (JSON):\n${ctx}\n\nZADNJI POGOVOR:\n${history || "(ni)"}\n\nUPORABNIK: ${text}`;

  const models = [process.env.GEMINI_MODEL || "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  for (const model of models) {
    try {
      const r = await gemini(model, key, user);
      if (!r.ok) {
        console.error("Gemini napaka", model, r.status, (await r.text().catch(() => "")).slice(0, 500));
        continue; // npr. 429 (omejitev) -> poskusi drug model
      }
      const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const out = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Out;
      return Response.json({
        command: typeof out.command === "string" && out.command.trim() ? out.command.trim() : null,
        answer: typeof out.answer === "string" && out.answer.trim() ? out.answer.trim() : null,
        chips: Array.isArray(out.chips) ? out.chips.filter((c) => typeof c === "string").slice(0, 3) : [],
      });
    } catch (e) {
      console.error("Gemini izjema", model, e);
    }
  }
  return Response.json({ error: "Pomočnik trenutno ni dosegljiv" }, { status: 502 });
}
