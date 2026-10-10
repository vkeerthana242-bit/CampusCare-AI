"""HTTP endpoint tests for the demo-mode CampusCare API."""

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def demo_mode(monkeypatch):
    """Keep API tests deterministic and independent of AWS credentials."""
    monkeypatch.setattr(main, "APP_MODE", "demo")


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def test_health_reports_demo_mode(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["mode"] == "demo"


def test_campus_info_is_labeled_fictional(client):
    response = client.get("/api/campus-info")

    assert response.status_code == 200
    assert response.json()["fictional"] is True
    assert "fictional" in response.json()["campus_name"].lower()


def test_campus_guide_returns_backend_sections(client):
    response = client.get("/api/campus-guide")

    assert response.status_code == 200
    assert response.json()["fictional"] is True
    assert {section["id"] for section in response.json()["sections"]} == {
        "schedule", "exams", "attendance", "notices"
    }


def test_schedule_returns_class_data(client):
    response = client.get("/api/schedule")

    assert response.status_code == 200
    assert response.json()["fictional"] is True
    assert len(response.json()["classes"]) == 5
    assert response.json()["classes"][0]["day"] == "Monday"


def test_exams_returns_exam_data(client):
    response = client.get("/api/exams")

    assert response.status_code == 200
    assert response.json()["fictional"] is True
    assert len(response.json()["exams"]) == 3
    assert "November 18, 2026" in response.json()["exams"][0]["date"]


def test_attendance_returns_rule_and_support_contact(client):
    response = client.get("/api/attendance")

    assert response.status_code == 200
    assert response.json()["minimum_percentage"] == 75
    assert "Student Support Office" in response.json()["support_office"]


def test_notices_can_be_filtered_by_category(client):
    response = client.get("/api/notices", params={"category": "library"})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["notices"][0]["category"] == "library"


def test_notices_search_matches_notice_content(client):
    response = client.get("/api/notices", params={"search": "student center"})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["notices"][0]["id"] == "activities-fair-2026"


def test_notices_reject_unknown_category(client):
    response = client.get("/api/notices", params={"category": "unlisted"})

    assert response.status_code == 422


def test_chat_returns_demo_answer(client):
    response = client.post("/api/chat", json={"question": "What are the exam dates?"})

    assert response.status_code == 200
    assert response.json()["mode"] == "demo"
    assert "fictional" in response.json()["answer"].lower()
    assert "November 18, 2026" in response.json()["answer"]


def test_college_notices_quick_question_returns_notices(client):
    response = client.post(
        "/api/chat", json={"question": "What are the latest college notices?"}
    )

    assert response.status_code == 200
    assert "notices" in response.json()["answer"].lower()
    assert "library" in response.json()["answer"].lower()


def test_summarize_returns_extractive_demo_preview(client):
    response = client.post(
        "/api/summarize",
        json={"notice": "Register by October 30, 2026. Bring your student ID."},
    )

    assert response.status_code == 200
    assert response.json()["mode"] == "demo"
    assert "Demo-mode preview (not AI-generated)" in response.json()["summary"]
    assert "October 30, 2026" in response.json()["summary"]


def test_chat_rejects_blank_question(client):
    response = client.post("/api/chat", json={"question": "   "})

    assert response.status_code == 422


def test_summarize_rejects_blank_notice(client):
    response = client.post("/api/summarize", json={"notice": "   "})

    assert response.status_code == 422
