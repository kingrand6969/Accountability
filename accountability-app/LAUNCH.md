# AccountAbility — Launch Runbook

_Last updated: 2026-07-25. This is your single checklist to get from "code is ready" to
"live in the App Store and Google Play." Work top to bottom — the order matters._

## The honest split

The app itself is in good shape. But launching a mobile app runs through **accounts, money,
and legal decisions that only you can make** — I can't create your Apple/Google/Supabase
accounts, pay fees, sign into them, or form your company. So this doc is split into:

- ✅ **DONE** — already in the repo, nothing for you to do.
- 🔴 **ONLY YOU** — blocked on your account/payment/legal action. Exact steps below.
- 🟡 **OPTIONAL** — safe to launch without; do soon after.

**One thing to internalise:** until you form a legal entity (Section 1), _you personally_
carry every liability the app creates. That is the single most important launch item — more
than any line of code. Everything else is mechanical; that one is a real decision.

---

## ✅ Already done (in the repo)

- Full app: 5 pillars, feed, buddies, groups/pages, compete, finance + business tracker,
  GPS run tracker, achievements, memories.
- **Auth & onboarding**: email+password, 18+ age gate, required consent, 6-digit email
  verification flow (goes live the moment you wire email — Section 4F), forgot-password.
- **Safety/anti-abuse**: RLS on every table, server-side rate limits on write paths,
  automated content screening + human review, 5-strike sanctions, IP tracking, in-app
  Block/Report, admin moderation dashboard with cross-tab de-duplication.
- **Legal**: worldwide-hardened Terms & Privacy (v2026-07-23) — liability cap,
  indemnification, fitness assumption-of-risk, arbitration + class-waiver (with local-law
  carve-outs), GDPR/CCPA/UK coverage. Hosted web versions generated in `legal-web/`.
- **Store identifiers set**: iOS `com.awldesk.accountability`, Android
  `com.awldesk.accountability` (in `app.json`). Icons, splash, and adaptive icons present.
- `eas.json` build profiles (development / preview / production) configured.

---

## 🔴 Critical path — only you can do these (in order)

### 1. Form a legal entity  ← do this first
**Why:** Without a company (LLC / corporation / OPC), you are _personally_ liable for
lawsuits, injury claims, data-breach fines, and chargebacks. An entity is the shield the
entire legal pack assumes exists.
**Do:**
- [ ] Register a limited-liability entity in your home country (this becomes your
  `JURISDICTION`, currently set to _the Philippines_ in `src/legal/content.ts`).
- [ ] Get a business bank account for it (Apple/Google payouts and Stripe go here).
- [ ] Send me (or fill yourself) the four values in `src/legal/content.ts` lines 23–29:
  `OPERATOR_ENTITY`, `OPERATOR_ADDRESS`, `OPERATOR_REG_NO`, and the DMCA/rep emails.
  The docs are already wired to show the real company name the instant you fill these.

### 2. Have a lawyer review the legal docs
**Why:** I wrote them to be strong and standard, but **I am not a lawyer and this is not
legal advice.** One paid hour of a local tech/privacy attorney before launch is cheap
insurance — especially the injury waiver (Section 7) and arbitration clause (Section 16).
**Do:**
- [ ] Send `legal-web/terms.html` and `legal-web/privacy.html` to a lawyer in your
  jurisdiction. Ask specifically: is the injury release + arbitration enforceable here?
- [ ] Register a **DMCA agent** at https://dmca.copyright.gov (~$6) and create the
  `copyright@awldesk.com` inbox referenced in the docs.
- [ ] If you'll have EU/UK users at scale, appoint GDPR Art.27 EU + UK representatives
  (services exist for ~€/£ per month) and fill `EU_REP` / `UK_REP`.

### 3. Open the developer accounts (these cost money)
- [ ] **Apple Developer Program** — https://developer.apple.com/programs — **$99/year**.
      Enrol as your _company_ (needs a D-U-N-S number, free, ~1–2 weeks) — not as an
      individual, so the entity (not you) is on record.
- [ ] **Google Play Console** — https://play.google.com/console — **$25 one-time**.
      Also enrol as the organisation.
- [ ] **Expo account** — https://expo.dev — free. Needed for cloud builds.

> ⚠️ The bundle ID `com.awldesk.accountability` is now baked into `app.json`. Register that
> exact string in both stores. It is **permanent** after first submission — tell me now if
> you want a different one. Also check the name "AccountAbility" is free on both stores; if
> taken you'll need a store display-name variant (the in-app name can stay).

