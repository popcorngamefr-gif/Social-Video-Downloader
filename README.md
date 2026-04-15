# Social Videos Downloader

Application web statique + fonction Netlify pour récupérer des liens de téléchargement de vidéos depuis **TikTok**, **Instagram / Threads** et **YouTube**.

L’interface est en français, avec détection automatique de la plateforme, affichage des métadonnées (titre, auteur, miniature) et proposition de plusieurs liens de téléchargement selon les formats trouvés.

---

## ✨ Fonctionnalités

- Détection automatique du type de lien (TikTok, Instagram/Threads, YouTube).
- UI simple (champ URL + bouton de téléchargement + liste de liens).
- API backend serverless (Netlify Function) qui:
  - valide l’URL,
  - choisit la plateforme,
  - interroge plusieurs endpoints RapidAPI (fallback),
  - déduplique les liens récupérés,
  - renvoie une réponse JSON unique au frontend.
- Téléchargement côté navigateur:
  - tentative de téléchargement direct via `fetch` + Blob,
  - fallback ouverture du lien dans un nouvel onglet si la source bloque le téléchargement direct (CORS/protection distante).

---

## 🧱 Stack technique

- **Frontend**: HTML/CSS/JavaScript vanilla (`index.html`)
- **Backend**: Netlify Functions (`netlify/functions/download.js`)
- **Déploiement**: Netlify (`netlify.toml`)
- **Provider API**: RapidAPI (clé requise)

---

## 📁 Structure du projet

```text
.
├── index.html
├── netlify.toml
└── netlify/
    └── functions/
        └── download.js
```

---

## ✅ Prérequis

- Node.js 18+ (recommandé)
- Un compte Netlify (pour déploiement)
- Une clé RapidAPI valide avec accès aux APIs utilisées par la fonction

---

## 🔐 Variables d’environnement

Variable obligatoire:

- `RAPIDAPI_KEY` : clé API RapidAPI utilisée par la fonction `download`

> Sans cette variable, la fonction retourne une erreur serveur “Clé API manquante côté serveur”.

---

## 🚀 Lancer en local

### Option 1 — Avec Netlify CLI (recommandé)

1. Installer Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```
2. Ajouter une variable locale:
   - soit dans un fichier `.env` (ou `.env.local`) chargé par Netlify CLI,
   - soit via export shell:
   ```bash
   export RAPIDAPI_KEY="votre_cle_rapidapi"
   ```
3. Lancer le projet:
   ```bash
   netlify dev
   ```
4. Ouvrir l’URL locale affichée par Netlify CLI.

### Option 2 — Frontend statique seul

Vous pouvez ouvrir `index.html` directement, mais **les appels à** `/.netlify/functions/download` **ne fonctionneront pas** sans runtime Netlify.

---

## 🌍 Déploiement sur Netlify

1. Connecter le repo à Netlify.
2. Vérifier que `netlify.toml` est bien pris en compte:
   - `publish = "."`
   - `functions = "netlify/functions"`
3. Ajouter la variable d’environnement `RAPIDAPI_KEY` dans:
   - **Site configuration → Environment variables**.
4. Déployer.

---

## 🔌 API interne

### Endpoint

`POST /.netlify/functions/download`

### Body attendu

```json
{
  "url": "https://..."
}
```

### Réponse succès (200)

```json
{
  "title": "Titre vidéo",
  "author": "Auteur",
  "thumb": "https://...",
  "links": [
    {
      "label": "📹 Téléchargement 1",
      "url": "https://...",
      "quality": "HD"
    }
  ]
}
```

### Erreurs courantes

- `400` JSON invalide
- `400` URL manquante
- `400` Plateforme non supportée
- `405` Méthode non autorisée
- `500` Clé API absente
- `500` Erreur fournisseur/API distante

---

## 🧠 Plateformes supportées

- TikTok (`tiktok.com`, `vm.tiktok`)
- Instagram / Threads (`instagram.com`, `threads.net`, `threads.com`)
- YouTube (`youtube.com`, `youtu.be`)

> Note: la disponibilité des liens dépend des APIs RapidAPI interrogées et de leurs changements.

---

## ⚠️ Limites connues

- Les fournisseurs RapidAPI peuvent changer leur format de réponse ou leurs quotas.
- Certains liens vidéo refusent les téléchargements cross-origin (comportement normal côté navigateur).
- Certaines URLs peuvent être valides mais temporairement indisponibles selon les limitations des endpoints externes.

---

## 🛡️ Bonnes pratiques

- N’exposez jamais `RAPIDAPI_KEY` côté frontend.
- Gardez la clé uniquement dans les variables d’environnement Netlify.
- Respectez les conditions d’utilisation des plateformes et des fournisseurs API.
- Utilisez ce projet uniquement pour du contenu dont vous avez les droits d’usage.

---

## 📌 Maintenance / Évolutions conseillées

- Ajouter des tests unitaires pour:
  - détection de plateforme,
  - extraction d’ID (YouTube/TikTok),
  - déduplication des liens.
- Ajouter des logs structurés côté fonction pour faciliter le debug.
- Implémenter un mécanisme de rotation/feature-flag des endpoints RapidAPI.
- Ajouter une politique de retry avec backoff sur les erreurs transitoires.

---

## 📄 Licence

Aucune licence explicite n’est définie actuellement dans ce repo.
Si vous souhaitez ouvrir le projet, ajoutez un fichier `LICENSE` (MIT, Apache-2.0, etc.).

---

## ENglish bversion below

# Social Videos Downloader (English)

Static web app + Netlify function to retrieve downloadable video links from **TikTok**, **Instagram / Threads**, and **YouTube**.

The UI is in French and includes automatic platform detection, metadata rendering (title, author, thumbnail), and multiple downloadable links when available.

---

## ✨ Features

- Automatic link platform detection (TikTok, Instagram/Threads, YouTube).
- Simple UI (URL input + download button + links list).
- Serverless backend API (Netlify Function) that:
  - validates the URL,
  - detects the platform,
  - tries multiple RapidAPI endpoints (fallback strategy),
  - deduplicates extracted links,
  - returns one normalized JSON response to the frontend.
- Browser-side downloading:
  - first tries direct download via `fetch` + Blob,
  - falls back to opening the source link in a new tab when direct download is blocked (CORS/remote restrictions).

---

## 🧱 Tech stack

- **Frontend**: vanilla HTML/CSS/JavaScript (`index.html`)
- **Backend**: Netlify Functions (`netlify/functions/download.js`)
- **Deployment**: Netlify (`netlify.toml`)
- **API provider**: RapidAPI (key required)

---

## 📁 Project structure

```text
.
├── index.html
├── netlify.toml
└── netlify/
    └── functions/
        └── download.js
