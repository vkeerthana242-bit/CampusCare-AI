import json
import os
import re
from pathlib import Path
from typing import Literal

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

APP_MODE = os.getenv("APP_MODE", "demo").strip().lower()
if APP_MODE not in {"demo", "bedrock"}:
    raise RuntimeError("APP_MODE must be either 'demo' or 'bedrock'.")

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv(
    "BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"
)

app = FastAPI(
    title="CampusCare AI API",
    description="Campus information, student Q&A, and notice summaries.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str
    mode: Literal["demo", "bedrock"]


class SummarizeRequest(BaseModel):
    notice: str = Field(min_length=1, max_length=20000)


class SummarizeResponse(BaseModel):
    summary: str
    mode: Literal["demo", "bedrock"]


CAMPUS_INFO = {
    "fictional": True,
    "campus_name": "Northstar College (fictional demo campus)",
    "class_schedule": [
        {"day": "Monday", "time": "9:00 AM", "course": "Foundations of Computing", "location": "Orion Hall 204"},
        {"day": "Tuesday", "time": "10:30 AM", "course": "Applied Mathematics", "location": "Maple Building 112"},
        {"day": "Wednesday", "time": "1:00 PM", "course": "Campus Communication", "location": "Orion Hall 108"},
        {"day": "Thursday", "time": "9:30 AM", "course": "Foundations of Computing Lab", "location": "Innovation Lab"},
        {"day": "Friday", "time": "11:00 AM", "course": "Applied Mathematics Tutorial", "location": "Maple Building 112"},
    ],
    "exam_dates": [
        {"course": "Foundations of Computing", "date": "November 18, 2026", "time": "9:00 AM"},
        {"course": "Applied Mathematics", "date": "November 21, 2026", "time": "1:30 PM"},
        {"course": "Campus Communication", "date": "November 24, 2026", "time": "10:00 AM"},
    ],
    "attendance_rule": "Students should maintain at least 75% attendance in each course. If you have a health or accessibility concern, contact the Student Support Office to discuss your options.",
    "notices": [
        {
            "id": "library-hours-2026",
            "title": "Library extended hours for study period",
            "category": "library",
            "date": "November 9–17, 2026",
            "body": "The Northstar College Library (fictional) will stay open until 10:00 PM during the study period.",
            "audience": "All students",
        },
        {
            "id": "activities-fair-2026",
            "title": "Register for the student activities fair",
            "category": "events",
            "date": "October 30, 2026",
            "body": "Clubs can register at the Student Center information desk by October 30, 2026.",
            "audience": "Student clubs",
        },
        {
            "id": "exam-room-update-2026",
            "title": "Exam room assignments available",
            "category": "academic",
            "date": "November 10, 2026",
            "body": "Review your exam room assignment in the student portal before exam week.",
            "audience": "Students taking exams",
        },
    ],
    "support_office": "Student Support Office, Cedar Hall 101 (fictional campus location)",
}


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": APP_MODE, "service": "CampusCare AI API"}


@app.get("/api/campus-info")
def campus_info():
    return CAMPUS_INFO


@app.get("/api/campus-guide")
def campus_guide():
    return {
        "campus_name": CAMPUS_INFO["campus_name"],
        "fictional": CAMPUS_INFO["fictional"],
        "sections": [
            {"id": "schedule", "title": "Class schedule", "description": "Weekly classes, times, and locations."},
            {"id": "exams", "title": "Exam dates", "description": "Upcoming exams and their scheduled times."},
            {"id": "attendance", "title": "Attendance rules", "description": "Attendance expectations and where to get support."},
            {"id": "notices", "title": "College notices", "description": "Campus updates, deadlines, and announcements."},
        ],
        "support_office": CAMPUS_INFO["support_office"],
    }


@app.get("/api/schedule")
def schedule():
    return {
        "campus_name": CAMPUS_INFO["campus_name"],
        "fictional": CAMPUS_INFO["fictional"],
        "classes": CAMPUS_INFO["class_schedule"],
    }


@app.get("/api/exams")
def exams():
    return {
        "campus_name": CAMPUS_INFO["campus_name"],
        "fictional": CAMPUS_INFO["fictional"],
        "exams": CAMPUS_INFO["exam_dates"],
    }


@app.get("/api/attendance")
def attendance():
    return {
        "campus_name": CAMPUS_INFO["campus_name"],
        "fictional": CAMPUS_INFO["fictional"],
        "minimum_percentage": 75,
        "rule": CAMPUS_INFO["attendance_rule"],
        "support_office": CAMPUS_INFO["support_office"],
    }


@app.get("/api/notices")
def notices(
    search: str = Query(default="", max_length=120),
    category: str = Query(default="all", pattern="^(all|academic|events|library)$"),
):
    """Search and filter the campus notice feed at the API, not in the browser."""
    query = search.strip().casefold()
    filtered = [
        notice
        for notice in CAMPUS_INFO["notices"]
        if (category == "all" or notice["category"] == category)
        and (
            not query
            or query
            in " ".join(
                str(notice[field])
                for field in ("title", "body", "date", "audience", "category")
            ).casefold()
        )
    ]
    return {
        "campus_name": CAMPUS_INFO["campus_name"],
        "fictional": CAMPUS_INFO["fictional"],
        "total": len(filtered),
        "notices": filtered,
    }


def bedrock_text(prompt: str, max_tokens: int = 500) -> str:
    """Invoke an Anthropic Claude model through Amazon Bedrock Runtime."""
    try:
        client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ),
        )
        payload = json.loads(response["body"].read())
        text = "\n".join(
            block.get("text", "")
            for block in payload.get("content", [])
            if block.get("type") == "text"
        ).strip()
        if not text:
            raise ValueError("The AI service returned an empty response.")
        return text
    except NoCredentialsError as exc:
        raise HTTPException(
            status_code=503,
            detail="Amazon Bedrock credentials were not found. Configure AWS credentials or set APP_MODE=demo.",
        ) from exc
    except (ClientError, BotoCoreError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Amazon Bedrock could not complete this request ({type(exc).__name__}). Check your AWS region, model access, and credentials, then try again.",
        ) from exc


