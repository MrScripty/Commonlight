import { notFound } from "next/navigation";
import { state } from "@/lib/service";
export const dynamic = "force-dynamic";
export default async function Gallery({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    state.service.store.published(token);
  } catch {
    notFound();
  }
  return (
    <main className="gallery">
      <p className="eyebrow">COMMONLIGHT / BC + AI</p>
      <h1>A face from the room.</h1>
      <img
        src={`/api/public/${encodeURIComponent(token)}`}
        alt="Portrait shared with the subject’s consent"
      />
      <p>
        Shared by the subject’s choice. This link expires within 24 hours and
        can be revoked.
      </p>
      <a
        href={`/api/public/${encodeURIComponent(token)}`}
        download="commonlight-portrait.jpg"
        className="button primary"
      >
        Download portrait ↓
      </a>
    </main>
  );
}
