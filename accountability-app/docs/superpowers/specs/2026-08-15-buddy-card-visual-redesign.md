# Buddy Card Visual Redesign

## Purpose

The Buddy Card is the public-facing profile shown to people who are not yet buddies. It must feel like a clean, collectible fitness identity card while preserving the account owner's existing information. Buddies retain access to the fuller profile experience.

## Approved presentation

- The exact approved visual reference is the clean light card titled **Buddy Card Customization**: white rounded card, soft palette tint, compact circular avatar, small crest beside the rank name, restrained dividers, four-accent palette selector, and blue owner Edit Buddy Card action. Do not reinterpret this as a dark segmented card, a full blue gradient card, or a new redesign.
- Preserve the approved hierarchy and spacing without removing existing information.
- Show identity first: avatar, display name, location/activity status, rank badge, member-since date, and Challenges won.
- Show Current Focus full-width below identity. It supports up to 90 characters and three visible lines. If the complete text does not fit, the section is tappable to reveal it.
- Rename the competitive section from Achievements to Rankings. It shows Country, City, and Buddies positions.
- Use a separate Medals and Challenges section for earned accomplishments.
- Show up to four owner-selected medals on the card. The owner can select and reorder them in Buddy Card editing.
- Tapping Medals and Challenges opens the owner's complete earned-medal and completed-challenge collection.
- Keep the fitness metric row to four balanced columns: Consistency, Points, Average distance per day, and Distance.
- Do not repeat total kilometres in the social row.

## Required card structure

- The Buddy Card always retains visible places for profile text, area, earned medals, challenge wins, and Rankings. Loading, missing legacy flags, or optional-request failures must not collapse the approved card into an identity-only shell.
- Privacy remains authoritative. A public viewer never receives a private value merely to fill the design. When an authorized value is unavailable, the existing section stays stable and uses a truthful compact fallback: an em dash for an unavailable rank, `0` for an authorized zero challenge-win count, and the existing no-earned-medals treatment without inventing artwork.
- The owner's profile/About text and Current Focus remain separate pieces of content. Current Focus stays inside the card in its approved clean treatment; the profile/About text remains readable in the profile presentation without replacing Focus.
- Area stays in the identity metadata when authorized. If it is unavailable, the layout closes the line cleanly without shifting or removing the other required sections.
- Medals and Challenges uses real earned medal artwork only. It shows up to four selected earned medals and keeps the full-gallery action visible.
- The Rankings section always keeps the approved Country, City, Buddies, and Points positions. Values respect the existing consent gates; missing or withheld values render as an em dash rather than causing a column or the section to disappear.

## Viewer-aware social row

- Always show Cheers and Buddies.
- When another person views the card, show Mutual Buddies only when the count is greater than zero.
- When the owner views their own card, show Groups instead of Mutual Buddies.
- Never show an empty placeholder solely to preserve a third column; two centered items are preferred when there is no useful third value.

## Navigation

- The owner's avatar entry points and Menu's My Buddy Card entry must open the owner's actual Buddy Card view, not the editor and not a connect-to-self state.
- Edit Buddy Card remains an owner-only action from the owner's card.
- Medals and Challenges opens the full collection for the viewed account.
- Truncated Current Focus opens a readable full-text view.
- Existing recent-post links continue to open their posts.

## Privacy and roles

- The owner can always view their own Buddy Card and must never see a Connect action for themselves.
- Non-buddies see the public Buddy Card information and posts explicitly featured on the Buddy Card.
- Buddies can reach the fuller profile view according to the existing product permissions.
- The visual redesign must not broaden database access or weaken row-level security.

## Accessibility

- Every tappable card section has a minimum 48-by-48 point target.
- Medals include meaningful accessible names rather than emoji-only announcements.
- Ranking values include their scope in spoken labels.
- Truncation never makes the full Focus text unavailable.
- Layout supports increased text size without overlapping sections.

## Empty and loading states

- Missing ranks display an em dash, not a fake zero.
- Fewer than four selected medals use only the available slots; the card does not invent medals.
- A user with no medals sees a compact invitation to view or earn Medals and Challenges.
- Viewer-specific counts do not flash stale values during account changes.
- Navigation remains available while nonessential card statistics load.

## Acceptance criteria

1. The exact approved clean-card hierarchy and wording appear in light and dark modes; no alternative Buddy Card redesign is introduced.
2. Rankings and Medals and Challenges are visually and semantically distinct.
3. Challenges won appears beneath Member since and is not duplicated in the metric row.
4. The card shows at most four owner-selected medals in their chosen order.
5. Long Focus content respects the 90-character and three-line presentation rules and remains fully readable on demand.
6. The social row follows the owner/other-viewer rules and contains no duplicate distance value.
7. Owner navigation never requires connecting to oneself.
8. All specified links reach the correct destination and preserve back navigation.
9. Existing information, privacy rules, and Buddy Card/public-profile semantics remain intact.
10. Missing legacy flags and optional-data failures cannot remove the required profile text, area placement, Rankings, Challenges won placement, or Medals and Challenges structure.
11. The card never invents ranks, medal artwork, challenge wins, or private values to preserve the layout.
