import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@repo/ui";

export default function PoolsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow bg-gray-50">
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Creator Pools</h1>
            <p className="text-lg text-gray-600">
              Explore and participate in creator reward pools.
            </p>
          </div>

          <Card className="p-8 text-center">
            <CardContent className="space-y-4">
              <p className="text-gray-500">
                Pool details and interactions are available through the main application.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/i/pools`}
                className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                View All Pools
              </a>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
