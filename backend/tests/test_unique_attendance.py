from __future__ import annotations

from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import Attendance
from migrate_db import _ensure_clock_in_location_columns, _ensure_unique_attendance


def test_unique_attendance_dedupes_and_indexes():
    _ensure_clock_in_location_columns()
    assignment_id = 912001
    guard_id = 912001
    db = SessionLocal()
    try:
        db.query(Attendance).filter(
            Attendance.assignment_id == assignment_id,
            Attendance.guard_id == guard_id,
        ).delete(synchronize_session=False)
        db.commit()
        db.add(Attendance(assignment_id=assignment_id, guard_id=guard_id, status="on_time"))
        db.commit()
        db.add(Attendance(assignment_id=assignment_id, guard_id=guard_id, status="late"))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            db.expire_all()
            _ensure_unique_attendance()
            db.expire_all()
        rows = (
            db.query(Attendance)
            .filter(
                Attendance.assignment_id == assignment_id,
                Attendance.guard_id == guard_id,
            )
            .all()
        )
        assert len(rows) == 1
        for row in rows:
            db.delete(row)
        db.commit()
    finally:
        db.close()

    _ensure_unique_attendance()
