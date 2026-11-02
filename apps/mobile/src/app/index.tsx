import { Redirect } from 'expo-router';
import { useAppSelector } from '@/store';

export default function Index() {
  const onboarded = useAppSelector((s) => s.app.onboarded);
  return <Redirect href={onboarded ? '/profiles' : '/onboarding'} />;
}
