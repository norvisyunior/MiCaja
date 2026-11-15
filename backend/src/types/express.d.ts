export {};

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        rol: string;
      };
      device?: {
        deviceId: string;
        empresaId: string;
        licenseId: string;
      };
    }
  }
}