### 4. Supabase production hardening (dashboard — ~30 min)
Open https://supabase.com/dashboard → your project.
- [ ] **A. Upgrade to Pro** (~$25/mo) — Settings → Billing. Free tier can't edit email
      templates or set a spend cap. See `launch-cost-plan` for the cheap-scaling strategy.
- [ ] **B. Set a Spend Cap** — Settings → Billing → Cost Control → cap ON. Prevents a
      surprise bill if you get a traffic spike or abuse.
- [ ] **C. Turn on CAPTCHA** — Auth → Settings → enable **hCaptcha or Cloudflare
      Turnstile** on sign-up/sign-in. (Blocks bot signups; the app already handles the
      challenge. Get free keys from hcaptcha.com or Cloudflare.)
- [ ] **D. Wire real email (Resend)** — create a Resend account, verify your sending
      domain, then Auth → SMTP Settings → paste Resend SMTP creds.
- [ ] **E. Set the email templates** to 6-digit codes — Auth → Email Templates →
      Confirmation **and** Recovery → make the body use `{{ .Token }}` (the app's UI expects
      a 6-digit code, not a magic link). _Template editing only unlocks after D + Pro._
- [ ] **F. Enforce email confirmation** — Auth → Settings → turn **"Confirm email" ON**
      (i.e. `mailer_autoconfirm = false`). **Only after D + E**, or new users get an email
      with no code to type. The app + 6-digit screens are already built and waiting.
- [ ] **G. Password-reset redirect allowlist** — Auth → URL Configuration → add your app
      scheme `accountabilityapp://` and any web origin so reset links resolve.

### 5. Link the app to EAS (one-time, needs Expo login)
In a terminal, in `accountability-app/`:
```
npm i -g eas-cli
eas login
eas init            # links the project, writes extra.eas.projectId into app.json
eas credentials     # let Expo manage signing keys (choose the auto option)
```

### 6. Monetization — DECIDED: free v1, Pro/ads flip on later
**Chosen path (Google Play first): ship free, keep Pro built and comp-able, turn on paid
Pro in v1.1.** Both money surfaces are now switched **off** behind one file —
`src/pro/monetization.ts` (`CHECKOUT_ENABLED` and `ADS_ENABLED`, both `false`). The paywall
shows a tasteful "Pro is launching soon" card (no non-working purchase button, which is what
store review rejects), and the feed shows no ad slots. Nothing was deleted — it's a flip.

To make money in **v1.1** (no re-architecture needed):
- [ ] **Turn on Pro**: once your Play account is live, create the subscription products in
      Play Console, then tell me — I'll wire **RevenueCat** (free tier) so purchases set
      `is_pro`, and set `CHECKOUT_ENABLED = true`. Meanwhile, comp Pro to yourself and early
      users via `admin_grant_pro` (already built) to learn which features convert.
