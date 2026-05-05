"""PDF download and text extraction (PyMuPDF)."""

import base64
import logging

import fitz  # PyMuPDF
import httpx

from app.core.config import settings
from app.services.ai.exceptions import PDFDownloadError, PDFExtractionError

logger = logging.getLogger(__name__)


async def extract_text(source: str) -> str:
    """Extract text from a PDF given a URL, data URI, base64 string, or local path."""
    try:
        pdf_bytes = await _resolve_source(source)
        text = _extract_text_from_bytes(pdf_bytes)
        if not text.strip():
            logger.warning("PDF extraction returned empty text — PDF may be image-based")
        return text
    except (PDFDownloadError, PDFExtractionError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error during PDF extraction: {e}")
        raise PDFExtractionError(f"Failed to extract text from PDF: {e}")


async def _resolve_source(source: str) -> bytes:
    if source.startswith(("http://", "https://")):
        return await _download_pdf(source)
    if source.startswith("data:"):
        try:
            encoded = source.split(",", 1)[-1]
            return base64.b64decode(encoded)
        except Exception as e:
            raise PDFExtractionError(f"Invalid base64 data URI: {e}")
    if len(source) > 500:
        try:
            return base64.b64decode(source)
        except Exception as e:
            raise PDFExtractionError(f"Invalid base64 string: {e}")
    try:
        with open(source, "rb") as f:
            return f.read()
    except FileNotFoundError:
        raise PDFExtractionError(f"PDF file not found: {source}")
    except Exception as e:
        raise PDFExtractionError(f"Failed to read PDF file: {e}")


async def _download_pdf(url: str) -> bytes:
    max_size_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content = response.content
            if len(content) > max_size_bytes:
                raise PDFDownloadError(url, f"PDF exceeds maximum size of {settings.MAX_PDF_SIZE_MB}MB")
            return content
    except httpx.TimeoutException:
        raise PDFDownloadError(url, "Download timed out")
    except httpx.HTTPStatusError as e:
        raise PDFDownloadError(url, f"HTTP {e.response.status_code}")
    except PDFDownloadError:
        raise
    except Exception as e:
        raise PDFDownloadError(url, str(e))


def _extract_text_from_bytes(pdf_bytes: bytes) -> str:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parts = []
        for page_num, page in enumerate(doc):
            page_text = page.get_text()
            if page_text.strip():
                parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
        doc.close()
        return "\n\n".join(parts)
    except Exception as e:
        raise PDFExtractionError(f"PyMuPDF extraction failed: {e}")
