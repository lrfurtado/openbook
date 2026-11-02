import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { PIN_LOCKOUT_MS, PIN_MAX_ATTEMPTS } from '@openbook/shared';

/** Persisted app/session state (redux-persist). Domain data lives in SQLite. */
export interface AppState {
  onboarded: boolean;
  pinFailures: number;
  pinLockedUntil: number | null;
  /** FR-26: last card shown per set, so the next session never starts with it. */
  lastCardBySet: Record<string, string>;
  /** Rotates the fact caption between sessions (FR-17). */
  sessionCountBySet: Record<string, number>;
  /** FR-70: last page reached per book. */
  readerLastPage: Record<string, number>;
}

const initialState: AppState = {
  onboarded: false,
  pinFailures: 0,
  pinLockedUntil: null,
  lastCardBySet: {},
  sessionCountBySet: {},
  readerLastPage: {},
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    completeOnboarding(state) {
      state.onboarded = true;
    },
    pinSucceeded(state) {
      state.pinFailures = 0;
      state.pinLockedUntil = null;
    },
    pinFailed(state, action: PayloadAction<{ now: number }>) {
      state.pinFailures += 1;
      if (state.pinFailures >= PIN_MAX_ATTEMPTS) {
        state.pinLockedUntil = action.payload.now + PIN_LOCKOUT_MS;
        state.pinFailures = 0;
      }
    },
    sessionFinished(state, action: PayloadAction<{ setId: string; lastCardId?: string }>) {
      const { setId, lastCardId } = action.payload;
      if (lastCardId) state.lastCardBySet[setId] = lastCardId;
      state.sessionCountBySet[setId] = (state.sessionCountBySet[setId] ?? 0) + 1;
    },
    readerPageReached(state, action: PayloadAction<{ bookId: string; page: number }>) {
      state.readerLastPage[action.payload.bookId] = action.payload.page;
    },
  },
});

/** Not persisted: the parent area relocks whenever the app restarts or the child area is shown. */
export const gateSlice = createSlice({
  name: 'gate',
  initialState: { unlocked: false },
  reducers: {
    unlock(state) {
      state.unlocked = true;
    },
    lock(state) {
      state.unlocked = false;
    },
  },
});

export interface DownloadState {
  done: number;
  total: number;
  status: 'downloading' | 'done' | 'error';
  error?: string;
}

/** Live pack/book download progress (FR-3). */
export const downloadsSlice = createSlice({
  name: 'downloads',
  initialState: {} as Record<string, DownloadState>,
  reducers: {
    progress(state, action: PayloadAction<{ id: string } & DownloadState>) {
      const { id, ...rest } = action.payload;
      state[id] = rest;
    },
    clear(state, action: PayloadAction<string>) {
      delete state[action.payload];
    },
  },
});

export const appActions = appSlice.actions;
export const gateActions = gateSlice.actions;
export const downloadActions = downloadsSlice.actions;
