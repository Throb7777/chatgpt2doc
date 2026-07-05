import { getUiStrings } from '../../ui/i18n';

export function App() {
  const language = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  const strings = getUiStrings(language);
  return (
    <main class="popup">
      <h1>{strings.popupTitle}</h1>
      <p>{strings.popupDescription}</p>
    </main>
  );
}
