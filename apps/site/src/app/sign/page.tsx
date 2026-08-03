import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card, CardContent } from "@ampedbio/ui";

export default function SignPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-grow flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md p-8">
          <CardContent className="space-y-4 text-center">
            <h1 className="text-xl font-semibold text-gray-800">Sign</h1>
            <p className="text-gray-600">
              Signing functionality is available through the main application.
            </p>
            <a
              href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/sign`}
              className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Open Sign Page
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
