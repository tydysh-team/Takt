import { apiRequest } from "../../api/client";

export interface MfaStatus { enabled: boolean }
export interface MfaSetup { secret: string; provisioning_uri: string; expires_in: number }
export interface MfaBackupCodes { backup_codes: string[] }

export const mfaApi = {
  status: () => apiRequest<MfaStatus>("/auth/mfa/status"),
  start: (current_password: string) => apiRequest<MfaSetup>("/auth/mfa/setup", {
    method: "POST", body: { current_password }, csrf: true,
  }),
  confirm: (code: string) => apiRequest<MfaBackupCodes>("/auth/mfa/confirm", {
    method: "POST", body: { code }, csrf: true,
  }),
  disable: (current_password: string, code: string) => apiRequest<undefined>("/auth/mfa/disable", {
    method: "POST", body: { current_password, code }, csrf: true,
  }),
  regenerate: (current_password: string, code: string) =>
    apiRequest<MfaBackupCodes>("/auth/mfa/backup-codes/regenerate", {
      method: "POST", body: { current_password, code }, csrf: true,
    }),
};
