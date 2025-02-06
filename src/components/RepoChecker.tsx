import { useState, useRef, useEffect } from "react";
import { Lock, AlertTriangle, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "./LoadingSpinner";
import RepoStats from "./RepoStats";
import SignUpForm from "./SignUpForm";
import RepoForm from "./RepoForm";
import SecurityBestPractices from "./SecurityBestPractices";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import ScanningAnimation from "./ScanningAnimation";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RepoCheckerProps {
  initialRepoUrl?: string;
}

const RepoChecker = ({ initialRepoUrl }: RepoCheckerProps) => {
  const [loading, setLoading] = useState(false);
  const [repoData, setRepoData] = useState<any>(null);
  const [notFoundOrPrivate, setNotFoundOrPrivate] = useState(false);
  const [currentRepoUrl, setCurrentRepoUrl] = useState(initialRepoUrl || "");
  const [showSignUp, setShowSignUp] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [secretScanResults, setSecretScanResults] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<string>();

  const extractRepoInfo = (url: string) => {
    try {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return null;
      
      const repoName = match[2].replace(/\.git\/?$/, '').replace(/\/$/, '');
      return { owner: match[1], repo: repoName };
    } catch (error) {
      return null;
    }
  };

  const handleSubmit = async (repoUrl: string) => {
    setLoading(true);
    setRepoData(null);
    setNotFoundOrPrivate(false);
    setCurrentRepoUrl(repoUrl);
    setSecretScanResults(null);

    try {
      const repoInfo = extractRepoInfo(repoUrl);
      if (!repoInfo) {
        toast.error("Could not parse repository URL. Please check the format.");
        return;
      }

      const { data: credentials, error: credentialsError } = await supabase.functions.invoke('get-github-secret');
      
      if (credentialsError || !credentials) {
        console.error("Error fetching GitHub credentials:", credentialsError);
        toast.error("Failed to authenticate with GitHub");
        return;
      }

      const response = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`, {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.secret}`)}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setNotFoundOrPrivate(true);
          return;
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      setRepoData({
        name: data.name,
        visibility: data.private ? "private" : "public",
        stars: data.stargazers_count,
        forks: data.forks_count,
        description: data.description,
        language: data.language,
        updated_at: data.updated_at,
        open_issues: data.open_issues_count,
        license: data.license,
        size: data.size,
      });

      try {
        console.log('Starting secret scan for:', repoUrl);
        const requestBody = { repoUrl: repoUrl };
        console.log('Request body:', requestBody);
        
        const { data: scanResults, error: scanError } = await supabase.functions.invoke('scan-secrets', {
          body: requestBody,
        });

        if (scanError) {
          console.error('Error scanning for secrets:', scanError);
          toast.error('Failed to scan repository for secrets. Please try again.');
          return;
        }

        if (!scanResults) {
          console.error('No scan results returned');
          toast.error('Failed to get scan results. Please try again.');
          return;
        }

        setSecretScanResults(scanResults);
        
        if (scanResults.results && scanResults.results.length > 0) {
          toast.warning(`Found ${scanResults.results.length} potential secrets in the repository`);
        } else {
          toast.success('No secrets found in the repository');
        }
      } catch (error) {
        console.error('Error during secret scan:', error);
        toast.error('Failed to complete secret scan. Please try again.');
      }
    } catch (error) {
      console.error("Error scanning repository:", error);
      toast.error("Failed to fetch repository data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Add event listener for auto-scan
  useEffect(() => {
    const handleAutoScan = (event: CustomEvent<{ repoUrl: string }>) => {
      handleSubmit(event.detail.repoUrl);
    };

    window.addEventListener('auto-scan', handleAutoScan as EventListener);
    
    // If initialRepoUrl is provided, trigger scan automatically
    if (initialRepoUrl) {
      handleSubmit(initialRepoUrl);
    }

    return () => {
      window.removeEventListener('auto-scan', handleAutoScan as EventListener);
    };
  }, []);

  const handleGitHubAuth = async () => {
    try {
      const { data: credentials, error: credentialsError } = await supabase.functions.invoke('get-github-secret');
      
      if (credentialsError || !credentials) {
        console.error("Error fetching GitHub credentials:", credentialsError);
        toast.error("Failed to authenticate with GitHub");
        return;
      }

      if (currentRepoUrl) {
        localStorage.setItem('pendingRepoUrl', currentRepoUrl);
      }
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const redirectUri = 'https://checkmygithub.com/oauth-callback.html';
      
      const repoInfo = extractRepoInfo(currentRepoUrl);
      if (!repoInfo) {
        toast.error("Could not parse repository URL. Please check the format.");
        return;
      }

      const scope = `read:org repo:status repo:read public_repo read:repo_hook`;
      
      const authWindow = window.open(
        `https://github.com/login/oauth/authorize?client_id=${credentials.clientId}&redirect_uri=${redirectUri}&scope=${scope}`,
        'GitHub Authorization',
        `width=${width},height=${height},top=${top},left=${left}`
      );

      window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'github-oauth-code') {
          try {
            setAuthenticating(true);
            const { data, error } = await supabase.functions.invoke('github-auth', {
              body: { code: event.data.code }
            });

            if (error) throw error;

            localStorage.setItem('github_token', data.access_token);
            
            const savedRepoUrl = localStorage.getItem('pendingRepoUrl');
            if (savedRepoUrl) {
              await handleSubmit(savedRepoUrl);
              localStorage.removeItem('pendingRepoUrl');
            }
            
            toast.success('Successfully authenticated with GitHub');
          } catch (error) {
            console.error('Error authenticating with GitHub:', error);
            toast.error('Failed to authenticate with GitHub');
          } finally {
            setAuthenticating(false);
          }
        }
      });
    } catch (error) {
      console.error('Error initiating GitHub auth:', error);
      toast.error('Failed to initiate GitHub authentication');
    }
  };

  const getAccessSettingsUrl = (repoUrl: string) => {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return '';
    const [, owner, repo] = match;
    return `https://github.com/${owner}/${repo.replace(/\.git\/?$/, '')}/settings/access`;
  };

  const handleShowSignUp = (option: string) => {
    setSelectedOption(option);
    setShowSignUp(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="max-w-3xl mx-auto space-y-6">
            {!loading && !repoData && !notFoundOrPrivate && (
              <p className="text-2xl font-semibold text-gray-300 mb-4">
                Protect your API keys and ensure your AI-generated code follows security best practices.
              </p>
            )}
            <h1 className="text-5xl font-bold mb-6">
              Scan Your Repository
              <span className="text-primary"> for Free</span>
            </h1>
            {!loading && !repoData && !notFoundOrPrivate && (
              <p className="text-xl text-gray-300">
                Built specifically for developers using AI tools like Lovable, Bolt, Create, v0, Replit, Cursor and more.
              </p>
            )}
          </div>

          <div className="max-w-2xl mx-auto mt-12 mb-16">
            <RepoForm onSubmit={handleSubmit} loading={loading} initialValue={initialRepoUrl} />
          </div>

          {repoData && (
            <div className="space-y-16">
              <div className="max-w-4xl mx-auto">
                <RepoStats repoData={repoData} />
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-12 animate-fade-in">
              <ScanningAnimation />
            </div>
          )}

          {notFoundOrPrivate && (
            <div className="max-w-2xl mx-auto mb-16">
              <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2 text-yellow-400 mb-4">
                  <Lock className="w-6 h-6" />
                  <h3 className="text-lg font-semibold">Repository Not Accessible</h3>
                </div>
                <p className="text-gray-300 mb-4">
                  This repository either doesn't exist or is private. 
                </p>
                <div className="space-y-4">
                  <p className="text-gray-400 font-medium">For a full security report, either:</p>
                  <ul className="list-none space-y-4">
                    <li className="flex items-start gap-4">
                      <div className="rounded-full w-2 h-2 bg-gray-400 mt-2"></div>
                      <div className="flex-1">
                        <span className="text-gray-300">Grant read-only access to </span>
                        <a 
                          href="https://github.com/check-my-git-hub" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline"
                        >
                          Check-My-Git-Hub
                        </a>
                        <Button
                          variant="default"
                          size="sm"
                          className="ml-4 bg-primary hover:bg-primary/90 text-white font-medium transition-colors"
                          onClick={handleGitHubAuth}
                          disabled={authenticating}
                        >
                          {authenticating ? (
                            <LoadingSpinner className="w-4 h-4" />
                          ) : (
                            <>
                              <Github className="w-4 h-4 mr-2" />
                              Grant Access
                            </>
                          )}
                        </Button>
                        <div className="mt-2">
                          <a 
                            href={getAccessSettingsUrl(currentRepoUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-sm"
                          >
                            Click here to see your repo's access page
                          </a>
                        </div>
                      </div>
                    </li>
                    <li className="flex items-start gap-4">
                      <div className="rounded-full w-2 h-2 bg-gray-400 mt-2"></div>
                      <span className="text-gray-300">Make the repository public (not recommended)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!repoData && !loading && !notFoundOrPrivate && (
            <>
              <SecurityBestPractices />
              <HowItWorks />
              <Pricing onPlanSelect={handleShowSignUp} />
            </>
          )}
        </div>

        {repoData && (
          <div className="w-full">
            {secretScanResults && secretScanResults.results && secretScanResults.results.length > 0 && (
              <div className="max-w-4xl mx-auto bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-semibold">Security Alert: Potential Secrets Found</h3>
                </div>
                <p className="text-gray-300 mb-4">
                  We found {secretScanResults.results.length} potential secrets in your repository. 
                  Please review and remove any hardcoded API keys, tokens, or other sensitive information.
                </p>
                <div className="space-y-2">
                  {secretScanResults.results.map((result: any, index: number) => (
                    <div key={index} className="bg-gray-800/50 p-3 rounded">
                      <p className="text-sm text-gray-400">Found in: {result.file}</p>
                      <p className="text-sm text-gray-400">Type: {result.ruleID}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Pricing onPlanSelect={handleShowSignUp} />
          </div>
        )}
      </div>
      <SignUpForm 
        open={showSignUp} 
        onOpenChange={setShowSignUp}
        selectedOption={selectedOption}
        currentRepoUrl={currentRepoUrl}
      />
    </div>
  );
};

export default RepoChecker;
