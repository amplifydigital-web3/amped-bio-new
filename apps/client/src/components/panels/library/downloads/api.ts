import { trpcClient } from "@repo/ui";
import type { DownloadsApi } from "./store";

/** The Library's download procedures (FL-5), in the shape the store takes. */
export const downloadsApi: DownloadsApi = {
  recordDownload: input => trpcClient.library.recordDownload.mutate(input),
  markDownloaded: input => trpcClient.library.markDownloaded.mutate(input),
  removeDownload: input => trpcClient.library.removeDownload.mutate(input),
  downloadsCheck: input => trpcClient.library.downloadsCheck.mutate(input),
};
