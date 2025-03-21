
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const stripePromise = loadStripe('pk_live_51QOYlLEPoH8pgr0ZPC9fzwlS3KCiLto7lH8lFRhu31I4H2ayTmQ6G5VKMAhrYkvwxCnYiiNrMaCF7HEkFFP6V34k00VYu2IAGJ');

interface PricingProps {
  onPlanSelect: (option: string) => void;
}

const Pricing = ({ onPlanSelect }: PricingProps) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (priceId: string, packageType: string) => {
    setLoading(true);
    try {
      const { data, error: stripeError } = await supabase.functions.invoke('create-stripe-session', {
        body: {
          priceId,
        },
      });

      if (stripeError) {
        throw stripeError;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to load');
      }

      const { error: stripeRedirectError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (stripeRedirectError) {
        throw stripeRedirectError;
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error("Failed to process payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="pricing" className="py-16">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Simple, Transparent Pricing</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-2">Free Tier</h3>
            <div className="text-3xl font-bold mb-4">$0</div>
            <ul className="space-y-3 mb-6">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>1 repository scan</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Basic API key detection</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Limited results (1 per category)</span>
              </li>
            </ul>
            <Button 
              className="w-full bg-gray-700 hover:bg-gray-600 text-white" 
              disabled={true}
            >
              Current Plan
            </Button>
          </div>
          
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 p-8 rounded-xl border border-primary/50">
            <div className="inline-block px-3 py-1 rounded-full bg-primary/20 text-primary text-sm mb-4">Recommended</div>
            <h3 className="text-xl font-semibold mb-2">Pro Tier</h3>
            <div className="text-3xl font-bold mb-4">$10<span className="text-lg font-normal text-gray-400">/month</span></div>
            <ul className="space-y-3 mb-6">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Unlimited repository scans</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Full API key & secrets detection</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Complete dependency vulnerability scan</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Insecure code pattern detection</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>PDF report generation</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Scan history & tracking</span>
              </li>
            </ul>
            <Button 
              className="w-full" 
              onClick={() => handlePayment('price_1QpuZxEPoH8pgr0Z3kitmjid', 'pro')}
              disabled={loading}
            >
              {loading ? "Processing..." : "Upgrade to Pro"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
