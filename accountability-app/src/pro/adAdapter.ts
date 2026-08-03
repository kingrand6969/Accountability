import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { MONETIZATION } from './monetization';

export interface FeedAdAdapter {
  ready(): boolean;
  renderFeedAd(): ReactNode;
}

const unavailableAdapter: FeedAdAdapter = {
  ready: () => false,
  renderFeedAd: () => null,
};

let activeAdapter: FeedAdAdapter = unavailableAdapter;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** A native ads integration registers here; no credentials means no ad request. */
export function registerFeedAdAdapter(adapter: FeedAdAdapter): () => void {
  activeAdapter = adapter;
  notify();
  return () => {
    if (activeAdapter === adapter) {
      activeAdapter = unavailableAdapter;
      notify();
    }
  };
}

export function feedAdsReady(): boolean {
  return MONETIZATION.ads.configured && activeAdapter.ready();
}

export function renderFeedAd(): ReactNode {
  return feedAdsReady() ? activeAdapter.renderFeedAd() : null;
}

export function useFeedAdsReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    feedAdsReady,
    () => false,
  );
}
