import crypto from "crypto";
import {
  isContentAccessResource,
  type ContentAccessResource,
} from "@shipshitgames/shared";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  resource: ContentAccessResource;
  resourceId?: string;
  iat: number;
  exp: number;
  nonce: string;
};

function signingSecret() {
  const secret = process.env.ACCESS_SIGNING_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing ACCESS_SIGNING_SECRET");
  }

  return secret;
}

function encode(input: string) {
  return Buffer.from(input).toString("base64url");
}

function decode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string) {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

export function createAccessToken(
  input: Omit<AccessTokenPayload, "iat" | "exp" | "nonce">,
  expiresInSeconds = 15 * 60
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    ...input,
    iat: now,
    exp: now + expiresInSeconds,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAccessToken(token: string) {
  const segments = token.split(".");
  if (segments.length !== 2) {
    throw new Error("Malformed access token");
  }
  const [encodedPayload, signature] = segments;

  const expected = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Invalid access token signature");
  }

  const payload = JSON.parse(
    decode(encodedPayload),
  ) as Partial<AccessTokenPayload>;
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !isContentAccessResource(payload.resource) ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.nonce !== "string" ||
    (payload.resourceId !== undefined && typeof payload.resourceId !== "string")
  ) {
    throw new Error("Invalid access token payload");
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Expired access token");
  }

  return payload as AccessTokenPayload;
}
