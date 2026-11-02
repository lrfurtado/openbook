import type { Card } from '@openbook/shared';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';
import { useMediaUri } from '@/hooks/useMediaUri';
import { deviceRendition } from '@/lib/repo';

/** A card or book image from local media, falling back to its remote rendition while online. */
export function MediaImage({
  mediaKey,
  remoteUrl,
  style,
  contentFit = 'cover',
  accessibilityLabel,
}: {
  mediaKey?: string;
  remoteUrl?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
}) {
  const uri = useMediaUri(mediaKey, remoteUrl);
  return <Image source={uri ? { uri } : undefined} style={style} contentFit={contentFit} accessibilityLabel={accessibilityLabel} />;
}

export function CardThumb({ card, size = 56 }: { card: Pick<Card, 'image' | 'name'>; size?: number }) {
  return (
    <MediaImage
      mediaKey={card.image.localPath}
      remoteUrl={deviceRendition(card.image.renditions)?.url}
      accessibilityLabel={card.name.en}
      style={{ width: size, height: size, borderRadius: 8, backgroundColor: '#eee' }}
    />
  );
}
