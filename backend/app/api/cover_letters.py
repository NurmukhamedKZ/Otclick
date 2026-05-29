from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.cover_letters import (
    CoverLetterGenerateRequest,
    CoverLetterResponse,
)
from app.services import manual_cover_letter

router = APIRouter(prefix="/api/cover-letters", tags=["cover-letters"])


@router.post("/generate", response_model=CoverLetterResponse)
async def generate(
    body: CoverLetterGenerateRequest,
    user_id: str = Depends(get_current_user),
) -> CoverLetterResponse:
    data = await manual_cover_letter.generate_for_vacancy(
        user_id, body.vacancy_id, body.resume_id
    )
    return CoverLetterResponse(**data)
