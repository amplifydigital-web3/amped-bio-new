import { exec } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";
import { fileURLToPath } from "url";

// Import the videos list from backgrounds.ts
import { videos } from "../src/utils/backgrounds";

const execAsync = promisify(exec);

// Get current file path and directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory to save videos in temp directory
const TEMP_DIR = path.join(os.tmpdir(), "video-downloads");
const VIDEOS_DIR = path.join(TEMP_DIR, "videos");
const CONVERTED_DIR = path.join(TEMP_DIR, "converted");
const ZIP_OUTPUT = path.resolve(__dirname, "../converted-videos.zip");

const aws_s3_base = "https://amped-bio.s3.us-west-2.amazonaws.com/themes/backgrounds";

/**
 * Extract filename from URL
 */
function extractFilenameFromUrl(url: string): string {
  // Remove query parameters from URL
  const urlWithoutParams = url.split("?")[0];

  // Get filename from URL
  const parts = urlWithoutParams.split("/");
  return parts[parts.length - 1];
}

/**
 * Download a file from a URL
 */
async function downloadFile(url: string, outputPath: string): Promise<boolean> {
  console.log(`Downloading ${url} to ${outputPath}...`);

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Download file using curl
    const { stdout, stderr } = await execAsync(`curl -L "${url}" -o "${outputPath}"`);
    if (stderr) {
      console.warn(`Warning while downloading file: ${stderr}`);
    }

    console.log(`Download completed: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
    return false;
  }
}

/**
 * Validate downloaded video file
 */
async function validateVideoFile(filePath: string): Promise<boolean> {
  try {
    // Check if file exists and has size > 0
    const stats = await fs.stat(filePath);
    if (!stats.size) return false;

    // Try to probe the video file
    const { stderr } = await execAsync(`ffmpeg -v error -i "${filePath}" -f null -`);
    return !stderr; // If no errors, file is valid
  } catch {
    return false;
  }
}

/**
 * Try to download video with alternate extension
 */
async function tryAlternateExtension(videoName: string): Promise<string | null> {
  const baseFileName = videoName.replace(/\.(mp4|mov)$/, "");
  const currentExt = path.extname(videoName).toLowerCase();
  const altExt = currentExt === ".mp4" ? ".mov" : ".mp4";

  const altFileName = `${baseFileName}${altExt}`;
  const altUrl = `${aws_s3_base}/${altFileName}`;
  const outputPath = path.join(VIDEOS_DIR, altFileName);

  console.log(`Trying alternate extension: ${altUrl}`);

  const success = await downloadFile(altUrl, outputPath);
  if (success && (await validateVideoFile(outputPath))) {
    console.log(`Successfully downloaded with alternate extension: ${altFileName}`);
    return outputPath;
  }

  return null;
}

/**
 * Convert video to MP4 format
 */
async function convertToMP4(inputPath: string, outputPath: string): Promise<boolean> {
  console.log(`Converting ${inputPath} to MP4...`);

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const { stderr } = await execAsync(
      `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k "${outputPath}" -y`
    );

    if (stderr && !stderr.includes("frame=")) {
      console.warn(`Warning during conversion: ${stderr}`);
    }

    // Validate the conversion was successful
    if (await validateVideoFile(outputPath)) {
      console.log(`Successfully converted to MP4: ${outputPath}`);
      return true;
    } else {
      console.error(`Conversion failed validation: ${outputPath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error converting ${inputPath} to MP4:`, error);
    return false;
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
 * Main function
 */
async function main() {
  const successfulDownloads: { original: string; path: string }[] = [];
  const successfulConversions: { name: string; path: string }[] = [];
  const failedDownloads: { name: string; url: string }[] = [];
  const failedConversions: { name: string; path: string }[] = [];

  try {
    // Create necessary directories
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(VIDEOS_DIR, { recursive: true });
    await fs.mkdir(CONVERTED_DIR, { recursive: true });
    console.log("Temporary directories created");

    // Filter to include only video items
    const videoItems = videos.filter(video => video.type === "video");
    console.log(`Found ${videoItems.length} videos to process`);

    // Process videos in batches of parallel operations
    const BATCH_SIZE = 3; // Process 3 videos at once to avoid overwhelming the system
    const videoBatches = [];

    // Group videos into batches for parallel processing
    for (let i = 0; i < videoItems.length; i += BATCH_SIZE) {
      videoBatches.push(videoItems.slice(i, i + BATCH_SIZE));
    }

    console.log(`Split processing into ${videoBatches.length} batches of ${BATCH_SIZE}`);

    // Process each batch in parallel
    for (const [batchIndex, batch] of videoBatches.entries()) {
      console.log(`\nProcessing batch ${batchIndex + 1}/${videoBatches.length}...`);

      // Start all video processes in this batch in parallel
      const processingPromises = batch.map(async video => {
        const originalFileName = extractFilenameFromUrl(video.value);
        const baseFileName = originalFileName.replace(/\.(mp4|mov)$/, "");
        const originalExt = path.extname(originalFileName).toLowerCase();
        const outputFileName = `${baseFileName}.mp4`;

        const originalPath = path.join(VIDEOS_DIR, originalFileName);
        const outputPath = path.join(CONVERTED_DIR, outputFileName);

        try {
          console.log(`\nProcessing video: ${video.label} (${originalFileName})`);

          // Try to download the original file
          let downloadPath = originalPath;
          let downloadSuccess = await downloadFile(video.value, originalPath);
          let isValid = downloadSuccess && (await validateVideoFile(originalPath));

          // If original download failed or is invalid, try alternate extension
          if (!isValid) {
            console.log("Original file download failed or invalid, trying alternate extension...");
            const altPath = await tryAlternateExtension(originalFileName);
            if (altPath) {
              downloadPath = altPath;
              isValid = true;
              downloadSuccess = true;
            }
          }

          // If download was successful
          if (downloadSuccess && isValid) {
            successfulDownloads.push({ original: originalFileName, path: downloadPath });

            // Convert to MP4
            const conversionSuccess = await convertToMP4(downloadPath, outputPath);

            if (conversionSuccess) {
              successfulConversions.push({ name: outputFileName, path: outputPath });
              console.log(`✓ Successfully processed: ${video.label}`);
            } else {
              failedConversions.push({ name: outputFileName, path: downloadPath });
              console.error(`✕ Conversion failed for: ${outputFileName}`);
            }
          } else {
            failedDownloads.push({ name: originalFileName, url: video.value });
            console.error(`✕ Download failed for: ${originalFileName} (${video.value})`);
          }

          return { downloadSuccess, conversionSuccess: downloadSuccess && isValid };
        } catch (error) {
          console.error(`✕ Error processing ${originalFileName} (${video.value}):`, error);
          failedDownloads.push({ name: originalFileName, url: video.value });
          return { downloadSuccess: false, conversionSuccess: false };
        }
      });

      // Wait for all videos in this batch to complete
      await Promise.all(processingPromises);
    }

    // Create zip file with all successfully converted videos
    if (successfulConversions.length > 0) {
      await createZipFile(CONVERTED_DIR, ZIP_OUTPUT);
    }

    // Display summary
    console.log("\n=== Summary ===");
    console.log(`\nSuccessfully downloaded (${successfulDownloads.length}):`);
    successfulDownloads.forEach(({ original }, index) => {
      console.log(`${index + 1}. ${original}`);
    });

    console.log(`\nSuccessfully converted to MP4 (${successfulConversions.length}):`);
    successfulConversions.forEach(({ name }, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    if (failedDownloads.length > 0) {
      console.log(`\nFailed downloads (${failedDownloads.length}):`);
      failedDownloads.forEach(({ name, url }, index) => {
        console.log(`${index + 1}. ${name} - URL: ${url}`);
      });
    }

    if (failedConversions.length > 0) {
      console.log(`\nFailed conversions (${failedConversions.length}):`);
      failedConversions.forEach(({ name }, index) => {
        console.log(`${index + 1}. ${name}`);
      });
    }

    console.log(`\nZip file with converted videos: ${ZIP_OUTPUT}`);
    console.log("\nProcessing completed!");
  } catch (error) {
    console.error("Error executing the script:", error);
  } finally {
    // Clean up temporary directory
    try {
      await fs.rmdir(TEMP_DIR, { recursive: true });
      console.log(`Temporary directory removed: ${TEMP_DIR}`);
    } catch (error) {
      console.error("Error removing temporary directory:", error);
    }
  }
}

// Execute the script
main().catch(console.error);
