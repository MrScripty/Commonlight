# Commonlight

A small portrait studio for BC + AI members. Give a photo a consistent 4:5 frame, a light colour grade and an optional name or text mark, then download it or share a revocable gallery link.

Commonlight uses deterministic image processing with Sharp. It doesn't generate faces, replace backgrounds or require an image-model account.

## Run locally

You need Node 22.13 or later. From the repository directory:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) on the same computer and leave the terminal running. No account or environment file is needed. Stop with Ctrl+C.

If the port is busy, use `npm run dev -- --port 3001`. To try the production build, run `npm run build`, then `npm start`. Both launchers bind to 127.0.0.1.

## Prepare a portrait

1. Read and select the capture/processing permission checkbox.
2. Upload a still JPEG, PNG or WebP, or choose **Use camera** and allow browser camera access. Camera capture needs localhost or HTTPS.
3. Optionally add a name or BC + AI text mark, then prepare the portrait.
4. Compare the full-frame preview with the 576 × 720 result. Check the crop carefully: it is centered and does not detect faces.
5. Download the original or prepared JPEG. Create a gallery link only with the subject's separate consent; revoke it or delete the images from the review page. Localhost links work only on that computer; other viewers need a reachable hosted studio.

Uploads can be up to 10 MB and 40 megapixels, with at least 100 pixels on each side. The light grade adds 3.5% brightness and reduces saturation to 96%. Poor focus, clipped exposure and unsuitable framing need a better source.

## Privacy and scope

Photos stay in the server's private filesystem; the local commands above keep them on your computer. The original retains its metadata, while previews and prepared JPEGs have EXIF/GPS/XMP stripped; storage is unencrypted, portraits expire within the browser session's 24-hour lifetime, and losing its cookie loses owner access. Gallery links expose only the prepared image, but revocation cannot erase downloaded copies.

This is a small, single-server prototype. Read the [privacy and implementation reference](docs/implementation.md) for cleanup timing, storage/capacity limits, telemetry and test coverage. No real-person example portraits or result screenshots are bundled.

## Host or develop

The [hosting guide](docs/hosting.md) covers the included container, persistent private disk, HTTPS origin and proxy requirements.

```sh
npm run check
npm run test:browser
```

`check` runs formatting, lint, type checks, tests and a production build. The browser suite uses Chromium with synthetic images and a fake camera; CI installs the browser.
