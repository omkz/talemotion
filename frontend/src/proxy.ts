import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/projects",
  "/assets",
  "/settings",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has("talemotion_session");
  const protectedPath = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (protectedPath && !hasSession) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/projects/:path*",
    "/assets/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
