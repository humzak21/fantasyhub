/**
 * Pick'em selections that have not been submitted yet, kept in the browser.
 *
 * A member can pick on the home page and finish on the Pick'ems tab, or reload
 * halfway through, without losing what they chose. The draft is a convenience,
 * not a rule — the precedent is `takes/confirmPreference.js` — so it lives in
 * `localStorage`, per user within a browser, and nothing enforces anything on
 * it. What a member has *submitted* is `pick_em_submissions`; this is only what
 * they were in the middle of.
 *
 * One key per member per week, `pickems:draft:<userId>:<pickEmWeekId>`, holding
 * `{ picks: { [gameId]: teamId }, parlay: { playerId, playerName } | null,
 * updatedAt }`. Keyed on the week id, so last week's draft is simply never read
 * again; a write also sweeps this member's keys for other weeks so they do not
 * pile up. Every read and write is wrapped — private mode, a full quota or a
 * blocked origin throws, and a draft that cannot be kept is a draft that is
 * not kept, never a broken form.
 *
 * **Precedence when a form mounts: the draft, then what was submitted, then
 * nothing** — per game, so a draft that changed one pick of seven leaves the
 * other six as submitted. `initialSelections` is the one statement of that.
 */

import { useCallback, useSyncExternalStore } from 'react';

export const DRAFT_PREFIX = 'pickems:draft:';

export const draftKey = (userId, pickEmWeekId) => `${DRAFT_PREFIX}${userId}:${pickEmWeekId}`;

const EMPTY_DRAFT = Object.freeze({ picks: Object.freeze({}), parlay: null, updatedAt: null });

/** The browser's storage, or null where touching it throws. */
export function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * A stored string as a draft, or null for nothing, garbage or a shape this
 * code did not write.
 */
export function parseDraft(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const picks = value.picks && typeof value.picks === 'object' ? value.picks : {};
    const parlay =
      value.parlay && typeof value.parlay === 'object' && typeof value.parlay.playerName === 'string'
        ? { playerId: value.parlay.playerId ?? null, playerName: value.parlay.playerName }
        : null;
    return { picks, parlay, updatedAt: value.updatedAt ?? null };
  } catch {
    return null;
  }
}

function readRaw(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** @returns {{ picks: object, parlay: object|null, updatedAt: string|null } | null} */
export function readDraft(storage, userId, pickEmWeekId) {
  if (!userId || !pickEmWeekId) return null;
  return parseDraft(readRaw(storage, draftKey(userId, pickEmWeekId)));
}

const isEmpty = (draft) => !draft || (Object.keys(draft.picks ?? {}).length === 0 && !draft.parlay);

/**
 * Store a draft, or remove the key when there is nothing left in it. Sweeps
 * this member's drafts for every other week.
 */
export function writeDraft(storage, userId, pickEmWeekId, draft, now = new Date()) {
  if (!storage || !userId || !pickEmWeekId) return;
  const key = draftKey(userId, pickEmWeekId);
  try {
    if (isEmpty(draft)) {
      storage.removeItem(key);
    } else {
      storage.setItem(
        key,
        JSON.stringify({ picks: draft.picks ?? {}, parlay: draft.parlay ?? null, updatedAt: now.toISOString() })
      );
    }

    const mine = `${DRAFT_PREFIX}${userId}:`;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const other = storage.key(i);
      if (other && other.startsWith(mine) && other !== key) storage.removeItem(other);
    }
  } catch {
    // A draft that cannot be stored is not stored.
  }
  notify();
}

/** Drop one part of a draft (`'picks'` or `'parlay'`), or the whole of it. */
export function clearDraft(storage, userId, pickEmWeekId, part = null) {
  const current = readDraft(storage, userId, pickEmWeekId);
  if (!current) return;
  if (part === 'picks') writeDraft(storage, userId, pickEmWeekId, { ...current, picks: {} });
  else if (part === 'parlay') writeDraft(storage, userId, pickEmWeekId, { ...current, parlay: null });
  else writeDraft(storage, userId, pickEmWeekId, null);
}

/** Submitted picks (`pick_em_submissions` rows) as `{ [gameId]: teamId }`. */
export function submittedSelections(userPicks = []) {
  const map = {};
  for (const pick of userPicks) {
    if (pick?.gameId && pick.predictedWinnerTeamId) map[pick.gameId] = pick.predictedWinnerTeamId;
  }
  return map;
}

/**
 * What a form shows when it mounts: the draft over what was submitted, game by
 * game, and nothing where neither has a pick.
 */
export function initialSelections({ draft = null, submitted = [] } = {}) {
  return { ...submittedSelections(submitted), ...(draft?.picks ?? {}) };
}

/** Does the draft change anything that was submitted? */
export function draftDiffers(draft, submitted = []) {
  if (!draft) return false;
  const saved = submittedSelections(submitted);
  return Object.entries(draft.picks ?? {}).some(([gameId, teamId]) => saved[gameId] !== teamId);
}

// ---------------------------------------------------------------------------
// The hook: one store, every form that reads it agrees.
// ---------------------------------------------------------------------------

const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (event) => {
    if (!event.key || event.key.startsWith(DRAFT_PREFIX)) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

// `useSyncExternalStore` needs the same object back for the same stored
// string, or every render reads as a change.
let lastRaw;
let lastParsed = EMPTY_DRAFT;
function snapshotFor(raw) {
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parseDraft(raw) ?? EMPTY_DRAFT;
  }
  return lastParsed;
}

/**
 * This member's draft for a week, live: a write from any form on the page — or
 * another tab — re-renders every reader.
 *
 * @returns {{
 *   draft: { picks: object, parlay: object|null, updatedAt: string|null },
 *   setPick: (gameId: string, teamId: string) => void,
 *   setParlay: (parlay: { playerId: string|null, playerName: string } | null) => void,
 *   clear: (part?: 'picks'|'parlay') => void
 * }}
 */
export function usePickDraft(pickEmWeekId, userId) {
  const key = userId && pickEmWeekId ? draftKey(userId, pickEmWeekId) : null;

  const draft = useSyncExternalStore(
    subscribe,
    () => (key ? snapshotFor(readRaw(browserStorage(), key)) : EMPTY_DRAFT),
    () => EMPTY_DRAFT
  );

  const update = useCallback(
    (change) => {
      if (!key) return;
      const storage = browserStorage();
      const current = readDraft(storage, userId, pickEmWeekId) ?? { picks: {}, parlay: null };
      writeDraft(storage, userId, pickEmWeekId, change(current));
    },
    [key, userId, pickEmWeekId]
  );

  const setPick = useCallback(
    (gameId, teamId) => update((current) => ({ ...current, picks: { ...current.picks, [gameId]: teamId } })),
    [update]
  );

  const setParlay = useCallback(
    (parlay) =>
      update((current) => ({
        ...current,
        parlay: parlay && parlay.playerName?.trim() ? parlay : null
      })),
    [update]
  );

  const clear = useCallback(
    (part = null) => {
      if (key) clearDraft(browserStorage(), userId, pickEmWeekId, part);
    },
    [key, userId, pickEmWeekId]
  );

  return { draft, setPick, setParlay, clear };
}

export default usePickDraft;
