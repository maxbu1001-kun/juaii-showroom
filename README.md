# JUΛII showroom

R2 technical spike for a corner showroom. Two study models only: J03-01 and J02-01.

- Vite `base` is `/juaii-showroom/`
- Expected Pages URL: https://maxbu1001-kun.github.io/juaii-showroom/
- This repo is independent of juaii-showroom-preview

```bash
npm ci
npm run dev
npm run build
```

Open the dev server on the base path (`/juaii-showroom/`). A still is painted before the 3D scene. Zone jumps, object hotspots, and close-up controls sit in the page chrome. Luke V0.2 clips live in `public/audio/`.

Reference those files with `import.meta.env.BASE_URL`.

The models are procedural study geometry, not scans. Build output goes to `dist/`.
