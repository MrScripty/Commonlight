import { startServer } from "next/dist/server/lib/start-server.js";

// The same production server used by Next's CLI, with an OS-assigned port.
// IPC is sent only after this child has bound its listener and initialized Next.
async function main() {
  await startServer({
    dir: process.cwd(),
    port: Number(process.argv[2]),
    hostname: "127.0.0.1",
    isDev: false,
    allowRetry: false,
  });
  process.send?.({ ready: true, port: Number(process.env.PORT) });
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
