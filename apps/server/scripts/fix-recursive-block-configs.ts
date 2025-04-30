/**
 * Block Configuration Repair Script
 * ================================
 *
 * Purpose:
 * This script fixes a data integrity issue in the 'blocks' table where configuration objects
 * were recursively nested inside themselves. The issue occurred because proper schema validation
 * wasn't in place, causing complete block objects to be inserted into the 'config' field repeatedly,
 * creating structures like config.config.config...
 *
 * How it works:
 * 1. The script scans all blocks in the database
 * 2. It identifies blocks with recursive config entries
 * 3. For each problematic block, it extracts the deepest valid configuration
 * 4. It determines the correct block type based on the configuration content
 * 5. In update mode, it saves the corrected configuration back to the database
 *
 * Usage:
 * - Run in simulation mode (no database changes):
 *   npx ts-node server/scripts/fix-recursive-block-configs.ts
 *
 * - Run in update mode (fixes database records):
 *   npx ts-node server/scripts/fix-recursive-block-configs.ts update
 *
 * Output:
 * The script provides detailed logs showing each affected block's ID, type,
 * original recursive configuration, and the corrected configuration.
 *
 * Date: April 11, 2025
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Define block types and configuration schemas
const allowedPlatforms = [
  "twitter",
  "telegram",
  "discord",
  "instagram",
  "lens",
  "facebook",
  "tiktok",
  "element",
  "github",
  "linkedin",
  "medium",
  "mirror",
  "warpcast",
  "zora",
  "opensea",
  "youtube",
  "patreon",
  "onlyfans",
  "appstore",
  "playstore",
  "email",
  "document",
  "custom",
] as const;

const mediaPlataforms = [
  "spotify",
  "instagram",
  "youtube",
  "twitter",
  "token-price",
  "nft-collection",
  "uniswap",
  "substack",
  "creator-pool",
] as const;

// Function to find the deepest configuration (in case of nested configurations)
function findDeepestConfig(config: any): any {
  if (!config || typeof config !== "object") {
    return config;
  }

  if (config.config) {
    return findDeepestConfig(config.config);
  }

  return config;
}

// Function to determine the block type based on its configuration
function determineBlockType(config: any): "link" | "media" | "text" | "unknown" {
  if (!config || typeof config !== "object") {
    return "unknown";
  }

  // Check if it's a link block
  if (config.platform && config.url && config.label) {
    // Check if the platform is in the allowedPlatforms for links
    if (allowedPlatforms.includes(config.platform)) {
      return "link";
    }
  }

  // Check if it's a media block
  if (config.platform && config.url) {
    // Check if it's one of the media platforms
    if (mediaPlataforms.includes(config.platform)) {
      return "media";
    }
  }

  // Check if it's a text block
  if (config.content && typeof config.content === "string") {
    return "text";
  }

  return "unknown";
}

// Main function to fix blocks with recursive configurations
async function fixRecursiveConfigs(dryRun = false) {
  console.log("Starting analysis and correction of recursive configurations in blocks...");
  console.log(`Mode: ${dryRun ? "Simulation (log only)" : "Correction (updates database)"}`);

  try {
    // Fetch all blocks
    const blocks = await prisma.block.findMany();
    console.log(`Total blocks found: ${blocks.length}`);

    // Counters for problematic and updated blocks
    let problematicBlocks = 0;
    let updatedBlocks = 0;

    for (const block of blocks) {
      const { id, user_id, type, config } = block;

      // Check if the config is an object and contains a config property
      if (config && typeof config === "object" && "config" in config) {
        problematicBlocks++;

        // Find the deepest nested configuration
        const deepestConfig = findDeepestConfig(config);

        // Determine the type based on the configuration content
        const detectedType = determineBlockType(deepestConfig);

        console.log("\n=============================================");
        console.log(`Block ID: ${id}, User ID: ${user_id}`);
        console.log(`Declared type: ${type}, Detected type: ${detectedType}`);
        console.log(
          "Original configuration (recursive):",
          JSON.stringify(config, null, 2).substring(0, 200) + "..."
        );
        console.log("Corrected configuration:", JSON.stringify(deepestConfig, null, 2));

        // Update the database if not a simulation
        if (!dryRun) {
          try {
            await prisma.block.update({
              where: { id },
              data: { config: deepestConfig },
            });
            console.log(`✅ Block ${id} successfully updated`);
            updatedBlocks++;
          } catch (updateError) {
            console.error(`❌ Error updating block ${id}:`, updateError);
          }
        }
      }
    }

    console.log("\n==============================================");
    console.log("Analysis completed.");
    console.log(`Blocks with recursive configurations: ${problematicBlocks} of ${blocks.length}`);

    if (!dryRun) {
      console.log(`Blocks successfully updated: ${updatedBlocks} of ${problematicBlocks}`);
    } else {
      console.log("Simulation completed. No changes were made to the database.");
      console.log('To execute the corrections, run the script with the "update" argument.');
    }
  } catch (error) {
    console.error("Error processing blocks:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Determine if it's a simulation or actual update
const args = process.argv.slice(2);
const shouldUpdate = args.includes("update");

// Execute the script
fixRecursiveConfigs(!shouldUpdate).then(() => {
  console.log("Script finished.");
});
