// Lightweight helper to show a single dismissible bootstrap alert on top of the page.
export function showTopAlert(message, type = "danger", timeout = 4000) {
  const existing = document.getElementById("topAlert");
  if (existing) existing.remove();

  const alert = document.createElement("div");
  alert.id = "topAlert";
  alert.role = "alert";
  alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x m-3`;
  alert.style.zIndex = 1080;
  alert.innerHTML = `
    <div>${message}</div>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  document.body.appendChild(alert);
  if (timeout) {
    setTimeout(() => {
      alert.remove();
    }, timeout);
  }
}

function ensureBottomToastContainer() {
  let container = document.getElementById("bottomToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "bottomToastContainer";
    container.className = "position-fixed bottom-0 end-0 p-3";
    container.style.zIndex = 1080;
    document.body.appendChild(container);
  }
  return container;
}

export function showBottomToast(message, { title = "Google Sheets", delay = 5000 } = {}) {
  if (typeof bootstrap === "undefined" || !bootstrap.Toast) {
    console.warn("Bootstrap toast недоступен");
    return;
  }
  const container = ensureBottomToastContainer();
  const toastEl = document.createElement("div");
  toastEl.className = "toast text-bg-dark border-0";
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <div class="fw-semibold">${title}</div>
        <div>${message}</div>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastEl);
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
    autohide: delay > 0,
    delay,
  });
  toastEl.addEventListener("hidden.bs.toast", () => {
    toastEl.remove();
  });
  toast.show();
}
