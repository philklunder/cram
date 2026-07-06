"""StudySession — one recorded block of study time, append-only (feeds the weekly-activity
chart on the web dashboard; mirrored to iOS so both clients record the same way).

Append-only like ReviewLog: it uses ``TimestampMixin`` (created_at only) — a study block is a
historical event, never updated or soft-deleted. ``started_at`` is the domain event time the
client reports (buckets the activity by day); ``duration_seconds`` is the elapsed study time.
``subject_id`` is optional — a review session can span several subjects, in which case it is
left null (attributes to overall activity, not one subject).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .enums import StudyKind, checked_text_enum
from .mixins import OwnedMixin, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from .subject import Subject


class StudySession(UUIDPkMixin, OwnedMixin, TimestampMixin, Base):
    __tablename__ = "study_sessions"

    # Optional owning subject. SET NULL on a hard subject delete so the session (immutable
    # history) survives as unattributed activity rather than vanishing.
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Domain event time the client reports (distinct from created_at, the server-insert time):
    # a session studied offline and synced later keeps its real start. Indexed because the
    # dashboard aggregates by day over recent started_at.
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[StudyKind] = mapped_column(
        checked_text_enum(StudyKind, "study_kind"), nullable=False, default=StudyKind.other
    )

    subject: Mapped["Subject | None"] = relationship()
