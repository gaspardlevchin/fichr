import type {
  FeatureKey,
  PlanKey,
  QuotaKey
} from "../../types/entitlement";
import type { BillingInterval } from "../../types/billing";

export type FichrPlan = {
  features: Record<FeatureKey, boolean>;
  key: PlanKey;
  label: string;
  prices: Record<BillingInterval, number>;
  quotas: Record<QuotaKey, number>;
};

const commonFeatures = {
  create_product: true,
  import_csv: true,
  create_space: true,
  upload_product_image: true,
  export_csv: true,
  export_txt: true,
  secure_export_identity: true,
  create_billing_checkout: true,
  receive_billing_webhook: true
} as const;

export const fichrPlans: Record<PlanKey, FichrPlan> = {
  demo: {
    key: "demo",
    label: "Démo",
    prices: { month: 0, year: 0 },
    features: {
      ...commonFeatures,
      export_pdf: false,
      ai_suggestions: false
    },
    quotas: {
      maxProducts: 10,
      maxSpaces: 2,
      maxImports: 2,
      maxExports: 3,
      maxImages: 2
    }
  },
  starter: {
    key: "starter",
    label: "Starter",
    prices: { month: 1900, year: 19000 },
    features: {
      ...commonFeatures,
      export_pdf: true,
      ai_suggestions: false
    },
    quotas: {
      maxProducts: 100,
      maxSpaces: 10,
      maxImports: 20,
      maxExports: 50,
      maxImages: 50
    }
  },
  studio: {
    key: "studio",
    label: "Studio",
    prices: { month: 2900, year: 29000 },
    features: {
      ...commonFeatures,
      export_pdf: true,
      ai_suggestions: false
    },
    quotas: {
      maxProducts: 500,
      maxSpaces: 40,
      maxImports: 100,
      maxExports: 250,
      maxImages: 300
    }
  },
  pro: {
    key: "pro",
    label: "Pro",
    prices: { month: 5900, year: 59000 },
    features: {
      ...commonFeatures,
      export_pdf: true,
      ai_suggestions: true
    },
    quotas: {
      maxProducts: 2500,
      maxSpaces: 200,
      maxImports: 500,
      maxExports: 1500,
      maxImages: 2000
    }
  },
  business: {
    key: "business",
    label: "Business",
    prices: { month: 12900, year: 129000 },
    features: {
      ...commonFeatures,
      export_pdf: true,
      ai_suggestions: true
    },
    quotas: {
      maxProducts: 10000,
      maxSpaces: 1000,
      maxImports: 2500,
      maxExports: 10000,
      maxImages: 10000
    }
  }
};

export function getFichrPlan(planKey: PlanKey): FichrPlan {
  return fichrPlans[planKey];
}
