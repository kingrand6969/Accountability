// Single source of truth for the Terms of Service and Privacy Policy. Rendered
// in-app by the legal screens and mirrored to the hosted web pages under
// legal-web/. Bump LEGAL_VERSION whenever the text changes — the app records the
// version each member accepted (record_consent) so a change re-prompts them.
//
// ⚠️ THESE ARE NOT LEGAL ADVICE. They are a strong, app-specific STARTING POINT.
// FOUNDER ACTION ITEMS before launch:
//   1. Have a licensed attorney in your operating country review + finalise both docs.
//   2. Form a limited-liability ENTITY (LLC / corporation / PH One Person Corporation)
//      and make IT the operator (own the app, store/dev accounts, domains, contracts).
//      Until then, YOU may be personally liable. Then fill OPERATOR_ENTITY/_ADDRESS/_REG_NO.
//      Do NOT name an entity that has not actually been formed — that is its own risk.
//   3. Register a DMCA Designated Agent at dmca.copyright.gov; keep COPYRIGHT_EMAIL in sync.
//   4. If you have EEA/UK users, appoint GDPR Art 27 representatives → fill EU_REP / UK_REP.
//   5. Execute SCCs / UK IDTA with each processor (Supabase, Cloudflare R2, maps, AdMob).
//   6. Confirm the retention periods in the Privacy Policy match your REAL practice.
//   7. Confirm CONTACT_EMAIL, JURISDICTION (governing-law anchor = your entity's home), MIN_AGE.

export const LEGAL_VERSION = '2026-07-23';
export const EFFECTIVE_DATE = 'July 23, 2026';

export const OPERATOR = 'AccountAbility'; // consumer / brand name
export const OPERATOR_ENTITY = ''; // TODO(founder): exact registered legal name, once the entity is formed
export const OPERATOR_ADDRESS = ''; // TODO(founder): registered office address
export const OPERATOR_REG_NO = ''; // TODO(founder): SEC/DTI (or local) registration number
export const CONTACT_EMAIL = 'support@awldesk.com';
export const COPYRIGHT_EMAIL = 'copyright@awldesk.com'; // TODO(founder): create + register as DMCA agent
export const EU_REP = ''; // TODO(founder): GDPR Art 27 EU representative (name + postal address / email)
export const UK_REP = ''; // TODO(founder): UK representative (name + postal address / email)
export const JURISDICTION = 'the Philippines'; // governing-law anchor — set to your entity's home country
export const MIN_AGE = 18;

// The contracting party line: names the entity once it's formed, otherwise just the
// brand (never a fake company name). Used in the Terms intro + Privacy contact.
const PARTY =
  OPERATOR_ENTITY
    ? `${OPERATOR}, a service operated by ${OPERATOR_ENTITY}` +
      (OPERATOR_REG_NO ? `, registered in ${JURISDICTION} (${OPERATOR_REG_NO})` : '') +
      (OPERATOR_ADDRESS ? `, with its registered office at ${OPERATOR_ADDRESS}` : '')
    : OPERATOR;
