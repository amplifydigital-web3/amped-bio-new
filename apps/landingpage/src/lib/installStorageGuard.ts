// Side effect module: import it first so the guard runs before any module
// that reads storage at import time (QA-010, see storageGuard.ts).
import { installStorageGuard } from "./storageGuard";

installStorageGuard();
