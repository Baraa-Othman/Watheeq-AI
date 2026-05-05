"""Google Gemini integration with retry/backoff and automatic model fallback."""

import asyncio
import json
import logging
from typing import Optional

from google import genai
from google.genai import types

from app.core.config import settings
from app.services.ai.exceptions import LLMResponseParsingError, LLMServiceError

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None

FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"]


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise LLMServiceError(
                "GEMINI_API_KEY is not configured — set it in backend/.env"
            )
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        try:
            first_newline = cleaned.index("\n")
            cleaned = cleaned[first_newline + 1:]
        except ValueError:
            cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].rstrip()
    return cleaned


def _model_chain() -> list[str]:
    chain = [settings.LLM_MODEL]
    for fb in FALLBACK_MODELS:
        if fb != settings.LLM_MODEL:
            chain.append(fb)
    return chain


def _call_gemini_json(system_prompt: str, user_prompt: str, model: str) -> str:
    client = _get_client()
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=settings.LLM_TEMPERATURE,
            max_output_tokens=settings.LLM_MAX_TOKENS,
            response_mime_type="application/json",
        ),
    )
    return response.text


def _call_gemini_text(system_prompt: str, user_prompt: str, model: str) -> str:
    client = _get_client()
    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3,
            max_output_tokens=settings.LLM_MAX_TOKENS,
        ),
    )
    return response.text


def _is_overloaded(error: Exception) -> bool:
    s = str(error).lower()
    return any(k in s for k in ["503", "unavailable", "overloaded", "high demand", "resource_exhausted", "429"])


def _is_transient(error: Exception) -> bool:
    s = str(error).lower()
    return any(k in s for k in ["timeout", "rate", "503", "500", "overloaded", "unavailable", "resource_exhausted", "deadline", "429"])


async def analyze(user_prompt: str, system_prompt: str, max_retries: int = 3) -> dict:
    """Send a prompt to Gemini and return the parsed JSON response."""
    last_error: Optional[Exception] = None

    for model in _model_chain():
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"Gemini JSON call attempt {attempt}/{max_retries} (model: {model})")
                content = await asyncio.to_thread(_call_gemini_json, system_prompt, user_prompt, model)
                if not content:
                    raise LLMResponseParsingError("Gemini returned empty response")
                cleaned = _strip_code_fences(content)
                try:
                    parsed = json.loads(cleaned)
                except json.JSONDecodeError as e:
                    raise LLMResponseParsingError(
                        f"Gemini response is not valid JSON: {e}\nRaw response: {content[:500]}"
                    )
                logger.info(f"Gemini call successful (model: {model})")
                return parsed
            except LLMResponseParsingError:
                raise
            except Exception as e:
                last_error = e
                if _is_overloaded(e):
                    logger.warning(f"Model {model} overloaded — trying next fallback")
                    break
                if _is_transient(e) and attempt < max_retries:
                    wait = 2 ** attempt
                    logger.warning(f"Transient error attempt {attempt}/{max_retries}: {e}. Retrying in {wait}s")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"Gemini error on model {model}: {e}")
                    break

    raise LLMServiceError(f"Gemini call failed after trying all models {_model_chain()}: {last_error}")


async def generate_text(user_prompt: str, system_prompt: str, max_retries: int = 3) -> str:
    """Send a prompt to Gemini and return raw text (used for draft responses)."""
    last_error: Optional[Exception] = None

    for model in _model_chain():
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"Gemini text call attempt {attempt}/{max_retries} (model: {model})")
                content = await asyncio.to_thread(_call_gemini_text, system_prompt, user_prompt, model)
                if not content:
                    raise LLMServiceError("Gemini returned empty text response")
                logger.info(f"Gemini text call successful (model: {model})")
                return content.strip()
            except Exception as e:
                last_error = e
                if _is_overloaded(e):
                    logger.warning(f"Model {model} overloaded — trying next fallback")
                    break
                if _is_transient(e) and attempt < max_retries:
                    wait = 2 ** attempt
                    logger.warning(f"Transient error attempt {attempt}/{max_retries}: {e}. Retrying in {wait}s")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"Gemini error on model {model}: {e}")
                    break

    raise LLMServiceError(f"Gemini text call failed after trying all models {_model_chain()}: {last_error}")
