import type { NextRequest } from "next/server";

const CLERK_FAPI_BASE_URL = "https://frontend-api.clerk.dev";
const CLERK_PROXY_PATH = "/__clerk";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HEADERS_TO_STRIP = new Set([
  "content-encoding",
  "content-length",
]);

function getDynamicHopByHopHeaders(headers: Headers) {
  const connectionValue = headers.get("connection");
  if (!connectionValue) return new Set<string>();
  return new Set(
    connectionValue
      .split(",")
      .flatMap((header) => {
        const normalized = header.trim().toLowerCase();
        return normalized ? [normalized] : [];
      }),
  );
}

function createErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    { errors: [{ code, message }] },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function getPublicOrigin(request: NextRequest, requestUrl: URL) {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

function getClientIp(request: NextRequest) {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0]?.trim();

  return undefined;
}

export default async function proxy(request: NextRequest) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return createErrorResponse(
      "proxy_configuration_error",
      "Missing CLERK_SECRET_KEY for Clerk proxy.",
      500,
    );
  }

  const requestUrl = new URL(request.url);
  const targetPath = requestUrl.pathname.slice(CLERK_PROXY_PATH.length) || "/";
  const targetUrl = new URL(`${CLERK_FAPI_BASE_URL}${targetPath}`);
  targetUrl.search = requestUrl.search;

  const fapiHost = new URL(CLERK_FAPI_BASE_URL).host;
  if (targetUrl.host !== fapiHost) {
    return createErrorResponse(
      "proxy_request_failed",
      "Resolved target does not match the expected host.",
      400,
    );
  }

  const headers = new Headers();
  const dynamicHopByHopHeaders = getDynamicHopByHopHeaders(request.headers);
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      !HOP_BY_HOP_HEADERS.has(lowerKey) &&
      !dynamicHopByHopHeaders.has(lowerKey)
    ) {
      headers.set(key, value);
    }
  });

  const publicOrigin = getPublicOrigin(request, requestUrl);
  const proxyUrl = `${publicOrigin}${CLERK_PROXY_PATH}`;
  headers.set("Clerk-Proxy-Url", proxyUrl);
  headers.set("Clerk-Secret-Key", secretKey);
  headers.set("Host", fapiHost);
  headers.set("Accept-Encoding", "identity");

  if (!headers.has("X-Forwarded-Host")) {
    headers.set("X-Forwarded-Host", requestUrl.host);
  }

  if (!headers.has("X-Forwarded-Proto")) {
    headers.set("X-Forwarded-Proto", requestUrl.protocol.replace(":", ""));
  }

  const clientIp = getClientIp(request);
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  const fetchOptions: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    fetchOptions.duplex = "half";
    fetchOptions.body = request.body;
  }

  const response = await fetch(targetUrl, fetchOptions);
  const responseHeaders = new Headers();
  const responseDynamicHopByHopHeaders = getDynamicHopByHopHeaders(
    response.headers,
  );

  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lowerKey) ||
      RESPONSE_HEADERS_TO_STRIP.has(lowerKey) ||
      responseDynamicHopByHopHeaders.has(lowerKey)
    ) {
      return;
    }

    if (lowerKey === "set-cookie") {
      responseHeaders.append(key, value);
      return;
    }

    responseHeaders.set(key, value);
  });

  const locationHeader = response.headers.get("location");
  if (locationHeader) {
    try {
      const locationUrl = new URL(locationHeader, CLERK_FAPI_BASE_URL);
      if (locationUrl.host === fapiHost) {
        responseHeaders.set(
          "Location",
          `${proxyUrl}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`,
        );
      }
    } catch {
      // Keep Clerk's original response if the Location value is malformed.
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const config = {
  matcher: ["/__clerk", "/__clerk/(.*)"],
};
