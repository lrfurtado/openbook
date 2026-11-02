import { loc, NAME_RED, pageSequence, readiness, stageColor, type Book, type BookLayout } from '@openbook/shared';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from './CardImage';
import { useTheme } from './theme';
import { Button, Row, Section } from './ui';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { addKnownWords, bookCover, deviceRendition, listChildren, listKnownWords } from '@/lib/repo';

/** A book's cover picture (local file, else its remote rendition), or a red-bordered blank. */
export function BookCover({ book, width, height, radius = 8 }: { book: Pick<Book, 'coverImage' | 'pages' | 'title'>; width: number; height: number; radius?: number }) {
  const img = bookCover(book);
  const style = { width, height, borderRadius: radius, backgroundColor: '#eee' };
  if (!img) return <View style={[style, styles.blank, { borderRadius: radius }]} />;
  return <MediaImage mediaKey={img.localPath} remoteUrl={deviceRendition(img.renditions)?.url} accessibilityLabel={loc(book.title)} style={style} />;
}

const TILE = { width: 128, height: 96 };

/** Miniature pages in reading order, so a parent can see a book before reading or downloading it. */
export function PageStrip({ book, layout = book.layout }: { book: Book; layout?: BookLayout }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const textTile = (text: string, width = TILE.width) => (
    <View style={[styles.textTile, { width }]}>
      <Text numberOfLines={4} style={{ color: stageColor(book.stage), fontWeight: '700', fontSize: book.stage <= 2 ? 16 : 12, textAlign: 'center' }}>
        {text}
      </Text>
    </View>
  );
  const picture = (i: number, width = TILE.width) => {
    const img = book.pages[i].image;
    return (
      <MediaImage
        mediaKey={img?.localPath}
        remoteUrl={img ? deviceRendition(img.renditions)?.url : undefined}
        contentFit="cover"
        style={{ width, height: TILE.height, backgroundColor: '#eee' }}
      />
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.strip}>
      {pageSequence(book, layout).map((p, n) => (
        <View key={n} style={styles.item}>
          <View style={[styles.tile, { borderColor: theme.border }]}>
            {p.kind === 'cover' && textTile(loc(book.title))}
            {p.kind === 'end' && textTile(t('reader.theEnd'))}
            {p.kind === 'text' && textTile(loc(book.pages[p.pageIndex].text))}
            {p.kind === 'picture' && picture(p.pageIndex)}
            {p.kind === 'spread' && (
              <View style={{ flexDirection: 'row' }}>
                {textTile(loc(book.pages[p.pageIndex].text), TILE.width / 2)}
                {picture(p.pageIndex, TILE.width / 2)}
              </View>
            )}
          </View>
          <Text style={[styles.num, { color: theme.muted }]}>{n + 1}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blank: { borderWidth: 4, borderColor: NAME_RED, backgroundColor: '#fff' },
  strip: { gap: 10, paddingVertical: 4 },
  item: { alignItems: 'center', gap: 4 },
  tile: { ...TILE, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
  textTile: { height: TILE.height, padding: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  num: { fontSize: 11 },
});

/** FR-75: per-child readiness with the new words, plus one tap to mark them known (FR-74). Information only. */
export function BookReadiness({ vocabulary, bookId }: { vocabulary: readonly string[]; bookId?: string }) {
  const { t } = useTranslation();
  const q = useLiveQuery(
    async () => Promise.all((await listChildren()).map(async (child) => ({ child, words: await listKnownWords(child.id) }))),
    ['child', 'knownWord'],
    [],
  );
  if (!q.data?.length) return null;
  return (
    <Section title={t('words.readiness')}>
      {q.data.map(({ child, words }, i) => {
        const r = readiness(vocabulary, words);
        return (
          <Row
            key={child.id}
            last={i === q.data!.length - 1}
            title={`${child.avatar} ${child.nickname} — ${r.percent}%`}
            subtitle={r.newWords.length ? t('words.newWords', { words: r.newWords.join(', ') }) : t('words.allKnown')}
            right={
              r.newWords.length && bookId ? (
                <Button variant="ghost" title={t('words.markKnown')} onPress={() => addKnownWords(child.id, r.newWords, 'book', bookId)} />
              ) : undefined
            }
          />
        );
      })}
    </Section>
  );
}
