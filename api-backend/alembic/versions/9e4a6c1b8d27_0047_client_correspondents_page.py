"""0047_client_correspondents_page

Revision ID: 9e4a6c1b8d27
Revises: 5d3b7e2a9c41
Create Date: 2026-10-07 00:00:00.000000

Data-only. Seeds page_access for rm.client-correspondents with the same rows
as rm.request-tickets (migration 0028): RM 'edit', ADMIN 'edit'.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9e4a6c1b8d27"
down_revision: Union[str, Sequence[str], None] = "5d3b7e2a9c41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        INSERT INTO page_access (page_id, role, level) VALUES
          ('rm.client-correspondents', 'RM',    'edit'),
          ('rm.client-correspondents', 'ADMIN', 'edit')
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM page_access WHERE page_id = 'rm.client-correspondents'")
