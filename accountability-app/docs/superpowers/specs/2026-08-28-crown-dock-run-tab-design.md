# Crown Dock Run Tab Design

## Outcome

Make Run the unmistakable primary action in the permanent five-destination bottom navigation while preserving the existing order and navigation behavior: Feed, Journey, Run, Messages, Menu.

## Visual design

- Replace the ordinary Run icon-and-label treatment with an 84 dp elevated soft hexagon.
- Lift the hexagon 30 dp above the bar and visually cradle its lower edge with a larger graphite soft-hex layer.
- Use the existing neon action color for the face, charcoal for the runner glyph, and a restrained lime underglow.
- Omit the visual Run label; retain `Run` as the accessibility label and tab destination.
- Keep Feed/Journey/Messages/Menu at their current visual weight so the center action remains dominant.
- Preserve the selected indicator for ordinary destinations. The Run control uses its shape as its selected treatment.

## Interaction and accessibility

- The full center slot remains pressable and keeps the current `tabPress`, prevention, navigation, and haptic behavior.
- The Run control has at least a 48 dp touch target and exposes selected state through the tab accessibility role.
- Large text does not add a Run label or distort the hexagon.
- Immersive screens continue to hide the complete tab bar.

## Verification

- Add a component test for the Crown Dock marker, omitted Run label, selected state, and navigation behavior.
- Run the focused tab-bar tests, TypeScript checks, and lint.
- Publish only to the staging preview branch and visually verify on connected device `FY24068108E6`.

