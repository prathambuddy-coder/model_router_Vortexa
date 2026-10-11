"""
Complexity Estimator - Estimates query complexity from content.
Treats estimates as inherently uncertain; when unsure, chooses the safer (higher) option
to protect query quality from under-powered models.
"""

from __future__ import annotations
import re
from app.schemas import RequestComplexity, ComplexityAnalysis


# Keywords / heuristics for complexity estimation
_COMPLEX_KEYWORDS = [
    "analyze", "explain in detail", "compare and contrast", "write an essay",
    "debug", "refactor", "implement", "algorithm", "proof", "derive",
    "multi-step", "step by step", "reasoning", "evaluate", "synthesize",
    "critically", "comprehensive", "thorough", "in-depth", "architecture",
    "trade-off", "tradeoffs", "formal proof", "implications",
]

_MODERATE_KEYWORDS = [
    "summarize", "describe", "list", "explain", "how does", "why does",
    "what is the difference", "convert", "translate", "rewrite",
    "give me", "provide", "elaborate", "outline", "recommend",
]

_SIMPLE_KEYWORDS = [
    "what is", "who is", "when", "where", "define", "yes or no",
    "true or false", "name", "hello", "hi", "hey", "capital of",
    "synonym for", "spell", "meaning of",
]

_REASONING_KEYWORDS = [
    "solve", "calculate", "prove", "derive", "math", "equation",
    "logic", "infer", "deduce", "theorem", "formula", "probability",
    "combinatorics", "induction", "hypothesis", "premise",
]

_CODING_KEYWORDS = [
    "code", "function", "class", "program", "script", "api",
    "debug", "error", "bug", "implement", "refactor", "test",
    "python", "javascript", "java", "c++", "sql", "html", "css",
    "fastapi", "react", "docker", "endpoint", "async", "await",
]


