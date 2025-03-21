
import { AlertTriangle, CheckCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScanResultsProps {
  results: {
    secrets?: {
      count: number;
      items: Array<{
        file: string;
        type: string;
        severity: string;
      }>;
    };
    dependencies?: {
      count: number;
      items: Array<{
        name: string;
        currentVersion: string;
        vulnerableVersion: string;
        severity: string;
      }>;
    };
    patterns?: {
      count: number;
    };
  };
  isPro: boolean;
  onUpgradeClick: () => void;
}

const ScanResults = ({ results, isPro, onUpgradeClick }: ScanResultsProps) => {
  // Helper to determine what to show in free vs pro tier
  const getVisibleItems = (items: any[], isPro: boolean) => {
    if (isPro) return items;
    return items.slice(0, 1); // Only show first item for free tier
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Scan Results</h2>
      
      {/* Secrets Section */}
      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            <h3 className="text-xl font-semibold">API Keys & Secrets</h3>
          </div>
          {!isPro && results.secrets && results.secrets.count > 1 && (
            <Button onClick={onUpgradeClick} variant="outline" className="border-primary text-primary">
              Upgrade to See All
            </Button>
          )}
        </div>
        
        {results.secrets && results.secrets.count > 0 ? (
          <>
            <p className="text-red-400 mb-4">
              Found {results.secrets.count} potential secrets in your repository
            </p>
            <div className="space-y-3">
              {getVisibleItems(results.secrets.items, isPro).map((item, index) => (
                <div key={index} className="bg-red-900/20 border border-red-900/30 p-3 rounded">
                  <p className="font-medium text-red-300">{item.type}</p>
                  <p className="text-sm text-gray-300">File: {item.file}</p>
                  <p className="text-sm text-gray-300">Severity: {item.severity}</p>
                </div>
              ))}
            </div>
            
            {!isPro && results.secrets.count > 1 && (
              <div className="mt-4 bg-gray-700/30 border border-gray-600 p-4 rounded flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="text-gray-400" />
                  <p className="text-gray-300">
                    <span className="font-medium">{results.secrets.count - 1} more secrets</span> hidden in free tier
                  </p>
                </div>
                <Button onClick={onUpgradeClick} size="sm" className="bg-primary hover:bg-primary/90">
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-green-900/20 border border-green-900/30 p-4 rounded flex items-center gap-3">
            <CheckCircle className="text-green-500" />
            <p className="text-green-300">No API keys or secrets detected</p>
          </div>
        )}
      </div>
      
      {/* Dependencies Section */}
      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            <h3 className="text-xl font-semibold">Dependency Vulnerabilities</h3>
          </div>
          {!isPro && results.dependencies && results.dependencies.count > 1 && (
            <Button onClick={onUpgradeClick} variant="outline" className="border-primary text-primary">
              Upgrade to See All
            </Button>
          )}
        </div>
        
        {results.dependencies && results.dependencies.count > 0 ? (
          <>
            <p className="text-amber-400 mb-4">
              Found {results.dependencies.count} vulnerable dependencies in your project
            </p>
            <div className="space-y-3">
              {getVisibleItems(results.dependencies.items, isPro).map((item, index) => (
                <div key={index} className="bg-amber-900/20 border border-amber-900/30 p-3 rounded">
                  <p className="font-medium text-amber-300">{item.name}</p>
                  <p className="text-sm text-gray-300">Current: {item.currentVersion}</p>
                  <p className="text-sm text-gray-300">Vulnerable in: {item.vulnerableVersion}</p>
                  <p className="text-sm text-gray-300">Severity: {item.severity}</p>
                </div>
              ))}
            </div>
            
            {!isPro && results.dependencies.count > 1 && (
              <div className="mt-4 bg-gray-700/30 border border-gray-600 p-4 rounded flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="text-gray-400" />
                  <p className="text-gray-300">
                    <span className="font-medium">{results.dependencies.count - 1} more vulnerabilities</span> hidden in free tier
                  </p>
                </div>
                <Button onClick={onUpgradeClick} size="sm" className="bg-primary hover:bg-primary/90">
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-green-900/20 border border-green-900/30 p-4 rounded flex items-center gap-3">
            <CheckCircle className="text-green-500" />
            <p className="text-green-300">No vulnerable dependencies detected</p>
          </div>
        )}
      </div>
      
      {/* Patterns Section (Pro only) */}
      <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" />
            <h3 className="text-xl font-semibold">Insecure Code Patterns</h3>
          </div>
          {!isPro && (
            <Button onClick={onUpgradeClick} variant="outline" className="border-primary text-primary">
              Upgrade to Unlock
            </Button>
          )}
        </div>
        
        {isPro && results.patterns ? (
          <>
            <p className="text-amber-400 mb-4">
              Found {results.patterns.count} potentially insecure code patterns
            </p>
            {/* Pro tier content here */}
          </>
        ) : (
          <div className="bg-gray-700/30 border border-gray-600 p-4 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="text-gray-400" />
              <p className="text-gray-300">
                <span className="font-medium">Insecure code pattern detection</span> available in Pro tier only
              </p>
            </div>
            <Button onClick={onUpgradeClick} size="sm" className="bg-primary hover:bg-primary/90">
              Upgrade to Pro
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanResults;
