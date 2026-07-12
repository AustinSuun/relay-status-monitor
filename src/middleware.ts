import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * 路由守卫中间件
 * 保护 /（dashboard）路由，未登录跳转 /login
 * /login、/api/auth/*、/api/cron/* 放行
 */

const COOKIE_NAME = 'rsm_session';
// 放行的路径前缀
const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron'];

function getSecret(): Uint8Array {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) throw new Error('APP_ENCRYPTION_KEY 未配置');
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径放行
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 静态资源放行
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // 校验会话
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest) {
  // API 请求返回 401，页面请求跳转登录
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
