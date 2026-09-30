export type PlanId = "free" | "starter" | "professional" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  credits: number | "unlimited";
  tagline: string;
  features: string[];
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 20,
    credits: 100,
    tagline: "For solo analysts getting started",
    features: [
      "100 AI credits per month",
      "Standard response speed",
      "Red team engagement tracker",
      "Vulnerability knowledge base",
      "Email support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 50,
    credits: 500,
    tagline: "For working security teams",
    features: [
      "500 AI credits per month",
      "Priority response speed",
      "Full analysis toolset",
      "Audit report export",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 100,
    credits: "unlimited",
    tagline: "For organisations at scale",
    features: [
      "Unlimited AI credits",
      "Zero usage limitations",
      "Unlimited engagements & reports",
      "Dedicated 24/7 support",
      "Onboarding assistance",
    ],
  },
];

export const PLAN_BY_ID: Record<string, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export const USDT_ADDRESS = "TMLGpy2U5SE8rCRZZsYHwSvkBuRkDw18gE";
export const USDT_NETWORK = "TRC20 (Tron)";

export function planLabel(plan: string) {
  if (plan === "free") return "Free Trial";
  return PLAN_BY_ID[plan]?.name ?? plan;
}
