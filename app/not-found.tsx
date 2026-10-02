import Link from "next/link";
export default function NotFound() {
  return (
    <main className="gallery">
      <p className="eyebrow">COMMONLIGHT</p>
      <h1>This portrait is private.</h1>
      <p>
        The link may have expired or been revoked. The original photo is never
        public.
      </p>
      <Link href="/" className="button primary">
        Back to the studio
      </Link>
    </main>
  );
}
