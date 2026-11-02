import { router, type Href } from 'expo-router';

/** Goes back, or to `fallback` when there is no history (deep link or web reload). */
export function goBack(fallback: Href = '/home') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
