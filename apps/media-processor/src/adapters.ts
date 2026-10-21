/**
 * CSAM matcher and adult classifier adapters (spec 3.5 steps 3.2 and 3.6,
 * decisions 11 and 13). Each takes the item and the frames to check: image
 * renditions, document page renders, or signed Stream thumbnail URLs for video.
 *
 * Beta ships:
 *   CSAM_MATCHER=none   logs that the step ran. PhotoDNA (`photodna`) is added
 *                       before general availability; it is a launch gate.
 *   CLASSIFIER=mock     staging: a title containing "qa-explicit" is explicit.
 *   CLASSIFIER=none     no vendor yet. With CLASSIFIER_REQUIRED=true (production)
 *                       every image and video is HELD for a reviewer, so nothing
 *                       unclassified is published (fail closed).
 * A vendor adapter implements the same interface and is selected by the var.
 */
import type { ContentJob } from "@repo/constants/src/contentJob";

/** A frame to check: an R2 key in the content bucket, or a signed https URL. */
export type Frame = { key: string } | { url: string };

export type CsamResult = { match: false } | { match: true; reference: string };
export type ClassifierResult =
  | { verdict: "safe" }
  | { verdict: "explicit"; label: string }
  | { verdict: "unavailable" };

export interface CsamMatcher {
  readonly name: string;
  match(job: ContentJob, frames: Frame[]): Promise<CsamResult>;
}

export interface Classifier {
  readonly name: string;
  classify(job: ContentJob, frames: Frame[]): Promise<ClassifierResult>;
}

export const MOCK_EXPLICIT_MARKER = "qa-explicit";

export function createCsamMatcher(name: string): CsamMatcher {
  if (name !== "none") throw new Error(`CSAM_MATCHER ${name} is not available in this build`);
  return {
    name: "none",
    async match(job, frames) {
      console.log(
        JSON.stringify({
          event: "processor.csam_noop",
          publicId: job.publicId,
          frames: frames.length,
        })
      );
      return { match: false };
    },
  };
}

export function createClassifier(name: string): Classifier {
  if (name === "mock") {
    return {
      name: "mock",
      async classify(job) {
        return job.title.toLowerCase().includes(MOCK_EXPLICIT_MARKER)
          ? { verdict: "explicit", label: "mock:explicit" }
          : { verdict: "safe" };
      },
    };
  }
  if (name === "none") {
    return {
      name: "none",
      async classify() {
        return { verdict: "unavailable" };
      },
    };
  }
  throw new Error(`CLASSIFIER ${name} is not available in this build`);
}
