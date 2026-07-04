import { confirmDialog } from './ConfirmDialog';

/**
 * Destructive confirm — a branded in-app dialog on every platform
 * (phone, tablet, web), instead of the OS/browser alert.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  confirmDialog({ title, message, confirmLabel, destructive: true, onConfirm });
}
