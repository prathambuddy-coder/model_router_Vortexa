"""
router.py - The Brain of A-01 ModelRouter
------------------------------------------
The backend server autonomously decides the model based on:
1. User prompt complexity analysis & task intent detection
   (Code Specialist vs. Advanced Reasoning vs. Multimodal vs. Fast vs. Balanced)
2. Models' manipulated features (configured by judges: avg_latency_ms, max_latency_ms, availability, enabled)

If a judge spikes a model's latency or marks it offline, the backend's
routing engine automatically and dynamically selects a valid alternative.
"""

import re
import uuid
from typing import Dict, List, Optional
from models import ModelProfile
from constraint_engine import ConstraintEngine
from model_adapter import MAX_COMPLETION_TOKENS

CHARS_PER_TOKEN = 4  # rough tokenizer-agnostic estimate


def _analyze_complexity(prompt: str) -> dict:
    """
    Server-side prompt simplicity & complexity analyzer.
    Accurately classifies whether a prompt is EASY/SIMPLE, MODERATE, or ADVANCED:
    - If it's an easy/simple query:
      Routes to the lightest model with lowest latency and minimal token overhead.
      All models qualify (inferred_min_capability = 1.0).
      Winner is selected dynamically by lowest configured latency (avg_latency_ms).
    - If it's an advanced task (formal mathematical proof, code synthesis, visual document parsing):
      Routes to an appropriate specialist while keeping latency competitive.
    """
    cleaned = prompt.strip().lower()
    words = cleaned.split()
    word_count = len(words)

    # 1. Greetings & Short Conversational Prompts -> SIMPLE
    greetings = {"hi", "hii", "hello", "hey", "test", "ping", "sup", "howdy", "good morning", "good evening", "good afternoon"}
    if cleaned in greetings or (word_count <= 4 and any(cleaned.startswith(g) for g in ("hi", "hello", "hey", "test", "ping"))):
        return {
            "score": 1.2,
            "label": "SIMPLE",
            "domain": "simple",
            "inferred_min_capability": 1.0,
            "preference": "lowest_latency",
            "matched_keywords": ["conversational_greeting"],
            "explanation": "Short conversational greeting -> Evaluates all eligible models and routes to the model with lowest latency.",
        }

    # 2. Check for Genuine Code Generation / Software Engineering
    # Only prompts that ask to generate, implement, debug, or refactor software
    code_syntax_patterns = [
        "```", "def ", "class ", "import ", "function(", "const ", "let ", "var ",
        "return ", "public static", "fn ", "#include"
    ]
    has_code_syntax = any(pat in prompt for pat in code_syntax_patterns)

    code_action_phrases = [
        "the code", "code for", "give me code", "give m the code", "write a python", "write python",
        "write a function", "write code", "generate code", "code to", "python code",
        "write a script", "implement a function", "implement an algorithm", "create a function",
        "write a program", "code in python", "code in javascript", "code in c++", "debug this",
        "refactor this", "write a regex", "write sql query", "unit test for", "binary search tree",
        "factorial(n)", "fibonacci function"
    ]
    is_code_generation = has_code_syntax or any(phrase in cleaned for phrase in code_action_phrases)

    if is_code_generation:
        return {
            "score": 8.0,
            "label": "CODING",
            "domain": "coding",
            "inferred_min_capability": 6.0,
            "preference": "coding_specialist",
            "matched_keywords": ["code_generation"],
            "explanation": "Code implementation / software task detected -> Evaluates candidates balancing coding aptitude and latency.",
        }

    # 3. Check for Formal Deep Mathematical Proof / Logic Deduction
    reasoning_action_phrases = [
        "formal proof", "prove that", "mathematical induction", "prove by contradiction",
        "derive the formula", "step-by-step calculus", "solve differential equation",
        "dijkstra algorithm proof", "np-complete", "formal logic deduction", "eigenvalues"
    ]
    is_deep_reasoning = any(phrase in cleaned for phrase in reasoning_action_phrases)

    if is_deep_reasoning:
        return {
            "score": 9.0,
            "label": "REASONING_INTENSIVE",
            "domain": "reasoning",
            "inferred_min_capability": 9.0,
            "preference": "highest_capability",
            "matched_keywords": ["formal_proof"],
            "explanation": "Deep mathematical / formal logic proof detected -> Routes to high-capacity reasoning engine.",
        }

    # 4. Check for Multimodal / Visual Document Analysis
    mm_action_phrases = [
        "analyze this image", "extract text from image", "read this chart",
        "parse this document", "look at this picture", "ocr scan", "visual diagram"
    ]
    is_multimodal = any(phrase in cleaned for phrase in mm_action_phrases)

    if is_multimodal:
        return {
            "score": 8.0,
            "label": "MULTIMODAL",
            "domain": "multimodal",
            "inferred_min_capability": 7.0,
            "preference": "multimodal_specialist",
            "matched_keywords": ["visual_parsing"],
            "explanation": "Multimodal / visual document analysis detected -> Routes to visual foundation engine.",
        }

    # 5. Check for Moderate Analytical / Synthesis Tasks (Generalist Workflow Tier)
    # Questions requiring multi-paragraph drafting, synthesis, comparisons, or detailed explanations
    is_analytical_synthesis = (
        word_count >= 15
        or any(phrase in cleaned for phrase in (
            "compare", "difference between", "pros and cons", "explain how", "explain the",
            "write an essay", "write an email", "draft a", "summarize the history", "tradeoffs of",
            "step by step guide", "in detail", "comprehensive"
        ))
    )
    if is_analytical_synthesis:
        return {
            "score": 5.5,
            "label": "MODERATE",
            "domain": "general",
            "inferred_min_capability": 5.0,
            "preference": "balanced",
            "matched_keywords": ["analytical_synthesis"],
            "explanation": "Moderate analytical inquiry / synthesis task -> Routes to high-throughput balanced engine (NVIDIA Nemotron 3.5 Lightning).",
        }

    # 6. ALL OTHER SHORT DIRECT QUERIES ARE EASY / SIMPLE!
    # Direct questions (what is, who is, where is, tell me, 2+2, facts, simple chit-chat, translations)
    simplicity_score = round(max(1.0, min(3.0, 1.0 + (word_count / 15.0) * 1.5)), 1)
    return {
        "score": simplicity_score,
        "label": "SIMPLE",
        "domain": "simple",
        "inferred_min_capability": 1.0,
        "preference": "lowest_latency",
        "matched_keywords": ["simple_query"],
        "explanation": "Direct / simple question -> Evaluates all eligible models and routes to the model with lowest latency and minimal overhead.",
    }


