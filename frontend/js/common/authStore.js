const TOKEN_KEY = "dsp_auth_token";

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage?.getItem(TOKEN_KEY) || "";
  } catch (err) {
    console.warn("localStorage недоступен", err);
    return "";
  }
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.warn("Не удалось сохранить токен", err);
  }
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(TOKEN_KEY);
  } catch (err) {
    console.warn("Не удалось удалить токен", err);
  }
}
