import Stripe from "stripe";
export const charge = (): number => (Stripe ? 1 : 0);
