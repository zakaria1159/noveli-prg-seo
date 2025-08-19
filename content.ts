// content.ts
import dotenv from 'dotenv';

dotenv.config();

// Make sure OpenAI API key is available
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Type definitions
export interface BlogContent {
  seoTitle: string;
  metaDescription: string;
  body: string;
  keywords: string[];
}

/**
 * Generic retry function for async operations
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 2000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed. Retrying in ${delay/1000}s...`);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next attempt (exponential backoff)
      delay *= 1.5;
    }
  }
  
  throw lastError;
}

/**
 * Generates a blog post with SEO optimized content using OpenAI
 * 
 * @param title Title of the blog post to generate
 * @returns Generated blog content with SEO elements
 */
export async function generateBlogContent(title: string): Promise<BlogContent> {
  const prompt = `
You're writing an SEO-optimized blog post titled "${title}".

Follow these SEO best practices:
1. Use the primary keyword "${title}" naturally in the introduction, at least one heading, and conclusion
2. Include 3-5 related semantic keywords throughout the content
3. Create a compelling SEO title (40-50 characters) with the main keyword near the beginning
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

  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not set. Please set the OPENAI_API_KEY environment variable.");
  }

  try {
    console.log(`🧠 Generating blog content for: ${title}`);
    
    // Use fetchWithRetry to automatically retry on errors like 502 Bad Gateway
    return await fetchWithRetry(async () => {
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
        console.error("❌ OpenAI API Error:", raw);
        throw new Error(`OpenAI API responded with status ${res.status}`);
      }

      const parsed = await res.json();
      const content = parsed.choices?.[0]?.message?.content;
      
      if (!content) throw new Error("Missing message content from OpenAI");

      // Parse the content as JSON
      try {
        const parsedContent = JSON.parse(content);
        
        // Convert keywords from string to array
        const keywordsArray = parsedContent.keywords
          ? parsedContent.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          : [];
        
        return {
          seoTitle: parsedContent.seoTitle,
          metaDescription: parsedContent.metaDescription,
          body: parsedContent.body,
          keywords: keywordsArray
        };
      } catch (jsonErr) {
        console.error("⚠️ Failed to parse OpenAI response as JSON, attempting extraction:", jsonErr);
        console.log("Raw content:", content);
        
        // Try to extract content using regex
        const seoTitleMatch = content.match(/"seoTitle"\s*:\s*"([^"]*)"/);
        const metaDescMatch = content.match(/"metaDescription"\s*:\s*"([^"]*)"/);
        const keywordsMatch = content.match(/"keywords"\s*:\s*"([^"]*)"/);
        
        // For body, we need to be more careful as it contains newlines and quotes
        const bodyStart = content.indexOf('"body"') + 7;
        let bodyEnd = content.lastIndexOf('}') - 1;
        
        if (bodyStart < 7) {
          throw new Error("Could not find body content in OpenAI response");
        }
        
        // Find the actual end of the body by looking for the last unescaped quote before the closing brace
        let foundQuote = false;
        for (let i = bodyEnd; i >= bodyStart; i--) {
          if (content[i] === '"' && (i === 0 || content[i-1] !== '\\')) {
            bodyEnd = i;
            foundQuote = true;
            break;
          }
        }
        
        if (!foundQuote) {
          throw new Error("Could not find the end of body content");
        }
        
        const body = content.substring(bodyStart, bodyEnd).trim();
        // Clean the body string - remove leading/trailing quotes and colons
        const bodyClean = body
          .replace(/^:\s*"/, '')
          .replace(/^"/, '')
          .replace(/\\"/g, '"') // Replace escaped quotes
          .replace(/\\n/g, '\n'); // Replace escaped newlines
        
        if (!seoTitleMatch) {
          throw new Error("Could not extract SEO title from OpenAI response");
        }
        
        if (!metaDescMatch) {
          throw new Error("Could not extract meta description from OpenAI response");
        }
        
        // Convert keywords to array if found
        const keywordsArray = keywordsMatch 
          ? keywordsMatch[1].split(',').map((k: string) => k.trim()).filter(Boolean) 
          : [];
        
        return {
          seoTitle: seoTitleMatch[1],
          metaDescription: metaDescMatch[1],
          body: bodyClean,
          keywords: keywordsArray
        };
      }
    });
  } catch (err) {
    console.error("❌ Content generation failed:", err);
    throw new Error(`Failed to generate blog content: ${err instanceof Error ? err.message : String(err)}`);
  }
}