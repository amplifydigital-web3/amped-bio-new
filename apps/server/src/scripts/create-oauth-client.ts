async function createOAuthClient() {
  const response = await fetch("http://localhost:24300/oauth2/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Test Client",
      redirectUris: ["http://localhost:5173/callback"],
      postLogoutRedirectUris: ["http://localhost:5173"],
      scopes: "openid profile email offline_access",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to create OAuth client:", error);
    process.exit(1);
  }

  const client = await response.json();
  console.log("OAuth Client created successfully!");
  console.log("Client ID:", client.clientId);
  console.log("Client Secret:", client.clientSecret);
  console.log("\nSave these credentials securely. The client secret is only shown once.");
}

createOAuthClient();
