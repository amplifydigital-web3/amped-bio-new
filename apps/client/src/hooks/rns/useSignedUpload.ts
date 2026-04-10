import { useSignMessage, useAccount } from "wagmi";
import { z } from "zod";

const PresignResponseSchema = z.object({
  urls: z.array(
    z.object({
      field: z.enum(["avatar", "banner"]),
      uploadUrl: z.string().url(),
      fileUrl: z.string().url(),
    })
  ),
});

interface UploadUrls {
  avatar?: string;
  banner?: string;
}

export function useSignedUpload() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const uploadAll = async (
    name: string,
    fields: { avatar?: File; banner?: File }
  ): Promise<UploadUrls> => {
    // Build the files array from whichever fields are provided
    const files = (Object.entries(fields) as [string, File | undefined][])
      .filter((entry): entry is [string, File] => entry[1] != null)
      .map(([field, file]) => ({ field, fileType: file.type }));

    if (files.length === 0) return {};

    const timestamp = Math.floor(Date.now() / 1000);
    const fieldsLine = files.map(f => `${f.field}:${f.fileType}`).join(", ");

    const message = [
      `Upload profile for ${name}`,
      `Fields: ${fieldsLine}`,
      `Address: ${address}`,
      `Timestamp: ${timestamp}`,
    ].join("\n");

    const signature = await signMessageAsync({ message });

    const res = await fetch(`${import.meta.env.VITE_RNS_API_URL}/api/upload/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        address,
        timestamp,
        signature,
        files,
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error ?? "Failed to get upload URLs");
    }

    const json = await res.json();
    const { urls } = PresignResponseSchema.parse(json);

    await Promise.all(
      urls.map(({ field, uploadUrl }) => {
        const file = fields[field];
        if (!file) throw new Error(`Missing file for ${field}`);
        return fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        }).then(res => {
          if (!res.ok) throw new Error(`Failed to upload ${field}`);
        });
      })
    );

    return Object.fromEntries(urls.map(({ field, fileUrl }) => [field, fileUrl])) as UploadUrls;
  };

  return { uploadAll };
}