def analyze_complexity(prompt: str) -> ComplexityAnalysis:
    """
    Analyze query complexity and uncertainty from prompt content.
    Implements rule: 'Treat such estimates as uncertain, and when unsure, choose the safer option.'
    """
    prompt_lower = prompt.lower().strip()
    words = prompt_lower.split()
    word_count = len(words)

    reasoning_indicators: list[str] = []
    raw_score = 0.0

    # 1. Length indicators
    if word_count > 150:
        raw_score += 3.5
        reasoning_indicators.append(f"Extended context ({word_count} words)")
    elif word_count > 60:
        raw_score += 2.0
        reasoning_indicators.append(f"Moderate length ({word_count} words)")
    elif word_count > 25:
        raw_score += 1.0

    # 2. Keyword detections
    complex_matches = [kw for kw in _COMPLEX_KEYWORDS if kw in prompt_lower]
    if complex_matches:
        raw_score += len(complex_matches) * 1.8
        reasoning_indicators.append(f"Complex directives: {', '.join(complex_matches[:3])}")

    reasoning_matches = [kw for kw in _REASONING_KEYWORDS if kw in prompt_lower]
    if reasoning_matches:
        raw_score += len(reasoning_matches) * 2.0
        reasoning_indicators.append(f"Reasoning / Math vocabulary: {', '.join(reasoning_matches[:3])}")

    coding_matches = [kw for kw in _CODING_KEYWORDS if kw in prompt_lower]
    if coding_matches:
        raw_score += len(coding_matches) * 1.5
        reasoning_indicators.append(f"Code / Technical symbols: {', '.join(coding_matches[:3])}")

    moderate_matches = [kw for kw in _MODERATE_KEYWORDS if kw in prompt_lower]
    if moderate_matches:
        raw_score += len(moderate_matches) * 0.8

    simple_matches = [kw for kw in _SIMPLE_KEYWORDS if kw in prompt_lower]
    if simple_matches:
        raw_score -= len(simple_matches) * 0.6

    # 3. Structural indicators
    if "```" in prompt or "def " in prompt or "function(" in prompt or "class " in prompt:
        raw_score += 2.5
        reasoning_indicators.append("Embedded code block syntax")

    question_marks = prompt_lower.count("?")
    if question_marks >= 2:
        raw_score += 1.5
        reasoning_indicators.append(f"Multi-part questioning ({question_marks} questions)")

    # 4. Measure Uncertainty & Borderline Cases
    # Short prompts with profound queries (e.g. "prove P!=NP", "quantum foam") are ambiguous
    is_short_profound = word_count < 10 and (len(reasoning_matches) > 0 or len(complex_matches) > 0)
    # Check if raw_score lies within transition borders (uncertain boundaries)
    is_borderline_moderate = 1.0 <= raw_score < 2.2
    is_borderline_complex = 3.5 <= raw_score < 4.8

    uncertainty_applied = False
    confidence_score = 0.85

    if is_short_profound:
        raw_score += 2.5
        uncertainty_applied = True
        confidence_score = 0.60
        reasoning_indicators.append("Uncertainty rule: Short high-density prompt promoted for safety")
    elif is_borderline_complex:
        # Near complex boundary -> choose the SAFER (higher) tier
        raw_score += 1.5
        uncertainty_applied = True
        confidence_score = 0.65
        reasoning_indicators.append("Uncertainty rule: Borderline complexity elevated to safer tier")
    elif is_borderline_moderate and len(simple_matches) == 0:
        # Near moderate boundary without obvious simple cues -> choose the SAFER tier
        raw_score += 1.0
        uncertainty_applied = True
        confidence_score = 0.70
        reasoning_indicators.append("Uncertainty rule: Ambiguity resolved by selecting safer capability tier")

    # Final tier determination
    if raw_score >= 5.5:
        complexity = RequestComplexity.VERY_COMPLEX
        rec_min_cap = 8
    elif raw_score >= 3.2:
        complexity = RequestComplexity.COMPLEX
        rec_min_cap = 6
    elif raw_score >= 1.2:
        complexity = RequestComplexity.MODERATE
        rec_min_cap = 4
    else:
        complexity = RequestComplexity.SIMPLE
        rec_min_cap = 2

    task_types = get_suggested_task_types(prompt)

    return ComplexityAnalysis(
        complexity=complexity,
        confidence_score=round(confidence_score, 2),
        uncertainty_applied=uncertainty_applied,
        reasoning_indicators=reasoning_indicators if reasoning_indicators else ["Standard single-turn factual query"],
        recommended_min_capability=rec_min_cap,
        suggested_task_types=task_types,
    )


def estimate_complexity(prompt: str) -> RequestComplexity:
    """Backwards-compatible helper returning RequestComplexity enum."""
    return analyze_complexity(prompt).complexity


def get_suggested_task_types(prompt: str) -> list[str]:
    """Suggest task types based on prompt content for task-suitability matching."""
    prompt_lower = prompt.lower()
    tasks: list[str] = []

    if any(kw in prompt_lower for kw in _CODING_KEYWORDS):
        tasks.append("coding")
    if any(kw in prompt_lower for kw in _REASONING_KEYWORDS):
        tasks.append("reasoning")
        tasks.append("math")
    if any(kw in prompt_lower for kw in ["summarize", "summary", "tldr", "brief"]):
        tasks.append("summarization")
    if any(kw in prompt_lower for kw in ["translate", "translation", "spanish", "french", "german", "hindi"]):
        tasks.append("translation")
    if any(kw in prompt_lower for kw in ["classify", "categorize", "label", "sentiment"]):
        tasks.append("classification")
    if any(kw in prompt_lower for kw in ["extract", "find", "parse", "entities", "json"]):
        tasks.append("extraction")
    if any(kw in prompt_lower for kw in ["analyze", "analysis", "evaluate", "compare", "contrast"]):
        tasks.append("analysis")
    if any(kw in prompt_lower for kw in ["write", "essay", "story", "poem", "creative"]):
        tasks.append("creative_writing")
    if any(kw in prompt_lower for kw in ["chat", "talk", "conversation", "hello", "hi", "hey"]):
        tasks.append("conversation")

    if not tasks:
        tasks.append("simple_qa")
        tasks.append("conversation")

    return tasks
