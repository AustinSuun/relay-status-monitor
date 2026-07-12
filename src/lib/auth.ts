import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

/**
 * 会话与认证工具
 * 使用 jose（Edge 兼容）签发 JWT，存在 httpOnly cookie
 */

const COOKIE_NAME = 'rsm_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天（秒）

function getSecret(): Uint8Array {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) throw new Error('APP_ENCRYPTION_KEY 未配置');
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: number;
  username: string;
}

/** 签发 JWT 并写入 cookie */
export async function createSession(user: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/** 验证当前请求的会话，返回 payload 或 null */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** 注销：删除 cookie */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** 校验密码（bcrypt） */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 哈希密码 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
