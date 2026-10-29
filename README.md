# Urnik generator

Delujoča verzija prototipa urnika (eAsistent) z **naravnim slovenskim govorom**
in **glasovnimi ukazi**, pripravljena za Vercel / v0.

## Kako deluje govor

- `public/urnik.html` – aplikacija (izvoz iz Claude Design, nespremenjena logika).
- `public/speech-bridge.js` – preusmeri brskalnikov govor na strežnik:
  - **govor** → `/api/tts` → Azure Speech, nevronski glas `sl-SI-PetraNeural` (ali `sl-SI-RokNeural`)
  - **mikrofon** → posnetek v brskalniku → `/api/stt` → Azure prepoznava `sl-SI`
  - snemanje se samo ustavi, ko utihnete (~1,3 s); deluje v Chromu, Safariju, Firefoxu in na telefonu.
- Če Azure ni nastavljen, aplikacija uporabi vgrajeni glas brskalnika (kot prej).

## Nastavitev (enkratno)

1. V [Azure portalu](https://portal.azure.com) ustvarite vir **Speech service**
   (cenovni nivo *Free F0* zadošča za začetek, regija npr. *West Europe*).
2. Pod *Keys and Endpoint* kopirajte **Key 1** in **Location/Region**.
3. Na Vercelu: *Project → Settings → Environment Variables* dodajte
   - `AZURE_SPEECH_KEY` = vaš ključ
   - `AZURE_SPEECH_REGION` = npr. `westeurope`
   - (neobvezno) `AZURE_TTS_VOICE` = `sl-SI-RokNeural` za moški glas
4. Ponovno objavite (*Redeploy*).

## Lokalno

```bash
npm install
cp .env.example .env.local   # vpišite ključ
npm run dev
```
