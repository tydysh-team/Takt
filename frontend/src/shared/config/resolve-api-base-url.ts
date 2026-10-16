export function resolveApiBaseUrl(configuredUrl: string, frontendHostname: string): string {
  const url = new URL(configuredUrl);
  const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

  // Keep localhost development on one cookie site even when the page was opened via 127.0.0.1.
  if (loopbackHosts.has(url.hostname) && loopbackHosts.has(frontendHostname)) {
    url.hostname = frontendHostname;
  }

  return url.href.replace(/\/$/, "");
}
