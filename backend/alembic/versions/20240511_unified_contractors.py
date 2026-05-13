"""unified contractors tables

Revision ID: 20240511_unified_contractors
Revises:
Create Date: 2026-05-11

"""

from alembic import op
import sqlalchemy as sa


revision = "20240511_unified_contractors"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contractors",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("contact_email", sa.String(), nullable=True),
        sa.Column("contact_phone", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_contractors_company_id"), "contractors", ["company_id"], unique=False)

    op.create_table(
        "contractor_assignments",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("main_contractor_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("sub_contractor_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("site_id", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["main_contractor_id"], ["contractors.id"]),
        sa.ForeignKeyConstraint(["sub_contractor_id"], ["contractors.id"]),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "company_id",
            "main_contractor_id",
            "sub_contractor_id",
            "site_id",
            name="uq_contractor_assignment_company_main_sub_site",
        ),
    )
    op.create_index(op.f("ix_contractor_assignments_company_id"), "contractor_assignments", ["company_id"], unique=False)

    op.add_column("guards", sa.Column("contractor_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_guards_contractor_id_contractors",
        "guards",
        "contractors",
        ["contractor_id"],
        ["id"],
    )
    op.add_column("sites", sa.Column("contractor_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_sites_contractor_id_contractors",
        "sites",
        "contractors",
        ["contractor_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_sites_contractor_id_contractors", "sites", type_="foreignkey")
    op.drop_column("sites", "contractor_id")
    op.drop_constraint("fk_guards_contractor_id_contractors", "guards", type_="foreignkey")
    op.drop_column("guards", "contractor_id")
    op.drop_index(op.f("ix_contractor_assignments_company_id"), table_name="contractor_assignments")
    op.drop_table("contractor_assignments")
    op.drop_index(op.f("ix_contractors_company_id"), table_name="contractors")
    op.drop_table("contractors")
