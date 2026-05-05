"""Custom exceptions for the AI analysis pipeline."""


class PDFExtractionError(Exception):
    def __init__(self, message: str = "Failed to extract text from PDF"):
        self.message = message
        super().__init__(self.message)


class PDFDownloadError(Exception):
    def __init__(self, url: str, reason: str = ""):
        self.message = f"Failed to download PDF from {url}"
        if reason:
            self.message += f": {reason}"
        super().__init__(self.message)


class LLMServiceError(Exception):
    def __init__(self, message: str = "LLM service encountered an error"):
        self.message = message
        super().__init__(self.message)


class LLMResponseParsingError(Exception):
    def __init__(self, message: str = "Failed to parse LLM response"):
        self.message = message
        super().__init__(self.message)


class AnalysisNotFoundError(Exception):
    def __init__(self, claim_id: str):
        self.message = f"No analysis found for claim: {claim_id}"
        super().__init__(self.message)


class DraftNotFoundError(Exception):
    def __init__(self, claim_id: str):
        self.message = f"No draft response found for claim: {claim_id}"
        super().__init__(self.message)
