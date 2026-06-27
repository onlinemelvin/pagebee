/**
 * Domain error for the sales module. Carries a stable machine-readable `code` (returned to the
 * client as `{ error: code }`) and an HTTP status, mirroring `CustomerError` in the customer module.
 */
export class SalesError extends Error {
  constructor(
    public code: string,
    public status: number = 400,
  ) {
    super(code);
    this.name = "SalesError";
  }
}
