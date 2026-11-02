import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import { listChildren } from './repo';

/**
 * FR-36: daily local reminders at each child's reminder times (native only). Rescheduled whenever
 * settings change; times shared by several children produce one notification.
 */
export async function scheduleReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const children = (await listChildren()).filter((c) => c.settings.remindersEnabled && c.settings.reminderTimes.length);
  if (!children.length) return;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return;
  const times = new Map<string, string[]>();
  for (const c of children) for (const time of c.settings.reminderTimes) times.set(time, [...(times.get(time) ?? []), c.nickname]);
  for (const [time, names] of times) {
    const [hour, minute] = time.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: { title: i18n.t('reminders.title'), body: i18n.t('reminders.body', { names: names.join(', ') }) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
}
