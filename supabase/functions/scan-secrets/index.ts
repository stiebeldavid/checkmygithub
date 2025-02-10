
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Secret detection patterns
const secretPatterns = [
  {
    name: 'Generic API Key',
    regex: /api[_-]?key|apikey["\s]*[:=]["\s]*[a-z0-9]{32,45}/i,
  },
  {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'GitHub Token',
    regex: /gh[ps]_[0-9a-zA-Z]{36}/,
  },
  {
    name: 'Generic Secret',
    regex: /secret|password|token["\s]*[:=]["\s]*[a-z0-9]{32,45}/i,
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN PRIVATE KEY-----/,
  },
  {
    name: 'RSA Private Key',
    regex: /-----BEGIN RSA PRIVATE KEY-----/,
  },
]

serve(async (req) => {
  console.log('Received request:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse and validate request body
    let requestData;
    try {
      const contentType = req.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Content-Type must be application/json');
      }

      const rawBody = await req.text();
      console.log('Raw request body:', rawBody);
      
      if (!rawBody) {
        throw new Error('Empty request body');
      }
      
      requestData = JSON.parse(rawBody);
      console.log('Parsed request data:', requestData);

      if (!requestData.repoUrl || !requestData.githubToken) {
        throw new Error('Missing repoUrl or githubToken in request body');
      }
    } catch (error) {
      console.error('Error parsing request body:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body',
          details: error.message 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { repoUrl, githubToken } = requestData;
    console.log('Processing request for repo:', repoUrl);

    // Extract owner and repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'Invalid GitHub repository URL' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git\/?$/, '');
    console.log(`Scanning repository: ${owner}/${repoName}`);

    // Fetch repository contents using GitHub API with OAuth token
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/main?recursive=1`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${githubToken}`,
        'User-Agent': 'Supabase-Edge-Function',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `GitHub API error: ${response.statusText}`,
          details: errorText
        }),
        { 
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    const results = [];
    const textFileExtensions = ['.js', '.ts', '.json', '.yml', '.yaml', '.env', '.txt', '.md', '.jsx', '.tsx'];

    // Scan each file
    for (const file of data.tree) {
      if (file.type === 'blob' && textFileExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
        console.log('Scanning file:', file.path);
        
        try {
          // Fetch file content using OAuth token
          const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}`, {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Authorization': `Bearer ${githubToken}`,
              'User-Agent': 'Supabase-Edge-Function',
            },
          });

          if (contentResponse.ok) {
            const contentData = await contentResponse.json();
            const content = atob(contentData.content);

            // Check for secrets
            for (const pattern of secretPatterns) {
              const matches = content.match(pattern.regex);
              if (matches && matches.length > 0) {
                results.push({
                  file: file.path,
                  ruleID: pattern.name,
                  matches: matches.length,
                });
              }
            }
          } else {
            console.error('Error fetching file content:', file.path, contentResponse.status);
          }
        } catch (error) {
          console.error('Error processing file:', file.path, error);
        }
      }
    }

    console.log('Scan completed. Found', results.length, 'potential secrets');

    return new Response(
      JSON.stringify({ results }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error in scan-secrets function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
})
