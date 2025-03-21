
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Github } from "lucide-react";

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  // Check for pending scan data
  useEffect(() => {
    const checkPendingScan = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const pendingScanData = localStorage.getItem('pendingScanData');
        if (pendingScanData) {
          // Clear the pending scan data
          localStorage.removeItem('pendingScanData');
          
          // Navigate back to the scan results
          const scanData = JSON.parse(pendingScanData);
          navigate('/scan-success', { state: scanData });
        } else {
          // No pending scan, go to home
          navigate('/');
        }
      }
    };
    
    checkPendingScan();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // Check for pending scan data
        const pendingScanData = localStorage.getItem('pendingScanData');
        if (pendingScanData) {
          // Clear the pending scan data
          localStorage.removeItem('pendingScanData');
          
          // Navigate back to the scan results
          const scanData = JSON.parse(pendingScanData);
          navigate('/scan-success', { state: scanData });
        } else {
          // No pending scan, go to home
          navigate('/');
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-gray-800/50 p-8 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white"
          >
            ← Back to Home
          </Button>
        </div>
        <div>
          <h2 className="text-center text-3xl font-bold text-white">
            {isSignUp ? "Create an account" : "Sign in to your account"}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-4">
            <div>
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
            <div>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
              />
            </div>
          </div>

          <div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </Button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
