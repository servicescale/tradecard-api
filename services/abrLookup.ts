export type AbrLookupInput = {
  businessName: string;
  tradingName?: string | null;
  state?: string | null;
};

export type AbrLookupResult = {
  abn: string;
  entityName: string;
  entityType: string;
  gstStatus: string;
  state?: string;
};

export async function lookupABN(input: AbrLookupInput): Promise<AbrLookupResult | null> {
  const mod = await import('./abrLookup.js');
  return mod.lookupABN(input as AbrLookupInput);
}
