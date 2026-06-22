import EnchantScanner from "@/components/EnchantScanner";

export default function EnchantingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Enchanting</h1>
        <p className="text-sm text-ao-muted">
          Upgrade finished items with runes, souls and relics. Scans gear and ranks
          which enchant upgrades (Base→.1→.2→.3) are profitable after market fees.
        </p>
      </div>
      <EnchantScanner />
    </div>
  );
}
