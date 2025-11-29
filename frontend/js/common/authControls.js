import { showTopAlert } from "./alerts.js";
import {
  login as loginRequest,
  fetchCurrentUser,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../api.js";
import { getAuthToken, setAuthToken, clearAuthToken } from "./authStore.js";

let currentUser = null;
let initialized = false;

export async function initAuthControls() {
  if (initialized) {
    await refreshCurrentUser();
    return currentUser;
  }
  initialized = true;

  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const loginModalEl = document.getElementById("loginModal");
  const loginForm = document.getElementById("loginForm");
  const loginModal = loginModalEl ? new bootstrap.Modal(loginModalEl) : null;
  const userManagementBtn = document.getElementById("userManagementBtn");
  const advancedModeBtn = document.getElementById("advancedModeBtn");

  loginBtn?.addEventListener("click", () => {
    if (loginForm) loginForm.reset();
    loginModal?.show();
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const userName = formData.get("user_name")?.toString().trim();
    const password = formData.get("password")?.toString() ?? "";
    if (!userName || !password) {
      showTopAlert("Введите имя пользователя и пароль", "warning");
      return;
    }
    try {
      const data = await loginRequest({ user_name: userName, password });
      setAuthToken(data.access_token);
      currentUser = data.user;
      showTopAlert("Вход выполнен", "success");
      loginModal?.hide();
      updateAuthUI();
    } catch (err) {
      console.error("Login failed", err);
      showTopAlert(err?.message || "Неверные данные", "danger");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    clearAuthToken();
    currentUser = null;
    updateAuthUI();
    showTopAlert("Вы вышли из системы", "info");
  });

  userManagementBtn?.addEventListener("click", () => openUsersModal());
  advancedModeBtn?.addEventListener("click", () => {
    if (typeof window.__openAdvancedMode === "function") {
      window.__openAdvancedMode();
    } else {
      window.location.href = "/?advanced=1";
    }
  });
  setupUserManagementModal();

  await refreshCurrentUser();
  return currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

async function refreshCurrentUser() {
  const token = getAuthToken();
  if (!token) {
    currentUser = null;
    updateAuthUI();
    return;
  }
  try {
    currentUser = await fetchCurrentUser();
  } catch (err) {
    console.warn("Failed to refresh current user", err);
    clearAuthToken();
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userDropdown = document.getElementById("currentUserDropdown");
  const userMgmtBtn = document.getElementById("userManagementBtn");
  const advancedModeBtn = document.getElementById("advancedModeBtn");

  if (currentUser) {
    loginBtn?.classList.add("d-none");
    logoutBtn?.classList.remove("d-none");
    if (userDropdown) {
      userDropdown.textContent = `${currentUser.user_name} (${currentUser.role})`;
    }
    if (currentUser.role === "admin") {
      userMgmtBtn?.classList.remove("d-none");
      advancedModeBtn?.classList.remove("d-none");
    } else {
      userMgmtBtn?.classList.add("d-none");
      advancedModeBtn?.classList.add("d-none");
    }
  } else {
    loginBtn?.classList.remove("d-none");
    logoutBtn?.classList.add("d-none");
    if (userDropdown) {
      userDropdown.textContent = "(Авторизация)";
    }
    userMgmtBtn?.classList.add("d-none");
    advancedModeBtn?.classList.add("d-none");
  }
}

function setupUserManagementModal() {
  const modalEl = document.getElementById("userManagementModal");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);
  const btn = document.getElementById("userManagementBtn");
  btn?.addEventListener("click", async () => {
    await loadUsersIntoModal();
    modal.show();
  });

  const createUserForm = document.getElementById("createUserForm");
  createUserForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createUserForm);
    const userName = formData.get("newUserName")?.toString().trim();
    const password = formData.get("newUserPassword")?.toString();
    const role = formData.get("newUserRole")?.toString() || "viewer";
    if (!userName || !password) {
      showTopAlert("Укажите имя пользователя и пароль", "warning");
      return;
    }
    try {
      await createUser({ user_name: userName, password, role });
      createUserForm.reset();
      await loadUsersIntoModal();
      showTopAlert("Пользователь создан", "success");
    } catch (err) {
      console.error("Create user error", err);
      showTopAlert(err?.message || "Не удалось создать пользователя", "danger");
    }
  });
}

async function openUsersModal() {
  const modalEl = document.getElementById("userManagementModal");
  if (!modalEl || !currentUser || currentUser.role !== "admin") return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  await loadUsersIntoModal();
  modal.show();
}

async function loadUsersIntoModal() {
  const container = document.getElementById("userManagementList");
  if (!container) return;
  container.innerHTML = `<div class="text-muted">Загрузка...</div>`;
  try {
    const users = await listUsers();
    if (!users.length) {
      container.innerHTML = `<div class="text-muted">Пользователей нет</div>`;
      return;
    }
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th>Имя пользователя</th>
              <th>Роль</th>
              <th>Статус</th>
              <th style="width:140px"></th>
            </tr>
          </thead>
          <tbody>
            ${users
              .map((user) => {
                const roleOptions = ["viewer", "editor", "admin"]
                  .map(
                    (role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`
                  )
                  .join("");
                return `
                  <tr data-user-id="${user.id}">
                    <td>${user.user_name}</td>
                    <td>
                      <select class="form-select form-select-sm user-role-select">
                        ${roleOptions}
                      </select>
                    </td>
                    <td>
                      <div class="form-check form-switch">
                        <input class="form-check-input user-active-toggle" type="checkbox" ${user.is_active ? "checked" : ""}>
                      </div>
                    </td>
                    <td class="text-end">
                      <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-primary save-user-btn">Сохранить</button>
                        <button class="btn btn-sm btn-outline-danger delete-user-btn" ${
                          user.id === currentUser?.id ? "disabled" : ""
                        }>Удалить</button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll(".save-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("tr");
        const userId = Number(row?.dataset.userId);
        if (!userId) return;
        const newRole = row.querySelector(".user-role-select")?.value;
        const isActive = row.querySelector(".user-active-toggle")?.checked;
        try {
          await updateUser(userId, { role: newRole, is_active: isActive });
          showTopAlert("Пользователь обновлён", "success");
          await loadUsersIntoModal();
        } catch (err) {
          console.error("Update user error", err);
          showTopAlert(err?.message || "Не удалось обновить пользователя", "danger");
        }
      });
    });

    container.querySelectorAll(".delete-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        const row = btn.closest("tr");
        const userId = Number(row?.dataset.userId);
        if (!userId) return;
        if (!confirm("Удалить пользователя? Действие необратимо.")) return;
        try {
          await deleteUser(userId);
          showTopAlert("Пользователь удалён", "success");
          await loadUsersIntoModal();
        } catch (err) {
          console.error("Delete user error", err);
          showTopAlert(err?.message || "Не удалось удалить пользователя", "danger");
        }
      });
    });
  } catch (err) {
    console.error("Load users error", err);
    container.innerHTML = `<div class="text-danger">Не удалось загрузить пользователей</div>`;
  }
}
