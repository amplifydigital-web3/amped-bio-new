/**
 * PR fix/uploads-sdk-v3-validation. S3Service on AWS SDK v3 only:
 * size limits in bytes, collection image rules, and upload URLs bound to the
 * declared size. See docs/fixes/uploads-sdk-v3-validation.md.
 */
import { describe, it, expect, vi } from "vitest";

// The service tests its connection when it is constructed. Answer locally.
vi.mock("@aws-sdk/client-s3", async importOriginal => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  class S3Client extends actual.S3Client {
    override async send(): Promise<any> {
      return { Buckets: [] };
    }
  }
  return { ...actual, S3Client };
});

import { s3Service } from "../services/S3Service";
import { env } from "../env";

const MB = 1024 * 1024;

describe("S3Service.validateFile", () => {
  it("compares the size in bytes with the MB limit", () => {
    const limit = env.UPLOAD_LIMIT_PROFILE_PHOTO_MB * MB;
    expect(s3Service.validateFile("image/png", "profiles", limit).valid).toBe(true);
    expect(s3Service.validateFile("image/png", "profiles", limit + 1).valid).toBe(false);
  });

  it("applies the collection image limit to the category bucket", () => {
    const limit = env.UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB * MB;
    expect(s3Service.validateFile("image/png", "category", limit).valid).toBe(true);
    expect(s3Service.validateFile("image/png", "category", limit + 1).valid).toBe(false);
  });

  it.each([0, -5, 1.5])("refuses a size that is not a positive whole number (%s)", size => {
    expect(s3Service.validateFile("image/png", "profiles", size).valid).toBe(false);
  });

  it("still refuses a type outside the category", () => {
    expect(s3Service.validateFile("video/mp4", "profiles", 1000).valid).toBe(false);
  });
});

describe("S3Service upload URLs", () => {
  it("binds the user upload URL to the declared type and size", async () => {
    const { presignedUrl, fileKey } = await s3Service.getPresignedUploadUrl(
      "profiles",
      7,
      "image/png",
      "png",
      4096
    );
    const url = new URL(presignedUrl);
    expect(fileKey).toMatch(/^profiles\/\d+-[0-9a-f]{16}-7\.png$/);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
  });

  it("refuses an upload URL above the category limit", async () => {
    const tooBig = env.UPLOAD_LIMIT_POOL_IMAGE_MB * MB + 1;
    await expect(
      s3Service.getPresignedUploadUrl("pool-images", 7, "image/png", "png", tooBig)
    ).rejects.toThrow(/exceeds the maximum/);
  });

  it("signs admin collection images with the collection limit, not the avatar limit", async () => {
    // 1.5 MB is over the avatar limit (1 MB) and under the collection limit (2 MB).
    const size = Math.round(1.5 * MB);
    const { presignedUrl } = await s3Service.getServerPresignedUploadUrl(
      "category",
      "image/png",
      "png",
      size,
      3
    );
    expect(new URL(presignedUrl).searchParams.get("X-Amz-SignedHeaders")).toContain(
      "content-length"
    );
  });
});
