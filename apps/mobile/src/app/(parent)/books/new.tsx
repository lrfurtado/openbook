import { BOOK_TEMPLATES, bookFromTemplate, generateBookFromCards, type Book, type BookStage, type SourceType } from '@openbook/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { CardThumb } from '@/components/CardImage';
import { useTheme } from '@/components/theme';
import { Body, Button, Field, Row, Screen, Section, Segmented } from '@/components/ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { newId, nowIso } from '@/lib/ids';
import { getCards, listChildren, listDecks, listPacks, saveBook } from '@/lib/repo';

type Mode = 'template' | 'generate' | 'blank';
const STAGES = [1, 2, 3, 4].map((s) => ({ value: s as BookStage, label: `${s}` }));

async function openEditor(book: Book) {
  const saved = await saveBook(book);
  router.replace(`/books/${saved.id}/edit`);
}

/** FR-61/62: blank book, starter template, or generated from a pack / deck. */
export default function NewBook() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('template');
  const [stage, setStage] = useState<BookStage>(1);
  const [title, setTitle] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [source, setSource] = useState<{ type: SourceType; id: string; title: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const q = useLiveQuery(
    async () => ({ children: await listChildren(), packs: (await listPacks()).filter((p) => p.status === 'complete'), decks: await listDecks() }),
    ['child', 'pack', 'deck'],
    [],
  );
  const sourceCards = useLiveQuery(
    async () => {
      if (!source) return [];
      const ids = source.type === 'pack' ? q.data?.packs.find((p) => p.id === source.id)?.cardIds : q.data?.decks.find((d) => d.id === source.id)?.cardIds;
      return getCards(ids ?? []);
    },
    ['card'],
    [source?.id, q.data],
  );
  const nickname = q.data?.children.find((c) => c.id === childId)?.nickname ?? q.data?.children[0]?.nickname ?? '';

  return (
    <Screen>
      <Stack.Screen options={{ title: t('books.new') }} />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'template', label: t('newBook.template') },
          { value: 'generate', label: t('newBook.generate') },
          { value: 'blank', label: t('newBook.blank') },
        ]}
      />
      <Body muted>{t('newBook.stage')}</Body>
      <Segmented value={stage} onChange={setStage} options={STAGES} />

      {mode === 'template' && (
        <>
          {(q.data?.children.length ?? 0) > 1 && (
            <Section title={t('newBook.forChild')}>
              {q.data!.children.map((c, i) => (
                <Row
                  key={c.id}
                  last={i === q.data!.children.length - 1}
                  title={`${c.avatar} ${c.nickname}`}
                  right={<Text style={{ color: theme.primary, fontSize: 20 }}>{(childId ?? q.data!.children[0].id) === c.id ? '●' : '○'}</Text>}
                  onPress={() => setChildId(c.id)}
                />
              ))}
            </Section>
          )}
          <Section title={t('newBook.templates')}>
            {BOOK_TEMPLATES.map((tpl, i) => (
              <Row
                key={tpl.key}
                last={i === BOOK_TEMPLATES.length - 1}
                title={tpl.title.replace('{name}', nickname || t('newBook.child'))}
                subtitle={tpl.pages.slice(0, 2).join(' / ').replaceAll('{name}', nickname)}
                onPress={() => openEditor(bookFromTemplate(tpl, nickname, newId, nowIso(), stage))}
              />
            ))}
          </Section>
        </>
      )}

      {mode === 'generate' && (
        <>
          <Section title={t('newBook.source')}>
            {[...(q.data?.packs.map((p) => ({ type: 'pack' as const, id: p.id, title: p.title.en })) ?? []), ...(q.data?.decks.map((d) => ({ type: 'deck' as const, id: d.id, title: d.title })) ?? [])].map(
              (s, i, all) => (
                <Row
                  key={s.id}
                  last={i === all.length - 1}
                  title={s.title}
                  right={<Text style={{ color: theme.primary, fontSize: 20 }}>{source?.id === s.id ? '●' : '○'}</Text>}
                  onPress={async () => {
                    setSource(s);
                    setTitle(s.title);
                    const ids = s.type === 'pack' ? q.data?.packs.find((p) => p.id === s.id)?.cardIds : q.data?.decks.find((d) => d.id === s.id)?.cardIds;
                    setPicked(new Set((ids ?? []).slice(0, 10)));
                  }}
                />
              ),
            )}
          </Section>
          {source && (
            <>
              <Field label={t('newBook.title')} value={title} onChangeText={setTitle} />
              <Button
                title={t('newBook.generateButton', { count: picked.size })}
                disabled={!picked.size || !title.trim()}
                onPress={async () => {
                  const cards = (sourceCards.data ?? []).filter((c) => picked.has(c.id));
                  await openEditor(
                    generateBookFromCards({
                      cards,
                      stage,
                      title: title.trim(),
                      source: { sourceType: source.type, sourceId: source.id },
                      newId,
                      now: nowIso(),
                      localImage: (id) => cards.find((c) => c.id === id)?.image.localPath,
                    }),
                  );
                }}
              />
              <Section title={t('newBook.chooseCards')}>
                {sourceCards.data?.map((c, i) => (
                  <Row
                    key={c.id}
                    last={i === sourceCards.data!.length - 1}
                    title={c.name.en}
                    left={<CardThumb card={c} size={40} />}
                    right={<Text style={{ fontSize: 22, color: picked.has(c.id) ? theme.primary : theme.muted }}>{picked.has(c.id) ? '☑' : '☐'}</Text>}
                    onPress={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                  />
                ))}
              </Section>
            </>
          )}
        </>
      )}

      {mode === 'blank' && (
        <>
          <Field label={t('newBook.title')} value={title} onChangeText={setTitle} />
          <Button
            title={t('newBook.create')}
            disabled={!title.trim()}
            onPress={() =>
              openEditor({
                id: newId(),
                source: 'homemade',
                title: { en: title.trim() },
                stage,
                layout: 'text-then-picture',
                pages: [{ id: newId(), text: { en: '' } }],
                vocabulary: [],
                showEndPage: true,
                version: 1,
                containsPrivatePhotos: false,
                updatedAt: nowIso(),
              })
            }
          />
        </>
      )}
    </Screen>
  );
}
