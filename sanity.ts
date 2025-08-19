// sanity.ts
import dotenv from 'dotenv';
import { BlogContent } from './content.js';
import { SanityImageAsset } from './image.js';

dotenv.config();

// Environment variables
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;
const AUTHOR_ID = process.env.AUTHOR_ID || "d9b0383e-9d69-43e0-b193-c074a40a7443";

// Type definitions
export interface PortableTextSpan {
  _type: 'span';
  text: string;
  marks?: string[];
}

export interface PortableTextBlock {
  _type: 'block';
  style: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote';
  listItem?: 'bullet' | 'number';
  level?: number;
  children: PortableTextSpan[];
  _key: string;
}

interface SanityMutationResponse {
  transactionId: string;
  results: Array<{
    id?: string;
    operation: string;
    document?: {
      _id: string;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Generate a unique key for Sanity arrays
 */
export function generateKey(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Processes bold and emphasis markers in text
 */
function processBoldAndEmphasis(text: string): PortableTextSpan[] {
  const segments: PortableTextSpan[] = [];
  let currentText = '';
  let isBold = false;
  let isItalic = false;
  
  // Simple state machine for processing text
  for (let i = 0; i < text.length; i++) {
    // Handle bold marker
    if (i < text.length - 1 && text[i] === '*' && text[i+1] === '*') {
      // Add accumulated text
      if (currentText) {
        segments.push({
          _type: 'span',
          text: currentText,
          marks: [...(isBold ? ['strong'] : []), ...(isItalic ? ['em'] : [])]
        });
        currentText = '';
      }
      
      // Toggle bold state
      isBold = !isBold;
      
      // Skip the second marker character
      i++;
      continue;
    }
    
    // Handle italic marker (single asterisk not preceded or followed by another asterisk)
    if (text[i] === '*' && 
        (i === 0 || text[i-1] !== '*') && 
        (i === text.length - 1 || text[i+1] !== '*')) {
      // Add accumulated text
      if (currentText) {
        segments.push({
          _type: 'span',
          text: currentText,
          marks: [...(isBold ? ['strong'] : []), ...(isItalic ? ['em'] : [])]
        });
        currentText = '';
      }
      
      // Toggle italic state
      isItalic = !isItalic;
      continue;
    }
    
    // Add character to current text
    currentText += text[i];
  }
  
  // Add any remaining text
  if (currentText) {
    segments.push({
      _type: 'span',
      text: currentText,
      marks: [...(isBold ? ['strong'] : []), ...(isItalic ? ['em'] : [])]
    });
  }
  
  return segments.length > 0 ? segments : [{ _type: 'span', text: '' }];
}

/**
 * Converts Markdown to Sanity Portable Text format
 */
export function markdownToPortableText(markdown: string): PortableTextBlock[] {
  // Pre-process markdown to handle potential formatting issues
  const cleanedMarkdown = markdown
    // Fix issues with headings that have formatting markers
    .replace(/\*\*H([1-6]):(.*?)\*\*/g, (_, level, content) => `\n\nH${level}:${content}\n\n`)
    // Remove excess newlines
    .replace(/\n{3,}/g, '\n\n');
  
  // Split the markdown into paragraphs
  const paragraphs = cleanedMarkdown.split('\n\n');
  
  // Process each paragraph into Sanity blocks
  const blocks = paragraphs
    .filter((p: string) => p.trim())
    .map((paragraph: string) => {
      // Process headings
      if (paragraph.startsWith('# ')) {
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'h1',
          children: processBoldAndEmphasis(paragraph.replace('# ', ''))
        } as PortableTextBlock;
      } else if (paragraph.startsWith('## ') || paragraph.match(/^H2:/i)) {
        const text = paragraph.startsWith('## ') 
          ? paragraph.replace('## ', '') 
          : paragraph.replace(/^H2:/i, '');
        
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'h2',
          children: processBoldAndEmphasis(text.trim())
        } as PortableTextBlock;
      } else if (paragraph.startsWith('### ') || paragraph.match(/^H3:/i)) {
        const text = paragraph.startsWith('### ') 
          ? paragraph.replace('### ', '') 
          : paragraph.replace(/^H3:/i, '');
        
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'h3',
          children: processBoldAndEmphasis(text.trim())
        } as PortableTextBlock;
      } else if (paragraph.startsWith('#### ') || paragraph.match(/^H4:/i)) {
        const text = paragraph.startsWith('#### ') 
          ? paragraph.replace('#### ', '') 
          : paragraph.replace(/^H4:/i, '');
        
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'h4',
          children: processBoldAndEmphasis(text.trim())
        } as PortableTextBlock;
      } else if (paragraph.startsWith('> ') || paragraph.startsWith('&gt; ')) {
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'blockquote',
          children: processBoldAndEmphasis(paragraph.replace(/^>|^&gt;/g, '').trim())
        } as PortableTextBlock;
      }
      // Handle lists
      else if (/^[\s]*[-*]\s/.test(paragraph)) {
        const listItems = paragraph.split('\n').filter((line: string) => /^[\s]*[-*]\s/.test(line));
        
        // Create a block for each list item
        return listItems.map((item: string) => ({
          _type: 'block',
          _key: generateKey(),
          style: 'normal',
          listItem: 'bullet',
          level: 1,
          children: processBoldAndEmphasis(item.replace(/^[\s]*[-*]\s+/, ''))
        } as PortableTextBlock));
      }
      // Handle numbered lists 
      else if (/^[\s]*\d+\.\s/.test(paragraph)) {
        const listItems = paragraph.split('\n').filter((line: string) => /^[\s]*\d+\.\s/.test(line));
        
        // Create a block for each numbered list item
        return listItems.map((item: string) => ({
          _type: 'block',
          _key: generateKey(),
          style: 'normal',
          listItem: 'number',
          level: 1,
          children: processBoldAndEmphasis(item.replace(/^[\s]*\d+\.\s+/, ''))
        } as PortableTextBlock));
      }
      // Regular paragraph with potential formatting
      else {
        return {
          _type: 'block',
          _key: generateKey(),
          style: 'normal',
          children: processBoldAndEmphasis(paragraph)
        } as PortableTextBlock;
      }
    });
  
  // Flatten the array to handle list items and return
  return blocks.flat();
}

