# Idanta API

FastAPI backend for generating artisan brand identities and category-aware product assets with LangGraph, Groq, RAG, WeasyPrint, and Supabase.

## What Changed

- Brand onboarding now captures richer artisan context:
  `generations_in_craft`, `years_of_experience`, `primary_occasion`, `target_customer`, `brand_feel`, `artisan_story`, `script_preference`, `preferred_language`.
- Product creation now supports category-aware validation and asset generation:
  `category`, `occasion`, `time_to_make_hrs`, `description_voice`, `category_data`.
- Print assets are now category-specific:
  apparel, jewelry, pottery, painting, and home decor each use dedicated hang tag and label templates.
- Painting originals additionally generate a certificate of authenticity.
- Every product run now also generates a story card PDF.

## Setup

1. Install dependencies.

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

2. Configure environment variables.

```powershell
copy .env.example .env
```

3. Run the base schema in Supabase SQL Editor:
   [database_schema.sql](/Users/sir_anmol/Desktop/Idanta/server/data/database_schema.sql)

4. Run the additive migration block from the same file in Supabase SQL Editor before using the new API fields:

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

alter table products
  add column if not exists category text default 'apparel',
  add column if not exists occasion text default 'general',
  add column if not exists time_to_make_hrs integer default 0,
  add column if not exists description_voice text,
  add column if not exists category_data jsonb default '{}';
```

5. Index craft library data for RAG.

```powershell
python -m app.rag.indexer
```

6. Start the API.

```powershell
uvicorn main:app --reload
```

## Craft Library Shape

Each file in [craft_library](/Users/sir_anmol/Desktop/Idanta/server/data/craft_library) now includes:

- `category`
- `gi_tag` and `gi_tag_name`
- structured `motifs`
- structured `traditional_colors`
- structured `materials`
- `brand_tone_keywords`
- `selling_points`
- `occasions`
- `product_copy_hints`
- `rag_chunks`

## Brand API

`POST /api/v1/brands/`

```json
{
  "craft_id": "block_print_jaipur",
  "artisan_name": "Ramesh Kumar",
  "region": "Sanganer, Jaipur",
  "years_of_experience": 15,
  "generations_in_craft": 3,
  "primary_occasion": "wedding",
  "target_customer": "online_india",
  "brand_feel": "royal",
  "script_preference": "both",
  "artisan_story": "My grandfather carved these blocks by hand.",
  "preferred_language": "hi"
}
```

Allowed values:

- `primary_occasion`: `wedding`, `festival`, `daily`, `gifting`, `home_decor`, `export`, `general`
- `target_customer`: `local_bazaar`, `tourist`, `online_india`, `export`
- `brand_feel`: `earthy`, `royal`, `vibrant`, `minimal`
- `script_preference`: `hindi`, `english`, `both`

## Product API

`POST /api/v1/products/` expects `multipart/form-data`.

Required form fields:

- `brand_id`
- `name`
- `price_mrp`
- `category`
- `category_data` as a JSON string

Optional form fields:

- `occasion`
- `motif_used`
- `material`
- `description_voice`
- `time_to_make_hrs`
- `photos`

Allowed `category` values:

- `apparel`
- `jewelry`
- `pottery`
- `painting`
- `home_decor`
- `other`

Example `category_data` payloads:

```json
{
  "fabric_type": "Cotton",
  "sizes_available": ["S", "M", "L"],
  "wash_care": "Hand wash only",
  "print_technique": "Block print",
  "dye_type": "Natural dyes"
}
```

```json
{
  "art_style": "Madhubani",
  "medium": "Natural colors",
  "surface": "Handmade paper",
  "width_cm": 30,
  "height_cm": 45,
  "is_original": true
}
```

The backend injects the correct `category_type` discriminator during validation, so the client only needs to send the category-specific fields.

## Product Asset Outputs

The product graph now produces:

- listing copy
- branded product photo
- category-aware hang tag PDF
- category-aware label PDF
- story card PDF
- certificate of authenticity PDF for original paintings

`GET /api/v1/products/{id}` still returns the persisted DB asset URLs for `hang_tag_url`, `label_url`, and `branded_photo_url`.

## Important Notes

- The Supabase migration was not executed from this workspace; update the SQL editor manually with the statements above.
- The PDF rendering service itself was left unchanged. Only template selection and template files were updated.
- RAG files, Groq client, storage service, auth routes, jobs routes, and `main.py` were intentionally left alone.
