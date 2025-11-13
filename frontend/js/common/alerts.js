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