class ModelRouter:
    """
    Evaluates prompt + models from shared registry.
    Completely server-driven selection based on prompt complexity, task domain,
    and judge-configured model features.
    """

    def __init__(self):
        self._engine = ConstraintEngine()

    def route(
        self,
        prompt: str,
        constraints: Optional[dict],
        models: Dict[str, ModelProfile],
        request_id: Optional[str] = None,
    ) -> dict:
        if request_id is None:
            request_id = str(uuid.uuid4())[:8]

        # 1. Complexity & Task Domain Estimation (Server Brain)
        complexity = _analyze_complexity(prompt)

        # Build effective constraints derived by backend logic
        effective_constraints = dict(constraints) if constraints else {}

        # If not explicitly specified by caller, use backend-derived capability floor
        if "min_capability" not in effective_constraints and "min_capability_score" not in effective_constraints:
            if complexity.get("inferred_min_capability") and complexity["inferred_min_capability"] > 2.0:
                effective_constraints["min_capability"] = complexity["inferred_min_capability"]

        # Context floor: the prompt plus the completion budget must fit the window
        if "min_context_length" not in effective_constraints and "required_context_length" not in effective_constraints:
            prompt_tokens = max(1, len(prompt) // CHARS_PER_TOKEN)
            effective_constraints["min_context_length"] = prompt_tokens + MAX_COMPLETION_TOKENS

        # Note: Do NOT inject an artificial max_latency_ms deadline when the user
        # did not specify one. Only enforce hard deadline SLA when caller explicitly passed it.

        if "preference" not in effective_constraints:
            effective_constraints["preference"] = complexity["preference"]

        preference = effective_constraints.get("preference", "balanced")

        # 2. Hard Constraint Filtering (Bouncer)
        passed_models: List[ModelProfile] = []
        candidate_list: List[dict] = []

        for model_key, profile in models.items():
            check = self._engine.check_model(profile, effective_constraints)
            if check.passes:
                passed_models.append(profile)
                candidate_list.append({
                    "model_id": model_key,
                    "model_key": model_key,
                    "name": profile.name,
                    "role": profile.role,
                    "status": "passed",
                    "rejection_reason": None,
                    "avg_latency_ms": profile.avg_latency_ms,
                    "max_latency_ms": profile.max_latency_ms,
                    "capability_score": profile.capability_score,
                    "cost_per_1k_tokens": profile.cost_per_1k_tokens,
                    "available": profile.available,
                    "score": None,
                })
            else:
                candidate_list.append({
                    "model_id": model_key,
                    "model_key": model_key,
                    "name": profile.name,
                    "role": profile.role,
                    "status": "rejected",
                    "rejection_reason": "; ".join(check.violations),
                    "avg_latency_ms": profile.avg_latency_ms,
                    "max_latency_ms": profile.max_latency_ms,
                    "capability_score": profile.capability_score,
                    "cost_per_1k_tokens": profile.cost_per_1k_tokens,
                    "available": profile.available,
                    "score": None,
                })

        # 3. Handle NO VALID MODEL
        if not passed_models:
            return {
                "request_id": request_id,
                "status": "NO_VALID_MODEL",
                "message": "No available model satisfies the prompt's required constraints.",
                "selected": None,
                "complexity": complexity,
                "effective_constraints": effective_constraints,
                "candidates": candidate_list,
                "preference_used": preference,
                "explanation": "All candidates were eliminated during hard constraint checking against judge configurations.",
                "failover_chain": [],
            }

        # 4. Soft Ranking & Selection
        ranked = self._engine.rank_models(passed_models, preference)

        # Explicit model pick from the UI wins if it passed the hard constraints;
        # otherwise fall back to automatic ranking.
        preferred_key = effective_constraints.get("preferred_model")
        preferred_note = None
        if preferred_key:
            preferred = next((r for r in ranked if r.model_key == preferred_key), None)
            if preferred:
                ranked.remove(preferred)
                ranked.insert(0, preferred)
            elif preferred_key in models:
                rej = next((c for c in candidate_list if c["model_key"] == preferred_key), {})
                preferred_note = (
                    f"Requested model '{models[preferred_key].name}' was rejected "
                    f"({rej.get('rejection_reason') or 'unavailable'}); auto-routed instead."
                )
        winner = ranked[0]

        # Merge scores back into candidate list with explicit rationale
        score_lookup = {r.model_key: r for r in ranked}
        win_m = winner.profile
        for c in candidate_list:
            if c["status"] == "passed":
                rm = score_lookup.get(c["model_key"])
                if rm:
                    c["score"] = rm.score
                    c["score_breakdown"] = rm.score_breakdown
                    if rm.model_key == winner.model_key:
                        c["status"] = "selected"
                        c["decision_reason"] = f"Selected as best match ({win_m.avg_latency_ms}ms latency, Cap {win_m.capability_score}/10)."
                    else:
                        if preference in ("lowest_latency", "fastest") or complexity.get("label") == "SIMPLE":
                            c["decision_reason"] = f"Higher latency ({c['avg_latency_ms']}ms vs {win_m.avg_latency_ms}ms on {win_m.name})."
                        elif preference in ("coding", "coding_specialist"):
                            c["decision_reason"] = f"Lower ranking score ({rm.score} vs {winner.score} on {win_m.name}, latency {c['avg_latency_ms']}ms)."
                        elif preference in ("highest_capability"):
                            c["decision_reason"] = f"Lower composite ranking ({rm.score} vs {winner.score} on {win_m.name}, latency {c['avg_latency_ms']}ms)."
                        elif preference in ("multimodal", "multimodal_specialist"):
                            c["decision_reason"] = f"Lower ranking score ({rm.score} vs {winner.score} on {win_m.name}, latency {c['avg_latency_ms']}ms)."
                        else:
                            c["decision_reason"] = f"Lower composite score ({rm.score} vs {winner.score} on {win_m.name})."
            else:
                c["decision_reason"] = c.get("rejection_reason") or "Failed hard constraint bouncer."

        # Generate human-readable explanation
        win_m = winner.profile
        if preference in ("lowest_latency", "fastest") or complexity.get("label") == "SIMPLE":
            reason = f"{win_m.name} selected as the fastest eligible model ({win_m.avg_latency_ms}ms avg latency) for this {complexity['label'].lower()} query."
        elif preference in ("coding", "coding_specialist"):
            reason = f"{win_m.name} selected as optimal coding engine ({win_m.avg_latency_ms}ms latency) for this programming query."
        elif preference in ("multimodal", "multimodal_specialist"):
            reason = f"{win_m.name} selected for multimodal visual document / chart understanding ({win_m.avg_latency_ms}ms latency)."
        elif preference == "highest_capability":
            reason = f"{win_m.name} selected for high capability rating ({win_m.capability_score}/10, {win_m.avg_latency_ms}ms latency)."
        elif preference == "cheapest":
            reason = f"{win_m.name} selected for lowest cost profile."
        else:
            reason = f"{win_m.name} selected with highest composite score ({winner.score}) balancing latency, cost, and quality."

        if preferred_key and winner.model_key == preferred_key:
            reason = f"{win_m.name} selected as the explicitly requested model (passed all hard constraints)."
        elif preferred_note:
            reason = f"{preferred_note} {reason}"

        return {
            "request_id": request_id,
            "status": "SUCCESS",
            "selected": winner.model_key,
            "selected_name": win_m.name,
            "complexity": complexity,
            "effective_constraints": effective_constraints,
            "candidates": candidate_list,
            "preference_used": preference,
            "explanation": reason,
            "failover_chain": [],
        }