```

---

## ✅ Prerequisites

- Node.js 18+ (recommended)
- A Netlify account (for deployment)
- A valid RapidAPI key with access to the APIs used by the function

---

## 🔐 Environment variables

Required variable:

- `RAPIDAPI_KEY`: RapidAPI key used by the `download` function

> Without this variable, the function returns a server error (“Missing API key on server side”).

---

## 🚀 Run locally

### Option 1 — With Netlify CLI (recommended)

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```
2. Add a local variable:
   - either in a `.env` (or `.env.local`) file read by Netlify CLI,
   - or via shell export:
   ```bash
   export RAPIDAPI_KEY="your_rapidapi_key"
   ```
3. Start the project:
   ```bash
   netlify dev
   ```
4. Open the local URL shown by Netlify CLI.

### Option 2 — Static frontend only

You can open `index.html` directly, but calls to `/.netlify/functions/download` will **not** work without Netlify runtime.

---

## 🌍 Deploy on Netlify

1. Connect the repo to Netlify.
2. Ensure `netlify.toml` is used:
   - `publish = "."`
   - `functions = "netlify/functions"`
3. Add `RAPIDAPI_KEY` in:
   - **Site configuration → Environment variables**.
4. Deploy.

---

## 🔌 Internal API

### Endpoint

`POST /.netlify/functions/download`

### Expected body

```json
{
  "url": "https://..."
}
```

### Success response (200)

```json
{
  "title": "Video title",
  "author": "Author",
  "thumb": "https://...",
  "links": [
    {
      "label": "📹 Download 1",
      "url": "https://...",
      "quality": "HD"
    }
  ]
}
```

### Common errors

- `400` Invalid JSON
- `400` Missing URL
- `400` Unsupported platform
- `405` Method not allowed
- `500` Missing API key
- `500` Upstream/provider error

---

## 🧠 Supported platforms

- TikTok (`tiktok.com`, `vm.tiktok`)
- Instagram / Threads (`instagram.com`, `threads.net`, `threads.com`)
- YouTube (`youtube.com`, `youtu.be`)

> Note: link availability depends on RapidAPI endpoints and potential provider changes.

---

## ⚠️ Known limitations

- RapidAPI providers may change response formats or quotas.
- Some video sources block cross-origin direct download (expected browser behavior).
- Some valid URLs can still fail temporarily due to external endpoint limitations.

---

## 🛡️ Best practices

- Never expose `RAPIDAPI_KEY` in frontend code.
- Keep the key only in Netlify environment variables.
- Respect platform and API provider terms of service.
- Use this project only with content you are allowed to download/use.

---

## 📌 Maintenance / Suggested improvements

- Add unit tests for:
  - platform detection,
  - ID extraction (YouTube/TikTok),
  - links deduplication.
- Add structured logs in the function for easier debugging.
- Implement endpoint rotation/feature-flag strategy for RapidAPI providers.
- Add retry with backoff for transient failures.

---

## 📄 License

No explicit license is currently defined in this repository.
If you want to open-source it, add a `LICENSE` file (MIT, Apache-2.0, etc.).
