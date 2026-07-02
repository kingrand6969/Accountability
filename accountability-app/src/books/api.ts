import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { pickIndex, type Cadence } from './rotate';

/** Interests map to Project Gutenberg topic searches (public domain, free
 *  forever, no API key — served by gutendex.com). */
export const INTERESTS: { key: string; label: string; topic: string }[] = [
  { key: 'motivation', label: 'Motivation & discipline', topic: 'conduct of life' },
  { key: 'philosophy', label: 'Philosophy & stoicism', topic: 'philosophy' },
  { key: 'health', label: 'Health & fitness', topic: 'hygiene' },
  { key: 'money', label: 'Money & success', topic: 'success' },
  { key: 'food', label: 'Food & cooking', topic: 'cooking' },
  { key: 'psychology', label: 'Mind & psychology', topic: 'psychology' },
  { key: 'adventure', label: 'Adventure stories', topic: 'adventure' },
];

export type BookPrefs = { interests: string[]; cadence: Cadence };

export type Book = {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  readUrl: string | null;
};

const DEFAULT_PREFS: BookPrefs = { interests: ['motivation'], cadence: 'daily' };

function gb(id: number, title: string, author: string): Book {
  return {
    id,
    title,
    author,
    coverUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    readUrl: `https://www.gutenberg.org/ebooks/${id}`,
  };
}

/** Hand-picked classics per interest (IDs verified against gutenberg.org) —
 *  used when the live API is slow/down, so the pick NEVER fails to load. */
const CATALOG: Record<string, Book[]> = {
  motivation: [
    gb(935, 'Self Help', 'Samuel Smiles'),
    gb(4507, 'As a Man Thinketh', 'James Allen'),
    gb(148, 'The Autobiography of Benjamin Franklin', 'Benjamin Franklin'),
    gb(2274, 'How to Live on 24 Hours a Day', 'Arnold Bennett'),
  ],
  philosophy: [
    gb(2680, 'Meditations', 'Marcus Aurelius'),
    gb(132, 'The Art of War', 'Sun Tzu'),
    gb(1497, 'The Republic', 'Plato'),
    gb(1656, 'Apology', 'Plato'),
    gb(4363, 'Beyond Good and Evil', 'Friedrich Nietzsche'),
    gb(5827, 'The Problems of Philosophy', 'Bertrand Russell'),
  ],
  health: [
    gb(2274, 'How to Live on 24 Hours a Day', 'Arnold Bennett'),
    gb(205, 'Walden — living simply & well', 'Henry David Thoreau'),
    gb(2680, 'Meditations', 'Marcus Aurelius'),
  ],
  money: [
    gb(8581, 'The Art of Money Getting', 'P. T. Barnum'),
    gb(148, 'The Autobiography of Benjamin Franklin', 'Benjamin Franklin'),
    gb(935, 'Self Help', 'Samuel Smiles'),
  ],
  food: [
    gb(10136, 'The Book of Household Management', 'Mrs. Beeton'),
    gb(24407, 'The Italian Cook Book', 'Maria Gentile'),
  ],
  psychology: [
    gb(15489, 'Dream Psychology', 'Sigmund Freud'),
    gb(600, 'Notes from the Underground', 'Fyodor Dostoyevsky'),
    gb(5827, 'The Problems of Philosophy', 'Bertrand Russell'),
  ],
  adventure: [
    gb(1184, 'The Count of Monte Cristo', 'Alexandre Dumas'),
    gb(120, 'Treasure Island', 'Robert Louis Stevenson'),
    gb(103, 'Around the World in Eighty Days', 'Jules Verne'),
    gb(74, 'The Adventures of Tom Sawyer', 'Mark Twain'),
  ],
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function prefsKey(uid: string): string {
  return `books:prefs:${uid}`;
}

export async function getBookPrefs(): Promise<BookPrefs> {
  const uid = await me();
  if (!uid) return DEFAULT_PREFS;
  try {
    const raw = await AsyncStorage.getItem(prefsKey(uid));
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as BookPrefs;
    if (!p.interests?.length) return DEFAULT_PREFS;
    return p;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setBookPrefs(prefs: BookPrefs): Promise<void> {
  const uid = await me();
  if (!uid) return;
  await AsyncStorage.setItem(prefsKey(uid), JSON.stringify(prefs));
}

function mapBook(row: any): Book {
  const formats = row.formats ?? {};
  return {
    id: row.id,
    title: row.title,
    author: row.authors?.[0]?.name ?? 'Unknown author',
    coverUrl: formats['image/jpeg'] ?? null,
    readUrl:
      formats['text/html'] ??
      formats['text/html; charset=utf-8'] ??
      formats['application/epub+zip'] ??
      null,
  };
}

/** Fetch a page of books for one interest topic (popularity-sorted),
 *  giving up after 10s — the caller falls back to the built-in catalog. */
async function fetchTopic(topic: string): Promise<Book[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://gutendex.com/books?topic=${encodeURIComponent(topic)}&languages=en&sort=popular`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`Book library unavailable (${res.status}).`);
    const json = await res.json();
    return ((json.results ?? []) as any[]).map(mapBook).filter((b) => b.readUrl);
  } finally {
    clearTimeout(timer);
  }
}

export type BookFeed = { pick: Book; more: Book[]; interestLabel: string };

/**
 * Today's (or this week's / month's) pick: rotate through the user's chosen
 * interests, then rotate deterministically through that topic's books —
 * everyone gets a fresh pick each period without any server state.
 */
export async function getBookFeed(prefs: BookPrefs, now = new Date()): Promise<BookFeed> {
  const keys = prefs.interests.length ? prefs.interests : DEFAULT_PREFS.interests;
  const interest =
    INTERESTS.find(
      (i) => i.key === keys[pickIndex(prefs.cadence, now, keys.length)],
    ) ?? INTERESTS[0];
  let books: Book[];
  try {
    books = await fetchTopic(interest.topic);
    if (books.length === 0) throw new Error('empty');
  } catch {
    // live API slow or down — the curated classics always work
    books = CATALOG[interest.key] ?? CATALOG.motivation;
  }
  const idx = pickIndex(prefs.cadence, now, books.length);
  const more = [1, 2, 3, 4, 5]
    .map((o) => books[(idx + o) % books.length])
    .filter((b, i, arr) => b.id !== books[idx].id && arr.findIndex((x) => x.id === b.id) === i);
  return { pick: books[idx], more, interestLabel: interest.label };
}
