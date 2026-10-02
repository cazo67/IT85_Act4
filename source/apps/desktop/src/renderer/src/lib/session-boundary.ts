/** Hide private content before attempting the server-side session lock. */
export async function lockSessionBoundary(lockLocal: () => void, lockRemote: () => Promise<void>): Promise<void> {
  lockLocal();
  try {
    await lockRemote();
  } catch {
    // The desktop stays locked. Unlock must still authenticate through the API.
  }
}
