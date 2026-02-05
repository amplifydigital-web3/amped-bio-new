import { prisma } from "../services/DB";
import { env } from "../env";
import { processEmailToUniqueHandle } from "./onelink-generator";
import { sendEmailVerification, sendPasswordResetEmail } from "./email/email";
import { hashPassword, verifyPassword } from "./password";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { captcha, jwt, customSession } from "better-auth/plugins";
import crypto from "crypto";
import { JWTPayload, SignJWT } from "jose";

// === jwt private key generation  ===
const pk = crypto.createPrivateKey({
  key: Buffer.from(env.JWT_PRIVATE_KEY, "utf8"),
  format: "pem",
  type: "pkcs8",
});

const pb = crypto.createPublicKey(pk);

export const JWT_KEYS = {
  alg: "RS256" as const,
  privateKey: pk,
  publicKey: pb,
  kid: crypto
    .createHash("sha256")
    .update(pb.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16), // Key ID for the JWT
  aud: env.JWT_AUDIENCE,
  iss: env.APP_ENV === "development" ? "staging-api.amped.bio" : env.API_HOST,
};

// ================ better-auth configuration ==================
export const auth = betterAuth({
  basePath: "/auth",
  trustedOrigins: [env.FRONTEND_URL],
  plugins: [
    customSession(async ({ user, session }) => {
      // Backfill handle for existing users without one
      const userHandle = (user as any).handle;
      if ((!userHandle || userHandle === "") && user.email) {
        const newHandle = await processEmailToUniqueHandle(user.email);
        await prisma.user.update({
          where: { id: parseInt(user.id) },
          data: { handle: newHandle },
        });
        (user as any).handle = newHandle;
      }

      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: parseInt(user.id) },
      });

      return {
        user: {
          ...user,
          wallet: userWallet?.address ?? null,
        },
        session,
      };
    }),
    captcha({
      provider: "google-recaptcha",
      secretKey: env.CAPTCHA_SECRET_KEY,
    }),
    jwt({
      disableSettingJwtHeader: true,
      jwt: {
        sign: async (jwtPayload: JWTPayload) => {
          return await new SignJWT(jwtPayload)
            .setIssuedAt()
            .setAudience(JWT_KEYS.aud)
            .setIssuer(JWT_KEYS.iss)
            .setProtectedHeader({
              alg: JWT_KEYS.alg,
              kid: JWT_KEYS.kid,
              typ: "JWT",
            })
            .sign(pk);
        },
      },
      jwks: {
        remoteUrl: new URL(
          "/.well-known/jwks.json",
          env.API_HOST.startsWith("http") ? env.API_HOST : `https://${env.API_HOST}`
        ).href,
        keyPairConfig: {
          alg: JWT_KEYS.alg,
        },
      },
    }),
    // oneTap(),
  ],
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  advanced: {
    database: {
      useNumberId: true,
      // generateId: options => {
      //   // Let the database auto-generate IDs for 'user' and 'users' tables
      //   if (options.model === "user" || options.model === "users") {
      //     return false;
      //   }
      //   // Generate UUIDs for all other tables
      //   return crypto.randomUUID();
      // },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user: any, context: any) => {
          if ((!user.handle || user.handle === "") && user.email) {
            user.handle = await processEmailToUniqueHandle(user.email);
          }

          if (context?.provider === "google" && context?.profile?.name && !user.name) {
            user.name = context.profile.name;
          }
        },
        after: async (user: any, context: any) => {
          const referrerId = context?.query?.referrerId;
          if (referrerId) {
            try {
              // Create referral record
              const referral = await prisma.referral.create({
                data: {
                  referrerId: parseInt(referrerId),
                  referredId: parseInt(user.id),
                },
              });

              // Get wallet addresses for both parties
              const [referrerWallet, refereeWallet] = await Promise.all([
                prisma.userWallet.findFirst({
                  where: { userId: parseInt(referrerId) },
                }),
                prisma.userWallet.findFirst({
                  where: { userId: parseInt(user.id) },
                }),
              ]);

              // Only send rewards if both parties have linked wallets
              if (referrerWallet && refereeWallet) {
                // Send rewards asynchronously (don't block user registration)
                setImmediate(async () => {
                  try {
                    // Import reward sending function dynamically
                    const { sendReferralRewards, updateReferralTxid } = await import("../services/referralRewards");

                    const result = await sendReferralRewards(
                      referrerWallet.address as `0x${string}`,
                      refereeWallet.address as `0x${string}`
                    );

                    if (result.success && result.txid) {
                      // Update referral record with transaction hash
                      await updateReferralTxid(referral.id, result.txid);
                      console.log(`Referral rewards sent successfully: ${result.txid}`);
                    } else {
                      console.error(
                        `Failed to send referral rewards: ${result.error || "Unknown error"}`
                      );
                    }
                  } catch (error) {
                    console.error("Error in referral reward background task:", error);
                  }
                });
              } else {
                console.log(
                  `Referral created but rewards not sent: ` +
                  `referrer wallet: ${referrerWallet ? "yes" : "no"}, ` +
                  `referee wallet: ${refereeWallet ? "yes" : "no"}`
                );
              }
            } catch (error) {
              console.error("Error creating referral:", error);
              // Don't throw - user registration should succeed even if referral creation fails
            }
          }
        },
      },
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    emailVerification: {
      // Required to send the verification email
      sendVerificationEmail: async ({ user, url, token }: { user: any; url: any; token: any }) => {
        console.info("Sending email verification to:", JSON.stringify({ user, url, token }));
        sendEmailVerification(user.email, token);
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 1 * 60 * 60, // 1 hour
    },
    modelName: "User",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      name: "name",
      handle: "handle",
      role: "role",
      image: "image",
    },
    additionalFields: {
      handle: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      image: {
        type: "string",
        required: false,
        defaultValue: null,
      },
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
    modelName: "Account",
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    sendResetPassword: async ({ user, url, token }: { user: any; url: any; token: any }) => {
      console.info("Sending password reset email to:", JSON.stringify({ user, url, token }));
      await sendPasswordResetEmail(user.email, token);
    },
  },
  socialProviders: {
    google: {
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      clientId: env.GOOGLE_CLIENT_ID,
    },
  },
});
