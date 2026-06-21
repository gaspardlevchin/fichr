export const appNavigationItems = [
  { href: "/imports", label: "Imports" },
  { href: "/catalog", label: "Catalogue" },
  { href: "/exports", label: "Exports" }
] as const;

export type AppNavigationItem = (typeof appNavigationItems)[number];
