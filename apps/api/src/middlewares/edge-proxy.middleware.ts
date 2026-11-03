import type { NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const clientIpHeader = "x-crm-client-ip";
const secretHeader = "x-crm-edge-secret";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * The web Worker forwards /api/* from the user's browser, so the socket and
 * X-Forwarded-For only show Cloudflare egress addresses. Accept the Worker's
 * client IP only when it proves the shared secret; otherwise keep request.ip.
 */
export function createEdgeProxyClientIp(secret: string | undefined) {
  const expected = secret ? digest(secret) : null;
  return (request: Request, _response: Response, next: NextFunction) => {
    const provided = request.header(secretHeader);
    const clientIp = request.header(clientIpHeader)?.trim();
    delete request.headers[secretHeader];
    delete request.headers[clientIpHeader];
    if (expected && provided && clientIp && isIP(clientIp) && timingSafeEqual(digest(provided), expected)) {
      Object.defineProperty(request, "ip", { value: clientIp, configurable: true, enumerable: true });
    }
    next();
  };
}
