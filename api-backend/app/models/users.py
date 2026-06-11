import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Portal(str, enum.Enum):
    CLIENT = "client"
    ADMIN = "admin"


class AdminRole(str, enum.Enum):
    RM = "RM"
    MOBO = "MOBO"  # Middle/Back-Office — operational processing & firm-wide oversight.
    PM = "PM"
    PC = "PC"
    COMPLIANCE = "COMPLIANCE"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    portal: Mapped[Portal] = mapped_column(
        # values_callable: persist/read by enum VALUE ("client"/"admin"), not member
        # NAME. The migration backfill writes lowercase values and the whole system
        # (Firebase claims, portal_from_claims) uses lowercase, so the ORM must agree.
        SAEnum(
            Portal,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        index=True,
    )
    # NOTE: `role` column is intentionally removed here. It is dropped in Section C
    # ONLY AFTER the backfill copies it into admin_profiles. Do not remove the
    # column from the live DB before the backfill runs (Section C ordering).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # One-to-one to whichever profile matches `portal`. lazy="joined" avoids an
    # extra round-trip when serialising UserOut.
    admin_profile = relationship(
        "AdminProfile",
        uselist=False,
        lazy="joined",
        primaryjoin="User.id == AdminProfile.user_id",
        viewonly=True,
    )
    # E-3: client_profiles has TWO FKs into users (user_id -> users.id and
    # assigned_rm_uid -> users.firebase_uid), so this relationship is ambiguous
    # without explicit foreign_keys disambiguation.
    client_profile = relationship(
        "ClientProfile",
        uselist=False,
        lazy="joined",
        primaryjoin="User.id == ClientProfile.user_id",
        foreign_keys="ClientProfile.user_id",
        viewonly=True,
    )

    @property
    def role(self) -> str:  # type: ignore[override]
        """Derived wire value. 'CLIENT' for clients; admin_profiles.role for admins.
        Replaces the old users.role column; keeps UserOut/from_attributes working."""
        if self.portal == Portal.ADMIN:
            return self.admin_profile.role.value if self.admin_profile else "ADMIN"
        return "CLIENT"


class ClientProfile(Base):
    __tablename__ = "client_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )

    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # FK to users.firebase_uid (the RM is itself a user). App-level invariant:
    # the referenced user must be an admin whose admin_profiles.role == 'RM'.
    # A plain FK cannot express that — enforce in the service layer when assigning.
    assigned_rm_uid: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("users.firebase_uid"), nullable=True
    )
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_of_residence: Mapped[str | None] = mapped_column(String(255), nullable=True)
    authorized_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    initiate_method: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[AdminRole] = mapped_column(
        # Same value-based convention as User.portal. (AdminRole value == name today,
        # so this is a no-op now, but it keeps both string-enum columns consistent and
        # prevents the migration/ORM representation mismatch if a value ever diverges.)
        SAEnum(
            AdminRole,
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
