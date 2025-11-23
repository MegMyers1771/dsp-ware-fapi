const SPINNER_ID = "apiStatusSpinner";
const COLOR_CLASSES = ["text-info", "text-success", "text-danger", "text-body-secondary"];

let spinnerEl = null;
let activeRequests = 0;

function getSpinner() {
  if (spinnerEl) return spinnerEl;
  if (typeof document === "undefined") return null;
  spinnerEl = document.getElementById(SPINNER_ID);
  if (spinnerEl && !spinnerEl.dataset.apiSpinnerReady) {
    spinnerEl.dataset.apiSpinnerReady = "1";
    spinnerEl.style.animationPlayState = "paused";
    spinnerEl.classList.remove("opacity-100");
    spinnerEl.classList.add("opacity-75");
    if (!COLOR_CLASSES.some((cls) => spinnerEl.classList.contains(cls))) {
      spinnerEl.classList.add("text-body-secondary");
    }
  }
  return spinnerEl;
}

function setColor(color) {
  const spinner = getSpinner();
  if (!spinner) return;
  COLOR_CLASSES.forEach((cls) => spinner.classList.remove(cls));
  const className =
    color === "info"
      ? "text-info"
      : color === "success"
        ? "text-success"
        : color === "error"
          ? "text-danger"
          : "text-body-secondary";
  spinner.classList.add(className);
}

function setAnimationRunning(isRunning) {
  const spinner = getSpinner();
  if (!spinner) return;
  spinner.style.animationPlayState = isRunning ? "running" : "paused";
  spinner.classList.toggle("opacity-100", isRunning);
  spinner.classList.toggle("opacity-75", !isRunning);
}

export function notifyApiRequestStart() {
  const spinner = getSpinner();
  if (!spinner) return;
  activeRequests += 1;
  setColor("info");
  setAnimationRunning(true);
}

export function notifyApiRequestEnd(statusCode) {
  const spinner = getSpinner();
  if (!spinner) return;
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;
  setAnimationRunning(false);
  if (statusCode === 200) {
    setColor("success");
  } else if (typeof statusCode === "number") {
    setColor("error");
  } else {
    setColor("error");
  }
}
