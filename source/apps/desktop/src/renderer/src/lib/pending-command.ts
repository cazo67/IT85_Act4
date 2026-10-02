/** Keeps a financial command's identity until success or an explicit new action. */
export class PendingCommand {
  private current: { payload: string; key: string } | null = null;

  keyFor(payload: string): string {
    if (this.current && this.current.payload !== payload) {
      throw new Error("This pending payment has different details. Check payment history before starting another action.");
    }
    this.current ??= { payload, key: crypto.randomUUID() };
    return this.current.key;
  }

  get hasPending(): boolean { return this.current !== null; }

  clear(): void { this.current = null; }
}
