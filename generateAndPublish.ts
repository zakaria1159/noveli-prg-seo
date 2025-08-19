import dotenv from 'dotenv';
import titles from './titles.json';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;

const AUTHOR_ID = "d9b0383e-9d69-43e0-b193-c074a40a7443";

// Type definitions
interface BlogContent {
  metaTitle: string;
  metaDescription: string;
  body: string;
  keywords?: string;
}

interface PortableTextSpan {
  _type: 'span';
  text: string;
  marks?: string[];
}

interface PortableTextBlock {
  _type: 'block';
  style: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote';
  listItem?: 'bullet' | 'number';
  level?: number;
  children: PortableTextSpan[];
  _key: string;
}

// Helper function to generate unique keys
function generateKey(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateBlogContent(title: string): Promise<BlogContent> {
  const prompt = `
You're writing an SEO-optimized blog post titled "${title}".

Follow these SEO best practices:
1. Use the primary keyword "${title}" naturally in the introduction, at least one heading, and conclusion
2. Include 3-5 related semantic keywords throughout the content
3. Create a compelling SEO title (50-60 characters) with the main keyword near the beginning
4. Write a click-worthy meta description (140-155 characters) containing the main keyword
5. Structure content with proper Markdown headings (# for title, ## for H2, ### for H3)
6. Include numbered or bulleted lists where appropriate
7. Use short paragraphs (2-3 sentences each) for better readability
8. Use proper Markdown formatting for emphasis: **bold** for important terms, *italic* for emphasis
9. Add a clear call-to-action in the conclusion

Important Markdown formatting rules:
- Use proper Markdown heading syntax: # for H1, ## for H2, ### for H3 (include the space after the # symbols)
- Use **double asterisks** for bold text
- Use *single asterisks* for italic text
- For bullet lists, use - or * with a space after
- For numbered lists, use 1., 2., etc. with a space after
- Separate paragraphs with a blank line between them
- DO NOT use "H2:" or "H3:" as text, use proper Markdown heading syntax instead

Generate:
- An SEO title (50-60 characters) optimized for CTR and keyword inclusion
- A meta description (140-155 characters) with a value proposition and the main keyword
- A list of 5-7 relevant keywords separated by commas
- A full blog post (~800-1000 words) in properly formatted Markdown structured with:
  * A # Heading title
  * 3-5 ## H2 sections with relevant ### H3 subsections
  * Strategic use of **bold text** for important phrases
  * *Italic text* for emphasis
  * Conclusion with a call-to-action
  * Naturally placed semantic keywords

Return ONLY the following JSON format:
{
  "seoTitle": "...",
  "metaDescription": "...",
  "keywords": "keyword1, keyword2, keyword3, keyword4, keyword5",
  "body": "# Title\\n\\nFirst paragraph...\\n\\n## Section Heading...\\n\\nMore content..."
}
`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4",
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const raw = await res.text();
    console.error("❌ OpenAI API Error:");
    console.error(raw);
    throw new Error(`OpenAI API responded with status ${res.status}`);
  }

  try {
    const parsed = await res.json();
    const content = parsed.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("Missing message content from OpenAI");

    // Try parsing the content with a more robust approach
    try {
      // Check if the content is already valid JSON
      const parsedContent = JSON.parse(content);
      // Convert to our expected format
      return {
        metaTitle: parsedContent.seoTitle || parsedContent.metaTitle,
        metaDescription: parsedContent.metaDescription,
        body: parsedContent.body,
        keywords: parsedContent.keywords
      };
    } catch (initialErr) {
      // Not valid JSON, let's try to extract it
      try {
        // Extract JSON from the content using regex
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          const parsedJson = JSON.parse(jsonStr);
          return {
            metaTitle: parsedJson.seoTitle || parsedJson.metaTitle,
            metaDescription: parsedJson.metaDescription,
            body: parsedJson.body,
            keywords: parsedJson.keywords
          };
        } else {
          throw new Error("Could not find JSON object in response");
        }
      } catch (jsonErr) {
        console.error("⚠️ Failed to parse content as JSON, manual extraction needed");
        console.log("Raw content:", content);
        
        // Last resort: try to manually extract the fields
        try {
          const seoTitleMatch = content.match(/"seoTitle"\s*:\s*"([^"]*)"/);
          const metaTitleMatch = content.match(/"metaTitle"\s*:\s*"([^"]*)"/);
          const metaDescMatch = content.match(/"metaDescription"\s*:\s*"([^"]*)"/);
          const keywordsMatch = content.match(/"keywords"\s*:\s*"([^"]*)"/);
          const bodyStartIndex = content.indexOf('"body"') + 7;
          let bodyEndIndex = content.lastIndexOf('"');
          
          if (bodyEndIndex <= bodyStartIndex) {
            bodyEndIndex = content.length - 2;
          }
          
          const body = content.substring(bodyStartIndex, bodyEndIndex).trim();
          const bodyClean = body.startsWith(':') ? body.substring(1).trim() : body;
          const bodyFinal = bodyClean.startsWith('"') ? bodyClean.substring(1) : bodyClean;
          
          const metaTitle = seoTitleMatch ? seoTitleMatch[1] : (metaTitleMatch ? metaTitleMatch[1] : "");
          const keywords = keywordsMatch ? keywordsMatch[1] : "";
          
          if ((seoTitleMatch || metaTitleMatch) && metaDescMatch) {
            return {
              metaTitle,
              metaDescription: metaDescMatch[1],
              body: bodyFinal,
              keywords
            };
          } else {
            throw new Error("Could not extract all required fields");
          }
        } catch (finalErr) {
          console.error("⚠️ All parsing attempts failed:", finalErr);
          throw new Error("OpenAI returned unparseable JSON");
        }
      }
    }
  } catch (err) {
    console.error("⚠️ Failed to process OpenAI response:", err);
    throw new Error("Failed to process OpenAI response");
  }
}

