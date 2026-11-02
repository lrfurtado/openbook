import { Alert, Platform } from 'react-native';

/** A destructive-action confirmation that also works on web. */
export function confirm(title: string, message: string, onYes: () => void, yesLabel: string, cancelLabel: string) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}
