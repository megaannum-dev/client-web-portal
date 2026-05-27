from pydantic import BaseModel, Field


class DocumentUploadRequest(BaseModel):
    document_type: str = Field(
        ..., description="e.g. 'kyc_questionnaire', 'supporting_id'"
    )
    filename: str = Field(..., min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class DocumentOut(BaseModel):
    id: int
    owner_firebase_uid: str
    document_type: str
    filename: str
    status: str

    model_config = {"from_attributes": True}
