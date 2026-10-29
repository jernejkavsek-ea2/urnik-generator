# Urnik generator

Delujoča verzija prototipa urnika (eAsistent) z **naravnim slovenskim govorom**
in **glasovnimi ukazi**, pripravljena za Vercel / v0.

## Kako deluje govor

- `public/urnik.html` – aplikacija (izvoz iz Claude Design, nespremenjena logika).
- `public/speech-bridge.js` – preusmeri brskalnikov govor na strežnik:
  - **govor** → `/api/tts` → Google Chirp 3 HD (`sl-SI-Chirp3-HD-Kore`) ali Azure (`sl-SI-PetraNeural`)
  - **mikrofon** → posnetek v brskalniku → `/api/stt` → Google ali Azure prepoznava `sl-SI`
  - snemanje se samo ustavi, ko utihnete (~1,3 s); deluje v Chromu, Safariju, Firefoxu in na telefonu.
- Če Azure ni nastavljen, aplikacija uporabi vgrajeni glas brskalnika (kot prej).

## Nastavitev (enkratno) – izberite eno možnost

### A) Google (priporočeno)
1. Na [console.cloud.google.com](https://console.cloud.google.com) ustvarite projekt.
2. Omogočite **Cloud Text-to-Speech API** in **Cloud Speech-to-Text API** (zahteva vklopljeno plačevanje; prvi milijon znakov govora na mesec je brezplačen).
3. *APIs & Services → Credentials → Create credentials → API key*. Ključ omejite na ta dva API-ja.
4. Na Vercelu (*Settings → Environment Variables*) dodajte `GOOGLE_API_KEY`.
   Neobvezno: `GOOGLE_TTS_VOICE` (npr. `sl-SI-Chirp3-HD-Kore`, `sl-SI-Chirp3-HD-Leda`, `sl-SI-Chirp3-HD-Charon`).

### B) Azure Speech
1. V [Azure portalu](https://portal.azure.com) ustvarite vir **Speech service** (*Free F0*, regija *West Europe*).
2. Na Vercelu dodajte `AZURE_SPEECH_KEY` in `AZURE_SPEECH_REGION` (npr. `westeurope`); neobvezno `AZURE_TTS_VOICE`.

Če sta nastavljena oba, se uporabi Google. Po spremembi spremenljivk ponovno objavite (*Redeploy*).

## Lokalno

```bash
npm install
cp .env.example .env.local   # vpišite ključ
npm run dev
```
