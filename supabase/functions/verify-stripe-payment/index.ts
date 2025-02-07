
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import Stripe from 'https://esm.sh/stripe@13.3.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sessionId } = await req.json()
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    if (!session) {
      throw new Error('No session found')
    }

    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed')
    }

    const userId = session.metadata?.userId
    if (!userId) {
      throw new Error('No user ID found in session metadata')
    }

    // Determine number of credits based on the price ID
    const credits = session.line_items?.data[0]?.price?.id === 'price_single_scan' ? 1 : 10
    const packageType = session.line_items?.data[0]?.price?.id === 'price_single_scan' ? 'single' : 'multi'

    // Add credits to user's account
    const { error: creditsError } = await supabase
      .from('scan_credits')
      .insert({
        user_id: userId,
        credits_remaining: credits,
        package_type: packageType,
      })

    if (creditsError) {
      console.error('Error adding credits:', creditsError)
      throw new Error('Failed to add credits to user account')
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