def demo_chat(question: str) -> str:
    q = question.lower()
    if any(term in q for term in ("schedule", "class", "timetable", "when do i have")):
        return (
            "Here’s the sample schedule for Northstar College (a fictional demo campus): "
            "Monday at 9:00 AM — Foundations of Computing in Orion Hall 204; "
            "Tuesday at 10:30 AM — Applied Mathematics in Maple Building 112; "
            "Wednesday at 1:00 PM — Campus Communication in Orion Hall 108. "
            "Check the campus guide for Thursday and Friday classes, too."
        )
    if any(term in q for term in ("exam", "midterm", "final")) or re.search(r"\btests?\b", q):
        return (
            "Sample exam dates at fictional Northstar College: Foundations of Computing — "
            "November 18, 2026 at 9:00 AM; Applied Mathematics — November 21 at 1:30 PM; "
            "Campus Communication — November 24 at 10:00 AM. These are demo dates, "
            "so confirm real exam dates with your college."
        )
    if any(term in q for term in ("attendance", "absent", "absence", "attend")):
        return (
            "The sample attendance guideline for fictional Northstar College is at least "
            "75% attendance in each course. If health or accessibility affects your attendance, "
            "contact the Student Support Office (Cedar Hall 101 in this demo). Your own college’s "
            "official policy takes precedence."
        )
    if any(term in q for term in ("notice", "announcement", "latest", "update")):
        return (
            "Sample notices from fictional Northstar College: the library stays open until "
            "10:00 PM during the November 9–17, 2026 study period; clubs can register for "
            "the student activities fair by October 30, 2026; and exam room assignments "
            "are available November 10, 2026. These are fictional demo notices."
        )
    if any(term in q for term in ("support", "counsel", "help desk", "office")):
        return "In the fictional Northstar College demo, the Student Support Office is in Cedar Hall 101. For real campus support, check your college’s official student-services directory."
    return (
        "I can help with schedules, exam dates, attendance, notices, and student support. "
        "This demo uses fictional Northstar College information. Try asking, “What are the exam dates?”"
    )


def demo_summary(notice: str) -> str:
    """Return a transparent, extractive preview rather than claiming to use AI."""
    cleaned = re.sub(r"\s+", " ", notice).strip()
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    excerpt = " ".join(sentences[:2])
    if len(excerpt) > 440:
        excerpt = excerpt[:437].rsplit(" ", 1)[0] + "..."
    dates = re.findall(
        r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b",
        cleaned,
        flags=re.IGNORECASE,
    )
    if dates:
        excerpt += "\n\nDate(s) mentioned: " + ", ".join(dict.fromkeys(dates)) + "."
    return (
        "Demo-mode preview (not AI-generated): " + excerpt
        + "\n\nPlease check the original notice for full details and official instructions."
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Please enter a campus question.")
    if APP_MODE == "demo":
        return ChatResponse(answer=demo_chat(question), mode="demo")

    info = json.dumps(CAMPUS_INFO, ensure_ascii=False)
    prompt = (
        "You are CampusCare AI, a helpful college student assistant. Answer clearly and briefly. "
        "Use only the campus information below for campus-specific facts. If the answer is not "
        "in the information, say that you do not have that detail and direct the student to verify "
        "with their college. Never present fictional sample information as an official policy. "
        f"\n\nCampus information (fictional sample data): {info}\n\nStudent question: {question}"
    )
    return ChatResponse(answer=bedrock_text(prompt), mode="bedrock")


@app.post("/api/summarize", response_model=SummarizeResponse)
def summarize(payload: SummarizeRequest):
    notice = payload.notice.strip()
    if not notice:
        raise HTTPException(status_code=422, detail="Paste a notice to summarize.")
    if APP_MODE == "demo":
        return SummarizeResponse(summary=demo_summary(notice), mode="demo")

    prompt = (
        "Summarize this college notice in plain language for a student. Keep it concise and "
        "identify important dates, required actions, and who is affected when stated. Do not "
        "invent missing details. If anything is ambiguous, say so.\n\nNotice:\n" + notice
    )
    return SummarizeResponse(summary=bedrock_text(prompt, max_tokens=350), mode="bedrock")
