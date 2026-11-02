import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';

const i18n = createInstance();

// NFR-9: every UI string lives in a resource file. v1 ships English only.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
