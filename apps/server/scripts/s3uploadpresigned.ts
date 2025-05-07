import { S3Client } from '@aws-sdk/client-s3';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

// Configuration - Using the same values as in the server env
const config = {
  region: 'us-west-2',
  accessKeyId: ' ',
  secretAccessKey: ' ',
  bucketName: 'amped-bio',
};

// Define file path relative to this script
const IMAGE_PATH = path.join(__dirname, 'test.png');

/**
 * Initialize S3 client
 */
function initializeS3Client() {
  // Configure AWS SDK
  AWS.config.update({
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  return new AWS.S3();
}

/**
 * Generate a unique file key
 */
function generateUniqueFileKey(fileExtension: string): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  return `profiles/${timestamp}-${randomString}-test.${fileExtension}`;
}

/**
 * Create a presigned URL for uploading file to S3
 */
async function createPresignedUrl(
  s3: AWS.S3,
  fileKey: string,
  contentType: string
): Promise<string> {
  console.log('Creating presigned URL for:', { fileKey, contentType });
  
  const params = {
    Bucket: config.bucketName,
    Key: fileKey,
    ContentType: contentType,
    Expires: 300, // URL expires in 5 minutes
  };

  try {
    const signedUrl = await s3.getSignedUrlPromise('putObject', params);
    console.log('Presigned URL created successfully');
    return signedUrl;
  } catch (error) {
    console.error('Error creating presigned URL:', error);
    throw error;
  }
}

/**
 * Upload file using the presigned URL
 */
async function uploadFileWithPresignedUrl(
  presignedUrl: string, 
  filePath: string, 
  contentType: string,
  fileKey: string
): Promise<void> {
  try {
    // Read file content
    const fileContent = fs.readFileSync(filePath);
    
    console.log('Uploading file...');
    console.log('- Presigned URL:', presignedUrl);
    console.log('- Content Type:', contentType);
    console.log('- File Size:', fileContent.length, 'bytes');

    // Upload file using fetch
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: fileContent,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error('Upload failed:', response.status, response.statusText);
      console.error('Response body:', responseText);
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    console.log('File uploaded successfully!');
    
    // Generate the public URL for the uploaded file
    const publicUrl = `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${fileKey}`;
    console.log('File is now available at:', publicUrl);
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Main function to run the script
 */
async function main() {
  // Check if file exists
  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`Error: File ${IMAGE_PATH} does not exist.`);
    console.log('Please place test.jpg in the scripts directory.');
    process.exit(1);
  }

  // Get file extension and content type
  const fileExtension = path.extname(IMAGE_PATH).substring(1);
  const contentType = mime.lookup(IMAGE_PATH) || 'application/octet-stream';

  // Generate a file key
  const fileKey = generateUniqueFileKey(fileExtension);
  
  console.log('File details:', {
    path: IMAGE_PATH,
    contentType,
    fileExtension,
    fileKey
  });

  try {
    // Initialize S3 client
    const s3 = initializeS3Client();
    
    // Create a presigned URL
    const presignedUrl = await createPresignedUrl(s3, fileKey, contentType);
    
    // Upload the file using the presigned URL - now passing fileKey as the fourth parameter
    await uploadFileWithPresignedUrl(presignedUrl, IMAGE_PATH, contentType, fileKey);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main();

