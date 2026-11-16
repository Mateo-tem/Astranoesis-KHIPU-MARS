import i18next from 'i18next';
import es from './es.json';
import en from './en.json';
import qu from './qu.json';

export type SupportedLocale = 'es' | 'en' | 'qu';

export const SUPPORTED_LOCALES: { code: SupportedLocale; label: string; nativeName: string }[] = [
  { code: 'es', label: 'Español', nativeName: 'Español' },
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'qu', label: 'Quechua', nativeName: 'Runasimi' },
];

export async function initI18n(defaultLang: SupportedLocale = 'es'): Promise<typeof i18next> {
  await i18next.init({
    lng: defaultLang,
    fallbackLng: 'es',
    debug: false,
    resources: {
      es: { translation: es },
      en: { translation: en },
      qu: { translation: qu },
    },
    interpolation: {
      escapeValue: false,
    },
  });

  return i18next;
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}

export async function changeLanguage(lang: SupportedLocale): Promise<void> {
  await i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
  window.dispatchEvent(new CustomEvent('astranoesis:locale-changed', { detail: { lang } }));
}

export default i18next;
