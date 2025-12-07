export function renderUserDropdown(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="nav-item dropdown">
      <a
        class="nav-link dropdown-toggle"
        href="#"
        role="button"
        id="currentUserDropdown"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        (Авторизация)
      </a>
      <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="currentUserDropdown">
        <li><button type="button" id="userManagementBtn" class="dropdown-item d-none">Управление пользователями</button></li>
        <li><button type="button" id="advancedModeBtn" class="dropdown-item d-none">Расширенный режим</button></li>
        <li><button type="button" id="userParserBtn" class="dropdown-item d-none">Парсинг</button></li>
        <li><a id="suka" class="dropdown-item" target="_blank" href="/instruction"> Инструкция</button></li>
        <li><button type="button" id="loginBtn" class="dropdown-item">Войти</button></li>
        <li><button type="button" id="logoutBtn" class="dropdown-item text-danger d-none">Выйти</button></li>
      </ul>
    </div>
  `;
}
