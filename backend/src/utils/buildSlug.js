import crypto from 'crypto';
import slugify from 'slugify';

const buildSlug = (value) => {
  let slug = slugify(String(value || ''), {
    lower: true,
    strict: true,
    trim: true,
  });

  if (!slug) {
    slug = `item-${crypto.randomUUID().slice(0, 8)}`;
  }

  return slug;
};

export default buildSlug;
