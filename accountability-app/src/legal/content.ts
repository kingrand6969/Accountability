// Single source of truth for the Terms of Service and Privacy Policy. Rendered
// in-app by the legal screens and mirrored to the hosted web pages under
// legal-web/. Bump LEGAL_VERSION whenever the text changes — the app records the
// version each member accepted (record_consent) so a change can re-prompt them.
//
// NOTE: these are a solid, app-specific starting point — NOT legal advice. Have a
// professional review them before launch, and fill in the operator details below.

export const LEGAL_VERSION = '2026-07-18';
export const EFFECTIVE_DATE = 'July 18, 2026';

// TODO(founder): confirm these — they appear throughout both documents.
export const OPERATOR = 'AccountAbility'; // legal/operating name
export const CONTACT_EMAIL = 'support@awldesk.com';
export const JURISDICTION = 'the Philippines'; // governing law + your NPC registration home
export const MIN_AGE = 18;

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    `Welcome to ${OPERATOR}. These Terms are a legal agreement between you and ${OPERATOR} ` +
    `("we", "us"). By creating an account or using the app, you agree to them. If you do not agree, ` +
    `please do not use the app.`,
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
        `${OPERATOR} is a social accountability and fitness app. It lets you track activities and habits, connect with accountability buddies, chat, share posts and stories, join challenges, and keep private "Memories".`,
        'We may add, change, or remove features over time to improve the service.',
      ],
    },
    {
      h: '3. Your content',
      p: [
        'You keep ownership of the photos, videos, text, and other content you create. By posting it, you grant us a limited licence to store, display, and share it as needed to run the features you use (for example, showing your post to your buddies).',
        'You are responsible for the content you share and confirm you have the right to share it.',
      ],
    },
    {
      h: '4. Community rules — zero tolerance',
      p: [
        'We have ZERO TOLERANCE for objectionable content and abusive behaviour. You must NOT post, send, or share: nudity or sexual content; hateful, harassing, threatening, or bullying content; violence or gore; content that harms, endangers, exploits, or promotes cruelty toward any person, child, or animal or other living thing; or anything illegal.',
        'You must not impersonate anyone, spam, scrape, reverse-engineer, overload, or attempt to break the security of the app, or use it to collect others’ data without consent.',
        'Anyone can report or block another member at any time. We review reports, remove violating content, and suspend or permanently ban accounts that break these rules — and we act on serious reports promptly. Serious violations may be referred to the authorities.',
        'How moderation works: we use a combination of automated screening and human review. New posts, comments, stories, and messages may be checked automatically for rule violations — but automated systems never punish anyone on their own. A human moderator reviews every case and makes the final decision.',
        'Strikes: if a moderator removes your content for breaking these rules, you receive a warning showing what was removed, and a strike is recorded on your account. FIVE (5) STRIKES RESULT IN A BAN. Serious violations can lead to immediate restriction or a ban without prior strikes. We do not condone abusive, harmful, or violent content of any kind — we are committed to keeping this community safe and non-toxic.',
        'Network-level enforcement: to enforce bans and prevent repeat abuse, we record the network (IP) address your account connects from and may block network addresses associated with repeated abuse or banned accounts. See the Privacy Policy for details.',
      ],
    },
    {
      h: '5. Health, exercise & safety — please be careful',
      p: [
        `Your safety comes first. ${OPERATOR} is not a medical service and does not provide medical, nutritional, or professional fitness advice. Activity tracking, calories, plans, and any fitness information are general guidance only.`,
        'Before you start, change, or intensify any exercise or diet, consult a doctor first — especially if you are pregnant, injured, unwell, or have any medical condition. We strongly recommend training with a qualified coach or trainer so you learn correct form and a safe program.',
        'Warm up, use proper technique, know your limits, and STOP immediately and seek medical help if you feel pain, dizziness, chest discomfort, or shortness of breath. You take part in all physical activity entirely at your own risk and are responsible for exercising safely.',
      ],
    },
    {
      h: '6. Location features',
      p: [
        'Some features (like run tracking and the buddy map) use your device location, including in the background while an activity is recording. You control location permission in your device settings and can turn it off at any time.',
      ],
    },
    {
      h: '7. Paid features',
      p: [
        'The app may offer optional paid subscriptions ("Pro"). If offered, purchases are handled by the Apple App Store or Google Play under their terms, and their billing, renewal, and refund rules apply. We do not store your card details.',
      ],
    },
    {
      h: '8. Third-party services',
      p: [
        'The app relies on trusted providers to run — for example for database and file hosting, content delivery, maps, and advertising. Their handling of data is described in our Privacy Policy.',
      ],
    },
    {
      h: '9. Ending your account',
      p: [
        'You can delete your account at any time from the app, which permanently removes your data as described in the Privacy Policy. We may suspend or end accounts that break these Terms or the law.',
      ],
    },
    {
      h: '10. Disclaimers & liability',
      p: [
        'The app is provided "as is" without warranties of any kind. To the fullest extent allowed by law, we are not liable for indirect or incidental damages, or for loss arising from your use of the app or from other members’ content.',
      ],
    },
    {
      h: '11. Changes to these Terms',
      p: [
        'We may update these Terms. If we make material changes, we will let you know in the app and, where appropriate, ask you to accept the new version. Continuing to use the app after an update means you accept it.',
      ],
    },
    {
      h: '12. Where these Terms apply, governing law & contact',
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
        'Activity & health-adjacent data: workouts, runs/walks/rides, distances, durations, and precise GPS routes when you record an activity.',
        'Usage & device: basic app usage, crash/diagnostic data, and an advertising identifier used for ads (see section 5).',
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
      h: '3. What others can see',
      p: [
        'You control most of what you share. Buddies and, depending on your choices, other members can see content you post publicly or share with them (posts, stories, your buddy card, leaderboards). "Memories" are private to you.',
        'Some profile details have privacy toggles — use them to control what is shown.',
      ],
    },
    {
      h: '4. Service providers',
      p: [
        'We use trusted providers to run the app, who process data on our behalf under their own security terms: a backend/database and authentication provider, cloud object storage and a content-delivery network for images, and mapping for activity routes.',
        'These providers may store data on servers outside your country. We share only what is needed to run the service.',
      ],
    },
    {
      h: '5. Advertising',
      p: [
        'Free accounts may see ads served through Google AdMob, which may use an advertising identifier and approximate location to show relevant ads. You can limit ad personalisation in your device settings, and where required we ask for your consent first.',
      ],
    },
    {
      h: '6. Data retention & deletion',
      p: [
        'We keep your data while your account is active. You can permanently delete your account at any time from the app; this removes your profile and content. Some records may be retained briefly where required by law or to prevent abuse.',
        'Safety records — moderation decisions, strikes, and IP logs — may be kept after content is removed or an account is deleted or banned, for as long as reasonably needed to enforce bans and prevent repeat abuse.',
        'When you delete your account, your side of any chat is removed; the other person keeps their own copy, where you appear as "Deleted Account".',
      ],
    },
    {
      h: '7. Your rights — wherever you live',
      p: [
        'We give every member the same core controls, in every country: you can access your data in the app, correct your profile, delete your account (and with it your data), and contact us to exercise any other right.',
        'Depending on where you live, local law may give you additional rights — for example under the GDPR / UK GDPR (European Economic Area and United Kingdom: access, portability, rectification, erasure, restriction, objection), the CCPA/CPRA (California: to know, delete, correct, and opt out of "sharing"), the Philippine Data Privacy Act, and similar laws elsewhere. We honour these rights; contact us and we will respond as your local law requires.',
        'We do not sell your personal data, and we do not use it for third-party marketing.',
        'Because our service providers may store data in other countries, your data can be transferred internationally; where such laws apply, we rely on recognised safeguards for those transfers.',
        'You can also complain to your local data-protection authority at any time.',
      ],
    },
    {
      h: '8. Age requirement',
      p: [
        `${OPERATOR} is for adults aged ${MIN_AGE} and older. We do not knowingly collect data from anyone under ${MIN_AGE}. If you believe someone under ${MIN_AGE} has given us data, contact us and we will remove it.`,
      ],
    },
    {
      h: '9. Security',
      p: [
        'We use industry-standard measures — including encrypted connections, access controls, and per-user data rules — to protect your information. No system is perfectly secure, so please keep your password safe.',
      ],
    },
    {
      h: '10. Changes to this policy',
      p: [
        'We may update this policy and will note the effective date. Material changes will be highlighted in the app.',
      ],
    },
    {
      h: '11. Contact',
      p: [
        `For privacy questions or requests, contact ${CONTACT_EMAIL}. You may also contact the data-protection authority where you live — for example, the National Privacy Commission if you are in ${JURISDICTION}.`,
      ],
    },
  ],
};

export const DOCS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDocKey = keyof typeof DOCS;
