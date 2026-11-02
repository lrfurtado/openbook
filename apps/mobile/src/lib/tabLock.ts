/** Native apps have a single instance, so the database is always ours. See tabLock.web.ts. */
export type TabState = 'ok' | 'busy';

export const claimTab = async (): Promise<TabState> => 'ok';

export async function takeOver(): Promise<void> {}
