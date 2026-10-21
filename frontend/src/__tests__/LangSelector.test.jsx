import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LangSelector, I18nContext } from '../i18n';

function Wrapper({ lang, setLang, children }) {
  return <I18nContext.Provider value={{ lang, setLang }}>{children}</I18nContext.Provider>;
}

describe('LangSelector', () => {
  it('renders a select with 3 language options', () => {
    render(
      <Wrapper lang="en" setLang={() => {}}>
        <LangSelector />
      </Wrapper>
    );
    const select = screen.getByRole('combobox');
    expect(select.options.length).toBe(3);
  });

  it('calls setLang when selection changes', () => {
    const setLang = vi.fn();
    render(
      <Wrapper lang="en" setLang={setLang}>
        <LangSelector />
      </Wrapper>
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hy' } });
    expect(setLang).toHaveBeenCalledWith('hy');
  });

  it('shows the current language as selected', () => {
    render(
      <Wrapper lang="ru" setLang={() => {}}>
        <LangSelector />
      </Wrapper>
    );
    expect(screen.getByRole('combobox').value).toBe('ru');
  });
});
