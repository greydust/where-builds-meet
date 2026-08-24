import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans/wght.css";
import App from "./App";
import { initializeI18n } from "./i18n";
import { migrateSessionStorage } from "./persistentStorage";
import "./styles/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components/buttons.css";
import "./styles/components/forms.css";
import "./styles/components/panels.css";
import "./styles/components/dialogs.css";
import "./styles/components/tables.css";
import "./styles/domains/stats.css";
import "./styles/domains/gear.css";
import "./styles/domains/rotations.css";
import "./styles/domains/skills.css";
import "./styles/domains/simulations.css";
import "./styles/mobile.css";

migrateSessionStorage();
await initializeI18n();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
