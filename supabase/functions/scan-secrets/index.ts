
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Secret detection patterns based on TruffleHog and common patterns
const secretPatterns = [
  {
    name: 'API Key',
    regex: /api[_-]?key["\s]*[:=]["\s]*[a-z0-9]{32,45}/i,
    severity: 'High',
  },
  {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/,
    severity: 'Critical',
  },
  {
    name: 'GitHub Token',
    regex: /gh[ps]_[0-9a-zA-Z]{36}/,
    severity: 'Critical',
  },
  {
    name: 'Google API Key',
    regex: /AIza[0-9A-Za-z\-_]{35}/,
    severity: 'High',
  },
  {
    name: 'Firebase Secret',
    regex: /FIREBASE_SECRET|["\s]*[:=]["\s]*[a-z0-9]{32,}/i,
    severity: 'High',
  },
  {
    name: 'Supabase Key',
    regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/,
    severity: 'Critical',
  },
  {
    name: 'JSON Web Token',
    regex: /ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/,
    severity: 'Medium',
  },
  {
    name: 'Generic Secret',
    regex: /secret|password|token["\s]*[:=]["\s]*[a-z0-9]{32,45}/i,
    severity: 'Medium',
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN PRIVATE KEY-----|-----BEGIN RSA PRIVATE KEY-----|-----BEGIN DSA PRIVATE KEY-----|-----BEGIN EC PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----|BEGIN PRIVATE KEY/,
    severity: 'Critical',
  },
]

// Mock npm audit data format
const mockVulnerabilities = [
  {
    name: "minimist",
    currentVersion: "1.2.5",
    vulnerableVersion: "<1.2.6",
    severity: "Critical",
    description: "Prototype Pollution",
  },
  {
    name: "node-fetch",
    currentVersion: "2.6.1",
    vulnerableVersion: "<2.6.7",
    severity: "High",
    description: "SSRF vulnerability",
  },
  {
    name: "lodash",
    currentVersion: "4.17.15",
    vulnerableVersion: "<4.17.21",
    severity: "High",
    description: "Prototype Pollution",
  }
];

// Insecure code patterns to look for
const insecurePatterns = [
  {
    name: 'Eval Usage',
    regex: /eval\s*\(/,
    severity: 'High',
  },
  {
    name: 'Unsanitized DOM',
    regex: /innerHTML|outerHTML|document\.write/,
    severity: 'Medium',
  },
  {
    name: 'SQL Injection Risk',
    regex: /execute\(\s*["'`]SELECT|executeQuery\(\s*["'`]SELECT|\.query\(\s*["'`]SELECT/i,
    severity: 'High',
  }
];

serve(async (req) => {
  console.log('Received request:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders,
    });
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
      );
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

      // For public repos, GitHub token is optional
      if (!requestData.repoUrl) {
        throw new Error('Missing repoUrl in request body');
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      );
    }

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git\/?$/, '');
    console.log(`Scanning repository: ${owner}/${repoName}`);

    // Setup headers for GitHub API - with or without token
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Supabase-Edge-Function',
    };
    
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }

    // Fetch repository contents using GitHub API
    console.log('Fetching repo contents with headers:', JSON.stringify(headers, null, 2).replace(/"Authorization": "Bearer [^"]+"/g, '"Authorization": "Bearer ***"'));
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/main?recursive=1`, {
      headers,
    });

    // Try master branch if main doesn't exist
    let data;
    if (!response.ok) {
      console.log('Main branch not found, trying master branch');
      const masterResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/master?recursive=1`, {
        headers,
      });
      
      if (!masterResponse.ok) {
        const errorText = await masterResponse.text();
        console.error('GitHub API error:', masterResponse.status, errorText);
        return new Response(
          JSON.stringify({ 
            error: `GitHub API error: ${masterResponse.statusText}`,
            details: errorText
          }),
          { 
            status: masterResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      data = await masterResponse.json();
    } else {
      data = await response.json();
    }

    if (!data || !data.tree) {
      console.error('Invalid response from GitHub API:', data);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response from GitHub API',
          details: 'No tree data found in response'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Found ${data.tree.length} items in repository tree`);
    
    const secretResults = [];
    const patternResults = [];
    const textFileExtensions = ['.js', '.ts', '.json', '.yml', '.yaml', '.env', '.txt', '.md', '.jsx', '.tsx', '.html', '.css', '.scss', '.php', '.py', '.rb', '.java'];

    // Scan each file
    for (const file of data.tree) {
      if (file.type === 'blob' && textFileExtensions.some(ext => file.path.toLowerCase().endsWith(ext))) {
        console.log('Scanning file:', file.path);
        
        try {
          // Fetch file content
          const contentResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}`, {
            headers,
          });

          if (contentResponse.ok) {
            const contentData = await contentResponse.json();
            if (!contentData.content) {
              console.log(`No content found for file: ${file.path}`);
              continue;
            }
            
            try {
              const content = atob(contentData.content);

              // Check for secrets
              for (const pattern of secretPatterns) {
                const matches = content.match(pattern.regex);
                if (matches && matches.length > 0) {
                  secretResults.push({
                    file: file.path,
                    ruleID: pattern.name,
                    severity: pattern.severity,
                    matches: matches.length,
                  });
                }
              }
              
              // Check for insecure patterns
              for (const pattern of insecurePatterns) {
                const matches = content.match(pattern.regex);
                if (matches && matches.length > 0) {
                  patternResults.push({
                    file: file.path,
                    ruleID: pattern.name,
                    severity: pattern.severity,
                    matches: matches.length,
                  });
                }
              }
            } catch (decodeError) {
              console.error(`Error decoding content for file ${file.path}:`, decodeError);
            }
          } else {
            console.error('Error fetching file content:', file.path, contentResponse.status);
          }
        } catch (error) {
          console.error('Error processing file:', file.path, error);
        }
      }
    }

    // Check for package.json to simulate dependency vulnerability check
    let packageJson = null;
    try {
      const packageResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/package.json`, {
        headers,
      });
      
      if (packageResponse.ok) {
        const packageData = await packageResponse.json();
        packageJson = JSON.parse(atob(packageData.content));
        console.log('Found package.json:', packageJson.name);
      }
    } catch (error) {
      console.log('No package.json found or error parsing:', error);
    }

    console.log('Scan completed. Found', secretResults.length, 'potential secrets and', patternResults.length, 'insecure patterns');

    return new Response(
      JSON.stringify({
        results: secretResults,
        patterns: patternResults,
        dependencies: packageJson ? mockVulnerabilities : [],
        repoInfo: {
          owner,
          repo: repoName
        }
      }),
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
