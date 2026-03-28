from typing import Optional
from pydantic import BaseModel


class SubmitClaimRequest(BaseModel):
    patientFName: str
    patientLName: str
    patientDOB: str
    policyName: str
    treatmentType: str
    medicalReport: str
    supportingDocuments: Optional[str] = None


class ClaimResponse(BaseModel):
    claimId: str
    claimantID: str
    examinerID: Optional[str]
    patientFName: str
    patientLName: str
    patientDOB: str
    policyName: str
    treatmentType: Optional[str]
    medicalReport: str
    supportingDocuments: Optional[str]
    status: str
    submittingTime: Optional[str]
