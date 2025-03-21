
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('Received request to trigger TruffleHog GitHub Action:', req.method);
  
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
    console.log('Processing TruffleHog scan for repo:', repoUrl);

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

    const [, targetOwner, targetRepo] = match;
    const repositoryName = targetRepo.replace(/\.git\/?$/, '');
    
    // GitHub Action trigger configuration
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

    // Generate a unique scan ID
    const scanId = crypto.randomUUID();
    
    // Prepare workflow dispatch payload
    const workflowDispatchPayload = {
      ref: "main", // Branch where the workflow is located
      inputs: {
        target_repo_url: repoUrl,
        target_owner: targetOwner,
        target_repo: repositoryName,
        scan_id: scanId,
        use_github_token: githubToken ? "true" : "false"
      }
    };
    
    console.log("Triggering GitHub Action with payload:", JSON.stringify(workflowDispatchPayload));
    
    // Trigger the workflow
    const response = await fetch(
      `https://api.github.com/repos/${ACTIONS_REPO_OWNER}/${ACTIONS_REPO}/actions/workflows/trufflehog-scan.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(workflowDispatchPayload)
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
    
    console.log("GitHub Action triggered successfully");
    
    // Start polling for results
    return new Response(
      JSON.stringify({
        message: "GitHub Action triggered successfully",
        scanId: scanId,
        status: "pending"
      }),
      { 
        status: 202, // Accepted
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in trigger-trufflehog-action function:', error);
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
