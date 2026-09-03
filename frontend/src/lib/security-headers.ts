export function buildContentSecurityPolicy({
  production,
  apiOrigin,
  cloudinaryCloudName,
}: {
  production: boolean;
  apiOrigin: string;
  cloudinaryCloudName?: string;
}) {
  const scriptSource = production
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const cloudinarySource = cloudinaryCloudName
    ? ` https://res.cloudinary.com/${cloudinaryCloudName}/`
    : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src ${scriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data:${cloudinarySource}`,
    `connect-src 'self' ${apiOrigin}`,
    "form-action 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function buildSecurityHeaders(options: {
  production: boolean;
  apiOrigin: string;
  cloudinaryCloudName?: string;
}) {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    ...(options.production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : []),
  ];
}
