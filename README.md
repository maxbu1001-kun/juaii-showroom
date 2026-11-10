# JUΛII showroom

Minimal Vite + React + TypeScript static shell.

- Vite base=/juaii-showroom/
- Expected Pages URL: https://maxbu1001-kun.github.io/juaii-showroom/
- Merge rule is PR → main (this bootstrap commit is the only allowed direct push to main).
- This repo is independent of juaii-showroom-preview and must not overwrite that site.

Reference public assets via `import.meta.env.BASE_URL`.

```bash
npm ci
npm run dev
npm run build
```

Build output goes to `dist/`.

Placeholder directories:

- `public/models/` — Draco-compressed GLB
- `public/audio/`
- `public/textures/`
