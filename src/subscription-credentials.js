// Refresh first, then take token and account ID from the same vault snapshot.
// A switch between the awaits must never combine two different accounts.
export async function readSubscriptionCredentials(getAuth, readCredential, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await getAuth({ signal })
    signal?.throwIfAborted()
    if (typeof auth?.auth?.apiKey !== 'string' || !auth.auth.apiKey) break
    const credential = await readCredential({ signal })
    signal?.throwIfAborted()
    if (credential?.type !== 'oauth') break
    if (credential.access === auth.auth.apiKey) return { access: credential.access, accountId: credential.accountId }
  }
  return { access: undefined, accountId: undefined }
}
