// image.ts
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;

// Type definitions
export interface SanityImageAsset {
  _type: 'image';
  asset: {
    _type: 'reference';
    _ref: string;
  };
  alt?: string;
  caption?: string;
}

// API response types
interface DalleResponse {
  data: Array<{
    url: string;
  }>;
}


interface SanityUploadResponse {
    document: {
      _id: string;
      _type: string;
      url?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }

/**
 * Generates an image using DALL-E based on the blog title
 */
export async function generateImage(title: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable.");
  }

  try {
    console.log(`🎨 Generating image for: ${title}`);
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `High-quality blog featured image for article about "${title}". Professional, modern, detailed illustration suitable for a blog post.`,
        n: 1,
        size: '1024x1024',
        response_format: 'url'
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("❌ DALL-E API Error:", errorData);
      throw new Error(`DALL-E API responded with status ${response.status}`);
    }

    const data = await response.json() as DalleResponse;
    
    if (!data.data || !data.data[0] || !data.data[0].url) {
      console.error("❌ DALL-E API returned unexpected format:", data);
      throw new Error("DALL-E API did not return an image URL");
    }
    
    console.log(`✅ Image generated successfully`);
    return data.data[0].url;
  } catch (err) {
    console.error("❌ Image generation failed:", err);
    throw new Error(`Failed to generate image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function validateImageUrl(imageUrl: string): Promise<boolean> {
    try {
      const response = await fetch(imageUrl);
      const contentType = response.headers.get('content-type');
      
      // Validate image type
      const allowedTypes = [
        'image/jpeg', 
        'image/png', 
        'image/webp', 
        'image/gif'
      ];
      
      if (!contentType || !allowedTypes.includes(contentType)) {
        console.error(`Invalid image type: ${contentType}`);
        return false;
      }
      
      // Optional: Add size check
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const fileSizeInMB = parseInt(contentLength) / (1024 * 1024);
        if (fileSizeInMB > 5) {  // Limit to 5MB
          console.error(`Image too large: ${fileSizeInMB.toFixed(2)}MB`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Image validation failed:', error);
      return false;
    }
  }

/**
 * Uploads an image to Sanity's asset store
 */
async function uploadImageToSanity(imageUrl: string, altText: string): Promise<SanityImageAsset | null> {
    try {
      // Fetch image buffer
      const imageResponse = await fetch(imageUrl);
      
      // Validate response
      if (!imageResponse.ok) {
        console.error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
        return null;
      }
  
      const imageBuffer = await imageResponse.buffer();
  
      // Upload directly using buffer
      const uploadResponse = await fetch(
        `https://${SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/assets/images/${SANITY_DATASET}`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Authorization': `Bearer ${SANITY_API_TOKEN}`,
            'X-Sanity-Image-Filename': `${altText.replace(/[^a-z0-9]/gi, '_')}.jpg`
          },
          body: imageBuffer
        }
      );
  
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.warn('Sanity upload failed:', errorText);
        return null;
      }
  
      // Type-safe parsing of upload result
      const uploadResult = await uploadResponse.json() as SanityUploadResponse;
      
      // Validate essential fields
      if (!uploadResult.document || !uploadResult.document._id) {
        console.error('Invalid Sanity upload response:', uploadResult);
        return null;
      }
  
      return {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: uploadResult.document._id
        },
        alt: altText,
        caption: `Image for ${altText}`
      };
    } catch (error) {
      console.error('Image upload process failed:', error);
      return null;
    }
  }
  
  // Type guard for additional runtime type checking
  function isSanityUploadResponse(obj: any): obj is SanityUploadResponse {
    return obj 
      && typeof obj === 'object'
      && obj.document 
      && typeof obj.document === 'object'
      && typeof obj.document._id === 'string';
  }

/**
 * Generates and uploads an image for a blog post
 */
export async function generateAndUploadImage(title: string): Promise<SanityImageAsset | null> {
  try {
    const imageUrl = await generateImage(title);
    const imageAsset = await uploadImageToSanity(imageUrl, title);
    return imageAsset;
  } catch (err) {
    console.error(`⚠️ Image generation/upload process failed:`, err);
    // Return null instead of throwing to allow blog post creation to continue
    return null;
  }
}