import React from "react";
import ContentShell from "../../components/ContentShell";
import Center from "../../components/ContentRegions/Center";
import HeyzineFlipbook from "../../components/Flipbook/HeyzineFlipbook";

// Feste Seitenhintergrund-Farbe (laut SFDataHub Palette)
const PAGE_BG = "#0C1C2E";

const SFMagazinePage: React.FC = () => {
  return (
    <ContentShell>
      <Center>
        {/* Lokaler Wrapper: nimmt die gesamte Center-Fläche ein */}
        <div style={{ position: "relative", width: "100%" }}>
          {/* BG-Eraser: übermalt die Center-Kachel nur auf DIESER Seite */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: PAGE_BG,      // „löscht“ die dunkelblaue Kachel
              borderRadius: 16,         // gleiche Rundung wie deine Center-Kachel (ggf. anpassen)
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Inhalt liegt über dem Eraser */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <HeyzineFlipbook
              srcOrId="https://heyzine.com/flip-book/a646e8901f.html"
              aspectRatio="16/10"      // rahmenlos, voll-bleed
              allowFullscreen={true}
              lazy={true}
              tryTransparentBg={true}
              showInfo={true}
              edgeRevealPx={0}
              infoText="Dieses Flipbook wird von heyzine.com eingebettet. Durch das Laden können Inhalte und Ressourcen von Heyzine nachgeladen werden."
            />
          </div>
        </div>
      </Center>
    </ContentShell>
  );
};

export default SFMagazinePage;
