import { bindAttribute, bindText, getLocale, setLocale, subscribeLocale } from '../i18n.js';

export function createLanguageSelector() {
  const root = document.createElement('div');
  root.className = 'language-selector';

  const label = document.createElement('label');
  label.className = 'language-selector__label';
  label.htmlFor = 'ffa-locale';
  bindText(label, 'language.label');

  const select = document.createElement('select');
  select.id = 'ffa-locale';
  select.className = 'language-selector__select';
  bindAttribute(select, 'aria-label', 'language.label');
  select.append(new Option('한국어', 'ko'), new Option('English', 'en'));
  select.value = getLocale();
  select.addEventListener('change', () => setLocale(select.value));

  const stop = subscribeLocale((locale) => {
    select.value = locale;
  });

  root.append(label, select);
  document.body.append(root);
  return { root, destroy: () => { stop(); root.remove(); } };
}
