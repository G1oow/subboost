import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_GATE_COOKIE,
  ACCESS_TOKEN_HEADER,
  ACCESS_TOKEN_QUERY_PARAM,
  accessGateCookieOptions,
  buildAccessGateApiErrorBody,
  buildAccessGateHtmlPage,
  getAccessGateToken,
  isAccessGateApiPath,
  isAccessGateExemptPath,
  issueAccessGateCookieToken,
  matchesAccessToken,
  verifyAccessGateCookieToken,
} from "./src/lib/access-gate";

/**
 * 站点级访问令牌门禁(Next.js 16 proxy,原 middleware)。
 *
 * 未配置 ACCESS_TOKEN 时直接放行;配置后除豁免路径外全站校验:
 * - cookie:有效门禁 JWT(30 天);
 * - `X-Access-Token` 请求头:程序化调用,校验通过直接放行,不落地 cookie;
 * - `?access_token=` 查询参数:浏览器一次性输入,校验通过后以 cookie 换取
 *   并 302 到去除令牌的干净 URL(避免令牌残留在地址栏与 Referer 中)。
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const expectedToken = getAccessGateToken();
  if (!expectedToken) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isAccessGateExemptPath(pathname)) return NextResponse.next();

  const cookieToken = request.cookies.get(ACCESS_GATE_COOKIE)?.value;
  if (cookieToken && (await verifyAccessGateCookieToken(cookieToken))) {
    return NextResponse.next();
  }

  const presentedToken =
    request.headers.get(ACCESS_TOKEN_HEADER)?.trim() ||
    request.nextUrl.searchParams.get(ACCESS_TOKEN_QUERY_PARAM)?.trim() ||
    "";
  if (presentedToken && (await matchesAccessToken(presentedToken, expectedToken))) {
    if (request.nextUrl.searchParams.has(ACCESS_TOKEN_QUERY_PARAM)) {
      const target = request.nextUrl.clone();
      target.searchParams.delete(ACCESS_TOKEN_QUERY_PARAM);
      const redirect = NextResponse.redirect(target);
      redirect.cookies.set(ACCESS_GATE_COOKIE, await issueAccessGateCookieToken(), accessGateCookieOptions());
      return redirect;
    }
    return NextResponse.next();
  }

  if (isAccessGateApiPath(pathname)) {
    return NextResponse.json(buildAccessGateApiErrorBody(), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(buildAccessGateHtmlPage(pathname), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  // 排除框架内部资产(_next/*)与非敏感静态文件,门禁语义在 proxy 内部以
  // isAccessGateExemptPath 精确控制。
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.png|manifest\\.webmanifest|logo\\.png|icons/).*)"],
};
