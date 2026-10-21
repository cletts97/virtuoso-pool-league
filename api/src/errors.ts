export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireCondition(value: unknown, status: number, message: string): asserts value {
  if (!value) throw new ApiError(status, message);
}
