// FILE: src/pages/GuideHub/Calculators/GemCalculator.tsx
import React from "react";
import { GemCalculator as GemCalculatorComponent } from "../../../components/calculators/Gem";
import SectionHeader from "../../../components/ui/shared/SectionHeader";

const GemCalculatorPage: React.FC = () => {
  return (
    <>
      <SectionHeader
        title="Gem Calculator"
        meta="last updated: 08.11.2024"
        description={
          <>
            Input your parameters (Char Level, Mine Level, Guild HoK) to see the approximate stats of your mined gems.
            The values are approximations and represent the <em>max possible</em> you can find.
          </>
        }
      />

      <GemCalculatorComponent />
    </>
  );
};

export default GemCalculatorPage;
