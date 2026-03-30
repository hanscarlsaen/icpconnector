import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import PainPoints from "@/components/PainPoints";
import HowItWorks from "@/components/HowItWorks";
import Benefits from "@/components/Benefits";
import Integrations from "@/components/Integrations";
import Testimonials from "@/components/Testimonials";
import WaitlistCTA from "@/components/WaitlistCTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <PainPoints />
        <HowItWorks />
        <Benefits />
        <Integrations />
        <Testimonials />
        <WaitlistCTA />
      </main>
      <Footer />
    </>
  );
}
