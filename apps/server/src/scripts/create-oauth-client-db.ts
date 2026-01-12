import { prisma } from "../services/DB";
import { createHash } from "crypto";

async function hashClientSecret(secret: string): Promise<string> {
  return createHash("sha256").update(secret).digest("hex");
}

async function createOAuthClient() {
  const clientSecret = "test-client-secret-" + Math.random().toString(36).substring(7);
  const hashedSecret = await hashClientSecret(clientSecret);

  const client = await prisma.oauthClient.create({
    data: {
      clientId: "test-client-" + Math.random().toString(36).substring(7),
      clientSecret: hashedSecret,
      name: "Test OAuth Client",
      redirectUris: JSON.stringify(["http://localhost:5173/callback"]),
      postLogoutRedirectUris: JSON.stringify(["http://localhost:5173"]),
      scopes: "openid profile email offline_access",
      skipConsent: false,
      disabled: false,
      userId: null,
    },
  });

  console.log("OAuth Client created successfully!");
  console.log("Client ID:", client.clientId);
  console.log("Client Secret (SAVE THIS):", clientSecret);
  console.log(
    "\nNote: The secret in the database is hashed. Store the plain text secret above securely."
  );
}

createOAuthClient()
  .catch(error => {
    console.error("Failed to create OAuth client:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