/**
 * Creates a slug from a title
 */
export function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
}

/**
 * Publishes a blog post to Sanity
 */
export async function publishToSanity(
  title: string, 
  content: BlogContent, 
  categoryId: string,
  mainImage?: SanityImageAsset
): Promise<string> {
  if (!SANITY_PROJECT_ID || !SANITY_DATASET || !SANITY_API_TOKEN) {
    throw new Error("Sanity credentials are not set. Please check your environment variables.");
  }

  try {
    console.log(`📝 Publishing to Sanity: ${title}`);
    
    const now = new Date().toISOString();
    const slug = createSlug(title);
    const portableTextBody = markdownToPortableText(content.body);
    
    // Create document matching Sanity schema
    const doc = {
      _type: 'post',
      title: title,
      slug: { _type: 'slug', current: slug },
      publishedAt: now,
      excerpt: content.metaDescription,
      seoTitle: content.seoTitle,
      metaDescription: content.metaDescription,
      keywords: content.keywords,
      author: { _type: 'reference', _ref: AUTHOR_ID },
      categories: [{ 
        _type: 'reference', 
        _ref: categoryId,
        _key: generateKey()
      }],
      body: portableTextBody,
      ...(mainImage ? { mainImage } : {}) // Only include if image exists
    };

    // Log the document data (for debugging)
    console.log(`📄 Publishing document with title: "${title}" and slug: "${slug}"`);
    
    // Send the document to Sanity
    const response = await fetch(
      `https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-05-01/data/mutate/${SANITY_DATASET}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SANITY_API_TOKEN}`
        },
        body: JSON.stringify({ mutations: [{ create: doc }] })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Sanity API Error:", errorText);
      throw new Error(`Sanity API responded with status ${response.status}`);
    }

    // First try to get the response as JSON
    let result: SanityMutationResponse;
    try {
      result = await response.json() as SanityMutationResponse;
    } catch (e) {
      // If JSON parsing fails, get the response as text
      const rawResponse = await response.text();
      console.error("❌ Failed to parse Sanity response as JSON:", rawResponse);
      throw new Error("Invalid JSON response from Sanity");
    }
    
    // Handle different response formats
    let documentId = '';
    
    if (result.results && result.results.length > 0) {
      const firstResult = result.results[0];
      
      if (firstResult.id) {
        // Standard response with document ID
        documentId = firstResult.id;
      } else if (firstResult.document && firstResult.document._id) {
        // Response with document object
        documentId = firstResult.document._id;
      } else if (firstResult.operation === 'create') {
        // Alternative response format - document was created but ID not returned
        // Generate a predictable ID based on the slug
        documentId = `post.${slug}-${generateKey(8)}`;
        console.log(`ℹ️ Document created but no ID returned. Using generated ID: ${documentId}`);
      } else {
        console.warn("⚠️ Unexpected Sanity response format:", result);
        // Use a fallback ID
        documentId = `post.unknown-${generateKey(8)}`;
      }
    } else {
      console.warn("⚠️ No results in Sanity response:", result);
      if (result.transactionId) {
        // At least we have a transaction ID
        documentId = `post.transaction-${result.transactionId}`;
      } else {
        throw new Error("Could not determine document ID from Sanity response");
      }
    }
    
    console.log(`✅ Published to Sanity (ID: ${documentId})`);
    return documentId;
  } catch (err) {
    console.error("❌ Sanity publishing failed:", err);
    throw new Error(`Failed to publish to Sanity: ${err instanceof Error ? err.message : String(err)}`);
  }
}