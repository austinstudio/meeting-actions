// pages/api/parse-file.js
// Parses uploaded PDF or TXT files and returns the text content

// pdf-parse has issues on Vercel, so we use the underlying pdf.js library directly
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

async function extractTextFromPDF(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;

  let fullText = '';

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file, filename, type } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Decode base64 file content
    const buffer = Buffer.from(file, 'base64');

    let text = '';

    if (type === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf')) {
      // Parse PDF
      try {
        text = await extractTextFromPDF(buffer);
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        return res.status(400).json({ error: 'Failed to parse PDF. Please ensure the file is a valid PDF.' });
      }
    } else if (type === 'text/plain' || filename?.toLowerCase().endsWith('.txt')) {
      // Parse TXT
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or TXT file.' });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text content found in the file.' });
    }

    return res.status(200).json({
      success: true,
      text: text.trim(),
      filename
    });

  } catch (error) {
    console.error('File parse error:', error);
    return res.status(500).json({ error: 'Failed to parse file' });
  }
}
