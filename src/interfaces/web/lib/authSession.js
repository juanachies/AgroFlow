export async function getSessionJwt(authClient) {
  const result = await authClient.getSession({
    fetchOptions: { headers: { 'X-Force-Fetch': 'true' } },
  });
  if (result.error) throw result.error;
  const token = result.data?.session?.token;
  return typeof token === 'string' && token ? token : null;
}
