# Run and host Commonlight

## Local UI and camera testing

Install Node 22.13 or later, then run these commands in the repository:

```sh
npm ci
npm run dev
```

Open http://localhost:3000 in your browser and leave the terminal running. Select
the capture/processing permission checkbox, then use the camera button and allow
browser camera access, or upload a JPEG/PNG/WebP. Prepare and download the portrait.
Your computer needs a camera for live capture. Use your operating system's
screenshot tool to capture the UI. Stop the server with Ctrl+C.

No environment settings are required. Local images live in `.local-data`, which
is excluded from Git. `npm run build` followed by `npm start` previews the
production build at the same address.

## Container preview

The Docker image includes the standalone Next.js server and Sharp. Build it, create
a private persistent volume, and start it bound to your computer's loopback address:

```sh
docker build -t commonlight .
docker volume create commonlight-data
docker run --rm --name commonlight -p 127.0.0.1:3000:3000 \
  --mount source=commonlight-data,target=/data \
  commonlight
```

Open http://localhost:3000. The same image is used for hosting; only its runtime
configuration changes. The named volume survives container replacement. Do not
use an image rebuild or container replacement as a way to delete retained photos.

## HTTPS hosting

Use one Linux Node server or one container instance with persistent private disk.
This application's API and image processor require a server; static-only hosting
and ephemeral/serverless disks do not support the current storage adapter.
Keep replica count at one; process-local admission permits two simultaneous
operations and at most 12 portraits. Expiring anonymous browser sessions provide
owner access; this app does not provide member login or permanent galleries.

Run the container behind an HTTPS reverse proxy, replacing the example origin:

```sh
docker run -d --name commonlight --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --mount source=commonlight-data,target=/data \
  -e COMMONLIGHT_ORIGIN=https://portraits.example.com \
  commonlight
```

Configure your domain/DNS and TLS at the proxy. Forward traffic to
`127.0.0.1:3000`, preserve the public `Host` header, and reject unknown hostnames.
The application accepts only that configured hostname and requires exactly that
HTTPS `Origin` for writes. It does not trust forwarded host/protocol headers;
session cookies are Secure in hosted mode even when the proxy-to-app connection
is HTTP. Keep the application port private to the proxy. Allow a 10 MB request
body and apply request/rate limits at the proxy; do not cache API or gallery
responses. Use adequate processing timeouts for image uploads.

For a managed container platform, configure port 3000, one instance, the same
`COMMONLIGHT_ORIGIN` variable, and a private disk mounted at `/data` writable by
UID 1000. Do not mount photo storage into static/build output or expose it through
the proxy. Verify that your provider preserves the configured Host header.

Alternatively, on a Node server run `npm ci`, `npm run build`, then launch under
your process supervisor:

```sh
COMMONLIGHT_ORIGIN=https://portraits.example.com \
COMMONLIGHT_DATA_DIR=/absolute/path/to/private/commonlight-data \
npm start
```

The app defaults to loopback binding here too, suitable for a proxy on the same
machine. For a separate container network, use the Docker image's port 3000.

`COMMONLIGHT_ORIGIN` must be an HTTPS origin with no credentials, path, query or
fragment. Leaving it unset retains local-only API access. A malformed setting
rejects API requests. No `NEXT_PUBLIC_` value or rebuild is needed when the domain
changes. Optional `.env.local` settings for Node development can be copied from
`.env.example`; Docker expects runtime environment variables.

## Verify a hosted instance

Use a synthetic image first: establish a session, prepare a portrait, reload,
restart the container, and confirm owner access survives. Check camera capture
over HTTPS, download, explicit sharing in another browser, revocation and deletion.
Confirm other hosts and cross-origin writes fail. Before public rollout, run the
repository's hosted browser suite and review provider retention, disk backups,
resource limits and proxy rate limits. The existing browser suite exercises the
local production server in CI; it does not qualify your provider's TLS/proxy setup.

Images are retained for at most the session's remaining 24-hour lifetime and are
deleted on running maintenance or the next storage access. Disk/backups are not
encrypted or securely erased by this app. Sessions are tied to the browser cookie;
downloads are needed for long-term retention.

This setup follows Next.js's [self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
and [standalone output documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
