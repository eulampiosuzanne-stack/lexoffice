// Validate privileged callers against this project's Auth service when keys differ.
export async function authenticateOfficeCaller(request: Request, configuredKey: string, projectUrl: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = (request.headers.get('apikey') || '').trim();
  if (configuredKey && bearer === configuredKey) return true;
  const candidate = apiKey || bearer;
  if (!candidate || candidate.length > 4096 || !/^https:\/\//.test(projectUrl)) return false;
  if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate) && !/^sb_secret_[A-Za-z0-9_-]+$/.test(candidate)) return false;
  try {
    const response = await fetcher(projectUrl.replace(/\/$/, '') + '/auth/v1/admin/users?page=1&per_page=1', {
      headers: { authorization: 'Bearer ' + candidate, apikey: candidate },
      signal: AbortSignal.timeout(8000)
    });
    const authorized = response.status === 200;
    await response.body?.cancel();
    return authorized;
  } catch { return false; }
}
