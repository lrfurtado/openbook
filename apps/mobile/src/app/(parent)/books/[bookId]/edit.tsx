import {
  bookVocabulary,
  countWords,
  fitText,
  readiness,
  STAGE_RULES,
  validateBook,
  type Book,
  type BookPage,
  type BookStage,
  type ChildProfile,
  type KnownWord,
  type StageIssue,
} from '@openbook/shared';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MediaImage } from '@/components/CardImage';
import { useTheme } from '@/components/theme';
import { Body, Button, Field, Loading, Notice, Screen, Section, Segmented, ToggleRow } from '@/components/ui';
import { pickPhoto } from '@/features/photos';
import { confirm } from '@/lib/confirm';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { newId } from '@/lib/ids';
import { media } from '@/lib/media';
import { deviceRendition, getBook, listChildren, listKnownWords, saveBook, userMediaKey } from '@/lib/repo';
import { goBack } from '@/lib/nav';

/** Reference landscape phone used to flag pages that cannot fit at the stage minimum (§9.3). */
const REF = { width: 844, height: 390 };

/** FR-63: stage limits warn on homemade books (official books are blocked in the CMS). */
function issuesFor(book: Book): StageIssue[] {
  const issues = validateBook(book);
  book.pages.forEach((p, i) => {
    const text = p.text.en ?? '';
    if (text.trim() && !fitText(text, REF.width, REF.height, book.stage).fits) {
      issues.push({ pageIndex: i, code: 'does-not-fit', message: '' });
    }
  });
  return issues;
}

type Known = { child: ChildProfile; words: KnownWord[] }[];

/** Page editor: text, photo, stage, layout, live stage warnings and vocabulary (FR-61..65, AC-12). */
export default function EditBook() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const q = useLiveQuery(
    async () => {
      const children = await listChildren();
      return { book: await getBook(bookId), known: await Promise.all(children.map(async (c) => ({ child: c, words: await listKnownWords(c.id) }))) };
    },
    ['book', 'knownWord'],
    [bookId],
  );
  if (!q.data?.book) return <Loading />;
  return <Editor key={q.data.book.id} initial={q.data.book} known={q.data.known} />;
}

