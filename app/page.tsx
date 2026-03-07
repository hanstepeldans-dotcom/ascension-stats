import { Navbar } from "@/components/marketing/Navbar";
import { Hero } from "@/components/marketing/Hero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CtaSection } from "@/components/marketing/CtaSection";
import { Footer } from "@/components/marketing/Footer";

export default function HomePage() {
  return (
    <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          <FeatureGrid />
          <HowItWorks />
          <CtaSection />
          <Footer />
        </main>
    </div>
  );
}
