export async function getSessionJwt(authClient) {
  const result = await authClient.getSession();
  if (result.error) throw result.error;
  const token = result.data?.session?.token;
  return typeof token === 'string' && token ? token : null;
}
