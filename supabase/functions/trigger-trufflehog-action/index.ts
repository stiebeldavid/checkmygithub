
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('Received request to run TruffleHog scan:', req.method);
  
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

    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git\/?$/, '');
    
    // Generate a unique scan ID and temp directory
    const scanId = crypto.randomUUID();
    const tempDir = `/tmp/${scanId}`;
    
    try {
      // Create temporary directory
      await Deno.mkdir(tempDir, { recursive: true });
      
      console.log(`Created temporary directory: ${tempDir}`);
      
      // Clone the repository
      const cloneCommand = githubToken 
        ? ["git", "clone", `https://${githubToken}@github.com/${owner}/${repoName}.git`, tempDir]
        : ["git", "clone", `https://github.com/${owner}/${repoName}.git`, tempDir];
      
      console.log(`Cloning repository: ${repoUrl} to ${tempDir}`);
      const cloneProcess = Deno.run({ 
        cmd: cloneCommand,
        stdout: "piped",
        stderr: "piped" 
      });
      
      const cloneStatus = await cloneProcess.status();
      
      if (!cloneStatus.success) {
        const errorOutput = new TextDecoder().decode(await cloneProcess.stderrOutput());
        cloneProcess.close();
        
        console.error(`Failed to clone repository: ${errorOutput}`);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to clone repository',
            details: errorOutput
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      cloneProcess.close();
      console.log(`Successfully cloned repository to ${tempDir}`);
      
      // Run TruffleHog scan
      console.log(`Running TruffleHog scan on ${tempDir}`);
      const truffleHogProcess = Deno.run({
        cmd: [
          "trufflehog", 
          "filesystem", 
          "--directory", 
          tempDir,
          "--json"
        ],
        stdout: "piped",
        stderr: "piped"
      });
      
      const [truffleHogStatus, stdoutRaw, stderrRaw] = await Promise.all([
        truffleHogProcess.status(),
        truffleHogProcess.output(),
        truffleHogProcess.stderrOutput()
      ]);
      
      truffleHogProcess.close();
      
      const stdout = new TextDecoder().decode(stdoutRaw);
      const stderr = new TextDecoder().decode(stderrRaw);
      
      console.log("TruffleHog scan completed");
      
      // Process TruffleHog results
      let scanResults = [];
      
      if (stdout) {
        try {
          // TruffleHog outputs one JSON object per line
          const lines = stdout.trim().split('\n');
          scanResults = lines.map(line => JSON.parse(line))
            .map(result => ({
              file: result.sourceMetadata?.filename || "Unknown file",
              line: result.sourceMetadata?.line || 0,
              ruleID: result.detectorType || "Unknown detector",
              severity: result.severity || "HIGH",
              context: result.raw || ""
            }));
        } catch (error) {
          console.error('Error parsing TruffleHog output:', error);
        }
      }
      
      if (!truffleHogStatus.success && scanResults.length === 0) {
        console.error(`TruffleHog scan failed: ${stderr}`);
        
        return new Response(
          JSON.stringify({ 
            error: 'TruffleHog scan failed',
            details: stderr
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Clean up: remove temp directory
      try {
        const rmProcess = Deno.run({
          cmd: ["rm", "-rf", tempDir],
          stdout: "piped",
          stderr: "piped"
        });
        await rmProcess.status();
        rmProcess.close();
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (error) {
        console.error(`Failed to clean up temporary directory: ${error}`);
        // Continue execution even if cleanup fails
      }
      
      // Return scan results
      return new Response(
        JSON.stringify({
          scanId,
          status: "completed",
          results: {
            items: scanResults,
          }
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
      
    } catch (error) {
      console.error(`Error running TruffleHog scan: ${error}`);
      
      // Clean up if there was an error
      try {
        const rmProcess = Deno.run({
          cmd: ["rm", "-rf", tempDir],
          stdout: "piped",
          stderr: "piped"
        });
        await rmProcess.status();
        rmProcess.close();
      } catch (cleanupError) {
        console.error(`Failed to clean up after error: ${cleanupError}`);
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Error running TruffleHog scan',
          details: error.message
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
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
