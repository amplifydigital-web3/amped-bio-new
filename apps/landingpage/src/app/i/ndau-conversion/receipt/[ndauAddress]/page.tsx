"use client";

import { useEffect, useState, use } from "react";
import { trpc } from "@/lib/trpc";
import { NDAU_TO_REVO_RATE, NDAU_GROUP_LABELS, getNdauPdfPath } from "@repo/constants";
import { Button } from "@repo/ui";
import { useChainId } from "wagmi";
import { getCurrencySymbol } from "@repo/web3";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Copy,
  Wallet,
  Clock,
  FileText,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { PublicHeader } from "@/components/layout/PublicHeader";

type ProofStep = {
  num: number;
  label: string;
  description: string;
  completed: boolean;
  timestamp?: number;
};

// The NDAU blockchain is unavailable, so send conversion portal visitors to
// the official conversion instructions on ndau.io instead of the in-app flow.
const NDAU_CONVERSION_REDIRECT_URL = "https://ndau.io/knowledge-base/ndau-to-revo-conversions/";

export default function NdauConversionReceiptPage({
  params,
}: {
  params: Promise<{ ndauAddress: string }>;
}) {
  useEffect(() => {
    window.location.replace(NDAU_CONVERSION_REDIRECT_URL);
  }, []);
  return null;
}
