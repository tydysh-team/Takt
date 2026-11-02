export function resolveApiUrl(baseUrl: string, path: string, prefix: string): URL {
  const base = new URL(baseUrl);
  const request = new URL(path.startsWith("/") ? path : `/${path}`, base.origin);
  const basePath = base.pathname.replace(/\/+$/, "");
  const rootPath = basePath.endsWith(prefix) ? basePath.slice(0, -prefix.length) : basePath;
  const endpointPath = request.pathname === prefix || request.pathname.startsWith(`${prefix}/`)
    ? request.pathname
    : `${prefix}${request.pathname}`;
  request.pathname = `${rootPath}${endpointPath}`;
  return request;
}
