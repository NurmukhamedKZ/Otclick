from pydantic import BaseModel


class CoverLetterGenerateRequest(BaseModel):
    vacancy_id: str
    resume_id: str


class CoverLetterResponse(BaseModel):
    text: str
    cached: bool
    remaining: int | None = None  # null for pro (unlimited); int for free
