import type { components } from "@/api/generated/schema";

export type PublicImageAsset = components["schemas"]["PublicImageAsset"];

const approvedSocialHosts = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  facebook: new Set(["facebook.com", "www.facebook.com", "m.facebook.com"]),
  whatsapp: new Set(["wa.me", "api.whatsapp.com", "www.whatsapp.com"]),
  telegram: new Set(["t.me", "telegram.me"]),
} as const;

export type SocialPlatform = keyof typeof approvedSocialHosts;

function parseCredentialFreeHttps(value: string) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function safeExternalUrl(value: string | undefined) {
  return value ? parseCredentialFreeHttps(value)?.toString() ?? null : null;
}

export function safeSocialUrl(platform: SocialPlatform, value: string | undefined) {
  if (!value) return null;
  const parsed = parseCredentialFreeHttps(value);
  return parsed && approvedSocialHosts[platform].has(parsed.hostname.toLowerCase())
    ? parsed.toString()
    : null;
}

export function safeEmailHref(value: string | undefined) {
  if (!value || value.length > 254 || /[\r\n]/.test(value)) return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? `mailto:${encodeURIComponent(normalized).replace(/%40/g, "@")}`
    : null;
}

export function safePhoneHref(value: string | undefined) {
  if (!value || value.length > 30 || !/^[+()\d .-]+$/.test(value)) return null;
  const normalized = value.replace(/[^+\d]/g, "");
  return /^\+?\d{5,20}$/.test(normalized) ? `tel:${normalized}` : null;
}

export function safeManagedImage(
  asset: PublicImageAsset | null | undefined,
  cloudinaryCloudName: string | undefined,
) {
  if (
    !asset ||
    !cloudinaryCloudName ||
    typeof asset.publicId !== "string" ||
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(asset.publicId) ||
    typeof asset.secureUrl !== "string" ||
    typeof asset.format !== "string"
  ) return null;

  const illustrationNames = new Set(['waiting', 'treatment', 'diagnostics', 'consultation',
    'hygiene-before', 'hygiene-after', 'restoration-before', 'restoration-after', 'whitening-before', 'whitening-after']);
  const illustration = asset.publicId.replace(/^tests\/arelis\//, '');
  if (process.env.NODE_ENV !== 'production' && cloudinaryCloudName === 'preview-local' &&
      asset.publicId === `tests/arelis/${illustration}` && illustrationNames.has(illustration) &&
      asset.secureUrl === `/illustrations/${illustration}.svg` && asset.format === 'svg' &&
      asset.width === 1200 && asset.height === 800) {
    return { src: asset.secureUrl, width: 1200, height: 800 };
  }

  if (
    process.env.NODE_ENV !== "production" &&
    cloudinaryCloudName === "preview-local" &&
    asset.publicId.startsWith("tests/") &&
    asset.secureUrl === "/og.png" &&
    asset.format.toLowerCase() === "png" &&
    Number.isInteger(asset.width) && asset.width > 0 &&
    Number.isInteger(asset.height) && asset.height > 0
  ) {
    return { src: "/og.png", width: asset.width, height: asset.height };
  }

  const parsed = parseCredentialFreeHttps(asset.secureUrl);
  const allowedPrefix = `/${cloudinaryCloudName}/image/upload/`;
  const format = asset.format.toLowerCase();
  const supportedFormat = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"])
    .has(format);
  const expectedSuffix = `/${asset.publicId}.${format}`;

  if (
    !parsed ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.toLowerCase() !== "res.cloudinary.com" ||
    !parsed.pathname.startsWith(allowedPrefix) ||
    !parsed.pathname.endsWith(expectedSuffix) ||
    !supportedFormat ||
    !Number.isInteger(asset.width) ||
    !Number.isInteger(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0
  ) {
    return null;
  }

  return {
    src: parsed.toString(),
    width: asset.width,
    height: asset.height,
  };
}
