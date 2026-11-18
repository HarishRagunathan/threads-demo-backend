import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sessionCookieOptions } from '../src/config/session.js';

for (const [environment, expected] of [['production', 'None'], ['development', 'Strict']]) {
  test(`${environment} sets and clears the session with matching cookie policy`, async () => {
    const app = express();
    const options = sessionCookieOptions({ NODE_ENV: environment });
    app.get('/login', (req, res) => res.cookie('session', 'test-token', { ...options, maxAge: 43200000 }).json({ ok: true }));
    app.get('/logout', (req, res) => res.clearCookie('session', options).json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      for (const path of ['/login', '/logout']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
        const cookie = response.headers.get('set-cookie');
        assert.match(cookie, new RegExp(`SameSite=${expected}`));
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /Path=\//);
        assert.equal(cookie.includes('; Secure'), environment === 'production');
        if (path === '/logout') assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
        await response.json();
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
}

test('cross-site override always requires HTTPS and invalid policies fail early', () => {
  assert.equal(sessionCookieOptions({ SESSION_COOKIE_SAME_SITE: 'none' }).secure, true);
  assert.equal(sessionCookieOptions({ NODE_ENV: 'production', SESSION_COOKIE_SAME_SITE: 'strict' }).sameSite, 'strict');
  assert.throws(() => sessionCookieOptions({ SESSION_COOKIE_SAME_SITE: 'invalid' }));
});
