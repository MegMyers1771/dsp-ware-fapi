import json
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app import models, schemas


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


def list_issues(db: Session, limit: int = 200) -> List[schemas.IssueHistoryEntry]:
    query = (
        db.query(models.Issue, models.ItemUtilized, models.Status)
        .join(models.ItemUtilized, models.ItemUtilized.issue_id == models.Issue.id)
        .join(models.Status, models.Status.id == models.Issue.status_id)
        .order_by(models.Issue.created_at.desc())
    )
    if limit:
        query = query.limit(limit)

    entries: List[schemas.IssueHistoryEntry] = []
    for issue, snapshot, status in query.all():
        entries.append(
            schemas.IssueHistoryEntry(
                id=issue.id,
                status_id=status.id,
                status_name=status.name,
                status_color=status.color,
                responsible=snapshot.responsible,
                serial_number=snapshot.serial_number,
                invoice_number=snapshot.invoice_number,
                item_snapshot=_parse_snapshot(snapshot.item_snapshot),
                created_at=issue.created_at,
            )
        )

    return entries
