import json
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.utils.local_history import append_issue_row


def _parse_snapshot(raw_value: Any) -> Dict[str, Any]:
    if isinstance(raw_value, dict):
        return raw_value
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, dict):
                return parsed
            return {"value": parsed}
        except json.JSONDecodeError:
            return {"value": raw_value}
    return {}


def list_issues(
    db: Session,
    page: int = 1,
    per_page: int = 20,
    status_id: Optional[int] = None,
    responsible: Optional[str] = None,
    serial: Optional[str] = None,
    invoice: Optional[str] = None,
    item: Optional[str] = None,
    tab: Optional[str] = None,
    box: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
) -> schemas.IssueHistoryResponse:
    query = (
        db.query(models.Issue, models.ItemUtilized, models.Status, models.User)
        .join(models.ItemUtilized, models.ItemUtilized.issue_id == models.Issue.id)
        .join(models.Status, models.Status.id == models.Issue.status_id)
        .outerjoin(models.User, models.User.id == models.ItemUtilized.responsible_user_id)
        .order_by(models.Issue.created_at.desc())
    )

    responsible = (responsible or "").strip()
    serial = (serial or "").strip()
    invoice = (invoice or "").strip()
    item = (item or "").strip()
    tab = (tab or "").strip()
    box = (box or "").strip()

    page = max(int(page or 1), 1)
    per_page = min(max(int(per_page or 20), 1), 200)

    if status_id:
        query = query.filter(models.Status.id == status_id)
    if responsible:
        query = query.filter(models.User.user_name.ilike(f"%{responsible}%"))
    if serial:
        query = query.filter(models.ItemUtilized.serial_number.ilike(f"%{serial}%"))
    if invoice:
        query = query.filter(models.ItemUtilized.invoice_number.ilike(f"%{invoice}%"))
    if item:
        query = query.filter(models.ItemUtilized.item_snapshot.ilike(f"%{item}%"))
    if tab:
        query = query.filter(models.ItemUtilized.item_snapshot.ilike(f"%{tab}%"))
    if box:
        query = query.filter(models.ItemUtilized.item_snapshot.ilike(f"%{box}%"))
    if created_from:
        query = query.filter(models.Issue.created_at >= created_from)
    if created_to:
        query = query.filter(models.Issue.created_at <= created_to)

    total = query.count()
    if per_page:
        query = query.limit(per_page).offset((page - 1) * per_page)

    entries: List[schemas.IssueHistoryEntry] = []
    for issue, snapshot, status, user in query.all():
        entries.append(
            schemas.IssueHistoryEntry(
                id=issue.id,
                status_id=status.id,
                status_name=status.name,
                status_color=status.color,
                responsible_user_name=getattr(user, "user_name", None),
                serial_number=snapshot.serial_number,
                invoice_number=snapshot.invoice_number,
                item_snapshot=_parse_snapshot(snapshot.item_snapshot),
                created_at=issue.created_at,
            )
        )

    return schemas.IssueHistoryResponse(items=entries, total=total)


def update_issue_status(db: Session, issue_id: int, status_id: int) -> schemas.IssueHistoryEntry:
    issue = db.query(models.Issue).filter(models.Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")

    issue.status_id = status.id
    db.commit()
    db.refresh(issue)

    joined = (
        db.query(models.Issue, models.ItemUtilized, models.Status, models.User)
        .join(models.ItemUtilized, models.ItemUtilized.issue_id == models.Issue.id)
        .join(models.Status, models.Status.id == models.Issue.status_id)
        .outerjoin(models.User, models.User.id == models.ItemUtilized.responsible_user_id)
        .filter(models.Issue.id == issue_id)
        .first()
    )
    if not joined:
        raise HTTPException(status_code=404, detail="Issue history entry not found")

    issue_row, snapshot, status_row, user = joined
    try:
        snapshot_data = _parse_snapshot(snapshot.item_snapshot)
    except Exception:
        snapshot_data = {}

    append_issue_row(
        {
            "created_at": datetime.now(UTC),
            "tab_name": snapshot_data.get("tab_name"),
            "box_name": snapshot_data.get("box_name"),
            "item_name": snapshot_data.get("item_name"),
            "qty": snapshot_data.get("qty") or "",
            "status": status_row.name,
            "responsible": getattr(user, "user_name", None),
            "serial": snapshot.serial_number,
            "invoice": snapshot.invoice_number,
        }
    )

    return schemas.IssueHistoryEntry(
        id=issue_row.id,
        status_id=status_row.id,
        status_name=status_row.name,
        status_color=status_row.color,
        responsible_user_name=getattr(user, "user_name", None),
        serial_number=snapshot.serial_number,
        invoice_number=snapshot.invoice_number,
        item_snapshot=_parse_snapshot(snapshot.item_snapshot),
        created_at=issue_row.created_at,
    )
