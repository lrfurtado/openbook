import { fitText, LETTER_SPACING_EM, LINE_HEIGHT, loc, stageColor, type Book, type ReaderPage } from '@openbook/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { MediaImage } from './CardImage';
import { deviceRendition } from '@/lib/repo';

/** Stage typography (FR-63/64): auto-fit, never below the stage minimum; tap a word to highlight it (FR-69). */
export function BookText({
  text,
  stage,
  width,
  height,
  highlighted,
  onWordPress,
}: {
  text: string;
  stage: Book['stage'];
  width: number;
  height: number;
  highlighted?: ReadonlySet<number>;
  onWordPress?: (i: number) => void;
}) {
  const fit = fitText(text, width, height, stage);
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <View style={[styles.textWrap, { width, height }]}>
      <Text
        style={{
          color: stageColor(stage),
          fontSize: fit.fontSize,
          lineHeight: fit.fontSize * LINE_HEIGHT,
          letterSpacing: fit.fontSize * LETTER_SPACING_EM,
          fontWeight: '600',
          textAlign: 'center',
          maxWidth: width * 0.9,
        }}
      >
        {words.map((w, i) => (
          <Text key={i}>
            <Text
              onPress={onWordPress ? () => onWordPress(i) : undefined}
              style={highlighted?.has(i) ? styles.highlight : undefined}
              suppressHighlighting
            >
              {w}
            </Text>
            {i < words.length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
    </View>
  );
}

export function BookPageView({
  book,
  page,
  width,
  height,
  highlighted,
  onWordPress,
}: {
  book: Book;
  page: ReaderPage;
  width: number;
  height: number;
  highlighted?: ReadonlySet<number>;
  onWordPress?: (i: number) => void;
}) {
  const { t } = useTranslation();
  const common = { stage: book.stage, highlighted, onWordPress };
  switch (page.kind) {
    case 'cover':
      return <BookText text={loc(book.title)} width={width} height={height} {...common} />;
    case 'end':
      return <BookText text={t('reader.theEnd')} width={width} height={height} stage={book.stage} />;
    case 'text':
      return <BookText text={loc(book.pages[page.pageIndex].text)} width={width} height={height} {...common} />;
    case 'picture': {
      const img = book.pages[page.pageIndex].image;
      return (
        <MediaImage
          mediaKey={img?.localPath}
          remoteUrl={img ? deviceRendition(img.renditions)?.url : undefined}
          contentFit="contain"
          style={{ width, height }}
        />
      );
    }
    case 'spread': {
      const p = book.pages[page.pageIndex];
      return (
        <View style={{ flexDirection: 'row', width, height }}>
          <BookText text={loc(p.text)} width={width / 2} height={height} {...common} />
          <MediaImage
            mediaKey={p.image?.localPath}
            remoteUrl={p.image ? deviceRendition(p.image.renditions)?.url : undefined}
            contentFit="contain"
            style={{ width: width / 2, height }}
          />
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  textWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  highlight: { backgroundColor: '#FFF176' },
});
