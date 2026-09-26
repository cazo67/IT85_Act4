export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>
  ) {
    super(message);
    this.name = "AppError";
  }
}
