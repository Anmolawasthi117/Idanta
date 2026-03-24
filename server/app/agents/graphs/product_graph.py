"""
Product Asset Generation LangGraph.

Flow (sequential):
  START
    → load_product_data (5%) — Load product + brand data from DB
    → copy_agent_product (40%) — Listing copy, social caption, care instructions
    → print_assets (70%) — Hang Tags, Labels, Branded Photo
    → packager_product (100%)
  END
"""

import logging
from langgraph.graph import StateGraph, END

from app.agents.state import ProductState
from app.agents.nodes.copy_agent import copy_agent_product_node
from app.agents.nodes.print_assets import print_assets_node
from app.agents.nodes.packager import packager_product_node
from app.core.database import supabase

logger = logging.getLogger(__name__)


async def load_product_data_node(state: ProductState) -> ProductState:
    """
    Load product and parent brand data from Supabase.
    This is always the first node — provides all required context for downstream nodes.
    """
    job_id = state["job_id"]
    product_id = state["product_id"]

    supabase.table("jobs").update({
        "current_step": "🔍 Loading product details...",
        "percent": 5,
        "status": "running",
    }).eq("id", job_id).execute()

    # Load product row
    prod_resp = supabase.table("products").select("*").eq("id", product_id).single().execute()
    product = prod_resp.data

    if not product:
        raise ValueError(f"Product not found: {product_id}")

    # Load parent brand row
    brand_resp = supabase.table("brands").select("*").eq("id", product["brand_id"]).single().execute()
    brand = brand_resp.data

    if not brand:
        raise ValueError(f"Brand not found for product: {product_id}")

    # Load craft data for region info
    from app.agents.nodes.context_builder import _load_craft_json
    craft_data = _load_craft_json(brand.get("craft_id", ""))

    return {
        **state,
        "brand_id": brand["id"],
        "product_name": product["name"],
        "price_mrp": float(product.get("price_mrp", 0)),
        "motif_used": product.get("motif_used"),
        "material": product.get("material"),
        "photos": product.get("photos", []),
        "brand_name": brand.get("name", ""),
        "tagline": brand.get("tagline", ""),
        "palette": brand.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"}),
        "logo_svg": brand.get("logo_url", ""),  # Note: ideally store SVG separately
        "region": craft_data.get("region", "India"),
        "craft_id": brand.get("craft_id", ""),
    }


def _handle_error(state: ProductState, error: Exception) -> ProductState:
    job_id = state.get("job_id", "unknown")
    error_str = str(error)
    logger.error(f"Product graph failed for job={job_id}: {error_str}")

    hindi_error = (
        "क्षमा करें, उत्पाद की तस्वीर और टैग बनाने में समस्या आई। "
        "कृपया पुनः प्रयास करें।"
    )

    supabase.table("jobs").update({
        "status": "failed",
        "current_step": "❌ Asset generation failed",
        "error": hindi_error,
    }).eq("id", job_id).execute()

    return {**state, "error": hindi_error}


def build_product_graph() -> StateGraph:
    """Construct and compile the product asset generation LangGraph."""

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
    """Entry point for running the product asset generation graph."""
    try:
        return await product_graph.ainvoke(initial_state)
    except Exception as e:
        return _handle_error(initial_state, e)
