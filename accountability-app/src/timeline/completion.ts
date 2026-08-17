import type { ChecklistItem } from './types';

export function becameCompleteChecklist(
  previous: readonly ChecklistItem[],
  next: readonly ChecklistItem[],
): boolean {
  if (next.length === 0 || !next.every((item) => item.done)) return false;
  return previous.length === 0 || previous.some((item) => !item.done);
}
