/** خطای قابل نمایش به کلاینت با کد وضعیت HTTP. */
export class ServiceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
