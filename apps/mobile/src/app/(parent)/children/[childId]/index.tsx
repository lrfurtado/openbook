import {
  SETTING_LIMITS,
  setTodayStatus,
  localDate,
  readiness,
  suggestNextBook,
  type ActiveBook,
  type ActiveSet,
  type Book,
  type ChildProfile,
  type ChildSettings,
} from '@openbook/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Body, Button, DraftField, Loading, Row, Screen, Section, Segmented, Stepper, ToggleRow } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { confirm } from '@/lib/confirm';
import { scheduleReminders } from '@/lib/reminders';
import {
  addActiveBook,
  addKnownWords,
  deleteChild,
  extendActiveBook,
  extendSet,
  getBook,
  getChild,
  listActiveBooks,
  listBooks,
  listKnownWords,
  listLogs,
  listSets,
  retireActiveBook,
  retireSet,
  saveChild,
  sourceTitle,
} from '@/lib/repo';
import { goBack } from '@/lib/nav';

async function load(childId: string) {
  const child = await getChild(childId);
  if (!child) return null;
  const [sets, logs, activeBooks] = await Promise.all([listSets(childId), listLogs(childId), listActiveBooks(childId)]);
  const titled = await Promise.all(sets.map(async (s) => ({ set: s, title: await sourceTitle(s.sourceType, s.sourceId) })));
  const books = await Promise.all(activeBooks.map(async (ab) => ({ ab, book: await getBook(ab.bookId) })));
  const withBooks = books.filter((b): b is { ab: ActiveBook; book: Book } => !!b.book);

  // §9.3: once a book retires, suggest the next one (same category and stage, highest readiness).
  let suggestion: { book: Book; percent: number } | null = null;
  const lastRetired = withBooks.filter((b) => b.ab.status === 'retired').sort((a, b) => (b.ab.retiredOn ?? '').localeCompare(a.ab.retiredOn ?? ''))[0];
  if (lastRetired && withBooks.filter((b) => b.ab.status === 'active').length < child.settings.maxActiveBooks) {
    const known = await listKnownWords(childId);
    const next = suggestNextBook(lastRetired.book, await listBooks(), known, new Set(activeBooks.map((ab) => ab.bookId)));
    if (next) suggestion = { book: next, percent: readiness(next.vocabulary, known).percent };
  }
  return { child, logs, sets: titled, books: withBooks, suggestion };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Time per card: quarter seconds up to 3 s, whole seconds above. */
const speedStep = (v: number, d: 1 | -1) => ((d > 0 ? v >= 3 : v > 3) ? 1 : 0.25);

/** FR-41 settings plus the child's Program: active / retired sets and books (FR-32..39, FR-71). */
export default function ChildDetail() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const q = useLiveQuery(() => load(childId), ['child', 'set', 'log', 'activeBook', 'book', 'pack', 'deck', 'knownWord'], [childId]);
  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><Body>{t('common.notFound')}</Body></Screen>;
  const { child, sets, books, logs, suggestion } = q.data;
  const s = child.settings;

  const update = async (patch: Partial<ChildSettings>, extra: Partial<ChildProfile> = {}) => {
    await saveChild({ ...child, ...extra, settings: { ...s, ...patch } });
    if ('remindersEnabled' in patch || 'reminderTimes' in patch) scheduleReminders().catch(() => {});
  };
  const L = SETTING_LIMITS;
  const active = sets.filter((x) => x.set.status === 'active');
  const retired = sets.filter((x) => x.set.status === 'retired').reverse();

  return (
    <Screen>
      <Stack.Screen options={{ title: child.nickname }} />
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" title={t('child.history')} onPress={() => router.push(`/children/${childId}/history`)} />
        <Button variant="secondary" title={t('child.words')} onPress={() => router.push(`/children/${childId}/words`)} />
      </View>

      <Section title={t('program.activeSets', { count: active.length, max: s.maxActiveSets })}>
        {child.chooseNewSource && <Row title={`🌟 ${t('program.chooseNewPack')}`} />}
        {active.map(({ set, title }) => {
          const st = setTodayStatus(set as ActiveSet, logs, s, localDate());
          return (
            <View key={set.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.border, padding: 12, gap: 8 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{title}</Text>
              <Text style={{ color: theme.muted }}>
                {t('program.setMeta', { cards: set.cardIds.length, days: st.activeDayCount, target: st.targetDays, done: st.done, perDay: s.sessionsPerDay })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" title={t('program.extend')} onPress={() => extendSet(set.id)} />
                <Button variant="ghost" title={t('program.retire')} onPress={() => retireSet(child, set.id)} />
              </View>
            </View>
          );
        })}
        <Row title={`＋ ${t('program.addSet')}`} onPress={() => router.push(`/children/${childId}/add-set`)} last />
      </Section>

      {!!retired.length && (
        <Section title={t('program.retired')}>
          {retired.map(({ set, title }, i) => (
            <Row
              key={set.id}
              last={i === retired.length - 1}
              title={title}
              subtitle={t('program.retiredOn', { date: set.retiredOn, cards: set.cardIds.length })}
              right={<Button variant="ghost" title={t('program.review')} onPress={() => router.push(`/${childId}/session/${set.id}`)} />}
            />
          ))}
        </Section>
      )}

      <Section title={t('program.books')}>
        {books.map(({ ab, book }) => (
          <View key={ab.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.border, padding: 12, gap: 8 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
              {book.title.en} {ab.status === 'retired' ? `· ${t('program.onShelf')}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ab.status === 'active' ? (
                <>
                  <Button variant="secondary" title={t('program.extend')} onPress={() => extendActiveBook(ab.id)} />
                  <Button variant="ghost" title={t('program.retire')} onPress={() => retireActiveBook(ab.id)} />
                </>
              ) : (
                <Button variant="secondary" title={t('words.markBook')} onPress={() => addKnownWords(childId, book.vocabulary, 'book', book.id)} />
              )}
            </View>
          </View>
        ))}
        {suggestion && (
          <Row
            title={`💡 ${t('program.suggestedBook', { title: suggestion.book.title.en })}`}
            subtitle={t('program.suggestedBookSub', { stage: suggestion.book.stage, percent: suggestion.percent })}
            right={<Button variant="secondary" title={t('program.add')} onPress={() => addActiveBook(child, suggestion.book.id)} />}
          />
        )}
        <Row title={`＋ ${t('program.addBook')}`} onPress={() => router.push('/books')} last />
      </Section>

      <Section title={t('settings.flash')}>
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '600' }}>{t('settings.nameDisplay')}</Text>
          <Segmented
            value={s.nameDisplay}
            onChange={(v) => update({ nameDisplay: v })}
            options={[
              { value: 'hidden', label: t('settings.nameHidden') },
              { value: 'below', label: t('settings.nameBelow') },
              { value: 'after', label: t('settings.nameAfter') },
            ]}
          />
        </View>
        <ToggleRow label={t('settings.factCaption')} value={s.factCaption} onChange={(v) => update({ factCaption: v })} />
        <Stepper label={t('settings.sessionSize')} value={s.sessionSize} {...L.sessionSize} onChange={(v) => update({ sessionSize: v })} />
        <Stepper label={t('settings.speed')} value={s.secondsPerCard} {...L.secondsPerCard} step={speedStep} format={(v) => `${v} s`} onChange={(v) => update({ secondsPerCard: v })} />
        <Stepper label={t('settings.daysPerSet')} value={s.daysPerSet} {...L.daysPerSet} onChange={(v) => update({ daysPerSet: v })} />
        <Stepper label={t('settings.sessionsPerDay')} value={s.sessionsPerDay} {...L.sessionsPerDay} onChange={(v) => update({ sessionsPerDay: v })} />
        <Stepper label={t('settings.maxActiveSets')} value={s.maxActiveSets} {...L.maxActiveSets} onChange={(v) => update({ maxActiveSets: v })} last />
      </Section>

      <Section title={t('settings.reading')}>
        <View style={{ padding: 12, gap: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '600' }}>{t('settings.bookLayout')}</Text>
          <Segmented
            value={s.bookLayout}
            onChange={(v) => update({ bookLayout: v })}
            options={[
              { value: 'text-then-picture', label: t('settings.layoutTextThenPicture') },
              { value: 'text-only', label: t('settings.layoutTextOnly') },
              { value: 'side-by-side', label: t('settings.layoutSideBySide') },
            ]}
          />
        </View>
        <Stepper label={t('settings.readingsPerDay')} value={s.readingsPerDay} {...L.readingsPerDay} onChange={(v) => update({ readingsPerDay: v })} />
        <Stepper label={t('settings.daysPerBook')} value={s.daysPerBook} {...L.daysPerBook} onChange={(v) => update({ daysPerBook: v })} />
        <Stepper label={t('settings.maxActiveBooks')} value={s.maxActiveBooks} {...L.maxActiveBooks} onChange={(v) => update({ maxActiveBooks: v })} />
        <ToggleRow label={t('settings.pageAuto')} value={s.pageAutoAdvanceSeconds !== null} onChange={(v) => update({ pageAutoAdvanceSeconds: v ? 4 : null })} />
        {s.pageAutoAdvanceSeconds !== null && (
          <Stepper
            label={t('settings.pageSeconds')}
            value={s.pageAutoAdvanceSeconds}
            {...L.pageAutoAdvanceSeconds}
            format={(v) => `${v} s`}
            onChange={(v) => update({ pageAutoAdvanceSeconds: v })}
            last
          />
        )}
      </Section>

      {Platform.OS !== 'web' && (
        <Section title={t('settings.reminders')}>
          <ToggleRow label={t('settings.remindersOn')} value={s.remindersEnabled} onChange={(v) => update({ remindersEnabled: v })} />
          <View style={{ padding: 12, gap: 8 }}>
            <DraftField
              key={child.id}
              label={t('settings.reminderTimes')}
              initial={s.reminderTimes.join(', ')}
              onCommit={(v) => {
                const parsed = v.split(/[,\s]+/).filter(Boolean);
                if (!parsed.every((x) => TIME_RE.test(x))) return s.reminderTimes.join(', ');
                update({ reminderTimes: parsed });
              }}
            />
          </View>
        </Section>
      )}

      <Button
        variant="danger"
        title={t('child.delete')}
        onPress={() =>
          confirm(t('child.deleteTitle', { name: child.nickname }), t('child.deleteBody'), async () => {
            await deleteChild(child.id);
            goBack();
          }, t('common.delete'), t('common.cancel'))
        }
      />
    </Screen>
  );
}
