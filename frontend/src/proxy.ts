import { NextResponse, type NextRequest } from "next/server";

const supportedLocales = new Set(["hy", "ru", "en"]);

export function proxy(request: NextRequest) {
  const firstSegment = request.nextUrl.pathname.split("/").filter(Boolean)[0];
  const locale = firstSegment && supportedLocales.has(firstSegment) ? firstSegment : "hy";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-locale", locale);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
