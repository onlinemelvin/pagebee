/** Domain error for the payroll module (mirrors SalesError / CustomerError). */
export class PayrollError extends Error {
  constructor(
    public code: string,
    public status: number = 400,
  ) {
    super(code);
    this.name = "PayrollError";
  }
}
