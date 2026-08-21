import crypto from 'crypto';
import slugify from 'slugify';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ARMENIAN_TRANSLITERATION = Object.freeze({
  'ա': 'a',
  'բ': 'b',
  'գ': 'g',
  'դ': 'd',
  'ե': 'e',
  'զ': 'z',
  'է': 'e',
  'ը': 'y',
  'թ': 't',
  'ժ': 'zh',
  'ի': 'i',
  'լ': 'l',
  'խ': 'kh',
  'ծ': 'ts',
  'կ': 'k',
  'հ': 'h',
  'ձ': 'dz',
  'ղ': 'gh',
  'ճ': 'ch',
  'մ': 'm',
  'յ': 'y',
  'ն': 'n',
  'շ': 'sh',
  'ո': 'o',
  'չ': 'ch',
  'պ': 'p',
  'ջ': 'j',
  'ռ': 'r',
  'ս': 's',
  'վ': 'v',
  'տ': 't',
  'ր': 'r',
  'ց': 'ts',
  'ւ': 'u',
  'փ': 'p',
  'ք': 'k',
  'օ': 'o',
  'ֆ': 'f',
  'և': 'ev',
});

const transliterateArmenian = (value) => (
  [...String(value || '').toLocaleLowerCase('hy')]
    .map((character) => (
      ARMENIAN_TRANSLITERATION[character] ?? character
    ))
    .join('')
);

const deterministicFallback = (value) => {
  const digest = crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex')
    .slice(0, 12);

  return `item-${digest}`;
};

const buildSlug = (value) => {
  const source = String(value || '').trim();
  const transliterated = transliterateArmenian(source);
  const slug = slugify(transliterated, {
    lower: true,
    strict: true,
    trim: true,
  });

  return slug || deterministicFallback(source);
};

const buildCanonicalSlug = ({
  explicit,
  english,
  armenian,
  fallback,
}) => {
  if (explicit !== undefined && explicit !== null) {
    const normalized = String(explicit).trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalized)) {
      throw new TypeError('Slug must use lowercase letters, numbers, and single hyphens');
    }
    return normalized;
  }

  return buildSlug(
    english || armenian || fallback
  );
};

export {
  SLUG_PATTERN,
  buildCanonicalSlug,
  transliterateArmenian,
};
export default buildSlug;
