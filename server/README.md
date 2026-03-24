# Idanta API — Brand-in-a-Box for Indian Artisans

> A production-grade **FastAPI** backend that converts an artisan's voice and craft heritage into a complete professional brand identity — logos, stories, palettes, hang tags, and social copy — using a **Multi-Agent LangGraph** pipeline and **RAG** (Retrieval-Augmented Generation).

---

## ✨ What It Does

| Feature | Technology |
|---|---|
| Real-time bilingual brand stories | Groq (Llama 3.3 70B) |
| Heritage-grounded branding (RAG) | pgvector + all-MiniLM-L6-v2 |
| SVG Logo + Pattern Banner | Groq SVG + Pollinations Flux.1 |
| PDF Hang Tags & Labels | WeasyPrint + Jinja2 |
| Branded Product Photos | Pillow + CairoSVG |
| Stateful parallel AI pipeline | LangGraph |
| Progress polling | FastAPI BackgroundTasks |

---

## 🏗️ Architecture

```
Client → FastAPI → BackgroundTasks
                       ↓
                  LangGraph Graph
                    ├─ Context Builder  (RAG retrieval)
                    ├─ Brand Intelligence (Groq naming)
                    ├─ [PARALLEL]
                    │   ├─ Visual Identity (SVG + Pollinations)
                    │   └─ Copy Agent (Bilingual stories)
                    └─ Packager (Upload + ZIP + DB write)
```

---

## 📁 Project Structure

```
server/
├── main.py                      # App entry point + lifespan
├── requirements.txt
├── .env.example                 # Environment variable template
├── data/
│   ├── craft_library/           # RAG knowledge JSONs (one per craft)
│   ├── pdf_templates/           # Jinja2 HTML templates for PDFs
│   └── database_schema.sql      # Run this in Supabase SQL Editor
└── app/
    ├── core/
    │   ├── config.py            # Pydantic settings
    │   ├── database.py          # Supabase client singleton
    │   └── security.py          # JWT + bcrypt
    ├── api/
    │   ├── deps.py              # JWT auth dependency
    │   ├── router.py            # Mount all route modules
    │   └── routes/
    │       ├── auth.py          # POST /auth/register, /auth/login
    │       ├── brand.py         # POST /brands/, GET /brands/{id}, GET /crafts/
    │       ├── product.py       # POST /products/, POST /products/{id}/generate
    │       └── jobs.py          # GET /jobs/{id}/status, GET /jobs/
    ├── agents/
    │   ├── state.py             # BrandState, ProductState TypedDicts
    │   ├── graphs/
    │   │   ├── brand_graph.py   # Brand onboarding orchestration
    │   │   └── product_graph.py # Product asset generation
    │   └── nodes/
    │       ├── context_builder.py
    │       ├── intelligence.py
    │       ├── visual_identity.py
    │       ├── copy_agent.py
    │       ├── print_assets.py
    │       └── packager.py
    ├── rag/
    │   ├── embedder.py          # all-MiniLM-L6-v2 wrapper
    │   ├── retriever.py         # pgvector cosine search
    │   └── indexer.py           # One-time indexing script
    ├── services/
    │   ├── groq_client.py       # Groq + exponential backoff
    │   ├── storage_service.py   # Supabase Storage
    │   └── pdf_service.py       # Jinja2 + WeasyPrint
    └── models/
        ├── user.py
        ├── brand.py
        ├── product.py
        └── job.py
```

---

## 🚀 Quickstart

### 1. Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- **Windows only**: [GTK3 Runtime](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases) (required for WeasyPrint + CairoSVG)

### 2. Clone & Install

```powershell
# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment

```powershell
copy .env.example .env
# Edit .env and fill in all required values
```

### 4. Set Up Database

Open your **Supabase SQL Editor** and run the contents of:

```
data/database_schema.sql
```

This creates all tables, indexes, and the `match_craft_chunks` RPC function required for RAG.

### 5. Index Craft Knowledge (RAG)

```powershell
python -m app.rag.indexer
```

This embeds all JSON files in `data/craft_library/` and upserts them to Supabase.

### 6. Run the Server

```powershell
uvicorn main:app --reload
```

| Endpoint | URL |
|---|---|
| Swagger UI | `http://localhost:8000/api/v1/docs` |
| ReDoc | `http://localhost:8000/api/v1/redoc` |
| Health Check | `http://localhost:8000/api/v1/health` |

---

## 🔑 Environment Variables

See [`.env.example`](.env.example) for a full list with instructions on where to obtain each key.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for server-side DB access |
| `GROQ_API_KEY` | Groq console → API Keys |
| `GEMINI_API_KEY` | Google AI Studio → Get API Key |
| `JWT_SECRET_KEY` | Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |

---

## 🔄 Agent Pipeline Flow

### Brand Onboarding

```
POST /api/v1/brands/  →  returns { job_id }
GET  /api/v1/jobs/{job_id}/status  →  poll for progress
GET  /api/v1/brands/{brand_id}     →  fetch completed brand
```

Progress steps:
1. `📚 Gathering craft heritage knowledge...` (10%)
2. `🎨 Crafting your brand identity...` (25%)
3. `🖌️ Designing your logo and banner...` + `✍️ Writing your brand story...` (50% — parallel)
4. `📦 Packaging your brand kit...` (90%)
5. `✅ Brand kit ready!` (100%)

### Product Assets

```
POST /api/v1/products/             →  create product + upload photos
POST /api/v1/products/{id}/generate →  returns { job_id }
GET  /api/v1/jobs/{job_id}/status  →  poll for progress
GET  /api/v1/products/{id}         →  fetch completed product
```

---

## 🧱 Adding a New Craft

1. Create `data/craft_library/<craft_id>.json` following the existing format:
   - `craft_id`, `display_name`, `region`, `motifs[]`, `palette_suggestions{}`, `rag_chunks[]`
2. Run the indexer:
   ```powershell
   python -m app.rag.indexer
   ```
3. The craft will automatically appear in `GET /api/v1/brands/crafts`.

---

## ⚠️ Windows-Specific Notes

- **WeasyPrint & CairoSVG**: Require the GTK3 runtime DLLs. Install from the [GTK3 Releases page](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases). If not installed, PDF generation and branded photos will fail gracefully with a fallback.
- **sentence-transformers**: Downloads ~80MB model from HuggingFace on first run. Cached in `~/.cache/huggingface/`.