const NOTICE_ADDR = OPERATOR_ENTITY
  ? `${OPERATOR_ENTITY}${OPERATOR_ADDRESS ? `, ${OPERATOR_ADDRESS}` : ''}`
  : OPERATOR;

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    `Welcome to ${OPERATOR}. These Terms are a legal agreement between you and ${PARTY} ` +
    `("${OPERATOR}", "we", "us", or "our"). By creating an account or using the app, you agree to them. ` +
    `If you do not agree, please do not use the app. Please read the health & safety, disclaimers, ` +
    `liability, and dispute-resolution sections carefully — they affect your legal rights.`,
  sections: [
    {
      h: '1. Who can use the app',
      p: [
        `You must be at least ${MIN_AGE} years old to use ${OPERATOR}. By signing up you confirm that you are ${MIN_AGE} or older and legally able to enter this agreement.`,
        'You are responsible for keeping your login details secure and for everything that happens under your account.',
      ],
    },
    {
      h: '2. What the app is',
      p: [
        `${OPERATOR} is a social accountability and fitness app. It lets you track activities and habits, record runs and workouts, connect with accountability buddies, chat, share posts and stories, join challenges, and keep private "Memories". It also includes personal money tools to track your accounts, bills, credit-card debt, and savings; an optional Pro business tracker for revenue, costs, and break-even; and AI features that estimate calories and macros from a food photo or read a receipt. These money, business, and AI features are informational tools to help you organise your own numbers — see the disclaimers below.`,
        'The app is provided on an ongoing but not guaranteed basis. We may change, add, limit, suspend, or permanently stop offering the app or any feature — for everyone or for particular users, regions, or devices — at any time, with or without notice. Where we reasonably can, we will give notice of major changes or a shutdown so you can export or save your content first. Except where the law says otherwise, we are not liable to you for changing, suspending, or ending the app or a feature, or for any content you did not save before it stopped. If we permanently shut down the app and you have unused paid time, we will handle any refund through the applicable App Store or Google Play rules.',
      ],
    },
    {
      h: '3. Your content & the licence you give us',
      p: [
        'You own what you make. The photos, videos, text, routes, and other content you create stay yours.',
        'So that the app can actually work, you give us a licence to use that content — but only to run the features you use. This licence is worldwide, non-exclusive, and royalty-free (we don’t owe you a fee), and it lasts for as long as you keep the content in the app plus a short period afterward while backups and caches clear. Under it, you allow us and the providers that help us run the app (for example our cloud storage and content-delivery network) to host, store, back up, copy, resize, re-format, and display your content, and to show it to the people and places you choose — such as your buddies, a challenge, a leaderboard, your buddy card, or the public feed if you post there. We may pass this licence through to those providers only as needed to deliver the app to you.',
        'We use this licence only to operate, improve, and keep the app safe — never to sell your content or license it to unrelated companies for their own marketing. When you delete content or your account, this licence ends, except for copies already shared with other members and copies kept briefly in backups, as described in the Privacy Policy.',
        'You are responsible for the content you share, and you confirm you own it or have the right to share it and to grant this licence.',
      ],
    },
    {
      h: '4. Community rules — zero tolerance',
      p: [
        'Content posted by members belongs to those members, not to us. We do not create, endorse, verify, or take responsibility for content that members post, and any views expressed in it are the member’s own, not ours. You may be exposed to content you find offensive or inaccurate; if so, please report it.',
        'We are not obligated to monitor or pre-screen everything members post, and you should not assume we do. We do, however, have the right (but not the duty) to review, screen, refuse, remove, restrict, or take down any content, and to suspend or remove any account, at any time and for any reason we reasonably believe is needed to protect members, comply with the law, or enforce these Terms — with or without notice. We are not liable for content posted by members or for any decision to remove or leave up content.',
        'We have ZERO TOLERANCE for objectionable content and abusive behaviour. You must NOT post, send, or share: nudity or sexual content; hateful, harassing, threatening, or bullying content; violence or gore; content that harms, endangers, exploits, or promotes cruelty toward any person, child, or animal or other living thing; or anything illegal.',
        'You must not impersonate anyone, spam, scrape, reverse-engineer, overload, or attempt to break the security of the app, use bots or automated access, or use the app to collect others’ data without consent.',
        'Anyone can report or block another member at any time. We review reports, remove violating content, and suspend or permanently ban accounts that break these rules — and we act on serious reports promptly. Serious violations may be referred to the authorities.',
        'How moderation works: we use a combination of automated screening and human review. New posts, comments, stories, and messages may be checked automatically for rule violations — but automated systems never punish anyone on their own. A human moderator reviews every case and makes the final decision, and you can contact us to contest a decision.',
        'Strikes: if a moderator removes your content for breaking these rules, you receive a warning showing what was removed, and a strike is recorded on your account. FIVE (5) STRIKES RESULT IN A BAN. Serious violations can lead to immediate restriction or a ban without prior strikes. We do not condone abusive, harmful, or violent content of any kind — we are committed to keeping this community safe and non-toxic.',
        'Network-level enforcement: to enforce bans and prevent repeat abuse, we record the network (IP) address your account connects from and may block network addresses associated with repeated abuse or banned accounts. See the Privacy Policy for details.',
      ],
    },
    {
      h: '5. Copyright complaints (notice & takedown)',
      p: [
        `We respect copyright and expect members to do the same. If you believe content in the app copies your work without permission, send a notice to ${COPYRIGHT_EMAIL} with: (1) enough detail to find the content (for example a link or screenshot); (2) identification of the work you say was copied; (3) your contact details; (4) a statement that you believe in good faith the use isn’t authorised by the owner, its agent, or the law; (5) a statement, under penalty of perjury, that your notice is accurate and you are the owner or authorised to act for them; and (6) your physical or electronic signature.`,
        'When we receive a valid notice we will remove or disable the content and, where appropriate, tell the member who posted it. If you are that member and believe the removal was a mistake or is permitted (for example, fair use or you hold the rights), you may send a counter-notice to the same address with the equivalent information.',
        'Repeat infringers: in appropriate circumstances we will disable or terminate the accounts of members who repeatedly infringe others’ copyrights or other intellectual-property rights.',
      ],
    },
    {
      h: '6. Feedback',
      p: [
        'We’d love your ideas. If you send us suggestions, feedback, feature requests, or comments about the app, you agree we can use them freely — worldwide, forever, and without owing you anything or keeping them confidential — to operate and improve the app and our products. You are not required to send feedback, but if you do, you give up any claim to payment or credit for it.',
      ],
    },
    {
      h: '7. Health, exercise & safety — please read this',
      p: [
        `Your safety comes first. ${OPERATOR} is not a medical service. We are not your doctor, personal trainer, coach, physiotherapist, or dietitian, and using the app does not create any of those relationships. Everything the app generates — workout and gym plans, targets, pacing, routes, streaks, and the calorie and macro estimates from our photo scanners — is produced automatically as general information. It is not personal medical, fitness, or nutrition advice, no qualified professional has reviewed your individual health, and none of it should replace advice from someone who has.`,
        'Before you start, change, or intensify any exercise or diet, consult a doctor first — especially if you are pregnant, injured, unwell, or have any medical condition. We strongly recommend training with a qualified coach so you learn correct form and a safe program. Warm up, use proper technique, know your limits, and STOP immediately and seek medical help if you feel pain, dizziness, chest discomfort, or shortness of breath.',
        'Challenges, streaks, competitions, and leaderboards are meant to be fun motivation — not a reason to hurt yourself. Never push past what is safe for you just to keep a streak alive, finish a challenge, or move up a leaderboard. Your health always matters more than any goal, badge, or ranking, and it is always okay to rest, slow down, skip a day, or stop.',
        'Outdoor activity has its own risks, and you are in charge of your own safety when you are out there. Watch for traffic, follow the rules of the road, and pay attention to weather, terrain, trail and path conditions, lighting, and your surroundings. Routes you record, see on the map, or share are not checked or recommended by us for safety — a route appearing in the app does not mean it is safe, legal, or suitable to travel. Never rely on the app instead of your own eyes and judgement, take extra care if you exercise alone or after dark, and tell someone where you are going.',
        'You take part in physical activity AT YOUR OWN RISK. Exercise — including running, walking, cycling, gym training, and any workout or challenge you do with the app — carries real risks. These can include muscle strains and sprains, cuts and bruises, broken bones, falls, collisions with people, vehicles, animals, or objects, heat or cold illness, dehydration, overexertion, fainting, heart problems, the worsening of an existing injury or medical condition, and in rare cases serious injury, permanent disability, or death. You understand and accept these risks, and you agree that you — not us — are responsible for deciding whether an activity, intensity, route, or challenge is safe and right for your body on any given day.',
        'To the fullest extent the law allows, you RELEASE us — ' + OPERATOR + ' and the people who build and run it — from claims for injury, illness, death, or loss to you or your property that arise out of, or are connected to, physical activity you do using the app, information the app shows you (such as plans, pacing, routes, or calorie and macro estimates), or your participation in challenges, competitions, or leaderboards. You agree not to bring such a claim against us and, to the extent permitted by law, you do so on behalf of anyone who might otherwise claim through you. This release does NOT apply to loss caused by our own gross negligence, fraud, or wilful misconduct, to death or personal injury that the law says cannot be waived, or to any right you have under mandatory consumer-protection law where you live — nothing here takes those protections away from you.',
      ],
    },
    {
      h: '8. Money & business tools are not financial advice',
      p: [
        `${OPERATOR} includes tools to track your personal finances (accounts, bills, credit-card debt, savings) and, with Pro, a business tracker (revenue, costs, and break-even). These are simple tools to help you organise and see your own numbers. They are NOT financial, tax, accounting, investment, debt, or legal advice, and we are not your accountant, financial adviser, or broker. Any totals, charts, break-even points, or projections the app shows are general information based only on what you enter — they are not a recommendation to spend, save, borrow, invest, or make any business decision. For advice about your money, taxes, debt, or business, please talk to a qualified professional.`,
        'Your numbers are your responsibility. The app can only work with the information you put into it. You are responsible for entering your data accurately, keeping it up to date, and checking it against your real bank, card, lender, and business records. We do not verify your figures, and we are not responsible for decisions you make from incomplete or incorrect data — or from any total, balance, due date, reminder, or break-even result the app calculates from it. Always treat your official statements — from your bank, card issuer, lender, or accountant — as the source of truth. Any money or business decision you make is your own, and you make it at your own risk.',
      ],
    },
    {
      h: '9. AI features give estimates, not facts',
      p: [
        'Some features use AI to estimate things from a photo — for example guessing the calories and macros in a meal, or reading the amounts off a receipt. These results are automated ESTIMATES and can be wrong, sometimes by a lot. Food scans are a rough guide only — they are not nutritional, dietary, or medical advice.',
        'Do not rely on an AI estimate for any decision where getting it wrong could hurt you: managing diabetes or blood sugar, dosing insulin or other medication, avoiding an allergen, following a medically prescribed diet, recovering from an eating disorder, or nutrition during pregnancy. Receipt and other scans can misread amounts, dates, and items. Always check an AI result against the real item, label, or receipt before you rely on it, and fix anything that looks off. If a number really matters to your health or your money, verify it yourself or ask a qualified professional.',
      ],
    },
    {
      h: '10. Location features',
      p: [
        'Some features (like run tracking and the buddy map) use your device location, including in the background while an activity is recording. You control location permission in your device settings and can turn it off at any time.',
      ],
    },
    {
      h: '11. Paid features (Pro)',
      p: [
        'The app may offer optional paid subscriptions ("Pro"). If offered, purchases are handled by the Apple App Store or Google Play under their terms, and their billing, renewal, and refund rules apply. We do not store your card details.',
      ],
    },
    {
      h: '12. Other members & third-party services',
      p: [
        'We’re not responsible for other people or outside services. Other members create their own content and act on their own — we don’t control them, and to the fullest extent the law allows we’re not responsible for what they post, say, or do, whether on the app or in person, including anything that happens if you meet or interact with someone offline. Please use normal caution and good judgment when connecting with people.',
        'The app also depends on outside services we don’t control — like the Apple App Store and Google Play, maps, hosting and content delivery, and advertising. We’re not responsible for their acts, content, outages, charges, or decisions, and any dispute you have with another member or an outside provider is between you and them. How our providers handle data is described in our Privacy Policy.',
      ],
    },
    {
      h: '13. App stores (Apple & Google)',
      p: [
        'You got this app from the Apple App Store or Google Play, so some extra terms apply:',
        'These Terms are between you and us only — not with Apple or Google. Apple and Google are not responsible for the app or its content and have no obligation to provide maintenance or support for it. Your right to use the app is a personal, non-transferable licence to run it on Apple- or Google-branded devices you own or control, following the App Store or Google Play usage rules.',
        'If the app fails to meet any warranty, you may notify Apple, and Apple may refund the purchase price (if any); to the maximum extent allowed by law, Apple has no other warranty obligation for the app, and anything else about warranties, claims, losses, liabilities, or costs is our responsibility, not Apple’s or Google’s. Apple and Google are not responsible for handling any claim that the app or your use of it fails to meet a legal requirement, gives rise to a product-liability claim, or infringes someone’s intellectual-property rights — those are handled under these Terms.',
        'You confirm you are not located in a country subject to a U.S. Government embargo or designated as "terrorist-supporting", and are not on any U.S. Government list of prohibited or restricted parties. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you; Google is likewise entitled to rely on the app-store terms that apply to it. You must also comply with any applicable third-party agreement (for example your mobile-data plan) when using the app.',
      ],
    },
    {
      h: '14. Suspending or ending your account',
      p: [
        'You can delete your account at any time from the app, which permanently removes your data as described in the Privacy Policy.',
        'We may suspend, restrict, or end your access — sometimes immediately and without prior notice — if we reasonably believe you’ve broken these Terms or the law, to investigate suspected abuse or fraud, to protect other members or the service, if your account is inactive for a long time, or if a provider, court, or law requires it. Where it’s appropriate and safe to do so, we’ll tell you why.',
        'What happens when your account ends: your right to use the app stops immediately. We may delete your content and account data as described in the Privacy Policy, though we may keep safety and moderation records (including strikes and network/IP logs) as that policy explains, to enforce bans and prevent repeat abuse. Ending your account doesn’t entitle you to a refund except where the App Store, Google Play, or the law requires one. The sections meant to survive (see the survival clause) continue to apply.',
      ],
    },
    {
      h: '15. Disclaimers, limits on our liability & indemnification',
      p: [
        'We provide the app "as is" and "as available", without promises of any kind. To the fullest extent the law allows, we disclaim all warranties, whether spoken, written, or implied — including any implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement. We do not promise that the app will be uninterrupted, on time, secure, error-free, or free of viruses, that defects will be fixed, or that it will meet your needs. In particular, we do not warrant that any figure, total, balance, due date, projection, break-even result, or AI estimate (including calorie, macro, or receipt scans) is accurate, complete, current, or reliable — these are informational and depend on what you enter and on automated systems that can err. Some places don’t allow certain warranties to be excluded, so parts of this may not apply to you.',
        'Some damages we’re never responsible for. To the fullest extent the law allows, we won’t be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any lost profits, lost data, lost savings, lost goodwill, or business interruption — even if we knew such losses were possible.',
        'And there’s an overall limit on what we owe. For everything else, our total liability to you for all claims connected to the app or these Terms, added together, is limited to whichever is greater: (a) the amount you paid us for the app in the 12 months before the event that led to the claim, or (b) US $100. These limits are a basic part of the agreement between us and apply no matter what legal theory a claim is based on. Nothing here limits liability that the law says cannot be limited — for example, for death or personal injury caused by our negligence, for fraud, or any right your local consumer-protection law gives you.',
        'Indemnification. To the fullest extent the law allows, you agree to defend, indemnify, and hold harmless ' + OPERATOR + ' and the people who work on it from any third-party claims, demands, losses, liabilities, damages, and reasonable costs (including reasonable legal fees) that arise out of or relate to: (a) content you post, send, or share; (b) your use of the app; (c) your breach of these Terms or our community rules; or (d) your violation of any law or of anyone else’s rights, including intellectual-property and privacy rights. We may take over the defence of any covered claim (at your expense), and you agree to cooperate and not to settle it in a way that affects us without our written consent. This section survives the end of your account.',
      ],
    },
    {
      h: '16. Sorting out disagreements',
      p: [
        `If you ever have a problem with the app, please contact us first at ${CONTACT_EMAIL} — most issues can be sorted out quickly and informally, and we ask you to give us 30 days to try before starting any formal process.`,
        'Arbitration and no class actions (where the law allows). Where this kind of agreement is legally enforceable for consumers — generally the case in the United States and some other countries, but restricted or not allowed for consumers in the EU, the UK, and elsewhere — you and we agree that any dispute that can’t be resolved informally will be settled by final, binding individual arbitration rather than in court, and that each of us waives the right to a jury trial. You and we also agree that claims may only be brought in your or our individual capacity, and NOT as a plaintiff or class member in any class, collective, or representative action.',
        'This does not apply where it is not permitted. Nothing here overrides the mandatory consumer-protection laws of the country where you live. If those laws give you the right to bring a claim in your local courts, to join a class or collective action, or otherwise limit arbitration for consumers, those rights come first and this section does not take them away. Either of us can always bring an individual claim in a small-claims court where one is available.',
        `Where court disputes are heard. For any dispute handled in court rather than by arbitration, you and we agree it will be brought in the courts of ${JURISDICTION}, and both of us submit to those courts — EXCEPT that if the mandatory consumer-protection laws of the country where you live give you the right to bring a claim in your local courts, you keep that right and may sue there instead. We will bring any claim against you in the courts of the country where you live where the law requires.`,
        'Time limit for claims. Where the law allows a time limit to be agreed, any claim you want to bring relating to the app must be started within ONE (1) YEAR of when the issue giving rise to it happened; after that it is permanently barred. If the law where you live does not allow this, or sets a longer minimum period for your type of claim, that longer legal period applies instead.',
      ],
    },
    {
      h: '17. Changes to these Terms',
      p: [
        'We may update these Terms. If we make material changes, we will let you know in the app and, where appropriate, ask you to accept the new version. Continuing to use the app after an update means you accept it.',
      ],
    },
    {
      h: '18. General terms',
      p: [
        'The complete agreement. These Terms, together with our Privacy Policy, are the entire agreement between you and us about the app, and they replace any earlier discussions, promises, or agreements about it. If we give you extra terms for a specific feature (for example a contest or a paid plan), those apply on top of these for that feature.',
        'Keeping the rest in force (severability). If any part of these Terms turns out to be unenforceable or invalid in a particular place, only that part is affected — it is treated as removed, or narrowed to the smallest change needed to make it valid, and everything else stays fully in force. A clause being unenforceable in one country does not affect whether it applies in another.',
        'No waiver. If we don’t enforce a rule right away, or don’t act on a violation, that doesn’t mean we give up the right to enforce it later. Any waiver only counts if it’s in writing from us.',
        'Assignment. We can transfer these Terms and our rights and duties under them to another company — for example if our business is sold, merged, or reorganised — and we’ll let you know if that happens. You can’t transfer your account or these Terms to anyone else without our written permission.',
        'Who can rely on these Terms. These Terms are between you and us; no one else can enforce them, except that Apple and Google are third-party beneficiaries as described in the app-store section above.',
        'Events beyond our control. We’re not responsible for failing to provide the app, or for delays, caused by things beyond our reasonable control — for example internet or power outages, failures of the cloud, hosting, payment, or other providers we rely on, natural disasters, strikes, war, or new laws.',
        'What survives. Some parts of these Terms continue even after your account or these Terms end — including your content licence for anything already shared, the health & safety disclaimers and release, the disclaimers and limits on our liability, indemnification, our right to keep safety and moderation records, and the general and governing-law clauses.',
        'Electronic communications. By using the app you agree we can communicate with you electronically — through the app, by email to the address on your account, or by push notification — and that these satisfy any legal requirement that a communication be in writing. This includes account, security, and legal notices and updates to these Terms or the Privacy Policy. Keep your email current so you receive them.',
        `Legal notices. ${OPERATOR} is operated by ${NOTICE_ADDR}. Formal legal notices to us must be sent to that address and to ${CONTACT_EMAIL}; we’ll send notices to you at the email on your account or through the app.`,
      ],
    },
    {
      h: '19. Worldwide scope, governing law & contact',
      p: [
        'These Terms apply to everyone who uses the app, in every country. We operate a single worldwide service with one set of community rules.',
        `These Terms are governed by the laws of ${JURISDICTION}. However, if the mandatory consumer-protection laws of the country where you live grant you additional rights or require certain disputes to be handled locally, nothing in these Terms takes those protections away from you.`,
        `Questions? Contact us at ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    `This policy explains what ${OPERATOR} collects, why, and your choices. We aim to collect only ` +
    `what the app needs, and we never sell your personal data.`,
  sections: [
    {
      h: '1. Information we collect',
      p: [
        'Account: your email address and password (passwords are stored securely by our authentication provider, never in plain text).',
        'Profile & content: your first and last name, your city or area (required at sign-up so we can match you with nearby buddies), optional details you add (bio, photo, cover, birthday, and similar), and the posts, stories, comments, chat messages, challenges, and Memories you create.',
        'Activity & health-adjacent data: workouts, runs/walks/rides, distances, durations, precise GPS routes when you record an activity, and the calorie and macro estimates the AI produces from any food photo you scan.',
        'Money data you enter: if you use the finance tracker or Pro business tools, the figures you enter — such as account balances, bills, debts, savings goals, and (for business owners) revenue, costs, and break-even numbers. You enter these to track your own finances; we don’t sell them, use them for ads, or share them for marketing, and you can delete them with your account.',
        'Usage & device: basic app usage, crash/diagnostic data, and an advertising identifier used for ads (see the advertising section).',
        'Safety & moderation: the network (IP) address your device connects from (recorded each time you use the app), reports you send or that concern you, and moderation records — warnings, strikes, restrictions, content removals, and bans. We collect these to keep the community safe and to enforce bans, including at the network level.',
      ],
    },
    {
      h: '2. How we use your information',
      p: [
        'To provide the app: create your account, run features you use, show your content to the people you choose, and keep the service working and secure.',
        'To improve the app and prevent abuse, spam, and fraud.',
        'For safety and moderation: content may be screened automatically for rule violations, but a human moderator always makes the final decision before anything is removed or an account is sanctioned. We use moderation records and IP addresses to apply warnings, strikes, restrictions, and bans — including blocking network addresses linked to repeated abuse.',
        'To contact you about your account (for example, email confirmation and password resets).',
      ],
    },
    {
      h: '3. Why we’re allowed to use your data (legal bases)',
      p: [
        'If you’re in the European Economic Area or the UK, data-protection law requires us to have a legal basis for each thing we do with your data. Ours are:',
        'To run the app and give you the features you sign up for (account, buddies, feed, chat, run tracking, finance and business trackers, Pro) — because it’s necessary to perform our agreement with you (the Terms).',
        'To keep the community safe, prevent abuse, spam and fraud, secure the service, and enforce bans (including IP logging) — because it’s in our and other members’ legitimate interests to run a safe app, balanced against your rights.',
        'To show ads to free members — with your consent where the law requires it, otherwise on the basis of our legitimate interest in funding a free tier.',
        'Health and fitness details (workouts, runs, calorie/macro estimates) and precise GPS routes get extra protection under EEA/UK law. We only handle these because you choose to record or scan them — that is, on your explicit consent — and you can stop, delete them, or turn off location at any time.',
        'To meet legal obligations (for example responding to lawful requests or keeping limited records the law requires). Where we rely on consent, you can withdraw it at any time; that won’t affect anything we did before you withdrew it.',
      ],
    },
    {
      h: '4. Automated screening & the AI scanners',
      p: [
        'To keep the community safe, new posts, comments, stories, and messages may be checked automatically for things like nudity, hate, or threats. These automated checks never decide anything about your account on their own — a human moderator reviews every case and makes the final call before anything is removed or any strike, restriction, or ban is applied, and you can contact us to contest a decision.',
        'Separately, if you use the photo food scanner or receipt scanner, an AI service processes the image you submit to estimate calories, macros, or receipt details. These estimates are guidance only (see the Terms) and are not used to make decisions about your account.',
      ],
    },
    {
      h: '5. What others can see',
      p: [
        'You control most of what you share. Buddies and, depending on your choices, other members can see content you post publicly or share with them (posts, stories, your buddy card, leaderboards). "Memories" are private to you.',
        'Some profile details have privacy toggles — use them to control what is shown.',
      ],
    },
    {
      h: '6. Service providers',
      p: [
        'We use trusted providers to run the app, who process data on our behalf under their own security terms: a backend/database and authentication provider, cloud object storage and a content-delivery network for images, mapping for activity routes, an AI provider for the food/receipt scanners, and an advertising provider for free accounts.',
        'These providers may store data on servers outside your country. We share only what is needed to run the service.',
      ],
    },
    {
      h: '7. Sending data across borders',
      p: [
        'To run the app, we and our providers may store and process your data in countries outside where you live — including the Philippines, the United States, and wherever our hosting, storage, content-delivery, mapping, AI, and ads providers operate.',
        'When we move personal data out of the European Economic Area or the UK to a country without an "adequacy" decision, we protect it using the European Commission’s Standard Contractual Clauses (and, for the UK, the UK International Data Transfer Agreement or Addendum), together with extra safeguards where needed. You can ask us for a copy of the safeguards we use by emailing us.',
      ],
    },
    {
      h: '8. Advertising, identifiers & opt-outs',
      p: [
        'Free accounts may see ads served through Google AdMob, which may use an advertising identifier and approximate location to show relevant ads. The app and its providers also use identifiers for crash reporting and basic analytics.',
        'Under California law, letting AdMob use your advertising identifier for personalised ads counts as "sharing" for cross-context behavioural advertising. You can opt out of personalised ads in your device settings (Limit Ad Tracking / reset or delete the advertising ID), and where your browser or device sends a recognised opt-out signal such as Global Privacy Control, we treat it as a request to opt out of that sharing. Turning off personalised ads doesn’t remove ads for free members — it makes them less tailored.',
      ],
    },
    {
      h: '9. How long we keep things',
      p: [
        // TODO(founder): confirm these periods match your real backend/backup/moderation practice.
        'We keep your account and content while your account is active. When you delete your account, we remove your profile and content within 30 days, except for backups that roll off within a further 90 days.',
        'Some things we keep longer: crash and basic diagnostic logs for up to 12 months; safety records (moderation decisions, strikes) and the IP addresses tied to a banned account for up to 24 months after a ban, so we can enforce it and stop repeat abuse; and records we’re legally required to keep for as long as the law requires. Where we can’t give an exact period, we keep data only as long as needed for the purpose we collected it for, then delete or anonymise it.',
        'When you delete your account, your side of any chat is removed; the other person keeps their own copy, where you appear as "Deleted Account".',
      ],
    },
    {
      h: '10. Security',
      p: [
        'We use industry-standard measures — including encrypted connections, access controls, and per-user data rules — to protect your information. No system is perfectly secure, so please keep your password safe.',
      ],
    },
    {
      h: '11. If something goes wrong (data breaches)',
      p: [
        'If we discover a security breach that affects your personal data, we’ll investigate promptly, take steps to contain and fix it, and notify the relevant data-protection authorities and affected members where the law requires and within the timeframes it sets. If a breach is likely to put you at high risk, we’ll tell you directly and explain what happened and what you can do.',
      ],
    },
    {
      h: '12. Your rights — wherever you live',
      p: [
        'We give every member the same core controls, in every country: you can access your data in the app, correct your profile, delete your account (and with it your data), and contact us to exercise any other right.',
        'Depending on where you live, local law may give you additional rights — for example under the GDPR / UK GDPR (EEA and UK: access, portability, rectification, erasure, restriction, objection), the CCPA/CPRA (California: to know, delete, correct, and opt out of "sharing"), the Philippine Data Privacy Act, and similar laws elsewhere. We honour these rights; contact us and we will respond as your local law requires.',
        'We do not sell your personal data, and we do not use it for third-party marketing. We do, under California’s definition, "share" your advertising identifier with our ads provider to show ads to free members — you can opt out of that as described in the advertising section above.',
        'Because our service providers may store data in other countries, your data can be transferred internationally, protected by the safeguards described above.',
        'You can also complain to your local data-protection authority at any time.',
      ],
    },
    {
      h: '13. Our representatives in the EU & UK',
      p: [
        // TODO(founder): appoint GDPR Art 27 representatives before publishing real contact details.
        `If you’re in the European Economic Area or the UK, you can reach our appointed data-protection representative at ${EU_REP || '[EU representative — to be appointed before EU launch]'} (EU) and ${UK_REP || '[UK representative — to be appointed before UK launch]'} (UK), in addition to contacting us directly.`,
      ],
    },
    {
      h: '14. Age requirement',
      p: [
        `${OPERATOR} is for adults aged ${MIN_AGE} and older. We do not knowingly collect data from anyone under ${MIN_AGE}. If you believe someone under ${MIN_AGE} has given us data, contact us and we will remove it.`,
      ],
    },
    {
      h: '15. Changes to this policy',
      p: [
        'We may update this policy and will note the effective date. Material changes will be highlighted in the app.',
      ],
    },
    {
      h: '16. Contact & legal notices',
      p: [
        `For privacy questions or requests, contact ${CONTACT_EMAIL}. ${OPERATOR} is operated by ${NOTICE_ADDR}; the data controller is that operator. You may also contact the data-protection authority where you live — for example, the National Privacy Commission if you are in ${JURISDICTION}.`,
      ],
    },
  ],
};

export const DOCS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDocKey = keyof typeof DOCS;
