/** Maps persisted legacy values to current presentation copy without changing stored data. */
export function presentationTraitName(trait: string) {
  return trait === 'Encouraging' ? 'Cheering' : trait;
}

export function traitOptionSelected(traits: string[] | null | undefined, option: string) {
  return traits?.some((trait) => presentationTraitName(trait) === option) ?? false;
}
