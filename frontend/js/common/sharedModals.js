const modalsTemplate = `
  <div class="modal fade" id="createStatusModal" tabindex="-1" aria-labelledby="createStatusModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createStatusModalLabel">Создать статус</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
        </div>
        <div class="modal-body">
          <form id="createStatusForm" class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label">Название</label>
              <input id="statusName" class="form-control" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">Цвет</label>
              <input id="statusColor" type="color" class="form-control form-control-color" value="#198754" title="Выберите цвет">
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-success">Создать</button>
            </div>
          </form>
          <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="mb-0">Существующие статусы</h6>
              <small class="text-muted">Нажми × чтобы удалить</small>
            </div>
            <div id="statusListContainer" class="d-flex flex-wrap gap-2"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="createTabModal" tabindex="-1" aria-labelledby="createTabModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <form id="createTabForm">
          <div class="modal-header">
            <h5 class="modal-title">Содать новую вкладку</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Название вкладки</label>
              <input id="tabName" class="form-control" required>
            </div>
            <h6>Поля</h6>
            <div id="fieldsContainer" data-use-pills="1" data-chip-target="allowed"></div>
            <button type="button" id="addFieldBtn" class="btn btn-outline-secondary btn-sm mt-2">Добавить поле</button>
            <div class="form-check form-switch mt-3">
              <input class="form-check-input" type="checkbox" id="tabEnablePos" checked>
              <label class="form-check-label" for="tabEnablePos">Включить POS (ручной порядок в ящиках)</label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="submit" class="btn btn-success">Создать вкладку</button>
          </div>
        </form>
      </div>
    </div>
  </div>
`;

export function ensureCreationModals() {
  if (document.getElementById("createStatusModal") && document.getElementById("createTabModal")) {
    return;
  }

  const container = document.createElement("div");
  container.innerHTML = modalsTemplate;
  document.body.appendChild(container);
}
