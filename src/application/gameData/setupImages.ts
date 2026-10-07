import fireImage from "@/assets/divinecraft/fire.png?quality=85&format=webp"
import firepoisonImage from "@/assets/divinecraft/firepoison.png?quality=85&format=webp"
import firewaterImage from "@/assets/divinecraft/firewater.png?quality=85&format=webp"
import poisonfireImage from "@/assets/divinecraft/poisonfire.png?quality=85&format=webp"
import poisonwaterImage from "@/assets/divinecraft/poisonwater.png?quality=85&format=webp"
import waterfireImage from "@/assets/divinecraft/waterfire.png?quality=85&format=webp"
import waterpoisonImage from "@/assets/divinecraft/waterpoison.png?quality=85&format=webp"
import convergenceScriptImage from "@/assets/script/convergence-script.png?quality=85&format=webp"
import detachmentScriptImage from "@/assets/script/detachment-script.png?quality=85&format=webp"
import insightScriptImage from "@/assets/script/insight-script.png?quality=85&format=webp"
import opportunityScriptImage from "@/assets/script/opportunity-script.png?quality=85&format=webp"
import revelryScriptImage from "@/assets/script/revelry-script.png?quality=85&format=webp"
import voidrotScriptImage from "@/assets/script/voidrot-script.png?quality=85&format=webp"
import wraithstrikeScriptImage from "@/assets/script/wraithstrike-script.png?quality=85&format=webp"

// Resolve data filenames through the build image pipeline without coupling game data to Vite.
export const scriptImages: Record<string, string> = {
  "convergence-script.png": convergenceScriptImage,
  "detachment-script.png": detachmentScriptImage,
  "insight-script.png": insightScriptImage,
  "opportunity-script.png": opportunityScriptImage,
  "revelry-script.png": revelryScriptImage,
  "voidrot-script.png": voidrotScriptImage,
  "wraithstrike-script.png": wraithstrikeScriptImage,
}

export const divinecraftImages: Record<string, string> = {
  "fire.png": fireImage,
  "firepoison.png": firepoisonImage,
  "firewater.png": firewaterImage,
  "poisonfire.png": poisonfireImage,
  "poisonwater.png": poisonwaterImage,
  "waterfire.png": waterfireImage,
  "waterpoison.png": waterpoisonImage,
}
