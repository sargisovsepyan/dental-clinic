export function buildContentSecurityPolicy({
  production,
  apiOrigin,
  cloudinaryCloudName,
  bookingChallengeProvider = "disabled",
}: {
  production: boolean;
  apiOrigin: string;
  cloudinaryCloudName?: string;
  bookingChallengeProvider?: "disabled" | "turnstile";
}) {
  const scriptSource = production
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const cloudinarySource = cloudinaryCloudName
    ? ` https://res.cloudinary.com/${cloudinaryCloudName}/`
    : "";
  const challengeSource = bookingChallengeProvider === "turnstile"
    ? " https://challenges.cloudflare.com"
    : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src ${scriptSource}${challengeSource}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data:${cloudinarySource}`,
    `connect-src 'self' ${apiOrigin}${challengeSource}`,
    `frame-src 'self'${challengeSource}`,
    "form-action 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function buildSecurityHeaders(options: {
  production: boolean;
  apiOrigin: string;
  cloudinaryCloudName?: string;
  bookingChallengeProvider?: "disabled" | "turnstile";
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