// Helper function to process bold and emphasis markers in text
function processBoldAndEmphasis(text: string): PortableTextSpan[] {
  // Split text by bold and italic markers
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

function markdownToPortableText(markdown: string): PortableTextBlock[] {
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

function extractKeywords(keywordsString?: string): string[] {
  if (!keywordsString) return [];
  
  return keywordsString.split(',').map(k => k.trim()).filter(k => k);
}

// Generate image with DALL-E
async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      prompt: `High-quality blog featured image for "${prompt}"`,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    })
  });
  
  const data = await response.json();
  return data.data[0].url;
}

// Upload image to Sanity
async function uploadImageToSanity(imageUrl: string, title: string): Promise<string> {
  // Download image
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  
  // Upload to Sanity
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer]));
  
  const uploadResponse = await fetch(
    `https://${SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/assets/images/${SANITY_DATASET}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SANITY_API_TOKEN}`
      },
      body: formData
    }
  );
  
  const uploadData = await uploadResponse.json();
  
  return uploadData.document._id;
}

async function publishToSanity(title: string, content: BlogContent, categoryId: string): Promise<string> {
  const now = new Date().toISOString();
  const imageUrl = await generateImage(title);
  const imageId = await uploadImageToSanity(imageUrl, title);
  
  // Create proper slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen

  const portableTextBody = markdownToPortableText(content.body);
  
  // Extract keywords from content
  const keywords = extractKeywords(content.keywords);
  
  // Create document matching your Sanity schema
  const doc = {
    _type: 'post',
    title: title,
    slug: { _type: 'slug', current: slug },
    publishedAt: now,
    excerpt: content.metaDescription,
    seoTitle: content.metaTitle,
    metaDescription: content.metaDescription,
    keywords: keywords,
    author: { _type: 'reference', _ref: AUTHOR_ID },
    mainImage: {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: imageId
      },
      alt: `Featured image for ${title}`
    },
    categories: [{ 
      _type: 'reference', 
      _ref: categoryId,
      _key: generateKey() // Add key for array item
    }],
    body: portableTextBody
  };

  try {
    const result = await fetch(`https://${SANITY_PROJECT_ID}.api.sanity.io/v2023-05-01/data/mutate/${SANITY_DATASET}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SANITY_API_TOKEN}`
      },
      body: JSON.stringify({ mutations: [{ create: doc }] })
    });

    const json = await result.json();
    
    if (json.results && json.results[0]?.id) {
      console.log(`✅ Published: ${title} (ID: ${json.results[0].id})`);
      console.log(`  SEO Title: ${content.metaTitle}`);
      console.log(`  Meta Description: ${content.metaDescription.substring(0, 40)}...`);
      console.log(`  Keywords: ${keywords.join(', ')}`);
      return json.results[0].id;
    } else {
      console.error(`⚠️ Unusual response when publishing ${title}:`, json);
      if (json.error) {
        throw new Error(`Sanity error: ${json.error.description || json.error}`);
      }
      throw new Error("Unknown error when publishing to Sanity");
    }
  } catch (error) {
    console.error(`❌ Failed to publish to Sanity:`, error);
    throw error;
  }
}

// Add a delay function to prevent rate limiting
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Main function
(async () => {
  let successCount = 0;
  let failureCount = 0;
  
  console.log(`🚀 Starting blog generation for ${titles.length} articles...`);
  
  for (const item of titles) {
    console.log(`\n🧠 Generating: ${item.title}`);
    try {
      const content = await generateBlogContent(item.title);
      console.log(`✓ Generated content for: ${item.title}`);
      console.log(`  SEO Title (${content.metaTitle.length} chars): ${content.metaTitle}`);
      console.log(`  Meta Description (${content.metaDescription.length} chars): ${content.metaDescription.substring(0, 40)}...`);
      
      // Add a small delay between API calls to prevent rate limiting
      await delay(1000);
      
      await publishToSanity(item.title, content, item.categoryId);
      successCount++;
    } catch (err: unknown) {
      failureCount++;
      if (err instanceof Error) {
        console.error(`❌ Failed to publish ${item.title}:`, err.message);
      } else {
        console.error(`❌ Unknown error while publishing ${item.title}:`, err);
      }
    }
    
    // Add a delay between articles
    await delay(2000);
  }
  
  console.log(`\n✅ Process completed: ${successCount} articles published successfully, ${failureCount} failures.`);
})();