export function getCleanBaseUrl(serverBaseUrl?: string): string {
  if (
    serverBaseUrl &&
    !serverBaseUrl.includes('aistudio.google.com') &&
    !serverBaseUrl.includes('MY_APP_URL')
  ) {
    return serverBaseUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin && !origin.includes('aistudio.google.com')) {
      return origin.replace(/\/+$/, '');
    }
  }

  return '';
}

export function getStreamPlayUrl(
  stream: { slug: string; id: string; streamToken?: string },
  baseUrl: string
): string {
  const cleanBase = (baseUrl || '').replace(/\/+$/, '');
  const token = stream.streamToken || stream.slug || stream.id;
  return `${cleanBase}/v/${token}.m3u8`;
}

