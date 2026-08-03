export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!base || !anon || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const upstream = await fetch(
    `${base}/functions/v1/public-share-preview?id=${encodeURIComponent(id)}`,
    {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      cache: "no-store",
    },
  );
  if (!upstream.ok || !upstream.body) return new Response("Not found", { status: 404 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
