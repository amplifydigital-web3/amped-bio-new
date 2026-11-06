/**
 * Field encryption for Safety data at rest (adult content review 10): custodian
 * name and address, typed release names, request contacts and signatures.
 */
import { createSecretBox } from "../crypto/secretBox";
import { env } from "../../env";

export const safetyBox = createSecretBox(
  "safety-data",
  () => env.SAFETY_DATA_SECRET || env.BETTER_AUTH_SECRET,
  "SAFETY_DATA_SECRET"
);
