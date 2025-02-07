
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ScanSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        navigate('/');
        return;
      }

      try {
        const { data: verificationData, error: verificationError } = await supabase.functions.invoke(
          'verify-stripe-payment',
          {
            body: { sessionId },
          }
        );

        if (verificationError || !verificationData?.success) {
          throw new Error('Payment verification failed');
        }

        toast.success('Payment successful! Your scan credits have been added.');
      } catch (error) {
        console.error('Verification error:', error);
        toast.error('Failed to verify payment. Please contact support.');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800/50 p-8 rounded-xl border border-gray-700 text-center">
        <div className="mb-6">
          <CheckCircle className="w-16 h-16 text-primary mx-auto" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Payment Successful!</h1>
        <p className="text-gray-300 mb-8">
          Thank you for your purchase. Your scan credits have been added to your account.
        </p>
        <Button
          className="w-full"
          onClick={() => navigate('/')}
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default ScanSuccess;
