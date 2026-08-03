"use client";

import { use } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@ampedbio/ui";

export default function PoolDetailsPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow bg-gray-50">
        <div className="max-w-4xl mx-auto py-12 px-4">
          <Card className="p-8 text-center">
            <CardContent className="space-y-4">
              <h1 className="text-2xl font-semibold text-gray-900">Pool Details</h1>
              <p className="text-gray-500">
                Pool details and interactions are available through the main application.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/i/pools/${address}`}
                className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                View Pool Details
              </a>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
