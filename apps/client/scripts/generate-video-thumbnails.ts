import { exec } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";
import { fileURLToPath } from "url";

// Import the videos list from backgrounds.ts
// Note: This script needs to be compiled with ts-node to import .ts files
import { videos } from "../src/utils/backgrounds";

const execAsync = promisify(exec);

// Get current file path and directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory to save thumbnails in temp directory
const TEMP_DIR = path.join(os.tmpdir(), "video-thumbnails");
const THUMBNAILS_DIR = path.join(TEMP_DIR, "thumbnails");
const ZIP_OUTPUT = path.resolve(__dirname, "../video-thumbnails.zip");

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
 * Generate a thumbnail from a video
 */
async function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  console.log(`Generating thumbnail for ${videoPath}...`);

  try {
    // Validate video file first
    if (!(await validateVideoFile(videoPath))) {
      throw new Error("Invalid or corrupted video file");
    }

    // Try different methods in sequence until one works
    const commands = [
      // Method 1: Simple frame extraction
      `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 "${outputPath}" -y`,

      // Method 2: With pixel format conversion
      `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -pix_fmt yuv420p "${outputPath}" -y`,

      // Method 3: Force format and codec
      `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -f image2 -c:v mjpeg "${outputPath}" -y`,

      // Method 4: With scaling and format forcing
      `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=640:-2" -f image2 "${outputPath}" -y`,
    ];

    for (const [index, command] of commands.entries()) {
      try {
        console.log(`Attempting method ${index + 1}...`);
        await execAsync(command);

        // Verify the thumbnail was created
        if (await fs.stat(outputPath).catch(() => false)) {
          console.log(`Thumbnail created successfully using method ${index + 1}`);
          return;
        }
      } catch {
        console.log(`Method ${index + 1} failed, trying next method...`);
        continue;
      }
    }

    throw new Error("All thumbnail generation methods failed");
  } catch (error) {
    console.error(`Error generating thumbnail for ${videoPath}:`, error);
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
 * Main function
 */
async function main() {
  const generatedThumbnails: string[] = [];
  const failedThumbnails: { name: string; url: string }[] = [];

  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    console.log(`Temporary directory created: ${TEMP_DIR}`);
    console.log(`Thumbnails directory created: ${THUMBNAILS_DIR}`);

    // Filter to include only video items
    const videoItems = videos.filter(video => video.type === "video");
    console.log(`Found ${videoItems.length} videos to process`);

    // Process videos in batches of parallel operations
    const BATCH_SIZE = 5; // Process 5 videos at once
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
        const fileName = extractFilenameFromUrl(video.value);
        const fileNameWithoutExt = fileName.replace(/\.(mp4|mov)$/, "");
        const thumbnailName = `${fileNameWithoutExt}_thumbnail.jpg`;

        const localVideoPath = path.join(TEMP_DIR, fileName);
        const localThumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);

        try {
          console.log(`Processing video: ${video.label} (${fileName})`);
          await downloadFile(video.value, localVideoPath);
          await generateThumbnail(localVideoPath, localThumbnailPath);

          // Clean up video file after generating thumbnail
          await fs.unlink(localVideoPath).catch(() => {});

          console.log(`✓ Successfully processed: ${video.label}`);
          return { success: true, name: thumbnailName };
        } catch (error) {
          console.error(`✕ Error processing ${fileName} (${video.value}):`, error);
          return { success: false, name: fileName, url: video.value };
        }
      });

      // Wait for all videos in this batch to complete
      const results = await Promise.all(processingPromises);

      // Collect results
      results.forEach(result => {
        if (result.success) {
          generatedThumbnails.push(result.name);
        } else {
          failedThumbnails.push({ name: result.name, url: result.url });
        }
      });
    }

    // Create zip file
    await createZipFile(THUMBNAILS_DIR, ZIP_OUTPUT);

    // Display summary
    console.log("\n=== Summary ===");
    console.log(`\nSuccessfully generated (${generatedThumbnails.length}):`);
    generatedThumbnails.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });

    if (failedThumbnails.length > 0) {
      console.log(`\nFailed thumbnails (${failedThumbnails.length}):`);
      failedThumbnails.forEach(({ name, url }, index) => {
        console.log(`${index + 1}. ${name} - URL: ${url}`);
      });
    }

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
