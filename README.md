# CampusCare AI

CampusCare AI is a student-focused campus information assistant built as a working React + FastAPI web app. It provides chat for common campus questions, quick-question buttons, and a college-notice summarizer.

> **Alexa+ simulated experience / AWS Builder mini-challenge:** This project is suitable as a web-based simulation of an Alexa+-style conversational assistant and demonstrates Amazon Bedrock usage when configured. It is not an Alexa skill, does not connect to Alexa devices or Alexa+, and makes no claim of official Alexa+ integration.

> **Demo information is fictional:** The sample Northstar College, schedules, dates, locations, policies, and notices are invented for demonstration. They are not real campus guidance.

## What it does

- Responsive React and Vite frontend, with chat and notice-summary forms.
- Four campus quick questions: Class Schedule, Exam Dates, Attendance Rules, and College Notices.
- Backend-fed Campus Guide, class schedule, exam dates, attendance rules, and searchable/filterable College Notices.
- FastAPI routes: `GET /api/health`, `GET /api/campus-info`, `GET /api/campus-guide`, `GET /api/schedule`, `GET /api/exams`, `GET /api/attendance`, `GET /api/notices`, `POST /api/chat`, and `POST /api/summarize`.
- **Demo mode** is the default and does not need AWS credentials. Chat returns clearly labelled fictional sample answers. Notice summaries are labelled extractive previews, not AI-generated summaries.
- **Bedrock mode** sends chat questions and pasted notices from the backend to the configured Amazon Bedrock model. On service errors, the API returns an error; it does not pretend an AI response was generated or silently fall back to demo output.
- Mode status, loading indicators, and actionable error messages in the UI.

## Requirements

- Windows 10/11
- Python 3.10 or newer
- Node.js 18 or newer (includes npm)
- AWS account, AWS credentials, and access to the chosen Bedrock model only for Bedrock mode

## Run locally in VS Code (Windows PowerShell)

Open the project folder in VS Code. Use **Terminal → New Terminal** to open two terminals. Run the backend in the first and leave it running; then start the frontend in the second.

### 1. Install and start the backend

In the first PowerShell terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API starts in **Demo Mode** by default at `http://127.0.0.1:8000`. Keep this terminal open. If PowerShell blocks virtual-environment activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate again. Alternatively, use `.venv\Scripts\python.exe -m pip ...` and `.venv\Scripts\python.exe -m uvicorn ...` without activating the environment.

Check the API at `http://127.0.0.1:8000/api/health` or open interactive docs at `http://127.0.0.1:8000/docs`.

### 2. Install and start the frontend

In the second PowerShell terminal, from the project root:

```powershell
cd frontend
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`. The frontend uses `VITE_API_BASE_URL=http://localhost:8000` from `frontend/.env.example`, matching the local API above. Keep both terminals running while using the site. If you change a Vite variable, restart the frontend server.

### 3. Run the backend endpoint tests

Open a third terminal, or stop the API server with Ctrl+C first. From the project root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
$env:APP_MODE = "demo"
python -m pytest ..\tests -q
```

The tests make HTTP requests against every API route, exercise chat/summary and notice-filter validation, and verify that fictional data and demo summaries are labelled correctly. They use the FastAPI test client and do not need AWS credentials. Test results should be taken from the pytest output for your run.

### 4. Build the frontend for production (optional)

From the project root in another PowerShell terminal:

```powershell
cd frontend
npm.cmd run build
```

Vite writes the optimized website files to `frontend/dist/`.

## Enable Amazon Bedrock (optional)

1. In AWS, choose a region and enable access to a Bedrock model available to your account. This example uses the Anthropic Claude 3 Haiku model ID `anthropic.claude-3-haiku-20240307-v1:0`; model availability and access can vary by region/account.
2. Configure credentials for the **backend** using the standard AWS credential chain (for example, AWS IAM Identity Center/SSO or `aws configure`). The identity needs permission to invoke the selected Bedrock model, including `bedrock:InvokeModel`.
3. Edit `backend/.env` and set:

   ```dotenv
   APP_MODE=bedrock
   AWS_REGION=us-east-1
   BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
   ```

4. Restart Uvicorn. The frontend reads the selected mode from `/api/health` and displays the active mode. If Bedrock is unavailable, check the API error and backend configuration; the app will not label a demo answer as an AI result.

Never put AWS credentials in frontend variables, React source, or committed files. The frontend's `VITE_` variables are public in the browser; AWS configuration belongs only in the backend runtime/credential chain. The provided `.gitignore` excludes `.env` files.

## API examples

- `GET http://127.0.0.1:8000/api/health`
- `GET http://127.0.0.1:8000/api/campus-info`
- `GET http://127.0.0.1:8000/api/campus-guide`
- `GET http://127.0.0.1:8000/api/schedule`
- `GET http://127.0.0.1:8000/api/exams`
- `GET http://127.0.0.1:8000/api/attendance`
- `GET http://127.0.0.1:8000/api/notices?search=library&category=library` (search is optional; categories: `all`, `academic`, `events`, `library`)
- `POST http://127.0.0.1:8000/api/chat` with JSON `{"question":"What are the exam dates?"}`
- `POST http://127.0.0.1:8000/api/summarize` with JSON `{"notice":"Paste your college notice here."}`

## Project layout

```text
CampusCare-AI/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── tests/
│   └── test_api.py
└── README.md
```

## Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_MODE` | `demo` | Backend behavior: `demo` or `bedrock` |
| `AWS_REGION` | `us-east-1` | AWS region with Bedrock model access |
| `BEDROCK_MODEL_ID` | Claude 3 Haiku model ID | Model identifier for Bedrock Runtime |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed frontend origins |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL used by the browser |
