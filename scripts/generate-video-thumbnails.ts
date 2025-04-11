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

// Directory to save thumbnails - updating to src/assets/thumbnails
const OUTPUT_DIR = path.resolve(__dirname, "../src/assets/thumbnails");
const TEMP_DIR = path.join(os.tmpdir(), "video-thumbnails");

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
    const { stdout, stderr } = await execAsync(`curl -L "${url}" -o "${outputPath}"`);
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
 * Generate a thumbnail from a video
 */
async function generateThumbnail(videoPath: string, outputPath: string): Promise<void> {
  console.log(`Generating thumbnail for ${videoPath}...`);

  try {
    // Use ffmpeg to extract a frame from the video
    const command = `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -filter:v scale="640:-1" -quality 95 "${outputPath}" -y`;
    await execAsync(command);

    console.log(`Thumbnail created at ${outputPath}`);
  } catch (error) {
    console.error(`Error generating thumbnail for ${videoPath}:`, error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Create directories
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Temporary directory created: ${TEMP_DIR}`);
    console.log(`Output directory created: ${OUTPUT_DIR}`);

    // Process each video from the array
    for (const video of videos) {
      if (video.type !== "video") continue;

      // Extract filename
      const fileName = extractFilenameFromUrl(video.value);
      const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf("."));

      // Define paths
      const localVideoPath = path.join(TEMP_DIR, fileName);
      const localThumbnailPath = path.join(OUTPUT_DIR, `${fileNameWithoutExt}_thumbnail.jpg`);

      try {
        // 1. Download video
        await downloadFile(video.value, localVideoPath);

        // 2. Generate thumbnail
        await generateThumbnail(localVideoPath, localThumbnailPath);

        // 3. Clean up temporary file
        await fs.unlink(localVideoPath);

        console.log(`Successfully processed: ${video.label} -> ${localThumbnailPath}`);
      } catch (error) {
        console.error(`Error processing ${fileName}:`, error);
        // Continue with the next video
      }
    }

    console.log("Processing completed!");
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
