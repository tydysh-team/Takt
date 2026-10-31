import { authApi } from "./auth-api";

export async function changePasswordAndSignOut(
  payload: { current_password: string; new_password: string },
  clearForm: () => void,
  endSession: () => void,
  goToLogin: () => void | Promise<void>,
): Promise<void> {
  await authApi.changePassword(payload);
  clearForm();
  endSession();
  await goToLogin();
}
