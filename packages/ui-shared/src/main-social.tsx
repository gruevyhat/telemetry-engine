import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SocialApp } from "./SocialApp";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SocialApp />
    </StrictMode>,
  );
}
