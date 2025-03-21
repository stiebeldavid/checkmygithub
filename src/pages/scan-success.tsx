
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Shield, Download, LockIcon } from "lucide-react";
import RepoStats from "@/components/RepoStats";
import ScanResults from "@/components/ScanResults";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ScanSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPro, setIsPro] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  // Retrieve the scan data from location state
  const { repoUrl, repoData, scanResults } = location.state || {};
  
  useEffect(() => {
    if (!repoUrl || !scanResults) {
      navigate('/');
      return;
    }
    
    // Check if the user is authenticated and has Pro access
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkUserHasPro(session.user.id);
      }
    });
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkUserHasPro(session.user.id);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [repoUrl, scanResults, navigate]);
  
  const checkUserHasPro = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('scan_credits')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) return;
      
      setIsPro(data?.credits_remaining > 0 || data?.package_type === 'pro');
    } catch (error) {
      console.error("Error checking pro status:", error);
    }
  };
  
  const handleUpgradeClick = () => {
    const pricingSection = document.getElementById('pricing');
    if (pricingSection) {
      pricingSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/#pricing');
    }
  };
  
  const handleSignUpClick = () => {
    // Store the scan results in localStorage so we can retrieve them after auth
    if (repoUrl && repoData && scanResults) {
      localStorage.setItem('pendingScanData', JSON.stringify({
        repoUrl,
        repoData,
        scanResults
      }));
    }
    navigate('/auth');
  };
  
  const generatePDFReport = () => {
    if (!session) {
      toast.info("Please sign in to download PDF reports");
      return;
    }
    // This would be implemented to generate a PDF report
    toast.info("PDF report generation coming soon in the Pro tier");
  };
  
  // Transform scan results for the ScanResults component
  const formattedResults = {
    secrets: scanResults?.results ? {
      count: scanResults.results.length,
      items: scanResults.results.map((result: any) => ({
        file: result.file,
        type: result.ruleID,
        severity: 'High',
      }))
    } : undefined,
    dependencies: {
      count: 0,
      items: []
    },
    patterns: {
      count: 3,
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          className="mb-8 text-gray-300 hover:text-white"
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
        
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-2 bg-green-500/20 text-green-400 px-3 py-1 rounded-full">
            <Shield className="h-5 w-5" />
            <span>Scan Complete</span>
          </div>
          <h1 className="text-4xl font-bold mb-6">Security Scan Results</h1>
          
          {!session && (
            <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-lg py-3 px-4 inline-flex items-center text-blue-400">
              <LockIcon className="h-5 w-5 mr-2" />
              <span>Sign in to save this report and unlock premium features</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignUpClick}
                className="ml-4 border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              >
                Sign Up / Sign In
              </Button>
            </div>
          )}
        </div>
        
        {repoData && (
          <div className="mb-8">
            <RepoStats repoData={repoData} />
          </div>
        )}
        
        <ScanResults 
          results={formattedResults} 
          isPro={isPro} 
          onUpgradeClick={session ? handleUpgradeClick : handleSignUpClick} 
        />
        
        {/* PDF Report Download - Pro feature */}
        <div className="mt-16 text-center">
          <Button
            variant="outline"
            className="inline-flex items-center gap-2 border-primary text-primary"
            onClick={session ? generatePDFReport : handleSignUpClick}
          >
            <Download className="h-4 w-4" />
            {isPro ? "Download PDF Report" : "PDF Reports Available in Pro"}
          </Button>
          {!isPro && (
            <p className="text-gray-400 mt-2 text-sm">
              {session 
                ? "Upgrade to Pro to download comprehensive PDF reports" 
                : "Sign in and upgrade to Pro to download comprehensive PDF reports"}
            </p>
          )}
        </div>
        
        {/* Pricing section */}
        <div id="pricing" className="mt-24">
          <h2 className="text-3xl font-bold text-center mb-8">Upgrade for Full Protection</h2>
          {/* The pricing component will be displayed here */}
        </div>
      </div>
    </div>
  );
};

export default ScanSuccess;