function Editor({ initial, known }: { initial: Book; known: Known }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState<Book>(initial);
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Leaving with unsaved edits asks first (pages are only written on Save).
  const [base] = useState(initial);
  const dirty = draft !== base || Object.keys(pendingPhotos).length > 0;
  const allowLeave = usePreventRemove(dirty, ({ repeat }) =>
    confirm(t('editor.discardTitle'), t('editor.discardBody'), repeat, t('editor.discard'), t('common.cancel')),
  );

  const issues = useMemo(() => issuesFor(draft), [draft]);
  const vocabulary = useMemo(() => bookVocabulary(draft), [draft]);
  const rule = STAGE_RULES[draft.stage];
  const set = (patch: Partial<Book>) => setDraft({ ...draft, ...patch });
  const setPage = (i: number, patch: Partial<BookPage>) => set({ pages: draft.pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const move = (i: number, d: -1 | 1) => {
    const pages = draft.pages.slice();
    const j = i + d;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    set({ pages });
  };

  const insertPage = (i: number) => {
    const pages = draft.pages.slice();
    pages.splice(i + 1, 0, { id: newId(), text: { en: '' } });
    set({ pages });
  };

  const addPhoto = async (i: number, source: 'camera' | 'library') => {
    const photo = await pickPhoto(source);
    if (!photo) return;
    setPendingPhotos((p) => ({ ...p, [draft.pages[i].id]: photo.uri }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const pages: BookPage[] = [];
      for (const p of draft.pages) {
        const uri = pendingPhotos[p.id];
        if (uri) {
          const key = userMediaKey(`page-${p.id}`);
          await media.saveFromUri(uri, key);
          pages.push({ ...p, cardId: undefined, image: { renditions: [], localPath: key } });
        } else pages.push(p);
      }
      await saveBook({ ...draft, pages });
      allowLeave();
      goBack(`/books/${draft.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('editor.title') }} />
      <Field label={t('newBook.title')} value={draft.title.en ?? ''} onChangeText={(v) => set({ title: { en: v } })} />
      <Body muted>{t('newBook.stage')}</Body>
      <Segmented value={draft.stage} onChange={(v: BookStage) => set({ stage: v })} options={[1, 2, 3, 4].map((s) => ({ value: s as BookStage, label: `${s}` }))} />
      <Body muted>{t('editor.stageRule', { words: rule.maxWordsPerPage, pages: rule.maxPages })}</Body>
      <Segmented
        value={draft.layout}
        onChange={(v) => set({ layout: v })}
        options={[
          { value: 'text-then-picture', label: t('settings.layoutTextThenPicture') },
          { value: 'text-only', label: t('settings.layoutTextOnly') },
          { value: 'side-by-side', label: t('settings.layoutSideBySide') },
        ]}
      />
      <Section>
        <ToggleRow label={t('editor.endPage')} value={draft.showEndPage} onChange={(v) => set({ showEndPage: v })} last={draft.source === 'official'} />
        {draft.source !== 'official' && (
          <ToggleRow label={t('editor.readAloud')} value={draft.readAloud !== false} onChange={(v) => set({ readAloud: v })} last />
        )}
      </Section>
      {issues.some((i) => i.pageIndex === null) && <Notice>{t('editor.tooManyPages', { max: rule.maxPages })}</Notice>}
      {draft.pages.map((p, i) => {
        const words = countWords(p.text.en ?? '');
        const pageIssues = issues.filter((x) => x.pageIndex === i);
        const pending = pendingPhotos[p.id];
        return (
          <Section
            key={p.id}
            title={t('editor.page', { n: i + 1 })}
            right={
              <View style={{ flexDirection: 'row' }}>
                {[
                  ['＋', t('editor.insertPage'), () => insertPage(i)],
                  ['↑', t('editor.moveUp'), () => move(i, -1)],
                  ['↓', t('editor.moveDown'), () => move(i, 1)],
                  ['✕', t('editor.deletePage'), () => set({ pages: draft.pages.filter((_, j) => j !== i) })],
                ].map(([glyph, label, fn]) => (
                  <Pressable key={glyph as string} accessibilityRole="button" accessibilityLabel={label as string} onPress={fn as () => void} style={styles.iconBtn}>
                    <Text style={{ color: theme.text, fontSize: 18 }}>{glyph as string}</Text>
                  </Pressable>
                ))}
              </View>
            }
          >
            <View style={{ padding: 12, gap: 8 }}>
              <TextInput
                accessibilityLabel={t('editor.page', { n: i + 1 })}
                value={p.text.en ?? ''}
                onChangeText={(v) => setPage(i, { text: { en: v } })}
                multiline
                style={[styles.text, { color: theme.text, borderColor: theme.border }]}
                placeholder={t('editor.textPlaceholder')}
                placeholderTextColor={theme.muted}
              />
              <Text style={{ color: words > rule.maxWordsPerPage ? theme.warning : theme.muted }}>
                {words > rule.maxWordsPerPage ? '⚠︎ ' : ''}
                {t('editor.words', { count: words, max: rule.maxWordsPerPage })}
              </Text>
              {pageIssues.some((x) => x.code === 'does-not-fit') && <Notice>{t('editor.doesNotFit')}</Notice>}
              {pending ? (
                <Image source={{ uri: pending }} style={styles.thumb} contentFit="cover" />
              ) : p.image ? (
                <MediaImage mediaKey={p.image.localPath} remoteUrl={deviceRendition(p.image.renditions)?.url} style={styles.thumb} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" title={p.image || pending ? t('editor.replacePhoto') : t('editor.addPhoto')} onPress={() => addPhoto(i, 'library')} />
                <Button variant="secondary" title={t('editor.takePhoto')} onPress={() => addPhoto(i, 'camera')} />
                {(p.image || pending) && (
                  <Button
                    variant="ghost"
                    title={t('editor.removePhoto')}
                    onPress={() => {
                      setPendingPhotos(({ [p.id]: _, ...rest }) => rest);
                      setPage(i, { image: undefined, cardId: undefined });
                    }}
                  />
                )}
              </View>
            </View>
          </Section>
        );
      })}
      <Button variant="secondary" title={t('editor.addPage')} onPress={() => set({ pages: [...draft.pages, { id: newId(), text: { en: '' } }] })} />
      <Section title={t('editor.vocabulary', { count: vocabulary.length })}>
        <View style={{ padding: 12, gap: 6 }}>
          <Text style={{ color: theme.text }}>{vocabulary.join(', ')}</Text>
          {known.map(({ child, words }) => (
            <Text key={child.id} style={{ color: theme.muted }}>
              {t('editor.readiness', { name: child.nickname, percent: readiness(vocabulary, words).percent })}
            </Text>
          ))}
        </View>
      </Section>
      {draft.source !== 'official' && Object.keys(pendingPhotos).length > 0 && <Notice tone="info">{t('editor.privatePhotos')}</Notice>}
      <Button title={t('common.save')} loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { padding: 6, minWidth: 34, alignItems: 'center' },
  text: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 18, minHeight: 60 },
  thumb: { width: 160, height: 120, borderRadius: 8, backgroundColor: '#eee' },
});
