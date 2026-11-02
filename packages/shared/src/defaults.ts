import type { ChildSettings } from './types';

export const NAME_RED = '#D0021B';
export const BOOK_BLACK = '#111111';
export const CAPTION_GREY = '#9B9B9B';

export const DEFAULT_CHILD_SETTINGS: ChildSettings = {
  nameDisplay: 'hidden',
  factCaption: true,
  sessionSize: 10,
  secondsPerCard: 1,
  audio: true,
  daysPerSet: 5,
  sessionsPerDay: 3,
  maxActiveSets: 3,
  reminderTimes: ['09:00', '13:00', '17:00'],
  remindersEnabled: true,
  bookLayout: 'text-then-picture',
  readingsPerDay: 2,
  daysPerBook: 5,
  maxActiveBooks: 2,
  pageAutoAdvanceSeconds: null,
};

export const SETTING_LIMITS = {
  sessionSize: { min: 5, max: 20 },
  secondsPerCard: { min: 0.5, max: 3 },
  daysPerSet: { min: 1, max: 10 },
  sessionsPerDay: { min: 1, max: 5 },
  maxActiveSets: { min: 1, max: 5 },
  readingsPerDay: { min: 1, max: 5 },
  daysPerBook: { min: 1, max: 10 },
  maxActiveBooks: { min: 1, max: 5 },
  pageAutoAdvanceSeconds: { min: 2, max: 10 },
} as const;

/** FR-31 / FR-72: a session or reading counts as completed at ≥80% shown. */
export const COMPLETION_RATIO = 0.8;
/** FR-24: voice clips may hold a card for at most 3 s. */
export const MAX_CLIP_HOLD_MS = 3000;
/** FR-30: long-press duration to exit a session. */
export const EXIT_LONG_PRESS_MS = 1000;
export const CROSSFADE_MS = 150;
export const PAGE_TURN_MS = 200;
export const END_CARD_MS = 1500;

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 60_000;

export const AVATARS = ['🦁', '🐻', '🐼', '🐸', '🦊', '🐰', '🐯', '🐨', '🐙', '🦉', '🐢', '🦄'] as const;
