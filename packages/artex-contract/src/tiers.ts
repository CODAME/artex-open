/**
 * ARTEX Product Tiers — the three-tier commercial model.
 */
export type ArtexTierId = "studio" | "venue" | "enterprise" | "free";

export interface ArtexTierDefinition {
  id: ArtexTierId;
  name: string;
  description: string;
  monthlyPriceMinCents: number;
  annualPriceMinCents: number;
  payWhatYouWant: boolean;
  features: ArtexTierFeatures;
}

export interface ArtexTierFeatures {
  maxPublishedPackages: number;
  maxInstallations: number;
  attributionRequired: boolean;
  supportLevel: "community" | "email" | "dedicated";
  hardwareBundle: boolean;
  curatedNetwork: boolean;
  artistPayout: boolean;
  venueManagement: boolean;
  apiAccess: boolean;
}

export const ARTEX_TIERS: Record<ArtexTierId, ArtexTierDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Explore the ARTEX creator tools",
    monthlyPriceMinCents: 0,
    annualPriceMinCents: 0,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: 1,
      maxInstallations: 0,
      attributionRequired: true,
      supportLevel: "community",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: false,
      apiAccess: false,
    },
  },
  studio: {
    id: "studio",
    name: "ARTEX Studio",
    description: "Self-serve creator license for individual artists",
    monthlyPriceMinCents: 1200,
    annualPriceMinCents: 9900,
    payWhatYouWant: true,
    features: {
      maxPublishedPackages: 25,
      maxInstallations: 1,
      attributionRequired: true,
      supportLevel: "community",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: false,
      apiAccess: false,
    },
  },
  venue: {
    id: "venue",
    name: "ARTEX Venue",
    description: "For small galleries and creative spaces",
    monthlyPriceMinCents: 0,
    annualPriceMinCents: 29900,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: 50,
      maxInstallations: 3,
      attributionRequired: false,
      supportLevel: "email",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: true,
      apiAccess: false,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "ARTEX Enterprise",
    description: "Full-service installation with hardware and curation",
    monthlyPriceMinCents: 0,
    annualPriceMinCents: 1600000,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: -1,
      maxInstallations: -1,
      attributionRequired: false,
      supportLevel: "dedicated",
      hardwareBundle: true,
      curatedNetwork: true,
      artistPayout: true,
      venueManagement: true,
      apiAccess: true,
    },
  },
};

export function tierAllows(tierId: ArtexTierId, feature: keyof ArtexTierFeatures): boolean {
  const tier = ARTEX_TIERS[tierId];
  if (!tier) return false;
  const value = tier.features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "community";
}

export function tierLimit(tierId: ArtexTierId, feature: "maxPublishedPackages" | "maxInstallations"): number {
  const tier = ARTEX_TIERS[tierId];
  if (!tier) return 0;
  return tier.features[feature];
}
