import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('gastro_smart_lang') : null;
const initialLang = savedLang === 'en' ? 'en' : 'es';

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
});

export const setAppLanguage = (lang: 'es' | 'en') => {
  const normalized = lang === 'en' ? 'en' : 'es';
  if (typeof window !== 'undefined') {
    localStorage.setItem('gastro_smart_lang', normalized);
  }
  if (i18n.language !== normalized) {
    i18n.changeLanguage(normalized);
  }
};

export default i18n;
