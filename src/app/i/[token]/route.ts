import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const res = NextResponse.redirect(new URL('/chat', req.url));
  res.cookies.set('onit_grant', params.token, {
    maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', path: '/',
  });
  return res;
}