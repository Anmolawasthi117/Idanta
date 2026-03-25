"""
Product Asset Generation LangGraph.
"""

import logging

from langgraph.graph import END, StateGraph

from app.agents.nodes.copy_agent import copy_agent_product_node
from app.agents.nodes.packager import packager_product_node
from app.agents.nodes.print_assets import print_assets_node
from app.agents.nodes.context_builder import _load_craft_json
from app.agents.state import ProductState
from app.core.database import supabase

logger = logging.getLogger(__name__)


async def load_product_data_node(state: ProductState) -> ProductState:
    """Load product and parent brand data from Supabase."""
    job_id = state["job_id"]
    product_id = state["product_id"]

    supabase.table("jobs").update(
        {
            "current_step": "Loading product details...",
            "percent": 5,
            "status": "running",
        }
    ).eq("id", job_id).execute()

    product = supabase.table("products").select("*").eq("id", product_id).single().execute().data
    if not product:
        raise ValueError(f"Product not found: {product_id}")

    brand = supabase.table("brands").select("*").eq("id", product["brand_id"]).single().execute().data
    if not brand:
        raise ValueError(f"Brand not found for product: {product_id}")

    craft_data = _load_craft_json(brand.get("craft_id", ""))
    brand_context = {
        "craft_id": brand.get("craft_id", ""),
        "craft_name": craft_data.get("display_name", brand.get("craft_id", "")),
        "region": brand.get("region") or craft_data.get("region", "India"),
        "artisan_name": brand.get("artisan_name", ""),
        "generations_in_craft": brand.get("generations_in_craft", 1),
        "years_of_experience": brand.get("years_of_experience", 0),
        "primary_occasion": brand.get("primary_occasion", "general"),
        "target_customer": brand.get("target_customer", "local_bazaar"),
        "brand_feel": brand.get("brand_feel", "earthy"),
        "script_preference": brand.get("script_preference", "both"),
        "artisan_story": brand.get("artisan_story", "") or "",
        "story_en": brand.get("story_en", ""),
        "story_hi": brand.get("story_hi", ""),
        "gi_tag": craft_data.get("gi_tag", False),
        "gi_tag_name": craft_data.get("gi_tag_name"),
        "product_copy_hints": craft_data.get("product_copy_hints", {}),
        "rag_context": "\n\n".join(craft_data.get("rag_chunks", [])),
    }

    return {
        **state,
        "brand_id": brand["id"],
        "form_data": product,
        "photo_paths": product.get("photos", []),
        "brand_context": brand_context,
        "product_name": product["name"],
        "price_mrp": float(product.get("price_mrp", 0)),
        "motif_used": product.get("motif_used"),
        "material": product.get("material"),
        "photos": product.get("photos", []),
        "product_category": product.get("category", state.get("product_category", "apparel")),
        "occasion": product.get("occasion", "general"),
        "time_to_make_hrs": product.get("time_to_make_hrs", 0),
        "description_voice": product.get("description_voice"),
        "category_data": product.get("category_data") or state.get("category_data", {}),
        "brand_name": brand.get("name", ""),
        "tagline": brand.get("tagline", ""),
        "palette": brand.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"}),
        "region": brand.get("region") or craft_data.get("region", "India"),
        "craft_id": brand.get("craft_id", ""),
        "product_theme": {
            "brand_feel": brand.get("brand_feel", "earthy"),
            "occasion": product.get("occasion", "general"),
            "category": product.get("category", "apparel"),
        },
    }


def _handle_error(state: ProductState, error: Exception) -> ProductState:
    job_id = state.get("job_id", "unknown")
    error_str = str(error)
    logger.error("Product graph failed for job=%s: %s", job_id, error_str)

    supabase.table("jobs").update(
        {
            "status": "failed",
            "current_step": "Asset generation failed",
            "error": "क्षमा करें, उत्पाद एसेट तैयार करते समय तकनीकी समस्या आ गई। कृपया पुनः प्रयास करें।",
        }
    ).eq("id", job_id).execute()

    return {
        **state,
        "error": "क्षमा करें, उत्पाद एसेट तैयार करते समय तकनीकी समस्या आ गई। कृपया पुनः प्रयास करें।",
    }


def build_product_graph() -> StateGraph:
    async def _load_data(state: ProductState) -> ProductState:
        return await load_product_data_node(state)

    async def _copy(state: ProductState) -> ProductState:
        return await copy_agent_product_node(state)

    async def _print(state: ProductState) -> ProductState:
        return await print_assets_node(state)

    async def _package(state: ProductState) -> ProductState:
        return await packager_product_node(state)

    graph = StateGraph(ProductState)
    graph.add_node("load_product_data", _load_data)
    graph.add_node("copy_agent", _copy)
    graph.add_node("print_assets", _print)
    graph.add_node("packager", _package)
    graph.set_entry_point("load_product_data")
    graph.add_edge("load_product_data", "copy_agent")
    graph.add_edge("copy_agent", "print_assets")
    graph.add_edge("print_assets", "packager")
    graph.add_edge("packager", END)
    return graph.compile()


product_graph = build_product_graph()


async def run_product_graph(initial_state: ProductState) -> ProductState:
    try:
        return await product_graph.ainvoke(initial_state)
    except Exception as exc:
        return _handle_error(initial_state, exc)
