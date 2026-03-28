"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Redirect all claimants from the old dashboard route to the new claimant portal
export default function ClaimantDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/claimant/claims");
  }, [router]);
  return null;
}
