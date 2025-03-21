
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  console.log('Received request to check scan status:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const scanId = url.searchParams.get('scanId');
    
    if (!scanId) {
      return new Response(
        JSON.stringify({ error: 'Missing scanId parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // GitHub Action check configuration
    const GITHUB_TOKEN = Deno.env.get("GITHUB_ACTION_PAT");
    const ACTIONS_REPO_OWNER = "check-my-git-hub"; // Your organization
    const ACTIONS_REPO = "security-scanner"; // Repository where the action is defined
    
    if (!GITHUB_TOKEN) {
      console.error("GitHub Action PAT not configured");
      return new Response(
        JSON.stringify({ 
          error: 'GitHub Action PAT not configured',
          details: 'Please set the GITHUB_ACTION_PAT in your Edge Function secrets'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Checking status for scan ID: ${scanId}`);
    
    // Query GitHub for workflow runs
    // Note: This is simplified - in production, you'd need to store a mapping of scanId to workflow run_id
    const response = await fetch(
      `https://api.github.com/repos/${ACTIONS_REPO_OWNER}/${ACTIONS_REPO}/actions/runs?status=completed`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${GITHUB_TOKEN}`
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("GitHub API error:", response.status, errorText);
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
    
    const workflowRuns = await response.json();
    
    // In a real implementation, we'd use a database to store scan results
    // For demonstration, we'll simulate finding the scan by ID
    // In production, you'd query your database for the scan results
    
    // Simulated response for demonstration purposes
    return new Response(
      JSON.stringify({
        scanId: scanId,
        status: "completed",
        results: {
          secrets_found: 3,
          items: [
            {
              file: "config.js",
              line: 15,
              ruleID: "AWS Access Key",
              severity: "High",
              context: "const awsKey = 'AKIA...'"
            },
            {
              file: ".env",
              line: 3,
              ruleID: "API Key",
              severity: "Critical",
              context: "API_KEY=..."
            },
            {
              file: "deploy.sh",
              line: 27,
              ruleID: "Private Key",
              severity: "Critical",
              context: "echo 'PRIVATE_KEY=...'"
            }
          ]
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in check-scan-status function:', error);
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
