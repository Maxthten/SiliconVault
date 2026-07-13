const LOCAL_RESOURCE_SCHEME = 'local-resource:'
const LOCAL_RESOURCE_HOST = 'asset'

export function createLocalResourceUrl(relativePath: string): string {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const encodedPath = normalized
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
  return `${LOCAL_RESOURCE_SCHEME}//${LOCAL_RESOURCE_HOST}/${encodedPath}`
}

export function decodeLocalResourceUrl(resourceUrl: string): string {
  const parsed = new URL(resourceUrl)
  if (parsed.protocol !== LOCAL_RESOURCE_SCHEME) {
    throw new Error('INVALID_RESOURCE_URL:unexpected protocol')
  }

  const encodedPath = parsed.hostname === LOCAL_RESOURCE_HOST
    ? parsed.pathname.replace(/^\/+/, '')
    : `${parsed.hostname}${parsed.pathname}`.replace(/^\/+/, '')

  if (!encodedPath) throw new Error('INVALID_RESOURCE_URL:missing path')
  return encodedPath
    .split('/')
    .map(segment => decodeURIComponent(segment))
    .join('/')
}
