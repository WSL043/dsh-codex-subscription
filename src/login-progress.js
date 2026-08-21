/** Reconcile a login flow with the credential store without exposing credentials. */
export async function readLoginProgress({ flow, readFlow, readAccount }) {
  try {
    const nextFlow = await readFlow()
    if (nextFlow.phase !== 'authenticated') return { flow: nextFlow }
    return { flow: nextFlow, account: await readAccount() }
  } catch (flowError) {
    try {
      const account = await readAccount()
      if (account?.authenticated === true) {
        return {
          flow: {
            id: flow.id,
            method: flow.method,
            phase: 'authenticated',
            authenticated: true,
          },
          account,
          recovered: true,
        }
      }
    } catch {
      // Preserve the original flow failure as the actionable diagnostic.
    }
    throw flowError
  }
}
