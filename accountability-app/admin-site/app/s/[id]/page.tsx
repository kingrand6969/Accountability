import type { Metadata } from "next";
import Link from "next/link";

type SharePreview = {
  title: string;
  description: string;
  preview_image_url: string | null;
  sender_name: string | null;
};

async function getShare(id: string): Promise<SharePreview | null> {
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon) return null;
  const response = await fetch(`${base}/rest/v1/rpc/get_public_share`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_share: id }),
    next: { revalidate: 60 },
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as SharePreview[];
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return { title: "Mantle update" };
  return {
    title: `${share.title} · Mantle`,
    description: share.description,
    openGraph: {
      title: share.title,
      description: share.description,
      type: "article",
      images: share.preview_image_url ? [share.preview_image_url] : [],
    },
  };
}

export default async function PublicShare({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await getShare(id);
  const appLink = `accountabilityapp://share/${encodeURIComponent(id)}`;
  // Until official store listings are configured, use the canonical Mantle
  // download page rather than guessing a package or App Store listing.
  const downloadPage = "https://joinaccountability.app/#get-the-app";
  const androidStore = process.env.NEXT_PUBLIC_ANDROID_STORE_URL ?? downloadPage;
  const appleStore = process.env.NEXT_PUBLIC_APPLE_STORE_URL ?? downloadPage;

  if (!share) {
    return (
      <main className="shareShell">
        <section className="shareCard missing">
          <div className="brand">Mantle</div>
          <h1>This update is no longer available</h1>
          <p>It may have expired or been removed by its owner.</p>
          <div className="storeRow">
            <Link href={androidStore}>Get the Android app</Link>
            <Link href={appleStore}>Join the iPhone waitlist</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shareShell">
      <article className="shareCard">
        <header className="shareHeader">
          <div className="brand">Mantle</div>
          <span className="secure">Secure shared update</span>
        </header>
        {share.preview_image_url ? (
          <img className="shareImage" src={share.preview_image_url} alt="" />
        ) : (
          <div className="quoteCard">“{share.title}”</div>
        )}
        <div className="shareBody">
          <p className="eyebrow">{share.sender_name ?? "A Mantle member"} shared</p>
          <h1>{share.title}</h1>
          <p>{share.description}</p>
          <a className="openButton" href={appLink}>
            Open in Mantle
          </a>
          <p className="fallback">Don&apos;t have the app yet?</p>
          <div className="storeRow">
            <Link href={androidStore}>Android</Link>
            <Link href={appleStore}>iPhone</Link>
          </div>
        </div>
      </article>
      <p className="privacyNote">No private user ID or storage address is shown in this link.</p>
    </main>
  );
}
