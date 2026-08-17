export type ItemDetailGenerationToken = Readonly<{ generation: number; identity: string }>;

export function createItemDetailGeneration() {
  let generation = 0;
  return {
    begin(identity: string): ItemDetailGenerationToken {
      return { generation: ++generation, identity };
    },
    invalidate(): void {
      generation += 1;
    },
    isCurrent(token: ItemDetailGenerationToken, identity: string): boolean {
      return token.generation === generation && token.identity === identity;
    },
  };
}
