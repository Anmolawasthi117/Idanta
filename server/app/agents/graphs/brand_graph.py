"""Brand Onboarding LangGraph orchestration."""

import logging

from langgraph.graph import END, StateGraph

from app.agents.nodes.context_builder import context_builder_node
from app.agents.nodes.copy_agent import copy_agent_brand_node
from app.agents.nodes.intelligence import intelligence_node
from app.agents.nodes.packager import packager_brand_node
from app.agents.nodes.visual_identity import visual_identity_node
from app.agents.state import BrandState
from app.core.database import supabase

logger = logging.getLogger(__name__)


def _handle_error(state: BrandState, error: Exception) -> BrandState:
    job_id = state.get("job_id", "unknown")
    artisan_name = state.get("artisan_name", "कारीगर")
    error_str = str(error)

    logger.error("Brand graph failed for job=%s: %s", job_id, error_str)

    hindi_error = (
        f"क्षमा करें {artisan_name} जी, कुछ तकनीकी समस्या आ गई। "
        f"कृपया कुछ देर बाद पुनः प्रयास करें।"
    )

    supabase.table("jobs").update(
        {
            "status": "failed",
            "current_step": "Something went wrong",
            "error": hindi_error,
        }
    ).eq("id", job_id).execute()

    return {**state, "error": hindi_error}


def build_brand_graph() -> StateGraph:
    async def _context_builder(state: BrandState) -> BrandState:
        return await context_builder_node(state)

    async def _intelligence(state: BrandState) -> BrandState:
        return await intelligence_node(state)

    async def _visual_identity(state: BrandState) -> BrandState:
        return await visual_identity_node(state)

    async def _copy_agent(state: BrandState) -> BrandState:
        return await copy_agent_brand_node(state)

    async def _packager(state: BrandState) -> BrandState:
        return await packager_brand_node(state)

    graph = StateGraph(BrandState)
    graph.add_node("context_builder", _context_builder)
    graph.add_node("intelligence", _intelligence)
    graph.add_node("visual_identity", _visual_identity)
    graph.add_node("copy_agent", _copy_agent)
    graph.add_node("packager", _packager)
    graph.set_entry_point("context_builder")
    graph.add_edge("context_builder", "intelligence")
    graph.add_edge("intelligence", "visual_identity")
    graph.add_edge("intelligence", "copy_agent")
    graph.add_edge("visual_identity", "packager")
    graph.add_edge("copy_agent", "packager")
    graph.add_edge("packager", END)
    return graph.compile()


brand_graph = build_brand_graph()


async def run_brand_graph(initial_state: BrandState) -> BrandState:
    try:
        return await brand_graph.ainvoke(initial_state)
    except Exception as exc:
        return _handle_error(initial_state, exc)
