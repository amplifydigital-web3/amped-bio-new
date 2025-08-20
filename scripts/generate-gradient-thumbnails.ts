#!/usr/bin/env tsx

/**
 * Gradient Thumbnail Generator Script
 *
 * This script reads gradient images from backgrounds.ts, generates thumbnails,
 * and saves both original images and thumbnails in the same folder.
 *
 * Requirements:
 * - ImageMagick must be installed on your system
 *   - macOS: `brew install imagemagick`
 *   - Ubuntu/Debian: `sudo apt-get install imagemagick`
 *   - Windows: Install from imagemagick.org or `choco install imagemagick`
 *
 * How to run:
 * 1. Make sure ImageMagick is installed on your system
 * 2. Run the script: `npx tsx scripts/generate-gradient-thumbnails.ts`
 *
 * Output:
 * - Original images and thumbnails are saved in the same directory
 * - Each thumbnail maintains the original filename with "_thumbnail" suffix
 * - All files are archived in a zip file for convenient transfer
 */

import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { gradients } from "../apps/client/src/utils/backgrounds";
import type { Background } from "../apps/client/src/types/editor";

const execAsync = promisify(exec);

// Directory to save photos and thumbnails
const TEMP_DIR = path.join(os.tmpdir(), "gradient-thumbnails");
const GRADIENTS_DIR = path.join(TEMP_DIR, "gradients-with-thumbnails");
const ZIP_OUTPUT = path.resolve(__dirname, "../gradients-with-thumbnails.zip");

interface ProcessResult {
  success: boolean;
  name: string;
  url?: string;
}

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url: string): string {
  // Remove query parameters from URL
  const urlWithoutParams = url.split("?")[0];

  // Get filename from URL
  const parts = urlWithoutParams.split("/");
  let filename = parts[parts.length - 1];

  // If filename doesn't have an extension, add .jpg
  if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    filename += ".jpg";
  }

  return filename;
}

/**
 * Download a file from a URL
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`Downloading ${url} to ${outputPath}...`);

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Download file using curl
    const { stderr } = await execAsync(`curl -L "${url}" -o "${outputPath}"`);
    if (stderr) {
      console.error(`Warning while downloading file: ${stderr}`);
    }

    console.log(`Download completed: ${outputPath}`);
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
    throw error;
  }
}

/**
 * Validate downloaded image file
 */
async function validateImageFile(filePath: string): Promise<boolean> {
  try {
    // Check if file exists and has size > 0
    const stats = await fs.stat(filePath);
    if (!stats.size) return false;

    // Try to identify the image with imagemagick
    const { stderr } = await execAsync(`identify "${filePath}"`);
    return !stderr; // If no errors, file is valid
  } catch {
    return false;
  }
}

/**
 * Generate a thumbnail from an image
 */
