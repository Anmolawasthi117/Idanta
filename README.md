# Idanta

Idanta is a full-stack AI platform for Indian artisans. It helps a craftsperson create a brand identity, generate product assets, and download print-ready files like logos, banners, hang tags, labels, story cards, and product visuals.

This repo has two apps:

- `server/` - FastAPI backend with Supabase, LangGraph, Groq, RAG, WeasyPrint, and storage uploads
- `client/` - React + TypeScript + Vite frontend with Tailwind v4, TanStack Query, and Zustand

## What The App Does

- Phone-based login and registration
- Brand onboarding with AI-guided chat
- Brand generation with:
  - name
  - tagline
  - palette
  - story in English and Hindi
  - logo
  - banner
  - downloadable brand kit
- Product onboarding with category-specific metadata
- Product asset generation with:
  - listing copy
  - branded product photo
  - hang tag PDF
  - label PDF
  - story card PDF
  - certificate PDF for original paintings

## Tech Stack

### Backend

- FastAPI
- Supabase Postgres + Storage
- LangGraph
- Groq
- Google Gemini
- Sentence Transformers
- WeasyPrint
- CairoSVG
- Pillow

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS v4
- TanStack Query
- Zustand
- Axios

## Prerequisites

Make sure these are installed before starting:

- Python 3.10+
- Node.js 18+
- npm
- A Supabase project
- A Groq API key
- A Gemini API key

## Folder Structure

```text
Idanta/
├── client/
├── server/
└── README.md
```

## 1. Clone And Open The Project

```powershell
git clone <your-repo-url>
cd Idanta
```

## 2. Backend Setup

### 2.1 Create Python virtual environment

```powershell
cd server
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 2.2 Create `server/.env`

There is currently no `server/.env.example` in the repo, so create a file named `server/.env` manually with these values:

```env
PROJECT_NAME=Idanta API
API_V1_STR=/api/v1
ENVIRONMENT=development

CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_STORAGE_BUCKET=idanta-assets

JWT_SECRET_KEY=replace_with_a_long_random_secret
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=10080

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

GEMINI_API_KEY=your_gemini_api_key
GEMINI_VISION_MODEL=gemini-1.5-flash

POLLINATIONS_BASE_URL=https://image.pollinations.ai/prompt

EMBEDDING_MODEL=all-MiniLM-L6-v2
RAG_TOP_K=4

PDF_TEMPLATE_DIR=data/pdf_templates
```

## 3. Supabase Database Setup

Open your Supabase project and go to `SQL Editor`.

Run the full schema from:

- [database_schema.sql](c:/Users/sir_anmol/Desktop/Idanta/server/data/database_schema.sql)

If your database was already created earlier, make sure these additive migrations have also been run.

### 3.1 Brands migration

```sql
alter table brands
  add column if not exists artisan_name text,
  add column if not exists region text,
  add column if not exists preferred_language text default 'hi',
  add column if not exists generations_in_craft integer default 1,
  add column if not exists years_of_experience integer default 0,
  add column if not exists primary_occasion text default 'general',
  add column if not exists target_customer text default 'local',
  add column if not exists brand_feel text default 'earthy',
  add column if not exists artisan_story text,
  add column if not exists script_preference text default 'both';
```

### 3.2 Products migration

```sql
alter table products
  add column if not exists category text default 'apparel',
  add column if not exists occasion text default 'general',
  add column if not exists time_to_make_hrs integer default 0,
  add column if not exists description_voice text,
  add column if not exists category_data jsonb default '{}',
  add column if not exists story_card_url text,
  add column if not exists certificate_url text;
```

## 4. Prepare The Craft Knowledge Base

After the schema is ready, index the craft library into the vector store:

```powershell
cd server
.\venv\Scripts\activate
python -m app.rag.indexer
```

Do this at least once after setting up the database.

## 5. Start The Backend

From the `server/` folder:

```powershell
.\venv\Scripts\activate
uvicorn main:app --reload
```

Backend will run at:

- `http://localhost:8000`
- API root: `http://localhost:8000/api/v1`

Health check:

- `GET http://localhost:8000/api/v1/health`

## 6. Frontend Setup

Open a new terminal and move to the client:

```powershell
cd client
npm install
```

### 6.1 Create `client/.env`

You can copy the existing example:

```powershell
copy .env.example .env
```

The file should contain:

```env
VITE_API_URL=http://localhost:8000
```

### 6.2 Start the frontend

```powershell
npm run dev
```

Frontend will run at:

- `http://localhost:5173`

## 7. How To Run The Full App

You need both servers running at the same time.

### Terminal 1

```powershell
cd server
.\venv\Scripts\activate
uvicorn main:app --reload
```

### Terminal 2

```powershell
cd client
npm run dev
```

Then open:

- `http://localhost:5173`

## 8. First-Time Test Flow

Use this order to confirm the app is working:

1. Start backend
2. Start frontend
3. Register a new user
4. Create a brand
5. Wait for the brand job to finish
6. Open the dashboard and brand page
7. Add a product
8. Wait for the product job to finish
9. Open the product detail page and download assets

For API-level testing, use:

- [POSTMAN_TESTING.md](c:/Users/sir_anmol/Desktop/Idanta/server/POSTMAN_TESTING.md)

## 9. Important Notes

- JWT auth in the frontend is stored only in memory, so refreshing the browser logs the user out by design.
- Brand chat and product chat now call backend proxy routes:
  - `POST /api/v1/chat/brand-assist`
  - `POST /api/v1/chat/product-assist`
- Logo and banner downloads are converted to PNG on the frontend before download so they are easier to share or send for printing.
- Product detail now supports story card and certificate downloads if those assets exist.
- If product assets seem missing, first confirm the new `story_card_url` and `certificate_url` columns were added in Supabase.
- If jobs fail midway, check the FastAPI terminal logs first. That is usually the fastest way to find the actual error.

## 10. Useful Commands

### Backend

```powershell
python -m compileall server/app server/main.py
```

### Frontend

```powershell
npm run lint
node_modules\.bin\tsc.cmd -b
npm run build
```

## 11. Current MVP Status

Working now:

- auth
- brand creation
- product creation
- job polling
- dashboard
- brand asset downloads
- product asset downloads
- backend-connected chat endpoints

Still a next step:

- real streaming voice-call style chat
- higher-end visual redesign of generated print assets
- more advanced signed asset download endpoints

## 12. If The App Does Not Start

Check these in order:

1. Is Supabase configured correctly in `server/.env`?
2. Did you run the SQL schema and the additive migration?
3. Did you run `python -m app.rag.indexer` at least once?
4. Is the backend running on `http://localhost:8000`?
5. Is `client/.env` pointing to the same backend URL?
6. Are Groq and Gemini keys present?
7. Are both terminals running at the same time?

If all of those are correct, test the backend health route first:

```text
http://localhost:8000/api/v1/health
```
