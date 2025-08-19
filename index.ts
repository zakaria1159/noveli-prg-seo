// index.ts
import dotenv from 'dotenv';
import { generateBlogContent } from './content.js';
import { generateAndUploadImage } from './image.js';
import { publishToSanity } from './sanity.js';
import fs from 'fs';

dotenv.config();

// Import titles from JSON file
// Note: Using dynamic import for JSON in ES modules
let titles: any[] = [];
try {
  const titlesData = fs.readFileSync('./titles.json', 'utf8');
  titles = JSON.parse(titlesData);
} catch (err) {
  console.error("❌ Error loading titles.json:", err);
  process.exit(1);
}

// Type definitions
interface TitleItem {
  title: string;
  categoryId: string;
}

/**
 * Add a delay to prevent rate limiting
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main function to generate and publish blog content
 */
async function main() {
  // Validate input
  if (!Array.isArray(titles) || !titles.length) {
    console.error("❌ No titles found in titles.json");
    process.exit(1);
  }

  // Make sure titles have the right format
  const validTitles = titles.filter((item: any) => 
    item && typeof item.title === 'string' && typeof item.categoryId === 'string'
  );

  if (validTitles.length === 0) {
    console.error("❌ No valid titles found. Each item must have 'title' and 'categoryId'");
    process.exit(1);
  }

  if (validTitles.length !== titles.length) {
    console.warn(`⚠️ Warning: ${titles.length - validTitles.length} invalid items found in titles.json`);
  }

  // Counter for statistics
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  
  console.log(`🚀 Starting blog generation for ${validTitles.length} articles...`);

  // Process each title
  for (const item of validTitles as TitleItem[]) {
    try {
      console.log(`\n📌 Processing: ${item.title}`);
      
      // Step 1: Generate blog content
      const content = await generateBlogContent(item.title);
      console.log(`✓ Content generated successfully`);
      console.log(`  SEO Title (${content.seoTitle.length} chars): ${content.seoTitle}`);
      console.log(`  Meta Description (${content.metaDescription.length} chars): ${content.metaDescription.substring(0, 40)}...`);
      console.log(`  Keywords: ${content.keywords.join(', ')}`);
      
      // Add a small delay between steps
      await delay(500);
      
      // Step 2: Generate and upload image (this won't throw errors even if it fails)
      const imageAsset = await generateAndUploadImage(item.title);
      
      // Add a small delay between steps
      await delay(500);
      
      // Step 3: Publish to Sanity
      await publishToSanity(item.title, content, item.categoryId, imageAsset || undefined);
      
      // Update success counter
      successCount++;
      
      // Add a delay between articles to avoid rate limiting
      await delay(2000);
    } catch (err) {
      failureCount++;
      if (err instanceof Error) {
        console.error(`❌ Failed to process ${item.title}:`, err.message);
      } else {
        console.error(`❌ Unknown error while processing ${item.title}:`, err);
      }
      
      // Continue with the next item rather than stopping the entire process
      await delay(1000);
      continue;
    }
  }
  
  // Print final statistics
  console.log(`\n✅ Process completed: ${successCount} articles published successfully, ${failureCount} failures.`);
}

// Run the main function
main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});