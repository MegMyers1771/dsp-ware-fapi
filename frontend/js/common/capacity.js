export function getCapacityState(itemsCount, capacity) {
  const countNum = Number(itemsCount);
  const capacityNum = Number(capacity);
  const count = Number.isFinite(countNum) ? Math.max(0, countNum) : 0;
  const cap = Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : null;

  if (!cap) {
    return { label: String(count), className: "", ratio: null };
  }

  const ratio = cap > 0 ? count / cap : null;
  let className = "";
  if (ratio < 0.5) className = "text-success";
  else if (ratio < 0.75) className = "text-warning";
  else if (ratio < 1) className = "text-orange";
  else className = "text-danger";

  return { label: `${count} / ${cap}`, className, ratio };
}
