<div align="center">

<img src="docs/media/hero.svg" alt="Iteron — two spinner candidates side by side, code streaming with tokens per second, A picked and the evolution tree growing" width="100%">

<p>
  <a href="https://iteron.vercel.app"><img alt="Live" src="https://img.shields.io/badge/live-start%20evolving-4ef08a?style=for-the-badge&labelColor=04100a"></a>
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini%20Flash-streaming-ffd84f?style=for-the-badge&labelColor=04100a">
  <img alt="p5.js" src="https://img.shields.io/badge/p5.js-live%20sketches-5ab0ff?style=for-the-badge&labelColor=04100a">
  <img alt="D3" src="https://img.shields.io/badge/D3-evolution%20tree-4ef08a?style=for-the-badge&labelColor=04100a">
</p>

<p><em>AI code generation as a live, visual, evolutionary loop.<br>
Instead of asking a model for one answer, you breed answers.</em></p>

<a href="https://iteron.vercel.app"><img src="docs/screenshots/ab-test.png" alt="Two generated spinners side by side" width="100%"></a>

</div>

<img src="docs/media/divider.svg" width="100%" alt="">

## How it works

Every round spawns **two candidates side by side**. You pick the winner, and it seeds the next generation, keeping its lineage while mutating just enough to stay surprising (80 % lineage, 20 % mutation). When you find one you love, ship it as React, CSS or Lottie, or as a real animated cursor for Windows, Linux or Chrome.

```mermaid
flowchart LR
  S[Seed sketch] --> G[Gemini · two candidates<br/>streamed p5.js]
  G --> A[A] & B[B]
  A --> P{You pick}
  B --> P
  P --> W[Winner = parent<br/>80 % lineage · 20 % mutation] --> G
  W --> X[Export · React / CSS / Lottie / OS cursor]
  W --> T[Evolution tree · D3]
```

<img src="docs/media/divider.svg" width="100%" alt="">

## Features

| | |
|---|---|
| **A/B evolution** | Two candidates per round; the winner parents the next. |
| **Live streaming** | Watch the model write p5.js in real time, with tokens-per-second telemetry. |
| **Speed chart** | A timeline of generation speed and throughput. |
| **Evolution tree** | The full lineage of every mutation; jump back to any ancestor. |
| **Audio reactive** | Turn on the microphone and the spinners pulse with sound. |
| **Live controls** | Speed, hue, aspect ratio, play / pause and theme on the fly. |
| **Custom seed and prompts** | Paste your own sketch and steer any round in plain language. |
| **Export** | React, CSS, Lottie, or a zipped animated cursor pack. |

<img src="docs/media/divider.svg" width="100%" alt="">

## What the model is asked for

Each candidate comes back as structured JSON (`mutationName`, `reasoning`, `p5Code`) from Gemini 3 Flash, so the UI never has to scrape code out of prose. The brief is strict because the output has to survive being a 32 × 32 cursor:

| Rule | Why |
|---|---|
| 400 × 400 canvas, drawing kept inside a 380 px safe zone, space filled | Spinners are cropped and scaled; nothing important may sit at the edge. |
| Thick strokes (above 15 px at 400 px), bold shapes, no tiny detail | Detail disappears at cursor size. |
| WCAG AA contrast against both white and near-black backgrounds | A cursor has to read on any desktop. |
| Motion from `millis()` / `frameCount`, sine, rotation and noise; no modulo resets | Loops must be seamless, never a visible jump. |
| With a parent: keep 80 % of its logic, mutate 20 % drastically | Lineage you can recognise, surprise you can choose. |

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/studio.png" alt="The studio: candidates, terminal and controls"></td>
    <td width="50%"><img src="docs/screenshots/mobile.png" alt="Mobile layout"></td>
  </tr>
  <tr>
    <td align="center"><code>studio</code> · candidates, live code, speed chart</td>
    <td align="center"><code>mobile</code></td>
  </tr>
</table>

<img src="docs/media/divider.svg" width="100%" alt="">

## The public gallery

Finished spinners can be published to an Explore gallery backed by Firestore. The rules are narrow: anyone can read, only a signed-in user (Google sign-in) can create, and a new spinner must pass a shape check. The only update allowed is incrementing its like count by exactly one. The gallery shows the latest 50.

<img src="docs/media/divider.svg" width="100%" alt="">

## Türkçe özet

**Iteron**, yapay zekânın kod üretimini canlı izleyebildiğin evrimsel bir geliştirme oyun alanı. Her turda iki aday üretiliyor; beğendiğini seçiyorsun, o aday bir sonraki neslin ebeveyni oluyor. Gemini'nin p5.js kodunu gerçek zamanlı yazışını, saniyedeki token hızını ve tüm soy ağacını görebiliyorsun. Sonucu React, CSS ya da Lottie koduna çevirebilir veya Windows, Linux ve Chrome için animasyonlu imleç olarak indirebilirsin.

<img src="docs/media/divider.svg" width="100%" alt="">

## Development

```sh
npm install
echo "GEMINI_API_KEY=..." > .env.local   # Firebase config lives in firebaseConfig.ts
npm run dev
npm run build
```

<div align="center">
<br>
<a href="https://github.com/kutluhangil"><img src="docs/media/signature.svg" width="100%" alt="Built by kutluhangil"></a>
<sub>Generate. Compare. Evolve. · the round in the banner is illustrative.</sub>
</div>
