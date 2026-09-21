import { describe, expect, it } from 'vitest';
import { correctiveMessages } from '@/i18n/corrective-messages';
import { productMessages } from '@/i18n/product-messages';

describe('final public product copy', () => {
  it('uses the approved Arelis slogan in every explicit locale', () => {
    expect(productMessages.en.hero).toBe('Modern dentistry with attention to detail');
    expect(productMessages.ru.hero).toBe('Современная стоматология с вниманием к деталям');
    expect(productMessages.hy.hero).toBe('Ժամանակակից ատամնաբուժություն՝ ուշադրությամբ յուրաքանչյուր մանրուքին');
    expect(Object.values(productMessages).map(({ hero }) => hero)).not.toContain('Dentistry, made clear');
    expect(Object.values(productMessages).map(({ hero }) => hero)).not.toContain('Стоматология, где всё понятно');
    expect(Object.values(productMessages).map(({ hero }) => hero)).not.toContain('Ատամնաբուժություն՝ պարզ ու հասկանալի');
  });

  it('keeps phone validation concise and localized without changing validation rules', () => {
    expect(correctiveMessages.en.invalidPhone).toBe('Enter a valid phone number.');
    expect(correctiveMessages.ru.invalidPhone).toBe('Введите корректный номер телефона.');
    expect(correctiveMessages.hy.invalidPhone).toBe('Մուտքագրեք վավեր հեռախոսահամար։');
  });
});
