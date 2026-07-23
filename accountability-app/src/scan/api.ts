import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

export type ScanKind = 'food' | 'receipt';

export type FoodItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};
export type FoodScan = { items: FoodItem[]; note?: string };
export type ReceiptScan = {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  category: string;
  note?: string;
};

export type Quota = { limit: number; food_used: number; receipt_used: number };

/** How many scans this member has left this month (display only — the server
 *  enforces the real cap). */
export async function getScanQuota(): Promise<Quota> {
  const { data, error } = await supabase.rpc('my_scan_quota');
  if (error || !data) return { limit: 20, food_used: 0, receipt_used: 0 };
  return data as Quota;
}

/**
 * Camera or library → a small base64 JPEG. Downscaling to 768px happens ON THE
 * DEVICE: it keeps each scan to a fraction of a cent and the upload quick,
 * without hurting what the model can read.
 */
async function pickImage(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(fromCamera ? 'Camera permission is needed to scan.' : 'Photo permission is needed.');

  const res = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
  if (res.canceled || !res.assets?.[0]?.uri) return null;

  const shrunk = await ImageManipulator.manipulateAsync(
    res.assets[0].uri,
    [{ resize: { width: 768 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return shrunk.base64 ?? null;
}

async function callScan(kind: ScanKind, base64: string) {
  const { data, error } = await supabase.functions.invoke('ai-scan', { body: { kind, image: base64 } });
  if (error) {
    let msg = 'The scanner is unavailable right now.';
    let upgrade = false;
    try {
      const ctx = await (error as { context?: { json?: () => Promise<Record<string, unknown>> } }).context?.json?.();
      if (ctx?.error) msg = String(ctx.error);
      upgrade = !!ctx?.upgrade;
    } catch {
      /* keep the generic message */
    }
    const err = new Error(msg) as Error & { upgrade?: boolean };
    err.upgrade = upgrade;
    throw err;
  }
  if (data?.error) throw new Error(String(data.error));
  return data as { result: unknown; used: number; limit: number };
}

/** Photograph a meal → estimated items with calories and macros. */
export async function scanFood(fromCamera = true): Promise<{ scan: FoodScan; used: number; limit: number } | null> {
  const b64 = await pickImage(fromCamera);
  if (!b64) return null;
  const out = await callScan('food', b64);
  const r = (out.result ?? {}) as FoodScan;
  return {
    scan: { items: Array.isArray(r.items) ? r.items : [], note: r.note },
    used: out.used,
    limit: out.limit,
  };
}

/** Photograph a receipt → merchant, date, total, suggested category. */
export async function scanReceipt(fromCamera = true): Promise<{ scan: ReceiptScan; used: number; limit: number } | null> {
  const b64 = await pickImage(fromCamera);
  if (!b64) return null;
  const out = await callScan('receipt', b64);
  const r = (out.result ?? {}) as ReceiptScan;
  return { scan: r, used: out.used, limit: out.limit };
}
