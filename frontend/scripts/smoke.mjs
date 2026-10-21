import { readdirSync, readFileSync } from 'node:fs';

const files = {
  app: readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  apiConfig: readFileSync(new URL('../src/apiConfig.js', import.meta.url), 'utf8'),
  eventGrid: readFileSync(new URL('../src/EventGridPro.jsx', import.meta.url), 'utf8'),
  i18n: readFileSync(new URL('../src/i18n.jsx', import.meta.url), 'utf8'),
  sessions: readFileSync(new URL('../src/SessionsPanel.jsx', import.meta.url), 'utf8'),
};

function dictionaryKeys(lang, nextLang) {
  const pattern = new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\}${nextLang ? `,\\s*\\n  ${nextLang}:` : ',?\\s*\\n\\};'}`);
  const match = files.i18n.match(pattern);
  if (!match) throw new Error(`Could not read ${lang} dictionary`);
  return new Set([...match[1].matchAll(/(?:^|,\s*)\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map(m => m[1]));
}

const dictionaries = {
  en: dictionaryKeys('en', 'hy'),
  hy: dictionaryKeys('hy', 'ru'),
  ru: dictionaryKeys('ru'),
};

const srcDir = new URL('../src/', import.meta.url);
const source = readdirSync(srcDir)
  .filter(name => /\.(jsx|js)$/.test(name))
  .map(name => readFileSync(new URL(name, srcDir), 'utf8'))
  .join('\n');
const usedTranslationKeys = new Set([...source.matchAll(/\bt\(['"]([a-zA-Z][a-zA-Z0-9]*)['"]\)/g)].map(m => m[1]));
const dictionaryMismatch = [...dictionaries.en].some(key => !dictionaries.hy.has(key) || !dictionaries.ru.has(key))
  || [...dictionaries.hy].some(key => !dictionaries.en.has(key) || !dictionaries.ru.has(key))
  || [...dictionaries.ru].some(key => !dictionaries.en.has(key) || !dictionaries.hy.has(key));
const dictionaryDiffs = [];
for (const lang of Object.keys(dictionaries)) {
  for (const key of dictionaries.en) {
    if (!dictionaries[lang].has(key)) dictionaryDiffs.push(`${lang}:${key}`);
  }
}
const missingUsedKeys = [...usedTranslationKeys].filter(key => !dictionaries.en.has(key));
const hardcodedSidebarLabels = [
  '>Live Grid</span>',
  '>Zones</span>',
  '>Sessions</span>',
  '>Alerts</span>',
  '>Webhooks</span>',
  '>Reports</span>',
  '>Active Sessions</h1>',
];

const checks = [
  ['shared API config is imported', files.app.includes("from './apiConfig'")],
  ['events load is not capped at 100', !files.app.includes('/api/events?limit=100')],
  ['events load uses 100 item pages', files.app.includes('const EVENTS_PAGE_SIZE = 100')],
  ['events load uses server-side offset', files.app.includes('offset=${(eventsPage - 1) * EVENTS_PAGE_SIZE}')],
  ['theme toggle moved to topbar', files.app.includes('className="top-icon-btn"')],
  ['role badge exists', files.app.includes('role-badge')],
  ['event grid shows loaded count', files.eventGrid.includes('egrid-loaded-count')],
  ['event grid has pagination controls', files.eventGrid.includes('PaginationBar') && files.eventGrid.includes('egrid-page-btn')],
  ['production API can use same-origin proxy', files.apiConfig.includes(": ''")],
  ['translation dictionaries have matching keys', !dictionaryMismatch],
  ['all t() keys exist in dictionary', missingUsedKeys.length === 0],
  ['enterprise sidebar labels use translations', !hardcodedSidebarLabels.some(label => files.app.includes(label))],
  ['Russian login translation is readable', files.i18n.includes("login: 'Войти'")],
  ['all source files avoid common UTF-8 mojibake bytes', !/(Ð|Ñ|рџ)/.test(source)],
  ['visible text has no common mojibake markers', !/(вЂ|рџ|Х„|Р’)/.test(files.app + files.eventGrid + files.sessions)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  if (dictionaryDiffs.length) console.error(`Dictionary differences: ${dictionaryDiffs.join(', ')}`);
  if (missingUsedKeys.length) console.error(`Missing translation keys: ${missingUsedKeys.join(', ')}`);
  process.exit(1);
}

console.log(`Frontend smoke checks passed (${checks.length})`);
