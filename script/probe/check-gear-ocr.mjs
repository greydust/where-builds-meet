import { createWorker, OEM, PSM } from "tesseract.js";
import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath: "public/ocr" });

try {
  const { inferGearLevelAndRarity, parseGearOcrTsv } = await viteServer.ssrLoadModule("/src/gearOcr.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const recognize = async (path, width, height) => {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const metadata = await worker.recognize(path, {}, { text: true, tsv: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const positioned = await worker.recognize(path, {}, { text: true, tsv: true });
    return parseGearOcrTsv(positioned.data.tsv, `${metadata.data.text}\n${positioned.data.text}`, width, height);
  };

  const moBlade = await recognize("local/OCR/mo blade.png", 583, 797);
  assert(
    moBlade.definitionId === "moBlade" && moBlade.level === 96 && moBlade.rarity === "Gold" && !moBlade.relayed,
    "Mo Blade metadata was not recognized.",
  );
  assert(
    moBlade.baseAffix.key === "maxPhys" && moBlade.baseAffix.value === 55,
    "Mo Blade base affix was not recognized.",
  );
  assert(
    moBlade.additionalAffixes.map((affix) => affix.key).join(",") === "moBladeDmgBoost,maxPhys,crit,maxVoidAttack",
    "Mo Blade additional affixes were not recognized in order.",
  );
  assert(
    Math.abs(moBlade.additionalAffixes[0].value - 0.06) < 1e-9 &&
      Math.abs(moBlade.additionalAffixes[2].value - 0.088) < 1e-9,
    "Mo Blade percentage values were not converted to ratios.",
  );
  assert(
    moBlade.attunement.key === "physicalPenetration" && moBlade.attunement.value === 10,
    "Mo Blade attunement was not recognized.",
  );

  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
  const moBladeBlock = await worker.recognize("local/OCR/mo blade.png", {}, { text: true, tsv: true });
  const moBladeFallback = parseGearOcrTsv(moBladeBlock.data.tsv, moBladeBlock.data.text, 583, 797);
  assert(
    moBladeFallback.additionalAffixes.length === 4 && moBladeFallback.attunement.key === "physicalPenetration",
    "The block-layout fallback must recognize all six Mo Blade rows.",
  );
  const moBladeDifferentCrop = parseGearOcrTsv(moBladeBlock.data.tsv, moBladeBlock.data.text, 583, 2000);
  assert(
    moBladeDifferentCrop.additionalAffixes.map((affix) => affix.key).join(",") ===
      "moBladeDmgBoost,maxPhys,crit,maxVoidAttack" && moBladeDifferentCrop.attunement.key === "physicalPenetration",
    "Affix row recognition must not depend on the screenshot height.",
  );

  const helmet = await recognize("local/OCR/helmet.png", 564, 811);
  assert(
    helmet.definitionId === "helmet" && helmet.level === 96 && helmet.rarity === "Purple" && helmet.relayed,
    "Helmet metadata was not recognized.",
  );
  assert(
    helmet.baseAffix.key === "precision" && Math.abs(helmet.baseAffix.value - 0.075) < 1e-9,
    "Helmet base affix was not recognized.",
  );
  assert(
    helmet.additionalAffixes.map((affix) => affix.key).join(",") === "minPhys,agility,crit,maxStonesplit",
    "Helmet additional affixes were not recognized in order.",
  );
  assert(
    helmet.additionalAffixes[0].value === 73.1 && helmet.additionalAffixes[1].value === 46.4,
    "Helmet numeric values were not recognized.",
  );
  assert(
    helmet.attunement.key === "phalanxbaneChargedBoost" && Math.abs(helmet.attunement.value - 0.054) < 1e-9,
    "Helmet attunement was not recognized.",
  );
  const inferredPurple = inferGearLevelAndRarity("helmet", "Gear Tier 96 Max HP 5196 Physical Defense 20");
  assert(inferredPurple.level === 96 && inferredPurple.rarity === "Purple", "Fixed base stats must determine rarity.");
  const defaultMetadata = inferGearLevelAndRarity("helmet", "unreadable metadata");
  assert(
    defaultMetadata.level === 96 && defaultMetadata.rarity === "Gold",
    "Unclear metadata must default to 96 Gold.",
  );
  const partial = parseGearOcrTsv(
    "5\t1\t1\t1\t1\t1\t10\t10\t100\t20\t90\tUnreadable",
    "Unreadable",
    500,
    500,
    "moBlade",
  );
  assert(
    partial.definitionId === "moBlade" &&
      partial.level === 96 &&
      partial.rarity === "Gold" &&
      !partial.baseAffix &&
      partial.additionalAffixes.length === 0 &&
      !partial.attunement,
    "Unclear OCR fields must use the editor gear type and leave attribute rows empty.",
  );
  console.log("Gear OCR base-stat rarity inference and non-blocking fallback checks passed.");
} finally {
  await worker.terminate();
  await viteServer.close();
}
