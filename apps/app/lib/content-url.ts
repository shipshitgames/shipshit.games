export function privateContentUrl(value: string | undefined, envKey: string) {
  if (!value) throw new Error(`${envKey} is not configured`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envKey} is invalid`);
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${envKey} must use HTTPS`);
  }
  return url.toString();
}
