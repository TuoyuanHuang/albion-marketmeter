import CraftSuggest from "@/components/CraftSuggest";

export default function CraftSuggestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Crafting Suggestions</h1>
        <p className="text-sm text-ao-muted">
          Scans craftable items and ranks what&apos;s worth crafting — material
          cost vs. sell price, including return rate and journal value.
        </p>
      </div>
      <CraftSuggest />
    </div>
  );
}