- [ ] **Turn on ads (optional, only at real scale)**: create an **AdMob** account + ad
      units, then I'll wire `react-native-google-mobile-ads`, update the data-safety labels
      to declare ad tracking, and set `ADS_ENABLED = true`. (No iOS ATT needed while
      Google-only; I'll add `NSUserTrackingUsageDescription` when you add iOS.)

### 7. Build, test, submit
After 3–6:
```
eas build --profile preview --platform all     # internal test build first
# install on your phone, smoke-test the real build (not Expo Go)
eas build --profile production --platform all   # store builds
eas submit --platform ios       # uploads to App Store Connect
eas submit --platform android    # uploads to Play Console
```
- [ ] Do an internal/TestFlight + Play internal-testing round before public release.

### 8. Store listing + data-safety forms
Both stores require a filled listing, a **public Privacy Policy URL**, and a data-safety
questionnaire. I've drafted all of it in **Section A** below — paste it in. You still need
to add screenshots (take them from the running app) and host the legal pages (Section B).

---

## 🟡 Optional / post-launch (safe to skip for v1)

- Host the **admin dashboard** (`admin/` or `admin-site/`) somewhere private for moderation.
- Push notifications need a real dev build + APNs/FCM keys (not Expo Go) — wire after launch.
- Expired-Pro re-gating and group/page-creation throttles (low-severity items from the
  security review) — I can knock these out anytime.
- Crash/error monitoring (Sentry free tier) — strongly recommended, low effort.

---

## Section A — Store listing pack (drafted; edit + paste)

**App name:** AccountAbility
**Subtitle / short description (30–80 chars):** Your fitness & money accountability crew
**Category:** Health & Fitness (secondary: Social Networking / Lifestyle)
**Age rating:** 18+ (the app enforces an 18+ age gate; declare 17+/18+ so ratings match)

**Full description (paste, trim to taste):**
> AccountAbility keeps you honest about the goals that matter — training, money, and daily
> habits — with a crew that actually shows up. Track runs, rides and walks with GPS. Log
> workouts, meals and budgets. Set challenges, compete on leaderboards, and cheer your
> buddies on. Earn medals for real streaks and real distance. Private by default, safe by
> design, and built to make consistency feel good.
>
> • GPS run/ride/walk tracking with route maps
> • Workout, diet and finance tracking in one place
> • Accountability buddies, groups, and head-to-head challenges
> • Achievements and leaderboards that reward showing up
> • Strong safety tools: reporting, blocking, and active moderation

**Keywords (iOS, ≤100 chars):** accountability,fitness,running,gps,habit,buddy,workout,goals,challenge,budget

**Support URL:** https://<your-domain>/  (or a mailto: support@awldesk.com page)
**Marketing URL (optional):** your landing page
**Privacy Policy URL (required):** https://<your-legal-host>/privacy.html  (Section B)
**Terms URL:** https://<your-legal-host>/terms.html

**Screenshots you'll need to capture** (from the running app): feed, run tracker, a buddy
card, achievements/trophy case, finance/business, a challenge. Take iPhone 6.7" + 6.5" and a
few Android sizes; the app is already tablet-responsive if you want iPad shots too.

### Data-safety / privacy-label answers (pre-filled from the Privacy Policy)
Use for **Google Play "Data safety"** and **Apple "App Privacy"**. Answer honestly per your
final feature set (e.g. drop the ad rows if you launch without ads).

| Data | Collected? | Why | Linked to user | Used for tracking |
|---|---|---|---|---|
| Email address | Yes | Account, auth | Yes | No |
| Name (first/last, display) | Yes | Account, social | Yes | No |
| Date of birth | Yes | 18+ age gate | Yes | No |
| Approximate/precise location (GPS) | Yes | Run/ride tracking, buddy matching | Yes | No |
| Photos & videos | Yes | Posts, stories, run cards, memories | Yes | No |
| Health & fitness (runs, workouts, diet) | Yes | Core app function | Yes | No |
| Financial info (user-entered budgets/debts) | Yes | Finance/business tracker (stored for the user) | Yes | No |
| Messages (buddy chat) | Yes | In-app messaging | Yes | No |
| IP address | Yes | Security, moderation, abuse prevention | Yes | No |
| Device/diagnostic & usage data | Yes | App function, analytics | Yes | No |
| Advertising ID (only if you ship ads) | If ads | Ads for free tier | Yes | **Yes** (declare ATT on iOS) |

Also declare: data is **encrypted in transit**; users can **request deletion in-app**
(Delete Account is built); you **do not sell** data (CCPA "do not sell/share" honored).

## Section B — Host the legal pages (needs your Cloudflare login)
The files in `legal-web/` are self-contained HTML. Easiest free host = **Cloudflare Pages**:
1. Push this repo to GitHub (you're the account owner — `gh auth login` then push, or use
   GitHub Desktop). I can't sign in as you.
2. Cloudflare dashboard → **Pages** → Create → Connect to Git → pick the repo.
3. Build settings: **Framework preset = None**, **Build output directory = `accountability-app/legal-web`**, no build command.
4. Deploy → you get `https://<project>.pages.dev`. Your Privacy URL is then
   `.../privacy.html`, Terms is `.../terms.html`. Add a custom domain if you like.
> Alternative one-liners: GitHub Pages (point it at `legal-web/`), or Netlify drop the folder.
> Re-run `node scripts/build-legal.mjs` after any legal edit so the hosted pages stay in sync.

## Cost summary (first-year cash, rough)
- Apple Developer: **$99/yr** · Google Play: **$25 once** · Supabase Pro: **~$25/mo**
- DMCA agent: ~$6 · Legal review: your call (a few hundred, optional-but-wise)
- Resend, hCaptcha/Turnstile, Cloudflare Pages, RevenueCat, AdMob, Sentry: **free tiers**
- Entity formation + EU/UK reps: varies by country
See `launch-cost-plan` in memory for the keep-it-cheap scaling strategy (~$124 first-year
excluding entity/legal).
