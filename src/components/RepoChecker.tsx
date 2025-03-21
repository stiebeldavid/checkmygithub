import { useState, useEffect } from "react";
import { Lock, AlertTriangle, Github, Globe, ChevronDown, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "./LoadingSpinner";
import RepoStats from "./RepoStats";
import RepoForm from "./RepoForm";
import SecurityBestPractices from "./SecurityBestPractices";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import ScanningAnimation from "./ScanningAnimation";
import ScanResults from "./ScanResults";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface RepoCheckerProps {
  initialRepoUrl?: string;
}

interface UserRepoStats {
  totalRepos: number;
  publicRepos: number;
  username: string;
  publicReposList?: Array<{
    name: string;
    url: string;
    description?: string;
    size?: number;
  }>;
}

const RepoChecker = ({ initialRepoUrl }: RepoCheckerProps) => {
  const [loading, setLoading] = useState(false);
  const [repoData, setRepoData] = useState<any>(null);
  const [notFoundOrPrivate, setNotFoundOrPrivate] = useState(false);
  const [currentRepoUrl, setCurrentRepoUrl] = useState(initialRepoUrl || "");
  const [authenticating, setAuthenticating] = useState(false);
  const [secretScanResults, setSecretScanResults] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<string>();
  const [userRepoStats, setUserRepoStats] = useState<UserRepoStats | null>(null);
  const [session, setSession] = useState<any>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [scanStatusInterval, setScanStatusInterval] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserScanCount(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserScanCount(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  
  const fetchUserScanCount = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('scan_history')
        .select('id')
        .eq('user_id', userId);
        
      if (error) throw error;
      
      setScanCount(data?.length || 0);
    } catch (error) {
      console.error("Error fetching scan count:", error);
    }
  };

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

  const fetchUserRepoStats = async (username: string, credentials: any) => {
    try {
      const response = await fetch(`https://api.github.com/users/${username}`, {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.secret}`)}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.statusText}`);
      }

      const userData = await response.json();

      const reposResponse = await fetch(`https://api.github.com/users/${username}/repos`, {
        headers: {
          Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.secret}`)}`,
        },
      });

      if (!reposResponse.ok) {
        throw new Error(`Failed to fetch repositories: ${reposResponse.statusText}`);
      }

      const reposData = await reposResponse.json();
      const publicReposList = reposData
        .map((repo: any) => ({
          name: repo.name,
          url: repo.html_url,
          description: repo.description,
          size: repo.size,
        }))
        .sort((a: any, b: any) => (b.size || 0) - (a.size || 0));

      setUserRepoStats({
        totalRepos: userData.public_repos,
        publicRepos: userData.public_repos,
        username: username,
        publicReposList,
      });

      if (userData.public_repos > 0) {
        toast.warning(
          `CheckMyGitHub detected ${userData.public_repos} public repositories in ${username}'s account.`,
          {
            duration: 6000,
          }
        );
      }
    } catch (error) {
      console.error("Error fetching user repository stats:", error);
    }
  };

  const checkScanStatus = async (scanId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-scan-status', {
        method: 'GET',
        query: { scanId }
      });
      
      if (error) {
        console.error("Error checking scan status:", error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error("Error polling scan status:", error);
      return null;
    }
  };

  const handleSubmit = async (repoUrl: string) => {
    setLoading(true);
    setRepoData(null);
    setNotFoundOrPrivate(false);
    setCurrentRepoUrl(repoUrl);
    setSecretScanResults(null);
    setUserRepoStats(null);
    setCurrentScanId(null);
    
    if (scanStatusInterval) {
      clearInterval(scanStatusInterval);
      setScanStatusInterval(null);
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession();

    try {
      const { data: credentials, error: credentialsError } = await supabase.functions.invoke('get-github-secret');
      
      if (credentialsError || !credentials) {
        console.error("Error fetching GitHub credentials:", credentialsError);
        toast.error("Failed to authenticate with GitHub");
        setLoading(false);
        return;
      }

      let githubToken = null;
      if (currentSession) {
        const { data: tokenData } = await supabase
          .from('github_oauth_tokens')
          .select('access_token')
          .eq('user_id', currentSession.user.id)
          .single();
        
        if (tokenData) {
          githubToken = tokenData.access_token;
        }
      }

      const repoInfo = extractRepoInfo(repoUrl);
      if (!repoInfo) {
        toast.error("Could not parse repository URL. Please check the format.");
        setLoading(false);
        return;
      }

      const authHeaders = githubToken 
        ? { Authorization: `Bearer ${githubToken}` }
        : { Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.secret}`)}` };

      if (currentSession) {
        await fetchUserRepoStats(repoInfo.owner, credentials);
      }

      console.log("Fetching repository info...");
      const response = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`, {
        headers: {
          ...authHeaders,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setNotFoundOrPrivate(true);
          setLoading(false);
          return;
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Repository data:", data);
      
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

      if (data.private && !currentSession) {
        setNotFoundOrPrivate(true);
        toast.warning("This is a private repository. Please sign in to scan it.");
        setLoading(false);
        return;
      }

      if (currentSession && scanCount >= 1 && !await checkUserHasPro(currentSession.user.id)) {
        toast.error("You've reached your free scan limit. Please upgrade to Pro for unlimited scans.");
        setLoading(false);
        scrollToPricing();
        return;
      }

      console.log("Starting TruffleHog GitHub Action scan for repo:", repoUrl);
      
      try {
        const requestBody = { 
          repoUrl: repoUrl,
          githubToken: githubToken 
        };
        
        const { data: actionData, error: actionError } = await supabase.functions.invoke('trigger-trufflehog-action', {
          body: requestBody,
        });
        
        if (actionError) {
          console.error('Error triggering GitHub Action:', actionError);
          toast.error('Failed to trigger security scan. Please try again later.');
          setLoading(false);
          return;
        } 
        
        console.log("GitHub Action triggered:", actionData);
        
        setCurrentScanId(actionData.scanId);
        
        const intervalId = window.setInterval(async () => {
          const status = await checkScanStatus(actionData.scanId);
          console.log("Scan status:", status);
          
          if (status?.status === 'completed') {
            clearInterval(intervalId);
            setScanStatusInterval(null);
            
            setSecretScanResults(status.results);
            
            navigate('/scan-success', { 
              state: { 
                repoUrl,
                repoData: {
                  name: data.name,
                  visibility: data.private ? "private" : "public",
                  stars: data.stargazers_count,
                  forks: data.forks_count,
                  description: data.description,
                  language: data.language,
                },
                scanResults: status.results,
                gitHubAction: true
              } 
            });
            
            setLoading(false);
          }
        }, 5000);
        
        setScanStatusInterval(intervalId);
        
        if (currentSession) {
          await supabase.from('scan_history').insert({
            user_id: currentSession.user.id,
            repository_url: repoUrl
          });
          
          fetchUserScanCount(currentSession.user.id);
        }
        
        toast.info('Security scan initiated. This may take a few minutes...');
      } catch (error) {
        console.error('Error during scan:', error);
        toast.error('Failed to complete the security scan. Please try again.');
        setLoading(false);
      }
    } catch (error) {
      console.error("Error scanning repository:", error);
      toast.error("Failed to fetch repository data. Please try again later.");
      setLoading(false);
    }
  };

  const checkUserHasPro = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('scan_credits')
        .select('*')
        .eq('user_id', userId)
        .single();
        
      if (error) return false;
      
      return data?.credits_remaining > 0 || data?.package_type === 'pro';
    } catch (error) {
      console.error("Error checking pro status:", error);
      return false;
    }
  };

  const scrollToPricing = () => {
    const pricingSection = document.getElementById('pricing');
    if (pricingSection) {
      pricingSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScanAllRepos = async () => {
    try {
      await supabase.from('Signups').insert({
        github_url: currentRepoUrl,
        option_chosen: 'Scan Now button'
      });
    } catch (error) {
      console.error('Error recording signup:', error);
    }
    scrollToPricing();
  };

  const handleScanRepo = async (repoUrl: string) => {
    try {
      await supabase.from('Signups').insert({
        github_url: repoUrl,
        option_chosen: 'Scan Now button'
      });
    } catch (error) {
      console.error('Error recording signup:', error);
    }
    scrollToPricing();
  };

  const handleGitHubAuth = async () => {
    try {
      if (!session) {
        toast.error("Please sign in to grant repository access");
        window.location.href = '/auth';
        return;
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        toast.error("Please sign in to grant repository access");
        return;
      }

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

      const scope = `repo read:org admin:repo_hook`;
      
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

            const { error: tokenError } = await supabase
              .from('github_oauth_tokens')
              .upsert({
                user_id: currentSession.user.id,
                access_token: data.access_token,
              }, {
                onConflict: 'user_id'
              });

            if (tokenError) {
              console.error('Error storing GitHub token:', tokenError);
              throw new Error('Failed to store GitHub token');
            }
            
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error logging out:", error);
      toast.error("Failed to log out");
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
    scrollToPricing();
  };

  useEffect(() => {
    return () => {
      if (scanStatusInterval) {
        clearInterval(scanStatusInterval);
      }
    };
  }, [scanStatusInterval]);

  useEffect(() => {
    const handleAutoScan = (event: CustomEvent<{ repoUrl: string }>) => {
      handleSubmit(event.detail.repoUrl);
    };

    window.addEventListener('auto-scan', handleAutoScan as EventListener);
    
    if (initialRepoUrl) {
      handleSubmit(initialRepoUrl);
    }

    return () => {
      window.removeEventListener('auto-scan', handleAutoScan as EventListener);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {session && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              className="text-gray-300 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
        
        {!session && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              className="text-white hover:text-white hover:bg-gray-700/50"
              onClick={() => window.location.href = '/auth'}
            >
              Sign In
            </Button>
          </div>
        )}

        <div className="text-center mb-12">
          <div className="max-w-3xl mx-auto space-y-6">
            {!loading && !repoData && !notFoundOrPrivate && (
              <p className="text-2xl font-semibold text-gray-300 mb-4">
                Protect your API keys and ensure your AI-generated code follows security best practices.
              </p>
            )}
            <h1 className="text-5xl font-bold mb-6">
              Scan Your Repository
              <span className="text-primary"> for Security Issues</span>
            </h1>
            {!loading && !repoData && !notFoundOrPrivate && (
              <p className="text-xl text-gray-300">
                Built specifically for developers using AI tools like Lovable, Bolt, Create, v0, Replit, Cursor and more.
              </p>
            )}
            
            {session && scanCount > 0 && (
              <div className="mt-4 text-amber-400 flex items-center justify-center gap-2">
                <Shield className="w-5 h-5" />
                <span>You've used {scanCount} of your free scans</span>
              </div>
            )}
          </div>

          <div className="max-w-2xl mx-auto mt-12 mb-8">
            <RepoForm onSubmit={handleSubmit} loading={loading} initialValue={initialRepoUrl} />
          </div>

          <div className="max-w-2xl mx-auto mb-16 flex items-center justify-center">
            <div className="bg-primary/10 px-4 py-2 rounded-md">
              <span className="text-primary text-sm">Using TruffleHog security scanner for comprehensive scanning</span>
            </div>
          </div>

          {userRepoStats && (
            <div className="max-w-2xl mx-auto mb-8 text-left bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Globe className="w-5 h-5" />
                <h3 className="font-semibold">Repository Visibility Warning</h3>
              </div>
              <p className="text-gray-300 mb-4">
                CheckMyGitHub detected <b>{userRepoStats.publicRepos}</b> public repositories in {userRepoStats.username}'s account.
              </p>
              {userRepoStats.publicReposList && userRepoStats.publicReposList.length > 0 && (
                <Collapsible className="w-full space-y-2">
                  <div className="space-y-2">
                    {userRepoStats.publicReposList.slice(0, 5).map((repo) => (
                      <div key={repo.name} className="bg-black/20 p-3 rounded flex justify-between items-start">
                        <div className="flex-1">
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-400 hover:text-yellow-300 font-medium"
                          >
                            {repo.name}
                          </a>
                          {repo.description && (
                            <p className="text-sm text-gray-400 mt-1">{repo.description}</p>
                          )}
                          <p className="text-sm text-gray-500 mt-1">
                            Size: {((repo.size || 0) / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 ml-4"
                          onClick={() => handleScanRepo(repo.url)}
                        >
                          Scan Now
                        </Button>
                      </div>
                    ))}
                  </div>
                  {userRepoStats.publicReposList.length > 5 && (
                    <>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300">
                        <ChevronDown className="h-4 w-4" />
                        View {userRepoStats.publicReposList.length - 5} more repositories
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2">
                        {userRepoStats.publicReposList.slice(5).map((repo) => (
                          <div key={repo.name} className="bg-black/20 p-3 rounded flex justify-between items-start">
                            <div className="flex-1">
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-yellow-400 hover:text-yellow-300 font-medium"
                              >
                                {repo.name}
                              </a>
                              {repo.description && (
                                <p className="text-sm text-gray-400 mt-1">{repo.description}</p>
                              )}
                              <p className="text-sm text-gray-500 mt-1">
                                Size: {((repo.size || 0) / 1024).toFixed(2)} MB
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 ml-4"
                              onClick={() => handleScanRepo(repo.url)}
                            >
                              Scan Now
                            </Button>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </>
                  )}
                </Collapsible>
              )}
              <Button
                variant="outline"
                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 mt-4"
                onClick={handleScanAllRepos}
              >
                Scan All Repositories
              </Button>
            </div>
          )}

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
              <p className="text-gray-300 mt-8">
                Running TruffleHog security scan on your repository...
              </p>
              {currentScanId && (
                <p className="text-gray-400 text-sm mt-2">
                  Scan ID: {currentScanId}
                </p>
              )}
            </div>
          )}

          {notFoundOrPrivate && (
            <div className="max-w-2xl mx-auto mb-16">
              <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 text-left">
                <div className="flex items-center gap-2 text-yellow-400 mb-4">
                  <Lock className="w-6 h-6" />
                  <h3 className="text-lg font-semibold">
                    Repository Not Accessible: {currentRepoUrl.split('/').slice(-2).join('/')}
                  </h3>
                </div>
                <p className="text-gray-300 mb-4">
                  This repository either doesn't exist or is private. 
                </p>
                <div className="space-y-4">
                  <p className="text-gray-400 font-medium">To access private repositories:</p>
                  <ul className="list-none space-y-4">
                    <li className="flex items-start gap-4">
                      {!session ? (
                        <div className="flex-1">
                          <span className="text-gray-300">First, </span>
                          <Button
                            variant="default"
                            size="sm"
                            className="ml-2 bg-primary hover:bg-primary/90 text-white font-medium transition-colors"
                            onClick={() => window.location.href = '/auth'}
                          >
                            Sign In
                          </Button>
                        </div>
                      ) : (
                        <>
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
                          </div>
                        </>
                      )}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!repoData && !loading && !notFoundOrPrivate && (
            <>
              <HowItWorks />
            </>
          )}
        </div>

        <Pricing onPlanSelect={handleShowSignUp} />
        <SecurityBestPractices />
      </div>
    </div>
  );
};

export default RepoChecker;