async function generateThumbnail(imagePath: string, outputPath: string): Promise<void> {
  console.log(`Generating thumbnail for ${imagePath}...`);

  try {
    // Validate image file first
    if (!(await validateImageFile(imagePath))) {
      throw new Error("Invalid or corrupted image file");
    }

    // Try different methods in sequence until one works
    const commands = [
      // Method 1: Simple resize with ImageMagick
      `convert "${imagePath}" -resize 300x300 "${outputPath}"`,

      // Method 2: With quality reduction
      `convert "${imagePath}" -resize 300x300 -quality 80 "${outputPath}"`,

      // Method 3: Force format
      `convert "${imagePath}" -resize 300x300 -format jpg "${outputPath}"`,

      // Method 4: Alternative approach with thumbnail
      `convert "${imagePath}" -thumbnail 300x300 "${outputPath}"`,
    ];

    for (const [index, command] of commands.entries()) {
      try {
        console.log(`Attempting method ${index + 1}...`);
        await execAsync(command);

        // Verify the thumbnail was created
        const exists = await fs
          .stat(outputPath)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          console.log(`Thumbnail created successfully using method ${index + 1}`);
          return;
        }
      } catch (error) {
        console.log(`Method ${index + 1} failed, trying next method...`);
        continue;
      }
    }

    throw new Error("All thumbnail generation methods failed");
  } catch (error) {
    console.error(`Error generating thumbnail for ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Create a zip file from a directory
 */
async function createZipFile(sourceDir: string, outputPath: string): Promise<void> {
  console.log(`Creating zip file at ${outputPath}...`);

  try {
    await execAsync(`zip -r "${outputPath}" .`, { cwd: sourceDir });
    console.log(`Zip file created at ${outputPath}`);
  } catch (error) {
    console.error("Error creating zip file:", error);
    throw error;
  }
}

/**
 * Check if required tools are installed
 */
async function checkRequirements(): Promise<boolean> {
  try {
    // Check if ImageMagick is installed
    await execAsync("convert -version");
    console.log("✓ ImageMagick is installed");
    return true;
  } catch (error) {
    console.error("✕ ImageMagick is not installed or not in PATH");
    console.log("\nPlease install ImageMagick:");
    console.log("- macOS: brew install imagemagick");
    console.log("- Ubuntu/Debian: sudo apt-get install imagemagick");
    console.log("- Windows: Download from imagemagick.org or use choco install imagemagick");
    return false;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const downloadedGradients: string[] = [];
  const generatedThumbnails: string[] = [];
  const failedGradients: { name: string; url: string }[] = [];

  try {
    // Check requirements first
    if (!(await checkRequirements())) {
      console.error("Missing required tools. Please install them and try again.");
      return;
    }

    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(GRADIENTS_DIR, { recursive: true });
    console.log(`Temporary directory created: ${TEMP_DIR}`);
    console.log(`Gradients directory created: ${GRADIENTS_DIR}`);

    // Filter to include only image gradient items
    const gradientItems = gradients.filter(gradient => gradient.type === "image");
    console.log(`Found ${gradientItems.length} gradient images to process from backgrounds.ts`);

    // Process gradients in batches of parallel operations
    const BATCH_SIZE = 4; // Process 4 gradients at once
    const gradientBatches: Background[][] = [];

    // Group gradients into batches for parallel processing
    for (let i = 0; i < gradientItems.length; i += BATCH_SIZE) {
      gradientBatches.push(gradientItems.slice(i, i + BATCH_SIZE));
    }

    console.log(`Split processing into ${gradientBatches.length} batches of ${BATCH_SIZE}`);

    // Process each batch in parallel
    for (const [batchIndex, batch] of gradientBatches.entries()) {
      console.log(`\nProcessing batch ${batchIndex + 1}/${gradientBatches.length}...`);

      // Start all gradient processes in this batch in parallel
      const processingPromises = batch.map(async (gradient): Promise<ProcessResult> => {
        const fileName = extractFilenameFromUrl(gradient.value);
        const fileNameWithoutExt = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, "");
        const thumbnailName = `${fileNameWithoutExt}_thumbnail.jpg`;

        const localImagePath = path.join(GRADIENTS_DIR, fileName);
        const localThumbnailPath = path.join(GRADIENTS_DIR, thumbnailName);

        try {
          console.log(`Processing gradient: ${gradient.label} (${fileName})`);
          // Download gradient image
          await downloadFile(gradient.value, localImagePath);

          // Generate thumbnail
          await generateThumbnail(localImagePath, localThumbnailPath);

          console.log(`✓ Successfully processed: ${gradient.label}`);
          downloadedGradients.push(fileName);
          generatedThumbnails.push(thumbnailName);
          return { success: true, name: fileName };
        } catch (error) {
          console.error(`✕ Error processing ${fileName} (${gradient.value}):`, error);
          return { success: false, name: fileName, url: gradient.value };
        }
      });

      // Wait for all gradients in this batch to complete
      const results = await Promise.all(processingPromises);

      // Collect failed results
      results.forEach(result => {
        if (!result.success && result.url) {
          failedGradients.push({ name: result.name, url: result.url });
        }
      });
    }

    // Create zip file with both gradients and thumbnails
    await createZipFile(GRADIENTS_DIR, ZIP_OUTPUT);

    // Display summary
    console.log("\n=== Summary ===");
    console.log(`\nSuccessfully downloaded gradient images (${downloadedGradients.length}):`);
    downloadedGradients.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    console.log(`\nSuccessfully generated thumbnails (${generatedThumbnails.length}):`);
    generatedThumbnails.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    if (failedGradients.length > 0) {
      console.log(`\nFailed gradient images (${failedGradients.length}):`);
      failedGradients.forEach(({ name, url }, index) => {
        console.log(`${index + 1}. ${name} - URL: ${url}`);
      });
    }

    console.log(`\nGradients and thumbnails ZIP file: ${ZIP_OUTPUT}`);
    console.log("\nProcessing completed!");
  } catch (error) {
    console.error("Error executing the script:", error);
  } finally {
    // Keep the files in tmp directory for the user to access the ZIP files
    console.log(`\nTemporary files are available at: ${TEMP_DIR}`);
    console.log("Remember to clean up the temporary directory when you're done.");
  }
}

// Execute the script
main().catch(console.error);
