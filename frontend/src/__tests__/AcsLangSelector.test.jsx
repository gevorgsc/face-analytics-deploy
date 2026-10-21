import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AcsAutoTranslator,
  AcsLangSelector,
  I18nContext,
  useAcsTr,
} from '../i18n';

function TranslatedLabel() {
  const t = useAcsTr();
  return <span data-testid="translated-label">{t('acsDashboard')}</span>;
}

function TranslationProbe({ text, testId }) {
  const t = useAcsTr();
  return <span data-testid={testId}>{t(text)}</span>;
}

function StatefulLanguageHarness() {
  const [lang, setLang] = React.useState('en');
  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      <div className="acs-app">
        <AcsAutoTranslator />
        <AcsLangSelector />
        <span data-testid="current-lang">{lang}</span>
        <TranslatedLabel />
        <span data-testid="automatic-label">Device Management</span>
      </div>
    </I18nContext.Provider>
  );
}

describe('AcsLangSelector', () => {
  it('translates controller, incident and operator-command text', () => {
    render(
      <>
        <I18nContext.Provider value={{ lang: 'ru', setLang: () => {} }}>
          <TranslationProbe text="Door Controllers" testId="ru-controllers" />
          <TranslationProbe text="Configurations" testId="ru-configurations" />
          <TranslationProbe text="Emergency open_all sent to 1 device(s)" testId="ru-command" />
          <TranslationProbe
            text="Door 1 command=unlock on VIP Door (172.16.11.248) — ok=True"
            testId="ru-door-command"
          />
        </I18nContext.Provider>
        <I18nContext.Provider value={{ lang: 'hy', setLang: () => {} }}>
          <TranslationProbe text="Incidents" testId="hy-incidents" />
          <TranslationProbe text="Emergency lockdown sent to 2 device(s)" testId="hy-command" />
        </I18nContext.Provider>
      </>,
    );

    expect(screen.getByTestId('ru-controllers')).toHaveTextContent('Контроллеры дверей');
    expect(screen.getByTestId('ru-configurations')).toHaveTextContent('Конфигурации');
    expect(screen.getByTestId('ru-command')).toHaveTextContent('Экстренное открытие: отправлено устройствам — 1');
    expect(screen.getByTestId('ru-door-command')).toHaveTextContent(
      'Дверь 1: разблокировка — VIP Door (172.16.11.248), результат: успешно',
    );
    expect(screen.getByTestId('hy-incidents')).toHaveTextContent('Միջադեպեր');
    expect(screen.getByTestId('hy-command')).toHaveTextContent('Արտակարգ արգելափակում. ուղարկվել է 2 սարքի');
  });

  it('updates its context value when an option is selected', async () => {
    function SelectorOnlyHarness() {
      const [lang, setLang] = React.useState('en');
      return (
        <I18nContext.Provider value={{ lang, setLang }}>
          <AcsLangSelector />
          <span data-testid="selector-lang">{lang}</span>
        </I18nContext.Provider>
      );
    }

    render(<SelectorOnlyHarness />);
    fireEvent.click(screen.getByRole('button', { name: /Eng/i }));
    fireEvent.click(screen.getByRole('option', { name: /Рус RU/i }));
    await waitFor(() => expect(screen.getByTestId('selector-lang')).toHaveTextContent('ru'));
  });

  it('updates the selected language and visible translations without reloading', async () => {
    render(<StatefulLanguageHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Eng/i }));
    fireEvent.click(screen.getByRole('option', { name: /Рус RU/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Рус/i })).toBeInTheDocument();
      expect(screen.getByTestId('current-lang')).toHaveTextContent('ru');
      expect(screen.getByTestId('translated-label')).toHaveTextContent('Панель управления');
      expect(screen.getByTestId('automatic-label')).toHaveTextContent('Управление устройствами');
    });
  });
});
