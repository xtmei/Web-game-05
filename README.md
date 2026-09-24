# 夏日乡道 · Summer Road

A small, quiet third-person cycling experience built with Three.js. Every visible scene object, surface texture, sky cloud, and sound is generated in the browser. It has no downloaded art or audio assets.

## Run locally

Serve this folder over HTTP (ES modules do not run reliably from `file://`):

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

- `W` / `↑`: pedal faster
- `S` / `↓`: ease off and slow down
- `A` / `←`, `D` / `→`: steer
- Touch: use the on-screen left/right and pace controls
- `M`: toggle synthesized ambience
- Press `R` to recenter the ride

The bike keeps a gentle cruising pace if no key is held. Web Audio starts after the first user gesture, as required by browser autoplay rules.

## GitHub Pages

This is a plain static site with no build step. The included workflow publishes the repository root on every push to `main`. For first-time setup, open **Settings → Pages** and select **GitHub Actions** as the source, then run the `Publish Summer Road to GitHub Pages` workflow. The Three.js runtime is imported as an ES module from jsDelivr; all project-specific geometry, textures, and sound are generated in code.

## Performance notes

The renderer caps its device pixel ratio at 1.2, uses low-cost cel materials, procedural geometry, fog for distance, and no shadow map or costly postprocessing pass. It is tuned for a 1920×1080 display and midrange desktop GPUs such as an RTX 4060; this workspace has no installed browser renderer, so no frame-rate measurement is claimed. Resolution scales down on tablets and phones.
