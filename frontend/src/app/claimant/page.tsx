"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ClaimantPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/claimant/claims");
  }, [router]);
  return null;
}
