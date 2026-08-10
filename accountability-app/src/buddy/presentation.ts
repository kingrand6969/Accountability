/** Maps persisted legacy values to current presentation copy without changing stored data. */
export function presentationTraitName(trait: string) {
  return trait === 'Encouraging' ? 'Cheering' : trait;
}

export function storageTraitName(trait: string) {
  return trait === 'Cheering' ? 'Encouraging' : trait;
}

export function presentationTraits(traits: string[] | null | undefined) {
  return (traits ?? []).map(presentationTraitName);
}

export function storageTraits(traits: string[] | null | undefined) {
  return (traits ?? []).map(storageTraitName);
}

export function traitOptionSelected(traits: string[] | null | undefined, option: string) {
  return traits?.some((trait) => presentationTraitName(trait) === option) ?? false;
}
