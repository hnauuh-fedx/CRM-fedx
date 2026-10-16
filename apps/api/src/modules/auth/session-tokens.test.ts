import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { hashRefreshToken, makeRefreshToken, parseRefreshToken, sessionExpiry, sessionIsActive } from "./session-tokens";

test("remembered sessions have neither an absolute nor an idle expiry", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  assert.equal(sessionExpiry(true, now), null);
  assert.equal(sessionIsActive({ revoked_at: null, expires_at: null }, new Date("2046-10-15T00:00:00Z")), true);
  const expiresAt = sessionExpiry(false, now)!;
  assert.equal(expiresAt.getTime() - now.getTime(), 12 * 60 * 60 * 1000);
  assert.equal(sessionIsActive({ revoked_at: null, expires_at: expiresAt }, expiresAt), false);
  assert.equal(sessionIsActive({ revoked_at: now, expires_at: null }, now), false);
});

test("refresh credentials bind the session and generation and reject malformed or forged values", () => {
  const id = randomUUID(), secret = "test-secret-with-at-least-32-characters";
  const token = makeRefreshToken(id, 12, secret);
  assert.deepEqual(parseRefreshToken(token, secret), { id, version: 12 });
  assert.equal(parseRefreshToken(token.replace(".12.", ".13."), secret), null);
  assert.equal(parseRefreshToken(token, "different-secret"), null);
  for (const invalid of ["", "foo", token + ".x", token.slice(0, -1), token.replace(".12.", ".-1."), token.replace(".12.", ".2147483647.")]) {
    assert.equal(parseRefreshToken(invalid, secret), null);
  }
  assert.match(hashRefreshToken(token), /^[a-f\d]{64}$/);
  assert.notEqual(hashRefreshToken(token), hashRefreshToken(makeRefreshToken(id, 13, secret)));
});
