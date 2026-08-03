import Link from "next/link";

export default function Home() {
  return (
    <main className="shareShell">
      <section className="shareCard missing">
        <div className="brand">AccountAbility</div>
        <h1>Build consistency together.</h1>
        <p>Track meaningful progress, share wins, and stay accountable with people you trust.</p>
        <div className="storeRow">
          <Link href="#get-the-app">Get the Android app</Link>
          <Link href="#get-the-app">Join the iPhone waitlist</Link>
        </div>
      </section>
    </main>
  );
}
