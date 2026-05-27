from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain.tools import tool
from langchain_openai import ChatOpenAI

from pydantic import BaseModel


from app.services.form_filler import FillStatus
from app.ai.prompt import RECRUITOR_SYSTEM_PROMPT
from app.config import settings

class HHAgent:
    def __init__(self, user_id: str | None = None):
        self.user_id = user_id
        self.llm = ChatOpenAI(
            api_key=settings.OPENAI_API_KEY,
            model=settings.OPENAI_MODEL,
        )
        self.agent = create_agent(
            self.llm,
            self.get_tools(),
        )

    def get_tools(self) -> list[tool]:
        """Override in subclasses to provide tools."""
        return []
    
    async def write_cover_letter(self, vacancy: dict, resume: dict) -> str:
        """Example tool method. Override or add more."""
        from app.services.cover_letter import generate
        return generate(
            user_id=self.user_id or "",
            vacancy=vacancy,
            resume=resume,
            resume_uuid=resume.get("uuid", ""),
        )
    
    async def write_form_answers(self, vacancy: dict, resume: dict) -> FillStatus:
        """Another example tool method."""
        from app.services.form_filler import fill_form
        return await fill_form(
            user_id=self.user_id or "",
            resume_id=resume.get("uuid", ""),
            vacancy=vacancy,
        )
    
    async def answer_recruiter(self, chat_id: str, question: str) -> str:
        """Main method to call with recruiter questions. Uses the agent."""

        config = {"configurable": {"thread_id": chat_id}}
        
        response = await self.agent.ainvoke(
            question,
            config=config)
        
        return response
    
    

